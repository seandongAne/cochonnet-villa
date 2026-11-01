import test from 'node:test';
import assert from 'node:assert/strict';
import { isCabbageBirthday, birthdayPreview, watchBirthday } from '../src/birthday.js';

test('birthday follows Toronto midnight, including the 2026 DST change', () => {
  for (const [instant, expected] of [
    ['2026-11-01T03:59:59.999Z', false],
    ['2026-11-01T04:00:00.000Z', true],
    ['2026-11-01T05:59:59.999Z', true],
    ['2026-11-01T06:00:00.000Z', true],
    ['2026-11-02T04:59:59.999Z', true],
    ['2026-11-02T05:00:00.000Z', false],
    ['2027-11-01T04:00:00.000Z', true],
    ['2028-11-01T12:00:00.000Z', true],
    ['2028-10-01T12:00:00.000Z', false],
    ['invalid', false],
  ]) assert.equal(isCabbageBirthday(instant), expected, instant);
});

test('the same instant has the same result regardless of input timezone', () => {
  assert.equal(isCabbageBirthday('2026-11-01T00:00:00-04:00'), true);
  assert.equal(isCabbageBirthday('2026-11-01T12:00:00+08:00'), true);
  assert.equal(isCabbageBirthday('2026-11-01T00:00:00+08:00'), false);
});

test('preview overrides are limited to exact loopback hosts', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(birthdayPreview({ hostname, search: '?birthday=on' }), true);
    assert.equal(birthdayPreview({ hostname, search: '?birthday=off' }), false);
    assert.equal(birthdayPreview({ hostname, search: '?birthday=maybe' }), null);
  }
  for (const hostname of ['www.cochonnetvilla.ca', 'localhost.example.com', '192.168.1.2', '']) {
    assert.equal(birthdayPreview({ hostname, search: '?birthday=on' }), null);
    assert.equal(birthdayPreview({ hostname, search: '?birthday=off' }), null);
  }
});

test('an open page rolls into birthday, wakes after sleep, and cleans up', () => {
  let time = Date.parse('2026-11-01T03:59:59.000Z');
  let callback; let wake; let delay; let canceled = 0; let unsubscribed = false;
  const changes = [];
  const stop = watchBirthday(value => changes.push(value), {
    now: () => time,
    schedule: (fn, ms) => { callback = fn; delay = ms; return 123; },
    cancel: () => { canceled++; },
    subscribeWake: fn => { wake = fn; return () => { unsubscribed = true; }; },
  });
  assert.deepEqual(changes, [false]);
  assert.equal(delay, 1010);
  time += delay; callback();
  assert.deepEqual(changes, [false, true]);
  time += 60000; callback();
  assert.deepEqual(changes, [false, true]);
  time = Date.parse('2026-11-02T05:00:00.000Z'); wake();
  assert.deepEqual(changes, [false, true, false]);
  stop();
  assert.ok(unsubscribed);
  assert.ok(canceled > 0);
  time = Date.parse('2027-11-01T12:00:00Z'); callback(); wake();
  assert.deepEqual(changes, [false, true, false]);
});

import * as THREE from 'three';
import { createVillaWorld } from '../src/villa-map/world.js';
import { createExplorerControls } from '../src/villa-map/controls.js';

test('birthday arrival frames the sky without changing spawn or teleport controls', () => {
  const prior = globalThis.document;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  const world = createVillaWorld();
  const canvas = { addEventListener() {}, removeEventListener() {} };
  try {
    for (const birthday of [false, true]) {
      const camera = new THREE.PerspectiveCamera();
      const controls = createExplorerControls({
        camera, canvas, world, ...(birthday ? { initialPitch: .4, initialYaw: -.3 } : {}),
      });
      assert.deepEqual(camera.position.toArray(), [0, 1.6, 18]);
      assert.equal(camera.rotation.x, birthday ? .4 : 0);
      assert.equal(camera.rotation.y, birthday ? -.3 : 0);
      controls.update(1 / 60);
      assert.equal(camera.rotation.x, birthday ? .4 : 0);
      controls.teleport({ x: -6, y: -30.4, z: 18 }, 1.2);
      assert.equal(camera.rotation.x, 0);
      assert.equal(camera.rotation.y, 1.2);
      controls.dispose();
    }
  } finally { globalThis.document = prior; }
});
