import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3, Box3 } from 'three';
import { birthday, landmarks, visitLandmark, surfacePosition } from '../src/little-universe/content.js';
import { createFlowers, createGarden, createLandmark, disposeMiniature, surfaceFrame } from '../src/little-universe/planet.js';
import { cameraFlight, copyPose, focusPose } from '../src/little-universe/focus-camera.js';
import { CAMPING_PARTS, campingMotion, createCampingMiniature } from '../src/little-universe/camping.js';

test('campsite has two distinct chairs, recognizable characters, tent, lantern, logs, and fire', () => {
  const camp = createCampingMiniature();
  for (const name of CAMPING_PARTS) assert.ok(camp.getObjectByName(name), `${name} exists`);
  assert.ok(camp.getObjectByName('chair-pig').position.x < 0);
  assert.ok(camp.getObjectByName('chair-baicai').position.x > 0);
  const bounds = new Box3().setFromObject(camp);
  assert.ok(bounds.max.y < 1.5);
  assert.ok(bounds.min.x > -0.8 && bounds.max.x < 0.8, 'props stay in the original clearing');
  let draws = 0;
  camp.traverse((object) => { if (object.isMesh) draws++; });
  assert.ok(draws < 60, 'detailed props remain material-batched');
  disposeMiniature(camp);
});

test('campfire flicker and ambient motion stay gentle and stop under reduced motion', () => {
  const still = campingMotion(0, true);
  for (let i = 0; i < 1000; i++) {
    const motion = campingMotion(i * 0.13);
    assert.ok(motion.flame >= 0.91 && motion.flame <= 1.09);
    assert.ok(motion.fireLight > 0.19 && motion.fireLight < 0.25);
    assert.ok(Math.abs(motion.pigBreath) <= 0.0025);
    assert.ok(Math.abs(motion.leafSway) <= 0.018);
    assert.deepEqual(campingMotion(i, true), still);
  }
});

test('focus poses frame each miniature from its front, outside the planet on wide and narrow screens', () => {
  for (const place of landmarks) for (const aspect of [0.46, 1.5, 2.4]) {
    const pose = focusPose(place, aspect);
    assert.ok(pose.position.length() > 4);
    assert.ok(Math.abs(pose.up.length() - 1) < 1e-9);
    const heightAboveTarget = pose.position.clone().sub(pose.target).dot(pose.up);
    if (place.id === 'camping') {
      assert.ok(heightAboveTarget > 0.9 && heightAboveTarget < 1.3, 'campers stay visible from a lower, face-level approach');
    } else assert.ok(heightAboveTarget > 1.5);
    assert.ok(pose.target.length() > 2.5);
    assert.ok(pose.position.clone().sub(pose.target).cross(pose.up).length() > 2);
  }
});

test('focus flights and their return paths stay outside the sphere, even from its far side', () => {
  for (const place of landmarks) {
    const focused = focusPose(place);
    const overview = { position: focused.position.clone().normalize().multiplyScalar(-10), target: new Vector3(0, 0.3, 0), up: new Vector3(0, 1, 0) };
    for (const [from, to] of [[overview, focused], [focused, overview]]) {
      const flight = cameraFlight(from, to);
      for (let i = 0; i <= 100; i++) {
        const pose = flight(i / 100);
        assert.ok(pose.position.length() > 4, 'never cut through the planet');
        assert.ok([...pose.position, ...pose.target, ...pose.up].every(Number.isFinite));
      }
      assert.ok(flight(0).position.distanceTo(from.position) < 1e-8);
      assert.ok(flight(1).position.distanceTo(to.position) < 1e-8);
      assert.ok(flight(1).target.distanceTo(to.target) < 1e-8);
      assert.ok(flight(1).up.distanceTo(to.up) < 1e-8);
    }
  }
});

test('interrupting a focus flight starts at the current pose and preserves the saved overview', () => {
  const overview = { position: new Vector3(6, 5, 9), target: new Vector3(0, 0.3, 0), up: new Vector3(0, 1, 0) };
  const saved = copyPose(overview);
  const halfway = cameraFlight(overview, focusPose(landmarks[0]))(0.4);
  const interrupted = cameraFlight(halfway, focusPose(landmarks[2]));
  assert.ok(interrupted(0).position.distanceTo(halfway.position) < 1e-8);
  assert.deepEqual(overview, saved);
  const returned = cameraFlight(interrupted(0.5), saved)(1);
  assert.ok(returned.position.distanceTo(overview.position) < 1e-8);
});

test('memories can be visited in any order, without duplicates or unknown destinations', () => {
  let visited = [];
  for (const id of ['museum', 'camping', 'workshop', 'music']) visited = visitLandmark(visited, id);
  assert.deepEqual(visited, ['museum', 'camping', 'workshop', 'music']);
  assert.equal(visitLandmark(visited, 'camping'), visited);
  assert.equal(visitLandmark(visited, 'missing'), visited);
  assert.deepEqual(visitLandmark([], 'workshop'), ['workshop']);
});

test('every clearing sits on the sphere, points outward, and has space for its miniature', () => {
  for (const place of landmarks) {
    const frame = surfaceFrame(place.direction);
    assert.ok(Math.abs(frame.position.length() - 2.5) < 1e-8);
    const up = new Vector3(0, 1, 0).applyQuaternion(frame.quaternion);
    assert.ok(up.distanceTo(frame.position.clone().normalize()) < 1e-8);
    for (const other of landmarks.filter((p) => p.id !== place.id)) {
      assert.ok(frame.position.distanceTo(surfaceFrame(other.direction).position) > 1.3, `${place.id}/${other.id} clearings overlap`);
    }
  }
  assert.throws(() => surfacePosition([0, 0, 0]), RangeError);
});

test('miniatures build without browser globals and have finite, bounded geometry', () => {
  for (const place of landmarks) {
    const object = createLandmark(place.id);
    const bounds = new Box3().setFromObject(object);
    assert.ok(bounds.min.y >= -0.05);
    assert.ok(bounds.max.y < 1.5);
    let draws = 0;
    object.traverse(mesh => { if (mesh.isMesh) draws++; });
    assert.ok(draws < 20, 'static shapes are batched by material');
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));
    });
    disposeMiniature(object);
  }
  for (const factory of [createGarden, createFlowers]) {
    const object = factory();
    assert.ok(!new Box3().setFromObject(object).isEmpty());
    disposeMiniature(object);
  }
});

test('disposing a miniature releases each owned geometry and material exactly once', () => {
  const object = createLandmark('camping');
  const resources = new Set();
  object.traverse((mesh) => { if (mesh.isMesh) { resources.add(mesh.geometry); resources.add(mesh.material); } });
  let count = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => count++);
  disposeMiniature(object);
  assert.equal(count, resources.size);
});

test('the camping memory keeps the two characters and the birthday content is editable', () => {
  assert.deepEqual(landmarks[0].dialogue, [
    { speaker: 'Little Pig', text: 'This is my second time camping.' },
    { speaker: 'Bai Baicai', text: 'When was the first time?' },
    { speaker: 'Little Pig', text: 'Yesterday.' },
  ]);
  assert.ok(birthday.message);
  for (const place of landmarks) {
    assert.ok(place.photos.every((photo) => photo.alt && photo.caption));
    for (const field of ['audio', 'video', 'videoPoster', 'videoCaptions']) assert.equal(typeof place[field], 'string');
  }
});
