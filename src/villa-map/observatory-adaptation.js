// Deterministic, framework-independent timing director for the observatory.
//
// The renderer consumes the normalized channels returned here; this module
// deliberately knows nothing about React, Three.js, clocks, or materials. A
// caller supplies deltaSeconds, making the sequence reproducible in Node tests
// and safe to reuse in another renderer later.

export const OBSERVATORY_ADAPTATION_TIMING = Object.freeze({
  // The room starts falling dark before any celestial layer appears.
  houseLightFadeSeconds: 0.9,
  portalDelaySeconds: 0.38,
  portalRevealSeconds: 1.25,
  brightStarDelaySeconds: 0.58,
  brightStarRevealSeconds: 1.45,

  // After the initial reveal, faint stars and nebula detail continue emerging
  // over an intentionally compressed, visitor-friendly dark-adaptation pass.
  scotopicDelaySeconds: 1.2,
  scotopicAdaptationSeconds: 10,

  // Photopic recovery is deliberately much faster than dark adaptation.
  // Relighting is intentionally two-stage: first remove every celestial
  // layer, then bring the room palette/exposure back. This avoids the sky
  // looking like a transparent poster over an already-lit ceiling.
  lightsOnStarHideSeconds: 0.36,
  lightsOnRoomRestoreDelaySeconds: 0.36,
  lightsOnRoomRestoreSeconds: 0.44,
  lightsOnResetSeconds: 0.8
});

const LIT_CHANNELS = Object.freeze({
  houseLight: 1,
  roomDarkness: 0,
  portalReveal: 0,
  brightStarReveal: 0,
  scotopicAdaptation: 0,
  nebulaReveal: 0,
  faintStarReveal: 0
});

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function finiteNonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function smootherstep01(value) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function timedSmootherstep(elapsed, delay, duration) {
  if (duration <= 0) return elapsed >= delay ? 1 : 0;
  return smootherstep01((elapsed - delay) / duration);
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function deriveChannels({
  houseLight,
  portalReveal,
  brightStarReveal,
  scotopicAdaptation
}) {
  const safeHouseLight = clamp01(houseLight);
  const safePortalReveal = clamp01(portalReveal);
  const safeBrightStarReveal = clamp01(brightStarReveal);
  const safeScotopicAdaptation = clamp01(scotopicAdaptation);

  return Object.freeze({
    houseLight: safeHouseLight,
    roomDarkness: 1 - safeHouseLight,
    portalReveal: safePortalReveal,
    brightStarReveal: safeBrightStarReveal,
    scotopicAdaptation: safeScotopicAdaptation,
    // A little colour is present at the first portal reveal; deeper structure
    // develops as the simulated eye becomes dark-adapted.
    nebulaReveal: safePortalReveal * (0.32 + 0.68 * safeScotopicAdaptation),
    faintStarReveal: safeBrightStarReveal * safeScotopicAdaptation
  });
}

function snapshotPrimaryChannels(channels) {
  return Object.freeze({
    houseLight: clamp01(channels?.houseLight ?? 1),
    portalReveal: clamp01(channels?.portalReveal ?? 0),
    brightStarReveal: clamp01(channels?.brightStarReveal ?? 0),
    scotopicAdaptation: clamp01(channels?.scotopicAdaptation ?? 0)
  });
}

function makeState({
  lightsOn,
  inLoft,
  reducedMotion,
  mode,
  phaseElapsedSeconds,
  phaseStart,
  channels
}) {
  return Object.freeze({
    lightsOn: Boolean(lightsOn),
    inLoft: Boolean(inLoft),
    reducedMotion: Boolean(reducedMotion),
    mode,
    phaseElapsedSeconds: finiteNonNegative(phaseElapsedSeconds),
    phaseStart: snapshotPrimaryChannels(phaseStart),
    channels,
    // Reduced motion freezes celestial drift/twinkle, not the switch-driven
    // visibility transition. Consumers can use this independent channel for
    // their time uniforms while all reveal curves remain smooth.
    celestialMotionScale: reducedMotion ? 0 : 1
  });
}

/**
 * Evaluate the canonical lights-off sequence at an absolute elapsed time.
 * All returned rendering channels are normalized to [0, 1].
 */
export function evaluateObservatoryDarkCurve(
  elapsedDarkSeconds,
  { reducedMotion = false } = {}
) {
  const elapsed = finiteNonNegative(elapsedDarkSeconds);
  const timing = OBSERVATORY_ADAPTATION_TIMING;
  const channels = deriveChannels({
    houseLight: 1 - timedSmootherstep(
      elapsed,
      0,
      timing.houseLightFadeSeconds
    ),
    portalReveal: timedSmootherstep(
      elapsed,
      timing.portalDelaySeconds,
      timing.portalRevealSeconds
    ),
    brightStarReveal: timedSmootherstep(
      elapsed,
      timing.brightStarDelaySeconds,
      timing.brightStarRevealSeconds
    ),
    scotopicAdaptation: timedSmootherstep(
      elapsed,
      timing.scotopicDelaySeconds,
      timing.scotopicAdaptationSeconds
    )
  });

  return Object.freeze({
    elapsedDarkSeconds: elapsed,
    ...channels,
    celestialMotionScale: reducedMotion ? 0 : 1
  });
}

/** Create/reset the director to a fully lit, inactive observatory state. */
export function createObservatoryAdaptationState({
  lightsOn = true,
  inLoft = false,
  reducedMotion = false
} = {}) {
  return makeState({
    lightsOn,
    inLoft,
    reducedMotion,
    mode: inLoft ? (lightsOn ? "lit" : "darkening") : "inactive",
    phaseElapsedSeconds: 0,
    phaseStart: LIT_CHANNELS,
    channels: LIT_CHANNELS
  });
}

/**
 * Advance the director without mutating the previous state.
 *
 * A light-state reversal captures the current channels as its new starting
 * point, so rapidly toggling the physical switch cannot cause a visual jump.
 * Leaving L3 resets immediately; re-entering while the switch is off begins a
 * fresh dark-adaptation sequence from the readable, lit baseline.
 */
export function stepObservatoryAdaptation(
  previousState,
  {
    deltaSeconds = 0,
    lightsOn = true,
    inLoft = false,
    reducedMotion = false
  } = {}
) {
  const previous = previousState ?? createObservatoryAdaptationState();
  const delta = finiteNonNegative(deltaSeconds);

  if (!inLoft) {
    return createObservatoryAdaptationState({
      lightsOn,
      inLoft: false,
      reducedMotion
    });
  }

  const enteringLoft = previous.inLoft !== true;
  const lightStateChanged = previous.lightsOn !== Boolean(lightsOn);
  const startsNewPhase = enteringLoft || lightStateChanged;
  const phaseStart = startsNewPhase
    ? snapshotPrimaryChannels(previous.channels)
    : snapshotPrimaryChannels(previous.phaseStart);
  const phaseElapsedSeconds = (startsNewPhase ? 0 : previous.phaseElapsedSeconds)
    + delta;

  if (!lightsOn) {
    const curve = evaluateObservatoryDarkCurve(phaseElapsedSeconds, {
      reducedMotion
    });
    const channels = deriveChannels({
      houseLight: phaseStart.houseLight * curve.houseLight,
      portalReveal: lerp(
        phaseStart.portalReveal,
        1,
        curve.portalReveal
      ),
      brightStarReveal: lerp(
        phaseStart.brightStarReveal,
        1,
        curve.brightStarReveal
      ),
      scotopicAdaptation: lerp(
        phaseStart.scotopicAdaptation,
        1,
        curve.scotopicAdaptation
      )
    });

    return makeState({
      lightsOn: false,
      inLoft: true,
      reducedMotion,
      mode: "darkening",
      phaseElapsedSeconds,
      phaseStart,
      channels
    });
  }

  const starHideProgress = smootherstep01(
    phaseElapsedSeconds
      / OBSERVATORY_ADAPTATION_TIMING.lightsOnStarHideSeconds
  );
  const roomRestoreProgress = timedSmootherstep(
    phaseElapsedSeconds,
    OBSERVATORY_ADAPTATION_TIMING.lightsOnRoomRestoreDelaySeconds,
    OBSERVATORY_ADAPTATION_TIMING.lightsOnRoomRestoreSeconds
  );
  const channels = deriveChannels({
    houseLight: lerp(phaseStart.houseLight, 1, roomRestoreProgress),
    portalReveal: lerp(phaseStart.portalReveal, 0, starHideProgress),
    brightStarReveal: lerp(phaseStart.brightStarReveal, 0, starHideProgress),
    scotopicAdaptation: lerp(
      phaseStart.scotopicAdaptation,
      0,
      starHideProgress
    )
  });

  return makeState({
    lightsOn: true,
    inLoft: true,
    reducedMotion,
    mode: roomRestoreProgress >= 1 ? "lit" : "relighting",
    phaseElapsedSeconds,
    phaseStart,
    channels
  });
}
