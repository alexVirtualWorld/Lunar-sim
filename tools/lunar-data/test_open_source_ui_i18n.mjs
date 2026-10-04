import fs from 'node:fs/promises';
import { LANGUAGES, translationKeys } from '../../src/i18n.js';

const html = await fs.readFile('index.html','utf8');
const main = await fs.readFile('src/main.js','utf8');
const browse = await fs.readFile('src/browse/LunarBrowse.js','utf8');
const minimap = await fs.readFile('src/ui/RoverMiniMap.js','utf8');

if (!html.includes('<title>Lunar Sim</title>')) throw new Error('page title is not Lunar Sim');
for (const bad of ['Lunar Rover // Real DEM','极区仅影像','±60° 以外仅显示影像','GLOBAL LUNAR DEM // SELECTED LOCATION','1 UNIT = 1 M']) {
  if (html.includes(bad) || main.includes(bad) || browse.includes(bad)) throw new Error('obsolete public text remains: '+bad);
}

const mojibake = ['掳','虏','娴','鏈','鐪','姝','缁','鍖','杩','鈭','脳'];
for (const [name,src] of [['index',html],['main',main],['minimap',minimap]]) {
  for (const bad of mojibake) if (src.includes(bad)) throw new Error(name+' contains mojibake marker '+bad);
}

const english = new Set(translationKeys('en'));
for (const {code} of LANGUAGES) {
  const keys = new Set(translationKeys(code));
  const missing = [...english].filter(k=>!keys.has(k));
  if (missing.length) throw new Error(code+' missing '+missing.join(', '));
}
const htmlKeys = [...html.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g)].map(m=>m[1]);
for (const key of htmlKeys) if (!english.has(key)) throw new Error('HTML uses unknown i18n key '+key);

if (!html.includes('id="language-select"')) throw new Error('language selector missing');
if (!html.includes('id="debug-toggle"') || !html.includes('id="debug-hud"')) throw new Error('Debug HUD UI missing');
if (!main.includes("e.code === 'F10'")) throw new Error('F10 debug shortcut missing');
if (!main.includes("lunar-sim-debug-hud")) throw new Error('debug persistence key missing');

const debugStart = html.indexOf('<section id="debug-hud"');
const debugEnd = html.indexOf('</section>', debugStart);
const debugBlock = html.slice(debugStart, debugEnd);
for (const id of ['dem-status','lod-status','debug-provider','debug-block','debug-origin','debug-rover']) {
  if (!debugBlock.includes('id="'+id+'"')) throw new Error('Debug HUD missing '+id);
}
if (html.slice(0,debugStart).includes('id="dem-status"') || html.slice(0,debugStart).includes('id="lod-status"')) {
  throw new Error('technical DEM/LOD status still in normal HUD');
}
if (!browse.includes('this.providerBoundaries = new THREE.Group()') || !browse.includes('setProviderBoundariesVisible')) {
  throw new Error('provider boundary debug layer not separated');
}
if (!html.includes('data-i18n="map.grid">GRID')) throw new Error('normal map UI should show GRID without ±60°');
if (!html.includes('m/s²')) throw new Error('UTF-8 gravity unit missing');
console.log('open-source UI + i18n test OK');
console.log('languages:', LANGUAGES.map(x=>x.code).join(', '));
console.log('translation keys:', english.size);
