import fs from 'node:fs/promises';
import path from 'node:path';
import { GlobalHeightTileLoader } from '../../src/terrain/GlobalHeightTileLoader.js';

const root = process.cwd();
global.fetch = async function(url) {
  const su = String(url);
  const rel = su.startsWith('/') ? su.slice(1) : su;
  const p = path.join(root, 'public', rel);
  try {
    const buf = await fs.readFile(p);
    return {
      ok: true, status: 200,
      async json() { return JSON.parse(buf.toString('utf8')); },
      async arrayBuffer() { return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); }
    };
  } catch (err) {
    return { ok: false, status: 404, async json(){ throw err; }, async arrayBuffer(){ throw err; } };
  }
};

const loader = new GlobalHeightTileLoader({ maxPackCache: 16, maxTileCache: 128 });
const index = await loader.loadIndex();
console.log('coverage', JSON.stringify(index.coverage), 'globalCoverage', index.globalCoverage);

for (const pair of [[85,0],[89.9,123],[90,0],[-85,0],[-89.9,237],[-90,0]]) {
  const lat = pair[0], lon = pair[1];
  const tile = await loader.ensureGeoLoaded(lat, lon, 8);
  const h = loader.sampleHeightGeoSync(lat, lon);
  console.log('sample', lat, lon, tile && tile.blockId, tile && tile.lod, tile && tile.x, tile && tile.y, Number(h).toFixed(2));
  if (!tile || !Number.isFinite(h)) throw new Error('invalid polar sample');
}

async function sampleSpecific(blockId, lat, lon) {
  const b = await loader.loadBlock(blockId);
  const idx = loader.tileIndicesForGeo(b, b.maxLod, lat, lon);
  const tile = await loader.loadTile(b, b.maxLod, idx.x, idx.y);
  return loader.sampleTileGeo(tile, lat, lon);
}

for (const lon of [5,50,95,140,185,230,275,320]) {
  const k = Math.floor(lon / 45);
  const id = '30N_60N_E' + String(k*45).padStart(3,'0') + '_E' + String((k+1)*45).padStart(3,'0');
  const eq = await sampleSpecific(id, 60, lon);
  const po = await sampleSpecific('POLAR_NORTH', 60, lon);
  console.log('north seam', lon, 'delta', (po-eq).toFixed(3));
  if (Math.abs(po-eq) > 1.0) throw new Error('north seam data mismatch');
}
for (const lon of [5,50,95,140,185,230,275,320]) {
  const k = Math.floor(lon / 45);
  const id = '60S_30S_E' + String(k*45).padStart(3,'0') + '_E' + String((k+1)*45).padStart(3,'0');
  const eq = await sampleSpecific(id, -60, lon);
  const po = await sampleSpecific('POLAR_SOUTH', -60, lon);
  console.log('south seam', lon, 'delta', (po-eq).toFixed(3));
  if (Math.abs(po-eq) > 1.0) throw new Error('south seam data mismatch');
}

console.log('polar runtime loader test OK');