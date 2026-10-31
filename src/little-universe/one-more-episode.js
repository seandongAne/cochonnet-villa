// Portrait promotional posters surround a shared sofa.
import * as THREE from 'three';
import { studio, batchMiniature } from './miniature.js';

// Keep the artwork band quiet; color lives below the frames and on soft furnishings.
const PALETTE = {
  wall: '#c9c5b7', ceiling: '#d2cdbf', sage: '#8b9f94', trim: '#70887f',
  oak: '#aa9073', blue: '#708e9d', peach: '#c69982', linen: '#c9bca4',
};

export function createSeriesRoomShell() {
  const s = studio(); const p = PALETTE;
  const wall = (color, position, size) => s.mesh(new THREE.BoxGeometry(...size), color, position);
  wall(p.oak, [0, -.08, 0], [6, .16, 5]);
  for (let i = 0; i < 20; i++) s.box(i % 3 ? '#b39d81' : '#aa947a', [-2.85 + i * .3, .005, 0], [.285, .015, 4.94]);
  wall(p.wall, [0, 1.6, -2.5], [6, 3.2, .12]);
  for (const x of [-3, 3]) wall(p.wall, [x, 1.6, 0], [.12, 3.2, 5]);
  for (const x of [-1.78, 1.78]) wall(p.wall, [x, 1.6, 2.5], [2.44, 3.2, .12]);
  wall(p.wall, [0, 2.75, 2.5], [1.12, .9, .12]);
  wall(p.ceiling, [0, 3.22, 0], [6, .1, 5]);
  // Low sage panelling stops well below the poster labels, with restrained oak rails.
  s.box(p.sage, [0, .55, -2.42], [5.9, 1.1, .035]);
  s.box(p.oak, [0, 1.12, -2.39], [5.9, .045, .055]);
  for (const x of [-2.92, 2.92]) {
    s.box(p.sage, [x, .55, 0], [.035, 1.1, 4.9]);
    s.box(p.oak, [x, 1.12, 0], [.055, .045, 4.9]);
    s.box(p.trim, [x, .09, 0], [.055, .18, 4.9]);
  }
  for (const x of [-1.78, 1.78]) {
    s.box(p.sage, [x, .55, 2.42], [2.34, 1.1, .035]);
    s.box(p.oak, [x, 1.12, 2.39], [2.34, .045, .055]);
  }
  s.box(p.trim, [0, .09, -2.39], [5.9, .18, .055]);
  for (const x of [-.6, .6]) s.box(p.oak, [x, 1.15, 2.42], [.1, 2.3, .13]);
  s.box(p.oak, [0, 2.3, 2.42], [1.3, .1, .13]);
  // The window stays on the free rear wall, away from all eight posters.
  s.box(p.oak, [1.8, 1.83, 2.4], [1.35, 1.5, .08]);
  s.box('#849ba6', [1.8, 1.83, 2.34], [1.15, 1.3, .03]);
  s.box(p.linen, [1.8, 1.83, 2.31], [.04, 1.3, .04]);
  s.box(p.linen, [1.8, 1.83, 2.31], [1.15, .04, .04]);
  s.box(p.oak, [1.8, 1.12, 2.29], [1.5, .065, .28]);
  for (const x of [1.07, 2.53]) s.box(p.peach, [x, 1.83, 2.29], [.17, 1.52, .12]);
  s.box(p.blue, [0, .025, .35], [3.4, .02, 2.5]);
  for (const x of [-1.59, 1.59]) s.box('#a2b1ad', [x, .04, .35], [.055, .005, 2.28]);
  for (const z of [-.79, 1.49]) s.box('#a2b1ad', [0, .04, z], [3.2, .005, .055]);
  for (const z of [-1.65, 1.65]) s.box(p.oak, [0, 3.12, z], [6, .1, .1]);
  s.cylinder(p.trim, [0, 2.94, .35], .012, .48);
  s.cylinder(p.linen, [0, 2.68, .35], .32, .22);
  s.ball('#e3cba4', [0, 2.57, .35], [.24, .025, .24], .15);
  const root = batchMiniature(s.root); root.name = 'series-lounge-shell'; return root;
}

export const SERIES_FRAME_SIZE = [.88, 1.24];
export const SERIES_SLOTS = [
  { id: 'downton-abbey', position: [0, 2.06, -2.32], rotation: 0 },
  { id: 'youre-the-worst', position: [-1.85, 2.06, -2.32], rotation: 0 },
  { id: 'the-good-place', position: [1.85, 2.06, -2.32], rotation: 0 },
  { id: 'the-good-wife', position: [-2.86, 2.06, -.85], rotation: Math.PI / 2 },
  { id: 'the-good-fight', position: [-2.86, 2.06, .85], rotation: Math.PI / 2 },
  { id: 'game-of-thrones', position: [2.86, 2.06, -.85], rotation: -Math.PI / 2 },
  { id: 'shrinking', position: [2.86, 2.06, .85], rotation: -Math.PI / 2 },
  { id: 'the-man-in-the-high-castle', position: [-1.8, 2.06, 2.32], rotation: Math.PI },
];
export const SERIES_OBSTACLES = [[-2.65, 2.65, -2.5, -1.65], [-1.6, 1.6, -.9, .25]];

export function createSeriesFurniture() {
  const s = studio();
  // A low sofa leaves the poster wall in view from the doorway.
  s.box('#607f8e', [0, .3, -.35], [2.95, .52, 1]);
  s.box(PALETTE.blue, [0, .62, .08], [2.95, .85, .2]);
  for (const x of [-1.45, 1.45]) s.box('#7e99a3', [x, .55, -.35], [.23, .48, 1]);
  for (const x of [-.88, 0, .88]) s.box('#8fa8ae', [x, .59, -.37], [.83, .18, .77]);
  s.box(PALETTE.peach, [-1.06, .86, -.13], [.4, .4, .15]).rotation.z = .2;
  s.box('#b8ae80', [1.06, .86, -.13], [.4, .4, .15]).rotation.z = -.2;
  s.box(PALETTE.linen, [.65, .7, -.44], [.42, .025, .6]);
  s.box(PALETTE.linen, [.65, .49, -.74], [.42, .4, .025]);
  s.box('#816e59', [0, .39, -2.02], [5.1, .72, .68]);
  for (const x of [-1.8, -.9, 0, .9, 1.8]) {
    s.box(PALETTE.oak, [x, .4, -1.66], [.8, .57, .025]);
    s.box('#625e50', [x, .57, -1.64], [.14, .025, .025]);
  }
  for (const x of [-.32, .32]) { s.cylinder('#ead9b6', [x, .88, -1.88], .085, .18); s.cylinder('#5b433b', [x, .974, -1.88], .067, .006); }
  s.box('#3a3c3e', [.73, .79, -1.83], [.12, .025, .28]);
  for (const slot of SERIES_SLOTS) {
    const f = studio();
    f.box(slot.id === 'downton-abbey' ? '#b39b70' : '#68655b', [0, 0, 0], [SERIES_FRAME_SIZE[0] + .14, SERIES_FRAME_SIZE[1] + .14, .08]);
    f.box('#242833', [0, 0, .045], [SERIES_FRAME_SIZE[0] + .04, SERIES_FRAME_SIZE[1] + .04, .02]);
    f.root.position.set(...slot.position); f.root.rotation.y = slot.rotation; s.root.add(f.root);
  }
  const root = batchMiniature(s.root); root.name = 'series-sofa-and-frames'; return root;
}
