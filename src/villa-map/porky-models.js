import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { createPorky } from "./assets.js";

export const PORKY_MODEL_VARIANTS = {
  "wild-piglet": {
    url: "/models/porkies/wild-piglet.glb",
    height: 1.05,
    fallbackScale: 0.62,
    rotationY: Math.PI
  },
  daigua: {
    url: "/models/porkies/daigua.glb",
    height: 1.22,
    fallbackScale: 0.72,
    rotationY: Math.PI
  },
  guadai: {
    url: "/models/porkies/guadai.glb",
    height: 1.18,
    fallbackScale: 0.7,
    rotationY: Math.PI
  },
  "big-ear-piglet": {
    url: "/models/porkies/big-ear-piglet.glb",
    height: 1.35,
    fallbackScale: 0.82,
    rotationY: Math.PI
  }
};

const loader = new GLTFLoader();
const modelCache = new Map();

export function createPorkyModel(materials, options = {}) {
  const variant = PORKY_MODEL_VARIANTS[options.variant] ?? PORKY_MODEL_VARIANTS["big-ear-piglet"];
  const group = new THREE.Group();
  const targetHeight = variant.height * (options.modelScale ?? 1);
  const fallback = createPorky(materials, {
    mic: options.mic,
    scale: options.fallbackScale ?? variant.fallbackScale ?? 0.72
  });

  fallback.name = "porky-procedural-fallback";
  group.add(fallback);

  loadModel(variant.url)
    .then((source) => {
      const model = source.clone(true);
      prepareModel(model, {
        height: targetHeight,
        rotationY: options.modelRotationY ?? variant.rotationY ?? 0
      });
      group.clear();
      group.add(model);

      if (options.mic) {
        group.add(createMicrophone(targetHeight));
      }
    })
    .catch(() => {
      group.userData.modelLoadFailed = true;
    });

  return group;
}

function loadModel(url) {
  if (!modelCache.has(url)) {
    modelCache.set(
      url,
      new Promise((resolve, reject) => {
        loader.load(
          url,
          (gltf) => resolve(gltf.scene),
          undefined,
          reject
        );
      })
    );
  }

  return modelCache.get(url);
}

function prepareModel(model, { height, rotationY }) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const scale = height / Math.max(size.y, 0.001);
  model.scale.setScalar(scale);
  model.rotation.y = rotationY;
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material?.map) {
        child.material.map.colorSpace = THREE.SRGBColorSpace;
      }
    }
  });
}

function createMicrophone(height) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: "#272026", roughness: 0.72 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, height * 0.46, 14), dark);
  const head = new THREE.Mesh(new THREE.SphereGeometry(height * 0.07, 16, 12), dark);

  handle.position.set(-height * 0.34, height * 0.43, -height * 0.45);
  handle.rotation.z = -0.2;
  head.position.set(-height * 0.4, height * 0.68, -height * 0.48);
  group.add(handle, head);
  return group;
}
