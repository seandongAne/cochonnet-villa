import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EXTERIOR_PLACEMENTS } from './exterior-placements.js';
import { ARCHITECTURE_PLACEMENTS } from './architecture-placements.js';
import { PORKY_PLACEMENTS } from './placements.js';

// Metre-scaled surface detail and low planting for the existing courtyard.
// Entirely node-pure: no downloads, canvas, per-frame work or extra render pass.
export const COURTYARD_PATHS = Object.freeze([
  { x: 2, z: 17, width: 5.4, depth: 40, y: .01 },
  { x: 0, z: .6, width: 14, depth: 4.4, y: .02 }
]);

function rng(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function texture(data, size, name, color = true) {
  const map = new THREE.DataTexture(data, size, size);
  map.name = name;
  map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}

export function createLawnMap() {
  const size = 256, pixels = new Uint8Array(size * size * 4), random = rng(173);
  const cells = Array.from({ length: 64 }, () => random());
  const sample = (x, y) => cells[(y % 8) * 8 + x % 8];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Seamless stochastic grain, deliberately low contrast: periodic sine
    // bands turn a receding lawn into a visible checkerboard at grazing angles.
    const ix = Math.floor(x / 32), iy = Math.floor(y / 32);
    const fx = THREE.MathUtils.smoothstep(x % 32, 0, 32);
    const fy = THREE.MathUtils.smoothstep(y % 32, 0, 32);
    const broad = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(sample(ix, iy), sample(ix + 1, iy), fx),
      THREE.MathUtils.lerp(sample(ix, iy + 1), sample(ix + 1, iy + 1), fx), fy);
    const value = 216 + (broad - .5) * 10 + (random() - .5) * 28;
    const i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
  return texture(pixels, size, 'garden-cut-grass');
}

export function createPavingMaterial() {
  const size = 512, albedo = new Uint8Array(size * size * 4);
  const relief = new Uint8Array(size * size * 4), random = rng(491);
  const tones = Array.from({ length: 16 }, () => random() * 16 - 8);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / 128);
    const offsetX = (x + (row % 2) * 64) % size;
    const col = Math.floor(offsetX / 128);
    const edge = Math.min(offsetX % 128, 128 - offsetX % 128, y % 128, 128 - y % 128);
    const bevel = THREE.MathUtils.smoothstep(edge, 1.3, 4.8);
    const grain = (random() - .5) * 10;
    const tone = tones[row * 4 + col] + grain;
    const i = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) {
      albedo[i + c] = THREE.MathUtils.lerp([139, 130, 106][c], [190, 177, 150][c] + tone, bevel);
      relief[i + c] = 90 + bevel * 135 + grain;
    }
    albedo[i + 3] = relief[i + 3] = 255;
  }
  return new THREE.MeshStandardMaterial({
    map: texture(albedo, size, 'garden-limestone'),
    bumpMap: texture(relief, size, 'garden-limestone-relief', false),
    bumpScale: .028, roughness: .94
  });
}

export function setLandscapeUV(geometry, x = 0, z = 0, tileSize = 3) {
  const positions = geometry.attributes.position;
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uv[i * 2] = (positions.getX(i) + x) / tileSize;
    uv[i * 2 + 1] = (positions.getZ(i) + z) / tileSize;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

export function createCourtyardPaths() {
  const root = new THREE.Group();
  root.name = 'courtyard-paths';
  const material = createPavingMaterial();
  for (const path of COURTYARD_PATHS) {
    const geometry = setLandscapeUV(new THREE.BoxGeometry(path.width, .2, path.depth), path.x, path.z, 2.8);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(path.x, path.y, path.z);
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  // Flush edging frames the long arrival axis without creating a new step.
  // Leave generous breaks for the garden and mushroom door approaches.
  const edges = [];
  for (const x of [-.62, 4.62]) for (let z = 3.3; z < 37; z += .72) {
    if (x < 0 && ((z > 7 && z < 11) || (z > 20 && z < 28))) continue;
    edges.push([x, z]);
  }
  const kerb = new THREE.InstancedMesh(new THREE.BoxGeometry(.16, .12, .69),
    new THREE.MeshStandardMaterial({ color: '#b5a78d', roughness: .96 }), edges.length);
  kerb.name = 'courtyard-path-edging';
  const matrix = new THREE.Matrix4();
  edges.forEach(([x, z], i) => kerb.setMatrixAt(i, matrix.makeTranslation(x, .085, z)));
  kerb.receiveShadow = true;
  kerb.computeBoundingSphere();
  root.add(kerb);
  return root;
}

// Small, irregular islands leave open lawn between the buildings. Low plants
// are decorative and walk-through; existing colliders remain authoritative.
export const GARDEN_BEDS = Object.freeze([
  { x: 6.2, z: 9.8, rx: .8, rz: 2.1 },
  { x: 6.3, z: 18.0, rx: .85, rz: 1.6 },
  { x: 6.4, z: 28.5, rx: 1.0, rz: 3.0 },
  { x: -2.0, z: 31.0, rx: .8, rz: 3.7 },
  { x: -12.0, z: 7.8, rx: .85, rz: 2.0 },
  { x: -9.5, z: 3.6, rx: 2.4, rz: .65 },
  { x: -13.0, z: 19.0, rx: 1.1, rz: 2.0 },
  { x: -10.0, z: 25.1, rx: 1.5, rz: .8 },
  { x: 27.0, z: 8.0, rx: 1.0, rz: 3.0 },
  { x: 26.1, z: -7.8, rx: .8, rz: 2.4 }
]);

export function isGardenPointClear(x, z, world, margin = .35) {
  if (x < world.bounds.minX + margin || x > world.bounds.maxX - margin
    || z < world.bounds.minZ + margin || z > world.bounds.maxZ - margin) return false;
  if (Math.hypot(x + 6, z - 18) < 6.6 + margin) return false;
  // Keep the south-facing portal, its landing and approach unobstructed.
  if (Math.abs(x + 6) < 1.6 + margin && z > 21 && z < 30) return false;
  if (Math.abs(x) < 14 + margin && z < 2.8 + margin) return false;
  if (COURTYARD_PATHS.some(p => Math.abs(x - p.x) < p.width / 2 + margin
    && Math.abs(z - p.z) < p.depth / 2 + margin)) return false;
  if (world.colliders.some(c => (c.minY ?? -Infinity) <= .5 && (c.maxY ?? Infinity) >= 0
    && x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin)) return false;
  // Also protect non-solid lamps, signs and residents from decorative overlap.
  return ![...EXTERIOR_PLACEMENTS, ...ARCHITECTURE_PLACEMENTS, ...PORKY_PLACEMENTS].some(p =>
    p.position[1] > -1 && p.position[1] < 2 && Math.hypot(x - p.position[0], z - p.position[2]) < .9 + margin);
}

export function gardenPlanting(world) {
  const random = rng(80219), plants = [];
  for (const bed of GARDEN_BEDS) {
    const count = Math.round(bed.rx * bed.rz * 24);
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2, radius = Math.sqrt(random());
      const x = bed.x + Math.cos(angle) * radius * bed.rx;
      const z = bed.z + Math.sin(angle) * radius * bed.rz;
      const yaw = random() * Math.PI * 2, scale = .7 + random() * .55;
      const kind = random() < .22 ? 'daisy' : 'lavender';
      if (isGardenPointClear(x, z, world)) plants.push({ x, z, yaw, scale, kind });
    }
  }
  return plants;
}

function colored(geometry, hex, position = [0, 0, 0]) {
  if (geometry.index) {
    const indexed = geometry;
    geometry = indexed.toNonIndexed();
    indexed.dispose();
  }
  geometry.translate(...position);
  const color = new THREE.Color(hex), data = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) color.toArray(data, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geometry;
}

function flowerGeometry(kind) {
  const parts = [];
  for (let stem = 0; stem < 3; stem++) {
    const x = Math.cos(stem * 2.4) * .095, z = Math.sin(stem * 2.4) * .095;
    const height = .3 + stem * .055;
    parts.push(colored(new THREE.CylinderGeometry(.009, .013, height, 4), '#64764b', [x, height / 2, z]));
    if (kind === 'lavender') {
      for (let bud = 0; bud < 3; bud++) {
        const head = new THREE.OctahedronGeometry(.048 - bud * .006).scale(.8, 1.35, .8);
        parts.push(colored(head, ['#8972ad', '#aa91bd', '#bea2cb'][stem], [x, height + bud * .047, z]));
      }
    } else {
      for (let petal = 0; petal < 5; petal++) {
        const a = petal / 5 * Math.PI * 2;
        const shape = new THREE.OctahedronGeometry(.036).scale(1, .35, 1);
        parts.push(colored(shape, '#eee5cc', [x + Math.cos(a) * .039, height, z + Math.sin(a) * .039]));
      }
      parts.push(colored(new THREE.OctahedronGeometry(.028).scale(1, .5, 1), '#cda046', [x, height + .009, z]));
    }
  }
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  return geometry;
}

function leafGeometry() {
  const positions = [], colors = [], indices = [];
  const base = new THREE.Color('#4d6840'), tip = new THREE.Color('#91a06b');
  for (let leaf = 0; leaf < 11; leaf++) {
    const a = leaf * 2.4, dx = Math.cos(a), dz = Math.sin(a), h = .25 + (leaf % 3) * .045;
    const n = positions.length / 3;
    positions.push(-dz * .035, 0, dx * .035, dz * .035, 0, -dx * .035,
      dx * .11, h * .6, dz * .11, dx * .23, h, dz * .23);
    base.toArray(colors, colors.length); base.toArray(colors, colors.length);
    tip.toArray(colors, colors.length); tip.toArray(colors, colors.length);
    indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function createGarden(world) {
  const root = new THREE.Group();
  root.name = 'courtyard-garden';
  const plants = gardenPlanting(world);
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, side: THREE.DoubleSide });
  const flowers = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .91 });
  for (const kind of ['leaves', 'lavender', 'daisy']) {
    const instances = kind === 'leaves' ? plants : plants.filter(p => p.kind === kind);
    const mesh = new THREE.InstancedMesh(kind === 'leaves' ? leafGeometry() : flowerGeometry(kind),
      kind === 'leaves' ? foliage : flowers, instances.length);
    mesh.name = `garden-${kind}`;
    instances.forEach((p, i) => {
      rotation.setFromAxisAngle(up, p.yaw);
      matrix.compose(position.set(p.x, .025, p.z), rotation, scale.setScalar(p.scale));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.receiveShadow = true;
    // Tiny plants do not spend the static sun shadow budget.
    mesh.castShadow = false;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  root.userData.plants = plants;
  return root;
}
