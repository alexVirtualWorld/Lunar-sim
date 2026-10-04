import * as THREE from 'three';

export class RoverCamera {
  constructor(camera, renderer, rover, terrain, config) {
    this.camera = camera;
    this.renderer = renderer;
    this.rover = rover;
    this.terrain = terrain;
    this.config = config;

    this.yaw = 0;
    this.defaultPitch = -0.20;
    this.recenterActive = false;
    // Positive pitch looks upward; negative pitch looks downward.
    this.pitch = this.defaultPitch;
    this.minPitch = THREE.MathUtils.degToRad(-80);
    this.maxPitch = THREE.MathUtils.degToRad(85);

    this.enabled = true;
    this.drag = false;
    this.lastX = 0;
    this.lastY = 0;

    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.viewDir = new THREE.Vector3(0, 0, -1);
    this.initialized = false;

    this.groundStates = {
      desired: { floor: null, x: 0, z: 0 },
      actual: { floor: null, x: 0, z: 0 }
    };

    const el = renderer.domElement;
    el.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      this.drag = true;
      this.recenterActive = false;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', e => {
      if (!this.enabled || !this.drag) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;

      this.yaw -= dx * 0.004;
      // Keep yaw numerically bounded without changing the represented angle.
      this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - dy * 0.003,
        this.minPitch,
        this.maxPitch
      );

      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });

    el.addEventListener('pointerup', () => { this.drag = false; });
    el.addEventListener('pointercancel', () => { this.drag = false; });
  }

  snap() {
    this.initialized = false;
    this.update(1 / 60);
  }

  recenter({ immediate = false } = {}) {
    if (immediate) {
      this.yaw = 0;
      this.pitch = this.defaultPitch;
      this.recenterActive = false;
      return;
    }
    this.recenterActive = true;
  }

  rebase(deltaEast, deltaNorth) {
    const dx = -deltaEast;
    const dz = deltaNorth;

    this.pos.x += dx;
    this.pos.z += dz;
    this.look.x += dx;
    this.look.z += dz;
    this.camera.position.x += dx;
    this.camera.position.z += dz;

    for (const state of Object.values(this.groundStates)) {
      if (Number.isFinite(state.x)) state.x += dx;
      if (Number.isFinite(state.z)) state.z += dz;
    }
  }

  groundAtWorld(x, z) {
    const origin = this.terrain.origin;
    const east = x + origin.east;
    const north = origin.north - z;

    const meshes = this.terrain.group.children.filter(
      mesh => mesh.isMesh && mesh.visible
    );

    let rayTop = -Infinity;
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      const geometry = mesh.geometry;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const sphere = geometry.boundingSphere
        .clone()
        .applyMatrix4(mesh.matrixWorld);
      rayTop = Math.max(rayTop, sphere.center.y + sphere.radius);
    }

    if (Number.isFinite(rayTop)) {
      this.groundRay ||= new THREE.Raycaster();
      this.groundRay.set(
        new THREE.Vector3(x, rayTop + 10, z),
        new THREE.Vector3(0, -1, 0)
      );
      this.groundRay.near = 0;
      this.groundRay.far = Infinity;

      const hit = this.groundRay.intersectObjects(meshes, false)[0];
      if (hit) return hit.point.y;
    }

    const height = this.terrain.sampleLocalHeight(east, north);
    if (Number.isFinite(height)) return height;

    const now = performance.now();
    if (!this.groundRequest && now >= (this.nextGroundRequestAt || 0)) {
      this.nextGroundRequestAt = now + 250;
      this.groundRequest = this.terrain.ensureSample(east, north)
        .catch(() => null)
        .finally(() => {
          this.groundRequest = null;
        });
    }

    return null;
  }

  stabilizedGroundFloor(rawFloor, x, z, dt, key) {
    const state = this.groundStates[key];
    const moved = Math.hypot(x - state.x, z - state.z);

    if (!Number.isFinite(state.floor) || moved > 8) {
      state.floor = rawFloor;
    } else {
      const delta = rawFloor - state.floor;

      // Rise immediately enough to avoid clipping into an uphill surface.
      if (delta > 0.05) {
        state.floor = THREE.MathUtils.damp(state.floor, rawFloor, 22, dt);
      // Descend more slowly and with a deadband, which prevents tiny triangle
      // height differences from producing visible vertical camera vibration.
      } else if (delta < -0.14) {
        state.floor = THREE.MathUtils.damp(state.floor, rawFloor, 5, dt);
      }
    }

    state.x = x;
    state.z = z;
    return state.floor;
  }

  liftAboveGround(position, clearance, dt, key) {
    const ground = this.groundAtWorld(position.x, position.z);
    if (ground == null) return false;

    const rawFloor = ground + clearance;
    const floor = this.stabilizedGroundFloor(
      rawFloor,
      position.x,
      position.z,
      dt,
      key
    );

    // Small deadband prevents one-pixel bobbing while still preventing
    // meaningful terrain penetration.
    if (position.y < floor - 0.025) position.y = floor;
    return true;
  }

  protectNearPlane(clearance) {
    const camera = this.camera;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const center = new THREE.Vector3();
    const point = new THREE.Vector3();

    camera.position.copy(this.pos);
    camera.lookAt(this.look);
    camera.updateMatrixWorld(true);

    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    forward.setFromMatrixColumn(camera.matrixWorld, 2).negate();

    const halfHeight =
      camera.near *
      Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) /
      camera.zoom;
    const halfWidth = halfHeight * camera.aspect;
    center.copy(this.pos).addScaledVector(forward, camera.near);

    let lift = 0;
    for (const sx of [-1, 0, 1]) {
      for (const sy of [-1, 0, 1]) {
        point.copy(center)
          .addScaledVector(right, sx * halfWidth)
          .addScaledVector(up, sy * halfHeight);

        const ground = this.groundAtWorld(point.x, point.z);
        if (ground == null) return false;
        lift = Math.max(lift, ground + clearance - point.y);
      }
    }

    // Ignore sub-centimeter/very small corrections that otherwise alternate
    // every frame on dense triangle boundaries.
    if (lift > 0.05) {
      this.pos.y += lift;
      this.look.y += lift;
    }

    return true;
  }

  computeDesiredView(root, baseForward) {
    const up = new THREE.Vector3(0, 1, 0);

    const yawRotation = new THREE.Quaternion()
      .setFromAxisAngle(up, this.yaw);

    const horizontalForward = baseForward.clone()
      .applyQuaternion(yawRotation)
      .projectOnPlane(up)
      .normalize();

    const back = horizontalForward.clone().negate();

    const desiredPosition = root.position.clone()
      .addScaledVector(back, this.config.distance)
      .addScaledVector(up, this.config.height);

    const right = horizontalForward.clone().cross(up).normalize();
    const desiredViewDir = horizontalForward.clone()
      .applyAxisAngle(right, this.pitch)
      .normalize();

    return { desiredPosition, desiredViewDir };
  }

  update(dt) {
    if (!this.rover.ready || !this.terrain.manifest) return;

    dt = THREE.MathUtils.clamp(dt, 0, 0.05);

    if (this.recenterActive) {
      this.yaw = THREE.MathUtils.damp(this.yaw, 0, 7.5, dt);
      this.pitch = THREE.MathUtils.damp(this.pitch, this.defaultPitch, 7.5, dt);
      if (Math.abs(this.yaw) < 0.002 && Math.abs(this.pitch - this.defaultPitch) < 0.002) {
        this.yaw = 0;
        this.pitch = this.defaultPitch;
        this.recenterActive = false;
      }
    }

    const camera = this.camera;
    const root = this.rover.object;
    const up = new THREE.Vector3(0, 1, 0);
    const clearance = Math.max(
      0.5,
      this.config.collisionClearance ?? 0.5
    );

    const previousPosition = camera.position.clone();
    const previousQuaternion = camera.quaternion.clone();
    const previousLook = this.look.clone();
    const previousViewDir = this.viewDir.clone();

    const baseForward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(root.quaternion)
      .projectOnPlane(up);

    if (baseForward.lengthSq() < 1e-8) {
      baseForward.set(0, 0, -1);
    } else {
      baseForward.normalize();
    }

    const { desiredPosition, desiredViewDir } =
      this.computeDesiredView(root, baseForward);

    if (!this.liftAboveGround(
      desiredPosition,
      clearance,
      dt,
      'desired'
    )) {
      desiredPosition.copy(root.position)
        .addScaledVector(up, Math.max(3, this.config.height));

      if (!this.liftAboveGround(
        desiredPosition,
        clearance,
        dt,
        'desired'
      )) {
        this.initialized = false;
        return;
      }
    }

    if (!this.initialized) {
      this.pos.copy(desiredPosition);
      this.viewDir.copy(desiredViewDir);
    } else {
      this.pos.lerp(
        desiredPosition,
        1 - Math.exp(-6 * dt)
      );

      // Smooth orientation as a direction, not as an absolute world-space
      // look target. This avoids the half-orbit "snap" when the camera passes
      // around the front side of an airborne rover.
      const turn = new THREE.Quaternion()
        .setFromUnitVectors(this.viewDir, desiredViewDir);
      const incremental = new THREE.Quaternion()
        .identity()
        .slerp(turn, 1 - Math.exp(-12 * dt));
      this.viewDir.applyQuaternion(incremental).normalize();
    }

    if (!this.liftAboveGround(
      this.pos,
      clearance,
      dt,
      'actual'
    )) {
      this.pos.copy(desiredPosition);
    }

    // Keep pitch below the lookAt singularity so world-up never flips when
    // looking almost straight overhead.
    const safeVertical = Math.abs(this.viewDir.dot(up)) < 0.9995;
    if (!safeVertical) {
      this.viewDir.y = THREE.MathUtils.clamp(
        this.viewDir.y,
        -Math.sin(this.maxPitch),
        Math.sin(this.maxPitch)
      );
      this.viewDir.normalize();
    }

    const lookDistance = Math.max(
      20,
      this.config.distance + (this.config.lookAhead ?? 0)
    );
    this.look.copy(this.pos)
      .addScaledVector(this.viewDir, lookDistance);

    camera.up.set(0, 1, 0);
    camera.fov = THREE.MathUtils.damp(
      camera.fov,
      56 + Math.min(9, Math.abs(this.rover.speed) * 0.45),
      4,
      dt
    );
    camera.updateProjectionMatrix();

    if (!this.protectNearPlane(clearance)) {
      camera.position.copy(previousPosition);
      camera.quaternion.copy(previousQuaternion);
      this.pos.copy(previousPosition);
      this.look.copy(previousLook);
      this.viewDir.copy(previousViewDir);
      this.initialized = false;
      return;
    }

    camera.position.copy(this.pos);
    camera.lookAt(this.look);
    camera.updateMatrixWorld(true);
    this.initialized = true;
  }
}
