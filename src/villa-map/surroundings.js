import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { createHayBale, createMaterials, createPorky } from "./assets.js";
import { createVillaWorld } from "./world.js";

// Everything the player can see but never reach: the daytime sky with drifting
// clouds, one continuous meadow that rolls into hills and a hazy mountain rim,
// the villagers' hamlet and farmsteads on the slopes, and the tree line.
//
// Node-pure by construction (no TextureLoader, DOM or image decoding): the sky
// is a shader, the terrain and buildings are vertex-coloured geometry, and the
// tree line is two instanced draws. Everything here is scenery: nothing is
// collidable, nothing casts into the cached sun shadow, and every object sits
// outside world.bounds with a clearance margin (pinned by tests/surroundings).

export const SKY_ZENITH_COLOR = "#3f7fcf";
export const SKY_HORIZON_COLOR = "#dbe8f2";
export const SKY_GROUND_COLOR = "#a8bf9a";
export const SUN_COLOR = "#fff1cb";
// Shared with Scene.jsx's directional light so the sun disc, the highlights
// and the cached shadows agree on one direction.
export const SUN_POSITION = Object.freeze({ x: -16, y: 26, z: 22 });
export const SURROUNDINGS_FOG = Object.freeze({ color: SKY_HORIZON_COLOR, near: 70, far: 190 });
export const SURROUNDINGS_CAMERA_FAR = 280;
export const SKY_DOME_RADIUS = 240;
export const SKY_TIME_WRAP_SECONDS = 4096;

export const TERRAIN_RADIUS = 250;
export const TERRAIN_CENTER = Object.freeze({ x: 2, z: 1 });
export const TERRAIN_FLAT_Y = 0.02;
// The meadow stays perfectly flat this far past world.bounds before it starts
// to roll, so the walkable area never meets a slope.
export const TERRAIN_FLAT_MARGIN = 6;
export const TERRAIN_RISE_DISTANCE = 24;
export const SCENERY_MIN_CLEARANCE = 8;

const DEFAULT_BOUNDS = Object.freeze({ ...createVillaWorld().bounds });
// The former courtyard lawn (a brighter 54 × 53 m patch) now blends softly
// into the meadow instead of ending in a hard colour step.
const LAWN_RECT = Object.freeze({ minX: -25, maxX: 29, minZ: -25, maxZ: 27 });

const COLOR = {
  meadowDark: new THREE.Color("#7a9c5c"),
  meadowLight: new THREE.Color("#93b76e"),
  lawn: new THREE.Color("#8fb56c"),
  hill: new THREE.Color("#a0b46a"),
  mountain: new THREE.Color("#8ea78c"),
  lane: new THREE.Color("#c9ab7a"),
  fieldWheat: new THREE.Color("#c9b464"),
  fieldGreen: new THREE.Color("#a6c25f"),
  fieldPloughed: new THREE.Color("#a98358"),
  fieldClover: new THREE.Color("#7fa95a")
};

// ---------------------------------------------------------------------------
// Deterministic noise + RNG. The scenery must be identical on every visit and
// in the test suite, so nothing here touches Math.random.
// ---------------------------------------------------------------------------
function hashCoord(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hashCoord(ix, iz);
  const b = hashCoord(ix + 1, iz);
  const c = hashCoord(ix, iz + 1);
  const d = hashCoord(ix + 1, iz + 1);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, sx),
    THREE.MathUtils.lerp(c, d, sx),
    sz
  ) * 2 - 1;
}

export function fbm(x, z, octaves = 4) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise(x * frequency + octave * 17.3, z * frequency - octave * 9.1) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.05;
  }
  return sum / norm;
}

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function expandRect(rect, margin) {
  return {
    minX: rect.minX - margin,
    maxX: rect.maxX + margin,
    minZ: rect.minZ - margin,
    maxZ: rect.maxZ + margin
  };
}

export function distanceOutsideRect(x, z, rect) {
  const dx = Math.max(rect.minX - x, 0, x - rect.maxX);
  const dz = Math.max(rect.minZ - z, 0, z - rect.maxZ);
  return Math.hypot(dx, dz);
}

// ---------------------------------------------------------------------------
// Terrain shape and colour.
// ---------------------------------------------------------------------------
export function terrainHeightAt(x, z, bounds = DEFAULT_BOUNDS) {
  const distance = distanceOutsideRect(x, z, expandRect(bounds, TERRAIN_FLAT_MARGIN));
  if (distance <= 0) return TERRAIN_FLAT_Y;
  const rise = THREE.MathUtils.smoothstep(distance, 0, TERRAIN_RISE_DISTANCE);
  const rolling = fbm(x * 0.021, z * 0.021, 4);
  const hills = (2.2 + 0.11 * distance) * (0.6 + 0.4 * rolling);
  const ridgeNoise = fbm(x * 0.009 + 11.7, z * 0.009 - 4.2, 3);
  const ridges = THREE.MathUtils.smoothstep(distance, 95, 175) * 34 * (0.55 + 0.45 * ridgeNoise);
  return TERRAIN_FLAT_Y + rise * hills + ridges;
}

// A dirt lane leaves the estate's stone path at its south end and winds up to
// the hamlet. Kept as data so the tree line and the fields can avoid it.
export const VILLAGE_LANE = Object.freeze([
  [2, 40], [10, 50], [26, 60], [46, 68], [60, 72]
].map((point) => Object.freeze(point)));

function distanceToPolyline(x, z, polyline) {
  let best = Infinity;
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const [ax, az] = polyline[index];
    const [bx, bz] = polyline[index + 1];
    const abx = bx - ax;
    const abz = bz - az;
    const t = THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz), 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + abx * t), z - (az + abz * t)));
  }
  return best;
}

// Rotated field patches painted into the meadow around the hamlet.
export const VILLAGE_FIELDS = Object.freeze([
  { x: 74, z: 58, width: 22, depth: 14, yaw: 0.35, color: "fieldWheat" },
  { x: 52, z: 88, width: 18, depth: 12, yaw: -0.2, color: "fieldPloughed" },
  { x: 84, z: 82, width: 16, depth: 16, yaw: 0.6, color: "fieldGreen" },
  { x: -64, z: -48, width: 18, depth: 12, yaw: -0.5, color: "fieldClover" },
  { x: -78, z: 24, width: 14, depth: 20, yaw: 0.15, color: "fieldWheat" }
].map((field) => Object.freeze(field)));

function fieldCoverage(x, z, field) {
  const cos = Math.cos(-field.yaw);
  const sin = Math.sin(-field.yaw);
  const dx = x - field.x;
  const dz = z - field.z;
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const edgeX = field.width / 2 - Math.abs(localX);
  const edgeZ = field.depth / 2 - Math.abs(localZ);
  return THREE.MathUtils.smoothstep(Math.min(edgeX, edgeZ), 0, 1.2);
}

export function terrainColorAt(x, z, height, target = new THREE.Color()) {
  const patch = 0.5 + 0.5 * fbm(x * 0.06, z * 0.06, 3);
  target.copy(COLOR.meadowDark).lerp(COLOR.meadowLight, patch);
  const lawn = 1 - THREE.MathUtils.smoothstep(distanceOutsideRect(x, z, LAWN_RECT), 0, 12);
  target.lerp(COLOR.lawn, lawn * 0.8);
  const grain = 1 + 0.05 * fbm(x * 0.9, z * 0.9, 2);
  target.multiplyScalar(grain);
  target.lerp(COLOR.hill, THREE.MathUtils.smoothstep(height - TERRAIN_FLAT_Y, 2, 14) * 0.55);
  target.lerp(COLOR.mountain, THREE.MathUtils.smoothstep(height, 18, 40));
  for (const field of VILLAGE_FIELDS) {
    const coverage = fieldCoverage(x, z, field);
    if (coverage > 0) target.lerp(COLOR[field.color], coverage * 0.85);
  }
  const lane = 1 - THREE.MathUtils.smoothstep(distanceToPolyline(x, z, VILLAGE_LANE), 1.1, 2.2);
  if (lane > 0) target.lerp(COLOR.lane, lane * 0.9);
  return target;
}

function terrainRings() {
  const rings = [12, 24, 34, 42, 48, 52];
  for (let radius = 56; radius <= 132; radius += 4) rings.push(radius);
  for (let radius = 140; radius <= TERRAIN_RADIUS; radius += 8) rings.push(radius);
  if (rings[rings.length - 1] !== TERRAIN_RADIUS) rings.push(TERRAIN_RADIUS);
  return rings;
}

// One fan-shaped disc: flat under the whole walkable area, rolling beyond it.
export function createHorizonTerrain({ bounds = DEFAULT_BOUNDS, segments = 144 } = {}) {
  const rings = terrainRings();
  const vertexCount = 1 + rings.length * segments;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const color = new THREE.Color();
  const write = (index, x, z) => {
    const y = terrainHeightAt(x, z, bounds);
    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
    terrainColorAt(x, z, y, color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  };
  write(0, TERRAIN_CENTER.x, TERRAIN_CENTER.z);
  rings.forEach((radius, ring) => {
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      write(
        1 + ring * segments + segment,
        TERRAIN_CENTER.x + Math.cos(angle) * radius,
        TERRAIN_CENTER.z + Math.sin(angle) * radius
      );
    }
  });
  const indices = [];
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    indices.push(0, 1 + next, 1 + segment);
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    const inner = 1 + ring * segments;
    const outer = inner + segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(inner + segment, outer + next, outer + segment);
      indices.push(inner + segment, inner + next, outer + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 })
  );
  mesh.name = "horizon-terrain";
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// Sky: gradient + sun + two-layer procedural clouds projected onto a plane so
// they compress naturally toward the horizon. Colour comes from the view
// direction, so the dome can follow the camera without any cloud parallax.
// ---------------------------------------------------------------------------
const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = worldPosition.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uTime;
  uniform float uCloudCover;

  varying vec3 vWorldDirection;

  float hashCell(vec2 cell) {
    cell = fract(cell * vec2(123.34, 456.21));
    cell += dot(cell, cell + 45.32);
    return fract(cell.x * cell.y);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 offset = fract(point);
    vec2 weight = offset * offset * (3.0 - 2.0 * offset);
    return mix(
      mix(hashCell(cell), hashCell(cell + vec2(1.0, 0.0)), weight.x),
      mix(hashCell(cell + vec2(0.0, 1.0)), hashCell(cell + vec2(1.0, 1.0)), weight.x),
      weight.y
    );
  }

  float cloudFbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotate = mat2(1.6, 1.2, -1.2, 1.6);
    for (int octave = 0; octave < 5; octave++) {
      value += amplitude * valueNoise(point);
      point = rotate * point;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 direction = normalize(vWorldDirection);
    float elevation = clamp(direction.y, -1.0, 1.0);

    float up = pow(max(elevation, 0.0), 0.5);
    vec3 sky = mix(uHorizonColor, uZenithColor, up);
    sky = mix(sky, uGroundColor, smoothstep(0.0, -0.3, elevation));

    float sunAlignment = clamp(dot(direction, uSunDirection), 0.0, 1.0);
    float disc = smoothstep(0.9988, 0.9996, sunAlignment);
    float halo = pow(sunAlignment, 28.0) * 0.32 + pow(sunAlignment, 5.0) * 0.07;
    sky += uSunColor * (disc * 1.8 + halo);

    if (elevation > 0.0) {
      // The projected plane spans roughly ±2 units across the visible sky;
      // scale 3 puts about a dozen noise cells over it (evaluated on the CPU:
      // ~40% cover at the default uCloudCover, fbm mean ≈ 0.475).
      vec2 plane = direction.xz / (elevation + 0.14) * 0.85;
      vec2 drift = uTime * vec2(0.010, 0.004);
      float shape = cloudFbm(plane * 3.0 + drift);
      float detail = cloudFbm(plane * 9.6 - drift * 1.7 + 4.3);
      float density = shape * 0.7 + detail * 0.3;
      float threshold = 0.48 - uCloudCover * 0.12;
      float cover = smoothstep(threshold, threshold + 0.16, density);
      float fade = smoothstep(0.015, 0.2, elevation);
      float lit = smoothstep(0.3, 0.8, detail) * 0.6 + sunAlignment * 0.25;
      vec3 cloud = mix(vec3(0.70, 0.74, 0.82), vec3(1.0, 0.99, 0.97), lit);
      sky = mix(sky, cloud, cover * fade * 0.96);
    }

    gl_FragColor = vec4(sky, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createDaySky() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uZenithColor: { value: new THREE.Color(SKY_ZENITH_COLOR) },
      uHorizonColor: { value: new THREE.Color(SKY_HORIZON_COLOR) },
      uGroundColor: { value: new THREE.Color(SKY_GROUND_COLOR) },
      uSunColor: { value: new THREE.Color(SUN_COLOR) },
      uSunDirection: {
        value: new THREE.Vector3(SUN_POSITION.x, SUN_POSITION.y, SUN_POSITION.z).normalize()
      },
      uTime: { value: 0 },
      uCloudCover: { value: 0.5 }
    },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  });
  material.name = "day-sky";
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_DOME_RADIUS, 40, 24), material);
  mesh.name = "day-sky";
  mesh.frustumCulled = false;
  // After every ordinary opaque object (so only visible sky pixels pay for the
  // cloud noise) and before the observatory's stencil aperture/backdrop.
  mesh.renderOrder = 800;
  mesh.userData.update = (elapsedSeconds, cameraPosition) => {
    mesh.position.copy(cameraPosition);
    material.uniforms.uTime.value = elapsedSeconds % SKY_TIME_WRAP_SECONDS;
  };
  return mesh;
}

// ---------------------------------------------------------------------------
// Village: vertex-coloured geometry merged into two draws (buildings, pigs).
// ---------------------------------------------------------------------------
export const VILLAGE_SITES = Object.freeze([
  {
    id: "hamlet-southeast",
    x: 64,
    z: 74,
    clearance: 22,
    cottages: [
      { x: 0, z: 0, yaw: -2.4, width: 6, depth: 5, wall: "#f3dcc0", roof: "#b5493f" },
      { x: 8.5, z: -4, yaw: -2.9, width: 5, depth: 4.4, wall: "#efd2b0", roof: "#8d5a3c" },
      { x: -8, z: 5, yaw: -1.7, width: 5.4, depth: 4.6, wall: "#f6e4c8", roof: "#a04a48" },
      { x: 3, z: 9, yaw: 3.0, width: 4.6, depth: 4, wall: "#e9cfae", roof: "#6f4a35" },
      { x: 12, z: 6, yaw: 2.2, width: 7, depth: 5.6, wall: "#f2d9bd", roof: "#b04c3c", barn: true },
      { x: -4, z: -9, yaw: -2.0, width: 4.4, depth: 3.8, wall: "#f0d7b8", roof: "#9a5540" }
    ],
    pens: [{ x: -11, z: -6, width: 9, depth: 7 }],
    hay: [{ x: 14, z: 0 }, { x: -13, z: 11 }],
    pigs: [
      { x: -10, z: -5, yaw: 0.6 }, { x: -12.5, z: -7.5, yaw: -1.9 }, { x: -8.5, z: -8.5, yaw: 2.4 },
      { x: 5, z: 3, yaw: -0.6 }, { x: -2, z: 5, yaw: 1.4 }, { x: 10, z: 1.5, yaw: 2.8 }
    ]
  },
  {
    id: "farm-northwest",
    x: -62,
    z: -60,
    clearance: 16,
    cottages: [
      { x: 0, z: 0, yaw: 0.9, width: 5.6, depth: 4.8, wall: "#f4dfc3", roof: "#a8483e" },
      { x: 8, z: 4, yaw: 0.4, width: 7, depth: 5.4, wall: "#e6cfae", roof: "#7a4e36", barn: true }
    ],
    pens: [{ x: -8, z: 5, width: 8, depth: 6 }],
    hay: [{ x: 4, z: -7 }],
    pigs: [{ x: -8, z: 4, yaw: 1.1 }, { x: -6, z: 7, yaw: -2.2 }, { x: 3, z: -5, yaw: 0.2 }]
  },
  {
    id: "farm-east",
    x: 74,
    z: -22,
    clearance: 15,
    cottages: [
      { x: 0, z: 0, yaw: -1.4, width: 5.2, depth: 4.4, wall: "#f3dcc0", roof: "#b5493f" },
      { x: -7, z: 6, yaw: -1.1, width: 4.6, depth: 4, wall: "#efd6b4", roof: "#8d5a3c" }
    ],
    pens: [],
    hay: [{ x: 6, z: 5 }],
    pigs: [{ x: 3, z: 5, yaw: -2.6 }, { x: -3, z: -5, yaw: 0.9 }]
  },
  {
    id: "farm-west",
    x: -72,
    z: 8,
    clearance: 14,
    cottages: [
      { x: 0, z: 0, yaw: 1.5, width: 5.8, depth: 4.8, wall: "#f6e4c8", roof: "#a04a48" }
    ],
    pens: [{ x: 0, z: 8, width: 7, depth: 6 }],
    hay: [{ x: -6, z: -4 }],
    pigs: [{ x: -1, z: 8, yaw: 0.3 }, { x: 2, z: 9.5, yaw: 2.9 }]
  }
]);

function pushBox(parts, size, color, matrix) {
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  geometry.applyMatrix4(matrix);
  parts.push({ geometry, color });
}

function gableRoof(width, depth, height) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

const PLINTH = 1.6;
const scratchMatrix = new THREE.Matrix4();
const scratchPlacement = new THREE.Matrix4();

function placement(x, y, z, yaw) {
  return new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(yaw));
}

function addCottage(parts, cottage, base) {
  const wallHeight = cottage.barn ? 3.4 : 2.8;
  const roofHeight = cottage.barn ? 2.4 : 2.2;
  const wall = new THREE.Color(cottage.wall);
  const roof = new THREE.Color(cottage.roof);
  const trim = new THREE.Color("#5e3a26");
  const glow = new THREE.Color("#f9e6a8");
  const local = (x, y, z, yaw = 0) => scratchMatrix.copy(base).multiply(scratchPlacement.copy(placement(x, y, z, yaw)));
  // Walls extend below the floor so a sloping hillside never shows a gap.
  pushBox(parts, [cottage.width, wallHeight + PLINTH, cottage.depth], wall,
    local(0, (wallHeight - PLINTH) / 2, 0));
  const roofGeometry = gableRoof(cottage.width + 0.7, cottage.depth + 0.8, roofHeight);
  roofGeometry.applyMatrix4(local(0, wallHeight, 0));
  parts.push({ geometry: roofGeometry, color: roof });
  pushBox(parts, [0.55, 1.4, 0.55], trim, local(cottage.width * 0.28, wallHeight + roofHeight * 0.55, 0));
  pushBox(parts, [cottage.barn ? 1.8 : 0.95, cottage.barn ? 2.4 : 1.7, 0.14], trim,
    local(0, cottage.barn ? 1.2 : 0.85, cottage.depth / 2 + 0.05));
  for (const side of [-1, 1]) {
    pushBox(parts, [0.8, 0.8, 0.12], glow, local(side * cottage.width * 0.3, 1.55, cottage.depth / 2 + 0.05));
    pushBox(parts, [0.12, 0.8, 0.8], glow, local(side * (cottage.width / 2 + 0.05), 1.55, 0));
  }
}

function addFence(parts, base, x0, z0, x1, z1) {
  const post = new THREE.Color("#8a6a4a");
  const length = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  const posts = Math.max(2, Math.round(length / 1.6) + 1);
  for (let index = 0; index < posts; index += 1) {
    const t = index / (posts - 1);
    pushBox(parts, [0.16, 1.0, 0.16], post,
      scratchMatrix.copy(base).multiply(placement(x0 + (x1 - x0) * t, 0.5, z0 + (z1 - z0) * t, 0)));
  }
  for (const railY of [0.45, 0.85]) {
    pushBox(parts, [0.08, 0.1, length], post,
      scratchMatrix.copy(base).multiply(placement((x0 + x1) / 2, railY, (z0 + z1) / 2, yaw)));
  }
}

function addPen(parts, base, pen) {
  const { x, z, width, depth } = pen;
  const corners = [
    [x - width / 2, z - depth / 2], [x + width / 2, z - depth / 2],
    [x + width / 2, z + depth / 2], [x - width / 2, z + depth / 2]
  ];
  for (let index = 0; index < 4; index += 1) {
    const [ax, az] = corners[index];
    const [bx, bz] = corners[(index + 1) % 4];
    addFence(parts, base, ax, az, bx, bz);
  }
}

function bakeObject(object, matrix) {
  object.updateMatrixWorld(true);
  const parts = [];
  object.traverse((child) => {
    if (!child.isMesh) return;
    const geometry = child.geometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    geometry.applyMatrix4(matrix);
    parts.push({ geometry, color: child.material.color ?? new THREE.Color("#ffffff") });
  });
  return parts;
}

function mergeParts(parts, name, roughness = 0.9) {
  const geometries = parts.map(({ geometry, color }) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const key of Object.keys(flat.attributes)) {
      if (key !== "position" && key !== "normal") flat.deleteAttribute(key);
    }
    if (!flat.attributes.normal) flat.computeVertexNormals();
    const count = flat.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    if (flat !== geometry) geometry.dispose();
    return flat;
  });
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness }));
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

// World-space transform for a site-local point, seated on the terrain.
function siteMatrix(site, x, z, yaw, bounds, lift = 0) {
  const worldX = site.x + x;
  const worldZ = site.z + z;
  return placement(worldX, terrainHeightAt(worldX, worldZ, bounds) + lift, worldZ, yaw);
}

export function createVillage({ bounds = DEFAULT_BOUNDS } = {}) {
  const materials = createMaterials();
  const buildingParts = [];
  const pigParts = [];
  const anchors = [];
  for (const site of VILLAGE_SITES) {
    for (const cottage of site.cottages) {
      addCottage(buildingParts, cottage, siteMatrix(site, cottage.x, cottage.z, cottage.yaw, bounds, -0.05));
      anchors.push({ kind: "cottage", x: site.x + cottage.x, z: site.z + cottage.z });
    }
    for (const pen of site.pens) {
      // Fence posts follow the ground under each post rather than the pen centre.
      const base = new THREE.Matrix4().makeTranslation(site.x, 0, site.z);
      const parts = [];
      addPen(parts, base, pen);
      for (const part of parts) {
        const box = new THREE.Box3().setFromBufferAttribute(part.geometry.attributes.position);
        const centerX = (box.min.x + box.max.x) / 2;
        const centerZ = (box.min.z + box.max.z) / 2;
        part.geometry.translate(0, terrainHeightAt(centerX, centerZ, bounds) - 0.15, 0);
      }
      buildingParts.push(...parts);
      // Anchor on a corner post: the pen's centre is open ground.
      anchors.push({ kind: "pen", x: site.x + pen.x - pen.width / 2, z: site.z + pen.z - pen.depth / 2 });
    }
    for (const hay of site.hay) {
      buildingParts.push(...bakeObject(createHayBale(materials.hay), siteMatrix(site, hay.x, hay.z, 0.4, bounds, -0.08)));
      anchors.push({ kind: "hay", x: site.x + hay.x, z: site.z + hay.z });
    }
    for (const pig of site.pigs) {
      pigParts.push(...bakeObject(createPorky(materials, { scale: 0.58 }), siteMatrix(site, pig.x, pig.z, pig.yaw, bounds, -0.02)));
      anchors.push({ kind: "pig", x: site.x + pig.x, z: site.z + pig.z });
    }
  }
  const group = new THREE.Group();
  group.name = "villager-village";
  group.add(mergeParts(buildingParts, "village-buildings", 0.88));
  group.add(mergeParts(pigParts, "village-pigs", 0.82));
  group.userData.anchors = anchors;
  return group;
}

// ---------------------------------------------------------------------------
// Tree line: clusters and singles scattered outside the walkable meadow.
// ---------------------------------------------------------------------------
export const MEADOW_TREE_COUNT = 220;

function isClearOfScenery(x, z) {
  if (distanceToPolyline(x, z, VILLAGE_LANE) < 4) return false;
  for (const site of VILLAGE_SITES) {
    if (Math.hypot(x - site.x, z - site.z) < site.clearance) return false;
  }
  for (const field of VILLAGE_FIELDS) {
    if (fieldCoverage(x, z, field) > 0) return false;
  }
  return true;
}

export function createMeadowTrees({ bounds = DEFAULT_BOUNDS, count = MEADOW_TREE_COUNT, seed = 20260909 } = {}) {
  const rng = createRng(seed);
  const flat = expandRect(bounds, TERRAIN_FLAT_MARGIN);
  const clearance = expandRect(bounds, SCENERY_MIN_CLEARANCE);
  const clusterCenters = [];
  while (clusterCenters.length < 18) {
    const x = TERRAIN_CENTER.x + (rng() * 2 - 1) * 150;
    const z = TERRAIN_CENTER.z + (rng() * 2 - 1) * 150;
    const distance = distanceOutsideRect(x, z, clearance);
    if (distance < 4 || distance > 130 || !isClearOfScenery(x, z)) continue;
    clusterCenters.push({ x, z });
  }
  const trees = [];
  let attempts = 0;
  while (trees.length < count && attempts < count * 60) {
    attempts += 1;
    let x;
    let z;
    if (rng() < 0.7) {
      const center = clusterCenters[Math.floor(rng() * clusterCenters.length)];
      const radius = 4 + rng() * 14;
      const angle = rng() * Math.PI * 2;
      x = center.x + Math.cos(angle) * radius;
      z = center.z + Math.sin(angle) * radius;
    } else {
      x = TERRAIN_CENTER.x + (rng() * 2 - 1) * 160;
      z = TERRAIN_CENTER.z + (rng() * 2 - 1) * 160;
    }
    const distance = distanceOutsideRect(x, z, clearance);
    if (distance < 0.5 || distance > 140 || !isClearOfScenery(x, z)) continue;
    if (Math.hypot(x - TERRAIN_CENTER.x, z - TERRAIN_CENTER.z) > TERRAIN_RADIUS - 10) continue;
    if (trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < 2.6)) continue;
    const height = terrainHeightAt(x, z, bounds);
    if (height > 30) continue;
    trees.push({ x, z, y: height, scale: 0.75 + rng() * 0.75, yaw: rng() * Math.PI * 2, tint: rng() });
  }
  void flat;

  const trunkGeometry = new THREE.CylinderGeometry(0.28, 0.42, 2.5, 7);
  trunkGeometry.translate(0, 1.2, 0);
  const canopyParts = [
    [0, 0, 0, 1.45], [-0.8, 0.1, 0.15, 1.1], [0.82, 0.18, 0.05, 1.1], [0.08, 0.78, -0.35, 1.15]
  ].map(([x, y, z, radius]) => {
    const sphere = new THREE.SphereGeometry(radius, 10, 8);
    sphere.translate(x, 2.9 + y, z);
    return sphere;
  });
  const canopyGeometry = mergeGeometries(canopyParts, false);
  canopyParts.forEach((part) => part.dispose());

  const trunks = new THREE.InstancedMesh(
    trunkGeometry,
    new THREE.MeshStandardMaterial({ color: "#79513b", roughness: 0.92 }),
    trees.length
  );
  const canopies = new THREE.InstancedMesh(
    canopyGeometry,
    new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95 }),
    trees.length
  );
  const matrix = new THREE.Matrix4();
  const leafA = new THREE.Color("#2f9a51");
  const leafB = new THREE.Color("#6aaa4e");
  const leafC = new THREE.Color("#3f8a5c");
  const tint = new THREE.Color();
  trees.forEach((tree, index) => {
    matrix.makeTranslation(tree.x, tree.y - 0.2, tree.z)
      .multiply(new THREE.Matrix4().makeRotationY(tree.yaw))
      .multiply(new THREE.Matrix4().makeScale(tree.scale, tree.scale, tree.scale));
    trunks.setMatrixAt(index, matrix);
    canopies.setMatrixAt(index, matrix);
    tint.copy(tree.tint < 0.5 ? leafA : leafB).lerp(leafC, Math.abs(tree.tint - 0.5) * 1.4);
    canopies.setColorAt(index, tint);
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  canopies.instanceColor.needsUpdate = true;
  for (const mesh of [trunks, canopies]) {
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.computeBoundingSphere();
  }
  trunks.name = "meadow-tree-trunks";
  canopies.name = "meadow-tree-canopies";
  const group = new THREE.Group();
  group.name = "meadow-trees";
  group.add(trunks, canopies);
  group.userData.trees = trees;
  return group;
}
