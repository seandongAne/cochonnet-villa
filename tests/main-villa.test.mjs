import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MAIN_VILLA_DATA } from '../src/villa-map/main-villa-data.js';
import { MAIN_VILLA_POSITION, MAIN_VILLA_ROOF_FLOOR, createMainVillaFallback,
  isActiveInteriorPlacement, isActiveArchitecturePlacement } from '../src/villa-map/main-villa.js';
import { createVillaWorld, collidesWithWorld, isOnUpperFloor } from '../src/villa-map/world.js';
import { getMovementProfile, createExplorerControls } from '../src/villa-map/controls.js';
import { PORKY_PLACEMENTS } from '../src/villa-map/placements.js';
import { FURNITURE_PLACEMENTS } from '../src/villa-map/furniture-placements.js';
import { ARCHITECTURE_PLACEMENTS } from '../src/villa-map/architecture-placements.js';

const bytes = fs.readFileSync(new URL('../public/models/resort/villa.glb', import.meta.url));
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
const modelPromise = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  .then(gltf => {
    const root = gltf.scene;
    root.position.fromArray(MAIN_VILLA_POSITION); root.updateMatrixWorld(true);
    return root;
  });

test('the complete furnished villa preserves source triangles in 26 compressed batches', () => {
  const report = JSON.parse(fs.readFileSync(new URL('../art/resort/maison-des-quinze/import-report.json', import.meta.url)));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), report.runtime_glb_sha256);
  assert.equal(json.meshes.flatMap(m => m.primitives).length, 26);
  const triangles = json.meshes.flatMap(m => m.primitives)
    .reduce((n, p) => n + json.accessors[p.indices].count / 3, 0);
  assert.equal(triangles, 481445);
  assert.equal(triangles, report.source_triangles);
  assert.ok(bytes.length < 4 * 1024 * 1024);
  assert.ok(json.extensionsRequired.includes('EXT_meshopt_compression'));
  assert.equal(json.images?.length ?? 0, 0);
  assert.deepEqual(MAIN_VILLA_DATA.counts, { beds: 15, dining_chairs: 15,
    cinema_seats: 15, computer_stations: 6, showers: 2 });
});

test('production GLTFLoader keeps metre scale, real floor holes, and both open entry doors', async () => {
  const root = await modelPromise;
  const bounds = new THREE.Box3().setFromObject(root);
  assert.ok(bounds.min.x < -13 && bounds.max.x > 13);
  assert.ok(bounds.min.z < -33 && bounds.min.z > -34);
  assert.ok(bounds.max.y > 16 && bounds.max.y < 18);
  const down = (x, y, z) => new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0)).intersectObject(root, true);
  assert.ok(Math.abs(down(-4.25, 8, -13)[0].point.y - 6.65) < .08);
  assert.ok(down(0, 7, -6)[0].point.y < 6, 'double-height foyer is a real hole');
  assert.ok(down(0, 7, -14)[0].point.y < 6, 'stairwell is a real hole');
  assert.ok(Math.abs(down(0, 15, -14)[0].point.y - 13.65) < .12);
  for (const [y, z, direction, distance] of [[1.6, 0, -1, 4], [8.25, -22, -1, 3.4]]) {
    const hits = new THREE.Raycaster(new THREE.Vector3(0, y, z), new THREE.Vector3(0, 0, direction), 0, distance).intersectObject(root, true);
    assert.equal(hits.length, 0, 'entry and upper rear door contain no solid geometry');
  }
});

test('legacy villa props are absent while the exact mushroom furniture records stay active', () => {
  const active = FURNITURE_PLACEMENTS.filter(isActiveInteriorPlacement);
  assert.ok(active.length > 50);
  assert.ok(active.every(p => [2, 3, 4].includes(p.floor)));
  assert.equal(ARCHITECTURE_PLACEMENTS.filter(isActiveArchitecturePlacement).length, 0);
  const world = createVillaWorld();
  assert.equal(world.colliders.some(c => c.id === 'furniture-west-sofa'), false);
  assert.equal(world.colliders.some(c => c.id === 'furniture-bed-double'), false);
  assert.equal(MAIN_VILLA_ROOF_FLOOR, 5);
  for (const [id, y] of [['mushroom-hearth', -48], ['mushroom-den', -40], ['mushroom-loft', -32]]) {
    assert.equal(world.rooms.find(r => r.id === id).floorY, y);
  }
});

test('remapped residents clear the new walls and substantial furniture on their own floors', () => {
  const world = createVillaWorld();
  const residents = PORKY_PLACEMENTS.filter(p => p.position[2] < 0 && p.position[1] >= 0);
  assert.equal(residents.length, 10);
  for (const pig of residents) {
    const position = { x: pig.position[0], y: pig.position[1] + 1.6, z: pig.position[2] };
    assert.equal(collidesWithWorld(position, { ...world, player: { ...world.player,
      radius: pig.clearanceRadius ?? .62 } }), false, pig.id);
  }
});

// Drive the actual production controls through key events. Each short leg
// walks continuously, including frame-by-frame height easing and collision.
test('a radius .62 player walks courtyard → both main flights → rear door → roof and back', () => {
  const listeners = new Map();
  const prior = globalThis.document;
  globalThis.document = { addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name) };
  const world = createVillaWorld();
  const camera = new THREE.PerspectiveCamera();
  const controls = createExplorerControls({ camera, world,
    canvas: { addEventListener() {}, removeEventListener() {} } });
  const route = [[0, -9.8], [-1.18, -9.8], [-1.18, -17.55], [1.18, -17.55],
    [1.18, -9.8], [4.25, -9.8], [4.25, -21], [0, -21], [0, -24.815],
    [-1.05, -24.815], [-1.05, -32.26], [1.05, -32.26], [1.05, -24.9],
    [1.05, -20.6], [0, -20.6], [0, -14]];
  const walkTo = ([x, z]) => {
    for (const [axis, target, positiveKey, negativeKey] of [['x', x, 'KeyD', 'KeyA'], ['z', z, 'KeyS', 'KeyW']]) {
      const distance = target - camera.position[axis];
      if (Math.abs(distance) < 1e-6) continue;
      const code = distance > 0 ? positiveKey : negativeKey;
      listeners.get('keydown')({ code, preventDefault() {} });
      for (let i = 0; i < 3000 && Math.abs(target - camera.position[axis]) > 1e-6; i++) {
        const speed = world.player.speed * getMovementProfile(camera.position, world).speedMultiplier;
        const dt = Math.min(1 / 60, Math.abs(target - camera.position[axis]) / speed);
        controls.update(dt);
      }
      listeners.get('keyup')({ code });
      assert.ok(Math.abs(target - camera.position[axis]) < 1e-5, `blocked at ${camera.position.toArray()} toward ${x},${z}`);
    }
    for (let i = 0; i < 30; i++) controls.update(1 / 60);
  };
  try {
    route.forEach(walkTo);
    assert.ok(Math.abs(camera.position.y - 15.25) < .01);
    route.slice(0, -1).reverse().forEach(walkTo);
    walkTo([0, 18]);
    assert.ok(Math.abs(camera.position.y - 1.6) < .01);
  } finally { controls.dispose(); globalThis.document = prior; }
});

test('guards block the atrium, roof edges and lateral falls; stacked routes ignore the courtyard', () => {
  const world = createVillaWorld();
  for (const position of [
    { x: 3, y: 8.25, z: -6 }, { x: 0, y: 8.25, z: -4 },
    { x: -10.85, y: 15.25, z: -14 }, { x: 0, y: 15.25, z: -5.25 },
    { x: -2.05, y: 10, z: -28.4 }, { x: 2.18, y: 11.75, z: -32.3 }
  ]) assert.equal(collidesWithWorld(position, world), true, JSON.stringify(position));
  assert.equal(collidesWithWorld({ x: 0, y: 1.6, z: -24 }, world), true);
  assert.equal(collidesWithWorld({ x: 0, y: 8.25, z: -24 }, world), false);
  assert.equal(getMovementProfile({ x: 1.05, y: 1.6, z: -29 }, world).cameraY, 1.6);
  assert.equal(isOnUpperFloor({ x: 0, y: 8.25, z: -6 }, world), false);
  assert.equal(isOnUpperFloor({ x: 0, y: 15.25, z: -22 }, world), false);
});

test('room portals remain capsule-clear and the rear landing permits a natural diagonal turn', () => {
  const world = createVillaWorld();
  for (const portal of MAIN_VILLA_DATA.portals) {
    if (portal.id === 'UF_Front_Facade_portal_14') continue; // fixed front glass
    const [x, z, floor] = portal.center_design;
    assert.equal(collidesWithWorld({ x, y: floor + 1.6, z: -z }, world), false, portal.id);
  }
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    assert.equal(collidesWithWorld({ x: -1.05 * t, y: 8.25, z: -24 - 1.05 * t }, world), false);
  }
  assert.equal(collidesWithWorld({ x: -2.16, y: 1.6, z: -28.4 }, world), true);
  assert.equal(collidesWithWorld({ x: 2.35, y: 1.6, z: -26.6 }, world), true);
  assert.equal(collidesWithWorld({ x: 0, y: 1.6, z: -28.4 }, world), false);
});

test('fail-soft geometry retains the same slabs and switchback route as the furnished GLB', () => {
  const root = createMainVillaFallback();
  root.position.fromArray(MAIN_VILLA_POSITION); root.updateMatrixWorld(true);
  const down = (x, y, z) => new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0)).intersectObject(root, true);
  assert.ok(Math.abs(down(-4.25, 8, -13)[0].point.y - 6.65) < .001);
  assert.ok(down(0, 7, -6)[0].point.y < 6);
  assert.ok(Math.abs(down(0, 15, -14)[0].point.y - 13.65) < .001);
});
