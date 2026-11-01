import { GAME_COVER_SLOTS } from './games.js';
// Original stylized geometry; all assets are local and browser-independent.
import * as THREE from 'three';
import { studio, batchMiniature } from './miniature.js';

export const GAME_CONSOLES = [
  { id: 'switch', name: 'Nintendo Switch', color: '#e97565', position: [-1.45, .84, -1.94] },
  { id: 'ps5', name: 'PS5', color: '#90b9ed', position: [0, .84, -1.94] },
  { id: 'xbox', name: 'Xbox', color: '#a6cf90', position: [1.45, .84, -1.94] },
];
export const GAME_OBSTACLES = [[-2.5, 2.5, -2.45, -1.52], [-2.65, -1.65, -.8, 1.25], [-.75, .75, -.65, .15]];

function finish(s, name) { const root = batchMiniature(s.root); root.name = name; return root; }

export function createGameConsole(id) {
  const s = studio();
  if (id === 'switch') {
    s.box('#252c35', [0, .23, 0], [.52, .32, .08]);
    s.box('#79bcb9', [0, .25, .048], [.4, .23, .01]);
    for (const [x, color] of [[-.3, '#55c7d7'], [.3, '#ed675d']]) {
      s.box(color, [x, .23, 0], [.13, .34, .09]);
      s.ball('#252c35', [x, x < 0 ? .3 : .17, .057], [.032, .032, .016]);
      for (const [dx, dy] of [[0, .025], [0, -.025], [.025, 0], [-.025, 0]]) s.ball('#252c35', [x + dx, (x < 0 ? .16 : .29) + dy, .052], [.009, .009, .007]);
    }
    s.box('#252c35', [0, .09, .075], [.44, .18, .16]);
  } else if (id === 'ps5') {
    s.cylinder('#252c35', [0, .025, 0], .2, .05);
    s.box('#252c35', [0, .35, 0], [.15, .62, .24]);
    for (const side of [-1, 1]) {
      const plate = s.box('#f0f0ed', [side * .103, .37, 0], [.055, .7, .28]); plate.rotation.z = side * -.09;
      s.box('#79baf0', [side * .079, .4, .13], [.013, .5, .012]);
    }
    s.box('#252c35', [.115, .17, .15], [.012, .13, .012]);
  } else if (id === 'xbox') {
    s.box('#252c35', [0, .31, 0], [.3, .62, .3]);
    s.box('#75a65c', [0, .623, 0], [.24, .008, .24]);
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) s.cylinder('#18231f', [x * .044, .63, z * .044], .014, .008);
    s.ball('#f0f0ed', [.085, .54, .157], [.016, .016, .007]);
    s.box('#13191f', [-.08, .2, .153], [.012, .2, .009]);
  } else throw new RangeError('Unknown game console');
  return finish(s, `console-${id}`);
}

export function createController(id) {
  const s = studio(); const body = id === 'ps5' ? '#f0f0ed' : '#343e48';
  s.ball(body, [0, .07, 0], [.18, .055, .1]);
  for (const side of [-1, 1]) {
    s.ball(body, [side * .13, .06, .07], [.07, .06, .13]);
    s.ball('#141b23', [side * .065, .12, .025], [.026, .012, .026]);
  }
  s.box('#252c35', [0, .12, -.035], [.095, .012, .065]);
  s.box('#8d9cab', [-.115, .114, -.035], [.048, .012, .015]);
  s.box('#8d9cab', [-.115, .114, -.035], [.015, .012, .048]);
  for (const [x, z, color] of [[.115, -.055, '#e3c36f'], [.115, -.015, '#82b4dc'], [.095, -.035, '#91c389'], [.135, -.035, '#e6868b']]) s.ball(color, [x, .118, z], [.009, .008, .009]);
  return finish(s, `controller-${id}`);
}

export function createGameRoom() {
  const root = new THREE.Group(); root.name = 'game-room-interior'; const s = studio();
  const wall = '#344850', oak = '#ac825d', cream = '#e1cfad';
  s.box('#735744', [0, -.08, 0], [6, .16, 5]);
  for (let i = 0; i < 20; i++) s.box(i % 3 ? '#b5926c' : '#a88461', [-2.85 + i * .3, .005, 0], [.285, .015, 4.94]);
  s.box(wall, [0, 1.6, -2.5], [6, 3.2, .12]);
  for (const x of [-3, 3]) s.box(wall, [x, 1.6, 0], [.12, 3.2, 5]);
  for (const x of [-1.78, 1.78]) s.box(wall, [x, 1.6, 2.5], [2.44, 3.2, .12]);
  s.box(wall, [0, 2.75, 2.5], [1.12, .9, .12]);
  s.box('#c5b89b', [0, 3.22, 0], [6, .1, 5]);
  for (const x of [-.6, .6]) s.box(oak, [x, 1.15, 2.4], [.1, 2.3, .13]);
  s.box(oak, [0, 2.3, 2.4], [1.3, .1, .13]);
  for (let i = 0; i < 27; i++) s.box(oak, [-2.6 + i * .2, 1.68, -2.39], [.045, 2.75, .08]);
  s.box('#202c35', [0, 2.06, -2.25], [3.25, 1.46, .13]);
  s.box('#b7d7d1', [0, 2.06, -2.33], [3.4, 1.6, .025]);
  s.box(oak, [0, .48, -1.98], [5, .68, .9]);
  s.box(cream, [0, .82, -1.98], [5.08, .055, .94]);
  for (const x of [-1.67, 0, 1.67]) { s.box('#4e514b', [x, .48, -1.519], [1.5, .46, .015]); s.box(cream, [x, .65, -1.5], [.25, .025, .025]); }
  s.box('#ad7969', [-2.15, .45, .2], [1, .34, 2.05]);
  s.box('#996657', [-2.62, .81, .2], [.2, .98, 2.05]);
  for (const z of [-.73, 1.13]) s.box('#996657', [-2.15, .65, z], [1, .32, .2]);
  for (const z of [-.25, .6]) s.box('#d6b68b', [-2.4, .74, z], [.22, .42, .45]);
  s.box('#6e9190', [.25, .03, .15], [3.1, .035, 2.7]);
  for (const x of [-1.22, 1.72]) s.box(cream, [x, .051, .15], [.028, .006, 2.5]);
  s.box(oak, [0, .43, -.25], [1.5, .09, .8]);
  for (const x of [-.6, .6]) for (const z of [-.53, .03]) s.box('#344850', [x, .2, z], [.055, .4, .055]);
  // Small refreshments and a quiet wall shelf, leaving the right-hand aisle open.
  s.cylinder(cream, [.45, .57, -.32], .065, .18);
  s.cylinder('#62483b', [.45, .663, -.32], .052, .009);
  // The requested game collection takes the place of the anonymous case spines.
  for (const x of [-1.95, 1.95]) { s.cylinder('#b7a47d', [x, 2.5, -2.1], .025, .9); s.cone(cream, [x, 2.45, -2.1], .19, .23, 24); }
  root.add(finish(s, 'game-room-shell-and-furniture'));
  const frames = studio(); const materials = new Map();
  for (const slot of GAME_COVER_SLOTS) {
    const frame = studio(materials);
    frame.mesh(new THREE.BoxGeometry(1.06, .61, .045), oak);
    frame.mesh(new THREE.BoxGeometry(1.01, .56, .015), '#162d35', [0, 0, .03]);
    frame.root.position.set(...slot.position); frame.root.rotation.y = slot.rotation;
    frames.root.add(frame.root);
  }
  root.add(finish(frames, 'game-collection-frames'));
  for (const console of GAME_CONSOLES) { const model = createGameConsole(console.id); model.position.set(...console.position); root.add(model); }
  for (const [id, x] of [['ps5', -.34], ['xbox', .13]]) { const controller = createController(id); controller.position.set(x, .48, -.2); root.add(controller); }
  return root;
}

export function createGameMiniature() {
  const s = studio();
  // At planet scale, simple cuboids preserve the silhouette and the sky budget.
  s.box = (color, position, size) => s.mesh(new THREE.BoxGeometry(...size), color, position);
  s.ball = (color, position, scale) => s.mesh(new THREE.SphereGeometry(1, 12, 8), color, position, scale);
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
  return finish(s, 'game-room-miniature');
}
