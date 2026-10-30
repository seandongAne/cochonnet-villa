// Node-pure shared geometry building, batching and resource ownership.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function studio(materials = new Map()) {
  const root = new THREE.Group();
  function material(color, glow = 0) {
    const key = `${color}:${glow}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.83, emissive: color, emissiveIntensity: glow }));
    return materials.get(key);
  }
  function mesh(geometry, color, pos = [0, 0, 0], scale = [1, 1, 1], glow = 0) {
    const object = new THREE.Mesh(geometry, material(color, glow));
    object.position.set(...pos); object.scale.set(...scale);
    object.castShadow = true; object.receiveShadow = true;
    root.add(object); return object;
  }
  const ball = (color, pos, scale, glow = 0) => mesh(new THREE.SphereGeometry(1, 16, 12), color, pos, scale, glow);
  const box = (color, pos, scale) => mesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.09), color, pos, scale);
  const cone = (color, pos, radius, height, sides = 9) => mesh(new THREE.ConeGeometry(radius, height, sides), color, pos);
  const cylinder = (color, pos, radius, height) => mesh(new THREE.CylinderGeometry(radius, radius, height, 16), color, pos);
  function tree(x, z, size = 1, pink = false) {
    cylinder('#8d7662', [x, 0.24 * size, z], 0.045 * size, 0.48 * size);
    if (pink) {
      ball('#e8b8bc', [x, 0.55 * size, z], [0.29 * size, 0.3 * size, 0.26 * size]);
      ball('#f2ced0', [x + 0.12 * size, 0.68 * size, z], [0.22 * size, 0.23 * size, 0.22 * size]);
    } else {
      cone('#75958a', [x, 0.48 * size, z], 0.25 * size, 0.55 * size);
      cone('#9bb7a0', [x, 0.72 * size, z], 0.19 * size, 0.45 * size);
    }
  }
  function window(x, y, z) {
    box('#8e7771', [x, y, z], [0.19, 0.24, 0.035]);
    mesh(new THREE.BoxGeometry(0.13, 0.18, 0.04), '#ffe4a5', [x, y, z + 0.02], [1, 1, 1], 0.45);
    box('#fff1d8', [x, y, z + 0.045], [0.015, 0.2, 0.015]);
  }
  return { root, mesh, ball, box, cone, cylinder, tree, window };
}

// Merge static geometry by material: detailed miniatures, a small draw-call budget.
export function batchMiniature(root) {
  root.updateMatrixWorld(true);
  const batches = new Map();
  root.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    // RoundedBox includes UVs, while some procedural geometries do not.
    geometry.deleteAttribute('uv');
    if (!batches.has(object.material)) batches.set(object.material, []);
    batches.get(object.material).push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose();
    object.geometry.dispose();
  });
  const merged = new THREE.Group();
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach((part) => part.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    merged.add(mesh);
  }
  return merged;
}

export function disposeMiniature(root) {
  const geometries = new Set(); const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
