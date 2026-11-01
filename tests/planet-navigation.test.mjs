import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { landmarks } from '../src/little-universe/content.js';
import { copyPose, focusPose } from '../src/little-universe/focus-camera.js';
import { CAMP_VIEW_BOUNDS, campingViewCoordinates, moveCampingPose, advanceRoomZoom, createRoomZoom, createRoomPointer, moveRoomPointer, planetCandidate, rotatePlanetPose, wheelPixels, zoomPlanetPose, PLANET_MIN_DISTANCE, PLANET_MAX_DISTANCE } from '../src/little-universe/planet-navigation.js';

test('camping drag stays in a frontal sector above its own ground and never moves the fire target', () => {
  const camp = landmarks.find(place => place.id === 'camping');
  const reference = focusPose(camp); const saved = copyPose(reference);
  for (const aspect of [.46, 1.5]) {
    for (const [dx, dy] of [[1000, 1000], [-1000, 1000], [1000, -1000], [-1000, -1000]]) {
      let pose = focusPose(camp, aspect);
      for (let i = 0; i < 20; i++) pose = moveCampingPose(pose, reference, { dx, dy, height: 844 });
      const view = campingViewCoordinates(pose, reference);
      assert.ok(Math.abs(view.yaw) <= CAMP_VIEW_BOUNDS.yaw + 1e-9);
      assert.ok(view.elevation >= CAMP_VIEW_BOUNDS.minElevation - 1e-9);
      assert.ok(view.elevation <= CAMP_VIEW_BOUNDS.maxElevation + 1e-9);
      assert.ok(pose.position.clone().sub(reference.target).dot(reference.up) > 0);
      assert.deepEqual(pose.target, reference.target);
      assert.deepEqual(pose.up, reference.up);
      const reverse = moveCampingPose(pose, reference, { dx: -Math.sign(dx) * 20, dy: -Math.sign(dy) * 20 });
      assert.ok(reverse.position.distanceTo(pose.position) > .01, 'drag reverses immediately at the invisible boundary');
    }
  }
  assert.deepEqual(reference, saved);
});

test('camping wheel zoom keeps the local fire target and reaches a deliberate exit distance', () => {
  const reference = focusPose(landmarks.find(place => place.id === 'camping'));
  let pose = copyPose(reference);
  for (let i = 0; i < 60; i++) pose = moveCampingPose(pose, reference, { zoom: -120 });
  assert.ok(Math.abs(pose.position.distanceTo(reference.target) - CAMP_VIEW_BOUNDS.minDistance) < 1e-9);
  for (let i = 0; i < 60; i++) pose = moveCampingPose(pose, reference, { zoom: 120 });
  assert.ok(Math.abs(pose.position.distanceTo(reference.target) - CAMP_VIEW_BOUNDS.exitDistance) < 1e-9);
  assert.deepEqual(pose.target, reference.target);
});

test('dragging from every cabin rotates the complete pose without crossing the planet or mutating its saved view', () => {
  for (const place of landmarks) {
    const start = focusPose(place); const saved = copyPose(start);
    let pose = start;
    for (let i = 0; i < 300; i++) {
      pose = rotatePlanetPose(pose, 11, i % 2 ? 6 : -4, 720);
      assert.ok(Math.abs(pose.position.length() - start.position.length()) < 1e-9);
      assert.ok(Math.abs(pose.position.distanceTo(pose.target) - start.position.distanceTo(start.target)) < 1e-9);
      assert.ok(Math.abs(pose.up.length() - 1) < 1e-9);
      assert.ok([...pose.position, ...pose.target, ...pose.up].every(Number.isFinite));
    }
    assert.deepEqual(start, saved);
    assert.ok(pose.position.distanceTo(start.position) > .1);
  }
});

test('zoom is bounded, keeps the viewing side, and recentres smoothly as the planet pulls away', () => {
  for (const place of landmarks) {
    const start = focusPose(place); let pose = start;
    for (let i = 0; i < 80; i++) pose = zoomPlanetPose(pose, -100);
    assert.ok(Math.abs(pose.position.length() - PLANET_MIN_DISTANCE) < 1e-9);
    for (let i = 0; i < 80; i++) pose = zoomPlanetPose(pose, 100);
    assert.ok(Math.abs(pose.position.length() - PLANET_MAX_DISTANCE) < 1e-9);
    assert.ok(pose.target.length() < 1e-8);
    assert.ok(pose.position.clone().normalize().distanceTo(start.position.clone().normalize()) < 1e-9);
    assert.deepEqual(zoomPlanetPose(start, 0), start);
  }
});

test('candidate highlighting ignores the back of the globe and does not select offscreen cabins', () => {
  const places = [{ id: 'front', direction: [0, 0, 1] }, { id: 'back', direction: [0, 0, -1] }];
  const pose = { position: new Vector3(0, 0, 12), target: new Vector3(), up: new Vector3(0, 1, 0) };
  assert.equal(planetCandidate(places, pose), 'front');
  assert.equal(planetCandidate(places.slice(1), pose), null);
  assert.equal(planetCandidate(places, { ...pose, target: new Vector3(30, 0, 12) }), null);
});

test('room zoom stays bounded across repeated outward bursts and never arms an exit', () => {
  for (const baseFov of [58, 62]) {
    let zoom = createRoomZoom(baseFov);
    for (const delta of [160, 160, 160, 160, 100, 60, 60, 160, 160]) {
      zoom = advanceRoomZoom(zoom, delta);
      assert.ok(zoom.fov >= 38 && zoom.fov <= 78);
      assert.equal(zoom.exit, undefined);
      assert.equal(zoom.armedAt, undefined);
    }
    assert.equal(zoom.fov, 78);
    for (let i = 0; i < 30; i++) zoom = advanceRoomZoom(zoom, -120);
    assert.equal(zoom.fov, 38);
    assert.equal(advanceRoomZoom(zoom, 0).fov, 38);
  }
});

test('room look gestures stay drags even when the pointer returns to the doorway', () => {
  const start = { pointerId: 1, clientX: 200, clientY: 120 };
  let pointer = createRoomPointer(start);
  pointer = moveRoomPointer(pointer, { ...start, clientX: 203, clientY: 122 });
  assert.equal(pointer.dragged, false);
  pointer = moveRoomPointer(pointer, { ...start, clientX: 206 });
  assert.equal(pointer.dragged, true);
  pointer = moveRoomPointer(pointer, start);
  assert.equal(pointer.dragged, true);
  assert.equal(createRoomPointer(start).dragged, false);
});

test('wheel deltas normalize mouse lines, trackpad pixels and page scrolling without unbounded jumps', () => {
  assert.equal(wheelPixels({ deltaY: 3, deltaMode: 1 }), 48);
  assert.equal(wheelPixels({ deltaY: 2.5, deltaMode: 0 }), 2.5);
  assert.equal(wheelPixels({ deltaY: 1, deltaMode: 2 }), 160);
  assert.equal(wheelPixels({ deltaY: -1000, deltaMode: 0 }), -160);
});


test('gallery zoom clamps at both limits and never exits after repeated or separated wheel gestures', () => {
  let zoom = { ...createRoomZoom(), armedAt: 0, exitDelta: 150, exit: true };
  for (const now of [30, 60, 300, 600, 1000, 20000, 21000]) {
    zoom = advanceRoomZoom(zoom, 1000);
    assert.equal(zoom.fov, 78);
    assert.equal(zoom.exit, undefined);
    assert.equal(zoom.armedAt, undefined);
    assert.equal(zoom.exitDelta, undefined);
  }
  zoom = advanceRoomZoom(zoom, -120);
  assert.ok(zoom.fov < 78 && zoom.fov > 38, 'zoom can reverse immediately at the boundary');
  for (let i = 0; i < 10; i++) zoom = advanceRoomZoom(zoom, -1000);
  assert.equal(zoom.fov, 38);
  assert.equal(zoom.exit, undefined);
  zoom = advanceRoomZoom(zoom, 120);
  assert.ok(zoom.fov > 38 && zoom.fov < 78);
});
