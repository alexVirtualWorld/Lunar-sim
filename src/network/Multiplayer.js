import * as THREE from 'three';
import { t } from '../i18n.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { io } from 'socket.io-client';
import { geodeticOffsetMeters, curvatureSag } from '../geo/LunarCoordinates.js';
import {
  createFallbackRover,
  loadRoverTemplate,
  cloneRoverTemplate,
  RoverWheelAnimator
} from '../vehicle/RoverVisual.js';

const UP = new THREE.Vector3(0, 1, 0);

function lerpAngle(a, b, t) {
  let d = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function lerpLon(a, b, t) {
  let d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

function mixArray(a = [], b = [], t = 0) {
  const n = Math.max(a.length, b.length, 6);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const av = Number.isFinite(a[i]) ? a[i] : 0;
    const bv = Number.isFinite(b[i]) ? b[i] : av;
    out[i] = THREE.MathUtils.lerp(av, bv, t);
  }
  return out;
}

function interpolateState(a, b, t) {
  if (!b || a === b) return { ...a, suspension: [...(a.suspension || [])] };
  return {
    ...b,
    siteId: b.siteId,
    lat: THREE.MathUtils.lerp(a.lat, b.lat, t),
    lon: lerpLon(a.lon, b.lon, t),
    elevation: THREE.MathUtils.lerp(a.elevation || 0, b.elevation || 0, t),
    airHeight: THREE.MathUtils.lerp(a.airHeight || 0, b.airHeight || 0, t),
    verticalVelocity: THREE.MathUtils.lerp(a.verticalVelocity || 0, b.verticalVelocity || 0, t),
    heading: lerpAngle(a.heading || 0, b.heading || 0, t),
    speed: THREE.MathUtils.lerp(a.speed || 0, b.speed || 0, t),
    steering: THREE.MathUtils.lerp(a.steering || 0, b.steering || 0, t),
    wheelSpin: lerpAngle(a.wheelSpin || 0, b.wheelSpin || 0, t),
    suspension: mixArray(a.suspension, b.suspension, t)
  };
}

export class Multiplayer {
  constructor({ scene, terrain, floatingOrigin, rover, playersLabel, config }) {
    this.scene = scene;
    this.terrain = terrain;
    this.origin = floatingOrigin;
    this.rover = rover;
    this.playersLabel = playersLabel;
    this.config = config;
    this.networkConfig = config.network || {};
    this.peers = new Map();
    this.suspended = false;
    this.loader = new GLTFLoader();
    this.roverTemplatePromise = loadRoverTemplate(this.loader, this.config).catch(err => {
      console.warn('[Multiplayer] remote rover.glb failed, using fallback:', err);
      return null;
    });

    const url = location.port === '5173' ? `${location.protocol}//${location.hostname}:3000` : location.origin;
    this.socket = io(import.meta.env.VITE_SERVER_URL || url, {
      transports: ['polling','websocket'], reconnection: true, reconnectionDelay: 1000, timeout: 4000
    });
    this.population = null;
    this.refreshPlayersLabel = () => {
      playersLabel.textContent = this.socket.connected
        ? (this.population == null ? t('network.online') : t('network.pilots', { count: this.population }))
        : t('network.offline');
    };
    this.socket.on('connect', this.refreshPlayersLabel);
    this.socket.on('disconnect', () => { this.population = null; this.refreshPlayersLabel(); });
    this.socket.on('connect_error', this.refreshPlayersLabel);
    this.socket.on('population', n => { this.population = n; this.refreshPlayersLabel(); });
    window.addEventListener('lunar-language-changed', this.refreshPlayersLabel);
    this.socket.on('roster', list => list.forEach(s => this.applyPeer(s)));
    this.socket.on('peer-state', s => this.applyPeer(s));
    this.socket.on('peer-left', id => this.removePeer(id));
    this.timer = setInterval(() => this.sendState(), 50);
  }

  sendState() {
    if (this.suspended || !this.socket.connected || !this.terrain.manifest) return;
    const geo = this.terrain.geoAt(this.rover.east, this.rover.north);
    if (!geo) return;
    this.socket.emit('state', {
      siteId: this.terrain.loader.regionId,
      lat: geo.lat,
      lon: geo.lon,
      elevation: this.rover.elevation,
      heading: this.rover.heading,
      speed: this.rover.speed,
      ...this.rover.getNetworkVisualState()
    });
  }

  createPeer(id) {
    const root = new THREE.Group();
    root.name = `REMOTE_ROVER_${id}`;
    root.visible = false;
    this.scene.add(root);
    const peer = { id, root, visual: null, animator: null, samples: [], removed: false };
    this.peers.set(id, peer);
    this.attachPeerVisual(peer);
    return peer;
  }

  async attachPeerVisual(peer) {
    const template = await this.roverTemplatePromise;
    if (peer.removed || !this.peers.has(peer.id)) return;
    const visual = template ? cloneRoverTemplate(template) : createFallbackRover(0xb7c7d8);
    peer.root.add(visual);
    peer.visual = visual;
    peer.animator = new RoverWheelAnimator(visual, this.config);
  }

  applyPeer(s) {
    if (!s?.id || s.id === this.socket.id) return;
    const peer = this.peers.get(s.id) || this.createPeer(s.id);
    const now = performance.now();
    peer.samples.push({ t: now, state: { ...s, suspension: Array.isArray(s.suspension) ? [...s.suspension] : [] } });
    const maxSamples = this.networkConfig.maxPeerSamples || 20;
    if (peer.samples.length > maxSamples) peer.samples.splice(0, peer.samples.length - maxSamples);
  }

  removePeer(id) {
    const p = this.peers.get(id); if (!p) return;
    p.removed = true;
    this.scene.remove(p.root);
    this.peers.delete(id);
  }

  bufferedState(peer, now) {
    const siteId = this.terrain.loader.regionId;
    const samples = peer.samples.filter(x => x.state.siteId === siteId);
    if (!samples.length) return null;
    const renderTime = now - (this.networkConfig.interpolationMs || 120);

    // Trim samples that are much older than the interpolation window while retaining
    // one preceding sample for interpolation continuity.
    while (peer.samples.length > 2 && peer.samples[1].t < renderTime - 500) peer.samples.shift();

    if (renderTime <= samples[0].t) return samples[0].state;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].t >= renderTime) {
        const a = samples[i - 1], b = samples[i];
        const span = Math.max(1, b.t - a.t);
        return interpolateState(a.state, b.state, THREE.MathUtils.clamp((renderTime - a.t) / span, 0, 1));
      }
    }
    // No extrapolation by default: holding the latest authoritative sample is much
    // less visually destructive than shooting a rover through terrain on a packet gap.
    return samples[samples.length - 1].state;
  }

  localOffset(east, north, heading, rightM, forwardM) {
    const s = Math.sin(heading), c = Math.cos(heading);
    return {
      east: east + rightM * c + forwardM * s,
      north: north - rightM * s + forwardM * c
    };
  }

  groundAt(east, north, heading, rightM, forwardM) {
    const p = this.localOffset(east, north, heading, rightM, forwardM);
    return { ...p, h: this.terrain.sampleLocalHeight(p.east, p.north) };
  }

  applyRemoteTransform(peer, state) {
    const manifest = this.terrain.manifest;
    const en = geodeticOffsetMeters(manifest.center.lat, manifest.center.lon, state.lat, state.lon);
    const halfTrack = this.rover.track / 2;
    const halfBase = this.rover.wheelbase / 2;
    const L = this.groundAt(en.east, en.north, state.heading || 0, -halfTrack, 0);
    const R = this.groundAt(en.east, en.north, state.heading || 0,  halfTrack, 0);
    const F = this.groundAt(en.east, en.north, state.heading || 0, 0,  halfBase);
    const B = this.groundAt(en.east, en.north, state.heading || 0, 0, -halfBase);
    const C = this.groundAt(en.east, en.north, state.heading || 0, 0, 0);

    const fallbackY = (state.elevation - manifest.datumHeight)
      + curvatureSag(en.east, en.north)
      + this.config.bodyClearance;
    let y = C.h == null ? fallbackY : C.h + this.config.bodyClearance;
    y += Math.max(0, state.airHeight || 0);
    let q = new THREE.Quaternion().setFromAxisAngle(UP, state.heading || 0);

    if (![L,R,F,B].some(p => p.h == null)) {
      const toWorld = p => new THREE.Vector3(
        p.east - this.origin.east,
        p.h,
        -(p.north - this.origin.north)
      );
      const pL = toWorld(L), pR = toWorld(R), pF = toWorld(F), pB = toWorld(B);
      const rightVec = pR.clone().sub(pL).normalize();
      const forwardVec = pF.clone().sub(pB).normalize();
      const normal = rightVec.clone().cross(forwardVec).normalize();
      if (normal.y < 0) normal.negate();
      const forwardOnPlane = forwardVec.clone().projectOnPlane(normal).normalize();
      const rightOnPlane = new THREE.Vector3().crossVectors(forwardOnPlane, normal).normalize();
      const basis = new THREE.Matrix4().makeBasis(rightOnPlane, normal, forwardOnPlane.clone().negate());
      q = new THREE.Quaternion().setFromRotationMatrix(basis);
    }

    peer.root.position.set(
      en.east - this.origin.east,
      y,
      -(en.north - this.origin.north)
    );
    peer.root.quaternion.copy(q);
    peer.animator?.apply({
      steering: state.steering || 0,
      wheelSpin: state.wheelSpin || 0,
      suspension: state.suspension || []
    });
  }

  update() {
    if (!this.terrain.manifest) return;
    const now = performance.now();
    for (const peer of this.peers.values()) {
      const state = this.bufferedState(peer, now);
      peer.root.visible = !!state;
      if (!state) continue;
      this.applyRemoteTransform(peer, state);
    }
  }
}
