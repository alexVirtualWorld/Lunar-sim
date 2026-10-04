import * as THREE from 'three';
import { LunarTerrainManager } from '../../src/terrain/LunarTerrainManager.js';

const scene = new THREE.Scene();
const origin = { east: 0, north: 0, version: 0 };
const config = { farRadius: 1000, splitFactor: 1.25, tileRetireMs: 2500, sourceSamples: 65, renderSegments:[8], skirtDepth:[1], proceduralDetail:{maxAmplitude:0,mediumAmplitude:0,fineAmplitude:0} };
const terrain = new LunarTerrainManager({ scene, material:new THREE.MeshBasicMaterial(), floatingOrigin:origin, config });

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([100,2,-50, 110,3,-55, 90,1,-45],3));
const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
terrain.group.add(mesh);
terrain.group.updateMatrixWorld(true);

const beforeLocal = Array.from(geometry.attributes.position.array);
const beforeWorld = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,0).applyMatrix4(mesh.matrixWorld);

origin.east = 2500;
origin.north = 300;
origin.version++;
terrain.syncOriginTransform();
mesh.updateWorldMatrix(true,false);

const afterLocal = Array.from(geometry.attributes.position.array);
const afterWorld = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,0).applyMatrix4(mesh.matrixWorld);

console.log('group',terrain.group.position.toArray());
console.log('localGeometryChanged',beforeLocal.some((v,i)=>v!==afterLocal[i]));
console.log('worldDelta',afterWorld.clone().sub(beforeWorld).toArray());
if (beforeLocal.some((v,i)=>v!==afterLocal[i])) throw new Error('terrain geometry mutated during rebase');
if (terrain.group.position.x !== -2500 || terrain.group.position.z !== 300) throw new Error('group rebase transform wrong');
const d=afterWorld.clone().sub(beforeWorld);
if (Math.abs(d.x+2500)>1e-9 || Math.abs(d.y)>1e-9 || Math.abs(d.z-300)>1e-9) throw new Error('world shift wrong');
console.log('terrain O(1) rebase invariant OK');