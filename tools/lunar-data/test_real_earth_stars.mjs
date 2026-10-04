import * as THREE from 'three';
import { Body, GeoMoon, RotationAxis } from 'astronomy-engine';
import { computeLunarSky } from '../../src/astronomy/LunarCelestialSystem.js';
import fs from 'node:fs';

const DEG=Math.PI/180;
function mod360(x){return ((x%360)+360)%360;}
function r3(v,deg){const a=mod360(deg)*DEG,c=Math.cos(a),s=Math.sin(a);return{x:c*v.x+s*v.y,y:-s*v.x+c*v.y,z:v.z};}
function r1(v,deg){const a=deg*DEG,c=Math.cos(a),s=Math.sin(a);return{x:v.x,y:c*v.y+s*v.z,z:-s*v.y+c*v.z};}
function eqjToFixed(v,axis){let q=r3(v,90+axis.ra*15);q=r1(q,90-axis.dec);return r3(q,axis.spin);}

const date=new Date('2026-11-29T10:53:34Z');
const sky=computeLunarSky(date,26.6717,4.1294,1745);
const earthAxis=RotationAxis(Body.Earth,date);
const moonFromEarth=GeoMoon(date);
const sub=eqjToFixed(moonFromEarth,earthAxis);
const n=Math.hypot(sub.x,sub.y,sub.z);
const bx=sub.x/n,by=sub.y/n,bz=sub.z/n;
// Earth body-fixed -> SphereGeometry local coordinates.
const local=new THREE.Vector3(bx,bz,-by);
const visibleNormal=local.applyMatrix4(sky.earthRotation).normalize();
const expected=sky.earth.world.clone().multiplyScalar(-1).normalize();
const dot=visibleNormal.dot(expected);
console.log('Earth visible-normal alignment',dot);
if(dot<0.9999) throw new Error('Earth texture orientation does not face correct sub-lunar point');

const root=process.cwd();
const catalog=JSON.parse(fs.readFileSync(root+'/public/data/astronomy/hyg_bright_v41.json','utf8'));
console.log('catalog',catalog.catalog,'count',catalog.count,'first',catalog.stars[0]);
if(catalog.count<8000 || catalog.stars.length!==catalog.count) throw new Error('unexpected HYG bright-star count');
if(catalog.stars[0][5]!=='Sirius') throw new Error('brightest catalog star should be Sirius');
for(const star of catalog.stars.slice(0,100)){const len=Math.hypot(star[0],star[1],star[2]);if(Math.abs(len-1)>2e-6)throw new Error('non-unit star vector');}
console.log('real Earth orientation + HYG catalog test OK');