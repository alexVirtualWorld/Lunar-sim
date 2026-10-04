import * as THREE from 'three';
import { RoverCamera } from '../../src/vehicle/RoverCamera.js';

globalThis.addEventListener = () => {};
const camera = new THREE.PerspectiveCamera();
camera.position.set(120, 14, -80);
const renderer = { domElement: { addEventListener(){}, setPointerCapture(){} } };
const rover = { ready:true, object:new THREE.Object3D(), speed:0 };
rover.object.position.set(125,2,-75);
const terrain = { manifest:{}, origin:{east:0,north:0}, group:new THREE.Group(), sampleLocalHeight(){return 0;}, ensureSample:async()=>{} };
const cfg={distance:8,height:3,lookAhead:5,lookHeight:1,collisionClearance:0.5};
const rc=new RoverCamera(camera,renderer,rover,terrain,cfg);
rc.pos.set(120,14,-80); rc.look.set(126,3,-74); rc.initialized=true;

const beforeCamRel=camera.position.clone().sub(rover.object.position);
const beforeLookRel=rc.look.clone().sub(rover.object.position);
const beforeDist=beforeCamRel.length();

const de=2500,dn=300;
rover.object.position.x-=de; rover.object.position.z+=dn;
terrain.origin.east+=de; terrain.origin.north+=dn;
rc.rebase(de,dn);

const afterCamRel=camera.position.clone().sub(rover.object.position);
const afterLookRel=rc.look.clone().sub(rover.object.position);
const afterDist=afterCamRel.length();

console.log('camera relative delta', afterCamRel.distanceTo(beforeCamRel));
console.log('look relative delta', afterLookRel.distanceTo(beforeLookRel));
console.log('distance delta', Math.abs(afterDist-beforeDist));
if(afterCamRel.distanceTo(beforeCamRel)>1e-9) throw new Error('camera-rover relative vector changed');
if(afterLookRel.distanceTo(beforeLookRel)>1e-9) throw new Error('look-rover relative vector changed');
if(Math.abs(afterDist-beforeDist)>1e-9) throw new Error('camera distance changed');
console.log('camera rebase invariant OK');