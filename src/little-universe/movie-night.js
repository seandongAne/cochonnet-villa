// Node-pure cinema geometry and poster placement. Artwork is loaded by React.
import * as THREE from 'three';
import { studio, batchMiniature } from './miniature.js';

export const MOVIE_POSTER_SIZE = [1.04, 1.52];
export const MOVIE_POSTER_SLOTS = [
  { id: 'notting-hill', position: [0, 1.72, -2.28], rotation: 0 },
  { id: 'ford-v-ferrari', position: [-1.55, 1.72, -2.28], rotation: 0 },
  { id: 'f1', position: [1.55, 1.72, -2.28], rotation: 0 },
  { id: 'tenet', position: [-2.86, 1.72, -.9], rotation: Math.PI / 2 },
  { id: 'knives-out', position: [-2.86, 1.72, .9], rotation: Math.PI / 2 },
  { id: 'finch', position: [2.86, 1.72, -1.4], rotation: -Math.PI / 2 },
  { id: 'top-gun', position: [2.86, 1.72, .15], rotation: -Math.PI / 2 },
  { id: 'rocketman', position: [2.86, 1.72, 1.7], rotation: -Math.PI / 2 },
];
export const CINEMA_OBSTACLES = [
  [-2.5, 2.5, -2.5, -1.83],
  [-1.95, -.55, -.28, .75], [.55, 1.95, -.28, .75],
];

export function fitPoster(width, height, bounds = MOVIE_POSTER_SIZE) {
  const ratio = width > 0 && height > 0 ? width / height : 2 / 3;
  const h = Math.min(bounds[1], bounds[0] / ratio);
  return [h * ratio, h];
}

function part(root, name, s) {
  const object = batchMiniature(s.root); object.name = name; root.add(object);
  return object;
}

export function createCinemaMiniature() {
  const s = studio();
  const teal = '#42b5ac', yellow = '#edd16c', coral = '#d47b57';
  s.cylinder('#a9b98b', [0, .01, 0], .65, .09);
  s.box(teal, [0, .46, -.04], [.91, .84, .64]);
  s.box(yellow, [0, .9, -.04], [.97, .055, .7]);
  s.box(teal, [0, .935, -.04], [.91, .035, .64]);
  s.box(coral, [0, .09, -.04], [.93, .12, .66]);
  // The stepped vertical tower and rounded canopy echo the Miami reference.
  for (const [x, h] of [[-.4, .98], [-.32, 1.12], [-.2, 1.34], [-.06, 1.12], [.03, .98]]) {
    s.box(x === -.2 ? teal : yellow, [x, h / 2, .25], [x === -.2 ? .23 : .07, h, .12]);
  }
  s.box(coral, [-.2, 1.37, .25], [.14, .05, .12]);
  s.cone(coral, [-.2, 1.435, .25], .025, .1, 16);
  s.box('#297e7c', [-.06, .27, .29], [.27, .41, .025]);
  for (const x of [-.195, .075]) s.box(yellow, [x, .27, .31], [.025, .43, .045]);
  for (const y of [.525, .575, .625, .675]) s.box(yellow, [-.07, y, .36], [1.04, .043, .27]);
  for (const x of [.23, .39]) for (const y of [.3, .77]) {
    s.box(yellow, [x, y, .29], [.125, .24, .035]);
    s.box('#397f7b', [x, y, .315], [.087, .19, .018]);
    s.box(teal, [x, y, .33], [.095, .018, .018]);
  }
  s.box('#dfc49b', [-.06, .045, .47], [.43, .07, .32]);
  // Palm fronds remain within the clearing and below the roof's tallest point.
  for (const [x, z, h] of [[-.53, -.12, 1.05], [.53, -.22, .72]]) {
    s.cylinder('#94785a', [x, h / 2, z], .025, h);
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      const leaf = s.ball('#689b78', [x + Math.cos(a) * .12, h + .015, z + Math.sin(a) * .12], [.19, .025, .06]); leaf.rotation.y = -a; leaf.rotation.z = .12;
    }
  }
  for (const x of [-.4, .43]) {
    s.cylinder('#445b52', [x, .19, .49], .013, .32);
    s.ball('#ffe3a1', [x, .37, .49], [.045, .055, .045], .5);
  }
  return batchMiniature(s.root);
}

export function createCinemaRoom() {
  const root = new THREE.Group(); root.name = 'movie-night-interior';
  const s = studio();
  const wall = (color, p, size) => s.mesh(new THREE.BoxGeometry(...size), color, p);
  wall('#342b37', [0, -.08, 0], [6, .16, 5]);
  wall('#42313c', [0, 1.6, -2.5], [6, 3.2, .12]);
  for (const x of [-3, 3]) wall('#49353f', [x, 1.6, 0], [.12, 3.2, 5]);
  for (const x of [-1.78, 1.78]) wall('#49353f', [x, 1.6, 2.5], [2.44, 3.2, .12]);
  wall('#49353f', [0, 2.75, 2.5], [1.12, .9, .12]);
  wall('#302a35', [0, 3.22, 0], [6, .1, 5]);
  s.box('#743e50', [0, .018, .35], [4.85, .035, 4.25]);
  s.box('#a56966', [0, .04, .35], [.78, .012, 4.15]);
  for (const x of [-.43, .43]) s.box('#c5a36d', [x, .049, .35], [.025, .008, 4.15]);
  for (const x of [-2.9, 2.9]) {
    s.box('#b39166', [x, .17, 0], [.06, .06, 4.9]);
    s.box('#b39166', [x, 2.88, 0], [.06, .05, 4.9]);
  }
  s.box('#ae8762', [0, .11, -2.1], [4.9, .22, .6]);
  s.box('#2e2731', [0, 1.77, -2.37], [4.76, 2.49, .12]);
  s.box('#c5a36d', [0, 2.99, -2.25], [5.3, .06, .1]);
  for (const x of [-.6, .6]) s.box('#b39166', [x, 1.15, 2.42], [.09, 2.3, .12]);
  s.box('#b39166', [0, 2.3, 2.42], [1.3, .1, .12]);
  // Recessed warm aisle lights, with no per-bulb light or shadow cost.
  for (const x of [-2.8, 2.8]) for (const z of [-1.7, -.6, .6, 1.7]) s.ball('#ffce88', [x, .32, z], [.035, .045, .035], .9);
  part(root, 'cinema-shell', s);

  const curtains = studio();
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) curtains.box(i % 2 ? '#823e50' : '#9b4a59', [side * (2.42 + i * .09), 1.61, -2.15], [.12, 2.7, .18]);
  for (let i = 0; i < 15; i++) curtains.ball('#934755', [-2.35 + i * .335, 2.9, -2.17], [.24, .17, .12]);
  part(root, 'cinema-curtains', curtains);

  const seats = studio();
  for (const x of [-1.25, 1.25]) {
    seats.box('#382f38', [x, .15, .25], [1.15, .27, .7]);
    seats.box('#ad5c65', [x, .48, .17], [1.15, .26, .75]);
    seats.box('#974b59', [x, .85, .61], [1.15, 1.04, .24]);
    for (const dx of [-.63, .63]) {
      seats.box('#7b3e50', [x + dx, .57, .19], [.14, .43, .85]);
      seats.cylinder('#cfac76', [x + dx, .8, -.03], .055, .018);
      seats.cylinder('#382f38', [x + dx, .813, -.03], .042, .018);
    }
  }
  part(root, 'cinema-seats', seats);

  const frameMaterials = new Map();
  const frames = studio(frameMaterials);
  for (const slot of MOVIE_POSTER_SLOTS) {
    const frame = studio(frameMaterials);
    const [w, h] = MOVIE_POSTER_SIZE;
    frame.box('#15131c', [0, 0, -.015], [w + .09, h + .09, .07]);
    for (const x of [-(w + .1) / 2, (w + .1) / 2]) frame.box('#c7a06e', [x, 0, .025], [.04, h + .14, .06]);
    for (const y of [-(h + .1) / 2, (h + .1) / 2]) frame.box('#c7a06e', [0, y, .025], [w + .14, .04, .06]);
    frame.box('#b4956f', [0, -.91, .01], [.95, .16, .04]);
    frame.root.position.set(...slot.position); frame.root.rotation.y = slot.rotation; frames.root.add(frame.root);
  }
  part(root, 'cinema-poster-frames', frames);
  return root;
}
