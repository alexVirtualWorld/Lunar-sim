import { LunarBrowse, coveredLatitude } from './browse/LunarBrowse.js';
import * as THREE from 'three';
import { APP_CONFIG, SITES, BOUNDARY_TEST_SITES, DEFAULT_SITE_ID } from './config.js';
import { FloatingOrigin } from './geo/FloatingOrigin.js';
import { formatLatLon } from './geo/LunarCoordinates.js';
import { createLunarRegolithMaterial } from './materials/LunarRegolithMaterial.js';
import { LunarTerrainManager } from './terrain/LunarTerrainManager.js';
import { RoverController } from './vehicle/RoverController.js';
import { RoverCamera } from './vehicle/RoverCamera.js';
import { Multiplayer } from './network/Multiplayer.js';
import { RoverMiniMap } from './ui/RoverMiniMap.js';
import { LunarCelestialSystem, computeLunarNightLighting } from './astronomy/LunarCelestialSystem.js';
import { ExplorationManager } from './exploration/ExplorationManager.js';
import { initLanguage, setLanguage, populateLanguageSelect, t, applyI18n } from './i18n.js';
import { initSkinSystem } from './ui/skins.js';

initSkinSystem();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.08, 120_000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.querySelector('#app').appendChild(renderer.domElement);

// Moon-like lighting: one hard sun and only a tiny fill so shadowed geometry stays readable.
const fill = new THREE.HemisphereLight(0xb8c1cf, 0x010101, 0.035);
scene.add(fill);
const sun = new THREE.DirectionalLight(0xfff1d6, 6.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 12_000;
sun.shadow.camera.left = -1300;
sun.shadow.camera.right = 1300;
sun.shadow.camera.top = 1300;
sun.shadow.camera.bottom = -1300;
sun.shadow.bias = -0.00008;
scene.add(sun); scene.add(sun.target);

const earthshine = new THREE.DirectionalLight(0xa9c8ff, 0);
earthshine.castShadow = false;
scene.add(earthshine);
scene.add(earthshine.target);

// Camera-relative real star field. Geometry is loaded from the HYG v4.1
// J2000 catalog; LunarCelestialSystem supplies the time/location rotation.
const starGroup = new THREE.Group();
starGroup.name = 'REAL_STAR_FIELD';
scene.add(starGroup);

const ui = {
  siteName: document.querySelector('#site-name'),
  siteCoords: document.querySelector('#site-coords'),
  siteRef: document.querySelector('#site-ref'),
  altitude: document.querySelector('#altitude'),
  speed: document.querySelector('#speed'),
  players: document.querySelector('#players'),
  surface: document.querySelector('#surface'),
  dem: document.querySelector('#dem-status'),
  lod: document.querySelector('#lod-status'),
  gravityValue: document.querySelector('#gravity-value'),
  gravitySlider: document.querySelector('#gravity-slider'),
  gravityNumber: document.querySelector('#gravity-number'),
  gravityPreset: document.querySelector('#gravity-preset'),
  celestialTime: document.querySelector('#celestial-time'),
  celestialStatus: document.querySelector('#celestial-status'),
  timePrevDay: document.querySelector('#time-prev-day'),
  timeNow: document.querySelector('#time-now'),
  timeNextDay: document.querySelector('#time-next-day'),
  timePlay: document.querySelector('#time-play'),
  timeRate: document.querySelector('#time-rate'),
  photoButton: document.querySelector('#photo-button'),
  photoStatus: document.querySelector('#photo-status'),
  headlightsToggle: document.querySelector('#headlights-toggle'),
  cameraRecenter: document.querySelector('#camera-recenter'),
  explorationProgress: document.querySelector('#exploration-progress'),
  explorationArea: document.querySelector('#exploration-area'),
  explorationPois: document.querySelector('#exploration-pois'),
  explorationCount: document.querySelector('#exploration-count'),
  odometer: document.querySelector('#odometer'),
  sessionDistance: document.querySelector('#session-distance'),
  routeVisible: document.querySelector('#route-visible'),
  obelisksVisible: document.querySelector('#obelisks-visible'),
  routeClear: document.querySelector('#route-clear'),
  mapPlacesMode: document.querySelector('#map-places-mode'),
  mapPlacesFilter: document.querySelector('#map-places-filter'),
  discoveryToast: document.querySelector('#discovery-toast'),
  discoveryToastTitle: document.querySelector('#discovery-toast-title'),
  discoveryToastMain: document.querySelector('#discovery-toast-main'),
  discoveryToastSub: document.querySelector('#discovery-toast-sub'),
  languageSelect: document.querySelector('#language-select'),
  debugToggle: document.querySelector('#debug-toggle'),
  debugHud: document.querySelector('#debug-hud'),
  debugClose: document.querySelector('#debug-close'),
  debugProviderBoundaries: document.querySelector('#debug-provider-boundaries'),
  debugProvider: document.querySelector('#debug-provider'),
  debugBlock: document.querySelector('#debug-block'),
  debugLod: document.querySelector('#debug-lod'),
  debugMeshes: document.querySelector('#debug-meshes'),
  debugTiles: document.querySelector('#debug-tiles'),
  debugPacks: document.querySelector('#debug-packs'),
  debugBlocks: document.querySelector('#debug-blocks'),
  debugOrigin: document.querySelector('#debug-origin'),
  debugRover: document.querySelector('#debug-rover'),
  debugPolar: document.querySelector('#debug-polar'),
  debugCache: document.querySelector('#debug-cache'),
  mobileUiToggle: document.querySelector('#mobile-ui-toggle'),
  mobileHeadlights: document.querySelector('#mobile-headlights'),
  mobileCenter: document.querySelector('#mobile-center'),
  mobilePhoto: document.querySelector('#mobile-photo')
};

initLanguage();
populateLanguageSelect(ui.languageSelect);
applyI18n();

const floatingOrigin = new FloatingOrigin(APP_CONFIG.floatingOriginThreshold);
const regolith = createLunarRegolithMaterial();
const terrain = new LunarTerrainManager({
  scene,
  material: regolith,
  floatingOrigin,
  config: APP_CONFIG.terrain,
  onStatus(text, ok) {
    ui.dem.textContent = text;
    ui.dem.className = ok ? 'ok' : 'warn';
  }
});
const rover = new RoverController({ scene, terrain, floatingOrigin, config: APP_CONFIG });
const roverCamera = new RoverCamera(camera, renderer, rover, terrain, APP_CONFIG.camera);
const celestial = new LunarCelestialSystem({ scene, camera, sunLight: sun, starGroup });
const exploration = new ExplorationManager({
  scene,
  terrain,
  rover,
  onChange: (_manager, event) => {
    updateExplorationUI();
    if (event) showExplorationToast(event);
  }
});


function runWhenIdle(fn, timeout = 1500) {
  if ('requestIdleCallback' in globalThis) {
    requestIdleCallback(() => fn(), { timeout });
  } else {
    setTimeout(fn, Math.min(timeout, 500));
  }
}

let celestialVisualsPromise = null;
function ensureCelestialVisuals() {
  if (!celestialVisualsPromise) {
    celestialVisualsPromise = Promise.allSettled([
      celestial.loadVisualAssets(),
      celestial.loadStarCatalog()
    ]).then(results => {
      for (const result of results) {
        if (result.status === 'rejected') console.error('[Celestial asset]', result.reason);
      }
      return results;
    });
  }
  return celestialVisualsPromise;
}

const GRAVITY_STORAGE_KEY = 'lunar-rover-gravity-ms2';
const GRAVITY_PRESETS = {
  zero: 0,
  moon: 1.62,
  mercury: 3.70,
  venus: 8.87,
  earth: 9.798,
  mars: 3.71,
  jupiter: 24.79,
  saturn: 10.44,
  uranus: 8.87,
  neptune: 11.15,
  sun: 274.8
};

function presetKeyForGravity(g) {
  const preferred = ['zero','moon','mercury','venus','earth','mars','jupiter','saturn','neptune','sun'];
  return preferred.find(key => Math.abs(GRAVITY_PRESETS[key] - g) < 0.0005) || 'custom';
}

function setGravity(value, persist = true, presetKey = null) {
  const max = APP_CONFIG.gravityMax ?? 274.8;
  const raw = Number(value);
  const g = THREE.MathUtils.clamp(Number.isFinite(raw) ? raw : APP_CONFIG.gravity, 0, max);
  APP_CONFIG.gravity = g;
  rover.setGravity(g);
  if (ui.gravitySlider) ui.gravitySlider.value = String(g);
  if (ui.gravityNumber) ui.gravityNumber.value = g.toFixed(3);
  if (ui.gravityValue) ui.gravityValue.textContent = `${g.toFixed(3)} m/s²`;
  if (ui.gravityPreset) ui.gravityPreset.value = presetKey || presetKeyForGravity(g);
  if (persist) localStorage.setItem(GRAVITY_STORAGE_KEY, String(g));
  return g;
}

const storedGravityText = localStorage.getItem(GRAVITY_STORAGE_KEY);
const storedGravity = storedGravityText == null ? NaN : Number(storedGravityText);
setGravity(Number.isFinite(storedGravity) ? storedGravity : APP_CONFIG.gravity, false);

const applyManualGravity = value => {
  setGravity(value, true, 'custom');
};

ui.gravitySlider?.addEventListener('input', e => applyManualGravity(e.currentTarget.value));
ui.gravitySlider?.addEventListener('change', e => applyManualGravity(e.currentTarget.value));
ui.gravityNumber?.addEventListener('input', e => applyManualGravity(e.currentTarget.value));
ui.gravityNumber?.addEventListener('change', e => applyManualGravity(e.currentTarget.value));
ui.gravityPreset?.addEventListener('change', e => {
  const key = e.currentTarget.value;
  if (key === 'custom') return;
  const g = GRAVITY_PRESETS[key];
  if (Number.isFinite(g)) setGravity(g, true, key);
});

function utcInputValue(date) {
  return date.toISOString().slice(0, 19);
}

function syncCelestialTimeInput(force = false) {
  if (!ui.celestialTime) return;
  if (force || document.activeElement !== ui.celestialTime) {
    ui.celestialTime.value = utcInputValue(celestial.date);
  }
}

function setCelestialDate(date) {
  if (celestial.setDate(date)) syncCelestialTimeInput(true);
}

function shiftCelestialDays(days) {
  setCelestialDate(new Date(celestial.date.getTime() + days * 86400000));
}

ui.celestialTime?.addEventListener('change', e => {
  const text = e.currentTarget.value;
  if (!text) return;
  setCelestialDate(new Date(`${text}Z`));
});
ui.timePrevDay?.addEventListener('click', () => shiftCelestialDays(-1));
ui.timeNextDay?.addEventListener('click', () => shiftCelestialDays(1));
ui.timeNow?.addEventListener('click', () => setCelestialDate(new Date()));
ui.timeRate?.addEventListener('change', e => celestial.setTimeScale(e.currentTarget.value));
ui.timePlay?.addEventListener('click', () => {
  celestial.setPlaying(!celestial.playing);
  ui.timePlay.textContent = celestial.playing ? t('celestial.pause') : t('celestial.play');
});
celestial.setTimeScale(ui.timeRate?.value || 3600);
syncCelestialTimeInput(true);

const HEADLIGHT_STORAGE_KEY = 'lunar-rover-headlights';
rover.setHeadlights(localStorage.getItem(HEADLIGHT_STORAGE_KEY) === '1');

function setHeadlights(value) {
  const on = rover.setHeadlights(value);
  localStorage.setItem(HEADLIGHT_STORAGE_KEY, on ? '1' : '0');
  if (ui.headlightsToggle) ui.headlightsToggle.textContent = on ? t('exploration.lightsOn') : t('exploration.lightsOff');
  return on;
}

function toggleHeadlights() { setHeadlights(!rover.headlightsOn); }

function formatDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function localizedPoiType(type) {
  const keys = {
    'ROCK FIELD':'poi.rockField',
    'SMALL CRATER':'poi.smallCrater',
    'RIDGE VIEW':'poi.ridgeView',
    'LOW BASIN':'poi.lowBasin',
    'SUNLIGHT POINT':'poi.sunlightPoint',
    'SCENIC OVERLOOK':'poi.scenicOverlook',
    'SLOPE':'poi.slope',
    'GEOLOGY POINT':'poi.geologyPoint'
  };
  return t(keys[type] || 'exploration.poi');
}

function updateExplorationUI() {
  if (!ui.explorationProgress) return;
  ui.explorationProgress.textContent = `${exploration.progressPercent.toFixed(2)}%`;
  ui.explorationCount.textContent = exploration.explorationCount
    ? `${exploration.completedCount} / ${exploration.explorationCount}`
    : t('exploration.loading');
  ui.explorationArea.textContent = exploration.activeFeature?.name || t('exploration.noArea');
  ui.explorationPois.textContent = `${exploration.activeDiscoveredCount} / ${exploration.activePOIs.length} ${t('exploration.poi')}`;
  ui.odometer.textContent = formatDistance(exploration.totalDistanceMeters);
  ui.sessionDistance.textContent = t('exploration.session', { value: formatDistance(exploration.sessionDistanceMeters) });
  ui.routeVisible.checked = exploration.settings.showRoute;
  ui.obelisksVisible.checked = exploration.settings.showObelisks;
}

const discoveryToastQueue = [];
let discoveryToastBusy = false;

function showExplorationToast(event) {
  if (!event) return;
  discoveryToastQueue.push(event);
  if (!discoveryToastBusy) playNextExplorationToast();
}

function playNextExplorationToast() {
  const event = discoveryToastQueue.shift();
  if (!event || !ui.discoveryToast) {
    discoveryToastBusy = false;
    return;
  }
  discoveryToastBusy = true;
  const toast = ui.discoveryToast;
  toast.hidden = false;
  toast.classList.remove('show','complete');

  if (event.type === 'area_complete') {
    toast.classList.add('complete');
    ui.discoveryToastTitle.textContent = t('exploration.areaComplete');
    ui.discoveryToastMain.textContent = event.feature?.name || 'LUNAR FEATURE';
    ui.discoveryToastSub.textContent = (event.total || 0) + ' / ' + (event.total || 0) + ' ' + t('exploration.poi') + ' · ' + t('exploration.obeliskUnlocked');
    browse?.refreshNomenclatureState?.();
  } else {
    ui.discoveryToastTitle.textContent = t('exploration.poiDiscovered');
    ui.discoveryToastMain.textContent = localizedPoiType(event.poi?.type);
    ui.discoveryToastSub.textContent = (event.feature?.name || '') + ' · ' + (event.discovered || 0) + ' / ' + (event.total || 0) + ' ' + t('exploration.poi');
  }

  requestAnimationFrame(() => toast.classList.add('show'));
  const duration = event.type === 'area_complete' ? 4800 : 3200;
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove('complete');
      discoveryToastBusy = false;
      playNextExplorationToast();
    }, 260);
  }, duration);
}

function syncBrowseRoute() {
  browse?.setRoute?.(exploration.route, exploration.settings.showRoute);
}

ui.headlightsToggle?.addEventListener('click', toggleHeadlights);
ui.cameraRecenter?.addEventListener('click', () => roverCamera.recenter());
ui.routeVisible?.addEventListener('change', e => {
  exploration.setShowRoute(e.currentTarget.checked);
  syncBrowseRoute();
});
ui.obelisksVisible?.addEventListener('change', e => exploration.setShowObelisks(e.currentTarget.checked));
ui.routeClear?.addEventListener('click', () => {
  if (!confirm(t('confirm.clearRoute'))) return;
  exploration.clearRoute();
  syncBrowseRoute();
});
setHeadlights(rover.headlightsOn);
updateExplorationUI();


function setMobilePanelsOpen(open) {
  const value = !!open;
  document.body.classList.toggle('mobile-panels-open', value);
  ui.mobileUiToggle?.setAttribute('aria-expanded', String(value));
}

const mobileJoystick = document.querySelector('#mobile-joystick');
const mobileJoystickThumb = document.querySelector('#mobile-joystick-thumb');
const mobileJoystickKeys = new Set();
let mobileJoystickPointer = null;

function setMobileJoystickKeys(nextKeys) {
  for (const code of mobileJoystickKeys) {
    if (!nextKeys.has(code)) rover.setVirtualKey?.(code, false);
  }
  for (const code of nextKeys) {
    if (!mobileJoystickKeys.has(code)) rover.setVirtualKey?.(code, true);
  }
  mobileJoystickKeys.clear();
  nextKeys.forEach(code => mobileJoystickKeys.add(code));
}

function resetMobileJoystick() {
  setMobileJoystickKeys(new Set());
  mobileJoystickPointer = null;
  if (mobileJoystickThumb) mobileJoystickThumb.style.transform = 'translate(0px, 0px)';
  mobileJoystick?.classList.remove('is-active');
}

function updateMobileJoystick(clientX, clientY) {
  if (!mobileJoystick || !mobileJoystickThumb) return;
  const rect = mobileJoystick.getBoundingClientRect();
  const cx = rect.left + rect.width * 0.5;
  const cy = rect.top + rect.height * 0.5;
  const maxRadius = Math.max(1, Math.min(rect.width, rect.height) * 0.30);
  let dx = clientX - cx;
  let dy = clientY - cy;
  const distance = Math.hypot(dx, dy);
  if (distance > maxRadius) {
    const scale = maxRadius / distance;
    dx *= scale;
    dy *= scale;
  }

  mobileJoystickThumb.style.transform = 'translate(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px)';

  const x = dx / maxRadius;
  const y = dy / maxRadius;
  const deadZone = 0.28;
  const nextKeys = new Set();
  if (y < -deadZone) nextKeys.add('KeyW');
  if (y > deadZone) nextKeys.add('KeyS');
  if (x < -deadZone) nextKeys.add('KeyA');
  if (x > deadZone) nextKeys.add('KeyD');
  setMobileJoystickKeys(nextKeys);
}

function clearMobileDriveButtons() {
  rover.clearVirtualInputs?.();
  mobileJoystickKeys.clear();
  resetMobileJoystick();
  document.querySelectorAll('[data-rover-key].is-active').forEach(button => button.classList.remove('is-active'));
}

ui.mobileUiToggle?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  setMobilePanelsOpen(!document.body.classList.contains('mobile-panels-open'));
});

ui.mobileHeadlights?.addEventListener('click', event => {
  event.preventDefault();
  toggleHeadlights();
});
ui.mobileCenter?.addEventListener('click', event => {
  event.preventDefault();
  roverCamera.recenter();
});
ui.mobilePhoto?.addEventListener('click', event => {
  event.preventDefault();
  togglePhotoMode();
});

mobileJoystick?.addEventListener('pointerdown', event => {
  if (mode !== 'drive' || switching || photoMode?.active) return;
  event.preventDefault();
  event.stopPropagation();
  mobileJoystickPointer = event.pointerId;
  mobileJoystick.setPointerCapture?.(event.pointerId);
  mobileJoystick.classList.add('is-active');
  updateMobileJoystick(event.clientX, event.clientY);
});
mobileJoystick?.addEventListener('pointermove', event => {
  if (event.pointerId !== mobileJoystickPointer) return;
  event.preventDefault();
  event.stopPropagation();
  updateMobileJoystick(event.clientX, event.clientY);
});
const releaseMobileJoystick = event => {
  if (mobileJoystickPointer != null && event?.pointerId != null && event.pointerId !== mobileJoystickPointer) return;
  resetMobileJoystick();
};
mobileJoystick?.addEventListener('pointerup', releaseMobileJoystick);
mobileJoystick?.addEventListener('pointercancel', releaseMobileJoystick);
mobileJoystick?.addEventListener('lostpointercapture', releaseMobileJoystick);
mobileJoystick?.addEventListener('contextmenu', event => event.preventDefault());

document.querySelectorAll('[data-rover-key]').forEach(button => {
  const code = button.dataset.roverKey;
  let activePointer = null;

  const release = event => {
    if (activePointer != null && event?.pointerId != null && event.pointerId !== activePointer) return;
    rover.setVirtualKey?.(code, false);
    button.classList.remove('is-active');
    activePointer = null;
  };

  button.addEventListener('pointerdown', event => {
    if (mode !== 'drive' || switching || photoMode?.active) return;
    event.preventDefault();
    event.stopPropagation();
    activePointer = event.pointerId;
    button.setPointerCapture?.(event.pointerId);
    rover.setVirtualKey?.(code, true);
    button.classList.add('is-active');
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', event => event.preventDefault());
});
addEventListener('blur', clearMobileDriveButtons);


let multiplayer = null;
let miniMap = null;
let photoMode = null;
let photoModePromise = null;

let activeSite = null;
let switching = false;
let mode = 'browse';
let driveReady = false;
let roverLoadPromise = null;

function ensureRoverLoaded() {
  if (!roverLoadPromise) roverLoadPromise = rover.load();
  return roverLoadPromise;
}

const browsePanel = document.querySelector('#browse-panel');
const selectedLabel = document.querySelector('#selected-coords');
const browseMessage = document.querySelector('#browse-message');
const driveButton = document.querySelector('#drive-selected');
const resumeButton = document.querySelector('#resume-drive');
const browseButton = document.querySelector('#browse-toggle');
const browse = new LunarBrowse(renderer, geo => {
  selectedLabel.textContent = formatLatLon(geo.lat, geo.lon);
  document.querySelector('#pick-lat').value = geo.lat.toFixed(6);
  document.querySelector('#pick-lon').value = geo.lon.toFixed(6);
  const covered = coveredLatitude(geo.lat);
  driveButton.disabled = switching || !covered;
  // Selection is browse-only. Driving DEM is loaded by switchSite after explicit entry.
  browseMessage.textContent = covered
    ? t('browse.selected')
    : t('browse.invalid');
}, (text, ready) => {
  const status = document.querySelector('#overview-status');
  status.textContent = text;
  if (!ready) {
    clearTimeout(status._hideTimer);
    status._hideTimer = null;
    status.hidden = false;
  } else if (!status.hidden && !status._hideTimer) {
    status._hideTimer = setTimeout(() => { status.hidden = true; status._hideTimer = null; }, 1800);
  }
});

browse.setExplorationManager(exploration);
if (ui.mapPlacesMode) {
  ui.mapPlacesMode.value = browse.mapPlacesMode;
  ui.mapPlacesMode.addEventListener('change', event => {
    browse.setMapPlacesMode(event.currentTarget.value);
  });
}
if (ui.mapPlacesFilter) {
  ui.mapPlacesFilter.value = browse.mapPlacesFilter;
  ui.mapPlacesFilter.addEventListener('change', event => {
    browse.setMapPlacesFilter(event.currentTarget.value);
  });
}


const DEBUG_HUD_STORAGE_KEY = 'lunar-sim-debug-hud';
const DEBUG_BOUNDARY_STORAGE_KEY = 'lunar-sim-debug-provider-boundaries';
let debugEnabled = localStorage.getItem(DEBUG_HUD_STORAGE_KEY) === '1';
let debugProviderBoundaries = localStorage.getItem(DEBUG_BOUNDARY_STORAGE_KEY) === '1';

function applyDebugHudState() {
  if (ui.debugHud) ui.debugHud.hidden = !debugEnabled;
  if (ui.debugProviderBoundaries) ui.debugProviderBoundaries.checked = debugProviderBoundaries;
  browse.setProviderBoundariesVisible(debugEnabled && debugProviderBoundaries);
  ui.debugToggle?.setAttribute('aria-pressed', String(debugEnabled));
}

function setDebugEnabled(value) {
  debugEnabled = !!value;
  localStorage.setItem(DEBUG_HUD_STORAGE_KEY, debugEnabled ? '1' : '0');
  applyDebugHudState();
}

function updateDebugHud() {
  if (!debugEnabled || !ui.debugHud) return;
  const stats = terrain.stats();
  const geo = driveReady && terrain.manifest ? terrain.geoAt(rover.east, rover.north) : browse.selected;
  const meta = geo && terrain.loader?.index ? terrain.loader.blockForGeo(geo.lat, geo.lon) : null;
  const projectionType = meta?.projection?.type || 'equirectangular';
  const provider = projectionType === 'polar-stereographic'
    ? 'LOLA ' + String(meta?.projection?.hemisphere || '').toUpperCase()
    : (meta ? 'SLDEM2015' : '--');
  const activeLods = [...terrain.active.values()]
    .map(entry => entry?.tile?.lod ?? entry?.lod)
    .filter(Number.isFinite);
  const currentLod = activeLods.length ? Math.max(...activeLods) : '--';

  if (ui.debugProvider) ui.debugProvider.textContent = provider;
  if (ui.debugBlock) ui.debugBlock.textContent = meta?.id || '--';
  if (ui.debugLod) ui.debugLod.textContent = currentLod + ' / ' + stats.maxLod;
  if (ui.debugMeshes) ui.debugMeshes.textContent = String(stats.activeMeshes);
  if (ui.debugTiles) ui.debugTiles.textContent = String(stats.cachedHeightTiles);
  if (ui.debugPacks) ui.debugPacks.textContent = String(stats.cachedPacks ?? 0);
  if (ui.debugBlocks) ui.debugBlocks.textContent = String(stats.loadedBlocks ?? 0);
  if (ui.debugOrigin) ui.debugOrigin.textContent = Math.round(floatingOrigin.east) + ' / ' + Math.round(floatingOrigin.north) + ' m';
  if (ui.debugRover) ui.debugRover.textContent = driveReady && geo
    ? geo.lat.toFixed(5) + '°, ' + geo.lon.toFixed(5) + '°, ' + Math.round(rover.elevation || 0) + ' m'
    : '--';
  if (ui.debugPolar) ui.debugPolar.textContent = projectionType === 'polar-stereographic' ? 'YES' : 'NO';
  if (ui.debugCache) ui.debugCache.textContent = (stats.cachedHeightTiles || 0) + ' tiles · ' + (stats.cachedPacks || 0) + ' packs';
}

function refreshLocalizedUI() {
  applyI18n();
  if (ui.languageSelect) ui.languageSelect.value = document.documentElement.lang;
  setHeadlights(rover.headlightsOn);
  updateExplorationUI();
  if (ui.timePlay) ui.timePlay.textContent = celestial.playing ? t('celestial.pause') : t('celestial.play');
  browseButton.textContent = mode === 'browse' ? t('browse.toggleReturn') : t('browse.toggle');
  ui.siteName.textContent = activeSite ? (activeSite.customLanding ? t('site.customLanding') : activeSite.name) : t('hud.loadingTerrain');
  if (!browse.selected) selectedLabel.textContent = t('browse.noSelection');
  if (!switching) browseMessage.textContent = browse.selected ? t('browse.selected') : '';
  else browseMessage.textContent = t('browse.loadingLanding');
  browse.status();
  photoMode?.refreshLanguage();
}

ui.languageSelect?.addEventListener('change', e => {
  setLanguage(e.currentTarget.value);
  refreshLocalizedUI();
});
ui.debugToggle?.addEventListener('click', () => setDebugEnabled(!debugEnabled));
ui.debugClose?.addEventListener('click', () => setDebugEnabled(false));
ui.debugProviderBoundaries?.addEventListener('change', e => {
  debugProviderBoundaries = e.currentTarget.checked;
  localStorage.setItem(DEBUG_BOUNDARY_STORAGE_KEY, debugProviderBoundaries ? '1' : '0');
  browse.setProviderBoundariesVisible(debugEnabled && debugProviderBoundaries);
});
addEventListener('keydown', e => {
  if (e.code === 'F10' && !e.repeat) {
    e.preventDefault();
    setDebugEnabled(!debugEnabled);
  }
});
applyDebugHudState();
function setMode(next) {
  if (next === 'drive' && !driveReady) return;
  if (photoMode?.active) photoMode.exit();
  mode = next;
  rover.clearInputs?.();
  clearMobileDriveButtons();
  setMobilePanelsOpen(false);
  rover.speed = 0;
  rover.inputEnabled = next === 'drive' && !switching;
  roverCamera.enabled = next === 'drive' && !switching;
  roverCamera.drag = false;
  browse.setActive(next === 'browse');
  if (next === 'drive') browse.hideFeaturePopup();
  browsePanel.hidden = next !== 'browse';
  document.querySelector('#hud').hidden = next === 'browse';
  browseButton.textContent = next === 'browse' ? t('browse.toggleReturn') : t('browse.toggle');
  resumeButton.disabled = !driveReady || switching;
  if (next === 'drive') roverCamera.snap();
}

function openBrowse() {
  if (switching) return;
  const geo = driveReady ? terrain.geoAt(rover.east, rover.north) : (browse.selected || SITES[DEFAULT_SITE_ID]);
  if (driveReady && geo) {
    browse.setRoverState({
      lat: geo.lat,
      lon: geo.lon,
      headingDeg: THREE.MathUtils.radToDeg(rover.heading),
      elevation: rover.elevation
    });
  } else {
    browse.setRoverState(null);
  }
  browse.focus(geo);
  browse.setRoute(exploration.route, exploration.settings.showRoute);
  setMode('browse');
}
browseButton.addEventListener('click', () => {
  if (switching) return;
  if (mode === 'drive') openBrowse();
  else if (driveReady) setMode('drive');
});
resumeButton.addEventListener('click', () => { if (!switching) setMode('drive'); });
document.querySelector('#browse-home').addEventListener('click', () => {
  if (!switching) browse.focus(browse.selected || SITES[DEFAULT_SITE_ID]);
});
document.querySelector('#coordinate-form').addEventListener('submit', e => {
  e.preventDefault();
  if (switching) return;
  browse.select({ lat: Number(document.querySelector('#pick-lat').value), lon: Number(document.querySelector('#pick-lon').value) });
  browse.focus(browse.selected);
});
driveButton.addEventListener('click', () => {
  if (!browse.selected || switching) return;
  const feature = browse.selected.feature || null;
  switchSite({
    ...browse.selected,
    name: feature?.name || 'CUSTOM LUNAR LANDING',
    note: feature ? feature.type + ' · USGS / IAU' : '',
    featureId: feature?.id ?? null,
    customLanding: !feature,
    roverHeadingDeg: 0
  });
});

async function switchSite(siteOrId) {
  if (switching) return;
  const site = typeof siteOrId === 'string' ? SITES[siteOrId] || BOUNDARY_TEST_SITES[siteOrId] : siteOrId;
  if (!site || !coveredLatitude(site.lat) || !Number.isFinite(site.lon)) return;
  setMode('browse');
  browse.select(site);
  switching = true;
  browse.setBusy(true);
  driveButton.disabled = true;
  resumeButton.disabled = true;
  browseButton.disabled = true;
  multiplayer.suspended = true;
  browseMessage.textContent = t('browse.loadingLanding');
  let activated = false;
  try {
    // Preflight before invalidating the current driving anchor. Coverage is not
    // proof that the block and its actual finest-level samples exist on disk.
    await terrain.loader.loadIndex();
    const meta = terrain.loader.blockForGeo(site.lat, site.lon);
    if (!meta) throw new Error(t('terrain.noBlock'));
    const tile = await terrain.loader.ensureGeoLoaded(site.lat, site.lon);
    if (!tile || !Number.isFinite(terrain.loader.sampleTileGeo(tile, site.lat, site.lon))) throw new Error(t('terrain.sampleMissing'));
    activated = true;
    driveReady = false;
    rover.object.visible = false;
    floatingOrigin.reset(0, 0);
    await terrain.activateAt(site.lat, site.lon);
    await ensureRoverLoaded();
    await rover.reset({ east: 0, north: 0, headingDeg: site.roverHeadingDeg || 0 });
    if ([[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]].some(([e, n]) => terrain.sampleLocalHeight(e, n) == null)) {
      throw new Error(t('terrain.neighborhoodMissing'));
    }
    terrain.update(0, 0);
    if (!terrain.active.size) throw new Error(t('terrain.visibleFailed'));
    activeSite = { ...site };
    ui.siteName.textContent = site.customLanding ? t('site.customLanding') : site.name;
    ui.siteCoords.textContent = formatLatLon(site.lat, site.lon);
    ui.siteRef.textContent = site.featureId ? site.note : '';
    ui.surface.textContent = t('hud.surfaceLock');
    rover.object.visible = true;
    driveReady = true;
    exploration.resetSessionDistance();
    const explorationFeature = site.featureId
      ? exploration.feature(site.featureId)
      : exploration.nearestExplorationFeature(site.lat, site.lon, 50000);
    exploration.activateFeature(explorationFeature);
    updateExplorationUI();
    const landedGeo = terrain.geoAt(rover.east, rover.north);
    if (landedGeo) {
      browse.setRoverState({
        lat: landedGeo.lat,
        lon: landedGeo.lon,
        headingDeg: THREE.MathUtils.radToDeg(rover.heading),
        elevation: rover.elevation
      });
    }
    browseMessage.textContent = t('browse.ready');
  } catch (err) {
    console.error(err);
    if (activated) {
      terrain.regionToken++;
      terrain.manifest = null;
      terrain.clearMeshes();
      rover.object.visible = false;
    }
    browseMessage.textContent = t('browse.noTerrain') + ' ' + err.message;
    ui.dem.textContent = t('debug.noRealDem');
    ui.dem.className = 'warn';
  } finally {
    switching = false;
    multiplayer.suspended = !driveReady;
    browse.setBusy(false);
    browseButton.disabled = false;
    resumeButton.disabled = !driveReady;
    driveButton.disabled = !browse.selected || !coveredLatitude(browse.selected.lat);
  }
  if (driveReady && activated && terrain.manifest) setMode('drive');
}

addEventListener('keydown', e => {
  if (e.repeat || switching || e.target.closest?.('input, textarea, select')) return;
  if (e.code === 'KeyL' && mode === 'drive') {
    e.preventDefault();
    toggleHeadlights();
    return;
  }
  if (e.code === 'KeyC' && mode === 'drive') {
    e.preventDefault();
    roverCamera.recenter();
    return;
  }

  if (e.code === 'KeyP') {
    e.preventDefault();
    if (mode === 'drive' && driveReady) togglePhotoMode();
    return;
  }

  if (e.code === 'KeyB' || (e.code === 'Escape' && mode === 'browse')) {
    e.preventDefault();
    if (mode === 'drive') openBrowse();
    else if (driveReady) setMode('drive');
    return;
  }

  for (const site of Object.values(SITES)) {
    if (e.code === site.hotkey) {
      switchSite(site.id);
      return;
    }
  }

  for (const site of Object.values(BOUNDARY_TEST_SITES)) {
    if (e.code === site.hotkey) {
      e.preventDefault();
      switchSite(site.id);
      return;
    }
  }

  if (e.code === 'KeyR' && mode === 'drive' && activeSite) switchSite(activeSite);
});

browse.select(SITES[DEFAULT_SITE_ID]);
browse.setRoverState(null);
setMode('browse');

runWhenIdle(() => {
  exploration.loadCatalog()
    .then(catalog => {
      browse.setNomenclatureCatalog(catalog);
      updateExplorationUI();
    })
    .catch(err => console.error('[USGS / IAU Gazetteer]', err));
}, 900);

// Browse terrain stays at overview LODs; selecting a location does not warm driving DEM.
// Rover/sky visuals may warm during idle time; switchSite loads driving terrain
// only when the user explicitly enters Drive Mode.
runWhenIdle(() => ensureRoverLoaded().catch(err => console.error('[Rover load]', err)), 600);
runWhenIdle(() => ensureCelestialVisuals(), 1800);

multiplayer = new Multiplayer({ scene, terrain, floatingOrigin, rover, playersLabel: ui.players, config: APP_CONFIG });
miniMap = new RoverMiniMap({
  terrain,
  rover,
  multiplayer,
  exploration,
  root: document.querySelector('#minimap')
});

function ensurePhotoMode() {
  if (photoMode) return Promise.resolve(photoMode);
  if (!photoModePromise) {
    photoModePromise = import('./photo/PhotoMode.js').then(({ PhotoMode }) => {
      photoMode = new PhotoMode({
        scene, camera, renderer, rover,
        panel: document.querySelector('#photo-mode'),
        getGeo: () => driveReady ? terrain.geoAt(rover.east, rover.north) : null,
        getDate: () => celestial.date,
        setDate: date => setCelestialDate(date),
        isNetworked: () => Boolean(multiplayer?.socket?.connected),
        onActiveChange: active => {
          rover.clearInputs?.();
          clearMobileDriveButtons();
          rover.inputEnabled = mode === 'drive' && !switching && !active;
          roverCamera.enabled = mode === 'drive' && !switching && !active;
          roverCamera.drag = false;
          if (!active && mode === 'drive') roverCamera.snap();
        }
      });
      photoMode.refreshLanguage();
      return photoMode;
    }).catch(error => {
      photoModePromise = null;
      console.error('[PhotoMode load]', error);
      throw error;
    });
  }
  return photoModePromise;
}

async function togglePhotoMode() {
  if (mode !== 'drive' || !driveReady || switching) return;
  const instance = await ensurePhotoMode();
  if (mode === 'drive' && driveReady && !switching) instance.toggle();
}
ui.photoButton?.addEventListener('click', togglePhotoMode);

let lastDebugUpdate = 0;
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, clock.getDelta());
  const simDt = photoMode?.active ? photoMode.simulationDelta(dt) : dt;

  if (mode === 'drive' && !switching && driveReady && terrain.manifest) {
    terrain.update(rover.east, rover.north);
    if (simDt > 0) rover.update(simDt);
    const oldOriginEast = floatingOrigin.east;
    const oldOriginNorth = floatingOrigin.north;
    const shifted = floatingOrigin.update(rover.east, rover.north);
    if (shifted) {
      const deltaEast = floatingOrigin.east - oldOriginEast;
      const deltaNorth = floatingOrigin.north - oldOriginNorth;
      terrain.update(rover.east, rover.north);
      rover.updateTransform(simDt, true);
      roverCamera.rebase(deltaEast, deltaNorth);
    }
    if (!photoMode?.active) roverCamera.update(dt);
    multiplayer.update(dt);
    miniMap.update();

    const geo = terrain.geoAt(rover.east, rover.north);
    if (geo) {
      ui.siteCoords.textContent = formatLatLon(geo.lat, geo.lon);
      const sky = celestial.update(simDt, { lat: geo.lat, lon: geo.lon, elevation: rover.elevation, targetPosition: rover.object.position });
      if (sky) {
        const s = sky.sun, e = sky.earth;
        if (ui.celestialStatus) {
          ui.celestialStatus.textContent = t('celestial.sun') + ' ALT ' + s.altitude.toFixed(1) + '° AZ ' + s.azimuth.toFixed(1) + '° · ' + t('celestial.earth') + ' ALT ' + e.altitude.toFixed(1) + '° AZ ' + e.azimuth.toFixed(1) + '°';
        }

        const nightLighting = computeLunarNightLighting(s, e);
        fill.intensity = nightLighting.fillIntensity;
        earthshine.intensity = nightLighting.earthshineIntensity;
        earthshine.position.copy(rover.object.position).addScaledVector(e.world, 6000);
        earthshine.target.position.copy(rover.object.position);
        earthshine.target.updateMatrixWorld();
      }
      if (celestial.playing) syncCelestialTimeInput();
      if (simDt > 0) exploration.update(geo);
      updateExplorationUI();
    }
    ui.altitude.textContent = t('hud.elev', { value: Math.round(rover.elevation) });
    ui.speed.textContent = Math.round(Math.abs(rover.speed) * 3.6);
    ui.surface.textContent = terrain.sampleLocalHeight(rover.east, rover.north) == null
      ? t('hud.surfaceMiss')
      : (rover.grounded ? t('hud.surfaceLock') : t('hud.airborne'));
    const stats = terrain.stats();
    ui.lod.textContent = `LOD: ${stats.activeMeshes} meshes / ${stats.cachedHeightTiles} tiles / ${stats.cachedPacks ?? 0} packs / ${stats.loadedBlocks ?? 0} blocks / max ${stats.maxLod}`;
  }

  if (debugEnabled && performance.now() - lastDebugUpdate > 250) { updateDebugHud(); lastDebugUpdate = performance.now(); }

  if (photoMode?.active) {
    photoMode.update(dt);
    photoMode.render(dt);
  } else if (mode === 'browse') browse.render(renderer);
  else renderer.render(scene, camera);
}
loop();

addEventListener('resize', () => {
  browse.resize();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  photoMode?.resize(innerWidth, innerHeight);
});
