import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GlobalHeightTileLoader } from '../terrain/GlobalHeightTileLoader.js';
import { MOON_RADIUS_M, SITES } from '../config.js';
import { normalizeLon360 } from '../geo/LunarCoordinates.js';

// Browse coordinates are independent of the driving scene's floating origin.
const RADIUS = 100;
// Continuous U coordinates are intentional: RepeatWrapping bridges ±180°.
export function albedoUV(lat, lon) { return [(lon + 180) / 360, (lat + 90) / 180]; }
export function overviewLod(distance) { return distance < 180 ? 2 : distance < 270 ? 1 : 0; }
export function globePoint(lat, lon, radius = RADIUS) {
  const p = THREE.MathUtils.degToRad(lat), l = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(radius * Math.cos(p) * Math.cos(l), radius * Math.sin(p), -radius * Math.cos(p) * Math.sin(l));
}
export function pointGeo(point) {
  return {
    lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(point.y / point.length(), -1, 1))),
    lon: normalizeLon360(THREE.MathUtils.radToDeg(Math.atan2(-point.z, point.x)))
  };
}
export function coveredLatitude(lat) { return Number.isFinite(lat) && Math.abs(lat) <= 90; }

const MAP_PLACES_MODE_KEY = 'lunar-rover-map-places-mode';
const MAP_PLACES_FILTER_KEY = 'lunar-rover-map-places-filter';
export const MAP_PLACES_HIDE_DISTANCE = 400;
const PLACE_PRIORITY = {
  'Oceanus, oceani': 1220,
  'Mare, maria': 1160,
  'Landing site name': 1140,
  'Astronaut-named features': 1120,
  'Statio': 1100,
  'Mons, montes': 1050,
  'Vallis, valles': 1010,
  'Lacus, lacūs': 970,
  'Sinus, sinūs': 960,
  'Palus, paludes': 940,
  'Promontorium, promontoria': 900,
  'Rima, rimae': 790,
  'Rupes, rupēs': 770,
  'Dorsum, dorsa': 750,
  'Catena, catenae': 720,
  'Fossa, fossae': 700
};

export function mapPlaceTier(distance) {
  if (distance > MAP_PLACES_HIDE_DISTANCE) return -1;
  if (distance > 270) return 0;
  if (distance > 210) return 1;
  if (distance > 155) return 2;
  if (distance > 118) return 3;
  return 4;
}

export function featurePriority(feature) {
  const type = feature.type || '';
  const diameter = Math.max(0, Number(feature.diameterKm || 0));
  if (type === 'Satellite Feature') return 120 + Math.min(260, diameter * 5);
  if (type.startsWith('Crater')) return 500 + Math.min(520, diameter * 4.2) + (feature.explore ? 30 : 0);
  return (PLACE_PRIORITY[type] ?? 620) + Math.min(180, diameter * 1.5) + (feature.explore ? 25 : 0);
}

export function featureVisibleAtTier(feature, tier) {
  if (tier >= 4) return true;
  if (feature.type === 'Satellite Feature') return false;
  const thresholds = [1040, 850, 700, 530, -Infinity];
  return featurePriority(feature) >= thresholds[tier];
}

export function labelBudgetForTier(tier) {
  return [38, 60, 90, 130, 180][tier] || 38;
}

export function featureMatchesExplorationFilter(feature, filter, exploration) {
  if (filter === 'all') return true;
  if (!feature?.explore) return false;
  const state = exploration?.getFeatureState?.(feature) || 'unexplored';
  return state === filter;
}

export class LunarBrowse {
  constructor(renderer, onSelect, onStatus) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060a12);
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 2000);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enabled = false;
    this.controls.minDistance = 103;
    this.controls.maxDistance = 650;
    this.controls.maxTargetRadius = 75;
    this.controls.enableDamping = false; // A click must match the globe actually displayed.
    this.loader = new GlobalHeightTileLoader({ maxPackCache: 32, maxTileCache: 640 });
    this.onStatus = onStatus;
    this.onSelect = onSelect;
    this.active = false;
    this.busy = false;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 1.4;
    this.renderer = renderer;
    this.material = new THREE.MeshBasicMaterial({ color: 0x68717b, toneMapped: false, side: THREE.DoubleSide });
    // The image-only sphere/caps supply geographic context, never drive heights.
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(RADIUS - 1, 256, 128), this.material);
    this.scene.add(this.sphere);
    this.polarCaps = [-1, 1].map(sign => {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 256, 32, 0, Math.PI * 2,
        sign > 0 ? 0 : Math.PI * 5 / 6, Math.PI / 6), this.material);
      // SphereGeometry cap UVs span only the cap: explicitly map global latitude.
      const pos = cap.geometry.attributes.position, uv = cap.geometry.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const geo = pointGeo(new THREE.Vector3().fromBufferAttribute(pos, i));
        uv.setY(i, albedoUV(geo.lat, 0)[1]);
      }
      this.scene.add(cap);
      return cap;
    });
    this.surface = new THREE.Group();
    this.scene.add(this.surface);
    this.grid = new THREE.Group();
    this.grid.visible = false;
    this.scene.add(this.grid);
    for (let lat = -60; lat <= 60; lat += 30) {
      this.line(Array.from({ length: 721 }, (_, i) => globePoint(lat, i / 2, 100.8)), Math.abs(lat) === 60 ? 0xffb45c : 0x718999);
    }
    for (let lon = 0; lon < 360; lon += 30) {
      this.line(Array.from({ length: 361 }, (_, i) => globePoint(-90 + i / 2, lon, 100.8)), 0x718999);
    }
    document.querySelector('#browse-grid')?.addEventListener('change', e => { this.grid.visible = e.target.checked; });
    this.imageStatus = '影像加载中';
    this.demStatus = 'DEM 加载中';
    this.currentLod = -1;
    this.pendingLod = null;
    this.textureLoading = this.loadAlbedo();
    this.marker = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7fffd4, depthTest: false }));
    this.marker.visible = false;
    this.marker.renderOrder = 5;
    this.scene.add(this.marker);

    this.roverState = null;
    this.roverMarker = new THREE.Group();
    this.roverDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x7dffda, depthTest: false })
    );
    this.roverDot.renderOrder = 7;
    this.roverMarker.add(this.roverDot);
    this.roverHeadingArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(),
      6,
      0x7dffda,
      1.7,
      0.8
    );
    this.roverHeadingArrow.line.material.depthTest = false;
    this.roverHeadingArrow.cone.material.depthTest = false;
    this.roverHeadingArrow.line.renderOrder = 7;
    this.roverHeadingArrow.cone.renderOrder = 7;
    this.roverMarker.add(this.roverHeadingArrow);
    this.roverMarker.visible = false;
    this.scene.add(this.roverMarker);

    this.roverHudSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.roverHudSvg.classList.add('browse-rover-link');
    this.roverHudLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    this.roverHudLine.setAttribute('stroke', 'rgba(125,255,218,.72)');
    this.roverHudLine.setAttribute('stroke-width', '1');
    this.roverHudLine.setAttribute('vector-effect', 'non-scaling-stroke');
    this.roverHudSvg.appendChild(this.roverHudLine);
    document.body.appendChild(this.roverHudSvg);

    this.roverHud = document.createElement('div');
    this.roverHud.className = 'browse-rover-label';
    this.roverHud.innerHTML = '<div class="tag">CURRENT ROVER</div><div class="coords"></div><div class="telemetry"></div>';
    this.roverHud.hidden = true;
    document.body.appendChild(this.roverHud);

    this.siteMarkers = [];
    for (const site of Object.values(SITES)) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd686 }));
      dot.position.copy(globePoint(site.lat, site.lon, 101.3));
      this.scene.add(dot);
      this.siteMarkers.push(dot);
    }

    this.nomenclatureCatalog = null;
    this.nomenclaturePoints = null;
    this.nomenclatureMaterial = new THREE.PointsMaterial({
      size: 2.4,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
      depthWrite: false,
      toneMapped: false
    });
    this.nomenclatureTierCache = new Map();
    this.nomenclatureFeatureTierCache = new Map();
    this.nomenclatureVisibleFeatures = [];
    this.currentPlaceTier = -1;
    this.exploration = null;
    this.mapPlacesMode = localStorage.getItem(MAP_PLACES_MODE_KEY) || 'all';
    if (!['off','names','all'].includes(this.mapPlacesMode)) this.mapPlacesMode = 'all';
    this.mapPlacesFilter = localStorage.getItem(MAP_PLACES_FILTER_KEY) || 'all';
    if (!['all','unexplored','inprogress','explored'].includes(this.mapPlacesFilter)) this.mapPlacesFilter = 'all';
    this.placeLabelElements = new Map();
    this.placeLabelStructureKey = '';
    this.placeLabelLayer = document.createElement('div');
    this.placeLabelLayer.className = 'browse-place-label-layer';
    document.body.appendChild(this.placeLabelLayer);
    this.lastPlaceLabelUpdate = 0;
    this.routeLine = null;
    this.featurePopup = document.createElement('div');
    this.featurePopup.className = 'browse-feature-popup';
    this.featurePopup.hidden = true;
    document.body.appendChild(this.featurePopup);
    const el = renderer.domElement;
    const pointers = new Set();
    let click = null;
    el.addEventListener('pointerdown', e => {
      pointers.add(e.pointerId);
      if (pointers.size > 1) { click = null; return; }
      if (this.active && !this.busy && e.button === 0 && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        click = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      }
    });
    el.addEventListener('pointermove', e => {
      if (click && click.id === e.pointerId && Math.hypot(e.clientX - click.x, e.clientY - click.y) > 5) click.moved = true;
    });
    el.addEventListener('pointerup', e => {
      pointers.delete(e.pointerId);
      const start = click;
      click = null;
      if (!this.active || this.busy || !start || start.id !== e.pointerId || start.moved) return;
      const rect = el.getBoundingClientRect();
      this.camera.updateMatrixWorld();
      this.scene.updateMatrixWorld(true);
      this.raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2), this.camera);
      const globeHit = this.raycaster.intersectObjects([this.sphere, ...this.polarCaps, ...this.surface.children], false)[0];
      const featureHit = this.nomenclaturePoints ? this.raycaster.intersectObject(this.nomenclaturePoints, false)[0] : null;
      if (featureHit && Number.isInteger(featureHit.index) && (!globeHit || featureHit.distance <= globeHit.distance + 2.5)) {
        const feature = this.nomenclatureVisibleFeatures?.[featureHit.index];
        if (feature) {
          this.selectFeature(feature, e.clientX, e.clientY);
          return;
        }
      }
      if (globeHit) {
        this.hideFeaturePopup();
        this.select(pointGeo(globeHit.point));
      }
    });
    el.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); click = null; });
    addEventListener('blur', () => { pointers.clear(); click = null; });
    this.focus({ lat: 15, lon: 0 });
  }

  line(points, color) {
    this.grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65 })));
  }

  focus(geo) {
    this.controls.target.set(0, 0, 0);
    this.camera.position.copy(globePoint(geo.lat, geo.lon, 310));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
  }

  select(geo) {
    if (this.busy) return;
    if (!Number.isFinite(geo.lat) || !Number.isFinite(geo.lon) || Math.abs(geo.lat) > 90) return;
    const feature = geo.feature || null;
    geo = { lat: geo.lat, lon: normalizeLon360(geo.lon), ...(feature ? { feature } : {}) };
    this.selected = geo;
    this.marker.position.copy(globePoint(geo.lat, geo.lon, 101.7));
    this.marker.material.color.set(coveredLatitude(geo.lat) ? 0xffc86b : 0xff7868);
    this.marker.visible = true;
    this.onSelect(geo);
  }

  setExplorationManager(exploration) {
    this.exploration = exploration;
    this.refreshNomenclatureState();
  }

  setMapPlacesMode(mode) {
    if (!['off','names','all'].includes(mode)) mode = 'all';
    this.mapPlacesMode = mode;
    localStorage.setItem(MAP_PLACES_MODE_KEY, mode);
    this.applyMapPlacesVisibility();
    this.updatePlaceLabels(true);
    return mode;
  }

  setMapPlacesFilter(filter) {
    if (!['all','unexplored','inprogress','explored'].includes(filter)) filter = 'all';
    if (this.mapPlacesFilter === filter) return filter;
    this.mapPlacesFilter = filter;
    localStorage.setItem(MAP_PLACES_FILTER_KEY, filter);
    this.nomenclatureTierCache.clear();
    this.nomenclatureFeatureTierCache.clear();
    this.currentPlaceTier = -999;
    this.placeLabelStructureKey = '';
    this.rebuildNomenclaturePoints(mapPlaceTier(this.camera.position.length()));
    this.updatePlaceLabels(true);
    return filter;
  }

  applyMapPlacesVisibility() {
    const farHidden = mapPlaceTier(this.camera.position.length()) < 0;
    if (this.nomenclaturePoints) {
      this.nomenclaturePoints.visible = !farHidden && this.mapPlacesMode === 'all' && this.active;
    }
    this.placeLabelLayer.hidden = farHidden || this.mapPlacesMode === 'off' || !this.active;
  }

  setNomenclatureCatalog(catalog) {
    this.nomenclatureCatalog = catalog;
    this.nomenclatureTierCache.clear();
    this.nomenclatureFeatureTierCache.clear();
    this.currentPlaceTier = -999;
    this.placeLabelStructureKey = '';
    this.rebuildNomenclaturePoints(mapPlaceTier(this.camera.position.length()));
    this.updatePlaceLabels(true);
  }

  featureColor(feature) {
    if (this.exploration?.completed?.has(Number(feature.id))) return new THREE.Color(0x7dffda);
    if (feature.explore) return new THREE.Color(0xffd27a);
    return new THREE.Color(0xdce8ef);
  }

  featureMatchesFilter(feature) {
    return featureMatchesExplorationFilter(feature, this.mapPlacesFilter, this.exploration);
  }

  visibleFeaturesForTier(tier) {
    if (tier < 0) return [];
    const cacheKey = tier + ':' + this.mapPlacesFilter;
    let cached = this.nomenclatureFeatureTierCache.get(cacheKey);
    if (cached) return cached;
    const features = this.nomenclatureCatalog?.features || [];
    cached = features
      .filter(feature => featureVisibleAtTier(feature, tier) && this.featureMatchesFilter(feature))
      .sort((a,b) => featurePriority(b) - featurePriority(a));
    this.nomenclatureFeatureTierCache.set(cacheKey, cached);
    return cached;
  }

  rebuildNomenclaturePoints(tier) {
    if (!this.nomenclatureCatalog) return;
    if (tier < 0) {
      this.currentPlaceTier = tier;
      this.nomenclatureVisibleFeatures = [];
      if (this.nomenclaturePoints) this.nomenclaturePoints.visible = false;
      this.placeLabelLayer.hidden = true;
      return;
    }
    if (tier === this.currentPlaceTier && this.nomenclaturePoints) {
      this.applyMapPlacesVisibility();
      return;
    }
    this.currentPlaceTier = tier;

    if (this.nomenclaturePoints) {
      this.scene.remove(this.nomenclaturePoints);
      this.nomenclaturePoints = null;
    }

    const cacheKey = tier + ':' + this.mapPlacesFilter;
    let cached = this.nomenclatureTierCache.get(cacheKey);
    if (!cached) {
      const features = this.visibleFeaturesForTier(tier);
      const positions = new Float32Array(features.length * 3);
      const colors = new Float32Array(features.length * 3);
      for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        const point = globePoint(feature.lat, feature.lon, 101.25);
        positions[i*3] = point.x;
        positions[i*3+1] = point.y;
        positions[i*3+2] = point.z;
        const color = this.featureColor(feature);
        colors[i*3] = color.r;
        colors[i*3+1] = color.g;
        colors[i*3+2] = color.b;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.computeBoundingSphere();
      cached = { geometry, features };
      this.nomenclatureTierCache.set(cacheKey, cached);
    }

    this.nomenclatureVisibleFeatures = cached.features;
    this.nomenclatureMaterial.size = 3.4 + tier * 0.45;
    this.nomenclaturePoints = new THREE.Points(cached.geometry, this.nomenclatureMaterial);
    this.nomenclaturePoints.name = 'USGS_IAU_MOON_NOMENCLATURE_TIER_' + tier;
    this.nomenclaturePoints.renderOrder = 4;
    this.nomenclaturePoints.frustumCulled = false;
    this.scene.add(this.nomenclaturePoints);
    this.applyMapPlacesVisibility();
  }

  refreshNomenclatureState() {
    for (const cached of this.nomenclatureTierCache.values()) cached.geometry.dispose();
    this.nomenclatureTierCache.clear();
    this.nomenclatureFeatureTierCache.clear();
    const tier = mapPlaceTier(this.camera.position.length());
    this.currentPlaceTier = -999;
    this.placeLabelStructureKey = '';
    if (this.nomenclatureCatalog) this.rebuildNomenclaturePoints(tier);
    this.updatePlaceLabels(true);
  }

  rebuildStableLabelElements(features, tier) {
    const structureKey = tier + ':' + this.mapPlacesFilter;
    if (structureKey === this.placeLabelStructureKey) return;
    this.placeLabelStructureKey = structureKey;
    this.placeLabelLayer.replaceChildren();
    this.placeLabelElements.clear();

    const budget = labelBudgetForTier(tier);
    for (const feature of features.slice(0, Math.max(budget * 4, budget))) {
      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'browse-place-label';
      if (this.exploration?.completed?.has(Number(feature.id))) label.classList.add('completed');
      else if (feature.explore) label.classList.add('explorable');
      label.textContent = feature.name;
      label.hidden = true;
      label.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.selectFeature(feature, event.clientX, event.clientY);
      });
      this.placeLabelLayer.appendChild(label);
      this.placeLabelElements.set(Number(feature.id), { label, feature });
    }
  }

  updatePlaceLabels(force = false) {
    const now = performance.now();
    if (!force && now - this.lastPlaceLabelUpdate < 80) return;
    this.lastPlaceLabelUpdate = now;

    const layer = this.placeLabelLayer;
    const tier = mapPlaceTier(this.camera.position.length());
    if (!this.active || tier < 0 || this.mapPlacesMode === 'off' || !this.nomenclatureCatalog) {
      for (const entry of this.placeLabelElements.values()) entry.label.hidden = true;
      layer.hidden = true;
      return;
    }
    layer.hidden = false;

    const candidates = this.visibleFeaturesForTier(tier);
    this.rebuildStableLabelElements(candidates, tier);

    for (const entry of this.placeLabelElements.values()) entry.label.hidden = true;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const budget = labelBudgetForTier(tier);
    const occupied = [];
    let shown = 0;
    const cameraToWorld = new THREE.Vector3();

    for (const feature of candidates) {
      if (shown >= budget) break;
      const entry = this.placeLabelElements.get(Number(feature.id));
      if (!entry) continue;

      const world = globePoint(feature.lat, feature.lon, 101.35);
      cameraToWorld.copy(this.camera.position).sub(world);
      if (world.dot(cameraToWorld) <= 0) continue;

      const projected = world.clone().project(this.camera);
      if (projected.z < -1 || projected.z > 1 || projected.x < -1.04 || projected.x > 1.04 || projected.y < -1.04 || projected.y > 1.04) continue;

      const pointX = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
      const pointY = rect.top + (1 - (projected.y * 0.5 + 0.5)) * rect.height;
      const x = pointX + 9;
      const y = pointY - 8;
      const width = Math.max(44, Math.min(180, feature.name.length * 7.1 + 10));
      const box = { left:x-2, right:x+width, top:y-10, bottom:y+10 };
      if (occupied.some(o => !(box.right < o.left || box.left > o.right || box.bottom < o.top || box.top > o.bottom))) continue;
      occupied.push(box);

      const label = entry.label;
      label.style.left = x + 'px';
      label.style.top = y + 'px';
      label.hidden = false;
      shown++;
    }
  }


  selectFeature(feature, clientX = 24, clientY = 120) {
    this.select({ lat: feature.lat, lon: feature.lon, feature });
    this.showFeaturePopup(feature, clientX, clientY);
  }

  showFeaturePopup(feature, clientX, clientY) {
    const box = this.featurePopup;
    box.replaceChildren();
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'feature-popup-close';
    close.textContent = '×';
    close.addEventListener('click', () => this.hideFeaturePopup());
    const title = document.createElement('div');
    title.className = 'feature-popup-title';
    title.textContent = feature.name;
    const body = document.createElement('div');
    body.className = 'feature-popup-body';
    const lines = [
      `Feature Type: ${feature.type}`,
      `Location: ${feature.lat.toFixed(2)}° ${feature.lat >= 0 ? 'N' : 'S'} / ${feature.lon.toFixed(2)}° E`,
      `Size: ${Number(feature.diameterKm || 0).toFixed(2)} km`,
      feature.approvalDate ? `Approved: ${feature.approvalDate.slice(0,4)}` : '',
      feature.origin ? `Origin: ${feature.origin}` : ''
    ].filter(Boolean);
    for (const line of lines) {
      const div = document.createElement('div');
      div.textContent = line;
      body.appendChild(div);
    }
    const progress = this.exploration?.getFeatureProgress?.(feature);
    if (progress?.explore) {
      const status = document.createElement('div');
      status.className = 'feature-exploration-status';
      if (progress.completed) {
        status.classList.add('completed');
        status.textContent = 'EXPLORATION · COMPLETED · ' + progress.total + '/' + progress.total + ' POI · OBELISK UNLOCKED';
      } else if (progress.discovered > 0) {
        status.textContent = 'EXPLORATION · IN PROGRESS · ' + progress.discovered + '/' + progress.total + ' POI';
      } else {
        status.textContent = 'EXPLORATION · NOT EXPLORED · 0/' + progress.total + ' POI';
      }
      body.appendChild(status);
    }

    const link = document.createElement('a');
    link.href = feature.url || `https://planetarynames.wr.usgs.gov/Feature/${feature.id}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'USGS / IAU Gazetteer →';
    box.append(close, title, body, link);
    box.hidden = false;
    const w = 340, h = 210;
    box.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, clientX + 18))}px`;
    box.style.top = `${Math.max(12, Math.min(innerHeight - h - 12, clientY - 24))}px`;
  }

  hideFeaturePopup() {
    this.featurePopup.hidden = true;
  }

  setRoute(route, visible = true) {
    if (this.routeLine) {
      this.routeLine.geometry.dispose();
      this.routeLine.material.dispose();
      this.scene.remove(this.routeLine);
      this.routeLine = null;
    }
    if (!visible || !route || route.length < 2) return;
    const stride = Math.max(1, Math.ceil(route.length / 20000));
    const pts = [];
    for (let i = 0; i < route.length; i += stride) pts.push(globePoint(route[i].lat, route[i].lon, 101.45));
    const last = route[route.length - 1];
    if ((route.length - 1) % stride) pts.push(globePoint(last.lat, last.lon, 101.45));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color:0x7dffda, transparent:true, opacity:0.72, depthTest:true, depthWrite:false });
    this.routeLine = new THREE.Line(g, m);
    this.routeLine.name = 'GLOBAL_ROVER_ROUTE';
    this.scene.add(this.routeLine);
  }

  setRoverState(state) {
    if (!state || !Number.isFinite(state.lat) || !Number.isFinite(state.lon)) {
      this.roverState = null;
      this.roverMarker.visible = false;
      this.roverHud.hidden = true;
      this.roverHudSvg.style.display = 'none';
      return;
    }

    this.roverState = {
      lat: state.lat,
      lon: normalizeLon360(state.lon),
      headingDeg: Number.isFinite(state.headingDeg) ? state.headingDeg : 0,
      elevation: Number.isFinite(state.elevation) ? state.elevation : 0
    };

    const { lat, lon, headingDeg } = this.roverState;
    this.roverMarker.position.copy(globePoint(lat, lon, 102.0));

    const p = THREE.MathUtils.degToRad(lat);
    const l = THREE.MathUtils.degToRad(lon);
    const h = THREE.MathUtils.degToRad(headingDeg);
    const north = new THREE.Vector3(
      -Math.sin(p) * Math.cos(l),
      Math.cos(p),
      Math.sin(p) * Math.sin(l)
    );
    const east = new THREE.Vector3(
      -Math.sin(l),
      0,
      -Math.cos(l)
    );
    const dir = north.multiplyScalar(Math.cos(h)).add(east.multiplyScalar(Math.sin(h))).normalize();

    this.roverHeadingArrow.position.set(0, 0, 0);
    this.roverHeadingArrow.setDirection(dir);
    this.roverMarker.visible = true;
  }

  cardinal(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const d = ((deg % 360) + 360) % 360;
    return dirs[Math.round(d / 45) % 8];
  }

  updateRoverHud() {
    if (!this.active || !this.roverState || !this.roverMarker.visible) {
      this.roverHud.hidden = true;
      this.roverHudSvg.style.display = 'none';
      return;
    }

    const markerWorld = this.roverMarker.position.clone();
    const frontFacing = markerWorld.dot(this.camera.position.clone().sub(markerWorld)) > 0;
    if (!frontFacing) {
      this.roverMarker.visible = false;
      this.roverHud.hidden = true;
      this.roverHudSvg.style.display = 'none';
      return;
    }

    const projected = markerWorld.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
    const y = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;

    const labelW = 210;
    const labelH = 68;
    const gapX = 30;
    const gapY = 22;
    let left = x + gapX;
    let top = y - labelH - gapY;

    if (left + labelW > innerWidth - 12) left = x - labelW - gapX;
    if (top < 12) top = y + gapY;
    left = Math.max(12, Math.min(innerWidth - labelW - 12, left));
    top = Math.max(12, Math.min(innerHeight - labelH - 12, top));

    const ns = this.roverState.lat >= 0 ? 'N' : 'S';
    const lon360 = normalizeLon360(this.roverState.lon);
    const ew = lon360 <= 180 ? 'E' : 'W';
    const lonAbs = ew === 'E' ? lon360 : 360 - lon360;
    const heading = ((this.roverState.headingDeg % 360) + 360) % 360;

    this.roverHud.querySelector('.coords').textContent =
      Math.abs(this.roverState.lat).toFixed(4) + '°' + ns + '  ' + lonAbs.toFixed(4) + '°' + ew;
    this.roverHud.querySelector('.telemetry').textContent =
      'HDG ' + String(Math.round(heading)).padStart(3, '0') + '° ' + this.cardinal(heading) +
      '  ·  ELEV ' + Math.round(this.roverState.elevation) + ' m';

    this.roverHud.style.left = left + 'px';
    this.roverHud.style.top = top + 'px';
    this.roverHud.hidden = false;

    const targetX = left > x ? left : left + labelW;
    const targetY = top > y ? top : top + labelH;
    this.roverHudLine.setAttribute('x1', x.toFixed(1));
    this.roverHudLine.setAttribute('y1', y.toFixed(1));
    this.roverHudLine.setAttribute('x2', targetX.toFixed(1));
    this.roverHudLine.setAttribute('y2', targetY.toFixed(1));
    this.roverHudSvg.style.display = '';
  }

  setActive(active) {
    this.active = active;
    this.controls.enabled = active && !this.busy;
    if (!active) {
      this.roverHud.hidden = true;
      this.roverHudSvg.style.display = 'none';
      this.hideFeaturePopup();
      for (const entry of this.placeLabelElements.values()) entry.label.hidden = true;
      this.placeLabelLayer.hidden = true;
      if (this.nomenclaturePoints) this.nomenclaturePoints.visible = false;
    } else {
      this.placeLabelLayer.hidden = this.mapPlacesMode === 'off';
      if (this.nomenclaturePoints) this.nomenclaturePoints.visible = this.mapPlacesMode === 'all';
      this.updatePlaceLabels(true);
    }
    if (active && !this.loading) this.loading = this.loadOverview();
  }

  setBusy(busy) {
    this.busy = busy;
    this.controls.enabled = this.active && !busy;
  }

  status() {
    this.onStatus(`${this.imageStatus} · ${this.demStatus} · 极区仅影像，无驾驶 DEM`);
  }

  async loadAlbedo() {
    const loader = new THREE.TextureLoader();
    const max = this.renderer.capabilities.maxTextureSize;
    const widths = [2048, 4096, 8192].filter(w => w <= max);

    for (let i = 0; i < widths.length; i++) {
      const width = widths[i];

      // First paint gets the compact 2K globe. Higher-resolution 4K/8K
      // upgrades wait for an idle slice so image decode/upload does not
      // compete with first interaction, rover preload, or DEM warmup.
      if (i > 0) {
        await new Promise(resolve => {
          if (typeof globalThis.requestIdleCallback === 'function') {
            globalThis.requestIdleCallback(() => resolve(), { timeout: 1200 });
          } else {
            setTimeout(resolve, 250);
          }
        });
      }

      try {
        const texture = await loader.loadAsync(`/moon/albedo/browse-${width}.webp`);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        const old = this.material.map;
        this.material.map = texture;
        this.material.color.set(0xffffff);
        this.material.needsUpdate = true;
        old?.dispose();
        this.imageStatus = `NASA / LROC imagery ${width / 1024}K`;
        this.status();
      } catch (err) {
        console.warn('[Browse albedo]', err);
        this.imageStatus = this.material.map ? `${this.imageStatus} (higher resolution unavailable)` : 'Browse imagery unavailable';
        this.status();
      }
    }
  }

  async loadOverview(lod = 0) {
    if (this.pendingLod !== null) return;
    this.pendingLod = lod;
    const next = new THREE.Group();
    try {
      const index = await this.loader.loadIndex();
      // Before polar DEM existed these caps provided only imagery. With real
      // north/south terrain they would occlude negative-elevation polar DEM.
      for (const cap of this.polarCaps) cap.visible = !index.globalCoverage;
      const metas = this.loader.allBlockMeta();
      const queue = [...metas];
      const total = metas.length;
      let loaded = 0, failed = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (queue.length) {
          const meta = queue.shift();
          try {
            const block = await this.loader.loadBlock(meta.id);
            const level = this.loader.level(block, Math.min(lod, block.maxLod));
            for (let y = 0; y < level.countY; y++) for (let x = 0; x < level.countX; x++) {
              const tile = await this.loader.loadTile(block, level.lod, x, y);
              if (!tile) throw new Error('No overview samples');
              next.add(this.makeTile(tile));
            }
            loaded++;
          } catch (err) { failed++; console.warn('[Browse DEM]', meta.id, err); }
          this.demStatus = `DEM LOD${lod}：${loaded}/${total}${failed ? `，缺失 ${failed} 区块` : ''}`;
          this.status();
        }
      }));
      // Swap only complete levels. Keep the old usable globe if refinement fails.
      if (failed && this.currentLod >= 0) {
        for (const mesh of next.children) mesh.geometry.dispose();
        this.retryAfter = performance.now() + 30000;
        this.demStatus += `（保留 LOD${this.currentLod}）`;
      } else {
        this.scene.remove(this.surface);
        for (const mesh of this.surface.children) mesh.geometry.dispose();
        this.surface = next;
        this.scene.add(next);
        this.currentLod = lod;
      }
    } catch (err) {
      for (const mesh of next.children) mesh.geometry.dispose();
      this.retryAfter = performance.now() + 30000;
      this.demStatus = `DEM 不可用：${err.message}；当前影像不能代表地形`;
    } finally {
      this.pendingLod = null;
      this.status();
    }
  }

  makeTile(tile) {
    const positions = [], uvs = [], indices = [], n = tile.lod === 0 ? 65 : 33;
    const block = this.loader.blocks.get(tile.blockId);
    if (!block) throw new Error('Missing browse block ' + tile.blockId);
    const polar = this.loader.isPolarBlock(block);

    const vertex = (lat, lon, height) => {
      positions.push(...globePoint(lat, lon, RADIUS + height / MOON_RADIUS_M * RADIUS).toArray());
      uvs.push(...albedoUV(lat, lon));
    };

    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / (n - 1);
      const v = 1 - y / (n - 1);
      const gp = this.loader.tileGeoPoint(block, tile.lod, tile.x, tile.y, u, v);
      vertex(gp.lat, gp.lon, this.loader.sampleTileGeo(tile, gp.lat, gp.lon));
    }

    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
      if (polar) {
        const center = this.loader.tileGeoPoint(
          block, tile.lod, tile.x, tile.y,
          (x + 0.5) / (n - 1),
          1 - (y + 0.5) / (n - 1)
        );
        const valid = block.projection.hemisphere === 'north'
          ? center.lat >= 60
          : center.lat <= -60;
        if (!valid) continue;
      }
      const a = y * n + x;
      indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }

    // Equirectangular blocks retain their inward skirts. Polar tiles are
    // clipped to the +/-60-degree circular provider boundary instead.
    if (!polar) {
      const ring = [];
      for (let x = 0; x < n; x++) ring.push(x);
      for (let y = 1; y < n; y++) ring.push(y * n + n - 1);
      for (let x = n - 2; x >= 0; x--) ring.push((n - 1) * n + x);
      for (let y = n - 2; y > 0; y--) ring.push(y * n);
      const skirtStart = positions.length / 3;
      for (const i of ring) {
        const v = new THREE.Vector3().fromArray(positions, i * 3);
        v.setLength(v.length() - 0.08);
        positions.push(...v.toArray());
        uvs.push(uvs[i * 2], uvs[i * 2 + 1]);
      }
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        indices.push(ring[i], skirtStart + i, ring[j], ring[j], skirtStart + i, skirtStart + j);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    return new THREE.Mesh(geometry, this.material);
  }

  render(renderer) {
    this.controls.update();
    if (this.camera.position.length() < RADIUS + 3) {
      this.camera.position.setLength(RADIUS + 3);
      this.camera.lookAt(this.controls.target);
    }
    const browseDistance = this.camera.position.length();
    const placeTier = mapPlaceTier(browseDistance);
    if (this.active && placeTier !== this.currentPlaceTier) this.rebuildNomenclaturePoints(placeTier);
    if (this.active) {
      this.applyMapPlacesVisibility();
      this.updatePlaceLabels();
    }

    const wanted = overviewLod(browseDistance);
    if (this.active && wanted !== this.currentLod && this.pendingLod === null && performance.now() > (this.retryAfter || 0)) {
      this.loadOverview(wanted);
    }
    // Keep pins a constant apparent size when zooming close to the surface.
    for (const pin of [this.marker, this.roverMarker, ...this.siteMarkers]) {
      pin.scale.setScalar(Math.max(0.001, this.camera.position.distanceTo(pin.position) / 250));
    }
    // Hide markers on the far hemisphere, even though they overlay relief.
    if (this.selected) this.marker.visible = this.marker.position.dot(this.camera.position.clone().sub(this.marker.position)) > 0;
    if (this.roverState) {
      const roverPoint = globePoint(this.roverState.lat, this.roverState.lon, 102.0);
      this.roverMarker.position.copy(roverPoint);
      this.roverMarker.visible = roverPoint.dot(this.camera.position.clone().sub(roverPoint)) > 0;
    }
    this.updateRoverHud();
    renderer.render(this.scene, this.camera);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
