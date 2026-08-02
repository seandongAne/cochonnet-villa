// Deterministic, framework-independent quality policy for the observatory.
//
// The browser bridge reports capabilities once and then feeds measured frame
// times into this module. No navigator, WebGL context, renderer, or timer is
// read here, so capability selection and every quality transition remain
// reproducible in Node tests.

export const OBSERVATORY_DEFAULT_QUALITY = "medium";

// Ascending order makes adjacent upgrades/downgrades and hardware caps
// explicit. Runtime adaptation never skips a tier.
export const OBSERVATORY_QUALITY_TIERS = Object.freeze([
  "minimum",
  "low",
  "medium",
  "high"
]);

export const OBSERVATORY_QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({
    id: "high",
    gaiaStarLimit: 80_000,
    portalQuality: "high",
    nebulaQuality: "high",
    volumetricFbo: true,
    nebulaMode: "volumetric",
    backdrop4k: true,
    proceduralStarsFallback: true
  }),
  medium: Object.freeze({
    id: "medium",
    gaiaStarLimit: 35_000,
    portalQuality: "medium",
    nebulaQuality: "medium",
    volumetricFbo: true,
    nebulaMode: "volumetric",
    backdrop4k: true,
    proceduralStarsFallback: true
  }),
  low: Object.freeze({
    id: "low",
    gaiaStarLimit: 8_000,
    portalQuality: null,
    nebulaQuality: null,
    volumetricFbo: false,
    nebulaMode: "disabled",
    backdrop4k: true,
    proceduralStarsFallback: true
  }),
  minimum: Object.freeze({
    id: "minimum",
    // Minimum is the already-shipped native-resolution fallback: the 4K
    // Milky Way backdrop plus the existing 360 procedural stars. It allocates
    // no volumetric render target and does not depend on Gaia data.
    gaiaStarLimit: 0,
    fallbackStarCount: 360,
    portalQuality: null,
    nebulaQuality: null,
    volumetricFbo: false,
    nebulaMode: "disabled",
    backdrop4k: true,
    proceduralStarsFallback: true
  })
});

export const OBSERVATORY_QUALITY_TIMING = Object.freeze({
  sampleWindowSeconds: 2,
  degradeAfterSeconds: 2,
  upgradeAfterSeconds: 8,
  transitionCooldownSeconds: 3,
  // Upgrades demand substantial headroom, while downgrades begin only after
  // the actual target is exceeded. The wide gap is the first anti-thrashing
  // layer; asymmetric dwell times and cooldown provide the other two.
  degradeP95Ratio: 1,
  upgradeP95Ratio: 0.72,
  targetFrameMs: 16.7
});

export const OBSERVATORY_QUALITY_MAX_SAMPLES = 600;

const DECISION_TIME_EPSILON = 1e-9;

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteNonNegative(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function firstFinite(...values) {
  return values.find(Number.isFinite) ?? null;
}

function qualityIndex(quality) {
  return OBSERVATORY_QUALITY_TIERS.indexOf(quality);
}

export function normalizeObservatoryQuality(
  quality,
  fallback = OBSERVATORY_DEFAULT_QUALITY
) {
  const key = typeof quality === "string" ? quality.toLowerCase() : "";
  if (qualityIndex(key) >= 0) return key;
  const fallbackKey = typeof fallback === "string" ? fallback.toLowerCase() : "";
  return qualityIndex(fallbackKey) >= 0
    ? fallbackKey
    : OBSERVATORY_DEFAULT_QUALITY;
}

export function getObservatoryQualityPreset(quality) {
  return OBSERVATORY_QUALITY_PRESETS[
    normalizeObservatoryQuality(quality)
  ];
}

export function clampObservatoryQuality(quality, maximumQuality) {
  const requested = normalizeObservatoryQuality(quality);
  const maximum = normalizeObservatoryQuality(maximumQuality);
  return OBSERVATORY_QUALITY_TIERS[
    Math.min(qualityIndex(requested), qualityIndex(maximum))
  ];
}

export function getAdjacentObservatoryQuality(quality, direction) {
  const current = normalizeObservatoryQuality(quality);
  const offset = direction === "up" ? 1 : direction === "down" ? -1 : 0;
  const nextIndex = Math.min(
    OBSERVATORY_QUALITY_TIERS.length - 1,
    Math.max(0, qualityIndex(current) + offset)
  );
  return OBSERVATORY_QUALITY_TIERS[nextIndex];
}

// Browser code supplies the two values read from a WebGL context. Keeping the
// decision here lets Node tests simulate browsers that accept `stencil:true`
// but actually expose a zero-bit buffer.
export function evaluateObservatoryStencilSupport({
  requestedStencil,
  stencilBits
} = {}) {
  return requestedStencil === true
    && Number.isFinite(stencilBits)
    && stencilBits > 0;
}

/**
 * Conservatively derive the highest quality this device should attempt.
 * Missing browser hints do not punish the visitor: the known-safe default is
 * Medium. High requires affirmative evidence, while explicit weak/missing GPU
 * features lower the cap.
 */
export function assessObservatoryCapabilities(capabilities = {}) {
  const cpuCores = firstFinite(
    capabilities.cpuCores,
    capabilities.hardwareConcurrency
  );
  const deviceMemoryGb = firstFinite(
    capabilities.deviceMemoryGb,
    capabilities.deviceMemory
  );
  const dpr = firstFinite(
    capabilities.dpr,
    capabilities.devicePixelRatio,
    capabilities.pixelRatio
  );
  const webgl2 = typeof capabilities.webgl2 === "boolean"
    ? capabilities.webgl2
    : null;
  const halfFloat = typeof capabilities.halfFloat === "boolean"
    ? capabilities.halfFloat
    : null;
  const stencil = typeof capabilities.stencil === "boolean"
    ? capabilities.stencil
    : null;
  const reducedMotion = capabilities.reducedMotion === true;
  const reasons = [];
  let quality = OBSERVATORY_DEFAULT_QUALITY;
  const strongDevice = webgl2 === true
    && halfFloat === true
    && cpuCores !== null
    && cpuCores >= 8
    && deviceMemoryGb !== null
    && deviceMemoryGb >= 8
    && dpr !== null
    && dpr <= 1.75;

  if (stencil === false) {
    quality = "minimum";
    reasons.push("stencil-unavailable");
  } else if (webgl2 === false) {
    quality = "minimum";
    reasons.push("webgl2-unavailable");
  } else if (
    (cpuCores !== null && cpuCores <= 2)
    || (deviceMemoryGb !== null && deviceMemoryGb <= 2)
  ) {
    quality = "minimum";
    reasons.push("severely-constrained-device");
  } else if (
    (cpuCores !== null && cpuCores <= 4)
    || (deviceMemoryGb !== null && deviceMemoryGb <= 4)
    || (dpr !== null && dpr >= 2.5)
  ) {
    quality = "low";
    if (cpuCores !== null && cpuCores <= 4) reasons.push("limited-cpu");
    if (deviceMemoryGb !== null && deviceMemoryGb <= 4) {
      reasons.push("limited-memory");
    }
    if (dpr !== null && dpr >= 2.5) reasons.push("high-pixel-density");
  } else if (strongDevice) {
    if (reducedMotion) {
      quality = "medium";
      reasons.push("reduced-motion-high-cap");
    } else {
      quality = "high";
      reasons.push("strong-device");
    }
  } else {
    reasons.push(halfFloat === false ? "rgba8-portal" : "balanced-default");
  }

  const normalizedCapabilities = Object.freeze({
    webgl2,
    halfFloat,
    stencil,
    reducedMotion,
    cpuCores,
    deviceMemoryGb,
    dpr
  });

  return Object.freeze({
    quality,
    maximumQuality: quality,
    capabilities: normalizedCapabilities,
    reasons: Object.freeze(reasons)
  });
}

export function selectInitialObservatoryQuality(capabilities = {}) {
  return assessObservatoryCapabilities(capabilities).quality;
}

function frameTimeFrom(sample) {
  if (Number.isFinite(sample)) return sample;
  return Number.isFinite(sample?.frameTimeMs) ? sample.frameTimeMs : null;
}

/** Nearest-rank p95, shared by the rolling controller and deterministic tests. */
export function calculateObservatoryFrameTimeP95(samples = []) {
  const values = samples
    .map(frameTimeFrom)
    .filter((value) => value !== null && value >= 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.ceil(values.length * 0.95) - 1)
  );
  return values[index];
}

function freezeSample(sample) {
  return Object.freeze({
    timeSeconds: sample.timeSeconds,
    frameTimeMs: sample.frameTimeMs
  });
}

function makeQualityState({
  quality,
  maximumQuality,
  samples,
  elapsedSeconds,
  p95Ms,
  overBudgetSeconds,
  surplusSeconds,
  cooldownRemainingSeconds,
  transition,
  config,
  capabilityAssessment
}) {
  const safeMaximum = normalizeObservatoryQuality(maximumQuality);
  const safeQuality = clampObservatoryQuality(quality, safeMaximum);
  return Object.freeze({
    quality: safeQuality,
    maximumQuality: safeMaximum,
    preset: getObservatoryQualityPreset(safeQuality),
    samples: Object.freeze(samples.map(freezeSample)),
    elapsedSeconds: finiteNonNegative(elapsedSeconds),
    p95Ms: finiteNonNegative(p95Ms),
    overBudgetSeconds: finiteNonNegative(overBudgetSeconds),
    surplusSeconds: finiteNonNegative(surplusSeconds),
    cooldownRemainingSeconds: finiteNonNegative(cooldownRemainingSeconds),
    transition: transition ? Object.freeze({ ...transition }) : null,
    config,
    capabilityAssessment
  });
}

export function createObservatoryQualityState({
  capabilities = {},
  initialQuality,
  maximumQuality,
  targetFrameMs = OBSERVATORY_QUALITY_TIMING.targetFrameMs,
  sampleWindowSeconds = OBSERVATORY_QUALITY_TIMING.sampleWindowSeconds,
  degradeAfterSeconds = OBSERVATORY_QUALITY_TIMING.degradeAfterSeconds,
  upgradeAfterSeconds = OBSERVATORY_QUALITY_TIMING.upgradeAfterSeconds,
  transitionCooldownSeconds =
    OBSERVATORY_QUALITY_TIMING.transitionCooldownSeconds,
  degradeP95Ratio = OBSERVATORY_QUALITY_TIMING.degradeP95Ratio,
  upgradeP95Ratio = OBSERVATORY_QUALITY_TIMING.upgradeP95Ratio
} = {}) {
  const capabilityAssessment = assessObservatoryCapabilities(capabilities);
  const safeMaximum = normalizeObservatoryQuality(
    maximumQuality,
    capabilityAssessment.maximumQuality
  );
  const safeInitial = clampObservatoryQuality(
    normalizeObservatoryQuality(initialQuality, capabilityAssessment.quality),
    safeMaximum
  );
  const safeDegradeRatio = finitePositive(
    degradeP95Ratio,
    OBSERVATORY_QUALITY_TIMING.degradeP95Ratio
  );
  const safeUpgradeRatio = Math.min(
    safeDegradeRatio,
    finitePositive(
      upgradeP95Ratio,
      OBSERVATORY_QUALITY_TIMING.upgradeP95Ratio
    )
  );
  const config = Object.freeze({
    targetFrameMs: finitePositive(
      targetFrameMs,
      OBSERVATORY_QUALITY_TIMING.targetFrameMs
    ),
    sampleWindowSeconds: finitePositive(
      sampleWindowSeconds,
      OBSERVATORY_QUALITY_TIMING.sampleWindowSeconds
    ),
    degradeAfterSeconds: finitePositive(
      degradeAfterSeconds,
      OBSERVATORY_QUALITY_TIMING.degradeAfterSeconds
    ),
    upgradeAfterSeconds: finitePositive(
      upgradeAfterSeconds,
      OBSERVATORY_QUALITY_TIMING.upgradeAfterSeconds
    ),
    transitionCooldownSeconds: finiteNonNegative(
      transitionCooldownSeconds,
      OBSERVATORY_QUALITY_TIMING.transitionCooldownSeconds
    ),
    degradeP95Ratio: safeDegradeRatio,
    upgradeP95Ratio: safeUpgradeRatio
  });

  return makeQualityState({
    quality: safeInitial,
    maximumQuality: safeMaximum,
    samples: [],
    elapsedSeconds: 0,
    p95Ms: 0,
    overBudgetSeconds: 0,
    surplusSeconds: 0,
    cooldownRemainingSeconds: 0,
    transition: null,
    config,
    capabilityAssessment
  });
}

/**
 * Feed one measured frame into the rolling p95 controller without mutating the
 * previous state. `active: false` clears stale measurements so leaving L3,
 * relighting, or re-entering cannot cause an immediate quality jump.
 */
export function stepObservatoryQuality(
  previousState,
  {
    frameTimeMs,
    deltaSeconds,
    active = true
  } = {}
) {
  const previous = previousState ?? createObservatoryQualityState();
  const validFrame = Number.isFinite(frameTimeMs) && frameTimeMs > 0;
  const safeDelta = finiteNonNegative(
    deltaSeconds,
    validFrame ? frameTimeMs / 1000 : 0
  );
  const elapsedSeconds = previous.elapsedSeconds + safeDelta;

  if (!active) {
    return makeQualityState({
      ...previous,
      samples: [],
      elapsedSeconds,
      p95Ms: 0,
      overBudgetSeconds: 0,
      surplusSeconds: 0,
      cooldownRemainingSeconds: 0,
      transition: null
    });
  }

  let samples = previous.samples
    .filter((sample) => (
      sample.timeSeconds
      >= elapsedSeconds - previous.config.sampleWindowSeconds
    ))
    .map((sample) => ({
      timeSeconds: sample.timeSeconds,
      frameTimeMs: sample.frameTimeMs
    }));
  if (validFrame) {
    samples.push({ timeSeconds: elapsedSeconds, frameTimeMs });
    if (samples.length > OBSERVATORY_QUALITY_MAX_SAMPLES) {
      samples = samples.slice(-OBSERVATORY_QUALITY_MAX_SAMPLES);
    }
  }

  const p95Ms = calculateObservatoryFrameTimeP95(samples);
  let overBudgetSeconds = previous.overBudgetSeconds;
  let surplusSeconds = previous.surplusSeconds;
  let cooldownRemainingSeconds = Math.max(
    0,
    previous.cooldownRemainingSeconds - safeDelta
  );
  let quality = previous.quality;
  let transition = null;

  if (previous.cooldownRemainingSeconds > 0) {
    // Do not pre-charge a reverse transition while the cooldown is active.
    overBudgetSeconds = 0;
    surplusSeconds = 0;
  } else if (validFrame) {
    const degradeThreshold = previous.config.targetFrameMs
      * previous.config.degradeP95Ratio;
    const upgradeThreshold = previous.config.targetFrameMs
      * previous.config.upgradeP95Ratio;

    if (p95Ms > degradeThreshold) {
      overBudgetSeconds += safeDelta;
      surplusSeconds = 0;
    } else if (p95Ms < upgradeThreshold) {
      surplusSeconds += safeDelta;
      overBudgetSeconds = 0;
    } else {
      overBudgetSeconds = 0;
      surplusSeconds = 0;
    }

    if (
      overBudgetSeconds + DECISION_TIME_EPSILON
        >= previous.config.degradeAfterSeconds
      && quality !== "minimum"
    ) {
      const from = quality;
      quality = getAdjacentObservatoryQuality(quality, "down");
      transition = {
        from,
        to: quality,
        direction: "down",
        reason: "p95-over-budget",
        p95Ms
      };
    } else if (
      surplusSeconds + DECISION_TIME_EPSILON
        >= previous.config.upgradeAfterSeconds
      && qualityIndex(quality) < qualityIndex(previous.maximumQuality)
    ) {
      const from = quality;
      quality = getAdjacentObservatoryQuality(quality, "up");
      transition = {
        from,
        to: quality,
        direction: "up",
        reason: "sustained-headroom",
        p95Ms
      };
    }
  }

  if (transition) {
    // Old-tier samples must not immediately trigger a second adjacent change.
    samples = [];
    overBudgetSeconds = 0;
    surplusSeconds = 0;
    cooldownRemainingSeconds = previous.config.transitionCooldownSeconds;
  } else if (quality === "minimum") {
    overBudgetSeconds = Math.min(
      overBudgetSeconds,
      previous.config.degradeAfterSeconds
    );
  } else if (quality === previous.maximumQuality) {
    surplusSeconds = Math.min(
      surplusSeconds,
      previous.config.upgradeAfterSeconds
    );
  }

  return makeQualityState({
    ...previous,
    quality,
    samples,
    elapsedSeconds,
    p95Ms,
    overBudgetSeconds,
    surplusSeconds,
    cooldownRemainingSeconds,
    transition
  });
}
