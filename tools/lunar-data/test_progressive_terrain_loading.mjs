import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { LunarTerrainManager } from '../../src/terrain/LunarTerrainManager.js';
import { APP_CONFIG } from '../../src/config.js';

const root=process.cwd();
global.fetch=async url=>{const s=String(url),rel=s.startsWith('/')?s.slice(1):s,p=path.join(root,'public',rel);try{const b=await fs.readFile(p);return{ok:true,status:200,async json(){return JSON.parse(b.toString('utf8'));},async arrayBuffer(){return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}}}catch(e){return{ok:false,status:404,async json(){throw e},async arrayBuffer(){throw e}}}};

const scene=new THREE.Scene(),material=new THREE.MeshBasicMaterial(),origin={east:0,north:0,version:0};
const t=new LunarTerrainManager({scene,material,floatingOrigin:origin,config:APP_CONFIG.terrain});

await t.prefetchLanding(26.08,3.66);
const prefetchedTiles=t.loader.tileCache.size;
const t0=performance.now();
await t.activateAt(26.08,3.66);
const activateMs=performance.now()-t0;
const immediate=t.active.size;
const full=t.selectTiles(0,0).length;
console.log('prefetchedTiles',prefetchedTiles,'activateMs',activateMs.toFixed(1),'immediate',immediate,'full',full,'preloading',t.progressivePreloading);
if(prefetchedTiles===0)throw new Error('browse landing prefetch warmed no tiles');
if(immediate===0)throw new Error('no landing-critical terrain built');
if(!(immediate<full))throw new Error('activation still blocks on full visible terrain');
if(immediate>Math.ceil(full*0.6))throw new Error('landing critical set is too large');

await t.waitForBackgroundComplete({timeoutMs:60000});
const finalCount=t.active.size;
console.log('afterBackground',finalCount,'queue',t.buildQueue.length,'tileLoadPending',t.tileLoadPending.size);
if(finalCount!==full)throw new Error(`background terrain incomplete: ${finalCount}/${full}`);

// Progressive build must retain bounded loader caches across activations.
const cacheBefore=t.loader.tileCache.size;
await t.activateAt(26.08,3.66);
if(t.loader.tileCache.size===0 || cacheBefore===0)throw new Error('activation cleared reusable DEM cache');
console.log('cache retained',cacheBefore,'->',t.loader.tileCache.size);
console.log('progressive terrain activation test OK');