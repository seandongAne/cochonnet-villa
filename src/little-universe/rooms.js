// Room layout, collision and geometry stay usable in Node without browser APIs.
import * as THREE from 'three';
import { studio, batchMiniature } from './miniature.js';
import { createTurntable, createSpeaker } from './room-props.js';
import { createCinemaRoom, CINEMA_OBSTACLES } from './movie-night.js';
import { createMusicalFrames } from './music-world.js';
import { createVinylFrames } from './vinyl-records.js';
import { createEncoreSurround } from './destination-buildings.js';
import { createSeriesFurniture, SERIES_OBSTACLES } from './one-more-episode.js';
import { createIronRoseRoom } from './iron-rose.js';
import { createHangarRoom } from './hangar.js';
import { FIGHTER_GALLERY_OBSTACLE } from './fighter-exhibits.js';

export const ROOM_IDS = ['music', 'workshop', 'museum', 'movie-night', 'one-more-episode'];
export const ROOM_SPAWN = [0, 1.55, 1.45];
export const ROOM_BOUNDS = { minX: -2.67, maxX: 2.67, minZ: -2.17, maxZ: 2.17 };
export const ROOM_OBSTACLES = {
  music: [[-1.65, 1.65, -2.5, -1.4], [-2.85, -1.8, -.6, 1.1], [1.8, 2.85, -.7, .9]],
  workshop: [[-2.45, .6, -2.5, -1.35], [1.5, 2.85, -2.5, -1.25], [-1.35, .95, -1.05, .75], [.61, 1.22, -2.5, -1.98], [1.65, 2.79, -.85, 1.05], FIGHTER_GALLERY_OBSTACLE],
  'movie-night': CINEMA_OBSTACLES,
  museum: [[-2.5, 2.5, -2.5, -1.4], [-.9, .9, -1.2, .9]],
  'one-more-episode': SERIES_OBSTACLES,
};
export const EXTERIOR_DOORS = {
  music: { position: [-.085, .025, .268], width: .17, height: .32, color: '#8d3043' },
  workshop: { position: [-.075, .025, .268], width: .15, height: .33, color: '#82798f' },
  'movie-night': { position: [-.12, .07, .31], width: .24, height: .4, color: '#419f98' },
  museum: { position: [-.095, .035, .31], width: .19, height: .38, color: '#4f6158' },
  'one-more-episode': { position: [-.095, .035, .31], width: .19, height: .38, color: '#bc9871' },
};

export function moveInRoom(position, dx, dz, id) {
  const obstacles = ROOM_OBSTACLES[id] || [];
  const radius = .18;
  const blocked = (x, z) => obstacles.some(([x0, x1, z0, z1]) => x > x0 - radius && x < x1 + radius && z > z0 - radius && z < z1 + radius);
  let [x, y, z] = position;
  // Bounded substeps prevent tunneling and allow sliding along furniture edges.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .08));
  for (let i = 0; i < steps; i++) {
    const nx = THREE.MathUtils.clamp(x + dx / steps, ROOM_BOUNDS.minX, ROOM_BOUNDS.maxX);
    if (!blocked(nx, z)) x = nx;
    const nz = THREE.MathUtils.clamp(z + dz / steps, ROOM_BOUNDS.minZ, ROOM_BOUNDS.maxZ);
    if (!blocked(x, nz)) z = nz;
  }
  return [x, y, z];
}

function add(root, name, object, position, scale = 1, rotationY = 0) {
  object.name = name; object.position.set(...position); object.scale.setScalar(scale); object.rotation.y = rotationY; root.add(object); return object;
}

function roomShell(id) {
  const s = studio(); const music = id === 'music';
  const wallBox = (color, position, size) => s.mesh(new THREE.BoxGeometry(...size), color, position);
  wallBox('#bb9878', [0, -.08, 0], [6, .16, 5]);
  for (let i = 0; i < 20; i++) s.box(i % 3 ? '#c6a787' : '#bea080', [-2.85 + i * .3, .005, 0], [.285, .015, 4.94]);
  const wall = music ? '#d8c7b2' : id === 'one-more-episode' ? '#d6d5bf' : '#c3bcc6';
  const trim = music ? '#b99b6e' : '#827b8a';
  wallBox(wall, [0, 1.6, -2.5], [6, 3.2, .12]);
  for (const x of [-3, 3]) wallBox(wall, [x, 1.6, 0], [.12, 3.2, 5]);
  for (const x of [-1.78, 1.78]) wallBox(wall, [x, 1.6, 2.5], [2.44, 3.2, .12]);
  wallBox(wall, [0, 2.75, 2.5], [1.12, .9, .12]);
  wallBox('#e3d4bd', [0, 3.22, 0], [6, .1, 5]);
  s.box(trim, [0, .12, -2.4], [5.9, .24, .055]);
  for (const x of [-2.9, 2.9]) s.box(trim, [x, .12, 0], [.055, .24, 4.9]);
  for (const x of [-.6, .6]) s.box(trim, [x, 1.15, 2.42], [.1, 2.3, .13]);
  s.box(trim, [0, 2.3, 2.42], [1.3, .1, .13]);
  // The television gallery keeps its window on the free rear wall.
  const window = studio();
  window.box(trim, [0, 0, 0], [.08, 1.5, 1.35]);
  window.box('#8498a9', [.06, 0, 0], [.03, 1.3, 1.15]);
  window.box('#d9c9ac', [.09, 0, 0], [.04, 1.3, .04]);
  window.box('#d9c9ac', [.09, 0, 0], [.04, .04, 1.15]);
  window.box('#d9c9ac', [.11, -.71, 0], [.28, .065, 1.5]);
  window.root.position.set(...(id === 'one-more-episode' ? [1.8, 1.83, 2.4] : [-2.91, 1.83, -.9]));
  window.root.rotation.y = id === 'one-more-episode' ? Math.PI / 2 : 0;
  s.root.add(window.root);
  s.box(music ? '#ac7d79' : '#9299a4', [0, .025, .35], [2.75, .02, 2.4]);
  for (const x of [-1.3, 1.3]) s.box('#dec7a5', [x, .04, .35], [.035, .005, 2.2]);
  for (const z of [-.72, 1.42]) s.box('#dec7a5', [0, .04, z], [2.6, .005, .035]);
  // Ceiling beams and a pendant illuminate a fully enclosed room.
  for (const z of [-1.65, 1.65]) s.box(trim, [0, 3.1, z], [6, .13, .13]);
  s.cylinder('#71646a', [0, 2.88, 0], .015, .65);
  s.cone('#d1b18c', [0, 2.55, 0], .28, .24, 32);
  s.ball('#ffdeb1', [0, 2.46, 0], [.14, .04, .14], .7);
  return batchMiniature(s.root);
}

function bench(s, x, z, width) {
  s.box('#8c6b54', [x, .9, z], [width, .12, .82]);
  for (const dx of [-width / 2 + .12, width / 2 - .12]) for (const dz of [-.3, .3]) s.box('#6c5750', [x + dx, .43, z + dz], [.08, .86, .08]);
}

export function createRoom(id) {
  if (!ROOM_IDS.includes(id)) throw new RangeError('Unknown room');
  if (id === 'movie-night') return createCinemaRoom();
  if (id === 'museum') return createIronRoseRoom();
  if (id === 'workshop') return createHangarRoom();
  const root = new THREE.Group(); root.name = `${id}-interior`;
  root.add(roomShell(id));
  const s = studio();
  if (id === 'music') {
    bench(s, 0, -1.96, 3.15);
    s.box('#8a6855', [0, .45, -1.96], [3.05, .6, .72]);
    for (let i = 0; i < 19; i++) s.box(['#d0b089', '#748b87', '#aa7374', '#8c88a0'][i % 4], [-1.39 + i * .073, .45, -1.55], [.05, .44, .1]);
    s.box('#d8b99a', [.82, .45, -1.55], [.9, .03, .05]);
    s.box('#b99a76', [0, 1.77, -2.35], [3.7, .07, .24]);
    // A soft reading chair and a crate of record sleeves.
    s.box('#a5b4a4', [-2.3, .47, .3], [.9, .22, .9]);
    s.box('#a5b4a4', [-2.62, .85, .3], [.24, .65, .9]);
    for (const z of [-.1, .7]) s.box('#8e9e92', [-2.3, .65, z], [.9, .28, .13]);
    s.box('#ead4b7', [-2.35, .68, .3], [.38, .14, .44]).rotation.z = -.2;
    s.box('#967657', [2.3, .26, .05], [.83, .52, .85]);
    for (let i = 0; i < 7; i++) s.box(['#a77b83', '#8c9d94', '#c7af86'][i % 3], [2.3, .53, -.25 + i * .095], [.66, .48, .055]);
    add(root, 'turntable', createTurntable(), [0, .97, -1.91]);
    add(root, 'speaker-left', createSpeaker(), [-1.12, .97, -1.99]);
    add(root, 'speaker-right', createSpeaker(), [1.12, .97, -1.99]);
    root.add(createVinylFrames());
    root.add(createMusicalFrames());
    root.add(createEncoreSurround());
  } else if (id === 'one-more-episode') {
    root.add(createSeriesFurniture());
  }
  root.add(batchMiniature(s.root));
  return root;
}
