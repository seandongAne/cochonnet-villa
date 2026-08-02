import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assessObservatoryCapabilities,
  calculateObservatoryFrameTimeP95,
  clampObservatoryQuality,
  createObservatoryQualityState,
  evaluateObservatoryStencilSupport,
  getAdjacentObservatoryQuality,
  getObservatoryQualityPreset,
  OBSERVATORY_DEFAULT_QUALITY,
  OBSERVATORY_QUALITY_PRESETS,
  OBSERVATORY_QUALITY_TIERS,
  selectInitialObservatoryQuality,
  stepObservatoryQuality
} from "../src/villa-map/observatory-quality.js";

function runFrames(state, {
  seconds,
  frameTimeMs,
  stepSeconds = 0.1,
  active = true
}) {
  const frameCount = Math.round(seconds / stepSeconds);
  let next = state;
  for (let index = 0; index < frameCount; index += 1) {
    next = stepObservatoryQuality(next, {
      frameTimeMs,
      deltaSeconds: stepSeconds,
      active
    });
  }
  return next;
}

test("quality tiers are ordered and Minimum preserves the native fallback", () => {
  assert.equal(OBSERVATORY_DEFAULT_QUALITY, "medium");
  assert.deepEqual(OBSERVATORY_QUALITY_TIERS, [
    "minimum",
    "low",
    "medium",
    "high"
  ]);
  assert.deepEqual(Object.keys(OBSERVATORY_QUALITY_PRESETS), [
    "high",
    "medium",
    "low",
    "minimum"
  ]);

  const minimum = getObservatoryQualityPreset("minimum");
  assert.equal(minimum.volumetricFbo, false);
  assert.equal(minimum.gaiaStarLimit, 0);
  assert.equal(minimum.backdrop4k, true);
  assert.equal(minimum.proceduralStarsFallback, true);
  assert.equal(minimum.fallbackStarCount, 360);

  assert.equal(clampObservatoryQuality("high", "low"), "low");
  assert.equal(getAdjacentObservatoryQuality("medium", "down"), "low");
  assert.equal(getAdjacentObservatoryQuality("medium", "up"), "high");
  assert.equal(getAdjacentObservatoryQuality("minimum", "down"), "minimum");
});

test("initial quality selection is conservative and capability-aware", () => {
  assert.equal(selectInitialObservatoryQuality(), "medium");
  assert.equal(selectInitialObservatoryQuality({ webgl2: false }), "minimum");
  assert.equal(selectInitialObservatoryQuality({
    webgl2: true,
    halfFloat: true,
    hardwareConcurrency: 2,
    deviceMemory: 8,
    dpr: 1
  }), "minimum");
  assert.equal(selectInitialObservatoryQuality({
    webgl2: true,
    halfFloat: false,
    hardwareConcurrency: 16,
    deviceMemory: 16,
    dpr: 1
  }), "medium", "RGBA8 can run the bounded Medium portal");
  assert.equal(selectInitialObservatoryQuality({
    webgl2: true,
    halfFloat: true,
    stencil: false,
    hardwareConcurrency: 16,
    deviceMemory: 16,
    dpr: 1
  }), "minimum");
  assert.equal(selectInitialObservatoryQuality({
    webgl2: true,
    halfFloat: true,
    hardwareConcurrency: 16,
    deviceMemory: 16,
    dpr: 3
  }), "low");
  assert.equal(selectInitialObservatoryQuality({
    webgl2: true,
    halfFloat: true,
    hardwareConcurrency: 12,
    deviceMemory: 16,
    dpr: 1.5
  }), "high");

  const reduced = assessObservatoryCapabilities({
    webgl2: true,
    halfFloat: true,
    cpuCores: 12,
    deviceMemoryGb: 16,
    devicePixelRatio: 1,
    reducedMotion: true
  });
  assert.equal(reduced.quality, "medium");
  assert.ok(reduced.reasons.includes("reduced-motion-high-cap"));
  assert.equal(reduced.capabilities.reducedMotion, true);
});

test("stencil capability fails closed when the browser exposes zero bits", () => {
  assert.equal(evaluateObservatoryStencilSupport({
    requestedStencil: true,
    stencilBits: 8
  }), true);
  assert.equal(evaluateObservatoryStencilSupport({
    requestedStencil: true,
    stencilBits: 0
  }), false);
  assert.equal(evaluateObservatoryStencilSupport({
    requestedStencil: false,
    stencilBits: 8
  }), false);
  assert.equal(evaluateObservatoryStencilSupport({}), false);
});

test("rolling p95 uses nearest rank and rejects invalid measurements", () => {
  assert.equal(calculateObservatoryFrameTimeP95([
    Number.NaN,
    -1,
    ...Array.from({ length: 19 }, (_, index) => index + 1),
    100
  ]), 19);
  assert.equal(calculateObservatoryFrameTimeP95([]), 0);
  assert.equal(calculateObservatoryFrameTimeP95([
    { frameTimeMs: 10 },
    { frameTimeMs: 20 },
    { frameTimeMs: 30 }
  ]), 30);
});

test("sustained over-budget p95 downgrades exactly one adjacent tier", () => {
  let state = createObservatoryQualityState({
    initialQuality: "high",
    maximumQuality: "high"
  });
  const initial = state;

  state = runFrames(state, { seconds: 1.9, frameTimeMs: 24 });
  assert.equal(state.quality, "high");
  assert.equal(state.transition, null);

  state = runFrames(state, { seconds: 0.1, frameTimeMs: 24 });
  assert.equal(state.quality, "medium");
  assert.deepEqual(state.transition, {
    from: "high",
    to: "medium",
    direction: "down",
    reason: "p95-over-budget",
    p95Ms: 24
  });
  assert.equal(state.samples.length, 0, "old-tier samples are discarded");
  assert.equal(initial.quality, "high", "the previous state stays immutable");

  state = runFrames(state, { seconds: 2.5, frameTimeMs: 24 });
  assert.equal(
    state.quality,
    "medium",
    "cooldown prevents an immediate cascading downgrade"
  );
});

test("sustained 8 fps and 4 fps evidence downgrades after two real seconds", () => {
  for (const stepSeconds of [0.125, 0.25]) {
    let state = createObservatoryQualityState({
      initialQuality: "high",
      maximumQuality: "high"
    });
    state = runFrames(state, {
      seconds: 2,
      frameTimeMs: stepSeconds * 1000,
      stepSeconds
    });
    assert.equal(state.quality, "medium", `${1 / stepSeconds} fps should downgrade`);
    assert.equal(state.transition?.reason, "p95-over-budget");
  }
});

test("long sustained headroom cautiously upgrades one tier", () => {
  let state = createObservatoryQualityState({
    initialQuality: "low",
    maximumQuality: "high"
  });
  state = runFrames(state, { seconds: 7.9, frameTimeMs: 8 });
  assert.equal(state.quality, "low");

  state = runFrames(state, { seconds: 0.1, frameTimeMs: 8 });
  assert.equal(state.quality, "medium");
  assert.equal(state.transition.direction, "up");
  assert.equal(state.transition.reason, "sustained-headroom");

  state = runFrames(state, { seconds: 8, frameTimeMs: 8 });
  assert.equal(
    state.quality,
    "medium",
    "the 3 s cooldown is not pre-charged toward the next upgrade"
  );
  state = runFrames(state, { seconds: 3, frameTimeMs: 8 });
  assert.equal(state.quality, "high");
});

test("hysteresis neutral band and cooldown prevent quality thrashing", () => {
  let state = createObservatoryQualityState({
    initialQuality: "medium",
    maximumQuality: "high"
  });
  state = runFrames(state, { seconds: 12, frameTimeMs: 14 });
  assert.equal(state.quality, "medium");
  assert.equal(state.overBudgetSeconds, 0);
  assert.equal(state.surplusSeconds, 0);

  // One extra sample lets the rolling p95 replace the preceding neutral-band
  // history before the full two-second over-budget dwell begins.
  state = runFrames(state, { seconds: 2.1, frameTimeMs: 22 });
  assert.equal(state.quality, "low");
  state = runFrames(state, { seconds: 3, frameTimeMs: 7 });
  assert.equal(state.quality, "low");
  assert.equal(state.surplusSeconds, 0);

  state = runFrames(state, { seconds: 2.2, frameTimeMs: 22 });
  assert.equal(state.quality, "minimum");
});

test("leaving the active observatory clears stale performance evidence", () => {
  let state = createObservatoryQualityState({
    initialQuality: "medium",
    maximumQuality: "medium"
  });
  state = runFrames(state, { seconds: 1.9, frameTimeMs: 25 });
  assert.ok(state.overBudgetSeconds > 1.8);
  assert.ok(state.samples.length > 0);

  const outside = stepObservatoryQuality(state, {
    frameTimeMs: 25,
    deltaSeconds: 1,
    active: false
  });
  assert.equal(outside.quality, "medium");
  assert.equal(outside.samples.length, 0);
  assert.equal(outside.p95Ms, 0);
  assert.equal(outside.overBudgetSeconds, 0);
  assert.equal(outside.surplusSeconds, 0);

  const reentered = stepObservatoryQuality(outside, {
    frameTimeMs: 25,
    deltaSeconds: 0.1,
    active: true
  });
  assert.equal(reentered.quality, "medium");
  assert.ok(reentered.overBudgetSeconds < 0.11);
});

test("invalid samples and options never produce NaN or a transition", () => {
  const state = createObservatoryQualityState({
    targetFrameMs: Number.NaN,
    sampleWindowSeconds: -1,
    degradeP95Ratio: Number.POSITIVE_INFINITY,
    upgradeP95Ratio: -1
  });
  const stepped = stepObservatoryQuality(state, {
    frameTimeMs: Number.NaN,
    deltaSeconds: Number.POSITIVE_INFINITY
  });

  assert.equal(stepped.quality, "medium");
  assert.equal(stepped.transition, null);
  for (const value of [
    stepped.elapsedSeconds,
    stepped.p95Ms,
    stepped.overBudgetSeconds,
    stepped.surplusSeconds,
    stepped.cooldownRemainingSeconds,
    stepped.config.targetFrameMs,
    stepped.config.sampleWindowSeconds
  ]) {
    assert.ok(Number.isFinite(value));
  }
});
