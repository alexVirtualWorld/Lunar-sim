import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const WHEEL_KEYS = [
  'FL',
  'FR',
  'ML',
  'MR',
  'RL',
  'RR'
];

const BONE_NAMES = {
  wheels: {
    FL: 'WHEEL_FL',
    FR: 'WHEEL_FR',
    ML: 'WHEEL_ML',
    MR: 'WHEEL_MR',
    RL: 'WHEEL_RL',
    RR: 'WHEEL_RR'
  },

  steer: {
    FL: 'STEER_FL',
    FR: 'STEER_FR'
  },

  suspension: {
    FL: 'SUSP_FL',
    FR: 'SUSP_FR',
    ML: 'SUSP_ML',
    MR: 'SUSP_MR',
    RL: 'SUSP_RL',
    RR: 'SUSP_RR'
  }
};

function materialsOf(o) {
  if (!o?.material) return [];
  return Array.isArray(o.material) ? o.material : [o.material];
}

export function prepareRoverMaterials(root, anisotropy = 8) {
  root.traverse(o => {
    if (!o.isMesh) return;

    o.castShadow = true;
    o.receiveShadow = true;

    for (const m of materialsOf(o)) {
      if (!m) continue;

      if (m.map) {
        m.map.anisotropy = anisotropy;
      }

      m.needsUpdate = true;
    }
  });
}

export function normalizeRoverVisual(root, config) {
  root.updateMatrixWorld(true);

  const sourceBox = new THREE.Box3().setFromObject(root);
  const size = sourceBox.getSize(new THREE.Vector3());

  const sourceLength = Math.max(size.x, size.z);

  if (!(sourceLength > 0)) {
    throw new Error('invalid rover bounds');
  }

  root.scale.multiplyScalar(
    config.roverTargetLength / sourceLength
  );

  root.rotation.y = THREE.MathUtils.degToRad(
    config.roverVisualYawDeg || 0
  );

  root.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());

  root.position.x -= center.x;
  root.position.z -= center.z;

  root.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(root);

  root.position.y -= box.min.y;

  root.updateMatrixWorld(true);

  return root;
}

export function createFallbackRover(
  color = 0xd9d4ca
) {
  const g = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.65,
    metalness: 0.22
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x171717,
    roughness: 0.95
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.85, 4.4),
    bodyMat
  );

  body.position.y = 1.35;
  body.castShadow = true;

  g.add(body);

  for (const x of [-1.55, 1.55]) {
    for (const z of [-1.55, 0, 1.55]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.68,
          0.68,
          0.46,
          20
        ),
        tireMat
      );

      wheel.rotation.z = Math.PI / 2;

      wheel.position.set(
        x,
        0.72,
        z
      );

      wheel.castShadow = true;

      g.add(wheel);
    }
  }

  return g;
}

export async function loadRoverTemplate(
  loader,
  config
) {
  const gltf = await loader.loadAsync(
    '/models/rover.glb'
  );

  const template = gltf.scene;

  normalizeRoverVisual(
    template,
    config
  );

  prepareRoverMaterials(
    template
  );

  return template;
}

export function cloneRoverTemplate(
  template
) {
  const root = skeletonClone(template);

  root.updateMatrixWorld(true);

  return root;
}

function axisVector(axisName) {
  switch (axisName) {
    case 'y':
      return new THREE.Vector3(0, 1, 0);

    case 'z':
      return new THREE.Vector3(0, 0, 1);

    case 'x':
    default:
      return new THREE.Vector3(1, 0, 0);
  }
}

function findRigNode(root, name) {
  let result = null;

  root.traverse(o => {
    if (result) return;
    if (o.name === name) result = o;
  });

  return result;
}

function createBoneEntry(
  root,
  name
) {
  const bone = findRigNode(
    root,
    name
  );

  if (!bone) {
    return null;
  }

  return {
    bone,

    basePosition:
      bone.position.clone(),

    baseQuaternion:
      bone.quaternion.clone()
  };
}

export class RoverWheelAnimator {
  constructor(
    visualRoot,
    config = {}
  ) {
    this.root = visualRoot;

    this.spinAxis = axisVector(
      config.wheelSpinAxis || 'y'
    );

    this.steerAxis = axisVector(
      config.wheelSteerAxis || 'y'
    );

    this.suspensionAxis =
      axisVector(
        config.wheelSuspensionAxis || 'y'
      );

    this.suspensionTravel =
      config.wheelVisualSuspensionTravel ??
      0.18;

    this.maxSteerRad =
      THREE.MathUtils.degToRad(
        config.wheelVisualMaxSteerDeg ??
        24
      );

    this.tmpQuaternion =
      new THREE.Quaternion();

    this.tmpVector =
      new THREE.Vector3();

    this.wheels = {};
    this.steer = {};
    this.suspension = {};

    for (const key of WHEEL_KEYS) {
      this.wheels[key] =
        createBoneEntry(
          visualRoot,
          BONE_NAMES.wheels[key]
        );

      this.suspension[key] =
        createBoneEntry(
          visualRoot,
          BONE_NAMES.suspension[key]
        );
    }

    this.steer.FL =
      createBoneEntry(
        visualRoot,
        BONE_NAMES.steer.FL
      );

    this.steer.FR =
      createBoneEntry(
        visualRoot,
        BONE_NAMES.steer.FR
      );

    this.logRigStatus();
  }

  logRigStatus() {
    const missing = [];

    for (const key of WHEEL_KEYS) {
      if (!this.wheels[key]) {
        missing.push(
          BONE_NAMES.wheels[key]
        );
      }

      if (!this.suspension[key]) {
        missing.push(
          BONE_NAMES.suspension[key]
        );
      }
    }

    if (!this.steer.FL) {
      missing.push(
        BONE_NAMES.steer.FL
      );
    }

    if (!this.steer.FR) {
      missing.push(
        BONE_NAMES.steer.FR
      );
    }

    if (missing.length) {
      console.warn(
        '[RoverRig] missing bones:',
        missing.join(', ')
      );
    } else {
      console.info(
        '[RoverRig] six-wheel rig detected successfully'
      );
    }
  }

  resetEntry(entry) {
    if (!entry) return;

    entry.bone.position.copy(
      entry.basePosition
    );

    entry.bone.quaternion.copy(
      entry.baseQuaternion
    );
  }

  applySuspension(
    key,
    value
  ) {
    const entry =
      this.suspension[key];

    if (!entry) return;

    entry.bone.position.copy(
      entry.basePosition
    );

    const normalized =
      THREE.MathUtils.clamp(
        Number.isFinite(value)
          ? value
          : 0,
        -1,
        1
      );

    /*
      Bone.position is stored in parent space.

      To move along the bone's LOCAL axis,
      transform the configured local axis
      by the bone's rest quaternion first.
    */

    this.tmpVector
      .copy(this.suspensionAxis)
      .applyQuaternion(
        entry.baseQuaternion
      )
      .multiplyScalar(
        normalized *
        this.suspensionTravel
      );

    entry.bone.position.add(
      this.tmpVector
    );
  }

  applySteering(
    steering
  ) {
    const angle =
      THREE.MathUtils.clamp(
        steering,
        -1,
        1
      ) *
      -this.maxSteerRad;

    for (const key of ['FL', 'FR']) {
      const entry =
        this.steer[key];

      if (!entry) continue;

      entry.bone.quaternion.copy(
        entry.baseQuaternion
      );

      this.tmpQuaternion
        .setFromAxisAngle(
          this.steerAxis,
          angle
        );

      /*
        Multiply after the rest quaternion,
        therefore rotation occurs in
        bone-local coordinates.
      */

      entry.bone.quaternion.multiply(
        this.tmpQuaternion
      );
    }
  }

  applyWheelSpin(
    wheelSpin
  ) {
    const spin =
      Number.isFinite(wheelSpin)
        ? wheelSpin
        : 0;

    for (const key of WHEEL_KEYS) {
      const entry =
        this.wheels[key];

      if (!entry) continue;

      entry.bone.quaternion.copy(
        entry.baseQuaternion
      );

      this.tmpQuaternion
        .setFromAxisAngle(
          this.spinAxis,
          spin
        );

      /*
        WHEEL_* bone local Y follows
        the physical axle.

        Therefore rotation around
        local Y produces wheel rolling,
        not horizontal steering.
      */

      entry.bone.quaternion.multiply(
        this.tmpQuaternion
      );
    }
  }

  apply({
    steering = 0,
    wheelSpin = 0,
    suspension = []
  } = {}) {
    /*
      Suspension array order:

      0 FL
      1 FR
      2 ML
      3 MR
      4 RL
      5 RR
    */

    for (
      let i = 0;
      i < WHEEL_KEYS.length;
      i++
    ) {
      const key =
        WHEEL_KEYS[i];

      this.applySuspension(
        key,
        suspension[i] ?? 0
      );
    }

    /*
      Important:

      Steering happens on STEER_* bones.

      Wheel rolling happens independently
      on child WHEEL_* bones.

      We no longer apply both rotations
      to the same node.
    */

    this.applySteering(
      steering
    );

    this.applyWheelSpin(
      wheelSpin
    );

    this.root.updateMatrixWorld(true);
  }
}
