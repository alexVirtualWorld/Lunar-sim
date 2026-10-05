import { normalizeLon360 } from '../geo/LunarCoordinates.js';

const GLOBAL_DATA_BASE_URL = (
  import.meta.env.VITE_LUNAR_DATA_BASE_URL ||
  (import.meta.env.PROD
    ? 'https://alexvirtualworld.github.io/Lunar-sim-data/moon/global'
    : '/moon/global')
).replace(/\/+$/, '');

function globalDataUrl(path = '') {
  return path ? GLOBAL_DATA_BASE_URL + '/' + path.replace(/^\/+/, '') : GLOBAL_DATA_BASE_URL;
}

export class GlobalHeightTileLoader {
  constructor({ maxPackCache = 32, maxTileCache = 512 } = {}) {
    this.index = null;
    this.blocks = new Map();
    this.rangeCache = new Map();
    this.packCache = new Map();
    this.tileCache = new Map();
    this.pending = new Map();
    this.maxPackCache = maxPackCache;
    this.maxTileCache = maxTileCache;
    this.regionId = 'global';
  }

  async loadIndex() {
    if (this.index) return this.index;
    const res = await fetch(globalDataUrl('index.json'), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Global DEM index missing: ${res.status}. Run npm run data:global:test first.`);
    this.index = await res.json();
    return this.index;
  }

  normalizeLon(lon) {
    const n = normalizeLon360(lon);
    return n === 360 ? 0 : n;
  }

  polarMeta(hemisphere) {
    const p = this.index?.polar?.[hemisphere];
    if (!p || p.status !== 'ready' || !p.id || !p.path) return null;
    return {
      ...p,
      south: p.coverage.south,
      north: p.coverage.north,
      west: 0,
      east: 360
    };
  }

  allBlockMeta() {
    if (!this.index) return [];
    const out = [...(this.index.blocks || [])];
    const north = this.polarMeta('north');
    const south = this.polarMeta('south');
    if (north) out.push(north);
    if (south) out.push(south);
    return out;
  }

  metaForId(blockId) {
    return this.allBlockMeta().find(b => b.id === blockId) || null;
  }

  blockForGeo(lat, lon) {
    if (!this.index) return null;
    if (lat > 60) return this.polarMeta('north');
    if (lat < -60) return this.polarMeta('south');

    const L = this.normalizeLon(lon);
    return (this.index.blocks || []).find(b =>
      lat >= b.south && lat <= b.north &&
      L >= b.west && (L < b.east || (b.east === 360 && L <= 360))
    ) || null;
  }

  async loadBlock(blockId) {
    if (this.blocks.has(blockId)) return this.blocks.get(blockId);
    const meta = this.metaForId(blockId);
    if (!meta) return null;
    const key = `block:${blockId}`;
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = (async () => {
      const res = await fetch(globalDataUrl(meta.path), { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Global DEM block manifest missing ${blockId}: ${res.status}`);
      const manifest = await res.json();
      manifest._indexMeta = meta;
      manifest._basePath = meta.path.replace(/\/manifest\.json$/, '');
      this.blocks.set(blockId, manifest);
      this.pending.delete(key);
      return manifest;
    })().catch(err => {
      this.pending.delete(key);
      throw err;
    });
    this.pending.set(key, promise);
    return promise;
  }

  level(block, lod) {
    return block?.levels?.find(l => l.lod === lod) || null;
  }

  isPolarBlock(block) {
    return block?.projection?.type === 'polar-stereographic';
  }

  projectGeoToPolar(block, lat, lon) {
    const p = block.projection;
    const R = p.radiusMeters || block.referenceRadiusMeters || 1737400;
    const lambda = this.normalizeLon(lon) * Math.PI / 180;
    const phi = lat * Math.PI / 180;
    const north = p.hemisphere === 'north';
    const colat = north ? (Math.PI / 2 - phi) : (Math.PI / 2 + phi);
    const rho = 2 * R * Math.tan(Math.max(0, colat) * 0.5);
    return {
      x: rho * Math.sin(lambda),
      y: (north ? -1 : 1) * rho * Math.cos(lambda)
    };
  }

  unprojectPolarToGeo(block, x, y) {
    const p = block.projection;
    const R = p.radiusMeters || block.referenceRadiusMeters || 1737400;
    const north = p.hemisphere === 'north';
    const rho = Math.hypot(x, y);
    const colat = 2 * Math.atan2(rho, 2 * R);
    const lat = (north ? Math.PI / 2 - colat : -Math.PI / 2 + colat) * 180 / Math.PI;
    const lonRad = north ? Math.atan2(x, -y) : Math.atan2(x, y);
    return { lat, lon: this.normalizeLon(lonRad * 180 / Math.PI) };
  }

  tileIndicesForGeo(block, lod, lat, lon) {
    const level = this.level(block, lod);
    if (!level) return null;

    if (this.isPolarBlock(block)) {
      const p = block.projection;
      const q = this.projectGeoToPolar(block, lat, lon);
      const spanX = (p.xMax - p.xMin) / level.countX;
      const spanY = (p.yMax - p.yMin) / level.countY;
      let x = Math.floor((q.x - p.xMin) / spanX);
      let y = Math.floor((p.yMax - q.y) / spanY);
      x = Math.max(0, Math.min(level.countX - 1, x));
      y = Math.max(0, Math.min(level.countY - 1, y));
      return { x, y };
    }

    const b = block.bounds;
    const L = this.normalizeLon(lon);
    const lonSpan = (b.east - b.west) / level.countX;
    const latSpan = (b.north - b.south) / level.countY;
    let x = Math.floor((L - b.west) / lonSpan);
    let y = Math.floor((b.north - lat) / latSpan);
    x = Math.max(0, Math.min(level.countX - 1, x));
    y = Math.max(0, Math.min(level.countY - 1, y));
    return { x, y };
  }

  tileBounds(block, lod, x, y) {
    const level = this.level(block, lod);

    if (this.isPolarBlock(block)) {
      const p = block.projection;
      const spanX = (p.xMax - p.xMin) / level.countX;
      const spanY = (p.yMax - p.yMin) / level.countY;
      const xMin = p.xMin + x * spanX;
      const xMax = xMin + spanX;
      const yMax = p.yMax - y * spanY;
      const yMin = yMax - spanY;
      return {
        mode: 'polar-stereographic',
        hemisphere: p.hemisphere,
        xMin, xMax, yMin, yMax
      };
    }

    const b = block.bounds;
    const lonSpan = (b.east - b.west) / level.countX;
    const latSpan = (b.north - b.south) / level.countY;
    const west = b.west + x * lonSpan;
    const east = west + lonSpan;
    const north = b.north - y * latSpan;
    const south = north - latSpan;
    return { mode: 'equirectangular', west, east, south, north };
  }

  tileGeoPoint(block, lod, x, y, u, v) {
    const b = this.tileBounds(block, lod, x, y);
    if (b.mode === 'polar-stereographic') {
      const px = b.xMin + (b.xMax - b.xMin) * u;
      const py = b.yMin + (b.yMax - b.yMin) * v;
      return this.unprojectPolarToGeo(block, px, py);
    }
    return {
      lat: b.south + (b.north - b.south) * v,
      lon: b.west + (b.east - b.west) * u
    };
  }

  tileContainsGeo(tile, lat, lon) {
    const b = tile.bounds;
    if (b.mode === 'polar-stereographic') {
      const block = this.blocks.get(tile.blockId);
      if (!block) return false;
      const q = this.projectGeoToPolar(block, lat, lon);
      return q.x >= b.xMin && q.x <= b.xMax && q.y >= b.yMin && q.y <= b.yMax;
    }
    let L = this.normalizeLon(lon);
    if (b.east === 360 && L === 0 && lon > 0) L = 360;
    return lat >= b.south && lat <= b.north && L >= b.west && L <= b.east;
  }

  linearIndex(block, lod, x, y) {
    const level = this.level(block, lod);
    return y * level.countX + x;
  }

  async loadRanges(block, lod) {
    const key = `${block.id}:${lod}`;
    if (this.rangeCache.has(key)) return this.rangeCache.get(key);
    const pendingKey = `ranges:${key}`;
    if (this.pending.has(pendingKey)) return this.pending.get(pendingKey);
    const level = this.level(block, lod);
    const promise = (async () => {
      const res = await fetch(globalDataUrl(`${block._basePath}/${level.rangesPath}`), { cache: 'force-cache' });
      if (!res.ok) throw new Error(`DEM ranges failed ${block.id} lod ${lod}: ${res.status}`);
      const buffer = await res.arrayBuffer();

      if (buffer.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
        throw new Error(
          `Invalid DEM ranges cache/data: ${block.id} lod ${lod}, ` +
          `${buffer.byteLength} bytes`
        );
      }

      const arr = new Float32Array(buffer);
      this.rangeCache.set(key, arr);
      this.pending.delete(pendingKey);
      return arr;
    })().catch(err => {
      this.pending.delete(pendingKey);
      throw err;
    });
    this.pending.set(pendingKey, promise);
    return promise;
  }

  touchPack(key, value) {
    if (this.packCache.has(key)) this.packCache.delete(key);
    this.packCache.set(key, value);
    while (this.packCache.size > this.maxPackCache) {
      this.packCache.delete(this.packCache.keys().next().value);
    }
  }

  async loadPack(block, lod, pack) {
    const key = `${block.id}:${lod}:${pack}`;
    if (this.packCache.has(key)) {
      const value = this.packCache.get(key);
      this.touchPack(key, value);
      return value;
    }
    const pendingKey = `pack:${key}`;
    if (this.pending.has(pendingKey)) return this.pending.get(pendingKey);
    const p = String(pack).padStart(4, '0');
    const promise = (async () => {
      const res = await fetch(globalDataUrl(`${block._basePath}/lod${lod}/pack_${p}.bin`), { cache: 'force-cache' });
      if (!res.ok) throw new Error(`DEM pack failed ${block.id} lod ${lod} pack ${p}: ${res.status}`);
      const buffer = await res.arrayBuffer();
      this.touchPack(key, buffer);
      this.pending.delete(pendingKey);
      return buffer;
    })().catch(err => {
      this.pending.delete(pendingKey);
      throw err;
    });
    this.pending.set(pendingKey, promise);
    return promise;
  }

  tileKey(blockId, lod, x, y) {
    return `${blockId}/${lod}/${x}/${y}`;
  }

  touchTile(key, tile) {
    if (this.tileCache.has(key)) this.tileCache.delete(key);
    this.tileCache.set(key, tile);
    while (this.tileCache.size > this.maxTileCache) {
      this.tileCache.delete(this.tileCache.keys().next().value);
    }
  }

  async loadTile(block, lod, x, y) {
    const key = this.tileKey(block.id, lod, x, y);
    if (this.tileCache.has(key)) {
      const tile = this.tileCache.get(key);
      this.touchTile(key, tile);
      return tile;
    }
    const pendingKey = `tile:${key}`;
    if (this.pending.has(pendingKey)) return this.pending.get(pendingKey);
    const level = this.level(block, lod);
    if (!level || x < 0 || y < 0 || x >= level.countX || y >= level.countY) return null;

    const promise = (async () => {
      const linear = this.linearIndex(block, lod, x, y);
      const pack = Math.floor(linear / level.packTiles);
      const inPack = linear % level.packTiles;
      const [ranges, packBuffer] = await Promise.all([
        this.loadRanges(block, lod),
        this.loadPack(block, lod, pack)
      ]);

      const minHeight = ranges[linear * 2];
      const maxHeight = ranges[linear * 2 + 1];
      if (!Number.isFinite(minHeight) || !Number.isFinite(maxHeight)) return null;

      const byteOffset = inPack * level.tileBytes;
      if (byteOffset + level.tileBytes > packBuffer.byteLength) throw new Error(`DEM pack truncated ${key}`);
      const src = new Uint16Array(packBuffer, byteOffset, level.samples * level.samples);
      const tile = {
        key,
        blockId: block.id,
        lod, x, y,
        samples: level.samples,
        minHeight,
        maxHeight,
        data: new Uint16Array(src),
        bounds: this.tileBounds(block, lod, x, y)
      };
      this.touchTile(key, tile);
      this.pending.delete(pendingKey);
      return tile;
    })().catch(err => {
      this.pending.delete(pendingKey);
      throw err;
    });

    this.pending.set(pendingKey, promise);
    return promise;
  }

  decodeSample(tile, i) {
    const t = tile.data[i] / 65535;
    return tile.minHeight + (tile.maxHeight - tile.minHeight) * t;
  }

  sampleTileGeo(tile, lat, lon) {
    const b = tile.bounds;
    let u, v;

    if (b.mode === 'polar-stereographic') {
      const block = this.blocks.get(tile.blockId);
      if (!block) return NaN;
      const q = this.projectGeoToPolar(block, lat, lon);
      u = Math.max(0, Math.min(1, (q.x - b.xMin) / (b.xMax - b.xMin)));
      v = Math.max(0, Math.min(1, (b.yMax - q.y) / (b.yMax - b.yMin)));
    } else {
      let L = this.normalizeLon(lon);
      if (b.east === 360 && L === 0 && lon > 0) L = 360;
      u = Math.max(0, Math.min(1, (L - b.west) / (b.east - b.west)));
      v = Math.max(0, Math.min(1, (b.north - lat) / (b.north - b.south)));
    }
    const n = tile.samples;
    const fx = u * (n - 1), fy = v * (n - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const i00 = y0 * n + x0, i10 = y0 * n + x1;
    const i01 = y1 * n + x0, i11 = y1 * n + x1;
    const a = this.decodeSample(tile, i00) * (1 - tx) + this.decodeSample(tile, i10) * tx;
    const b0 = this.decodeSample(tile, i01) * (1 - tx) + this.decodeSample(tile, i11) * tx;
    let height = a * (1 - ty) + b0 * ty;

    // The LOLA polar products are the preferred high-latitude reference.
    // Blend the final 3 degrees of SLDEM toward the measured polar boundary
    // so the +/-60-degree provider handoff is continuous without altering
    // the polar interior.
    return height;
  }

  sampleHeightGeoSync(lat, lon) {
    if (!this.index) return null;
    const meta = this.blockForGeo(lat, lon);
    if (!meta) return null;
    const block = this.blocks.get(meta.id);
    if (!block) return null;
    const levels = [...block.levels].sort((a, b) => b.lod - a.lod);
    for (const level of levels) {
      const idx = this.tileIndicesForGeo(block, level.lod, lat, lon);
      const tile = this.tileCache.get(this.tileKey(block.id, level.lod, idx.x, idx.y));
      if (tile) return this.sampleTileGeo(tile, lat, lon);
    }
    return null;
  }

  async ensureGeoLoaded(lat, lon, lod = null) {
    await this.loadIndex();
    const meta = this.blockForGeo(lat, lon);
    if (!meta) return null;
    const block = await this.loadBlock(meta.id);
    const targetLod = lod ?? block.maxLod;
    const idx = this.tileIndicesForGeo(block, targetLod, lat, lon);
    return this.loadTile(block, targetLod, idx.x, idx.y);
  }

  stats() {
    return { blocks: this.blocks.size, packs: this.packCache.size, tiles: this.tileCache.size };
  }
}
