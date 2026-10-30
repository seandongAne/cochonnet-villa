// A bright, personal model hangar. Geometry and materials are authored locally.
import * as THREE from 'three';
import { studio, batchMiniature } from './miniature.js';
import { createShadowBlobs } from '../villa-map/shadows.js';
import { fighterExhibits } from './fighter-exhibits.js';

export function createHangarRoom() {
  const materials = new Map();
  const s = studio(materials);
  const white = '#e7e9e5', porcelain = '#f1eee5', seam = '#a7b2b1';
  const teal = '#557b7d', deep = '#344e59', silver = '#a0afb2';
  const amber = '#d5a35d', oak = '#b69b76', rubber = '#36474b';
  const box = (color, position, size) => s.mesh(new THREE.BoxGeometry(...size), color, position);
  const glow = (position, size, color = '#fff0d6', intensity = 1) => s.mesh(new THREE.BoxGeometry(...size), color, position, [1, 1, 1], intensity);

  // A continuous shell retains the original entrance and navigation bounds.
  box('#b7bfbd', [0, -.08, 0], [6, .16, 5]);
  box(seam, [0, 1.6, -2.5], [6, 3.2, .12]);
  for (const x of [-3, 3]) box(seam, [x, 1.6, 0], [.12, 3.2, 5]);
  for (const x of [-1.78, 1.78]) box(white, [x, 1.6, 2.5], [2.44, 3.2, .12]);
  box(white, [0, 2.75, 2.5], [1.12, .9, .12]);
  box(white, [0, 3.22, 0], [6, .1, 5]);
  for (const x of [-.6, .6]) box(silver, [x, 1.15, 2.42], [.08, 2.3, .12]);
  box(silver, [0, 2.3, 2.42], [1.28, .08, .12]);

  // Large satin floor slabs, fine joints and warm bay markers.
  for (let x = -2.5; x < 3; x++) for (let z = -2; z < 2.5; z++) {
    box((x + z + 2.5) % 3 ? '#cbd0ca' : '#c6ccc7', [x, .007, z], [.994, .014, .994]);
  }
  for (const x of [-1.47, 1.07]) {
    box(amber, [x, .016, -.15], [.028, .003, 2.1]);
    for (const z of [-1.18, .88]) box(amber, [x + (x < 0 ? .1 : -.1), .016, z], [.23, .003, .028]);
  }

  // Panel joints and shallow structural ribs catch light without noisy textures.
  for (let x = -2.5; x < 3; x++) box(porcelain, [x, 1.67, -2.425], [.985, 2.97, .03]);
  for (const x of [-2.92, 2.92]) {
    for (const z of [-1.85, -.6, .65, 1.9]) box(white, [x, 1.65, z], [.035, 2.99, 1.232]);
    box(silver, [x * .995, .13, 0], [.045, .18, 4.9]);
    box(teal, [x * .991, .3, 0], [.025, .045, 4.86]);
    for (const z of [-1.25, 1.35]) box(porcelain, [x * .987, 1.65, z], [.09, 3.03, .085]);
  }
  for (const z of [-1.25, 1.35]) {
    box(porcelain, [0, 3.05, z], [5.8, .19, .085]);
    for (const x of [-2.7, 2.7]) {
      const brace = box(silver, [x, 2.88, z], [.05, .49, .055]);
      brace.rotation.z = x < 0 ? -.65 : .65;
    }
  }
  for (const x of [-1.65, 1.65]) {
    box(silver, [x, 3.12, 0], [.28, .065, 4.2]);
    glow([x, 3.08, 0], [.21, .018, 4.05], '#edf5f5', .8);
  }

  // A luminous, divided clerestory balances the warm workbench lighting.
  s.box(silver, [-2.867, 2.08, -.35], [.085, 1.33, 3.28]);
  glow([-2.816, 2.08, -.35], [.012, 1.18, 3.1], '#bdd5db', .3);
  for (const z of [-1.91, -.87, .17, 1.21]) box(porcelain, [-2.795, 2.08, z], [.04, 1.26, .035]);
  box(porcelain, [-2.77, 1.42, -.35], [.24, .06, 3.36]);

  // Three recessed exhibit bays give white armor a quiet blue-green backdrop.
  for (const [x, width] of [[-1.25, 1.13], [-.05, 1.13], [1.95, 1.25]]) {
    s.box(silver, [x, 1.89, -2.35], [width, 1.95, .11]);
    box(deep, [x, 1.89, -2.287], [width - .065, 1.87, .025]);
    for (let i = -2; i <= 2; i++) box(teal, [x + i * .18, 1.89, -2.27], [.009, 1.8, .008]);
    box(white, [x, 2.86, -2.17], [width + .03, .07, .4]);
    glow([x, 2.817, -2.08], [width - .12, .012, .12]);
    for (const dx of [-width / 2 + .07, width / 2 - .07]) {
      for (const y of [1.02, 2.73]) s.ball(silver, [x + dx, y, -2.268], [.013, .013, .005]);
    }
  }

  // Powder-coated drawer cabinets, an oak edge and a resilient work surface.
  for (const [x, width] of [[-.95, 2.9], [2.1, 1.25]]) {
    box(rubber, [x, .12, -1.98], [width - .15, .2, .67]);
    s.box(white, [x, .51, -1.98], [width - .08, .7, .74]);
    s.box(oak, [x, .895, -1.95], [width, .13, .82]);
    box(porcelain, [x, .957, -1.95], [width - .035, .014, .785]);
    const count = width > 2 ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const cx = x + (i - (count - 1) / 2) * (width - .12) / count;
      for (const y of [.32, .55, .76]) {
        s.box(porcelain, [cx, y, -1.594], [(width - .19) / count, .19, .03]);
        box(silver, [cx, y + .045, -1.566], [.38, .018, .035]);
      }
    }
    box(teal, [x, .84, -1.563], [width - .15, .028, .013]);
  }
  for (const [x, y, width] of [[-1.25, .967, 1.03], [-.05, .987, 1.05]]) {
    box(rubber, [x, y, -1.85], [width, .006, .7]);
  }
  s.box(white, [1.95, 1.055, -1.95], [1.1, .19, .75]);
  box(rubber, [1.95, 1.153, -1.95], [1.04, .014, .71]);
  box(amber, [1.95, 1.065, -1.57], [.36, .026, .008]);

  // The aircraft sits on an inset apron, with flush runway markings and a warm lip.
  s.box(white, [-.2, .34, -.15], [2.23, .59, 1.73]);
  box(rubber, [-.2, .08, -.15], [2.06, .14, 1.55]);
  s.box(silver, [-.2, .63, -.15], [2.3, .06, 1.8]);
  box('#657b81', [-.2, .663, -.15], [2.18, .006, 1.68]);
  for (const x of [-1.23, .83]) box(porcelain, [x, .667, -.15], [.012, .002, 1.55]);
  for (const z of [-.93, .63]) box(porcelain, [-.2, .667, z], [2.06, .002, .012]);
  for (const z of [-.81, -.55, -.29, -.03, .23, .49]) box(porcelain, [-.2, .667, z], [.018, .002, .12]);
  for (let i = 0; i < 5; i++) {
    for (const z of [-.79, .49]) box(porcelain, [-.68 + i * .24, .667, z], [.065, .002, .18]);
  }
  box(amber, [-.2, .52, .719], [2.05, .023, .012]);
  for (const x of [-1.22, .82]) glow([x, .13, .72], [.025, .018, .012], '#ffe4b7', .5);

  // A second aircraft bay along the side wall keeps the central aisles open.
  s.box(white, [2.22, .43, .1], [1.08, .74, 1.84]);
  box(rubber, [2.22, .08, .1], [.94, .14, 1.7]);
  s.box(silver, [2.22, .8, .1], [1.14, .04, 1.9]);
  box('#657b81', [2.22, .823, .1], [1.08, .006, 1.84]);
  for (const z of [-.76, .96]) box(porcelain, [2.22, .827, z], [1, .002, .012]);
  for (const x of [1.73, 2.71]) box(porcelain, [x, .827, .1], [.012, .002, 1.72]);
  box(amber, [1.672, .69, .1], [.012, .023, 1.64]);

  // Four individual aircraft bays keep their wheels supported and the aisle open.
  for (const { position: [x, y, z] } of fighterExhibits) {
    s.box(white, [x, y - .055, z], [.98, .1, 1.33]);
    box(deep, [x, y - .003, z], [.91, .006, 1.26]);
    box(amber, [x + .492, y - .055, z], [.008, .018, 1.2]);
    for (const dz of [-.57, .57]) box(porcelain, [x, y + .001, z + dz], [.78, .002, .012]);
    for (const dz of [-.57, .57]) box(silver, [-2.79, y - .22, z + dz], [.06, .35, .06]);
    glow([-2.75, y + .56, z], [.035, .018, 1.1], '#edf5f5', .45);
  }
  for (const z of [-1.43, 1.32]) box(silver, [-2.81, 1.02, z], [.06, 2.02, .06]);

  // Small signs of a cherished working space: tools, storage boxes and a plant.
  s.cylinder(teal, [-2.18, 1.075, -1.96], .065, .22);
  for (let i = 0; i < 4; i++) {
    s.cylinder(oak, [-2.22 + i * .025, 1.23, -1.96], .008, .24);
    s.cylinder(silver, [-2.22 + i * .025, 1.35, -1.96], .009, .035);
  }
  box(teal, [.91, 2.08, -2.34], [.53, 1.45, .08]);
  for (const y of [1.53, 1.96, 2.39]) {
    box(oak, [.91, y, -2.18], [.57, .045, .37]);
    s.box(y === 1.96 ? amber : white, [.91, y + .14, -2.2], [.4, .23, .25]);
    box(silver, [.91, y + .15, -2.066], [.13, .05, .007]);
  }
  s.cylinder('#b98269', [-2.17, 1.07, -2.24], .09, .21);
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4;
    const leaf = s.ball(i % 2 ? '#688b74' : '#93aa83', [-2.17 + Math.cos(angle) * .07, 1.24 + i % 3 * .055, -2.24 + Math.sin(angle) * .065], [.045, .12, .025]);
    leaf.rotation.z = Math.cos(angle) * .7;
  }

  // A framed flight sketch on the free side wall, made from thin local geometry.
  s.box(oak, [2.86, 1.94, -.15], [.09, 1.21, 1.67]);
  box(deep, [2.807, 1.94, -.15], [.012, 1.1, 1.55]);
  for (let i = -3; i <= 3; i++) box(teal, [2.797, 1.94, -.15 + i * .21], [.004, .99, .004]);
  for (let i = -2; i <= 2; i++) box(teal, [2.797, 1.94 + i * .21, -.15], [.004, .004, 1.43]);
  box('#c8dcd9', [2.788, 1.96, -.15], [.008, .75, .026]);
  box('#c8dcd9', [2.788, 2.06, -.15], [.008, .045, 1.1]);
  box('#c8dcd9', [2.788, 1.65, -.15], [.008, .035, .38]);
  s.ball(amber, [2.78, 2.36, -.15], [.008, .02, .02]);

  for (const material of materials.values()) {
    const color = `#${material.color.getHexString()}`;
    if ([white, porcelain].includes(color)) { material.roughness = .48; material.metalness = .12; }
    if (color === silver) { material.roughness = .3; material.metalness = .65; }
    if ([teal, deep].includes(color)) { material.roughness = .68; material.metalness = .15; }
    if (color === '#657b81') material.roughness = .75;
  }
  const root = batchMiniature(s.root); root.name = 'workshop-interior';
  const shadows = createShadowBlobs([
    ...fighterExhibits.map(item => ({ id: item.id, position: [item.position[0], item.position[1] - .014, item.position[2]], footprint: { x: .6, z: .95 } })),
    { id: 'diamond', position: [2.22, .809, .1], footprint: { x: .7, z: 1.2 } },
    { id: 'skyhawk', position: [-.2, .649, -.15], footprint: { x: 1.35, z: 1.1 }, rotationY: .22 },
    { id: 'sd', position: [-1.25, .951, -1.85], footprint: { x: .65, z: .45 } },
    { id: 'zz', position: [-.05, .971, -1.85], footprint: { x: .7, z: .45 } },
    { id: 'reborns', position: [1.95, 1.141, -1.95], footprint: { x: .7, z: .5 } },
  ]);
  shadows.traverse(mesh => { if (mesh.isMesh) { mesh.material.uniforms.uOpacity.value = .2; mesh.raycast = () => {}; } });
  root.add(shadows);
  return root;
}
