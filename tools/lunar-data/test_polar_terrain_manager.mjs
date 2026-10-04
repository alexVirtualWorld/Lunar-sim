import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { LunarTerrainManager } from '../../src/terrain/LunarTerrainManager.js';
import { APP_CONFIG } from '../../src/config.js';

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

const scene = new THREE.Scene();
const material = new THREE.MeshBasicMaterial();
const origin = { east: 0, north: 0, version: 0 };
const cfg = {
  ...APP_CONFIG.terrain,
  farRadius: 8000,
  renderSegments: [4,4,6,8,12,12,12,12,12]
};
const terrain = new LunarTerrainManager({ scene, material, floatingOrigin: origin, config: cfg });

for (const pair of [[90,0],[-90,0],[85,20],[-85,200],[89.9,123],[-89.9,237]]) {
  const lat=pair[0], lon=pair[1];
  await terrain.activateAt(lat, lon);
  const h=terrain.sampleLocalHeight(0,0);
  const e=terrain.sampleElevation(0,0);
  console.log('activate',lat,lon,'meshes',terrain.active.size,'elev',Number(e).toFixed(2),'local',Number(h).toFixed(2));
  if (!terrain.manifest || terrain.active.size===0 || !Number.isFinite(h) || !Number.isFinite(e)) throw new Error('polar terrain activation failed');
}

console.log('polar terrain manager test OK');