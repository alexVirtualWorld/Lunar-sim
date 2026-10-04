import fs from 'node:fs/promises';
import { mapPlaceTier, MAP_PLACES_HIDE_DISTANCE, featureMatchesExplorationFilter } from '../../src/browse/LunarBrowse.js';
import { ExplorationManager } from '../../src/exploration/ExplorationManager.js';
import * as THREE from 'three';

globalThis.performance ||= {now:()=>Date.now()};
const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))};

if(mapPlaceTier(MAP_PLACES_HIDE_DISTANCE+1)!==-1) throw new Error('farthest Browse distance must hide places');
if(mapPlaceTier(310)!==0) throw new Error('normal global view tier changed unexpectedly');

const terrain={anchor:{lat:0,lon:0},origin:{east:0,north:0},manifest:{},sampleLocalHeight(){return 0}};
const ex=new ExplorationManager({scene:new THREE.Scene(),terrain,rover:{}});
const f0={id:1,explore:true,name:'UNEXPLORED'};
const f1={id:2,explore:true,name:'IN PROGRESS'};
const f2={id:3,explore:true,name:'EXPLORED'};
const ordinary={id:4,explore:false,name:'ORDINARY'};
ex.startedFeatures.add(2);
ex.startedFeatures.add(3);
ex.completed.add(3);

const states=[[f0,'unexplored'],[f1,'inprogress'],[f2,'explored']];
for(const [f,state] of states){
  if(ex.getFeatureState(f)!==state) throw new Error(`wrong state ${f.name}`);
  if(!featureMatchesExplorationFilter(f,state,ex)) throw new Error(`filter failed ${state}`);
}
if(featureMatchesExplorationFilter(ordinary,'unexplored',ex)) throw new Error('ordinary Gazetteer feature leaked into exploration-only filter');
if(!featureMatchesExplorationFilter(ordinary,'all',ex)) throw new Error('ALL should retain ordinary Gazetteer features');

const html=await fs.readFile('index.html','utf8');
if((html.match(/id="route-visible"/g)||[]).length!==1) throw new Error('route-visible must exist exactly once');
for(const token of ['MAP LAYERS','map-places-filter','IN PROGRESS','GRID / ±60°']) if(!html.includes(token)) throw new Error('missing MAP LAYERS token '+token);

const browseSource=await fs.readFile('src/browse/LunarBrowse.js','utf8');
const start=browseSource.indexOf('  updatePlaceLabels(force = false) {');
const end=browseSource.indexOf('  selectFeature(',start);
const method=browseSource.slice(start,end);
if(method.includes('replaceChildren(')) throw new Error('updatePlaceLabels still rebuilds all label DOM during normal updates');
if(!method.includes('label.style.left')||!method.includes('label.hidden = false')) throw new Error('stable labels are not position-updated');
console.log('Browse filter/far-hide/stable-label UI test OK');