import fs from 'node:fs/promises';
import * as THREE from 'three';
import { mapPlaceTier, featureVisibleAtTier, labelBudgetForTier } from '../../src/browse/LunarBrowse.js';
import { computeLunarNightLighting } from '../../src/astronomy/LunarCelestialSystem.js';

const catalog=JSON.parse(await fs.readFile('public/data/moon/iau_moon_features.json','utf8'));
const counts=[];
for(let tier=0;tier<5;tier++){
  const n=catalog.features.filter(f=>featureVisibleAtTier(f,tier)).length;
  counts.push(n);
  console.log('tier',tier,'points',n,'labels',labelBudgetForTier(tier));
}
if(!(counts[0] < counts[1] && counts[1] < counts[2] && counts[2] < counts[3] && counts[3] < counts[4])) throw new Error('map place tiers are not progressively denser');
if(counts[0] > 600) throw new Error('global Moon view still has too many points');
if(counts[4] !== catalog.count) throw new Error('closest tier must expose full Gazetteer');
if(mapPlaceTier(310)!==0 || mapPlaceTier(105)!==4) throw new Error('distance/tier mapping wrong');

const sunNight={altitude:-25,world:new THREE.Vector3(1,0,0)};
const earthFullAbove={altitude:45,world:new THREE.Vector3(-1,0,0)};
const earthDarkAbove={altitude:45,world:new THREE.Vector3(1,0,0)};
const nightFull=computeLunarNightLighting(sunNight,earthFullAbove);
const nightDark=computeLunarNightLighting(sunNight,earthDarkAbove);
const day=computeLunarNightLighting({altitude:30,world:new THREE.Vector3(1,0,0)},earthFullAbove);
console.log('nightFull',nightFull);
console.log('nightDark',nightDark);
console.log('day',day);
if(nightFull.fillIntensity < 0.055) throw new Error('night fill too dark');
if(nightFull.earthshineIntensity <= 0) throw new Error('full Earth should provide Earthshine');
if(nightDark.earthshineIntensity !== 0) throw new Error('dark Earth should not provide Earthshine');
if(!(day.fillIntensity < nightFull.fillIntensity)) throw new Error('day/night fill ordering wrong');
console.log('map place LOD + lunar night lighting test OK');