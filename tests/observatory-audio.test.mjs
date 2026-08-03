import test from "node:test";
import assert from "node:assert/strict";

import {
  OBSERVATORY_AUDIO_MIX_LIMITS,
  createObservatoryAudioDirectorState,
  evaluateObservatoryAudioMix,
  stepObservatoryAudioDirector
} from "../src/villa-map/observatory-audio.js";
import {
  evaluateObservatoryDarkCurve
} from "../src/villa-map/observatory-adaptation.js";
import {
  createObservatoryRiftState,
  OBSERVATORY_RIFT_TIMING,
  stepObservatoryRift
} from "../src/villa-map/observatory-rift.js";

const ADAPTATION_CHANNELS = Object.freeze({
  houseLight: 0,
  roomDarkness: 1,
  portalReveal: 1,
  brightStarReveal: 1,
  scotopicAdaptation: 1,
  nebulaReveal: 1,
  faintStarReveal: 1
});

const CLOSED_RIFT_CHANNELS = Object.freeze({
  apertureExpansion: 0,
  wallDissolve: 0,
  foregroundDepth: 0,
  foregroundParallax: 0,
  ringFadeProgress: 0,
  ringIntensity: 0,
  backdropSuppression: 0,
  spatialMotionScale: 1
});

function input(overrides = {}) {
  return {
    adaptationMode: "darkening",
    adaptationChannels: ADAPTATION_CHANNELS,
    riftState: { mode: "closed", targetOpen: false },
    riftChannels: CLOSED_RIFT_CHANNELS,
    lensAmount: 0,
    blackHoleReveal: 0,
    inLoft: true,
    visualAvailable: true,
    runtimeAvailable: true,
    pageVisible: true,
    userActivated: true,
    muted: false,
    reducedMotion: false,
    ...overrides
  };
}

function assertSilent(mix) {
  assert.deepEqual(mix, {
    master: 0,
    roomTone: 0,
    cosmosAir: 0,
    starAir: 0,
    riftSweep: 0,
    riftBed: 0,
    lensDrone: 0,
    lensFlow: 0
  });
}

test("the pure mix follows the actual adaptation, Rift and black-hole channels", () => {
  const mix = evaluateObservatoryAudioMix(input({
    riftState: { mode: "opening", targetOpen: true },
    riftChannels: {
      ...CLOSED_RIFT_CHANNELS,
      ringIntensity: 0.36,
      foregroundDepth: 0.42
    },
    lensAmount: 0.5,
    blackHoleReveal: 0.2
  }));

  assert.equal(mix.master, 1);
  assert.equal(mix.roomTone, 0.12);
  assert.equal(mix.cosmosAir, 1);
  assert.equal(mix.starAir, 1);
  assert.equal(mix.riftSweep, 0.36);
  assert.equal(mix.riftBed, 0.42);
  assert.equal(mix.lensDrone, 0.2);
  assert.equal(mix.lensFlow, 0.2);
  assert.ok(Object.isFrozen(mix));
});

test("audio follows the canonical lights-off and 3.6 s Rift curves without a second clock", () => {
  const beforePortal = evaluateObservatoryAudioMix(input({
    adaptationChannels: evaluateObservatoryDarkCurve(0.25)
  }));
  const firstCosmos = evaluateObservatoryAudioMix(input({
    adaptationChannels: evaluateObservatoryDarkCurve(0.9)
  }));
  const darkAdapted = evaluateObservatoryAudioMix(input({
    adaptationChannels: evaluateObservatoryDarkCurve(12)
  }));

  assert.equal(beforePortal.cosmosAir, 0);
  assert.equal(beforePortal.starAir, 0);
  assert.ok(firstCosmos.cosmosAir > 0);
  assert.ok(firstCosmos.starAir > 0);
  assert.ok(darkAdapted.cosmosAir > firstCosmos.cosmosAir);
  assert.ok(darkAdapted.starAir > firstCosmos.starAir);

  let rift = createObservatoryRiftState({ inLoft: true });
  rift = stepObservatoryRift(rift, {
    deltaSeconds: OBSERVATORY_RIFT_TIMING.openingSeconds / 2,
    targetOpen: true,
    inLoft: true
  });
  const openingMix = evaluateObservatoryAudioMix(input({
    riftState: rift,
    riftChannels: rift.channels
  }));
  assert.ok(openingMix.riftSweep > 0);
  assert.ok(openingMix.riftBed > 0);

  rift = stepObservatoryRift(rift, {
    deltaSeconds: OBSERVATORY_RIFT_TIMING.openingSeconds / 2,
    targetOpen: true,
    inLoft: true
  });
  const justOpenedMix = evaluateObservatoryAudioMix(input({
    riftState: rift,
    riftChannels: rift.channels
  }));
  assert.equal(rift.transitionProgress, 1);
  assert.equal(rift.ringFadeProgress, 0);
  assert.ok(justOpenedMix.riftSweep > 0);
  assert.equal(justOpenedMix.riftBed, 1);

  rift = stepObservatoryRift(rift, {
    deltaSeconds: OBSERVATORY_RIFT_TIMING.ringFadeSeconds,
    targetOpen: true,
    inLoft: true
  });
  const settledMix = evaluateObservatoryAudioMix(input({
    riftState: rift,
    riftChannels: rift.channels
  }));
  assert.equal(rift.ringFadeProgress, 1);
  assert.equal(settledMix.riftSweep, 0);
  assert.equal(settledMix.riftBed, 1);
});

test("R and F retain their authored mappings while their combined mix is capped", () => {
  const riftOnly = evaluateObservatoryAudioMix(input({
    adaptationChannels: {
      ...ADAPTATION_CHANNELS,
      portalReveal: 0,
      brightStarReveal: 0
    },
    riftState: { mode: "opening", targetOpen: true },
    riftChannels: {
      ...CLOSED_RIFT_CHANNELS,
      ringIntensity: 0.7,
      foregroundDepth: 0.6
    }
  }));
  assert.equal(riftOnly.riftSweep, 0.7);
  assert.equal(riftOnly.riftBed, 0.6);

  const combined = evaluateObservatoryAudioMix(input({
    riftState: { mode: "open", targetOpen: true },
    riftChannels: {
      ...CLOSED_RIFT_CHANNELS,
      ringIntensity: 1,
      foregroundDepth: 1
    },
    lensAmount: 1,
    blackHoleReveal: 1
  }));
  const hiddenTotal = combined.riftSweep
    + combined.riftBed
    + combined.lensDrone
    + combined.lensFlow;
  assert.ok(hiddenTotal <= OBSERVATORY_AUDIO_MIX_LIMITS.riftLensTotal + 1e-12);
  assert.equal(hiddenTotal, OBSERVATORY_AUDIO_MIX_LIMITS.riftLensTotal);
});

test("reduced motion preserves the finite lens drone but removes its orbiting flow", () => {
  const mix = evaluateObservatoryAudioMix(input({
    lensAmount: 1,
    blackHoleReveal: 0.72,
    reducedMotion: true
  }));
  assert.equal(mix.lensDrone, 0.72);
  assert.equal(mix.lensFlow, 0);
});

test("authorization, mute, visibility and runtime lifecycle gates silence everything", () => {
  for (const override of [
    { userActivated: false },
    { muted: true },
    { pageVisible: false },
    { runtimeAvailable: false },
    { inLoft: false }
  ]) {
    assertSilent(evaluateObservatoryAudioMix(input({
      riftState: { mode: "open", targetOpen: true },
      riftChannels: {
        ...CLOSED_RIFT_CHANNELS,
        ringIntensity: 1,
        foregroundDepth: 1
      },
      lensAmount: 1,
      blackHoleReveal: 1,
      ...override
    })));
  }
});

test("visual fail-close preserves room sound and light cues without replaying R/F", () => {
  const litChannels = {
    ...ADAPTATION_CHANNELS,
    houseLight: 1,
    roomDarkness: 0,
    portalReveal: 0,
    brightStarReveal: 0,
    scotopicAdaptation: 0,
    nebulaReveal: 0,
    faintStarReveal: 0
  };
  const unavailableMix = evaluateObservatoryAudioMix(input({
    adaptationMode: "lit",
    adaptationChannels: litChannels,
    visualAvailable: false,
    riftState: { mode: "open", targetOpen: true },
    riftChannels: {
      ...CLOSED_RIFT_CHANNELS,
      ringIntensity: 1,
      foregroundDepth: 1
    },
    lensAmount: 1,
    blackHoleReveal: 1
  }));
  assert.equal(unavailableMix.master, 1);
  assert.equal(unavailableMix.roomTone, 0.7);
  for (const key of [
    "cosmosAir",
    "starAir",
    "riftSweep",
    "riftBed",
    "lensDrone",
    "lensFlow"
  ]) {
    assert.equal(unavailableMix[key], 0);
  }

  let state = createObservatoryAudioDirectorState(input({
    adaptationMode: "lit",
    adaptationChannels: litChannels,
    visualAvailable: false
  }));
  assert.equal(state.audible, true);
  assert.equal(state.hiddenAudible, false);

  state = stepObservatoryAudioDirector(state, input({
    visualAvailable: false,
    riftState: { mode: "opening", targetOpen: true },
    lensAmount: 0.4,
    blackHoleReveal: 0.2
  }));
  assert.deepEqual(state.events, ["lights-off"]);

  // Restoring the visual path establishes the current hidden baseline. R/F
  // events that happened during fail-close must not be replayed now.
  state = stepObservatoryAudioDirector(state, input({
    visualAvailable: true,
    riftState: { mode: "opening", targetOpen: true },
    lensAmount: 0.4,
    blackHoleReveal: 0.2
  }));
  assert.deepEqual(state.events, []);
  assert.equal(state.hiddenAudible, true);

  state = stepObservatoryAudioDirector(state, input({
    visualAvailable: true,
    riftState: { mode: "closing", targetOpen: false },
    lensAmount: 0.3,
    blackHoleReveal: 0.12
  }));
  assert.deepEqual(state.events, ["rift-close", "lens-close"]);
});

test("light, Rift and lens edges emit once and remain reversible", () => {
  let state = createObservatoryAudioDirectorState(input({
    adaptationMode: "lit",
    adaptationChannels: {
      ...ADAPTATION_CHANNELS,
      houseLight: 1,
      roomDarkness: 0,
      portalReveal: 0,
      brightStarReveal: 0,
      scotopicAdaptation: 0,
      nebulaReveal: 0,
      faintStarReveal: 0
    }
  }));
  assert.deepEqual(state.events, []);

  state = stepObservatoryAudioDirector(state, input({
    riftState: { mode: "opening", targetOpen: true },
    riftChannels: {
      ...CLOSED_RIFT_CHANNELS,
      ringIntensity: 0.2,
      foregroundDepth: 0.1
    }
  }));
  assert.deepEqual(state.events, ["lights-off", "rift-open"]);

  state = stepObservatoryAudioDirector(state, input({
    riftState: { mode: "opening", targetOpen: true },
    riftChannels: {
      ...CLOSED_RIFT_CHANNELS,
      ringIntensity: 0.4,
      foregroundDepth: 0.3
    }
  }));
  assert.deepEqual(state.events, []);

  state = stepObservatoryAudioDirector(state, input({
    riftState: { mode: "opening", targetOpen: true },
    lensAmount: 0.2,
    blackHoleReveal: 0.08
  }));
  assert.deepEqual(state.events, ["lens-open"]);

  state = stepObservatoryAudioDirector(state, input({
    riftState: { mode: "opening", targetOpen: true },
    lensAmount: 0.4,
    blackHoleReveal: 0.2
  }));
  assert.deepEqual(state.events, []);

  state = stepObservatoryAudioDirector(state, input({
    riftState: { mode: "closing", targetOpen: false },
    lensAmount: 0.3,
    blackHoleReveal: 0.12
  }));
  assert.deepEqual(state.events, ["rift-close", "lens-close"]);

  state = stepObservatoryAudioDirector(state, input({
    riftState: { mode: "opening", targetOpen: true },
    lensAmount: 0.35,
    blackHoleReveal: 0.16
  }));
  assert.deepEqual(state.events, ["rift-open", "lens-open"]);

  state = stepObservatoryAudioDirector(state, input({
    adaptationMode: "relighting",
    lensAmount: 0.35,
    blackHoleReveal: 0
  }));
  assert.deepEqual(state.events, ["lights-on", "rift-close"]);
});

test("inaudible intervals re-baseline and never replay missed history", () => {
  let state = createObservatoryAudioDirectorState(input({
    userActivated: false,
    adaptationMode: "lit"
  }));

  state = stepObservatoryAudioDirector(state, input({
    userActivated: false,
    riftState: { mode: "open", targetOpen: true },
    riftChannels: {
      ...CLOSED_RIFT_CHANNELS,
      foregroundDepth: 1
    },
    lensAmount: 0.7,
    blackHoleReveal: 0.7
  }));
  assertSilent(state.mix);
  assert.deepEqual(state.events, []);

  state = stepObservatoryAudioDirector(state, input({
    riftState: { mode: "open", targetOpen: true },
    riftChannels: {
      ...CLOSED_RIFT_CHANNELS,
      foregroundDepth: 1
    },
    lensAmount: 0.7,
    blackHoleReveal: 0.7
  }));
  assert.equal(state.mix.master, 1);
  assert.deepEqual(state.events, []);

  state = stepObservatoryAudioDirector(state, input({
    riftState: { mode: "open", targetOpen: true },
    lensAmount: 0.6,
    blackHoleReveal: 0.6
  }));
  assert.deepEqual(state.events, ["lens-close"]);

  state = stepObservatoryAudioDirector(state, input({
    muted: true,
    adaptationMode: "relighting",
    riftState: { mode: "closed", targetOpen: false },
    lensAmount: 0,
    blackHoleReveal: 0
  }));
  assertSilent(state.mix);
  assert.deepEqual(state.events, []);

  state = stepObservatoryAudioDirector(state, input({
    adaptationMode: "relighting",
    riftState: { mode: "closed", targetOpen: false },
    lensAmount: 0,
    blackHoleReveal: 0
  }));
  assert.deepEqual(state.events, []);
});

test("invalid inputs remain finite, normalized and deeply immutable", () => {
  const state = stepObservatoryAudioDirector(null, input({
    adaptationMode: "unknown",
    adaptationChannels: {
      houseLight: Number.NaN,
      roomDarkness: -2,
      portalReveal: Number.POSITIVE_INFINITY,
      brightStarReveal: 5,
      scotopicAdaptation: -5,
      nebulaReveal: Number.NEGATIVE_INFINITY,
      faintStarReveal: 2
    },
    riftState: { mode: "unknown", targetOpen: "yes" },
    riftChannels: {
      apertureExpansion: Number.NaN,
      wallDissolve: -4,
      foregroundDepth: 8,
      foregroundParallax: Number.POSITIVE_INFINITY,
      ringFadeProgress: -1,
      ringIntensity: 7,
      backdropSuppression: Number.NaN,
      spatialMotionScale: 4
    },
    lensAmount: Number.POSITIVE_INFINITY,
    blackHoleReveal: -20
  }));

  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.mix));
  assert.ok(Object.isFrozen(state.events));
  assert.ok(Object.isFrozen(state.adaptationChannels));
  assert.ok(Object.isFrozen(state.riftChannels));
  for (const value of Object.values(state.mix)) {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0 && value <= 1);
  }
  for (const value of Object.values(state.adaptationChannels)) {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0 && value <= 1);
  }
  for (const value of Object.values(state.riftChannels)) {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0 && value <= 1);
  }
});
