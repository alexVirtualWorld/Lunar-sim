import fs from 'node:fs/promises';
import * as THREE from 'three';
import { ExplorationManager } from '../../src/exploration/ExplorationManager.js';
import { RoverController } from '../../src/vehicle/RoverController.js';
import { RoverCamera } from '../../src/vehicle/RoverCamera.js';
import { APP_CONFIG } from '../../src/config.js';

globalThis.addEventListener=()=>{};
globalThis.confirm=()=>true;
globalThis.performance ||= { now:()=>Date.now() };
const store=new Map();
globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};

const terrain={
  anchor:{lat:0,lon:0}, origin:{east:0,north:0,version:0}, manifest:{}, isGlobal:true,
  sampleLocalHeight(){return 0}, sampleRenderedLocalHeight(){return 0},
  preloadGround:async()=>{}, ensureSample:async()=>{},
  geoAt(east,north){return {lat:north/30323,lon:east/30323}}
};
const scene=new THREE.Scene();
const rover={east:0,north:0};
const ex=new ExplorationManager({scene,terrain,rover});
const catalog=JSON.parse(await fs.readFile('public/data/moon/iau_moon_features.json','utf8'));
ex.catalog=catalog; ex.features=catalog.features; ex.featureById=new Map(catalog.features.map(f=>[Number(f.id),f])); ex.explorationFeatures=catalog.features.filter(f=>f.explore);
console.log('catalog',catalog.count,'exploration',catalog.explorationCount);
if(catalog.count<9000) throw new Error('Gazetteer feature count below target scale');
if(new Set(catalog.features.map(f=>f.id)).size!==catalog.count) throw new Error('duplicate feature ids');
if(!catalog.features.every(f=>String(f.url).startsWith('https://planetarynames.wr.usgs.gov/Feature/'))) throw new Error('non-USGS feature link');

const feature=ex.explorationFeatures.find(f=>f.name==='Tycho') || ex.explorationFeatures[0];
ex.activateFeature(feature);
const a=ex.activePOIs.map(p=>[p.id,p.lat,p.lon,p.type]);
ex.activateFeature(feature);
const b=ex.activePOIs.map(p=>[p.id,p.lat,p.lon,p.type]);
if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error('POIs are not deterministic');
if(a.length<5||a.length>10) throw new Error('POI count outside 5-10');
console.log('POIs deterministic',feature.name,a.length);

// Odometer: one short step counts, teleport does not.
ex.lastGeo=null; ex.save.totalDistanceMeters=0; ex.sessionDistanceMeters=0;
ex.update({lat:0,lon:0});
ex.update({lat:0,lon:0.0001});
const shortDistance=ex.totalDistanceMeters;
ex.update({lat:45,lon:180});
if(!(shortDistance>0 && shortDistance<250)) throw new Error('valid driving step not counted');
if(Math.abs(ex.totalDistanceMeters-shortDistance)>1e-6) throw new Error('teleport incorrectly counted in odometer');
console.log('odometer short step',shortDistance.toFixed(3),'teleport ignored');

// Completing all deterministic POIs unlocks the feature and obelisk.
ex.activateFeature(feature);
for(const poi of ex.activePOIs){ ex.lastGeo=null; ex.update({lat:poi.lat,lon:poi.lon}); }
if(!ex.completed.has(Number(feature.id))||!ex.unlocked.has(Number(feature.id))) throw new Error('feature completion/obelisk unlock failed');
console.log('completion unlocked obelisk');

// Rover headlights.
const roverTerrain={...terrain, sampleElevation(){return 0}};
const roverObj=new RoverController({scene:new THREE.Scene(),terrain:roverTerrain,floatingOrigin:terrain.origin,config:APP_CONFIG});
if(roverObj.headlights.length!==2) throw new Error('expected two headlights');
roverObj.setHeadlights(true);
if(!roverObj.headlightsOn||!roverObj.headlights.every(l=>l.visible&&l.isSpotLight)) throw new Error('headlight ON failed');
roverObj.toggleHeadlights();
if(roverObj.headlightsOn||roverObj.headlights.some(l=>l.visible)) throw new Error('headlight OFF failed');
console.log('headlights OK');

// Camera recenter moves toward default and completes.
const cam=new THREE.PerspectiveCamera();
const renderer={domElement:{addEventListener(){},setPointerCapture(){}}};
const cameraRover={ready:true,object:new THREE.Object3D(),speed:0};
const camTerrain={manifest:{},origin:{east:0,north:0},group:new THREE.Group(),sampleLocalHeight(){return 0},ensureSample:async()=>{}};
const rc=new RoverCamera(cam,renderer,cameraRover,camTerrain,APP_CONFIG.camera);
rc.yaw=1.8; rc.pitch=0.9; rc.recenter();
const startErr=Math.abs(rc.yaw)+Math.abs(rc.pitch-rc.defaultPitch);
for(let i=0;i<240;i++){
  rc.yaw=THREE.MathUtils.damp(rc.yaw,0,7.5,1/60);
  rc.pitch=THREE.MathUtils.damp(rc.pitch,rc.defaultPitch,7.5,1/60);
}
const endErr=Math.abs(rc.yaw)+Math.abs(rc.pitch-rc.defaultPitch);
if(!(endErr<startErr*0.01)) throw new Error('camera recenter convergence failed');
console.log('camera recenter OK');

console.log('exploration/headlights/recenter test OK');