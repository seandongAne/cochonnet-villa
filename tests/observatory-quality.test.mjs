import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assessObservatoryCapabilities,
  calculateObservatoryFrameTimeP95,
  clampObservatoryQuality,
  createObservatoryQualityState,
  estimateObservatoryRefreshInterval,
  evaluateObservatoryStencilSupport,
  getAdjacentObservatoryQuality,
  getObservatoryQualityPreset,
  OBSERVATORY_DEFAULT_QUALITY,
  OBSERVATORY_QUALITY_PRESETS,
  OBSERVATORY_QUALITY_TIERS,
  OBSERVATORY_QUALITY_TIMING,
  OBSERVATORY_REFRESH_ESTIMATE,
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

// Realistic cadence: each step's deltaSeconds is the frame time itself, the
// way MushroomObservatoryRuntime.jsx feeds raw rAF deltas.
function runPattern(state, { seconds, frame }) {
  let next = state;
  const transitions = [];
  let elapsed = 0;
  let index = 0;
  while (elapsed < seconds - 1e-9) {
    const frameTimeMs = typeof frame === "function" ? frame(index) : frame;
    next = stepObservatoryQuality(next, {
      frameTimeMs,
      deltaSeconds: frameTimeMs / 1000
    });
    if (next.transition) transitions.push(next.transition);
    elapsed += frameTimeMs / 1000;
    index += 1;
  }
  return { state: next, transitions };
}

// A healthy vsynced 60 Hz browser: deltas pinned to the refresh cadence with
// ~1 ms jitter plus sparse GC/compositor spikes. p95 sits at ~16.8-17.4 - the
// exact boundary the controller must read as "keeping up", never as overload.
function healthy60HzFrame(index) {
  if (index % 111 === 110) return 33.4; // rare GC / compositor stall
  if (index % 47 === 46) return 20.8; // minor scheduler hiccup
  return 16.4 + ((index * 7) % 11) / 10; // vsync jitter 16.4-17.4
}

// A genuinely overloaded machine on a 60 Hz display: sustained 25-33 ms.
function overloaded60HzFrame(index) {
  const cadence = [25.2, 29.6, 33.3, 26.7, 31.1];
  return cadence[index % cadence.length];
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
  // 20 ms sits in the neutral band: above the vsync-hold band (the clamped
  // refresh estimate + tolerance) yet below the degrade threshold
  // (max(16.7, 17.5) x 1.3 = 22.75 ms), so no evidence accrues either way.
  state = runFrames(state, { seconds: 12, frameTimeMs: 20 });
  assert.equal(state.quality, "medium");
  assert.equal(state.overBudgetSeconds, 0);
  assert.equal(state.surplusSeconds, 0);

  // One extra sample lets the rolling p95 replace the preceding neutral-band
  // history before the full two-second over-budget dwell begins.
  state = runFrames(state, { seconds: 2.1, frameTimeMs: 24 });
  assert.equal(state.quality, "low");
  state = runFrames(state, { seconds: 3, frameTimeMs: 7 });
  assert.equal(state.quality, "low");
  assert.equal(state.surplusSeconds, 0);

  state = runFrames(state, { seconds: 2.2, frameTimeMs: 24 });
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
    upgradeP95Ratio: -1,
    vsyncHoldToleranceMs: Number.NaN,
    failedUpgradeProbeSeconds: Number.NaN,
    failedUpgradeBackoffSeconds: -5
  });
  const stepped = stepObservatoryQuality(state, {
    frameTimeMs: Number.NaN,
    deltaSeconds: Number.POSITIVE_INFINITY
  });

  assert.equal(stepped.quality, "medium");
  assert.equal(stepped.transition, null);
  assert.equal(stepped.refreshIntervalEstimateMs, null);
  assert.equal(stepped.upgradeProbe, null);
  assert.deepEqual(stepped.upgradeBackoffs, {});
  for (const value of [
    stepped.elapsedSeconds,
    stepped.p95Ms,
    stepped.overBudgetSeconds,
    stepped.surplusSeconds,
    stepped.cooldownRemainingSeconds,
    stepped.config.targetFrameMs,
    stepped.config.sampleWindowSeconds,
    stepped.config.degradeP95Ratio,
    stepped.config.vsyncHoldToleranceMs,
    stepped.config.failedUpgradeProbeSeconds,
    stepped.config.failedUpgradeBackoffSeconds
  ]) {
    assert.ok(Number.isFinite(value));
  }
});

test("vsync-aware constants keep the 60 Hz cadence out of the degrade band", () => {
  const timing = OBSERVATORY_QUALITY_TIMING;
  assert.ok(timing.degradeP95Ratio >= 1.25, "degrade needs real margin over vsync");
  assert.ok(
    timing.targetFrameMs * timing.degradeP95Ratio
      > OBSERVATORY_REFRESH_ESTIMATE.maxIntervalMs,
    "vsync jitter alone can never reach the degrade threshold"
  );
  assert.ok(timing.failedUpgradeBackoffSeconds >= 60, "backoff must be long");
  assert.ok(
    OBSERVATORY_REFRESH_ESTIMATE.maxIntervalMs < 20,
    "30 Hz cadences are deliberately outside the trusted refresh range"
  );
});

test("the refresh-interval estimate tracks the fastest sustained cadence", () => {
  assert.equal(estimateObservatoryRefreshInterval([]), null);
  assert.equal(
    estimateObservatoryRefreshInterval([16.7, 16.7, 16.7]),
    null,
    "too few samples to trust a cadence"
  );

  const sixtyHz = Array.from({ length: 120 }, (_, i) => 16.4 + ((i * 7) % 11) / 10);
  const estimate = estimateObservatoryRefreshInterval(sixtyHz);
  assert.ok(estimate >= 16.4 && estimate <= 16.6);

  // A single anomalously fast delta cannot fake a faster display.
  const spiked = [10, ...Array.from({ length: 119 }, () => 16.7)];
  assert.ok(estimateObservatoryRefreshInterval(spiked) >= 16.6);

  // Clamps: a 30 Hz cadence is capped (the documented case-3-over-case-6
  // trade-off) and vsync-off bursts cannot go below the floor.
  assert.equal(
    estimateObservatoryRefreshInterval(Array.from({ length: 60 }, () => 33.3)),
    OBSERVATORY_REFRESH_ESTIMATE.maxIntervalMs
  );
  assert.equal(
    estimateObservatoryRefreshInterval(Array.from({ length: 240 }, () => 2)),
    OBSERVATORY_REFRESH_ESTIMATE.minIntervalMs
  );
});

test("a healthy vsynced 60 Hz machine never spuriously degrades", () => {
  const { state, transitions } = runPattern(
    createObservatoryQualityState({
      initialQuality: "high",
      maximumQuality: "high"
    }),
    { seconds: 30, frame: healthy60HzFrame }
  );

  assert.equal(state.quality, "high");
  assert.deepEqual(transitions, []);
  assert.ok(
    state.refreshIntervalEstimateMs > 16
      && state.refreshIntervalEstimateMs <= 17.5
  );
  assert.ok(state.p95Ms >= 16.4 && state.p95Ms < 21);
});

test("holding the native 60 Hz cadence is headroom and upgrades under vsync", () => {
  const { state, transitions } = runPattern(
    createObservatoryQualityState({
      initialQuality: "medium",
      maximumQuality: "high"
    }),
    { seconds: 12, frame: healthy60HzFrame }
  );

  assert.equal(state.quality, "high");
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].direction, "up");
  assert.equal(transitions[0].reason, "vsync-headroom");

  // High-refresh displays keep the pre-existing sub-target fast path.
  const fast = runPattern(
    createObservatoryQualityState({
      initialQuality: "low",
      maximumQuality: "high"
    }),
    { seconds: 9, frame: () => 6.9 }
  );
  assert.equal(fast.state.quality, "medium");
  assert.equal(fast.transitions[0].reason, "sustained-headroom");
});

test("genuine overload on a 60 Hz display degrades within the two-second dwell", () => {
  const { state, transitions } = runPattern(
    createObservatoryQualityState({
      initialQuality: "high",
      maximumQuality: "high"
    }),
    { seconds: 2.5, frame: overloaded60HzFrame }
  );

  assert.equal(state.quality, "medium");
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].reason, "p95-over-budget");
  assert.equal(transitions[0].direction, "down");
});

test("a failed upgrade backs off before retrying and escalates on repeat", () => {
  // Short backoff keeps the simulation compact; the default stays long.
  let run = runPattern(
    createObservatoryQualityState({
      initialQuality: "medium",
      maximumQuality: "high",
      failedUpgradeBackoffSeconds: 20
    }),
    { seconds: 10, frame: healthy60HzFrame }
  );
  assert.equal(run.state.quality, "high", "vsync headroom upgraded to high");

  // The upgraded tier overloads: the downgrade records a failed upgrade.
  run = runPattern(run.state, { seconds: 6, frame: overloaded60HzFrame });
  assert.equal(run.state.quality, "medium");
  const firstFailure = run.state.upgradeBackoffs.high;
  assert.equal(firstFailure.failures, 1);
  assert.ok(firstFailure.untilSeconds > run.state.elapsedSeconds + 10);
  assert.ok(firstFailure.untilSeconds < run.state.elapsedSeconds + 25);

  // Perfect cadence while blocked must NOT retry the same upgrade.
  run = runPattern(run.state, { seconds: 12, frame: healthy60HzFrame });
  assert.equal(run.state.quality, "medium");
  assert.deepEqual(run.transitions, []);

  // Once the backoff expires the accumulated headroom may retry.
  run = runPattern(run.state, { seconds: 8, frame: healthy60HzFrame });
  assert.equal(run.state.quality, "high");
  assert.equal(run.transitions.length, 1);
  assert.equal(run.transitions[0].reason, "vsync-headroom");

  // A second quick failure escalates the backoff (2x the base).
  run = runPattern(run.state, { seconds: 6, frame: overloaded60HzFrame });
  assert.equal(run.state.quality, "medium");
  const secondFailure = run.state.upgradeBackoffs.high;
  assert.equal(secondFailure.failures, 2);
  assert.ok(secondFailure.untilSeconds > run.state.elapsedSeconds + 30);
});

test("an upgrade that survives its probe window forgives earlier failures", () => {
  let run = runPattern(
    createObservatoryQualityState({
      initialQuality: "medium",
      maximumQuality: "high",
      failedUpgradeBackoffSeconds: 20,
      failedUpgradeProbeSeconds: 15
    }),
    { seconds: 10, frame: healthy60HzFrame }
  );
  run = runPattern(run.state, { seconds: 6, frame: overloaded60HzFrame });
  assert.equal(run.state.quality, "medium");
  assert.equal(run.state.upgradeBackoffs.high.failures, 1);

  // The retry after the backoff holds high through the 15 s probe window, so
  // the failure record is cleared.
  run = runPattern(run.state, { seconds: 35, frame: healthy60HzFrame });
  assert.equal(run.state.quality, "high");
  assert.equal(run.state.upgradeProbe, null);
  assert.equal(run.state.upgradeBackoffs.high, undefined);

  // A later downgrade long after the probe window is genuine load change,
  // not a failed upgrade: no new backoff is recorded.
  run = runPattern(run.state, { seconds: 6, frame: overloaded60HzFrame });
  assert.equal(run.state.quality, "medium");
  assert.equal(run.state.upgradeBackoffs.high, undefined);
});
