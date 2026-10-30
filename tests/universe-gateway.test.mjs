import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { Box3, PerspectiveCamera } from 'three';
import { createVillaWorld, collidesWithWorld } from '../src/villa-map/world.js';
import { findNearestInteraction } from '../src/villa-map/interaction.js';
import { createExplorerControls } from '../src/villa-map/controls.js';
import { createSkyPlanet, createUniverseTelescope } from '../src/villa-map/universe-gateway-visuals.js';
import { disposeMiniature } from '../src/little-universe/miniature.js';
import { landmarks } from '../src/little-universe/content.js';
import { applyUniverseArrival, UNIVERSE_RETURN_POSE, TELESCOPE_POSITION } from '../src/villa-map/little-universe-gateway.js';

test('telescope has a walkable approach from the unchanged entrance and a solid footprint', () => {
  const world = createVillaWorld();
  assert.deepEqual(world.player.start, { x: 0, y: 1.6, z: 18 });
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    assert.equal(collidesWithWorld({ x: 2 * t, y: 1.6, z: 18 - 1.4 * t }, world), false);
  }
  assert.equal(collidesWithWorld({ ...TELESCOPE_POSITION, y: 1.6 }, world), true);
  assert.equal(findNearestInteraction(world.interactions, UNIVERSE_RETURN_POSE)?.id, 'little-universe-telescope');
  for (const y of [-46.4, -30.4, 8.25]) {
    assert.notEqual(findNearestInteraction(world.interactions, { ...TELESCOPE_POSITION, y })?.id, 'little-universe-telescope');
  }
  assert.equal(findNearestInteraction(world.interactions, {x:-6,y:1.6,z:25})?.id, 'mushroom-house');
});

test('only the explicit return route changes the arrival, without mutating the default world', () => {
  const world = createVillaWorld();
  for (const search of ['', '?arrival=https://example.com', '?arrival=unknown']) assert.equal(applyUniverseArrival(world, search), world);
  const arrival = applyUniverseArrival(world, '?arrival=little-universe');
  assert.deepEqual(arrival.player.start, UNIVERSE_RETURN_POSE);
  assert.equal(collidesWithWorld(arrival.player.start, arrival), false);
  assert.equal(world.player.start.x, 0);
});

test('returning controls face the telescope and suspended controls ignore E', () => {
  const previous = globalThis.document, listeners = new Map(); let count = 0;
  globalThis.document = { pointerLockElement: null, addEventListener: (key, value) => listeners.set(key,value), removeEventListener() {} };
  const camera = new PerspectiveCamera();
  const controls = createExplorerControls({ camera, world: applyUniverseArrival(createVillaWorld(), '?arrival=little-universe'),
    canvas: { addEventListener() {}, removeEventListener() {}, requestPointerLock() {} }, onAction: () => count++ });
  try {
    assert.deepEqual(camera.position.toArray(), [2,1.6,16.6]);
    assert.equal(camera.rotation.y, UNIVERSE_RETURN_POSE.yaw);
    const key = () => listeners.get('keydown')({code:'KeyE',repeat:false});
    key(); assert.equal(count,0);
    controls.lock(); key(); assert.equal(count,1);
    controls.setEnabled(false); key(); assert.equal(count,1);
  } finally { controls.dispose(); globalThis.document = previous; }
});

test('sky uses all six authored landmarks with bounded finite geometry and no shadow or texture load', () => {
  const sky = createSkyPlanet(); let draws = 0, triangles = 0;
  assert.deepEqual(sky.userData.landmarks, landmarks.map(place => place.id));
  sky.traverse(object => {
    if (!object.isMesh) return;
    draws++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    assert.ok(Array.from(object.geometry.attributes.position.array).every(Number.isFinite));
    assert.equal(object.castShadow, false); assert.equal(object.material.map, null);
    assert.equal(object.material.depthTest, true);
  });
  assert.ok(draws <= 70, `sky draw budget: ${draws}`);
  assert.ok(triangles <= 110000, `sky triangle budget: ${triangles}`);
  assert.ok(new Box3().setFromObject(sky, true).min.y > 15, 'the whole planet is above the roof');
  const telescope = createUniverseTelescope();
  const bounds = new Box3().setFromObject(telescope);
  assert.ok(bounds.max.y < 2.2 && bounds.min.y >= 0);
  // Centre sightline from the return position must clear the villa's front
  // eastern edge (x=13 at z=-2), not disappear behind its upper floor.
  const t = (-2 - UNIVERSE_RETURN_POSE.z) / (sky.position.z - UNIVERSE_RETURN_POSE.z);
  assert.ok(UNIVERSE_RETURN_POSE.x + t * (sky.position.x - UNIVERSE_RETURN_POSE.x) > 14);
  disposeMiniature(sky); disposeMiniature(telescope);
});

test('public home and sitemap do not advertise the birthday entrance', () => {
  for (const file of ['src/pages/index.astro', 'src/render-site.js', 'src/seo.js', 'content/site.json']) {
    assert.doesNotMatch(readFileSync(new URL('../'+file, import.meta.url), 'utf8'), /little-universe/);
  }
});
