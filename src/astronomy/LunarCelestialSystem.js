import * as THREE from 'three';
import {
  Body,
  GeoMoon,
  HelioVector,
  KM_PER_AU,
  RotationAxis
} from 'astronomy-engine';

const appAssetUrl = path => `${import.meta.env.BASE_URL}${String(path).replace(/^\/+/, '')}`;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const EARTH_RADIUS_KM = 6378.137;
const SUN_RADIUS_KM = 695700;
const MOON_RADIUS_KM = 1737.4;

function mod360(x) {
  return ((x % 360) + 360) % 360;
}

// Passive rotations matching the IAU body-fixed convention used by SPICE:
// J2000 -> body-fixed = R3(W) R1(90-dec) R3(90+ra).
function r3(v, deg) {
  const a = mod360(deg) * DEG;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: c*v.x + s*v.y, y: -s*v.x + c*v.y, z: v.z };
}

function r1(v, deg) {
  const a = deg * DEG;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x, y: c*v.y + s*v.z, z: -s*v.y + c*v.z };
}

function eqjToMoonFixed(v, axis) {
  let q = r3(v, 90 + axis.ra * 15);
  q = r1(q, 90 - axis.dec);
  return r3(q, axis.spin);
}

function bodyFixedToEqj(v, axis) {
  let q = r3(v, -axis.spin);
  q = r1(q, -(90 - axis.dec));
  return r3(q, -(90 + axis.ra * 15));
}

function normalize(v) {
  const n = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x/n, y: v.y/n, z: v.z/n };
}

function moonFixedToLocal(v, latDeg, lonDeg) {
  const lat = latDeg * DEG;
  const lon = mod360(lonDeg) * DEG;
  const sl = Math.sin(lat), cl = Math.cos(lat);
  const so = Math.sin(lon), co = Math.cos(lon);

  const east = -so*v.x + co*v.y;
  const north = -sl*co*v.x - sl*so*v.y + cl*v.z;
  const up = cl*co*v.x + cl*so*v.y + sl*v.z;
  const q = normalize({ x:east, y:north, z:up });

  const altitude = Math.asin(THREE.MathUtils.clamp(q.z, -1, 1)) * RAD;
  const azimuth = mod360(Math.atan2(q.x, q.y) * RAD);

  // Game world is +X east, +Y up, -Z north.
  return {
    east:q.x,
    north:q.y,
    up:q.z,
    altitude,
    azimuth,
    world:new THREE.Vector3(q.x, q.z, -q.y).normalize()
  };
}

function eqjToLocalWorld(v, moonAxis, latDeg, lonDeg) {
  return moonFixedToLocal(eqjToMoonFixed(v, moonAxis), latDeg, lonDeg).world;
}

function earthTextureRotation(date, moonAxis, latDeg, lonDeg) {
  const earthAxis = RotationAxis(Body.Earth, date);
  const bx = eqjToLocalWorld(bodyFixedToEqj({x:1,y:0,z:0}, earthAxis), moonAxis, latDeg, lonDeg);
  const by = eqjToLocalWorld(bodyFixedToEqj({x:0,y:1,z:0}, earthAxis), moonAxis, latDeg, lonDeg);
  const bz = eqjToLocalWorld(bodyFixedToEqj({x:0,y:0,z:1}, earthAxis), moonAxis, latDeg, lonDeg);

  // Three.js SphereGeometry with an equirectangular map has mesh +X at lon=0,
  // mesh +Y at the north pole, and mesh -Z at lon=+90E. Therefore:
  // mesh +X = Earth-fixed +X, mesh +Y = Earth-fixed +Z, mesh +Z = -Earth-fixed +Y.
  return new THREE.Matrix4().makeBasis(
    bx,
    bz,
    by.clone().multiplyScalar(-1)
  );
}

function bvToRgb(bv) {
  if (!Number.isFinite(bv)) return [0.92, 0.95, 1.0];
  const x = THREE.MathUtils.clamp((bv + 0.4) / 2.4, 0, 1);
  if (x < 0.25) {
    const t = x / 0.25; return [0.64 + 0.26*t, 0.76 + 0.18*t, 1.0];
  }
  if (x < 0.5) {
    const t = (x - 0.25) / 0.25; return [0.90 + 0.10*t, 0.94 + 0.06*t, 1.0 - 0.12*t];
  }
  if (x < 0.75) {
    const t = (x - 0.5) / 0.25; return [1.0, 1.0 - 0.16*t, 0.88 - 0.20*t];
  }
  const t = (x - 0.75) / 0.25;
  return [1.0, 0.84 - 0.24*t, 0.68 - 0.28*t];
}

export function computeLunarNightLighting(sun, earth) {
  const daylight = THREE.MathUtils.clamp((sun.altitude + 4) / 12, 0, 1);
  const separation = Math.acos(THREE.MathUtils.clamp(sun.world.dot(earth.world), -1, 1));
  const earthPhase = (1 - Math.cos(separation)) * 0.5;
  const earthAbove = THREE.MathUtils.clamp(Math.sin(THREE.MathUtils.degToRad(earth.altitude)), 0, 1);
  const nightFactor = 1 - daylight;
  return {
    daylight,
    fillIntensity: THREE.MathUtils.lerp(0.570, 0.555, daylight),
    earthPhase,
    earthshineIntensity: 0.24 * earthPhase * Math.sqrt(earthAbove) * (0.35 + 0.65 * nightFactor)
  };
}

export function computeLunarSky(date, latDeg, lonDeg, elevationMeters = 0) {
  const axis = RotationAxis(Body.Moon, date);

  const geoMoon = GeoMoon(date);             // Earth -> Moon, EQJ, AU
  const earthEqj = { x:-geoMoon.x, y:-geoMoon.y, z:-geoMoon.z };

  const moonHelio = HelioVector(Body.Moon, date);  // Sun -> Moon, EQJ, AU
  const sunEqj = { x:-moonHelio.x, y:-moonHelio.y, z:-moonHelio.z };

  const earthFixed = eqjToMoonFixed(earthEqj, axis);
  const sunFixed = eqjToMoonFixed(sunEqj, axis);

  // Convert center-of-Moon directions into true surface-observer (topocentric)
  // vectors. This matters most for Earth, where lunar-surface parallax can be
  // a few tenths of a degree near the horizon.
  const lat = latDeg * DEG;
  const lon = mod360(lonDeg) * DEG;
  const observerAu = ((MOON_RADIUS_KM + elevationMeters / 1000) / KM_PER_AU);
  const observerFixed = {
    x: observerAu * Math.cos(lat) * Math.cos(lon),
    y: observerAu * Math.cos(lat) * Math.sin(lon),
    z: observerAu * Math.sin(lat)
  };
  const earthTopo = {
    x: earthFixed.x - observerFixed.x,
    y: earthFixed.y - observerFixed.y,
    z: earthFixed.z - observerFixed.z
  };
  const sunTopo = {
    x: sunFixed.x - observerFixed.x,
    y: sunFixed.y - observerFixed.y,
    z: sunFixed.z - observerFixed.z
  };

  const earth = moonFixedToLocal(earthTopo, latDeg, lonDeg);
  const sun = moonFixedToLocal(sunTopo, latDeg, lonDeg);

  const earthDistanceKm = Math.hypot(earthTopo.x, earthTopo.y, earthTopo.z) * KM_PER_AU;
  const sunDistanceKm = Math.hypot(sunTopo.x, sunTopo.y, sunTopo.z) * KM_PER_AU;
  earth.distanceKm = earthDistanceKm;
  sun.distanceKm = sunDistanceKm;
  earth.angularDiameterDeg = 2 * Math.asin(Math.min(1, EARTH_RADIUS_KM / earthDistanceKm)) * RAD;
  sun.angularDiameterDeg = 2 * Math.asin(Math.min(1, SUN_RADIUS_KM / sunDistanceKm)) * RAD;

  const basis = [
    eqjToMoonFixed({x:1,y:0,z:0}, axis),
    eqjToMoonFixed({x:0,y:1,z:0}, axis),
    eqjToMoonFixed({x:0,y:0,z:1}, axis)
  ].map(v => moonFixedToLocal(v, latDeg, lonDeg).world);

  const starRotation = new THREE.Matrix4().makeBasis(basis[0], basis[1], basis[2]);
  const earthRotation = earthTextureRotation(date, axis, latDeg, lonDeg);

  return { date:new Date(date), axis, sun, earth, starRotation, earthRotation };
}

function circularTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  g.addColorStop(0,'rgba(255,255,245,1)');
  g.addColorStop(0.62,'rgba(255,245,205,1)');
  g.addColorStop(0.84,'rgba(255,220,120,.95)');
  g.addColorStop(1,'rgba(255,210,100,0)');
  x.fillStyle = g;
  x.fillRect(0,0,size,size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class LunarCelestialSystem {
  constructor({ scene, camera, sunLight, starGroup }) {
    this.scene = scene;
    this.camera = camera;
    this.sunLight = sunLight;
    this.starGroup = starGroup;
    this.date = new Date();
    this.playing = false;
    this.timeScale = 3600;
    this.lastUpdateMs = -Infinity;
    this.lastLat = NaN;
    this.lastLon = NaN;
    this.current = null;

    this.earthGroup = new THREE.Group();
    this.earthGroup.name = 'CELESTIAL_EARTH_GROUP';
    this.earthGroup.frustumCulled = false;

    const earthGeo = new THREE.SphereGeometry(1, 64, 32);
    const earthMat = new THREE.MeshStandardMaterial({
      color:0xffffff,
      roughness:1,
      metalness:0
    });
    this.earthMesh = new THREE.Mesh(earthGeo, earthMat);
    this.earthMesh.name = 'CELESTIAL_EARTH_SURFACE';
    this.earthMesh.frustumCulled = false;
    this.earthGroup.add(this.earthMesh);

    const cloudMat = new THREE.MeshStandardMaterial({
      color:0xffffff,
      roughness:1,
      metalness:0,
      transparent:true,
      opacity:0.95,
      alphaTest:0.015,
      depthWrite:false
    });
    this.earthCloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 32), cloudMat);
    this.earthCloudMesh.name = 'CELESTIAL_EARTH_CLOUDS';
    this.earthCloudMesh.frustumCulled = false;
    this.earthCloudMesh.renderOrder = 2;
    this.earthGroup.add(this.earthCloudMesh);
    scene.add(this.earthGroup);

    this.visualAssetsPromise = null;

    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map:circularTexture(),
      color:0xffffff,
      transparent:true,
      depthWrite:false,
      depthTest:true,
      toneMapped:false
    }));
    this.sunSprite.name = 'CELESTIAL_SUN_DISC';
    scene.add(this.sunSprite);
  }

  loadVisualAssets() {
    if (this.visualAssetsPromise) return this.visualAssetsPromise;

    const loader = new THREE.TextureLoader();
    const load = url => new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });

    this.visualAssetsPromise = Promise.all([
      load(appAssetUrl('textures/earth/earth_surface_nasa_2048.png')),
      load(appAssetUrl('textures/earth/earth_clouds_nasa_modis_2048.png'))
    ]).then(([surface, clouds]) => {
      surface.colorSpace = THREE.SRGBColorSpace;
      surface.anisotropy = 8;
      this.earthMesh.material.map = surface;
      this.earthMesh.material.needsUpdate = true;

      clouds.colorSpace = THREE.SRGBColorSpace;
      clouds.anisotropy = 8;
      this.earthCloudMesh.material.map = clouds;
      this.earthCloudMesh.material.needsUpdate = true;
      return true;
    }).catch(err => {
      this.visualAssetsPromise = null;
      throw err;
    });

    return this.visualAssetsPromise;
  }

  async loadStarCatalog(url = appAssetUrl('data/astronomy/hyg_bright_v41.json')) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Star catalog HTTP ${response.status}: ${url}`);
    const catalog = await response.json();
    const stars = Array.isArray(catalog.stars) ? catalog.stars : [];

    // Built-in PointsMaterial inherits Three.js logarithmic-depth support.
    // This keeps far stars visible while terrain still occludes stars below the horizon.
    const bins = [
      { max: 0.5, size: 3.2, opacity: 1.00 },
      { max: 1.5, size: 2.6, opacity: 0.98 },
      { max: 2.5, size: 2.1, opacity: 0.94 },
      { max: 3.5, size: 1.7, opacity: 0.88 },
      { max: 4.5, size: 1.35, opacity: 0.80 },
      { max: 5.5, size: 1.05, opacity: 0.68 },
      { max: 6.5, size: 0.82, opacity: 0.56 }
    ].map(def => ({ ...def, positions: [], colors: [] }));

    const radius = 60000;
    for (const star of stars) {
      const [x, y, z, mag, ci] = star;
      const bin = bins.find(b => mag <= b.max) || bins[bins.length - 1];
      bin.positions.push(x * radius, y * radius, z * radius);
      const c = bvToRgb(ci);
      bin.colors.push(c[0], c[1], c[2]);
    }

    for (const child of [...this.starGroup.children]) {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
      this.starGroup.remove(child);
    }

    this.starPointLayers = [];
    let total = 0;
    bins.forEach((bin, index) => {
      if (bin.positions.length === 0) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bin.positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(bin.colors, 3));
      geometry.computeBoundingSphere();

      const material = new THREE.PointsMaterial({
        size: bin.size,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: bin.opacity,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });

      const points = new THREE.Points(geometry, material);
      points.name = `REAL_STAR_CATALOG_${catalog.catalog || 'HYG'}_BIN_${index}`;
      points.frustumCulled = false;
      this.starGroup.add(points);
      this.starPointLayers.push(points);
      total += bin.positions.length / 3;
    });

    this.starCatalog = catalog;
    this.starVisibleCount = total;
    return catalog;
  }
  setDate(date) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    if (!Number.isFinite(d.getTime())) return false;
    this.date = d;
    this.lastUpdateMs = -Infinity;
    return true;
  }

  setPlaying(value) {
    this.playing = !!value;
  }

  setTimeScale(value) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) this.timeScale = n;
  }

  advanceRealSeconds(dt) {
    if (this.playing && dt > 0) {
      this.date = new Date(this.date.getTime() + dt * 1000 * this.timeScale);
    }
  }

  update(dt, { lat, lon, elevation = 0, targetPosition }) {
    this.advanceRealSeconds(dt);
    const now = performance.now();
    const moved = !Number.isFinite(this.lastLat) ||
      Math.abs(lat - this.lastLat) > 1e-5 ||
      Math.abs(lon - this.lastLon) > 1e-5;
    const timeChanged = now - this.lastUpdateMs > 100;

    if (moved || timeChanged) {
      this.current = computeLunarSky(this.date, lat, lon, elevation);
      this.lastLat = lat;
      this.lastLon = lon;
      this.lastUpdateMs = now;

      const sunDir = this.current.sun.world;
      this.sunLight.position.copy(targetPosition).addScaledVector(sunDir, 7000);
      this.sunLight.target.position.copy(targetPosition);
      this.sunLight.target.updateMatrixWorld();

      const earthDistance = 30000;
      const earthRadius = Math.tan(this.current.earth.angularDiameterDeg * DEG * 0.5) * earthDistance;
      this.earthGroup.position.copy(targetPosition).addScaledVector(this.current.earth.world, earthDistance);
      this.earthGroup.scale.setScalar(Math.max(1, earthRadius));
      this.earthGroup.quaternion.setFromRotationMatrix(this.current.earthRotation);

      const sunDistance = 40000;
      const sunDiameter = 2 * Math.tan(this.current.sun.angularDiameterDeg * DEG * 0.5) * sunDistance;
      this.sunSprite.position.copy(targetPosition).addScaledVector(this.current.sun.world, sunDistance);
      this.sunSprite.scale.setScalar(Math.max(20, sunDiameter));

      this.starGroup.quaternion.setFromRotationMatrix(this.current.starRotation);
    }

    // Stars stay centered on the camera while preserving their astronomical orientation.
    this.starGroup.position.copy(this.camera.position);

    return this.current;
  }

  dispose() {
    this.earthMesh.geometry.dispose();
    this.earthMesh.material.map?.dispose();
    this.earthMesh.material.dispose();
    this.earthCloudMesh.geometry.dispose();
    this.earthCloudMesh.material.map?.dispose();
    this.earthCloudMesh.material.dispose();
    for (const layer of this.starPointLayers || []) {
      layer.geometry?.dispose?.();
      layer.material?.dispose?.();
    }
    this.sunSprite.material.map?.dispose();
    this.sunSprite.material.dispose();
    this.scene.remove(this.earthGroup);
    this.scene.remove(this.sunSprite);
  }
}
