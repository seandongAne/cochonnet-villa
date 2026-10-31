import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { Box3, PerspectiveCamera } from 'three';
import { createVillaWorld, collidesWithWorld } from '../src/villa-map/world.js';
import { findNearestInteraction } from '../src/villa-map/interaction.js';
import { createExplorerControls } from '../src/villa-map/controls.js';
import { createSkyPlanet, createUniverseTelescope } from '../src/villa-map/universe-gateway-visuals.js';
import { disposeMiniature } from '../src/little-universe/miniature.js';
import { createGarden, createLandmark } from '../src/little-universe/planet.js';
import { landmarks } from '../src/little-universe/content.js';
import { applyUniverseArrival, consumeUniverseArrival, UNIVERSE_RETURN_POSE, TELESCOPE_POSITION, UNIVERSE_GATEWAY_ID } from '../src/villa-map/little-universe-gateway.js';

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

test('return arrival is consumed once while preserving other URL parameters, fragment and history state', () => {
  const location = { href: 'https://www.cochonnetvilla.ca/villa-map/?arrival=little-universe&edit=1&tag=a&tag=b#courtyard' };
  const originalWorld = createVillaWorld();
  const arrivedWorld = applyUniverseArrival(originalWorld, new URL(location.href).search);
  const state = { scroll: [1, 2] }; let replacements = 0;
  const history = { state, replaceState(nextState, title, path) {
    replacements++;
    assert.equal(nextState, state);
    assert.equal(path, '/villa-map/?edit=1&tag=a&tag=b#courtyard');
    location.href = new URL(path, location.href).href;
  } };
  assert.equal(consumeUniverseArrival(location, history), true);
  assert.deepEqual(arrivedWorld.player.start, UNIVERSE_RETURN_POSE);
  assert.equal(applyUniverseArrival(originalWorld, new URL(location.href).search), originalWorld, 'refresh uses the normal entrance');
  assert.equal(consumeUniverseArrival(location, history), false);
  assert.equal(consumeUniverseArrival({ href: 'https://example.com/villa-map/?arrival=unknown' }, history), false);
  assert.equal(replacements, 1);
});

test('telescope visuals, collision and interaction use the same gateway identity', () => {
  const world = createVillaWorld(), telescope = createUniverseTelescope();
  try {
    assert.equal(telescope.name, UNIVERSE_GATEWAY_ID);
    assert.ok(world.interactions.some(item => item.id === UNIVERSE_GATEWAY_ID));
    assert.ok(world.colliders.some(item => item.id === UNIVERSE_GATEWAY_ID));
  } finally { disposeMiniature(telescope); }
});

test('sky uses all six authored landmarks with bounded finite geometry and no shadow or texture load', () => {
  const sky = createSkyPlanet(); let draws = 0, triangles = 0, bytes = 0;
  assert.deepEqual(sky.userData.landmarks, landmarks.map(place => place.id));
  sky.traverse(object => {
    if (!object.isMesh) return;
    draws++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    for (const attribute of Object.values(object.geometry.attributes)) bytes += attribute.array.byteLength;
    bytes += object.geometry.index?.array.byteLength ?? 0;
    assert.ok(Array.from(object.geometry.attributes.position.array).every(Number.isFinite));
    assert.equal(object.castShadow, false); assert.equal(object.receiveShadow, false);
    assert.equal(object.material.map, null); assert.equal(object.material.fog, false);
    assert.equal(object.material.depthTest, true);
    if (!object.material.transparent) {
      const colors = object.geometry.attributes.color;
      assert.equal(object.material.vertexColors, true);
      assert.equal(colors.count, object.geometry.attributes.position.count);
      assert.ok([...colors.array].every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    }
  });
  assert.ok(draws <= 4, `sky draw budget: ${draws}`);
  assert.ok(triangles <= 30000, `sky triangle budget: ${triangles}`);
  assert.ok(bytes <= 3 * 1024 * 1024, `sky geometry byte budget: ${bytes}`);
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

test('distant tessellation keeps every landmark and garden envelope without changing full-detail defaults', () => {
  const fullTriangleCounts = { garden: 25440, camping: 1328, music: 25300, workshop: 16376, museum: 13944, 'movie-night': 14984, 'one-more-episode': 6024 };
  function triangles(root) {
    let total = 0;
    root.traverse(mesh => { if (mesh.isMesh) total += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3; });
    return total;
  }
  for (const id of ['garden', ...landmarks.map(place => place.id)]) {
    const factory = id === 'garden' ? createGarden : options => createLandmark(id, options);
    const full = factory(), distant = factory({ distant: true });
    try {
      const a = new Box3().setFromObject(full), b = new Box3().setFromObject(distant);
      assert.ok(a.min.distanceTo(b.min) < .04 && a.max.distanceTo(b.max) < .04, `${id} preserves its authored extent`);
      assert.equal(triangles(full), fullTriangleCounts[id], `${id} keeps its full-detail geometry`);
      assert.ok(triangles(distant) < triangles(full) * .6, `${id} reduces actual geometry`);
    } finally { disposeMiniature(full); disposeMiniature(distant); }
  }
});

test('public home and sitemap do not advertise the birthday entrance', () => {
  for (const file of ['src/pages/index.astro', 'src/render-site.js', 'src/seo.js', 'content/site.json']) {
    assert.doesNotMatch(readFileSync(new URL('../'+file, import.meta.url), 'utf8'), /little-universe/);
  }
});

test('villa sky imports geometry without reaching birthday copy or media catalogs', () => {
  const visited = new Set();
  function walk(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const source = readFileSync(url, 'utf8');
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g)) {
      walk(new URL(match[1], url));
    }
  }
  walk(new URL('../src/villa-map/universe-gateway-visuals.js', import.meta.url));
  for (const file of ['content.js', 'media-details.js', 'collection-models.js', 'vinyl-records.js']) {
    assert.ok(!visited.has(new URL(`../src/little-universe/${file}`, import.meta.url).href), `villa imports ${file}`);
  }
});
