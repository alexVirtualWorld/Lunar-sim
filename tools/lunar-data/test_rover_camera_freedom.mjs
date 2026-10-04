import * as THREE from 'three';
import { RoverCamera } from '../../src/vehicle/RoverCamera.js';

globalThis.addEventListener=()=>{};
const camera=new THREE.PerspectiveCamera(56,16/9,0.08,120000);
const renderer={domElement:{addEventListener(){},setPointerCapture(){}}};
const rover={ready:true,object:new THREE.Object3D(),speed:0};
const terrain={manifest:{},origin:{east:0,north:0},group:new THREE.Group(),sampleLocalHeight(){return 0;},ensureSample:async()=>{}};
const cfg={distance:10.5,height:3.6,lookAhead:3.4,lookHeight:1.25,collisionClearance:0.45};
const rc=new RoverCamera(camera,renderer,rover,terrain,cfg);
const forward=new THREE.Vector3(0,0,-1);

// Free pitch should reach near zenith without crossing the lookAt pole.
rc.pitch=THREE.MathUtils.degToRad(84);
let r=rc.computeDesiredView(rover.object,forward);
console.log('84deg up y',r.desiredViewDir.y);
if(r.desiredViewDir.y<0.99) throw new Error('camera cannot look near zenith');
if(Math.abs(r.desiredViewDir.dot(new THREE.Vector3(0,1,0)))>=0.9999) throw new Error('camera crosses lookAt singularity');

// Full yaw orbit must stay continuous with no forced 180-degree recenter.
let prev=null,maxStep=0;
for(let deg=-180;deg<=180;deg+=5){
 rc.yaw=THREE.MathUtils.degToRad(deg); rc.pitch=0;
 const q=rc.computeDesiredView(rover.object,forward).desiredViewDir;
 if(prev) maxStep=Math.max(maxStep,THREE.MathUtils.radToDeg(prev.angleTo(q)));
 prev=q;
}
console.log('max yaw direction step',maxStep);
if(maxStep>5.01) throw new Error('yaw orbit contains a forced snap');

// Ground floor deadband should suppress tiny alternating surface noise.
rc.groundStates.actual={floor:null,x:0,z:0};
let floors=[];
for(const raw of [1.00,1.01,0.99,1.02,1.00,0.98,1.03]) floors.push(rc.stabilizedGroundFloor(raw,0,0,1/60,'actual'));
console.log('ground floors',floors);
const span=Math.max(...floors.slice(1))-Math.min(...floors.slice(1));
if(span>0.05) throw new Error('ground hysteresis still follows sub-5cm noise too closely');

console.log('RoverCamera freedom/stability test OK');