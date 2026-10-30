// Browser-independent, reference-inspired characters. Each instance owns its resources.
import * as THREE from 'three';
import { studio, batchMiniature } from './miniature.js';
import { sculptClayPig } from './clay-pig.js';

const P = { skin: '#efb1a5', pink: '#dc8d86', hair: '#d98f86', dark: '#34333b', seam: '#494650', eye: '#29232a', blush: '#e79791', cream: '#f4e9c4', leaf: '#78964a', lightLeaf: '#acc276', vein: '#dfdfaa' };

function tube(s, color, points, radius, segments = 16) {
  return s.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 6, false), color);
}

function leafGeometry(width, height, curl = 0.025) {
  const positions = []; const indices = []; const rows = 16; const columns = 12;
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const breadth = width * Math.pow(Math.sin(Math.PI * v), 0.45) * (1 + 0.09 * Math.sin(v * Math.PI * 11));
    for (let i = 0; i <= columns; i++) {
      const u = i / columns * 2 - 1;
      const ruffle = Math.sin(v * Math.PI * 9 + u * 2) * 0.008 * Math.pow(Math.abs(u), 3) * Math.sin(Math.PI * v);
      positions.push(u * breadth, v * height, curl * v * v + 0.021 * u * u * Math.sin(Math.PI * v) + ruffle);
      if (j < rows && i < columns) {
        const a = j * (columns + 1) + i; const b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function leaf(s, color, position, width, height, rotation = [0, 0, 0], curl = 0.025) {
  const mesh = s.mesh(leafGeometry(width, height, curl), color, position);
  mesh.rotation.set(...rotation); mesh.material.side = THREE.DoubleSide;
  // Veins follow the same local surface and transform as the leaf.
  const points = [0.07, 0.4, 0.7, 0.94].map(v => [0, height * v, curl * v * v + 0.002]);
  const vein = tube(s, P.vein, points, 0.0022, 12);
  vein.position.copy(mesh.position); vein.rotation.copy(mesh.rotation);
  for (const v of [0.3, 0.52, 0.7]) for (const side of [-1, 1]) {
    const end = v + 0.14;
    const branch = tube(s, P.vein, [[0, height * v, curl * v * v + 0.003], [side * width * 0.32, height * (v + 0.07), curl * (v + 0.07) ** 2 + 0.005], [side * width * Math.sin(Math.PI * end) * 0.7, height * end, curl * end * end + 0.013]], 0.0011, 6);
    branch.position.copy(mesh.position); branch.rotation.copy(mesh.rotation);
  }
  return mesh;
}

function cabbage(s) {
  s.ball(P.cream, [0, 0.205, 0], [0.115, 0.187, 0.088]);
  // Outer leaves wrap the back; the front stays open so the face is readable.
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 * 1.48 + 0.26) * Math.PI;
    leaf(s, i % 2 ? P.leaf : P.lightLeaf, [Math.sin(a) * 0.072, 0.045, Math.cos(a) * 0.056], 0.067, 0.33 + (i % 3) * 0.022, [0, a, -Math.sin(a) * 0.16], 0.055);
  }
  for (let i = 0; i < 5; i++) {
    leaf(s, P.lightLeaf, [(i - 2) * 0.032, 0.268, -0.025], 0.032, 0.135 + (i % 2) * 0.014, [-0.15, (i - 2) * 0.23, (2 - i) * 0.22], 0.028);
  }
  for (const side of [-1, 1]) {
    // Cream front leaves frame the face and meet at the base.
    leaf(s, P.cream, [side * 0.035, 0.042, 0.059], 0.046, 0.27, [0.05, side * 0.7, side * -0.18], 0.019);
    s.ball(P.eye, [side * 0.04, 0.259, 0.086], [0.011, 0.016, 0.007]);
    s.ball('#fff3db', [side * 0.04 - 0.003, 0.265, 0.092], [0.003, 0.004, 0.002]);
    s.ball(P.blush, [side * 0.071, 0.227, 0.076], [0.022, 0.012, 0.006]);
    s.ball(P.leaf, [side * 0.052, 0.018, 0.024], [0.043, 0.023, 0.045]);
    for (let toe = 0; toe < 3; toe++) s.ball(P.lightLeaf, [side * 0.052 + (toe - 1) * 0.018, 0.011, 0.055], [0.013, 0.012, 0.018]);
  }
  s.ball('#783f42', [0, 0.218, 0.089], [0.021, 0.024, 0.006]);
  s.ball(P.blush, [0, 0.207, 0.094], [0.013, 0.009, 0.003]);
  leaf(s, P.leaf, [-0.095, 0.12, 0.03], 0.035, 0.123, [0.15, -0.5, -0.9], 0.018);
  leaf(s, P.lightLeaf, [0.097, 0.17, 0.01], 0.035, 0.155, [0, 0.35, -0.65], 0.025);
}

export function createBirthdayCharacter(kind) {
  if (!['little-pig', 'bai-baicai'].includes(kind)) throw new RangeError(`Unknown birthday character: ${kind}`);
  const s = studio();
  if (kind === 'little-pig') sculptClayPig(s); else cabbage(s);
  const root = batchMiniature(s.root); root.name = kind;
  root.userData.characterDesign = kind === 'little-pig' ? 'clay-pig-v2' : 'pink-hair-hoodie-and-napa-v1';
  return root;
}