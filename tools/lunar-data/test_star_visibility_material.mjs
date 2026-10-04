import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { LunarCelestialSystem } from '../../src/astronomy/LunarCelestialSystem.js';

globalThis.document = {
  createElement(){ return { width:0,height:0,getContext(){ return { createRadialGradient(){return {addColorStop(){}}}, fillRect(){}, set fillStyle(v){} }; } }; }
};
globalThis.devicePixelRatio=1;
globalThis.fetch=async url=>{
  const p=path.join(process.cwd(),'public',String(url).replace(/^\//,''));
  try{const b=await fs.readFile(p);return {ok:true,status:200,async json(){return JSON.parse(b.toString('utf8'));}}}catch{return {ok:false,status:404}}
};
THREE.TextureLoader.prototype.load=function(url,onLoad){ return null; };

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera();
const sun=new THREE.DirectionalLight(); scene.add(sun,sun.target);
const stars=new THREE.Group(); scene.add(stars);
const sys=new LunarCelestialSystem({scene,camera,sunLight:sun,starGroup:stars});
const catalog=await sys.loadStarCatalog();
console.log('catalog',catalog.count,'layers',sys.starPointLayers.length,'visible',sys.starVisibleCount);
if(sys.starVisibleCount!==catalog.count)throw new Error('star count mismatch');
if(sys.starPointLayers.length!==7)throw new Error('expected seven magnitude bins');
for(const layer of sys.starPointLayers){
  const m=layer.material;
  if(!(m instanceof THREE.PointsMaterial))throw new Error('not built-in PointsMaterial');
  if(!m.depthTest || m.depthWrite)throw new Error('bad star depth flags');
}
console.log('star visibility material test OK');