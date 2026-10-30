// Landscape title cards resemble small television screens around a shared sofa.
import { studio, batchMiniature } from './miniature.js';

export const SERIES_FRAME_SIZE = [1.35, .8];
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
  // A low sofa leaves the title-card wall in view from the doorway.
  s.box('#708d83', [0, .3, -.35], [2.95, .52, 1]);
  s.box('#91ada0', [0, .62, .08], [2.95, .85, .2]);
  for (const x of [-1.45, 1.45]) s.box('#8da69a', [x, .55, -.35], [.23, .48, 1]);
  for (const x of [-.88, 0, .88]) s.box('#abc1ae', [x, .59, -.37], [.83, .18, .77]);
  s.box('#d6b1a2', [-1.06, .86, -.13], [.4, .4, .15]).rotation.z = .2;
  s.box('#ddc491', [1.06, .86, -.13], [.4, .4, .15]).rotation.z = -.2;
  s.box('#816752', [0, .39, -2.02], [5.1, .72, .68]);
  for (const x of [-1.8, -.9, 0, .9, 1.8]) s.box('#b79772', [x, .4, -1.66], [.8, .57, .025]);
  for (const x of [-.32, .32]) { s.cylinder('#ead9b6', [x, .88, -1.88], .085, .18); s.cylinder('#5b433b', [x, .974, -1.88], .067, .006); }
  s.box('#3a3c3e', [.73, .79, -1.83], [.12, .025, .28]);
  for (const slot of SERIES_SLOTS) {
    const f = studio();
    f.box(slot.id === 'downton-abbey' ? '#d6b777' : '#7e6554', [0, 0, 0], [1.49, .94, .08]);
    f.box('#242833', [0, 0, .045], [1.39, .84, .02]);
    f.root.position.set(...slot.position); f.root.rotation.y = slot.rotation; s.root.add(f.root);
  }
  const root = batchMiniature(s.root); root.name = 'series-sofa-and-frames'; return root;
}
