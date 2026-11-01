import test from 'node:test';
import assert from 'node:assert/strict';
import { entryVisitKey, claimEntryVisit, startEntrySparkles } from '../src/entry-greeting.js';

test('visit suppression uses the Toronto day and keeps preview separate from normal visits', () => {
  const before = new Date('2026-11-01T03:59:59Z');
  const after = new Date('2026-11-01T04:00:00Z');
  assert.notEqual(entryVisitKey(before), entryVisitKey(after));
  assert.equal(entryVisitKey(after), entryVisitKey(new Date('2026-11-02T04:59:59Z')));
  assert.notEqual(entryVisitKey(after), entryVisitKey(after, true));
  assert.notEqual(entryVisitKey(after), entryVisitKey(new Date('2027-11-01T12:00:00Z')));
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.equal(claimEntryVisit(storage, entryVisitKey(after)), true);
  assert.equal(claimEntryVisit(storage, entryVisitKey(after)), false);
  assert.equal(claimEntryVisit(storage, entryVisitKey(after, true)), true);
});

test('unavailable session storage does not block entering the page', () => {
  assert.equal(claimEntryVisit(null, 'visit'), true);
  assert.equal(claimEntryVisit({ getItem() { throw Error('blocked'); } }, 'visit'), true);
  assert.equal(claimEntryVisit({ getItem() {}, setItem() { throw Error('full'); } }, 'visit'), true);
});

function animationEnvironment(reduced = false) {
  const listeners = new Map();
  const mediaListeners = new Map();
  const frames = new Map();
  let next = 0, disconnected = false, draws = 0;
  const motion = {
    matches: reduced,
    addEventListener: (name, fn) => mediaListeners.set(name, fn),
    removeEventListener: name => mediaListeners.delete(name),
  };
  const document = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const window = {
    devicePixelRatio: 3, matchMedia: () => motion,
    requestAnimationFrame(fn) { const id = ++next; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class { observe() {} disconnect() { disconnected = true; } },
  };
  const ctx = new Proxy({}, { get: (_target, key) => key === 'clearRect' ? () => { draws++; } : () => {}, set: () => true });
  const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ width: 390, height: 844 }) };
  return { window, document, canvas, motion, frames, listeners, mediaListeners,
    get disconnected() { return disconnected; }, get draws() { return draws; },
    tick(time) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(time)); },
  };
}

test('reduced motion renders a still scene and never schedules animation', () => {
  const env = animationEnvironment(true);
  const stop = startEntrySparkles(env.canvas, env);
  assert.ok(env.draws > 0);
  assert.equal(env.frames.size, 0);
  assert.equal(env.canvas.width, 780);
  stop();
  assert.equal(env.disconnected, true);
  assert.equal(env.listeners.size, 0);
  assert.equal(env.mediaListeners.size, 0);
});

test('animation pauses in hidden tabs, reacts to motion changes, and stops after a short sequence', () => {
  const env = animationEnvironment();
  const stop = startEntrySparkles(env.canvas, env);
  assert.equal(env.frames.size, 1);
  env.document.hidden = true;
  env.listeners.get('visibilitychange')();
  assert.equal(env.frames.size, 0);
  env.document.hidden = false;
  env.listeners.get('visibilitychange')();
  assert.equal(env.frames.size, 1);
  env.motion.matches = true;
  env.mediaListeners.get('change')();
  assert.equal(env.frames.size, 0);
  env.motion.matches = false;
  env.mediaListeners.get('change')();
  for (let time = 0; time < 10000; time += 50) env.tick(time);
  assert.equal(env.frames.size, 0);
  stop(); stop();
  assert.equal(env.listeners.size, 0);
  assert.equal(env.mediaListeners.size, 0);
});

test('missing canvas support leaves the greeting usable without animation', () => {
  const stop = startEntrySparkles({ getContext: () => null }, {});
  assert.doesNotThrow(stop);
});
