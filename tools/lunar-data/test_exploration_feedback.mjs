import * as THREE from 'three';
import { ExplorationManager } from '../../src/exploration/ExplorationManager.js';

globalThis.performance ||= {now:()=>Date.now()};
const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))};

const events=[];
const terrain={
  anchor:{lat:0,lon:0},origin:{east:0,north:0},manifest:{},
  sampleLocalHeight(east,north){
    // Deterministic synthetic ridge/valley field so POI labels can use terrain semantics.
    return 0.012*east - 0.004*north + 20*Math.sin(east/500)*Math.cos(north/500);
  }
};
const ex=new ExplorationManager({scene:new THREE.Scene(),terrain,rover:{},onChange:(_m,e)=>{if(e)events.push(e)}});
const feature={id:777,name:'TEST FEATURE',lat:0,lon:0,diameterKm:60,type:'Crater, craters',explore:true};
ex.featureById.set(777,feature);
ex.explorationFeatures=[feature];
ex.catalog={explorationCount:1};
ex.activateFeature(feature);
if(ex.activePOIs.length<5||ex.activePOIs.length>10)throw new Error('POI count');
console.log('types',ex.activePOIs.map(p=>p.type));
if(!ex.activePOIs.every(p=>typeof p.type==='string'&&p.type.length))throw new Error('terrain POI classification empty');

for(const poi of ex.activePOIs){ ex.lastGeo=null; ex.update({lat:poi.lat,lon:poi.lon}); }
const poiEvents=events.filter(e=>e.type==='poi_discovered');
const complete=events.find(e=>e.type==='area_complete');
console.log('events',events.map(e=>e.type));
if(poiEvents.length!==ex.activePOIs.length)throw new Error('missing POI discovery events');
if(!complete)throw new Error('missing area_complete event');
const progress=ex.getFeatureProgress(feature);
console.log('progress',progress);
if(!progress.completed||!progress.obelisk||progress.discovered!==progress.total)throw new Error('completed popup state wrong');
if(!progress.completedAt)throw new Error('completion timestamp missing');
console.log('exploration feedback test OK');