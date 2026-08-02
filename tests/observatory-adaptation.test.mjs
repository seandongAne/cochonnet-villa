import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createObservatoryAdaptationState,
  evaluateObservatoryDarkCurve,
  OBSERVATORY_ADAPTATION_TIMING,
  stepObservatoryAdaptation
} from "../src/villa-map/observatory-adaptation.js";

const EPSILON = 1e-9;

function nearlyEqual(actual, expected, epsilon = EPSILON) {
  return Math.abs(actual - expected) <= epsilon;
}

test("lights fall before the portal and bright stars reveal", () => {
  const early = evaluateObservatoryDarkCurve(0.25);
  assert.ok(early.houseLight < 1, "house lights should already be falling");
  assert.equal(early.portalReveal, 0);
  assert.equal(early.brightStarReveal, 0);
  assert.equal(early.scotopicAdaptation, 0);

  const portalStart = evaluateObservatoryDarkCurve(
    OBSERVATORY_ADAPTATION_TIMING.portalDelaySeconds + 0.12
  );
  assert.ok(portalStart.houseLight < early.houseLight);
  assert.ok(portalStart.portalReveal > 0);
  assert.equal(
    portalStart.brightStarReveal,
    0,
    "hero stars should trail the first portal glow"
  );

  const reveal = evaluateObservatoryDarkCurve(1.25);
  assert.equal(reveal.houseLight, 0);
  assert.ok(reveal.portalReveal > 0.5);
  assert.ok(reveal.brightStarReveal > 0.25);
});

test("scotopic detail develops gradually across ten seconds", () => {
  const timing = OBSERVATORY_ADAPTATION_TIMING;
  const start = evaluateObservatoryDarkCurve(timing.scotopicDelaySeconds);
  const halfway = evaluateObservatoryDarkCurve(
    timing.scotopicDelaySeconds + timing.scotopicAdaptationSeconds / 2
  );
  const complete = evaluateObservatoryDarkCurve(
    timing.scotopicDelaySeconds + timing.scotopicAdaptationSeconds
  );

  assert.equal(start.scotopicAdaptation, 0);
  assert.ok(nearlyEqual(halfway.scotopicAdaptation, 0.5));
  assert.equal(complete.scotopicAdaptation, 1);
  assert.equal(complete.portalReveal, 1);
  assert.equal(complete.brightStarReveal, 1);
  assert.ok(halfway.nebulaReveal > start.nebulaReveal);
  assert.ok(halfway.faintStarReveal > start.faintStarReveal);
});

test("stepping is deterministic and never mutates the previous state", () => {
  const initial = createObservatoryAdaptationState();
  const input = {
    deltaSeconds: 0.4,
    lightsOn: false,
    inLoft: true,
    reducedMotion: false
  };
  const first = stepObservatoryAdaptation(initial, input);
  const second = stepObservatoryAdaptation(initial, input);

  assert.deepEqual(first, second);
  assert.equal(initial.mode, "inactive");
  assert.equal(initial.channels.houseLight, 1);
  assert.equal(initial.channels.portalReveal, 0);
  assert.notEqual(first, initial);
  assert.notEqual(first.channels, initial.channels);
});

test("turning lights on hides the sky before restoring the room", () => {
  let state = createObservatoryAdaptationState();
  state = stepObservatoryAdaptation(state, {
    deltaSeconds: 12,
    lightsOn: false,
    inLoft: true
  });
  assert.equal(state.channels.scotopicAdaptation, 1);

  const start = stepObservatoryAdaptation(state, {
    deltaSeconds: 0,
    lightsOn: true,
    inLoft: true
  });
  assert.deepEqual(start.channels, state.channels, "toggle should not snap");

  const skyHidden = stepObservatoryAdaptation(start, {
    deltaSeconds: OBSERVATORY_ADAPTATION_TIMING.lightsOnStarHideSeconds,
    lightsOn: true,
    inLoft: true
  });
  assert.equal(skyHidden.channels.houseLight, 0);
  assert.equal(skyHidden.channels.portalReveal, 0);
  assert.equal(skyHidden.channels.brightStarReveal, 0);
  assert.equal(skyHidden.channels.scotopicAdaptation, 0);

  const reset = stepObservatoryAdaptation(skyHidden, {
    deltaSeconds: OBSERVATORY_ADAPTATION_TIMING.lightsOnRoomRestoreSeconds,
    lightsOn: true,
    inLoft: true
  });
  assert.equal(reset.mode, "lit");
  assert.equal(reset.channels.houseLight, 1);
  assert.equal(reset.channels.portalReveal, 0);
  assert.equal(reset.channels.brightStarReveal, 0);
  assert.equal(reset.channels.scotopicAdaptation, 0);
});

test("rapid switch reversal continues from current channels without a jump", () => {
  let state = createObservatoryAdaptationState();
  state = stepObservatoryAdaptation(state, {
    deltaSeconds: 1.1,
    lightsOn: false,
    inLoft: true
  });
  state = stepObservatoryAdaptation(state, {
    deltaSeconds: 0.2,
    lightsOn: true,
    inLoft: true
  });
  const beforeReversal = state.channels;
  const reversed = stepObservatoryAdaptation(state, {
    deltaSeconds: 0,
    lightsOn: false,
    inLoft: true
  });

  assert.deepEqual(reversed.channels, beforeReversal);
});

test("leaving L3 resets the director and re-entry starts fresh", () => {
  let state = createObservatoryAdaptationState();
  state = stepObservatoryAdaptation(state, {
    deltaSeconds: 6,
    lightsOn: false,
    inLoft: true
  });
  assert.ok(state.channels.scotopicAdaptation > 0);

  const outside = stepObservatoryAdaptation(state, {
    deltaSeconds: 1,
    lightsOn: false,
    inLoft: false
  });
  assert.equal(outside.mode, "inactive");
  assert.equal(outside.channels.houseLight, 1);
  assert.equal(outside.channels.portalReveal, 0);
  assert.equal(outside.channels.scotopicAdaptation, 0);

  const reentered = stepObservatoryAdaptation(outside, {
    deltaSeconds: 0.2,
    lightsOn: false,
    inLoft: true
  });
  assert.ok(reentered.channels.houseLight < 1);
  assert.equal(reentered.channels.portalReveal, 0);
  assert.equal(reentered.channels.scotopicAdaptation, 0);
});

test("reduced motion freezes celestial motion but preserves smooth reveal", () => {
  const ordinary = evaluateObservatoryDarkCurve(1.1);
  const reduced = evaluateObservatoryDarkCurve(1.1, { reducedMotion: true });

  assert.equal(ordinary.celestialMotionScale, 1);
  assert.equal(reduced.celestialMotionScale, 0);
  assert.equal(reduced.houseLight, ordinary.houseLight);
  assert.equal(reduced.portalReveal, ordinary.portalReveal);
  assert.equal(reduced.brightStarReveal, ordinary.brightStarReveal);
  assert.equal(reduced.scotopicAdaptation, ordinary.scotopicAdaptation);

  const stepped = stepObservatoryAdaptation(
    createObservatoryAdaptationState({ reducedMotion: true }),
    {
      deltaSeconds: 0.9,
      lightsOn: false,
      inLoft: true,
      reducedMotion: true
    }
  );
  assert.equal(stepped.celestialMotionScale, 0);
  assert.ok(stepped.channels.portalReveal > 0);
  assert.ok(stepped.channels.portalReveal < 1);
});

test("invalid time inputs are clamped without producing NaN", () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const evaluated = evaluateObservatoryDarkCurve(value);
    assert.equal(evaluated.elapsedDarkSeconds, 0);
    for (const channel of [
      "houseLight",
      "roomDarkness",
      "portalReveal",
      "brightStarReveal",
      "scotopicAdaptation",
      "nebulaReveal",
      "faintStarReveal"
    ]) {
      assert.ok(Number.isFinite(evaluated[channel]));
    }
  }
});
