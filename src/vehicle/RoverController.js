import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createFallbackRover, loadRoverTemplate, RoverWheelAnimator } from './RoverVisual.js';

export class RoverController {
  constructor({ scene, terrain, floatingOrigin, config }) {
    this.scene = scene;
    this.terrain = terrain;
    this.origin = floatingOrigin;
    this.config = config;
    this.object = new THREE.Group();
    this.object.name = 'LOCAL_ROVER';
    scene.add(this.object);
    this.visual = null;
    this.east = 0;
    this.north = 0;
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.keys = new Set();
    this.virtualKeys = new Set();
    this.inputEnabled = true;
    this.ready = false;
    this.track = 2.8;
    this.wheelbase = 3.9;
    this.loader = new GLTFLoader();
    this.wheelAnimator = null;
    this.wheelSpin = 0;
    this.suspensionVisual = [0, 0, 0, 0, 0, 0];
    this.gravity = THREE.MathUtils.clamp(config.gravity ?? 1.62, 0, config.gravityMax ?? 274.8);
    this.verticalVelocity = 0;
    this.bodyY = null;
    this.lastGroundY = null;
    this.grounded = true;
    this.headlightsOn = false;
    this.headlights = [];
    this.setupHeadlights();
    addEventListener('keydown', e => {
      if (this.inputEnabled && !e.target.closest?.('input, textarea, select')) this.keys.add(e.code);
    });
    addEventListener('blur', () => this.clearInputs());
    addEventListener('keyup', e => this.keys.delete(e.code));
  }

  setupHeadlights() {
    const make = x => {
      const light = new THREE.SpotLight(0xf4f8ff, 6500, 180, THREE.MathUtils.degToRad(18), 0.42, 1.4);
      light.position.set(x, 1.05, -1.85);
      light.visible = false;
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      light.shadow.bias = -0.00015;
      light.shadow.normalBias = 0.035;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = 180;
      const target = new THREE.Object3D();
      target.position.set(x * 0.45, 0.15, -80);
      this.object.add(target);
      light.target = target;
      this.object.add(light);
      this.headlights.push(light);
      return light;
    };
    make(-0.88);
    make(0.88);
  }

  setHeadlights(value) {
    this.headlightsOn = !!value;
    for (const light of this.headlights) light.visible = this.headlightsOn;
    return this.headlightsOn;
  }

  toggleHeadlights() {
    return this.setHeadlights(!this.headlightsOn);
  }

  setVirtualKey(code, pressed) {
    if (!code) return;
    if (pressed) this.virtualKeys.add(code);
    else this.virtualKeys.delete(code);
  }

  clearVirtualInputs() {
    this.virtualKeys.clear();
  }

  clearInputs() {
    this.keys.clear();
    this.virtualKeys.clear();
  }

  hasInput(code) {
    return this.keys.has(code) || this.virtualKeys.has(code);
  }

  async load() {
    try {
      this.visual = await loadRoverTemplate(this.loader, this.config);
      this.object.add(this.visual);
    } catch (err) {
      console.warn('[Rover] using fallback:', err);
      this.visual = createFallbackRover();
      this.object.add(this.visual);
    }
    this.wheelAnimator = new RoverWheelAnimator(this.visual, this.config);
    this.ready = true;
  }

  async reset({ east = 0, north = 0, headingDeg = 0 } = {}) {
    this.east = east; this.north = north;
    this.heading = THREE.MathUtils.degToRad(headingDeg);
    this.speed = 0; this.steer = 0;
    this.wheelSpin = 0;
    this.suspensionVisual.fill(0);
    this.verticalVelocity = 0;
    this.bodyY = null;
    this.lastGroundY = null;
    this.grounded = true;
    await this.terrain.preloadGround(east, north);
    this.updateTransform(1 / 60, true);
  }

  setGravity(value) {
    const max = this.config.gravityMax ?? 274.8;
    const n = Number(value);
    this.gravity = THREE.MathUtils.clamp(Number.isFinite(n) ? n : (this.config.gravity ?? 1.62), 0, max);
    this.config.gravity = this.gravity;
    return this.gravity;
  }

  localOffset(rightM, forwardM) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    return {
      east: this.east + rightM * c + forwardM * s,
      north: this.north - rightM * s + forwardM * c
    };
  }

  groundAt(rightM, forwardM) {
    const p = this.localOffset(rightM, forwardM);

    // Follow only the CURRENT wanted render surface. Retiring LOD tiles can
    // remain visible briefly, but they must never drive rover ground height.
    // The terrain sampler handles the short async handoff between LODs.
    const rendered = this.terrain.sampleRenderedLocalHeight?.(p.east, p.north);
    const h = rendered ?? this.terrain.sampleLocalHeight(p.east, p.north);

    return { ...p, h };
  }

  updateTransform(dt, hard = false) {
    if (!this.ready) return;
    const halfTrack = this.track / 2;
    const halfBase = this.wheelbase / 2;
    const L = this.groundAt(-halfTrack, 0), R = this.groundAt(halfTrack, 0);
    const F = this.groundAt(0, halfBase), B = this.groundAt(0, -halfBase);
    const C = this.groundAt(0, 0);
    if ([L,R,F,B,C].some(p => p.h == null)) return;

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
    const zAxis = forwardOnPlane.clone().negate();
    const basis = new THREE.Matrix4().makeBasis(rightOnPlane, normal, zAxis);
    const targetQ = new THREE.Quaternion().setFromRotationMatrix(basis);

    const groundY = C.h + this.config.bodyClearance;
    if (this.bodyY == null || !Number.isFinite(this.bodyY)) {
      this.bodyY = groundY;
      this.lastGroundY = groundY;
      this.verticalVelocity = 0;
      this.grounded = true;
    } else if (!hard) {
      const g = Math.max(0, this.gravity);
      const previousGround = this.lastGroundY ?? groundY;
      const groundVerticalSpeed = (groundY - previousGround) / Math.max(1e-4, dt);

      if (this.grounded) {
        const ballisticY = this.bodyY + this.verticalVelocity * dt - 0.5 * g * dt * dt;
        const releaseTolerance = this.config.groundReleaseTolerance ?? 0.08;
        if (ballisticY > groundY + releaseTolerance) {
          this.grounded = false;
          this.verticalVelocity -= g * dt;
          this.bodyY += this.verticalVelocity * dt;
        } else {
          this.bodyY = groundY;
          const maxLaunch = this.config.maxGroundVerticalSpeed ?? 80;
          this.verticalVelocity = THREE.MathUtils.clamp(groundVerticalSpeed, -maxLaunch, maxLaunch);
        }
      } else {
        this.verticalVelocity -= g * dt;
        this.bodyY += this.verticalVelocity * dt;
        if (this.bodyY <= groundY) {
          this.bodyY = groundY;
          this.grounded = true;
          const maxLaunch = this.config.maxGroundVerticalSpeed ?? 80;
          this.verticalVelocity = THREE.MathUtils.clamp(groundVerticalSpeed, -maxLaunch, maxLaunch);
        }
      }
      this.lastGroundY = groundY;
    }

    const targetPos = new THREE.Vector3(
      this.east - this.origin.east,
      this.bodyY,
      -(this.north - this.origin.north)
    );
    if (hard) {
      this.object.position.copy(targetPos);
      if (this.grounded) this.object.quaternion.copy(targetQ);
    } else {
      const a = 1 - Math.exp(-16 * dt);
      this.object.position.x = THREE.MathUtils.lerp(this.object.position.x, targetPos.x, a);
      this.object.position.z = THREE.MathUtils.lerp(this.object.position.z, targetPos.z, a);
      this.object.position.y = this.bodyY;
      if (this.grounded) this.object.quaternion.slerp(targetQ, 1 - Math.exp(-10 * dt));
    }
  }

  updateWheelVisualState(dt) {
    const wheelRadius = this.config.wheelRadius || 0.68;
    this.wheelSpin += (this.speed / Math.max(0.05, wheelRadius)) * dt;
    // Keep the angle bounded so long sessions do not lose floating-point precision.
    this.wheelSpin = THREE.MathUtils.euclideanModulo(this.wheelSpin + Math.PI, Math.PI * 2) - Math.PI;

    if (!this.grounded) {
      for (let i = 0; i < this.suspensionVisual.length; i++) {
        this.suspensionVisual[i] = THREE.MathUtils.damp(this.suspensionVisual[i], -1, 8, dt);
      }
      this.wheelAnimator?.apply({
        steering: this.steer,
        wheelSpin: this.wheelSpin,
        suspension: this.suspensionVisual
      });
      return;
    }

    const halfTrack = this.track / 2;
    const halfBase = this.wheelbase / 2;
    const C = this.groundAt(0, 0);
    const L = this.groundAt(-halfTrack, 0), R = this.groundAt(halfTrack, 0);
    const F = this.groundAt(0, halfBase), B = this.groundAt(0, -halfBase);
    if ([C,L,R,F,B].some(p => p.h == null)) return;
    const gradRight = (R.h - L.h) / Math.max(0.01, this.track);
    const gradForward = (F.h - B.h) / Math.max(0.01, this.wheelbase);
    const positions = [
      [-halfTrack, halfBase], [-halfTrack, 0], [-halfTrack, -halfBase],
      [ halfTrack, halfBase], [ halfTrack, 0], [ halfTrack, -halfBase]
    ];
    const scale = this.config.wheelSuspensionSampleRange || 0.32;
    for (let i = 0; i < positions.length; i++) {
      const [rightM, forwardM] = positions[i];
      const W = this.groundAt(rightM, forwardM);
      if (W.h == null) { this.suspensionVisual[i] = 0; continue; }
      const planeH = C.h + gradRight * rightM + gradForward * forwardM;
      this.suspensionVisual[i] = THREE.MathUtils.clamp((W.h - planeH) / scale, -1, 1);
    }
    this.wheelAnimator?.apply({
      steering: this.steer,
      wheelSpin: this.wheelSpin,
      suspension: this.suspensionVisual
    });
  }

  getNetworkVisualState() {
    const center = this.groundAt(0, 0);
    const groundY = center.h == null ? null : center.h + this.config.bodyClearance;
    const airHeight = groundY == null || this.bodyY == null ? 0 : Math.max(0, this.bodyY - groundY);
    return {
      steering: this.steer,
      wheelSpin: this.wheelSpin,
      suspension: [...this.suspensionVisual],
      airborne: !this.grounded,
      verticalVelocity: this.verticalVelocity,
      airHeight
    };
  }

  update(dt) {
    if (!this.ready) return;
    // Photo Mode disables new driving input while physics must keep advancing.
    const acceptInput = this.inputEnabled;
    const throttle = acceptInput ? (this.hasInput('KeyW') ? 1 : 0) - (this.hasInput('KeyS') ? 1 : 0) : 0;
    const steerInput = acceptInput ? (this.hasInput('KeyD') ? 1 : 0) - (this.hasInput('KeyA') ? 1 : 0) : 0;
    const handbrake = acceptInput && (this.hasInput('ShiftLeft') || this.hasInput('ShiftRight'));

    if (this.grounded) {
      if (throttle !== 0) this.speed += throttle * (throttle > 0 ? this.config.accel : this.config.brake) * dt;
      else this.speed *= Math.exp(-1.05 * dt);
      if (handbrake) this.speed *= Math.exp(-2.7 * dt);
      this.steer = THREE.MathUtils.damp(this.steer, steerInput, 7, dt);

      const steerScale = 0.22 + Math.min(1, Math.abs(this.speed) / 5);
      this.heading += this.steer * this.config.steerRate * steerScale * Math.sign(this.speed || 1) * dt;
    } else {
      this.steer = THREE.MathUtils.damp(this.steer, 0, 4, dt);
    }
    this.speed = THREE.MathUtils.clamp(this.speed, -this.config.reverseMax, this.config.maxSpeed);
    const travel = this.speed * dt;
    const nextEast = this.east + Math.sin(this.heading) * travel;
    const nextNorth = this.north + Math.cos(this.heading) * travel;
    const limit = this.terrain.isGlobal ? Infinity : (this.terrain.manifest ? this.terrain.manifest.extentMeters * 0.5 - 800 : Infinity);
    if (Math.abs(nextEast) <= limit && Math.abs(nextNorth) <= limit) {
      // Never drive into an uncovered polar region or an unavailable DEM sample.
      const footprint = [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]];
      if (footprint.every(([e, n]) => this.terrain.sampleLocalHeight(nextEast + e, nextNorth + n) != null)) {
        this.east = nextEast;
        this.north = nextNorth;
      } else {
        this.speed = 0;
        this.terrain.preloadGround(nextEast, nextNorth).catch(() => {});
      }
    } else {
      this.speed *= 0.2;
    }
    this.updateTransform(dt, false);
    this.updateWheelVisualState(dt);
  }

  get elevation() {
    return this.terrain.sampleElevation(this.east, this.north) ?? 0;
  }
}
