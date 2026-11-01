// Small authored architectural studies based on the author's two references.
import * as THREE from 'three';
import { studio, batchMiniature } from './miniature.js';

export function createEncoreMiniature(options = {}) {
  const s = studio(new Map(), options);
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

export const CABIN_SIGN_POSITION = [0, .565, .51];

export function createCabinMiniature(television = false, options = {}) {
  const s = studio(new Map(), options); const wall = television ? '#87a99c' : '#78604f';
  const trim = television ? '#e9cc9c' : '#d1b48c';
  s.cylinder('#a6b395', [0, .01, 0], .65, .09);
  s.box(wall, [0, .35, -.03], [.82, .63, .6]);
  for (let i = 0; i < 7; i++) s.box(trim, [0, .08 + i * .085, .275], [.83, .013, .018]);
  const roof = s.cone(television ? '#be8a76' : '#424e50', [0, .84, -.03], .66, .42, 4); roof.rotation.y = Math.PI / 4; roof.scale.z = .85;
  s.box('#343c3b', [0, .23, .29], [.21, .41, .02]);
  s.window(-.27, .38, .28); s.window(.27, .38, .28);
  s.box(trim, [0, .065, .4], [.48, .08, .25]);
  for (const x of [-.29, .29]) s.mesh(new THREE.BoxGeometry(.025, .025, .21), trim, [x, .565, .375]);
  s.box(trim, [0, .565, .48], [.76, .12, .045]);
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


export function createGalleryMiniature(options = {}) {
  const s = studio(new Map(), options);
  s.cylinder('#b9c6ac', [0,.02,0], .83, .08);
  s.box('#eee5d6',[0,.35,0],[1.32,.66,.83]);
  s.box('#d3bfa3',[0,.72,0],[1.47,.1,.96]);
  s.box('#76928c',[0,.81,-.08],[.7,.1,.43]);
  for(const x of [-.25,0,.25]) s.box('#d9ebe5',[x,.87,-.08],[.19,.025,.35]);
  s.box('#d6c4aa',[0,.05,.53],[.95,.09,.42]);
  s.box('#675a4e',[0,.26,.428],[.24,.46,.035]);
  s.box('#b2c5ba',[0,.28,.45],[.19,.35,.02]);
  for(const x of [-.46,.46]) {
    s.box('#b79b76',[x,.35,.435],[.32,.29,.035]);
    s.box('#ead0b2',[x,.35,.46],[.27,.24,.02]);
    s.ball(x<0?'#c77f77':'#859c89',[x,.36,.48],[.075,.065,.012]);
  }
  for(const x of [-.71,.71]) { s.cylinder('#b0896b',[x,.16,.31],.09,.22); s.ball('#8b9d76',[x,.35,.31],[.14,.19,.13]); }
  const root=batchMiniature(s.root);root.name='gallery-pavilion';return root;
}


export function createGameMiniature(options = {}) {
  const s = studio(new Map(), options);
  // At planet scale, simple cuboids preserve the silhouette and the sky budget.
  s.box = (color, position, size) => s.mesh(new THREE.BoxGeometry(...size), color, position);
  s.ball = (color, position, scale) => s.mesh(new THREE.SphereGeometry(1, options.distant ? 8 : 12, options.distant ? 6 : 8), color, position, scale);
  s.cylinder('#a6b395', [0, .01, 0], .65, .09);
  s.box('#343c3b', [0, .35, -.03], [.88, .63, .65]);
  for (let i = 0; i < 7; i++) s.box('#d1b48c', [0, .1 + i * .08, .31], [.9, .018, .018]);
  const roof = s.cone('#657b78', [0, .83, -.03], .7, .4, 4); roof.rotation.y = Math.PI / 4; roof.scale.z = .85;
  s.box('#343c3b', [0, .23, .33], [.22, .41, .02]);
  s.window(-.29, .37, .33); s.window(.29, .37, .33);
  s.box('#e9cc9c', [0, .07, .44], [.5, .08, .22]);
  s.box('#e9cc9c', [0, .58, .47], [.81, .12, .035]);
  // A large controller silhouette gives this cabin its own skyline.
  s.ball('#e9cc9c', [0, 1.08, 0], [.27, .12, .065]);
  for (const x of [-.18, .18]) s.ball('#e9cc9c', [x, 1.01, 0], [.09, .12, .065]);
  s.box('#343c3b', [-.13, 1.09, .066], [.09, .025, .015]);
  s.box('#343c3b', [-.13, 1.09, .066], [.025, .09, .015]);
  for (const [x, y, color] of [[.12, 1.13, '#e97565'], [.17, 1.08, '#90b9ed'], [.12, 1.03, '#a6cf90']]) s.ball(color, [x, y, .07], [.02, .02, .008]);
  const root = batchMiniature(s.root); root.name = 'game-room-miniature'; return root;
}
