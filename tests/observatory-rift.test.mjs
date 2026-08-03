import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createObservatoryRiftState,
  evaluateObservatoryRift,
  OBSERVATORY_RIFT_TIMING,
  stepObservatoryRift
} from "../src/villa-map/observatory-rift.js";

const CHANNEL_NAMES = [
  "apertureExpansion",
  "wallDissolve",
  "foregroundDepth",
  "foregroundParallax",
  "ringFadeProgress",
  "ringIntensity",
  "backdropSuppression",
  "spatialMotionScale"
];

test("the rift starts closed with immutable normalized channels", () => {
  const state = createObservatoryRiftState({ inLoft: true });

  assert.equal(state.mode, "closed");
  assert.equal(state.transitionProgress, 0);
  assert.equal(state.targetOpen, false);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.channels));
  for (const channel of CHANNEL_NAMES) {
    assert.ok(state.channels[channel] >= 0 && state.channels[channel] <= 1);
  }
});

test("opening is deterministic and stages foreground depth before wall loss", () => {
  const initial = createObservatoryRiftState({ inLoft: true });
  const input = {
    deltaSeconds: OBSERVATORY_RIFT_TIMING.openingSeconds * 0.3,
    targetOpen: true,
    inLoft: true
  };
  const first = stepObservatoryRift(initial, input);
  const second = stepObservatoryRift(initial, input);

  assert.deepEqual(first, second);
  assert.equal(initial.mode, "closed", "the prior state must not be mutated");
  assert.equal(first.mode, "opening");
  assert.ok(first.channels.foregroundDepth > first.channels.wallDissolve);
  assert.ok(first.channels.apertureExpansion > first.channels.wallDissolve);
  assert.ok(first.channels.ringIntensity > 0);
});

test("the aperture completely covers the room before any wall can dissolve", () => {
  const beforeHandoff = evaluateObservatoryRift(0.85);
  const afterHandoff = evaluateObservatoryRift(0.9);

  assert.ok(beforeHandoff.apertureExpansion < 1);
  assert.equal(beforeHandoff.wallDissolve, 0);
  assert.equal(afterHandoff.apertureExpansion, 1);
  assert.ok(afterHandoff.wallDissolve > 0);
});

test("a complete opening exposes every depth channel and retains a quiet rim", () => {
  const opened = stepObservatoryRift(
    createObservatoryRiftState({ inLoft: true }),
    {
      deltaSeconds: OBSERVATORY_RIFT_TIMING.openingSeconds,
      targetOpen: true,
      inLoft: true
    }
  );

  assert.equal(opened.mode, "open");
  assert.equal(opened.transitionProgress, 1);
  assert.equal(opened.channels.apertureExpansion, 1);
  assert.equal(opened.channels.wallDissolve, 1);
  assert.equal(opened.channels.foregroundDepth, 1);
  assert.equal(opened.channels.foregroundParallax, 1);
  assert.equal(opened.channels.backdropSuppression, 1);
  assert.equal(opened.ringFadeProgress, 0);
  assert.equal(opened.channels.ringFadeProgress, 0);
  assert.ok(opened.channels.ringIntensity > 0);
  assert.ok(opened.channels.ringIntensity < 0.25);
});

test("the open state fades its transition rings smoothly over a one-second tail", () => {
  const opened = stepObservatoryRift(
    createObservatoryRiftState({ inLoft: true }),
    {
      deltaSeconds: OBSERVATORY_RIFT_TIMING.openingSeconds,
      targetOpen: true,
      inLoft: true
    }
  );
  const openingIntensity = opened.channels.ringIntensity;

  const halfway = stepObservatoryRift(opened, {
    deltaSeconds: OBSERVATORY_RIFT_TIMING.ringFadeSeconds / 2,
    targetOpen: true,
    inLoft: true
  });
  assert.equal(halfway.mode, "open");
  assert.equal(halfway.transitionProgress, 1);
  assert.ok(Math.abs(halfway.ringFadeProgress - 0.5) < 1e-9);
  assert.ok(halfway.channels.ringIntensity > 0);
  assert.ok(halfway.channels.ringIntensity < openingIntensity);

  const settled = stepObservatoryRift(halfway, {
    deltaSeconds: OBSERVATORY_RIFT_TIMING.ringFadeSeconds / 2,
    targetOpen: true,
    inLoft: true
  });
  assert.equal(settled.transitionProgress, 1);
  assert.equal(settled.ringFadeProgress, 1);
  assert.equal(settled.channels.ringFadeProgress, 1);
  assert.equal(settled.channels.ringIntensity, 0);
  assert.equal(settled.channels.apertureExpansion, 1);
  assert.equal(settled.channels.wallDissolve, 1);
  assert.equal(settled.channels.foregroundDepth, 1);
});

test("ring tail re-arms continuously through close and reversal", () => {
  let state = createObservatoryRiftState({ inLoft: true });
  state = stepObservatoryRift(state, {
    deltaSeconds: OBSERVATORY_RIFT_TIMING.openingSeconds
      + OBSERVATORY_RIFT_TIMING.ringFadeSeconds,
    targetOpen: true,
    inLoft: true
  });
  assert.equal(state.channels.ringIntensity, 0);

  const closing = stepObservatoryRift(state, {
    deltaSeconds: 0.25,
    targetOpen: false,
    inLoft: true
  });
  assert.ok(closing.ringFadeProgress < 1);
  assert.ok(closing.channels.ringIntensity > 0);

  const reversedWithoutTime = stepObservatoryRift(closing, {
    deltaSeconds: 0,
    targetOpen: true,
    inLoft: true
  });
  assert.deepEqual(reversedWithoutTime.channels, closing.channels);

  const closed = stepObservatoryRift(closing, {
    deltaSeconds: OBSERVATORY_RIFT_TIMING.closingSeconds,
    targetOpen: false,
    inLoft: true
  });
  assert.equal(closed.transitionProgress, 0);
  assert.equal(closed.ringFadeProgress, 0);
  assert.equal(closed.channels.ringFadeProgress, 0);
  assert.equal(closed.channels.ringIntensity, 0);
});

test("reversing midway preserves all channels without a visual jump", () => {
  let state = createObservatoryRiftState({ inLoft: true });
  state = stepObservatoryRift(state, {
    deltaSeconds: OBSERVATORY_RIFT_TIMING.openingSeconds * 0.55,
    targetOpen: true,
    inLoft: true
  });
  const beforeReversal = state.channels;

  const reversed = stepObservatoryRift(state, {
    deltaSeconds: 0,
    targetOpen: false,
    inLoft: true
  });
  assert.equal(reversed.mode, "closing");
  assert.deepEqual(reversed.channels, beforeReversal);

  const closed = stepObservatoryRift(reversed, {
    deltaSeconds: OBSERVATORY_RIFT_TIMING.closingSeconds,
    targetOpen: false,
    inLoft: true
  });
  assert.equal(closed.mode, "closed");
  assert.equal(closed.transitionProgress, 0);
});

test("leaving L3 fail-closes and clears an accidentally retained request", () => {
  let state = createObservatoryRiftState({ inLoft: true });
  state = stepObservatoryRift(state, {
    deltaSeconds: 2,
    targetOpen: true,
    inLoft: true
  });
  assert.ok(state.transitionProgress > 0);

  const outside = stepObservatoryRift(state, {
    deltaSeconds: 1,
    targetOpen: true,
    inLoft: false
  });
  assert.equal(outside.mode, "closed");
  assert.equal(outside.targetOpen, false);
  assert.equal(outside.transitionProgress, 0);
  assert.equal(outside.channels.wallDissolve, 0);
  assert.equal(outside.channels.foregroundDepth, 0);
  assert.equal(outside.ringFadeProgress, 0);
  assert.equal(outside.channels.ringFadeProgress, 0);
  assert.equal(outside.channels.ringIntensity, 0);
});

test("reduced motion keeps the dissolve but removes parallax and rim travel", () => {
  const ordinary = evaluateObservatoryRift(0.5);
  const reduced = evaluateObservatoryRift(0.5, { reducedMotion: true });

  assert.equal(reduced.apertureExpansion, ordinary.apertureExpansion);
  assert.equal(reduced.wallDissolve, ordinary.wallDissolve);
  assert.equal(reduced.foregroundDepth, ordinary.foregroundDepth);
  assert.equal(reduced.backdropSuppression, ordinary.backdropSuppression);
  assert.ok(ordinary.foregroundParallax > 0);
  assert.equal(reduced.foregroundParallax, 0);
  assert.equal(reduced.spatialMotionScale, 0);
  assert.ok(reduced.ringIntensity < ordinary.ringIntensity);
});

test("reduced motion freezes travel but still completes the ring tail", () => {
  let state = createObservatoryRiftState({
    inLoft: true,
    reducedMotion: true
  });
  state = stepObservatoryRift(state, {
    deltaSeconds: OBSERVATORY_RIFT_TIMING.openingSeconds,
    targetOpen: true,
    inLoft: true,
    reducedMotion: true
  });
  assert.ok(state.channels.ringIntensity > 0);
  assert.equal(state.channels.spatialMotionScale, 0);

  state = stepObservatoryRift(state, {
    deltaSeconds: OBSERVATORY_RIFT_TIMING.ringFadeSeconds,
    targetOpen: true,
    inLoft: true,
    reducedMotion: true
  });
  assert.equal(state.channels.ringFadeProgress, 1);
  assert.equal(state.channels.ringIntensity, 0);
  assert.equal(state.channels.spatialMotionScale, 0);
});

test("invalid time and progress inputs stay finite and bounded", () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const channels = evaluateObservatoryRift(value);
    for (const channel of CHANNEL_NAMES) {
      assert.ok(Number.isFinite(channels[channel]));
      assert.ok(channels[channel] >= 0 && channels[channel] <= 1);
    }
  }

  const initial = createObservatoryRiftState({ inLoft: true });
  for (const deltaSeconds of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const state = stepObservatoryRift(initial, {
      deltaSeconds,
      targetOpen: true,
      inLoft: true
    });
    assert.equal(state.transitionProgress, 0);
    assert.equal(state.mode, "opening");
  }
});
