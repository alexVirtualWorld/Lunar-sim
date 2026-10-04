import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { LunarTerrainManager } from '../../src/terrain/LunarTerrainManager.js';
import { APP_CONFIG } from '../../src/config.js';

const root=process.cwd();
global.fetch=async function(url){
  const su=String(url), rel=su.startsWith('/')?su.slice(1):su, p=path.join(root,'public',rel);
  try{ const b=await fs.readFile(p); return {ok:true,status:200,async json(){return JSON.parse(b.toString('utf8'));},async arrayBuffer(){return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}}; }
  catch(e){ return {ok:false,status:404,async json(){throw e;},async arrayBuffer(){throw e;}}; }
};

async function test(lat,lon){
  const scene=new THREE.Scene();
  const material=new THREE.MeshBasicMaterial();
  const origin={east:0,north:0,version:0};
  const cfg={...APP_CONFIG.terrain,farRadius:15000,renderSegments:[4,4,6,8,10,10,10,10,10]};
  const terrain=new LunarTerrainManager({scene,material,floatingOrigin:origin,config:cfg});
  await terrain.activateAt(lat,lon);
  let polarTiles=0, boundaryVerts=0, badTris=0;
  for(const tt of terrain.active.values()){
    const block=terrain.loader.blocks.get(tt.tile.blockId);
    if(!terrain.loader.isPolarBlock(block)) continue;
    polarTiles++;
    const g=tt.mesh.geometry.attributes.geoCoord;
    const ix=tt.mesh.geometry.index?.array || [];
    const north=block.projection.hemisphere==='north';
    for(let i=0;i<g.count;i++){
      const la=g.getX(i);
      if(Math.abs(Math.abs(la)-60)<1e-5) boundaryVerts++;
    }
    for(let k=0;k<ix.length;k+=3){
      const a=g.getX(ix[k]), b=g.getX(ix[k+1]), c=g.getX(ix[k+2]);
      if(north && Math.min(a,b,c)<59.9999) badTris++;
      if(!north && Math.max(a,b,c)>-59.9999) badTris++;
    }
  }
  const h=terrain.sampleLocalHeight(0,0);
  console.log('seam',lat,lon,'meshes',terrain.active.size,'polarTiles',polarTiles,'boundaryVerts',boundaryVerts,'badTris',badTris,'h',Number(h).toFixed(2));
  if(!Number.isFinite(h) || polarTiles===0 || boundaryVerts===0 || badTris!==0) throw new Error('polar seam geometry invariant failed');
}

for(const lon of [0,45,90,135,180,225,270,315]){
  await test(59.95,lon);
  await test(-59.95,lon);
}
console.log('16 direct-stitched polar seam cases OK');