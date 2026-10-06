import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  VILLA_BOUNDS, WELCOME_GATE, FENCE_GROUND_Y, GATE_LEAF_FOOTPRINTS,
  createFenceLayout, createFenceFallback, createPerimeterFence, disposePerimeterFence
} from '../src/villa-map/perimeter-fence.js';
import { createVillaWorld, collidesWithWorld, MUSHROOM_INTERIOR } from '../src/villa-map/world.js';
import { COURTYARD_PATHS } from '../src/villa-map/garden-finishes.js';

const names = { panel: 'CV_Panel_3m', post: 'CV_Post', gate: 'CV_Welcome_Gate_6m' };
let sourcesPromise;
function sources() {
  return sourcesPromise ??= Promise.all(Object.entries(names).map(async ([kind, name]) => {
    const buffer = fs.readFileSync(new URL(`../public/models/fence/${name}.glb`, import.meta.url));
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return [kind, (await new GLTFLoader().parseAsync(data, '')).scene];
  })).then(Object.fromEntries);
}

test('fence modules retain metre coordinates and have no texture/network dependencies', async () => {
  let bytes = 0;
  for (const name of Object.values(names)) {
    const buffer = fs.readFileSync(new URL(`../public/models/fence/${name}.glb`, import.meta.url));
    bytes += buffer.length;
    const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)));
    assert.equal(json.images?.length ?? 0, 0);
    assert.ok(json.buffers.every(b => !b.uri));
    assert.equal(json.extensionsRequired?.length ?? 0, 0);
  }
  assert.ok(bytes < 600_000, 'one download per module, under 600 kB combined');
  const s = await sources();
  for (const [kind, expectedHeight] of [['panel', 1.12], ['post', 1.3], ['gate', 1.35]]) {
    const b = new THREE.Box3().setFromObject(s[kind]);
    assert.ok(Math.abs(b.max.y - expectedHeight) < .002);
    assert.ok(b.min.y >= -.001);
  }
  for (const [i, name] of ['CV_Gate_Left_Hinge', 'CV_Gate_Right_Hinge'].entries()) {
    const b = new THREE.Box3().setFromObject(s.gate.getObjectByName(name));
    const c = GATE_LEAF_FOOTPRINTS[i];
    assert.ok(b.min.x >= c.minX && b.max.x <= c.maxX);
    assert.ok(b.min.z >= c.minZ && b.max.z <= c.maxZ, 'collision covers the shipped open leaf');
  }
});

test('layout covers the perimeter exactly, fills short tails and uses one post at every joint', () => {
  const layout = createFenceLayout();
  assert.equal(layout.panels.length, 110);
  assert.ok(Math.abs(layout.panels.reduce((sum, p) => sum + p.span, 0) - 325.5) < 1e-6);
  assert.deepEqual(layout.panels.filter(p => p.span < 3).map(p => p.span).sort(), [1, 1, 2.75, 2.75]);
  const keys = layout.posts.map(p => `${p.x.toFixed(6)},${p.z.toFixed(6)}`);
  assert.equal(new Set(keys).size, keys.length);
  const gatePosts = [-1.25, 5.25].map(x => `${x.toFixed(6)},42.000000`);
  assert.ok(gatePosts.every(key => !keys.includes(key)), 'welcome GLB already includes its posts');
  const postAt = (x, z) => keys.includes(`${x.toFixed(6)},${z.toFixed(6)}`)
    || (z === WELCOME_GATE.z && gatePosts.includes(`${x.toFixed(6)},${z.toFixed(6)}`));
  for (const p of layout.panels) {
    assert.ok(postAt(p.x, p.z));
    assert.ok(postAt(p.x + Math.cos(p.rotationY) * p.span, p.z - Math.sin(p.rotationY) * p.span));
  }
  for (const x of [VILLA_BOUNDS.minX, VILLA_BOUNDS.maxX]) {
    for (const z of [VILLA_BOUNDS.minZ, VILLA_BOUNDS.maxZ]) assert.ok(postAt(x, z));
  }
});

test('visible perimeter blocks exploration before clipping wood, gate approach and buried tower stay clear', () => {
  const world = createVillaWorld();
  assert.deepEqual(world.bounds, VILLA_BOUNDS);
  for (const p of createFenceLayout().panels) {
    const x = p.x + Math.cos(p.rotationY) * p.span / 2;
    const z = p.z - Math.sin(p.rotationY) * p.span / 2;
    assert.equal(collidesWithWorld({ x, z, y: 1.6 }, world), true);
  }
  assert.equal(collidesWithWorld({ x: -39.3, z: 0 }, world), true, 'player radius cannot overlap a fence foot');
  assert.equal(collidesWithWorld({ x: -39.1, z: 0 }, world), false);
  assert.equal(collidesWithWorld({ x: -1.25, z: 40 }, world), true, 'open leaf remains solid');
  assert.equal(collidesWithWorld({ x: 5.25, z: 40 }, world), true);
  assert.equal(collidesWithWorld({ x: 2, z: 41 }, world), false, 'walk up the open centre');
  assert.equal(collidesWithWorld({ x: 2, z: 41.5 }, world), true, 'gate never permits leaving the exploration bounds');
  assert.equal(collidesWithWorld(world.player.start, world), false);
  assert.equal(collidesWithWorld(MUSHROOM_INTERIOR.spawn, world), false);
  assert.ok(world.colliders.filter(c => /^(perimeter-fence|welcome-gate)/.test(c.id)).every(c => c.minY === 0 && c.maxY === 3));
  assert.equal(COURTYARD_PATHS[0].x, WELCOME_GATE.x);
  assert.equal(COURTYARD_PATHS[0].z + COURTYARD_PATHS[0].depth / 2, WELCOME_GATE.z);
  assert.equal(COURTYARD_PATHS[0].z - COURTYARD_PATHS[0].depth / 2, -3);
});

test('authored fence uses 14 material draws, retains open gateway and has safe independently owned disposal', async () => {
  const s = await sources(), root = createPerimeterFence(s);
  root.updateMatrixWorld(true);
  assert.equal(root.children.length, 14);
  assert.ok(root.children.every(m => m.isInstancedMesh && m.boundingSphere && m.castShadow && m.receiveShadow));
  assert.equal(root.children.filter(m => m.name.startsWith('fence-panel')).length, 4);
  assert.ok(root.children.filter(m => m.name.startsWith('fence-panel')).every(m => m.count === 110));
  const b = new THREE.Box3().setFromObject(root);
  assert.ok(Math.abs(b.min.x - (VILLA_BOUNDS.minX - .15)) < .002);
  assert.ok(Math.abs(b.max.z - (VILLA_BOUNDS.maxZ + .15)) < .002);
  assert.ok(Math.abs(b.min.y - FENCE_GROUND_Y) < .001);
  assert.ok(Math.abs(b.max.y - 1.37) < .002);
  const ray = new THREE.Raycaster(new THREE.Vector3(2, .7, 38), new THREE.Vector3(0, 0, 1), 0, 8);
  assert.equal(ray.intersectObject(root, true).length, 0, 'no stray panel closes the welcome opening');
  const cornerRay = new THREE.Raycaster(new THREE.Vector3(-38.5, .8, -38), new THREE.Vector3(0, 0, -1), 0, 3);
  assert.ok(cornerRay.intersectObject(root, true).length > 0, 'real module lies on the world boundary');
  let sourceDisposals = 0, ownedDisposals = 0;
  for (const source of Object.values(s)) source.traverse(m => {
    if (m.isMesh) { m.geometry.addEventListener('dispose', () => sourceDisposals++); m.material.addEventListener('dispose', () => sourceDisposals++); }
  });
  root.traverse(m => { if (m.isMesh) m.geometry.addEventListener('dispose', () => ownedDisposals++); });
  disposePerimeterFence(root); disposePerimeterFence(root);
  assert.equal(sourceDisposals, 0, 'cached GLBs survive unmount');
  assert.equal(ownedDisposals, 14, 'idempotent instance cleanup');
});

test('failed-download fallback preserves the same boundary, low draw count and open welcome gate', () => {
  const fallback = createFenceFallback();
  fallback.updateMatrixWorld(true);
  assert.ok(fallback.children.length <= 7);
  const b = new THREE.Box3().setFromObject(fallback);
  assert.ok(Math.abs(b.min.x + 40.15) < .002);
  assert.ok(Math.abs(b.max.z - 42.15) < .002);
  assert.equal(new THREE.Raycaster(new THREE.Vector3(2, .7, 38), new THREE.Vector3(0, 0, 1), 0, 8)
    .intersectObject(fallback, true).length, 0);
  disposePerimeterFence(fallback);
});
