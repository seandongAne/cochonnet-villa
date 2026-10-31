// Node-pure miniature factories. No asset requests or browser globals.
import * as THREE from 'three';
import { studio, batchMiniature } from './miniature.js';
import { createCampingMiniature } from './camping.js';
import { createGundam } from './room-props.js';
import { createCinemaMiniature } from './movie-night.js';
import { createEncoreMiniature, createCabinMiniature } from './destination-buildings.js';
export { batchMiniature, disposeMiniature } from './miniature.js';
import { landmarkLayout as landmarks, surfacePosition } from './landmark-layout.js';

const Y = new THREE.Vector3(0, 1, 0);
export function surfaceFrame(direction, radius = 2.5) {
  const position = new THREE.Vector3(...surfacePosition(direction, radius));
  return { position, quaternion: new THREE.Quaternion().setFromUnitVectors(Y, position.clone().normalize()) };
}

export function createLandmark(id, options = {}) {
  if (id === 'camping') return createCampingMiniature(options);
  if (id === 'movie-night') return createCinemaMiniature(options);
  if (id === 'music') return createEncoreMiniature(options);
  if (id === 'museum' || id === 'one-more-episode') return createCabinMiniature(id === 'one-more-episode', options);
  const s = studio(new Map(), options);
  s.cylinder('#c5d0a9', [0, 0.01, 0], 0.65, 0.09);
  if (id === 'workshop') {
    s.box('#dbcbdd', [0, 0.27, 0], [0.66, 0.5, 0.5]);
    const roof = s.cone('#8d8cae', [0, 0.64, 0], 0.54, 0.35, 4); roof.rotation.y = Math.PI / 4;
    s.window(-0.23, 0.29, 0.26); s.window(0.23, 0.29, 0.26);
    s.box('#514754', [0, .20, .258], [.17, .37, .025]);
    s.box('#c5b399', [0.38, 0.15, 0.35], [0.28, 0.06, 0.2]);
    const model = createGundam(options); model.position.set(.38, .18, .35); model.scale.setScalar(.16); s.root.add(model);
    s.cylinder('#c5b399', [-0.43, 0.48, -0.14], 0.035, 0.9);
    s.ball('#efe0bf', [-0.43, 0.91, -0.1], [0.06, 0.06, 0.06]);
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + 0.4;
      const blade = s.box('#efe0bf', [-0.43 + Math.sin(angle) * 0.16, 0.91 + Math.cos(angle) * 0.16, -0.1], [0.075, 0.28, 0.025]); blade.rotation.z = -angle;
    }
    s.tree(0.45, -0.17, 0.8);
  }
  return batchMiniature(s.root);
}

export function createGarden(options = {}) {
  const garden = new THREE.Group();
  const materials = new Map();
  const clearings = landmarks.map((place) => new THREE.Vector3(...surfacePosition(place.direction)));
  const nearClearing = (direction) => clearings.some((position) => position.distanceTo(new THREE.Vector3(...surfacePosition(direction))) < .95);
  for (let i = 0; i < 42; i++) {
    const y = 1 - (i + 0.5) / 42 * 2;
    const theta = i * 2.399963;
    const direction = [Math.cos(theta) * Math.sqrt(1 - y * y), y, Math.sin(theta) * Math.sqrt(1 - y * y)];
    // Keep authored front scenery and every destination's clearing open.
    if ((direction[2] > 0.1 && direction[1] > 0.2) || nearClearing(direction)) continue;
    const s = studio(materials, options); s.tree(0, 0, 0.5 + (i % 4) * 0.13, i % 5 === 0);
    const frame = surfaceFrame(direction, 2.46);
    s.root.position.copy(frame.position); s.root.quaternion.copy(frame.quaternion); garden.add(s.root);
  }
  // A winding sandy footpath lies on the sphere, connecting the front clearings.
  for (let i = 0; i < 58; i++) {
    const t = i / 57;
    const frame = surfaceFrame([Math.sin(t * 5.4 - 2.5) * 0.68, 0.25 + t * 0.8, 0.85 - t * 0.5], 2.505);
    const s = studio(materials, options);
    const pebble = s.mesh(new THREE.SphereGeometry(1, 8, 6), i % 3 ? '#dfd7b5' : '#e9dfbd');
    pebble.position.copy(frame.position); pebble.quaternion.copy(frame.quaternion); pebble.scale.set(0.09, 0.018, 0.075); garden.add(pebble);
  }
  // Tiny meadow clusters break up the open front without obscuring the landmarks.
  for (let i = 0; i < 18; i++) {
    const s = studio(materials, options);
    const angle = i * 2.39996;
    const direction = [Math.sin(angle) * 0.7, -0.12 - (i % 4) * 0.13, 0.8];
    if (nearClearing(direction)) continue;
    s.ball('#85a88f', [-0.035, 0.035, 0], [0.055, 0.07, 0.04]);
    s.ball('#b7cc9e', [0.035, 0.04, 0], [0.045, 0.08, 0.035]);
    if (i % 3 === 0) s.ball('#e8d5b4', [0.1, 0.025, 0.05], [0.055, 0.035, 0.04]);
    const frame = surfaceFrame(direction, 2.49);
    s.root.position.copy(frame.position); s.root.quaternion.copy(frame.quaternion); garden.add(s.root);
  }
  const result = batchMiniature(garden);
  return result;
}

export function createFlowers() {
  const s = studio();
  for (let i = 0; i < 12; i++) {
    const a = i * 2.39996; const r = 0.47 + (i % 3) * 0.09;
    const x = Math.cos(a) * r; const z = Math.sin(a) * r;
    s.cylinder('#74907c', [x, 0.07, z], 0.009, 0.14);
    for (let p = 0; p < 5; p++) s.ball(i % 2 ? '#f4d2c3' : '#f5e6ae', [x + Math.sin(p * 1.257) * 0.027, 0.15, z + Math.cos(p * 1.257) * 0.027], [0.025, 0.014, 0.025]);
    s.ball('#e9b473', [x, 0.16, z], [0.018, 0.018, 0.018], 0.3);
  }
  return batchMiniature(s.root);
}
