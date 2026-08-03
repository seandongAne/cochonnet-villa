// Deterministic, framework-independent director for the hidden non-Euclidean
// observatory rift. The renderer owns geometry and materials; this module only
// emits normalized channels so the effect can be exercised in Node tests.

export const OBSERVATORY_RIFT_TIMING = Object.freeze({
  openingSeconds: 3.6,
  closingSeconds: 1.8,
  ringFadeSeconds: 1
});

const CLOSED_CHANNELS = Object.freeze({
  apertureExpansion: 0,
  wallDissolve: 0,
  foregroundDepth: 0,
  foregroundParallax: 0,
  ringFadeProgress: 0,
  ringIntensity: 0,
  backdropSuppression: 0,
  spatialMotionScale: 1
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

function windowedSmootherstep(progress, start, end) {
  if (end <= start) return progress >= end ? 1 : 0;
  return smootherstep01((progress - start) / (end - start));
}

/**
 * Convert the canonical transition progress into renderer-facing channels.
 *
 * Sequencing is deliberately depth-first: foreground extinction becomes
 * legible while the aperture opens, then the wall dissolves only after that
 * aperture fully covers it. The non-overlapping hand-off prevents a fading
 * wall from exposing the ordinary scene background below an unfinished
 * stencil. Backdrop suppression keeps the 4K panorama from flattening the
 * result.
 */
export function evaluateObservatoryRift(
  transitionProgress,
  { reducedMotion = false, ringFadeProgress = 0 } = {}
) {
  const progress = clamp01(
    Number.isFinite(transitionProgress) ? transitionProgress : 0
  );
  const apertureExpansion = windowedSmootherstep(progress, 0.04, 0.86);
  const wallDissolve = windowedSmootherstep(progress, 0.86, 1.0);
  const foregroundDepth = windowedSmootherstep(progress, 0.03, 0.62);
  const fullParallax = windowedSmootherstep(progress, 0.18, 0.82);
  const backdropSuppression = windowedSmootherstep(progress, 0.12, 0.72);
  const safeRingFadeProgress = clamp01(
    Number.isFinite(ringFadeProgress) ? ringFadeProgress : 0
  );

  // The moving rim peaks halfway through the spatial hand-off, but settles to
  // a restrained outline once the impossible room is fully open.
  const transitionRing = Math.sin(Math.PI * progress) ** 2;
  const transitionRingIntensity = reducedMotion
    ? 0.12 * wallDissolve
    : clamp01(0.2 * apertureExpansion + 0.8 * transitionRing);
  const ringIntensity = transitionRingIntensity
    * (1 - smootherstep01(safeRingFadeProgress));

  return Object.freeze({
    apertureExpansion,
    wallDissolve,
    foregroundDepth,
    // Reduced motion preserves the static depth/extinction composition while
    // removing camera-relative foreground travel and the sweeping rim pulse.
    foregroundParallax: reducedMotion ? 0 : fullParallax,
    ringFadeProgress: safeRingFadeProgress,
    ringIntensity,
    backdropSuppression,
    spatialMotionScale: reducedMotion ? 0 : 1
  });
}

function modeFor(progress, targetOpen) {
  if (progress <= 0) return targetOpen ? "opening" : "closed";
  if (progress >= 1) return targetOpen ? "open" : "closing";
  return targetOpen ? "opening" : "closing";
}

function makeState({
  targetOpen,
  inLoft,
  reducedMotion,
  transitionProgress,
  ringFadeProgress = 0
}) {
  const progress = clamp01(transitionProgress);
  const safeRingFadeProgress = progress <= 0
    ? 0
    : clamp01(ringFadeProgress);
  const safeTargetOpen = Boolean(targetOpen && inLoft);
  return Object.freeze({
    targetOpen: safeTargetOpen,
    inLoft: Boolean(inLoft),
    reducedMotion: Boolean(reducedMotion),
    mode: modeFor(progress, safeTargetOpen),
    transitionProgress: progress,
    ringFadeProgress: safeRingFadeProgress,
    channels: progress === 0 && !reducedMotion
      ? CLOSED_CHANNELS
      : evaluateObservatoryRift(progress, {
          reducedMotion,
          ringFadeProgress: safeRingFadeProgress
        })
  });
}

/** Create a closed rift director. A requested open state starts at progress 0. */
export function createObservatoryRiftState({
  targetOpen = false,
  inLoft = false,
  reducedMotion = false
} = {}) {
  return makeState({
    targetOpen,
    inLoft,
    reducedMotion,
    transitionProgress: 0,
    ringFadeProgress: 0
  });
}

/**
 * Advance the rift without mutating the previous state.
 *
 * Reversals change only the direction of the shared progress value, so every
 * derived channel remains continuous. Leaving L3 always fail-closes the rift
 * and clears the request, even when a caller accidentally keeps targetOpen.
 */
export function stepObservatoryRift(
  previousState,
  {
    deltaSeconds = 0,
    targetOpen = false,
    inLoft = false,
    reducedMotion = false
  } = {}
) {
  if (!inLoft) {
    return createObservatoryRiftState({
      targetOpen: false,
      inLoft: false,
      reducedMotion
    });
  }

  const previous = previousState ?? createObservatoryRiftState();
  const delta = finiteNonNegative(deltaSeconds);
  const duration = targetOpen
    ? OBSERVATORY_RIFT_TIMING.openingSeconds
    : OBSERVATORY_RIFT_TIMING.closingSeconds;
  const direction = targetOpen ? 1 : -1;
  const transitionProgress = clamp01(
    previous.transitionProgress + direction * delta / duration
  );
  let ringFadeProgress = clamp01(previous.ringFadeProgress ?? 0);

  if (targetOpen) {
    // A post-open tail must not steal time from the 3.6 s dome expansion.
    // While a reversal is still travelling toward fully open, unwind any
    // previous tail smoothly; only leftover time after progress reaches one
    // may advance the one-second fade.
    const secondsToOpen = Math.max(0, 1 - previous.transitionProgress)
      * OBSERVATORY_RIFT_TIMING.openingSeconds;
    const transitionSeconds = Math.min(delta, secondsToOpen);
    ringFadeProgress = clamp01(
      ringFadeProgress
        - transitionSeconds / OBSERVATORY_RIFT_TIMING.ringFadeSeconds
    );
    const settledSeconds = Math.max(0, delta - secondsToOpen);
    ringFadeProgress = clamp01(
      ringFadeProgress
        + settledSeconds / OBSERVATORY_RIFT_TIMING.ringFadeSeconds
    );
  } else {
    // Re-arm the depth seams gradually during a close/reversal. Their final
    // intensity remains a pure function of state, so changing direction with
    // delta=0 cannot produce a visual discontinuity.
    ringFadeProgress = clamp01(
      ringFadeProgress - delta / OBSERVATORY_RIFT_TIMING.ringFadeSeconds
    );
  }
  if (ringFadeProgress < 1e-9) ringFadeProgress = 0;
  if (ringFadeProgress > 1 - 1e-9) ringFadeProgress = 1;
  if (transitionProgress <= 0) ringFadeProgress = 0;

  return makeState({
    targetOpen,
    inLoft: true,
    reducedMotion,
    transitionProgress,
    ringFadeProgress
  });
}
