// Locally authored collector's studio. All geometry remains Node-pure and batched.
import * as THREE from 'three';
import { studio, batchMiniature } from './miniature.js';

export function createIronRoseRoom() {
  const materials = new Map();
  const s = studio(materials);
  const ink = '#101215', panel = '#1a1e23', steel = '#30383f', edge = '#60696e';
  const box = (color, pos, size) => s.mesh(new THREE.BoxGeometry(...size), color, pos);
  const strip = (pos, size) => s.mesh(new THREE.BoxGeometry(...size), '#f4dfbd', pos, [1, 1, 1], 2);
  // Enclosed charcoal shell; the entrance and existing walking bounds are retained.
  box('#171a1d', [0, -.08, 0], [6, .16, 5]);
  box(ink, [0, 1.6, -2.5], [6, 3.2, .12]);
  box(ink, [0, 3.22, 0], [6, .1, 5]);
  for (const x of [-3, 3]) box(ink, [x, 1.6, 0], [.12, 3.2, 5]);
  for (const x of [-1.78, 1.78]) box(ink, [x, 1.6, 2.5], [2.44, 3.2, .12]);
  box(ink, [0, 2.75, 2.5], [1.12, .9, .12]);
  for (const x of [-.6, .6]) box(steel, [x, 1.15, 2.42], [.08, 2.3, .12]);
  box(steel, [0, 2.3, 2.42], [1.28, .08, .12]);
  // Broad floor tiles and slim wall reveals give the black surfaces scale.
  for (let x = -2.5; x < 3; x++) for (let z = -2; z < 2.5; z++) {
    box('#202429', [x, .005, z], [.985, .01, .985]);
  }
  for (const x of [-2.92, 2.92]) {
    for (const z of [-1.6, -.4, .8, 2]) box(panel, [x, 1.62, z], [.035, 2.85, 1.17]);
    box(steel, [x, .13, 0], [.045, .16, 4.9]);
    box(steel, [x, 2.97, 0], [.06, .06, 4.85]);
    strip([x * .99, 2.93, 0], [.025, .018, 4.75]);
  }
  // Recessed full-width perforated display wall, with two mounting rails.
  s.box(steel, [0, 2.04, -2.35], [5.12, 1.57, .13]);
  box(panel, [0, 2.04, -2.268], [4.97, 1.42, .025]);
  for (let x = -2.38; x <= 2.4; x += .14) for (let y = 1.42; y <= 2.7; y += .14) {
    const hole = s.mesh(new THREE.CircleGeometry(.014, 8), '#090b0d', [x, y, -2.251]);
    hole.castShadow = false;
  }
  for (const y of [1.67, 2.22]) box(steel, [0, y, -2.22], [4.8, .025, .04]);
  for (const x of [-2, -.55]) {
    s.box(edge, [x, 1.74, -2.13], [.035, .14, .2]);
  }
  // A shallow canopy hides the task-light source above the collection.
  box(ink, [0, 2.84, -2.13], [5.22, .1, .65]);
  strip([0, 2.78, -1.91], [4.85, .018, .06]);
  // Continuous steel worktop with a chamfered lip and three drawer modules.
  s.box(steel, [0, .94, -1.99], [4.9, .12, .91]);
  box(edge, [0, .962, -1.533], [4.78, .025, .018]);
  box(ink, [0, .15, -2.02], [4.65, .2, .69]);
  for (const x of [-1.62, 0, 1.62]) {
    box(ink, [x, .5, -2.01], [1.49, .69, .75]);
    for (let i = 0; i < 3; i++) {
      const y = .33 + i * .205;
      s.box(panel, [x, y, -1.622], [1.4, .18, .055]);
      box(ink, [x, y + .055, -1.582], [1.2, .026, .018]);
      s.box(edge, [x, y + .048, -1.556], [.66, .018, .045]);
      box('#b29a73', [x - .51, y - .025, -1.59], [.12, .036, .008]);
    }
  }
  // Rubber work mats, shallow organizing trays and a small closed tool case.
  for (const x of [-1.16, .88]) {
    s.box('#0b1013', [x, 1.008, -1.96], [1.67, .022, .62]);
    for (const z of [-2.23, -1.69]) box(steel, [x, 1.021, z], [1.54, .002, .008]);
    for (let i = 0; i < 16; i++) box(steel, [x - .72 + i * .096, 1.022, -1.71], [.004, .002, i % 5 ? .024 : .045]);
  }
  s.box(edge, [-.17, 1.04, -1.94], [.3, .075, .42]);
  box(ink, [-.17, 1.081, -1.94], [.25, .01, .36]);
  box(steel, [-.17, 1.09, -1.94], [.25, .025, .018]);
  s.box(ink, [1.42, 1.08, -2.13], [.66, .15, .29]);
  for (const x of [1.2, 1.64]) box(edge, [x, 1.08, -1.975], [.045, .06, .018]);
  // Articulated task lamp. These are decorative props, not a procedural weapon.
  s.cylinder(ink, [-2.16, 1.025, -2.05], .14, .035);
  for (const [start, end] of [
    [[-2.16, 1.04, -2.05], [-2.25, 1.44, -2.05]],
    [[-2.25, 1.44, -2.05], [-1.96, 1.7, -2.05]],
  ]) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const arm = box(edge, a.clone().add(b).multiplyScalar(.5).toArray(), [.025, a.distanceTo(b), .025]);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    s.ball(steel, start, [.038, .038, .038]);
  }
  s.box(ink, [-1.96, 1.7, -2.05], [.33, .055, .18]);
  strip([-1.96, 1.669, -2.05], [.28, .012, .13]);
  // Low vehicle display preserves the original collision footprint and asset height.
  s.box(ink, [0, .24, -.15], [1.8, .48, 2.1]);
  s.box(steel, [0, .486, -.15], [1.8, .028, 2.1]);
  box('#0b1013', [0, .505, -.15], [1.72, .008, 2.02]);
  for (const x of [-.87, .87]) strip([x, .1, -.15], [.012, .018, 1.99]);
  box('#b29a73', [0, .3, .906], [.46, .09, .008]);
  // One restrained rose arrangement retains the cabin's personal identity.
  s.cylinder('#202429', [2.18, 1.13, -2.01], .095, .27);
  for (const material of materials.values()) {
    const color = `#${material.color.getHexString()}`;
    if ([steel, edge].includes(color)) { material.metalness = .62; material.roughness = .36; }
    if (color === panel) { material.metalness = .25; material.roughness = .65; }
  }
  const root = batchMiniature(s.root);
  root.name = 'museum-interior';
  return root;
}
