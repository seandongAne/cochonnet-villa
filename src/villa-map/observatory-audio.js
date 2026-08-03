// Deterministic, framework-independent audio director for the Impossible
// Observatory. It deliberately owns no clock and creates no Web Audio/Three
// objects: callers feed it the actual visual director snapshots each frame.
// This keeps every audible transition locked to the already-authoritative
// light, Rift and finite-lens state instead of introducing a second timeline.

export const OBSERVATORY_AUDIO_MIX_LIMITS = Object.freeze({
  channel: 1,
  // Bound the sum of the four hidden-event layers. The browser mixer may
  // apply its own conservative output gain, but R+F can never quadruple the
  // normalized energy merely because both secrets are open together.
  riftLensTotal: 1.6
});

const LENS_EDGE_EPSILON = 1e-4;
const EMPTY_EVENTS = Object.freeze([]);
const SILENT_MIX = Object.freeze({
  master: 0,
  roomTone: 0,
  cosmosAir: 0,
  starAir: 0,
  riftSweep: 0,
  riftBed: 0,
  lensDrone: 0,
  lensFlow: 0
});

function clamp01(value) {
  return Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function freezeAdaptationChannels(channels) {
  return Object.freeze({
    houseLight: clamp01(channels?.houseLight),
    roomDarkness: clamp01(channels?.roomDarkness),
    portalReveal: clamp01(channels?.portalReveal),
    brightStarReveal: clamp01(channels?.brightStarReveal),
    scotopicAdaptation: clamp01(channels?.scotopicAdaptation),
    nebulaReveal: clamp01(channels?.nebulaReveal),
    faintStarReveal: clamp01(channels?.faintStarReveal)
  });
}

function freezeRiftChannels(channels) {
  return Object.freeze({
    apertureExpansion: clamp01(channels?.apertureExpansion),
    wallDissolve: clamp01(channels?.wallDissolve),
    foregroundDepth: clamp01(channels?.foregroundDepth),
    foregroundParallax: clamp01(channels?.foregroundParallax),
    ringFadeProgress: clamp01(channels?.ringFadeProgress),
    ringIntensity: clamp01(channels?.ringIntensity),
    backdropSuppression: clamp01(channels?.backdropSuppression),
    spatialMotionScale: clamp01(channels?.spatialMotionScale)
  });
}

function normalizeAdaptationMode(value) {
  return ["inactive", "lit", "darkening", "relighting"].includes(value)
    ? value
    : "inactive";
}

function lightsOnFromSnapshot(adaptationMode, adaptationChannels) {
  if (adaptationMode === "darkening") return false;
  if (adaptationMode === "lit" || adaptationMode === "relighting") return true;
  // A malformed/legacy mode remains deterministic and fail-soft. Production
  // supplies the canonical mode, so this fallback is only defensive.
  return adaptationChannels.houseLight >= 0.5;
}

function normalizeRiftMode(riftState) {
  const mode = typeof riftState === "string" ? riftState : riftState?.mode;
  return ["closed", "opening", "open", "closing"].includes(mode)
    ? mode
    : "closed";
}

function riftOpenFromSnapshot(riftState, riftMode) {
  if (typeof riftState?.targetOpen === "boolean") {
    return riftState.targetOpen;
  }
  return riftMode === "opening" || riftMode === "open";
}

function normalizeInput(input = {}) {
  const adaptationMode = normalizeAdaptationMode(input.adaptationMode);
  const adaptationChannels = freezeAdaptationChannels(input.adaptationChannels);
  const riftMode = normalizeRiftMode(input.riftState);
  const riftChannels = freezeRiftChannels(
    input.riftChannels ?? input.riftState?.channels
  );
  const inLoft = input.inLoft === true;
  const visualAvailable = input.visualAvailable === true;
  const runtimeAvailable = input.runtimeAvailable === true;
  const pageVisible = input.pageVisible === true;
  const userActivated = input.userActivated === true;
  const muted = input.muted === true;
  // Room sound and the physical switch must remain available before the sky
  // texture/stencil path is ready. Only celestial and hidden-event layers
  // depend on visualAvailable.
  const audible = inLoft
    && runtimeAvailable
    && pageVisible
    && userActivated
    && !muted;

  return {
    adaptationMode,
    adaptationChannels,
    lightsOn: lightsOnFromSnapshot(adaptationMode, adaptationChannels),
    riftMode,
    riftOpen: riftOpenFromSnapshot(input.riftState, riftMode),
    riftChannels,
    lensAmount: clamp01(input.lensAmount),
    blackHoleReveal: clamp01(input.blackHoleReveal),
    inLoft,
    visualAvailable,
    runtimeAvailable,
    pageVisible,
    userActivated,
    muted,
    reducedMotion: input.reducedMotion === true,
    audible,
    hiddenAudible: audible && visualAvailable
  };
}

function capHiddenEventMix(mix) {
  const keys = ["riftSweep", "riftBed", "lensDrone", "lensFlow"];
  const total = keys.reduce((sum, key) => sum + mix[key], 0);
  if (total <= OBSERVATORY_AUDIO_MIX_LIMITS.riftLensTotal) return mix;

  const scale = OBSERVATORY_AUDIO_MIX_LIMITS.riftLensTotal / total;
  for (const key of keys) mix[key] *= scale;
  return mix;
}

function evaluateNormalizedMix(snapshot) {
  if (!snapshot.audible) return SILENT_MIX;

  const adaptation = snapshot.adaptationChannels;
  if (!snapshot.visualAvailable) {
    return Object.freeze({
      ...SILENT_MIX,
      master: 1,
      roomTone: clamp01(0.12 + adaptation.houseLight * 0.58)
    });
  }

  const rift = snapshot.riftChannels;
  const blackHoleReveal = snapshot.blackHoleReveal;
  const mix = capHiddenEventMix({
    master: 1,
    // The room never becomes acoustically vacuum-sealed, but its warm electric
    // bed follows the exact house-light channel down to a very quiet floor.
    roomTone: 0.12 + adaptation.houseLight * 0.58,
    cosmosAir: adaptation.portalReveal
      * (0.3 + adaptation.nebulaReveal * 0.7),
    starAir: adaptation.brightStarReveal
      * (0.25 + adaptation.faintStarReveal * 0.75),
    // These two mappings intentionally remain direct. The visual Rift director
    // already supplies its reversible 3.6 s expansion and one-second ring tail.
    riftSweep: rift.ringIntensity,
    riftBed: rift.foregroundDepth,
    // F must follow the actually rendered finite black hole, never the React
    // request. This also fail-closes its sound during visual fallbacks.
    lensDrone: blackHoleReveal,
    lensFlow: snapshot.reducedMotion
      ? 0
      : blackHoleReveal * (0.35 + adaptation.scotopicAdaptation * 0.65)
  });

  for (const key of Object.keys(mix)) mix[key] = clamp01(mix[key]);
  return Object.freeze(mix);
}

/**
 * Convert one authoritative visual snapshot into a frozen normalized mix.
 * This is a pure evaluation: it has no edge history and emits no cue events.
 */
export function evaluateObservatoryAudioMix(input = {}) {
  return evaluateNormalizedMix(normalizeInput(input));
}

function initialLensMotion(lensAmount) {
  if (lensAmount <= LENS_EDGE_EPSILON) return "closed";
  if (lensAmount >= 1 - LENS_EDGE_EPSILON) return "open";
  return "steady";
}

function nextLensMotion(previous, currentLensAmount) {
  const delta = currentLensAmount - previous.lensAmount;
  if (delta > LENS_EDGE_EPSILON) return "opening";
  if (delta < -LENS_EDGE_EPSILON) return "closing";
  if (currentLensAmount <= LENS_EDGE_EPSILON) return "closed";
  if (currentLensAmount >= 1 - LENS_EDGE_EPSILON) return "open";
  return previous.lensMotion === "opening" || previous.lensMotion === "closing"
    ? previous.lensMotion
    : "steady";
}

function makeState(snapshot, mix, events, lensMotion) {
  return Object.freeze({
    adaptationMode: snapshot.adaptationMode,
    adaptationChannels: snapshot.adaptationChannels,
    lightsOn: snapshot.lightsOn,
    riftMode: snapshot.riftMode,
    riftOpen: snapshot.riftOpen,
    riftChannels: snapshot.riftChannels,
    lensAmount: snapshot.lensAmount,
    blackHoleReveal: snapshot.blackHoleReveal,
    lensMotion,
    inLoft: snapshot.inLoft,
    visualAvailable: snapshot.visualAvailable,
    runtimeAvailable: snapshot.runtimeAvailable,
    pageVisible: snapshot.pageVisible,
    userActivated: snapshot.userActivated,
    muted: snapshot.muted,
    reducedMotion: snapshot.reducedMotion,
    audible: snapshot.audible,
    hiddenAudible: snapshot.hiddenAudible,
    mix,
    events
  });
}

/** Create/re-baseline the director without replaying any historical cue. */
export function createObservatoryAudioDirectorState(input = {}) {
  const snapshot = normalizeInput(input);
  return makeState(
    snapshot,
    evaluateNormalizedMix(snapshot),
    EMPTY_EVENTS,
    initialLensMotion(snapshot.lensAmount)
  );
}

/**
 * Advance edge history from one actual visual snapshot to the next.
 *
 * There is intentionally no deltaSeconds argument. Reversals are detected
 * from the canonical state/damped lens amount, while a non-audible frame
 * re-baselines everything so unlock/unmute/tab restore never backfills cues.
 */
export function stepObservatoryAudioDirector(previousState, input = {}) {
  if (!previousState) return createObservatoryAudioDirectorState(input);

  const snapshot = normalizeInput(input);
  const lensMotion = nextLensMotion(previousState, snapshot.lensAmount);
  const events = [];

  if (previousState.audible && snapshot.audible) {
    if (previousState.lightsOn !== snapshot.lightsOn) {
      events.push(snapshot.lightsOn ? "lights-on" : "lights-off");
    }
  }
  if (previousState.hiddenAudible && snapshot.hiddenAudible) {
    if (previousState.riftOpen !== snapshot.riftOpen) {
      events.push(snapshot.riftOpen ? "rift-open" : "rift-close");
    }
    if (
      lensMotion !== previousState.lensMotion
      && (lensMotion === "opening" || lensMotion === "closing")
    ) {
      events.push(lensMotion === "opening" ? "lens-open" : "lens-close");
    }
  }

  return makeState(
    snapshot,
    evaluateNormalizedMix(snapshot),
    events.length > 0 ? Object.freeze(events) : EMPTY_EVENTS,
    lensMotion
  );
}
