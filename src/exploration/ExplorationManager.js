import * as THREE from 'three';
import { destinationPoint, geodeticOffsetMeters } from '../geo/LunarCoordinates.js';

const appAssetUrl = path => `${import.meta.env.BASE_URL}${String(path).replace(/^\/+/, '')}`;

const STORAGE_KEY = 'lunar-rover-exploration-v1';
const DISCOVERY_RADIUS_M = 35;
const ROUTE_STEP_M = 20;
const MAX_VALID_STEP_M = 250;
const MAX_ROUTE_POINTS = 50000;

function hash32(value) {
  let h = 2166136261 >>> 0;
  const s = String(value);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFor(value) {
  let state = hash32(value) || 0x9e3779b9;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17; state >>>= 0;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const d = geodeticOffsetMeters(a.lat, a.lon, b.lat, b.lon);
  return Math.hypot(d.east, d.north);
}

function defaultSave() {
  return {
    version: 1,
    totalDistanceMeters: 0,
    routes: [],
    discoveredPOIs: [],
    completedFeatures: [],
    unlockedObelisks: [],
    completionDates: {},
    settings: {
      showRoute: true,
      showObelisks: true
    }
  };
}

export class ExplorationManager {
  constructor({ scene, terrain, rover, onChange = null }) {
    this.scene = scene;
    this.terrain = terrain;
    this.rover = rover;
    this.onChange = onChange;
    this.catalog = null;
    this.features = [];
    this.featureById = new Map();
    this.explorationFeatures = [];
    this.activeFeature = null;
    this.activePOIs = [];
    this.sessionDistanceMeters = 0;
    this.lastGeo = null;
    this.lastRouteGeo = null;
    this.lastSaveAt = 0;
    this.routeVersion = 0;

    this.save = this.loadSave();
    this.discovered = new Set(this.save.discoveredPOIs || []);
    this.startedFeatures = new Set();
    for (const poiId of this.discovered) {
      const featureId = Number(String(poiId).split(':', 1)[0]);
      if (Number.isFinite(featureId)) this.startedFeatures.add(featureId);
    }
    this.completed = new Set(this.save.completedFeatures || []);
    this.unlocked = new Set(this.save.unlockedObelisks || []);
    this.settings = {
      showRoute: this.save.settings?.showRoute !== false,
      showObelisks: this.save.settings?.showObelisks !== false
    };

    this.obelisk = this.createObelisk();
    this.scene.add(this.obelisk);
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw);
      return { ...defaultSave(), ...parsed, settings: { ...defaultSave().settings, ...(parsed.settings || {}) } };
    } catch (err) {
      console.warn('[Exploration] save load failed', err);
      return defaultSave();
    }
  }

  persist(force = false) {
    const now = performance.now();
    if (!force && now - this.lastSaveAt < 1200) return;
    this.lastSaveAt = now;
    this.save.discoveredPOIs = [...this.discovered];
    this.save.completedFeatures = [...this.completed];
    this.save.unlockedObelisks = [...this.unlocked];
    this.save.completionDates ||= {};
    this.save.settings = { ...this.settings };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.save));
    } catch (err) {
      console.warn('[Exploration] save write failed', err);
    }
  }

  async loadCatalog(url = appAssetUrl('data/moon/iau_moon_features.json')) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Moon Gazetteer HTTP ${response.status}: ${url}`);
    this.catalog = await response.json();
    this.features = this.catalog.features || [];
    this.featureById = new Map(this.features.map(f => [Number(f.id), f]));
    this.explorationFeatures = this.features.filter(f => f.explore);
    this.notify();
    return this.catalog;
  }

  feature(id) {
    return this.featureById.get(Number(id)) || null;
  }

  nearestExplorationFeature(lat, lon, maxDistanceM = 20000) {
    let best = null, bestD = maxDistanceM;
    for (const f of this.explorationFeatures) {
      const d = geodeticOffsetMeters(lat, lon, f.lat, f.lon);
      const m = Math.hypot(d.east, d.north);
      if (m < bestD) { bestD = m; best = f; }
    }
    return best;
  }

  activateFeature(featureOrId) {
    const feature = typeof featureOrId === 'object' ? featureOrId : this.feature(featureOrId);
    this.activeFeature = feature?.explore ? feature : null;
    this.activePOIs = this.activeFeature ? this.generatePOIs(this.activeFeature) : [];
    this.lastGeo = null;
    this.lastRouteGeo = null;
    this.updateObelisk();
    this.notify();
    return this.activeFeature;
  }

  generatePOIs(feature) {
    const random = rngFor(`poi:${feature.id}`);
    const count = 5 + Math.floor(random() * 6);
    const diameterM = Math.max(1000, Number(feature.diameterKm || 0) * 1000);
    const minRadius = Math.max(350, Math.min(1800, diameterM * 0.08));
    const maxRadius = Math.max(minRadius + 500, Math.min(12000, diameterM * 0.35 + 1800));
    const kinds = [
      'ROCK FIELD', 'SMALL CRATER', 'RIDGE VIEW', 'LOW BASIN',
      'SUNLIGHT POINT', 'SCENIC OVERLOOK', 'SLOPE', 'GEOLOGY POINT'
    ];

    const pois = [];
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const radius = minRadius + (maxRadius - minRadius) * Math.sqrt(random());
      const east = Math.sin(angle) * radius;
      const north = Math.cos(angle) * radius;
      const geo = destinationPoint(feature.lat, feature.lon, east, north);
      const id = `${feature.id}:poi:${i}`;
      const fallbackType = kinds[Math.floor(random() * kinds.length)];
      const poi = {
        id,
        index: i,
        featureId: feature.id,
        type: fallbackType,
        lat: geo.lat,
        lon: geo.lon,
        discovered: this.discovered.has(id)
      };
      poi.type = this.classifyPOIFromTerrain(poi, fallbackType);
      pois.push(poi);
    }
    return pois;
  }

  classifyPOIFromTerrain(poi, fallbackType) {
    if (!this.terrain?.manifest) return fallbackType;
    const en = geodeticOffsetMeters(this.terrain.anchor.lat, this.terrain.anchor.lon, poi.lat, poi.lon);
    const step = 90;
    const samples = [
      this.terrain.sampleLocalHeight(en.east, en.north),
      this.terrain.sampleLocalHeight(en.east + step, en.north),
      this.terrain.sampleLocalHeight(en.east - step, en.north),
      this.terrain.sampleLocalHeight(en.east, en.north + step),
      this.terrain.sampleLocalHeight(en.east, en.north - step)
    ];
    if (!samples.every(Number.isFinite)) return fallbackType;

    const [center, east, west, north, south] = samples;
    const avg = (east + west + north + south) / 4;
    const relief = Math.max(...samples) - Math.min(...samples);
    const gx = (east - west) / (step * 2);
    const gy = (north - south) / (step * 2);
    const slopeDeg = Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI;
    const prominence = center - avg;

    if (prominence < -12) return 'SMALL CRATER';
    if (prominence < -5) return 'LOW BASIN';
    if (prominence > 8) return slopeDeg > 9 ? 'RIDGE VIEW' : 'SCENIC OVERLOOK';
    if (slopeDeg > 14) return 'SLOPE';
    if (relief > 18) return 'GEOLOGY POINT';
    if (relief > 9) return 'ROCK FIELD';
    return fallbackType;
  }

  getFeatureState(featureOrId) {
    const feature = typeof featureOrId === 'object' ? featureOrId : this.feature(featureOrId);
    if (!feature?.explore) return 'nonexploration';
    const id = Number(feature.id);
    if (this.completed.has(id)) return 'explored';
    if (this.startedFeatures.has(id)) return 'inprogress';
    return 'unexplored';
  }

  getFeatureProgress(featureOrId) {
    const feature = typeof featureOrId === 'object' ? featureOrId : this.feature(featureOrId);
    if (!feature) return null;
    if (!feature.explore) {
      return { explore:false, completed:false, discovered:0, total:0, obelisk:false, completedAt:null };
    }
    const pois = this.generatePOIs(feature);
    const discovered = pois.reduce((n, poi) => n + (this.discovered.has(poi.id) ? 1 : 0), 0);
    const id = Number(feature.id);
    return {
      explore:true,
      completed:this.completed.has(id),
      discovered,
      total:pois.length,
      obelisk:this.unlocked.has(id),
      completedAt:this.save.completionDates?.[id] || null
    };
  }

  createObelisk() {
    const group = new THREE.Group();
    group.name = 'EXPLORATION_OBELISK';
    const stone = new THREE.MeshStandardMaterial({
      color: 0xd7dde2,
      roughness: 0.58,
      metalness: 0.08,
      emissive: 0x102028,
      emissiveIntensity: 0.18
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.1, 0.8, 8), stone);
    base.position.y = 0.4;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.35, 6.4, 1.35), stone);
    shaft.position.y = 4.0;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.96, 2.1, 4), stone);
    tip.position.y = 8.25;
    tip.rotation.y = Math.PI / 4;
    group.add(base, shaft, tip);
    group.visible = false;
    return group;
  }

  updateObelisk() {
    const f = this.activeFeature;
    if (!f || !this.settings.showObelisks || !this.unlocked.has(Number(f.id)) || !this.terrain.manifest) {
      this.obelisk.visible = false;
      return;
    }

    const anchorOffset = geodeticOffsetMeters(this.terrain.anchor.lat, this.terrain.anchor.lon, f.lat, f.lon);
    const random = rngFor(`obelisk:${f.id}`);
    const a = random() * Math.PI * 2;
    const east = anchorOffset.east + Math.sin(a) * 120;
    const north = anchorOffset.north + Math.cos(a) * 120;
    const h = this.terrain.sampleLocalHeight(east, north);
    if (!Number.isFinite(h)) {
      this.obelisk.visible = false;
      return;
    }
    this.obelisk.position.set(
      east - this.terrain.origin.east,
      h,
      -(north - this.terrain.origin.north)
    );
    this.obelisk.visible = true;
  }

  setShowRoute(value) {
    this.settings.showRoute = !!value;
    this.persist(true);
    this.notify();
  }

  setShowObelisks(value) {
    this.settings.showObelisks = !!value;
    this.updateObelisk();
    this.persist(true);
    this.notify();
  }

  clearRoute() {
    this.save.routes = [];
    this.lastRouteGeo = null;
    this.routeVersion++;
    this.persist(true);
    this.notify();
  }

  resetSessionDistance() {
    this.sessionDistanceMeters = 0;
  }

  get totalDistanceMeters() {
    return Number(this.save.totalDistanceMeters || 0);
  }

  get route() {
    return this.save.routes || [];
  }

  get progressPercent() {
    const total = this.catalog?.explorationCount || this.explorationFeatures.length || 0;
    return total ? this.completed.size / total * 100 : 0;
  }

  get completedCount() {
    return this.completed.size;
  }

  get explorationCount() {
    return this.catalog?.explorationCount || this.explorationFeatures.length || 0;
  }

  get activeDiscoveredCount() {
    return this.activePOIs.reduce((n, p) => n + (this.discovered.has(p.id) ? 1 : 0), 0);
  }

  update(geo) {
    if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lon)) return;

    if (this.lastGeo) {
      const step = distanceMeters(this.lastGeo, geo);
      if (Number.isFinite(step) && step >= 0.01 && step <= MAX_VALID_STEP_M) {
        this.save.totalDistanceMeters = this.totalDistanceMeters + step;
        this.sessionDistanceMeters += step;
      }
    }
    this.lastGeo = { lat: geo.lat, lon: geo.lon };

    const routeStep = this.lastRouteGeo ? distanceMeters(this.lastRouteGeo, geo) : Infinity;
    if (routeStep >= ROUTE_STEP_M && routeStep <= MAX_VALID_STEP_M || !this.lastRouteGeo) {
      this.route.push({
        lat: Number(geo.lat.toFixed(6)),
        lon: Number(geo.lon.toFixed(6)),
        t: Date.now()
      });
      if (this.route.length > MAX_ROUTE_POINTS) this.route.splice(0, this.route.length - MAX_ROUTE_POINTS);
      this.lastRouteGeo = { lat: geo.lat, lon: geo.lon };
      this.routeVersion++;
    }

    let changed = false;
    const events = [];
    if (this.activeFeature) {
      for (const poi of this.activePOIs) {
        if (this.discovered.has(poi.id)) continue;
        if (distanceMeters(geo, poi) <= DISCOVERY_RADIUS_M) {
          this.discovered.add(poi.id);
          this.startedFeatures.add(Number(poi.featureId));
          poi.discovered = true;
          changed = true;
          events.push({
            type:'poi_discovered',
            feature:this.activeFeature,
            poi,
            discovered:this.activeDiscoveredCount,
            total:this.activePOIs.length
          });
        }
      }

      if (this.activePOIs.length && this.activePOIs.every(p => this.discovered.has(p.id))) {
        const id = Number(this.activeFeature.id);
        if (!this.completed.has(id)) {
          this.completed.add(id);
          this.unlocked.add(id);
          this.save.completionDates ||= {};
          this.save.completionDates[id] = new Date().toISOString();
          changed = true;
          events.push({
            type:'area_complete',
            feature:this.activeFeature,
            discovered:this.activePOIs.length,
            total:this.activePOIs.length
          });
        }
      }
    }

    this.updateObelisk();
    this.persist(changed);
    if (events.length) {
      for (const event of events) this.notify(event);
    } else if (changed) {
      this.notify();
    }
  }

  routeLocalPoints(maxPoints = 6000) {
    if (!this.terrain.manifest || !this.route.length) return [];
    const start = Math.max(0, this.route.length - maxPoints);
    const result = [];
    for (let i = start; i < this.route.length; i++) {
      const p = this.route[i];
      const en = geodeticOffsetMeters(this.terrain.anchor.lat, this.terrain.anchor.lon, p.lat, p.lon);
      result.push({ east: en.east, north: en.north });
    }
    return result;
  }

  poiLocalPoints() {
    if (!this.terrain.manifest) return [];
    return this.activePOIs.map(p => {
      const en = geodeticOffsetMeters(this.terrain.anchor.lat, this.terrain.anchor.lon, p.lat, p.lon);
      return { ...p, east: en.east, north: en.north, discovered: this.discovered.has(p.id) };
    });
  }

  notify(event = null) {
    this.onChange?.(this, event);
  }
}

export const EXPLORATION_CONSTANTS = {
  DISCOVERY_RADIUS_M,
  ROUTE_STEP_M,
  MAX_VALID_STEP_M
};
