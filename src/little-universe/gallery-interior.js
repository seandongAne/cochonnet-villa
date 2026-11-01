// Node-pure architecture and metre-scale layout for the gallery alone.
import * as THREE from 'three';
import { studio, batchMiniature } from './miniature.js';

export const GALLERY_SPAWN = [0, 1.65, 4.7];
export const GALLERY_BOUNDS = { minX: -4.72, maxX: 4.72, minZ: -5.72, maxZ: 5.72 };
export const GALLERY_SPEED = 2.15;
export const GALLERY_FRAME_SIZE = [2.05, 1.37];
export const GALLERY_SLOTS = [
  { position: [-3.2, 2.12, -5.86], rotation: 0, size: [1.75, 1.17] },
  { position: [0, 2.12, -5.86], rotation: 0, size: [2.5, 1.67] },
  { position: [3.2, 2.12, -5.86], rotation: 0, size: [1.75, 1.17] },
  ...[-2.6, -.4, 1.8].map((z, i) => ({ position: [-4.86, 2.12, z], rotation: Math.PI / 2, size: i === 1 ? GALLERY_FRAME_SIZE : [1.65, 1.1] })),
  ...[-2.6, -.4, 1.8].map((z, i) => ({ position: [4.86, 2.12, z], rotation: -Math.PI / 2, size: i === 1 ? GALLERY_FRAME_SIZE : [1.65, 1.1] })),
];
export const GALLERY_ARCHES = [-3.7, 2.9];
export const GALLERY_BENCH = { x: 3.8, z: 4.55, width: 2.05, depth: .72 };
export const GALLERY_PLINTHS = [{ x: -3.9, z: 4.25, width: .65 }, { x: -2.6, z: 4.55, width: .62 }];
export const GALLERY_OBSTACLES = [
  [2.725, 4.875, 4.14, 4.96],
  ...GALLERY_PLINTHS.map(({ x, z, width }) => [x - width / 2, x + width / 2, z - width / 2, z + width / 2]),
  [-4.58, -3.92, -5.48, -4.82],
  ...GALLERY_ARCHES.flatMap(z => [-4.78, 4.78].map(x => [x - .22, x + .22, z - .18, z + .18])),
];

// An arch path, with a semicircular head and straight jambs.
function archPath(width, height, bottom = 0, cx = 0, path = new THREE.Shape()) {
  const r = width / 2, spring = bottom + height - r;
  path.moveTo(cx - r, bottom); path.lineTo(cx + r, bottom);
  path.lineTo(cx + r, spring);
  path.absarc(cx, spring, r, 0, Math.PI, false);
  path.lineTo(cx - r, bottom); path.closePath();
  return path;
}
const extrude = shape => new THREE.ExtrudeGeometry(shape, { depth: .16, bevelEnabled: false, curveSegments: 24 });

export function createGalleryRoom() {
  const materials = new Map();
  const s = studio(materials);
  const wall = '#f7f2e9', trim = '#e9decd', oak = '#cdb08a', cream = '#fff8eb';
  const box = (color, p, size) => s.mesh(new THREE.BoxGeometry(...size), color, p);
  const beam = (a, b, width = .16, color = oak) => {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), d = bv.clone().sub(av);
    const mesh = box(color, av.add(bv).multiplyScalar(.5).toArray(), [width, d.length(), width]);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return mesh;
  };
  // Long staggered oak boards, subtle grain lines, no texture downloads.
  box('#c5a781', [0, -.09, 0], [10.16, .18, 12.16]);
  const woods = ['#ddc5a4', '#e3ceaf', '#d8bd99', '#e6d2b4', '#dfc6a4'];
  for (let col = 0; col < 25; col++) {
    const x = -4.8 + col * .4;
    for (let row = 0; row < 5; row++) {
      const start = Math.max(-6, -7.2 + row * 3 + (col % 3) * .8);
      const end = Math.min(6, -4.2 + row * 3 + (col % 3) * .8);
      if (end <= start) continue;
      box(woods[(col * 3 + row) % woods.length], [x, .006, (start + end) / 2], [.394, .012, end - start - .012]);
      for (let g = 0; g < 2; g++) box('#d3b792', [x - .11 + g * .19, .013, (start + end) / 2], [.004, .001, (end - start) * .7]);
    }
  }
  // Side walls have genuine arched openings at the quiet ends of each gallery.
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-6, 0); shape.lineTo(6, 0); shape.lineTo(6, 4.3); shape.lineTo(-6, 4.3); shape.closePath();
    for (const z of [-4.65, 4.45]) shape.holes.push(archPath(1.75, 3.25, .55, side * z, new THREE.Path()));
    const mesh = s.mesh(extrude(shape), wall, [side * 5, 0, 0]);
    mesh.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    box(trim, [side * 4.96, .12, 0], [.06, .24, 12]);
  }
  // Solid gable walls; the entrance is a tall, recessed rounded door.
  for (const z of [-6, 6]) {
    const shape = new THREE.Shape();
    shape.moveTo(-5, 0); shape.lineTo(5, 0); shape.lineTo(5, 4.3);
    shape.lineTo(0, 6.6); shape.lineTo(-5, 4.3); shape.closePath();
    s.mesh(extrude(shape), wall, [0, 0, z === -6 ? -6.16 : 6]);
  }
  box(trim, [0, .12, -5.96], [10, .24, .06]);
  const door = s.mesh(new THREE.ShapeGeometry(archPath(1.9, 3.1)), '#b6c5b5', [0, 0, 5.97]);
  door.rotation.y = Math.PI;
  for (const x of [-1.04, 1.04]) s.box(oak, [x, 1.08, 5.91], [.13, 2.16, .16]);
  const doorArch = new THREE.Shape();
  doorArch.absarc(0, 2.15, 1.08, 0, Math.PI, false);
  doorArch.absarc(0, 2.15, .95, Math.PI, 0, true); doorArch.closePath();
  const da = s.mesh(new THREE.ShapeGeometry(doorArch), oak, [0, 0, 5.9]); da.rotation.y = Math.PI;
  for (const x of [-.48, .48]) box('#c8d3c2', [x, 1.22, 5.94], [.8, 2.25, .02]);
  s.ball('#ad926b', [.16, 1.15, 5.86], [.035, .035, .035]);

  // Garden-colored glazing sits beyond the cutouts. All details remain in the aperture.
  for (const side of [-1, 1]) for (const z of [-4.65, 4.45]) {
    const w = studio(materials);
    w.mesh(new THREE.ShapeGeometry(archPath(1.75, 3.25, .55)), '#d4e8e5', [0, 0, -.025], [1, 1, 1], .22);
    w.box('#e5eedc', [0, .93, 0], [1.72, .73, .02]);
    for (let i = 0; i < 5; i++) {
      const x = -.62 + i * .3;
      w.ball(i % 2 ? '#b9cdb0' : '#c6d8b7', [x, 1.08 + (i % 3) * .14, .02], [.23, .23, .04]);
      w.ball('#e8cfcd', [x + .06, 1.12 + (i % 3) * .14, .07], [.06, .065, .025]);
    }
    const border = archPath(1.96, 3.46, .45);
    border.holes.push(archPath(1.75, 3.25, .55, 0, new THREE.Path()));
    w.mesh(extrude(border), trim, [0, 0, .04]);
    for (const x of [-.43, 0, .43]) w.box(cream, [x, 1.92, .16], [.035, 2.63, .055]);
    for (const y of [1.35, 2.2, 2.93]) w.box(cream, [0, y, .16], [1.74, .035, .055]);
    w.box(oak, [0, .53, .2], [2.08, .09, .38]);
    w.root.position.set(side * 4.99, 0, z);
    w.root.rotation.y = -side * Math.PI / 2;
    s.root.add(w.root);
  }
  // Vaulted roof with an open glazed ridge; rafters follow its actual pitch.
  const pitch = Math.atan2(2.3, 5), roofY = x => 6.6 - Math.abs(x) * 2.3 / 5;
  for (const side of [-1, 1]) {
    const roof = box('#f5eee2', [side * 3.3, roofY(3.3), 0], [3.4 / Math.cos(pitch), .14, 12.2]);
    roof.rotation.z = -side * pitch;
    const glass = s.mesh(new THREE.BoxGeometry(1.6 / Math.cos(pitch), .035, 11.8), '#d6e7e5', [side * .8, roofY(.8), 0], [1, 1, 1], .28);
    glass.rotation.z = -side * pitch;
    beam([side * 1.6, roofY(1.6) - .07, -6], [side * 1.6, roofY(1.6) - .07, 6], .12, cream);
  }
  beam([0, 6.52, -6], [0, 6.52, 6], .2);
  for (const z of [-5.7, -3.7, -.4, 2.9, 5.7]) for (const side of [-1, 1]) {
    beam([side * 4.96, 4.23, z], [0, 6.51, z], .17);
  }
  // Broad shallow arches divide the volume without placing anything in the aisle.
  for (const z of GALLERY_ARCHES) {
    const outer = new THREE.Shape();
    outer.moveTo(-5, 0); outer.lineTo(-4.55, 0); outer.lineTo(-4.55, 3.45);
    outer.bezierCurveTo(-4.55, 6.1, 4.55, 6.1, 4.55, 3.45);
    outer.lineTo(4.55, 0); outer.lineTo(5, 0); outer.lineTo(5, 4.3);
    outer.lineTo(0, 6.6); outer.lineTo(-5, 4.3); outer.closePath();
    s.mesh(extrude(outer), wall, [0, 0, z - .08]);
    for (const side of [-1, 1]) {
      box(trim, [side * 4.76, .13, z], [.46, .26, .34]);
      box(trim, [side * 4.78, 3.42, z], [.42, .08, .26]);
    }
  }
  // Thin champagne/oak frames and quiet ivory mounts, aligned on one sightline.
  for (const slot of GALLERY_SLOTS) {
    const f = studio(materials), [w, h] = slot.size;
    f.box(oak, [0, 0, 0], [w + .19, h + .19, .08]);
    f.box(cream, [0, 0, .045], [w + .11, h + .11, .025]);
    f.root.position.set(...slot.position); f.root.rotation.y = slot.rotation; s.root.add(f.root);
    const normal = new THREE.Vector3(Math.sin(slot.rotation), 0, Math.cos(slot.rotation));
    const target = new THREE.Vector3(...slot.position);
    const lamp = target.clone().addScaledVector(normal, .85); lamp.y = 3.86;
    const fixture = s.cylinder('#eee5d8', lamp.toArray(), .085, .22);
    fixture.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), target.sub(lamp).normalize());
    s.ball('#fff2d5', lamp.clone().add(new THREE.Vector3(0, -.1, 0)).toArray(), [.062, .035, .062], .6);
  }
  for (const x of [-3.95, 3.95]) box('#ddd3c2', [x, 3.99, -.25], [.055, .065, 6.8]);
  box('#ddd3c2', [0, 3.99, -4.95], [7.8, .065, .055]);

  // Soft paper lanterns, deliberately high above the uninterrupted central walk.
  for (const [z, y, radius] of [[1.5, 4.55, .35], [-1.4, 4.85, .3], [-4.6, 4.35, .24]]) {
    beam([0, 6.45, z], [0, y, z], .012, oak);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      s.ball('#ffefd3', [Math.cos(a) * radius * .48, y, z + Math.sin(a) * radius * .48], [radius * .66, radius * .78, radius * .66], .22);
    }
    s.cylinder(cream, [0, y - radius * .7, z], radius * .25, .04);
  }
  // A reading bench and daisy cushion in the front-right alcove.
  const { x: bx, z: bz, width: bw, depth: bd } = GALLERY_BENCH;
  s.box(oak, [bx, .46, bz], [bw, .14, bd]);
  s.box(cream, [bx, .58, bz], [bw - .08, .16, bd - .04]);
  for (const x of [bx - .8, bx + .8]) for (const z of [bz - .24, bz + .24]) s.box(oak, [x, .23, z], [.08, .46, .08]);
  s.box('#e4c8c2', [bx + .55, .78, bz + .17], [.47, .43, .14]).rotation.z = -.12;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    s.ball(cream, [bx - .52 + Math.cos(a) * .19, .83 + Math.sin(a) * .19, bz + .14], [.13, .13, .09]);
  }
  s.ball('#e2bd76', [bx - .52, .83, bz + .23], [.11, .11, .06]);
  // Low-profile flower rug sits entirely outside the central two-metre aisle.
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    s.ball('#e8d5ce', [3.15 + Math.cos(a) * .47, .028, 3.38 + Math.sin(a) * .47], [.48, .025, .48]);
  }
  s.ball('#f0e3d4', [3.15, .035, 3.38], [.43, .025, .43]);

  // Two small ceramic sculptures, with actual collision-matched white plinths.
  for (const [i, { x, z, width }] of GALLERY_PLINTHS.entries()) {
    s.box(cream, [x, .59, z], [width, 1.18, width]);
    s.box(trim, [x, .035, z], [width + .04, .07, width + .04]);
    if (i === 0) {
      s.ball('#f1e4d6', [x, 1.39, z], [.23, .23, .18]);
      s.ball(cream, [x, 1.65, z], [.22, .19, .18]);
      for (const side of [-1, 1]) {
        s.ball(cream, [x + side * .12, 1.94, z], [.065, .22, .065]).rotation.z = -side * .15;
        s.ball('#d7bdb5', [x + side * .12, 1.95, z + .045], [.03, .15, .025]);
        s.ball('#75685b', [x + side * .075, 1.66, z + .165], [.014, .009, .008]);
        s.ball(cream, [x + side * .15, 1.23, z + .1], [.09, .07, .1]);
      }
      s.ball('#d6afa5', [x, 1.61, z + .18], [.025, .015, .014]);
    } else {
      s.box('#d8c7a6', [x, 1.43, z], [.37, .48, .32]);
      const roof = s.cone('#e1b9ac', [x, 1.77, z], .33, .28, 4); roof.rotation.y = Math.PI / 4;
      s.box('#fff0cb', [x, 1.46, z + .17], [.12, .2, .015]);
    }
  }
  // Restrained trailing foliage, kept out of all artwork approach zones.
  s.cylinder(cream, [-4.25, .26, -5.15], .26, .5);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    beam([-4.25, .4, -5.15], [-4.25 + Math.cos(a) * .25, .8 + i * .07, -5.15 + Math.sin(a) * .22], .018, '#9ea98b');
    s.ball('#a3b697', [-4.25 + Math.cos(a) * .25, .8 + i * .07, -5.15 + Math.sin(a) * .22], [.14, .06, .12]);
  }
  box(oak, [3.65, 3.38, -5.77], [1.2, .065, .34]);
  s.cylinder('#d4c6b7', [3.7, 3.54, -5.77], .13, .28);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 7; i++) {
    s.ball(i % 2 ? '#a3b697' : '#8fa585', [3.4 + j * .22 + Math.sin(i * 1.7) * .065, 3.48 - i * .1, -5.57], [.07, .09, .035]);
  }
  const root = batchMiniature(s.root); root.name = 'gallery-interior';
  // Non-glossy plaster and satin wood keep the bright room legible.
  root.traverse(mesh => { if (mesh.isMesh) mesh.material.roughness = .76; });
  return root;
}
