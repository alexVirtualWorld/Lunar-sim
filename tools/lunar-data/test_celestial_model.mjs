import { Libration } from 'astronomy-engine';
import { computeLunarSky } from '../../src/astronomy/LunarCelestialSystem.js';

const d = new Date('2026-10-03T06:30:00Z');
const lib = Libration(d);
const sky0 = computeLunarSky(d, 0, 0, 0);
const sep = Math.acos(
  Math.cos(lib.elat*Math.PI/180) * Math.cos(lib.elon*Math.PI/180)
) * 180/Math.PI;
const centerAlt = 90 - sep;
console.log('libration sub-Earth', lib.elon.toFixed(4), lib.elat.toFixed(4));
console.log('expected center alt', centerAlt.toFixed(4), 'topocentric alt', sky0.earth.altitude.toFixed(4));
if (Math.abs(sky0.earth.altitude - centerAlt) > 0.5) throw new Error('Earth direction inconsistent with lunar libration');

const a = computeLunarSky(d, 26.08, 3.66, -1936);
const b = computeLunarSky(new Date(d.getTime()+7*86400000), 26.08, 3.66, -1936);
console.log('Apollo15 sun', a.sun.altitude.toFixed(2), a.sun.azimuth.toFixed(2));
console.log('+7d sun', b.sun.altitude.toFixed(2), b.sun.azimuth.toFixed(2));
const dot = a.sun.world.dot(b.sun.world);
if (dot > 0.98) throw new Error('Sun direction did not change enough over 7 days');

const m=a.starRotation.elements;
if (!m.every(Number.isFinite)) throw new Error('star rotation contains non-finite values');
console.log('celestial model test OK');
