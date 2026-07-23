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
  },
  // Meshy AI residents. Their exported fronts point toward local +Z, unlike
  // the four original variants above, so they intentionally need no internal
  // half-turn. Per-placement rotationY can then describe the visible heading
  // directly. Heights include each model's authored prop/base (bath, car,
  // sleeping bag, etc.), keeping the wider vignette models room-sized.
  "cozy-checker-piglet": {
    url: "/models/porkies/cozy-checker-piglet.glb",
    height: 1.15,
    fallbackScale: 0.64,
    rotationY: 0
  },
  "muddy-piglet": {
    url: "/models/porkies/muddy-piglet.glb",
    height: 0.95,
    fallbackScale: 0.56,
    rotationY: 0
  },
  "muscle-pig": {
    url: "/models/porkies/muscle-pig.glb",
    height: 1.35,
    fallbackScale: 0.72,
    rotationY: 0
  },
  "pampered-piglet": {
    url: "/models/porkies/pampered-piglet.glb",
    height: 0.95,
    fallbackScale: 0.56,
    rotationY: 0
  },
  "bbq-feast-pig": {
    url: "/models/porkies/bbq-feast-pig.glb",
    height: 0.95,
    fallbackScale: 0.56,
    rotationY: 0
  },
  "cleaning-day-piglet": {
    url: "/models/porkies/cleaning-day-piglet.glb",
    height: 1.25,
    fallbackScale: 0.68,
    rotationY: 0
  },
  "pop-star-pig": {
    url: "/models/porkies/pop-star-pig.glb",
    height: 1.25,
    fallbackScale: 0.68,
    rotationY: 0
  },
  "sleepy-piglet": {
    url: "/models/porkies/sleepy-piglet.glb",
    height: 0.9,
    fallbackScale: 0.54,
    rotationY: 0
  },
  "smoky-city-swine": {
    url: "/models/porkies/smoky-city-swine.glb",
    height: 1.25,
    fallbackScale: 0.68,
    rotationY: 0
  },
  "enchanted-librarian-pig": {
    url: "/models/porkies/enchanted-librarian-pig.glb",
    height: 1.15,
    fallbackScale: 0.64,
    rotationY: 0
  },
  "watermelon-hat-pig": {
    url: "/models/porkies/watermelon-hat-pig.glb",
    height: 1.1,
    fallbackScale: 0.62,
    rotationY: 0
  },
  "four-legged-piglet": {
    url: "/models/porkies/four-legged-piglet.glb",
    height: 1.05,
    fallbackScale: 0.6,
    rotationY: 0
  },
  "gaming-piglet": {
    url: "/models/porkies/cute-piglet-05840.glb",
    height: 1.15,
    fallbackScale: 0.64,
    rotationY: 0
  },
  "car-piglet": {
    url: "/models/porkies/cute-piglet-060436.glb",
    height: 0.9,
    fallbackScale: 0.54,
    rotationY: 0
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
