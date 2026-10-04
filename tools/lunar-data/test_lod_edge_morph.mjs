import fs from 'node:fs/promises'; import path from 'node:path'; import * as THREE from 'three';
import { LunarTerrainManager } from '../../src/terrain/LunarTerrainManager.js'; import { APP_CONFIG } from '../../src/config.js';
import { curvatureSag, geodeticOffsetMeters } from '../../src/geo/LunarCoordinates.js';
const root=process.cwd();
global.fetch=async url=>{const s=String(url),rel=s.startsWith('/')?s.slice(1):s,p=path.join(root,'public',rel);try{const b=await fs.readFile(p);return{ok:true,status:200,async json(){return JSON.parse(b.toString('utf8'));},async arrayBuffer(){return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}}}catch(e){return{ok:false,status:404,async json(){throw e},async arrayBuffer(){throw e}}}};

function renderSeg(cfg,lod){return cfg.renderSegments[Math.min(lod,cfg.renderSegments.length-1)]||48;}

async function run(lat,lon){
 const scene=new THREE.Scene(),material=new THREE.MeshBasicMaterial(),origin={east:0,north:0,version:0};
 const t=new LunarTerrainManager({scene,material,floatingOrigin:origin,config:APP_CONFIG.terrain}); await t.activateAt(lat,lon); await t.waitForBackgroundComplete();
 let edges=0,maxErr=0;
 for(const tt of t.active.values()){
   const specs=tt.edgeMorph||{}; const seg=tt.renderSegments; const pos=tt.mesh.geometry.attributes.position;
   for(const [edge,spec] of Object.entries(specs)){
     edges++; const coarse=spec.coarse, cs=renderSeg(APP_CONFIG.terrain,coarse.lod), ml=spec.maxLod;
     const sf=1<<(ml-tt.tile.lod), sc=1<<(ml-coarse.lod);
     const fx0=tt.tile.x*sf,fx1=(tt.tile.x+1)*sf,fy0=tt.tile.y*sf,fy1=(tt.tile.y+1)*sf,cx0=coarse.x*sc,cx1=(coarse.x+1)*sc,cy0=coarse.y*sc,cy1=(coarse.y+1)*sc;
     const pointAt=i=>{const q=i/cs,ce=spec.coarseEdge;let u=q,v=q;if(ce==='left'){u=0;v=q}else if(ce==='right'){u=1;v=q}else if(ce==='top'){u=q;v=1}else{u=q;v=0};const gp=t.loader.tileGeoPoint(coarse.block,coarse.lod,coarse.x,coarse.y,u,v);const en=geodeticOffsetMeters(t.anchor.lat,t.anchor.lon,gp.lat,gp.lon);const elev=t.sampleRenderElevationGeo(gp.lat,gp.lon,null);return [en.east-t.origin.east,(elev-t.datumHeight)+curvatureSag(en.east,en.north),-(en.north-t.origin.north)];};
     for(let k=0;k<=seg;k++){let idx,tq;if(edge==='left'){idx=k*(seg+1);const ay=fy1-(k/seg)*(fy1-fy0);tq=(cy1-ay)/(cy1-cy0)}else if(edge==='right'){idx=k*(seg+1)+seg;const ay=fy1-(k/seg)*(fy1-fy0);tq=(cy1-ay)/(cy1-cy0)}else if(edge==='top'){idx=seg*(seg+1)+k;const ax=fx0+(k/seg)*(fx1-fx0);tq=(ax-cx0)/(cx1-cx0)}else{idx=k;const ax=fx0+(k/seg)*(fx1-fx0);tq=(ax-cx0)/(cx1-cx0)};const f=Math.max(0,Math.min(1,tq))*cs,i0=Math.floor(f),i1=Math.min(cs,i0+1),a=f-i0,p0=pointAt(i0),p1=pointAt(i1),ex=[THREE.MathUtils.lerp(p0[0],p1[0],a),THREE.MathUtils.lerp(p0[1],p1[1],a),THREE.MathUtils.lerp(p0[2],p1[2],a)];const dx=pos.getX(idx)-ex[0],dy=pos.getY(idx)-ex[1],dz=pos.getZ(idx)-ex[2];maxErr=Math.max(maxErr,Math.hypot(dx,dy,dz));}
   }
 }
 console.log('LOD seam',lat,lon,'active',t.active.size,'morphedEdges',edges,'maxEdgeError',maxErr); if(edges===0||maxErr>0.01)throw new Error('LOD edge morph verification failed');
}
await run(88.26525,16.0725);
await run(20,10);
console.log('LOD edge morph runtime test OK');