import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PORKY_MODEL_VARIANTS } from './porky-models.js';
import { VILLAGE_SITES, terrainHeightAt } from './surroundings.js';

export const PARTY_COLORS = ['#eaa2b8', '#a7c7ab', '#b8a4d5', '#efc66f', '#90c8d4'];
const CREAM = '#fff2d4';
const GOLD = '#d8a447';
// X/Z are in fitted model-height units, after the loader's authored rotation.
// Y is measured by a downward surface ray at this individually chosen crown.
export const BIRTHDAY_HAT_FITS = Object.freeze({
  'wild-piglet': { x: 0, z: -.40, size: .84, tilt: -.10 },
  daigua: { x: 0, z: -.05, size: .80, tilt: .10 },
  guadai: { x: 0, z: -.52, size: .72, tilt: -.15 },
  'big-ear-piglet': { x: 0, z: -.42, size: .82, tilt: .09 },
  'cozy-checker-piglet': { x: 0, z: .04, size: .80, tilt: -.10 },
  'muddy-piglet': { x: 0, z: .03, size: .86, tilt: .12 },
  'muscle-pig': { x: 0, z: -.10, size: .64, tilt: -.12 },
  'pampered-piglet': { x: -.10, z: -.25, size: .65, tilt: -.20 },
  'bbq-feast-pig': { x: 0, z: -.15, size: .77, tilt: .10 },
  'cleaning-day-piglet': { x: .10, z: -.12, size: .66, tilt: -.18 },
  'pop-star-pig': { x: 0, z: 0, size: .68, tilt: .12 },
  'sleepy-piglet': { x: .015, z: -.16, size: .62, tilt: -.30 },
  'smoky-city-swine': { x: 0, z: 0, size: .70, tilt: -.10 },
  'enchanted-librarian-pig': { x: -.03, z: -.04, size: .62, tilt: .16 },
  'watermelon-hat-pig': { x: -.07, z: 0, size: .60, tilt: -.18 },
  'four-legged-piglet': { x: 0, z: .40, size: .74, tilt: .13 },
  'gaming-piglet': { x: -.12, z: 0, size: .78, tilt: -.12 },
  'car-piglet': { x: 0, z: -.32, size: .75, tilt: .10 },
});

// Temporary authoring meshes are baked into a single vertex-colour draw.
export function partyBuilder() {
  const parts = [];
  const add = (geometry, color, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) => {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    g.deleteAttribute('uv');
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    g.applyMatrix4(matrix);
    const c = new THREE.Color(color), colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(g);
  };
  const sphere = (color, p, s) => add(new THREE.SphereGeometry(1, 12, 8), color, p, s);
  const box = (color, p, s, r) => add(new THREE.BoxGeometry(1, 1, 1), color, p, s, r);
  const tube = (points, radius, color) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 20, radius, 5, false), color);
  const finish = (name) => {
    const geometry = mergeGeometries(parts); parts.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .48, metalness: .08, side: THREE.DoubleSide }));
    mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  };
  return { add, sphere, box, tube, finish };
}

export function createBirthdayHat(index = 0) {
  const b = partyBuilder(), color = PARTY_COLORS[index % PARTY_COLORS.length];
  const bead = (color, position, scale) => b.add(new THREE.SphereGeometry(1, 8, 5), color, position, scale);
  b.add(new THREE.ConeGeometry(.19, .43, 32), color, [0, .215, 0]);
  b.add(new THREE.TorusGeometry(.185, .012, 6, 40), GOLD, [0, .035, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  // Individual cream pleats form a scalloped fabric rosette at the brim.
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    bead(CREAM, [Math.sin(a) * .19, .006, Math.cos(a) * .19], [.037, .022, .027]);
  }
  for (let row = 0; row < 3; row++) {
    const y = .10 + row * .093, r = .19 * (1 - y / .43) + .002;
    for (let j = 0; j < 7; j++) {
      const a = (j + row * .5) / 7 * Math.PI * 2;
      bead(row === 1 ? GOLD : CREAM, [Math.sin(a) * r, y, Math.cos(a) * r], [.015, .015, .015]);
    }
  }
  bead(CREAM, [0, .45, 0], [.052, .052, .052]);
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    bead(CREAM, [.037 * Math.sin(a), .45 + .02 * Math.cos(a * 2), .037 * Math.cos(a)], [.026, .028, .026]);
  }
  // A small gilded star is inset on the front of the satin cone.
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .023 : .052;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  b.add(new THREE.ExtrudeGeometry(shape, { depth: .008, bevelEnabled: false }), GOLD, [0, .19, .114], [1, 1, 1], [-.42, 0, 0]);
  return b.finish('birthday-hat');
}

export function fitBirthdayHat(hat, object, placement, state = object.userData.assetState) {
  const variant = PORKY_MODEL_VARIANTS[placement.variant];
  const fit = BIRTHDAY_HAT_FITS[placement.variant];
  const height = variant.height * (placement.modelScale ?? 1);
  let x, y, z, size;
  if (state !== 'ready') {
    const scale = placement.fallbackScale ?? variant.fallbackScale;
    x = 0; y = 2.01 * scale; z = -.55 * scale; size = scale * 1.45;
  } else {
    x = fit.x * height; z = fit.z * height; size = fit.size * height;
    // Work in model-group coordinates, independent of its scene placement.
    const model = object.children.find(child => child.name !== 'birthday-hat');
    model.updateWorldMatrix(true, true);
    const localToWorld = object.matrixWorld;
    const origin = new THREE.Vector3(x, height * 3, z).applyMatrix4(localToWorld);
    const direction = new THREE.Vector3(0, -1, 0).transformDirection(localToWorld);
    const hits = new THREE.Raycaster(origin, direction).intersectObject(model, true);
    if (!hits.length) throw new Error(`Birthday crown misses ${placement.variant}`);
    y = object.worldToLocal(hits[0].point.clone()).y - .025 * height;
  }
  hat.position.set(x, y, z);
  hat.scale.setScalar(size);
  hat.rotation.set(0, variant.rotationY ?? 0, fit.tilt);
  hat.userData.variant = placement.variant;
  hat.userData.assetState = state;
  return hat;
}

export const BIRTHDAY_TABLE = Object.freeze({ x: 8.4, z: 9.4, width: 3.2, depth: 1.55 });
export function birthdayColliders() {
  const { x, z, width, depth } = BIRTHDAY_TABLE;
  return [{ id: 'birthday-cake-table', minX: x - width / 2, maxX: x + width / 2,
    minZ: z - depth / 2, maxZ: z + depth / 2, minY: 0, maxY: 3 }];
}

export function createBirthdayDecorations() {
  const b = partyBuilder();
  const balloon = (x, y, z, color, bottom = .15) => {
    b.sphere(color, [x, y, z], [.32, .42, .32]);
    b.add(new THREE.ConeGeometry(.052, .09, 8), color, [x, y - .43, z]);
    b.tube([[x, y - .46, z], [x - .11, (y + bottom) / 2, z + .04], [x, bottom, z]], .008, GOLD);
  };
  const bouquet = (x, z, seed = 0) => {
    [[-.35, 2.4, 0], [.32, 2.65, .1], [0, 3.05, -.12], [.05, 2.1, .25]].forEach((p, i) => balloon(x + p[0], p[1], z + p[2], PARTY_COLORS[(i + seed) % 5]));
    b.box(GOLD, [x, .12, z], [.25, .22, .25]);
  };
  const bunting = (a, c, count) => {
    const points = Array.from({ length: 25 }, (_, i) => {const t = i / 24; return [THREE.MathUtils.lerp(a[0], c[0], t), THREE.MathUtils.lerp(a[1], c[1], t) - Math.sin(t * Math.PI) * .45, THREE.MathUtils.lerp(a[2], c[2], t)];});
    b.tube(points, .018, GOLD);
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1), p = [THREE.MathUtils.lerp(a[0], c[0], t), THREE.MathUtils.lerp(a[1], c[1], t) - Math.sin(t * Math.PI) * .45, THREE.MathUtils.lerp(a[2], c[2], t)];
      const shape = new THREE.Shape(); shape.moveTo(-.21, 0); shape.lineTo(.21, 0); shape.lineTo(0, -.55); shape.closePath();
      b.add(new THREE.ShapeGeometry(shape), PARTY_COLORS[i % 5], p);
      b.sphere(CREAM, [p[0], p[1] - .16, p[2] + .01], [.045, .045, .015]);
    }
  };
  const gift = (x, y, z, s, color) => {
    b.box(color, [x, y + s * .5, z], [s, s, s]);
    b.box(CREAM, [x, y + s * .5, z], [s * .14, s + .015, s + .025]);
    b.box(CREAM, [x, y + s * .5, z], [s + .025, s + .015, s * .14]);
    b.add(new THREE.TorusGeometry(s * .14, s * .025, 6, 16), GOLD, [x - s * .13, y + s * 1.06, z], [1, .55, 1], [.2, .3, .35]);
    b.add(new THREE.TorusGeometry(s * .14, s * .025, 6, 16), GOLD, [x + s * .13, y + s * 1.06, z], [1, .55, 1], [.2, -.3, -.35]);
  };
  // Gate and facade: above head height and outside the walking corridor.
  bouquet(-1.2, 40.5, 0); bouquet(5.2, 40.5, 2);
  for (const x of [-1.2, 5.2]) b.add(new THREE.CylinderGeometry(.035, .035, 3.9, 8), GOLD, [x, 1.95, 40.5]);
  bunting([-1.2, 3.9, 40.5], [5.2, 3.9, 40.5], 11);
  for (const x of [1.1, 2.9]) b.tube([[x, 3.5, 40.5], [x, 2.88, 40.5]], .009, GOLD);
  bouquet(-4.7, -1, 1); bouquet(4.7, -1, 3);
  bunting([-11, 5, -1.7], [0, 5, -1.7], 16);
  bunting([0, 5, -1.7], [11, 5, -1.7], 16);
  bouquet(-9.6, 23, 2); bouquet(-2.4, 23, 0);
  // A circular floral birthday wreath beside the mushroom portal.
  b.add(new THREE.TorusGeometry(.43, .055, 8, 36), '#8ba57c', [-8.2, 2.2, 23.2]);
  for (let i = 0; i < 12; i++) {const a = i / 12 * Math.PI * 2; b.sphere(PARTY_COLORS[i % 5], [-8.2 + Math.cos(a) * .43, 2.2 + Math.sin(a) * .43, 23.23], [.09, .09, .06]);}
  bouquet(16, 13.5, 1);
  // Cake table: tucked into the east lawn, visible from the normal arrival.
  const { x, z, width, depth } = BIRTHDAY_TABLE;
  b.box(CREAM, [x, 1, z], [width, .16, depth]);
  b.box('#e6b9bb', [x, .79, z], [width - .02, .35, depth - .02]);
  for (const dx of [-1.3, 1.3]) for (const dz of [-.5, .5]) b.box(GOLD, [x + dx, .42, z + dz], [.08, .84, .08]);
  b.box('#abc5a0', [x, 1.09, z], [.6, .025, depth + .02]);
  for (let i = 0; i < 20; i++) b.sphere(CREAM, [x - 1.5 + i * 3 / 19, .64, z + depth / 2], [.10, .07, .035]);
  b.add(new THREE.CylinderGeometry(.7, .7, .06, 48), GOLD, [x, 1.16, z]);
  b.add(new THREE.CylinderGeometry(.61, .61, .36, 48), CREAM, [x, 1.37, z]);
  b.add(new THREE.CylinderGeometry(.43, .43, .29, 48), '#d1dfb3', [x, 1.69, z]);
  for (const [r, y, n] of [[.60, 1.55, 26], [.43, 1.84, 20], [.60, 1.21, 26]]) {
    for (let i = 0; i < n; i++) {const a = i / n * Math.PI * 2; b.sphere(CREAM, [x + r * Math.sin(a), y, z + r * Math.cos(a)], [.055, .045, .055]);}
  }
  // Cabbage topper: overlapping leaves surrounding a pale leafy heart.
  b.sphere('#e2edc3', [x, 2.02, z], [.18, .22, .18]);
  for (let i = 0; i < 7; i++) {const a = i / 7 * Math.PI * 2; b.sphere(i % 2 ? '#a3be75' : '#c1d894', [x + .13 * Math.sin(a), 1.98, z + .13 * Math.cos(a)], [.11, .17, .09]);}
  for (const dx of [-.32, .32]) {b.add(new THREE.CylinderGeometry(.021, .021, .23, 10), '#ecbb7e', [x + dx, 1.96, z]); b.sphere('#ffd87a', [x + dx, 2.12, z], [.028, .057, .028]);}
  b.add(new THREE.CylinderGeometry(.09, .13, .20, 16), '#c7d7b1', [x - 1.12, 1.20, z - .48]);
  for (let i = 0; i < 3; i++) {
    const fx = x - 1.12 + (i - 1) * .09, fy = 1.55 + (i % 2) * .12;
    b.tube([[x - 1.12, 1.25, z - .48], [fx, fy, z - .48]], .012, '#7b9e69');
    for (let k = 0; k < 5; k++) {const a = k * Math.PI * 2 / 5; b.sphere(PARTY_COLORS[i], [fx + .065 * Math.cos(a), fy + .065 * Math.sin(a), z - .48], [.05, .05, .025]);}
    b.sphere(GOLD, [fx, fy, z - .45], [.03, .03, .02]);
  }
  gift(x - 1.13, 1.1, z, .43, PARTY_COLORS[2]); gift(x + 1.1, 1.1, z, .40, PARTY_COLORS[0]);
  bouquet(x - 2, z - .3, 2); bouquet(x + 2, z - .3, 0);
  // Small party parcels stay on existing peripheral surfaces / grass edges.
  gift(16, .03, 14.2, .32, PARTY_COLORS[2]); gift(-10, .03, 23, .28, PARTY_COLORS[1]);
  const mesh = b.finish('annual-birthday-decorations');
  mesh.userData.table = BIRTHDAY_TABLE;
  return mesh;
}

export function createVillageBirthdayHats() {
  const group = new THREE.Group(); group.name = 'village-birthday-hats';
  let index = 0;
  for (const site of VILLAGE_SITES) for (const pig of site.pigs) {
    const hat = createBirthdayHat(index++);
    const pivot = new THREE.Group();
    pivot.position.set(site.x + pig.x, terrainHeightAt(site.x + pig.x, site.z + pig.z) - .02, site.z + pig.z);
    pivot.rotation.y = pig.yaw;
    hat.position.set(0, 2.01 * .58, -.55 * .58); hat.scale.setScalar(.84); hat.rotation.z = .1;
    hat.castShadow = false; pivot.add(hat); group.add(pivot);
  }
  return group;
}

export function disposeParty(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(o => {if (o.isMesh) {geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);}});
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}



// Install/remove only this celebration's colliders without replacing the world.
export function installBirthdayColliders(world) {
  const colliders = birthdayColliders();
  world.colliders.push(...colliders);
  return () => { world.colliders = world.colliders.filter(c => !colliders.includes(c)); };
}
