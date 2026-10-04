import * as THREE from 'three';
import { RoverController } from '../../src/vehicle/RoverController.js';
import { APP_CONFIG } from '../../src/config.js';

globalThis.addEventListener = () => {};

let ground = 0;
const terrain = {
  sampleRenderedLocalHeight(){ return ground; },
  sampleLocalHeight(){ return ground; },
  sampleElevation(){ return ground; },
  preloadGround: async()=>{},
  isGlobal:true,
  manifest:{extentMeters:1e9}
};
const scene=new THREE.Scene();
const origin={east:0,north:0,version:0};
const rover=new RoverController({scene,terrain,floatingOrigin:origin,config:APP_CONFIG});
rover.ready=true;
rover.visual=new THREE.Group();

await rover.reset();
if(!rover.grounded) throw new Error('reset should ground rover');
if(Math.abs(rover.bodyY-(APP_CONFIG.bodyClearance))>1e-6) throw new Error('reset bodyY mismatch');

rover.setGravity(-1); if(rover.gravity!==0) throw new Error('gravity min clamp failed');
rover.setGravity(999); if(Math.abs(rover.gravity-274.8)>1e-9) throw new Error('gravity max clamp failed');

function launchWith(g){
  ground=0; rover.bodyY=APP_CONFIG.bodyClearance; rover.lastGroundY=APP_CONFIG.bodyClearance; rover.verticalVelocity=5; rover.grounded=true; rover.setGravity(g);
  ground=-10; rover.updateTransform(0.1,false);
  return {y:rover.bodyY,v:rover.verticalVelocity,grounded:rover.grounded};
}
const zero=launchWith(0);
const high=launchWith(274.8);
console.log('zero-g',zero);
console.log('274.8',high);
if(zero.grounded || high.grounded) throw new Error('crest release failed');
if(!(zero.y>high.y)) throw new Error('gravity has no vertical effect');

ground=-10;
for(let i=0;i<20&&!rover.grounded;i++) rover.updateTransform(0.05,false);
if(!rover.grounded) throw new Error('high gravity rover did not land');
console.log('gravity physics test OK');