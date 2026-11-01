// Node-pure architecture, display placement and walking boundaries for The Hangar.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seanExhibits, SEAN_GALLERY_OBSTACLES } from './sean-exhibits.js';

export const HANGAR_SPAWN = [0, 1.8, 10.2];
export const HANGAR_LOOK = { yaw: 0, pitch: .09 };
export const HANGAR_SPEED = 2.8;
export const HANGAR_RADIUS = .22;
export const HANGAR_BOUNDS = { minX: -12.6, maxX: 12.6, minZ: -10.6, maxZ: 11.65 };
export const HANGAR_PORTALS = [-6.2, 1.8, 9.8];
export const HANGAR_PLINTH_RADIUS = 3.29;
export const HANGAR_OBSTACLES = [
  ...SEAN_GALLERY_OBSTACLES,
  [-11.4, -9.6, -7.1, -.5], [9.6, 11.4, -7.1, -.5],
  [-3.95, 3.95, -10.9, -10.15],
  ...HANGAR_PORTALS.flatMap(z => [-8, 8].map(x => [x - .45, x + .45, z - .18, z + .83])),
];
const shelfZ = [-6.2, -4.55, -2.9, -1.25];
export const HANGAR_DISPLAYS = [
  ...['f14-tomcat', 'f15e-strike-eagle', 'f16-fighting-falcon', 'fa18-hornet'].map((id, i) => ({ id, position: [-10.5, 1.37, shelfZ[i]], size: [1.45, .75, 1.4], rotation: [0, Math.PI / 2, 0] })),
  ...['sd-gundam', 'zz-gundam-verka', 'cessna-172', 'diamond-da20-c1'].map((id, i) => ({ id, position: [10.5, 1.37, shelfZ[i]], size: [1.45, 1.8, 1.4], rotation: [0, -Math.PI / 2, 0] })),
];
export function isHangarWalkable(x, z) {
  const b = HANGAR_BOUNDS, r = HANGAR_RADIUS;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
  if (z < 2 && Math.hypot(x, z - 2) > 12.65) return false;
  if (Math.hypot(x, z) < HANGAR_PLINTH_RADIUS + r) return false;
  return !HANGAR_OBSTACLES.some(([x0, x1, z0, z1]) => x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r);
}
export function moveInHangar(position, dx, dz) {
  let [x, y, z] = position;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .08));
  for (let i = 0; i < steps; i++) {
    const nx = THREE.MathUtils.clamp(x + dx / steps, HANGAR_BOUNDS.minX, HANGAR_BOUNDS.maxX);
    if (isHangarWalkable(nx, z)) x = nx;
    const nz = THREE.MathUtils.clamp(z + dz / steps, HANGAR_BOUNDS.minZ, HANGAR_BOUNDS.maxZ);
    if (isHangarWalkable(x, nz)) z = nz;
  }
  return [x, y, z];
}

export function createHangarAtelier() {
  const root = new THREE.Group(); root.name = 'workshop-interior';
  const mats = new Map(), parts = new Map();
  const material = (color, metalness = .45, roughness = .42, brushed = false, extra = {}) => {
    const key = JSON.stringify([color, metalness, roughness, brushed, extra]);
    if (!mats.has(key)) mats.set(key, new THREE.MeshPhysicalMaterial({ color, metalness, roughness, anisotropy: brushed ? .55 : 0, ...extra }));
    return mats.get(key);
  };
  // Batch by semantic group and material, retaining UVs for anisotropic metal.
  const add = (name, geometry, position, mat, rotation = [0, 0, 0]) => {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
    geometry.applyMatrix4(matrix);
    const key = name + ':' + mat.uuid;
    if (!parts.has(key)) parts.set(key, { name, mat, geometries: [] });
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    parts.get(key).geometries.push(flat);
  };
  const box = (name, p, size, color, metal = .45, rough = .42, brushed = false, rotation = [0, 0, 0]) => add(name, new THREE.BoxGeometry(...size), p, material(color, metal, rough, brushed), rotation);
  const strip = (name, p, size, color = '#c2e1eb', intensity = .65) => add(name, new THREE.BoxGeometry(...size), p, material(color, 0, .42, false, { emissive: color, emissiveIntensity: intensity }));
  const cylinder = (name, p, args, color, metal, rough, extra = {}, rotation) => add(name, new THREE.CylinderGeometry(...args), p, material(color, metal, rough, false, extra), rotation);
  box('hangar-shell', [0, -.06, .5], [26.2, .06, 23.2], '#a4b1b8', .48, .5);
  add('hangar-shell', new THREE.BoxGeometry(26.2, .1, 23.2), [0, 8.78, .5], material('#d7dbd7', .08, .7, false, { emissive: '#d7dbd7', emissiveIntensity: .12 }));
  cylinder('hangar-shell', [0, 4.3, 2], [13, 13, 8.6, 96, 1, true, Math.PI / 2, Math.PI], '#d9d3c6', .08, .72, { side: THREE.DoubleSide });
  for (let i = 0; i < 17; i++) {
    const a = Math.PI / 2 + i * Math.PI / 16;
    box('hangar-shell', [Math.sin(a) * 12.95, 4.1, 2 + Math.cos(a) * 12.95], [.035, 8.2, .035], '#bac0be', .25, .42, false, [0, a, 0]);
  }
  // Close the previously camera-only set for visitors who can walk and turn around.
  for (const x of [-13, 13]) {
    box('hangar-shell', [x, 4.3, 7], [.16, 8.6, 10.2], '#d9d3c6', .08, .72);
    box('hangar-shell', [x * .991, 1.1, 7], [.04, 1.75, 10.2], '#aebbbb', .48, .48);
  }
  for (const x of [-7.25, 7.25]) box('hangar-entry', [x, 4.3, 12], [11.5, 8.6, .2], '#d9d3c6', .08, .72);
  box('hangar-entry', [0, 5.95, 12], [3, 5.3, .2], '#d9d3c6', .08, .72);
  box('hangar-entry', [0, 1.65, 12.05], [3, 3.3, .12], '#9aaeb5', .6, .35);
  for (const x of [-1.6, 1.6]) box('hangar-entry', [x, 1.7, 11.85], [.15, 3.4, .2], '#bac5c7', .7, .32);
  box('hangar-entry', [0, 3.4, 11.85], [3.35, .15, .2], '#bac5c7', .7, .32);
  strip('hangar-entry', [0, 3.27, 11.72], [2.8, .025, .025]);
  box('hangar-entry', [0, 1.65, 11.96], [.025, 3.2, .02], '#526c78', .6, .4);
  box('hangar-entry', [0, 8.65, 11.15], [26, .2, 1.7], '#d7dbd7', .18);
  box('hangar-shell', [0, 8.65, -9], [26, .2, 4], '#d7dbd7', .18);
  for (const x of [-10.6, 10.6]) box('hangar-shell', [x, 8.65, 2], [4.8, .2, 18], '#d7dbd7', .18);
  box('hangar-service-wall', [0, 4.2, -10.78], [7.8, 6.8, .24], '#778d97', .65, .36, true);
  box('hangar-service-wall', [0, 4.2, -10.59], [7.58, 6.55, .12], '#a3b0b6', .65, .34, true);
  box('hangar-service-wall', [0, 4.9, -10.48], [7.18, 4.9, .13], '#bac4c6', .42, .45);
  for (const x of [-3.67, 3.67]) strip('hangar-service-wall', [x, 4.25, -10.48], [.026, 6.1, .03], '#c2e1eb', .55);
  box('hangar-service-wall', [0, 1.8, -10.42], [7.1, 1.1, .14], '#6e838d', .6);
  for (let i = 0; i < 9; i++) box('hangar-service-wall', [0, 1.35 + i * .11, -10.31], [6.9, .047, .12], '#a0afb4', .75, .3, true);
  for (const x of [-3.45, 3.45]) for (const y of [1.1, 7.2]) cylinder('hangar-service-wall', [x, y, -10.3], [.05, .05, .02, 6], '#617a86', .8, .25, {}, [Math.PI / 2, 0, 0]);
  for (const [i, y] of [.2, 2.1, 7.65].entries()) cylinder('hangar-shell', [0, y, 2], [12.9, 12.9, i === 0 ? .32 : .12, 96, 1, true, Math.PI / 2, Math.PI], i === 0 ? '#85989f' : '#a5b1b4', .68, .32, { side: THREE.DoubleSide });
  cylinder('hangar-shell', [0, 1.1, 2], [12.94, 12.94, 1.75, 96, 1, true, Math.PI / 2, Math.PI], '#aebbbb', .48, .48, { side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const angle = -side * .35;
    const panel = (local, size, color, metal, rough, brushed) => {
      const p = new THREE.Vector3(...local).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(new THREE.Vector3(side * 6.15, 0, -8.8));
      box('hangar-louvres', p.toArray(), size, color, metal, rough, brushed, [0, angle, 0]);
    };
    panel([0, 4.8, 0], [2.05, 3.6, .18], '#8fa1a6', .6, .38);
    for (let i = 0; i < 10; i++) panel([-.88 + i * .196, 4.8, .13], [.09, 3.5, .15], '#a9b1ae', .42, .43, true);
    panel([0, 2.85, .08], [2.1, .08, .3], '#b2a38b', .65, .35);
  }
  const profile = new THREE.Shape();
  profile.moveTo(-8.3, 0); profile.lineTo(-8.3, 6.2); profile.quadraticCurveTo(-8.3, 8.5, -6, 8.5); profile.lineTo(6, 8.5); profile.quadraticCurveTo(8.3, 8.5, 8.3, 6.2); profile.lineTo(8.3, 0); profile.lineTo(7.7, 0); profile.lineTo(7.7, 6.2); profile.quadraticCurveTo(7.7, 7.9, 6, 7.9); profile.lineTo(-6, 7.9); profile.quadraticCurveTo(-7.7, 7.9, -7.7, 6.2); profile.lineTo(-7.7, 0); profile.closePath();
  for (const z of HANGAR_PORTALS) {
    add('hangar-portals', new THREE.ExtrudeGeometry(profile, { depth: .65, bevelEnabled: true, bevelSize: .045, bevelThickness: .045, bevelSegments: 3, steps: 1, curveSegments: 20 }), [0, 0, z], material('#9baab0', .68, .32));
    for (const x of [-8, 8]) {
      box('hangar-portals', [x, .3, z + .33], [.9, .6, 1], '#a1adb1');
      box('hangar-portals', [x, 3.55, z + .705], [.37, 5.35, .035], '#b7c1c2', .62, .36, true);
      box('hangar-portals', [x, 3.55, z + .733], [.045, 4.9, .02], '#8a9b9f', .65);
      for (const y of [1.05, 5.8]) for (const dx of [-.12, .12]) cylinder('hangar-portals', [x + dx, y, z + .75], [.035, .035, .018, 6], '#657b86', .8, .3, {}, [Math.PI / 2, 0, 0]);
      strip('hangar-portals', [x + (x < 0 ? .32 : -.32), 3.25, z + .34], [.025, 5.5, .2]);
      for (const y of [.8, 5.9]) box('hangar-portals', [x, y, z + .71], [.32, .055, .035], '#7f9199', .75);
    }
    box('hangar-portals', [0, 8.2, z + .71], [11.5, .2, .04], '#d0d6d5', .75, .25, true);
    for (const x of [-5, -2.5, 0, 2.5, 5]) box('hangar-portals', [x, 8.2, z + .75], [.025, .21, .025], '#6e828b');
  }
  for (const z of [-2, 6]) {
    box('hangar-skylights', [0, 8.65, z], [16.6, .2, 7.25], '#d7dbd7', .18);
    for (const x of [-4.1, 0, 4.1]) {
      box('hangar-skylights', [x, 8.49, z], [3.65, .15, 6.4], '#9fadb0');
      strip('hangar-skylights', [x, 8.395, z], [3.4, .035, 6.1], '#f4f4ea', .8);
      for (const dz of [-2, 0, 2]) box('hangar-skylights', [x, 8.35, z + dz], [3.5, .07, .045], '#9fafb4');
    }
  }
  for (const x of [-10.5, 10.5]) {
    box('hangar-side-displays', [x, .65, -3.8], [1.7, 1.3, 6.5], '#9dadaf', .6, .38, true);
    box('hangar-side-displays', [x, 1.32, -3.8], [1.8, .1, 6.6], '#e0ddd3', .2);
    for (let i = 0; i < 14; i++) box('hangar-side-displays', [x, .72, -6.6 + i * .43], [1.72, .55, .024], '#758b94');
  }
  // Entrance-wall shelves protect Sean's works without narrowing the main aisles.
  for (const [x0, x1, z0, z1] of SEAN_GALLERY_OBSTACLES) {
    const x = (x0 + x1) / 2;
    box('hangar-sean-displays', [x, 1.7, z1], [x1 - x0, 3.4, .06], '#778d97', .6, .4);
    box('hangar-sean-displays', [x, .35, (z0 + z1) / 2], [x1 - x0, .7, z1 - z0], '#9dadaf', .6, .38, true);
    for (const item of seanExhibits.filter(item => item.position[0] === x)) {
      box('hangar-sean-displays', [x, item.position[1] - .04, item.position[2]], [x1 - x0, .08, 1.1], '#e0ddd3', .2);
      strip('hangar-sean-displays', [x, item.position[1] - .04, z0], [2.1, .02, .02]);
    }
  }
  for (const x of [-12, -8, -4, 0, 4, 8, 12]) box('hangar-floor-seams', [x, -.008, .5], [.012, .003, 23], '#98a6a9', .45, .8);
  for (const z of [-10, -6, -2, 2, 6, 10]) box('hangar-floor-seams', [0, -.008, z], [26, .003, .012], '#98a6a9', .45, .8);
  cylinder('hangar-plinth', [0, .07, 0], [3.12, 3.2, .14, 96], '#788b94', .7, .32);
  cylinder('hangar-plinth', [0, .18, 0], [3.29, 3.29, .1, 96], '#c3c9c7', .86, .24);
  cylinder('hangar-plinth', [0, .239, 0], [3.25, 3.25, .018, 96], '#a9d3df', .4, .4, { emissive: '#a9d3df', emissiveIntensity: .35 });
  cylinder('hangar-plinth', [0, .318, 0], [3.2, 3.25, .124, 96], '#879ca6', .72, .32);
  add('hangar-plinth', new THREE.RingGeometry(2.91, 2.925, 96), [0, .383, 0], material('#5b737e', .7, .35), [-Math.PI / 2, 0, 0]);
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    box('hangar-plinth', [Math.sin(a) * 3.03, .384, Math.cos(a) * 3.03], [.018, .006, i % 3 === 0 ? .14 : .065], '#637c87', .45, .42, false, [0, a, 0]);
    if (i % 3 === 0) cylinder('hangar-plinth', [Math.sin(a) * 3.13, .385, Math.cos(a) * 3.13], [.029, .029, .009, 6], '#72868f', .8, .25);
  }
  for (const { name, mat, geometries } of parts.values()) {
    let group = root.getObjectByName(name);
    if (!group) { group = new THREE.Group(); group.name = name; root.add(group); }
    const merged = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, mat); mesh.receiveShadow = true;
    mesh.castShadow = ['hangar-portals', 'hangar-plinth', 'hangar-side-displays'].includes(name);
    group.add(mesh);
  }
  return root;
}
