import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeOwnedObject } from './resort-assets.js';

export const VILLA_BOUNDS = Object.freeze({ minX: -40, maxX: 44, minZ: -40, maxZ: 42 });
export const FENCE_GROUND_Y = .02;
export const FENCE_MODULE_SPAN = 3;
export const WELCOME_GATE = Object.freeze({ x: 2, z: VILLA_BOUNDS.maxZ, span: 6.5 });
// Conservative XZ envelopes measured from the shipped open hinge assemblies.
// Camera-height bands stop a standing player without reaching the buried tower.
export const GATE_LEAF_FOOTPRINTS = Object.freeze([
  Object.freeze({ minX: -3.55, maxX: -3.08, minZ: -2.95, maxZ: .05 }),
  Object.freeze({ minX: 2.96, maxX: 3.43, minZ: -2.95, maxZ: .05 })
]);

export function createFenceLayout(bounds = VILLA_BOUNDS) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const gate = { ...WELCOME_GATE, z: maxZ };
  const left = gate.x - gate.span / 2, right = gate.x + gate.span / 2;
  // Runs follow the perimeter clockwise; +X is each panel's authored direction.
  const runs = [
    [minX, minZ, maxX, minZ], [maxX, minZ, maxX, maxZ],
    [maxX, maxZ, right, maxZ], [left, maxZ, minX, maxZ],
    [minX, maxZ, minX, minZ]
  ];
  const panels = [], posts = new Map();
  const addPost = (x, z) => {
    if (z === maxZ && (Math.abs(x - left) < 1e-6 || Math.abs(x - right) < 1e-6)) return;
    posts.set(`${x.toFixed(6)},${z.toFixed(6)}`, { x, z });
  };
  for (const [x0, z0, x1, z1] of runs) {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const dx = (x1 - x0) / length, dz = (z1 - z0) / length;
    addPost(x0, z0);
    for (let offset = 0; offset < length - 1e-6; offset += FENCE_MODULE_SPAN) {
      const span = Math.min(FENCE_MODULE_SPAN, length - offset);
      panels.push({ x: x0 + dx * offset, z: z0 + dz * offset, span, rotationY: Math.atan2(-dz, dx) });
      addPost(x0 + dx * (offset + span), z0 + dz * (offset + span));
    }
  }
  return { panels, posts: [...posts.values()], gate, runs };
}

export function createFenceColliders(bounds = VILLA_BOUNDS) {
  const layout = createFenceLayout(bounds);
  const band = { minY: 0, maxY: 3 };
  const colliders = layout.runs.map(([x0, z0, x1, z1], i) => ({
    id: `perimeter-fence-${i}`, minX: Math.min(x0, x1) - .15,
    maxX: Math.max(x0, x1) + .15, minZ: Math.min(z0, z1) - .15,
    maxZ: Math.max(z0, z1) + .15, ...band
  }));
  GATE_LEAF_FOOTPRINTS.forEach((box, i) => colliders.push({
    id: `welcome-gate-leaf-${i}`, minX: layout.gate.x + box.minX,
    maxX: layout.gate.x + box.maxX, minZ: layout.gate.z + box.minZ,
    maxZ: layout.gate.z + box.maxZ, ...band
  }));
  return colliders;
}

// Bake module-node transforms into one geometry per material, then instance the
// whole module. Sources stay immutable; the returned root owns its GPU resources.
function instanceModule(root, source, placements, name) {
  source.updateMatrixWorld(true);
  const buckets = new Map();
  source.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
    buckets.get(mesh.material).push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
  });
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  for (const [material, geometries] of buckets) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    if (!geometry) throw new Error(`Incompatible fence geometry: ${name}`);
    const mesh = new THREE.InstancedMesh(geometry, material.clone(), placements.length);
    mesh.name = `${name}-${material.name}`;
    mesh.castShadow = mesh.receiveShadow = true;
    placements.forEach((p, i) => {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotationY ?? 0);
      matrix.compose(new THREE.Vector3(p.x, FENCE_GROUND_Y, p.z), quaternion,
        new THREE.Vector3((p.span ?? FENCE_MODULE_SPAN) / FENCE_MODULE_SPAN, 1, 1));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    root.add(mesh);
  }
}

export function createPerimeterFence(sources, bounds = VILLA_BOUNDS) {
  const root = new THREE.Group();
  root.name = 'perimeter-fence';
  const layout = createFenceLayout(bounds);
  try {
    instanceModule(root, sources.panel, layout.panels, 'fence-panel');
    instanceModule(root, sources.post, layout.posts, 'fence-post');
    instanceModule(root, sources.gate, [{ x: layout.gate.x, z: layout.gate.z }], 'welcome-gate');
    return root;
  } catch (error) {
    disposePerimeterFence(root);
    throw error;
  }
}

export function disposePerimeterFence(root) {
  if (root.userData.disposed) return;
  root.userData.disposed = true;
  root.traverse(mesh => { if (mesh.isInstancedMesh) mesh.dispose(); });
  disposeOwnedObject(root);
}

export function createFenceFallback(bounds = VILLA_BOUNDS) {
  const sage = new THREE.MeshStandardMaterial({ name: 'Fallback Sage', color: '#658174', roughness: .78 });
  const cedar = new THREE.MeshStandardMaterial({ name: 'Fallback Cedar', color: '#9a6747', roughness: .78 });
  const stone = new THREE.MeshStandardMaterial({ name: 'Fallback Limestone', color: '#b9ad95', roughness: .9 });
  const panel = new THREE.Group(), post = new THREE.Group(), gate = new THREE.Group();
  const box = (root, size, position, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); root.add(mesh);
  };
  for (let x = .18; x < 2.9; x += .24) box(panel, [.21, 1.02, .075], [x, .61, 0], sage);
  for (const y of [.35, .8]) box(panel, [2.84, .12, .1], [1.5, y, -.08], cedar);
  box(post, [.18, 1.2, .18], [0, .65, 0], cedar);
  box(post, [.3, .19, .3], [0, .095, 0], stone);
  box(post, [.3, .1, .3], [0, 1.25, 0], stone);
  for (const x of [-WELCOME_GATE.span / 2, WELCOME_GATE.span / 2]) {
    const gatePost = post.clone(true); gatePost.position.x = x; gate.add(gatePost);
    box(gate, [.1, 1, 2.9], [x, .6, -1.45], sage);
  }
  try { return createPerimeterFence({ panel, post, gate }, bounds); }
  finally {
    const sources = new THREE.Group(); sources.add(panel, post, gate);
    disposeOwnedObject(sources);
  }
}
