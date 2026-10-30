// Small authored architectural studies based on the author's two references.
import * as THREE from 'three';
import { studio, batchMiniature } from './miniature.js';

export function createEncoreMiniature() {
  const s = studio();
  const cream = '#ecd9b7', gold = '#c49b51', red = '#962d45';
  s.cylinder('#a6b395', [0, .01, 0], .65, .09);
  s.box('#58413d', [0, .07, 0], [1.13, .1, .65]);
  s.box(cream, [0, .6, -.22], [1.1, 1.02, .18]);
  s.box('#28323f', [0, .68, -.11], [.64, .62, .035]);
  // A tiny city backdrop, framed by the red curtain and ivory proscenium.
  for (let i = 0; i < 7; i++) {
    const h = .15 + (i % 3) * .07;
    s.box('#c49b51', [-.26 + i * .085, .4 + h / 2, -.075], [.055, h, .025]);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) s.box(i % 2 ? '#bd4b51' : red, [side * (.25 + i * .032), .69, -.015], [.047, .59, .11]);
    s.cylinder(cream, [side * .35, .67, .055], .039, .76);
    for (const y of [.3, 1.04]) s.box(gold, [side * .35, y, .055], [.12, .05, .13]);
    s.box(cream, [side * .49, .61, -.01], [.22, .9, .33]);
    for (const y of [.43, .81]) {
      s.box('#322931', [side * .49, y, .17], [.19, .25, .02]);
      s.box(red, [side * .49, y + .13, .18], [.24, .055, .12]);
      s.box(gold, [side * .49, y - .08, .23], [.23, .03, .12]);
      for (let i = 0; i < 5; i++) s.cylinder(gold, [side * .49 - .09 + i * .045, y - .035, .275], .008, .1);
    }
  }
  const arch = s.mesh(new THREE.TorusGeometry(.35, .035, 8, 32, Math.PI), cream, [0, .88, .07]);
  arch.scale.y = .55;
  for (let i = 0; i < 7; i++) s.ball(red, [-.27 + i * .09, .95 - Math.sin(i / 6 * Math.PI) * .045, .025], [.065, .055, .065]);
  s.box(gold, [0, .36, .04], [.72, .045, .4]);
  s.box('#493036', [0, .19, .245], [.2, .32, .025]);
  s.box(red, [0, .09, .4], [.28, .03, .3]);
  s.box(gold, [0, 1.2, -.02], [.98, .25, .16]);
  s.box('#312c32', [0, 1.2, .07], [.91, .18, .025]);
  for (const y of [1.09, 1.31]) for (let i = 0; i < 13; i++) s.ball('#ffe1a2', [-.46 + i * .077, y, .09], [.013, .013, .013], .7);
  return batchMiniature(s.root);
}

export function createCabinMiniature(television = false) {
  const s = studio(); const wall = television ? '#87a99c' : '#78604f';
  const trim = television ? '#e9cc9c' : '#d1b48c';
  s.cylinder('#a6b395', [0, .01, 0], .65, .09);
  s.box(wall, [0, .35, -.03], [.82, .63, .6]);
  for (let i = 0; i < 7; i++) s.box(trim, [0, .08 + i * .085, .275], [.83, .013, .018]);
  const roof = s.cone(television ? '#be8a76' : '#424e50', [0, .84, -.03], .66, .42, 4); roof.rotation.y = Math.PI / 4; roof.scale.z = .85;
  s.box('#343c3b', [0, .23, .29], [.21, .41, .02]);
  s.window(-.27, .38, .28); s.window(.27, .38, .28);
  s.box(trim, [0, .065, .4], [.48, .08, .25]);
  s.box(trim, [0, .565, .35], [.76, .12, .045]);
  s.box('#664d44', [.26, .85, -.14], [.12, .38, .14]);
  if (television) {
    s.box('#594c4c', [0, 1.02, .02], [.28, .21, .1]);
    s.box('#a6c7bc', [0, 1.02, .08], [.22, .15, .02]);
    for (const side of [-1, 1]) { const aerial = s.cylinder(trim, [side * .055, 1.17, .02], .008, .15); aerial.rotation.z = side * -.6; }
    s.tree(-.53, -.13, .65);
  } else {
    // Rose trellises make the collector's cabin distinct from the workshop.
    for (const side of [-1, 1]) {
      s.box('#3f5b4a', [side * .49, .34, .15], [.045, .64, .045]);
      for (let i = 0; i < 6; i++) {
        const x = side * (.47 + Math.sin(i * 2) * .07), y = .18 + i * .09;
        s.ball('#658469', [x, y, .18], [.08, .05, .055]);
        s.ball('#b66f78', [x, y + .025, .225], [.04, .035, .028]);
      }
    }
  }
  return batchMiniature(s.root);
}

export function createEncoreSurround() {
  const s = studio();
  for (const side of [-1, 1]) {
    s.cylinder('#e8d5b6', [side * 2.75, 1.75, -2.13], .095, 2.7);
    for (const y of [.39, 3.02]) s.box('#c5a16a', [side * 2.75, y, -2.13], [.29, .12, .3]);
    for (let i = 0; i < 3; i++) s.box(i % 2 ? '#a33c4c' : '#7e283c', [side * (2.65 + i * .075), 1.65, -2.3], [.1, 2.7, .1]);
    // Small raised side boxes; kept above the walking and record collection zones.
    s.box('#a23f4d', [side * 2.78, 2.8, -1.15], [.38, .18, 1]);
    s.box('#c5a16a', [side * 2.72, 2.31, -1.15], [.49, .08, 1]);
    for (let i = 0; i < 8; i++) s.cylinder('#c5a16a', [side * 2.49, 2.46, -1.57 + i * .12], .016, .28);
    s.box('#c5a16a', [side * 2.49, 2.6, -1.15], [.04, .035, 1]);
  }
  s.box('#e8d5b6', [0, 3.17, -2.28], [5.5, .07, .22]);
  for (let i = 0; i < 23; i++) s.ball('#ffdf9c', [-2.5 + i * 5 / 22, 3.17, -2.15], [.025, .025, .025], .7);
  // Warm velvet valances leave every show title readable below.
  for (let i = 0; i < 9; i++) s.ball('#8d3043', [-2.35 + i * .59, 3.16, -2.31], [.32, .025, .1]);
  const root = batchMiniature(s.root); root.name = 'encore-proscenium'; return root;
}
