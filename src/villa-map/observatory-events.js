// Deterministic, framework-independent director for the observatory's rare
// celestial events (流星雨 / 彗星 / 星云增强 / 黑洞凌日).
//
// Like observatory-adaptation.js, this module knows nothing about React,
// Three.js or clocks: the caller supplies deltaSeconds, eligibility (lights
// off, in the loft, stars actually visible), per-event availability and an
// injectable RNG, which makes every roll reproducible in the Node tests.
//
// While the player stargazes, each second carries a constant hazard of
// OBSERVATORY_RARE_EVENT_CHANCE_PER_SECOND that one event begins. The roll is
// converted to a per-frame probability with 1 - (1 - p)^dt, so the trigger
// rate is frame-rate independent: many small frames compose to exactly the
// same chance as one large step over the same wall-clock span.
//
// Selection among available events is uniform (no rarity weighting by design
// request); the `journal` line on each definition feeds the wall-book 天象图鉴.

export const OBSERVATORY_RARE_EVENT_CHANCE_PER_SECOND = 0.03;
export const OBSERVATORY_RARE_EVENT_COOLDOWN_SECONDS = 40;
// A cancelled event (lights back on, player leaves L3, infrastructure
// failure) never snaps to zero — it releases over this window so the sky
// cannot pop. Relighting itself hides every celestial layer in ~0.36 s, so
// the release is fully covered by the existing lights-on fade.
export const OBSERVATORY_RARE_EVENT_RELEASE_SECONDS = 0.45;

// Stars must genuinely be out before anything rare can happen; rolling during
// the first seconds of dark adaptation would waste the event while the sky is
// still fading in.
export const OBSERVATORY_RARE_EVENT_MIN_STAR_REVEAL = 0.5;

export const OBSERVATORY_RARE_EVENTS = Object.freeze({
  "meteor-shower": Object.freeze({
    label: "流星雨",
    channel: "meteor",
    durationSeconds: 26,
    rampInFraction: 0.16,
    rampOutFraction: 0.24,
    requires: "skyLayer",
    journal: "整片星空接连划过明亮的流星，头亮尾暗，一波接一波。"
  }),
  comet: Object.freeze({
    label: "彗星经过",
    channel: "comet",
    durationSeconds: 40,
    rampInFraction: 0.1,
    rampOutFraction: 0.14,
    requires: "skyLayer",
    journal: "一颗拖着长尾的彗星沿大圆弧升起、过顶、缓缓落下。"
  }),
  "nebula-surge": Object.freeze({
    label: "星云增强",
    channel: "nebulaBoost",
    durationSeconds: 22,
    rampInFraction: 0.3,
    rampOutFraction: 0.34,
    requires: "nebula",
    journal: "穹顶里的星云短暂苏醒，发光尘埃比平时明亮了许多。"
  }),
  "black-hole-transit": Object.freeze({
    label: "黑洞凌日",
    channel: "blackHole",
    durationSeconds: 32,
    rampInFraction: 0.22,
    rampOutFraction: 0.24,
    requires: "blackHole",
    journal: "一个黑洞悄然凌空，吸积盘与引力透镜扭曲了整片银河。"
  }),
  supernova: Object.freeze({
    label: "超新星爆发",
    channel: "supernova",
    durationSeconds: 30,
    rampInFraction: 0.04,
    rampOutFraction: 0.5,
    requires: "skyLayer",
    journal: "一颗恒星在几秒内亮过整片星空，带着衍射星芒缓缓熄灭。"
  }),
  bolide: Object.freeze({
    label: "火流星",
    channel: "bolide",
    durationSeconds: 18,
    rampInFraction: 0.05,
    rampOutFraction: 0.3,
    requires: "skyLayer",
    journal: "一颗火流星轰然划过并炸出闪光，留下一道久久不散的余迹。"
  }),
  "satellite-train": Object.freeze({
    label: "卫星列车",
    channel: "satellites",
    durationSeconds: 45,
    rampInFraction: 0.08,
    rampOutFraction: 0.12,
    requires: "skyLayer",
    journal: "一串等距的小亮点排着队安静地横穿夜空。"
  }),
  "planet-conjunction": Object.freeze({
    label: "行星合",
    channel: "planets",
    durationSeconds: 36,
    rampInFraction: 0.18,
    rampOutFraction: 0.22,
    requires: "skyLayer",
    journal: "三颗色泽各异的行星贴得极近，又在半分钟里缓缓分开。"
  }),
  aurora: Object.freeze({
    label: "极光",
    channel: "aurora",
    durationSeconds: 50,
    rampInFraction: 0.22,
    rampOutFraction: 0.26,
    requires: "skyLayer",
    journal: "绿紫色的光幕在地平线上流动、起伏，像一场无声的舞。"
  }),
  constellation: Object.freeze({
    label: "星座连线",
    channel: "constellation",
    durationSeconds: 30,
    rampInFraction: 0.2,
    rampOutFraction: 0.25,
    requires: "skyLayer",
    journal: "星空中亮起了发光的连线，勾勒出一个熟悉的图案。"
  }),
  "moon-transit": Object.freeze({
    label: "月亮过境",
    channel: "moon",
    durationSeconds: 55,
    rampInFraction: 0.12,
    rampOutFraction: 0.14,
    requires: "skyLayer",
    journal: "一轮明月缓缓过境，月光让最暗的星星短暂隐去。"
  }),
  kilonova: Object.freeze({
    label: "千新星涟漪",
    channel: "kilonova",
    durationSeconds: 24,
    rampInFraction: 0.06,
    rampOutFraction: 0.3,
    requires: "skyLayer",
    journal: "一道金白色闪光之后，一圈光的涟漪横扫过整片天幕。"
  }),
  ufo: Object.freeze({
    label: "不明飞行物",
    channel: "ufo",
    durationSeconds: 20,
    rampInFraction: 0.1,
    rampOutFraction: 0.15,
    requires: "skyLayer",
    journal: "一个走位飘忽的小光点停顿、猛冲、又停顿，最后瞬间消失。"
  })
});

export const OBSERVATORY_RARE_EVENT_IDS = Object.freeze(
  Object.keys(OBSERVATORY_RARE_EVENTS)
);

const IDLE_CHANNELS = Object.freeze({
  meteor: 0,
  comet: 0,
  nebulaBoost: 0,
  blackHole: 0,
  supernova: 0,
  bolide: 0,
  satellites: 0,
  planets: 0,
  aurora: 0,
  constellation: 0,
  moon: 0,
  kilonova: 0,
  ufo: 0
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

function channelsFor(eventId, intensity) {
  const definition = OBSERVATORY_RARE_EVENTS[eventId];
  const safeIntensity = clamp01(intensity);
  if (!definition || safeIntensity <= 0) return IDLE_CHANNELS;
  return Object.freeze({
    ...IDLE_CHANNELS,
    [definition.channel]: safeIntensity
  });
}

function makeState({
  mode,
  event,
  elapsedSeconds,
  intensity,
  releaseFromIntensity,
  cooldownSeconds,
  seed,
  frozenProgress = null
}) {
  const definition = event ? OBSERVATORY_RARE_EVENTS[event] : null;
  const safeElapsed = finiteNonNegative(elapsedSeconds);
  const safeIntensity = clamp01(intensity);
  return Object.freeze({
    mode,
    event: definition ? event : null,
    label: definition?.label ?? null,
    elapsedSeconds: safeElapsed,
    durationSeconds: definition?.durationSeconds ?? 0,
    // During a release the event's progress freezes where it was cancelled,
    // so path-driven visuals (comet, moon, satellites…) fade out in place
    // instead of teleporting back to their path start.
    progress: definition
      ? (frozenProgress ?? clamp01(safeElapsed / definition.durationSeconds))
      : 0,
    intensity: safeIntensity,
    releaseFromIntensity: clamp01(releaseFromIntensity),
    cooldownSeconds: finiteNonNegative(cooldownSeconds),
    seed: clamp01(seed),
    channels: channelsFor(event, safeIntensity)
  });
}

/**
 * Frame-rate-independent hazard: the probability that an event begins within
 * deltaSeconds when the per-second chance is chancePerSecond.
 */
export function rareEventTriggerProbability(chancePerSecond, deltaSeconds) {
  const chance = clamp01(chancePerSecond);
  const delta = finiteNonNegative(deltaSeconds);
  if (chance <= 0 || delta <= 0) return 0;
  return 1 - Math.pow(1 - chance, delta);
}

/** Symmetric smootherstep envelope: 0 → 1 over rampIn, 1 → 0 over rampOut. */
export function rareEventEnvelope(progress, definition) {
  const safeProgress = clamp01(progress);
  const rampIn = Math.max(definition?.rampInFraction ?? 0.15, 1e-4);
  const rampOut = Math.max(definition?.rampOutFraction ?? 0.2, 1e-4);
  return smootherstep01(safeProgress / rampIn)
    * smootherstep01((1 - safeProgress) / rampOut);
}

function availableEventIds(availability) {
  return OBSERVATORY_RARE_EVENT_IDS.filter((id) => {
    const requirement = OBSERVATORY_RARE_EVENTS[id].requires;
    return !requirement || availability?.[requirement] === true;
  });
}

/** Create/reset the director to its idle state (no event, no cooldown). */
export function createObservatoryRareEventsState() {
  return makeState({
    mode: "idle",
    event: null,
    elapsedSeconds: 0,
    intensity: 0,
    releaseFromIntensity: 0,
    cooldownSeconds: 0,
    seed: 0
  });
}

function startEvent(eventId, { seed, cooldownSeconds }) {
  return makeState({
    mode: "active",
    event: eventId,
    elapsedSeconds: 0,
    intensity: 0,
    releaseFromIntensity: 0,
    cooldownSeconds,
    seed
  });
}

function beginRelease(previous, cooldownSeconds) {
  return makeState({
    mode: "release",
    event: previous.event,
    elapsedSeconds: 0,
    intensity: previous.intensity,
    releaseFromIntensity: previous.intensity,
    // A cancelled event still spends the full cooldown: rapid light-switch
    // toggling must not become a reroll lever.
    cooldownSeconds,
    seed: previous.seed,
    frozenProgress: previous.progress
  });
}

/**
 * Advance the director without mutating the previous state.
 *
 * - eligible: the player is stargazing (in the loft, lights off, stars
 *   revealed past OBSERVATORY_RARE_EVENT_MIN_STAR_REVEAL, sky renderable).
 * - availability: { skyLayer, nebula, blackHole } booleans gate the events
 *   whose `requires` names them: the 11 sky-rendered events need the sky
 *   event layer to be healthy (fail-soft against a shader failure), the
 *   surge needs the volumetric Portal, the transit a renderable black hole.
 * - forcedEvent: QA-only pin. Starts that event immediately (when eligible
 *   and available) and re-arms it after it runs out; the random roll never
 *   fires while a forced event is set. forcedSeed fixes the occurrence's
 *   visual seed so a pinned event can be aimed at a harness camera.
 * - random: injectable RNG. Consumed only on the frames where a decision is
 *   actually made (roll / selection / seed), never while idle-ineligible.
 */
export function stepObservatoryRareEvents(
  previousState,
  {
    deltaSeconds = 0,
    eligible = false,
    availability = null,
    chancePerSecond = OBSERVATORY_RARE_EVENT_CHANCE_PER_SECOND,
    cooldownSeconds = OBSERVATORY_RARE_EVENT_COOLDOWN_SECONDS,
    forcedEvent = null,
    forcedSeed = 0.5,
    random = Math.random
  } = {}
) {
  const previous = previousState ?? createObservatoryRareEventsState();
  const delta = finiteNonNegative(deltaSeconds);
  const available = availableEventIds(availability);
  const forced = forcedEvent && available.includes(forcedEvent)
    ? forcedEvent
    : null;

  // Cancellation path: anything active or releasing fades out over the fixed
  // release window. A release never resurrects, even if eligibility returns.
  if (!eligible || (previous.mode === "active" && !available.includes(previous.event))) {
    if (previous.mode === "active") {
      return beginRelease(previous, cooldownSeconds);
    }
    if (previous.mode === "release") {
      const elapsed = previous.elapsedSeconds + delta;
      const releaseProgress = elapsed / OBSERVATORY_RARE_EVENT_RELEASE_SECONDS;
      if (releaseProgress >= 1) {
        return makeState({
          mode: "idle",
          event: null,
          elapsedSeconds: 0,
          intensity: 0,
          releaseFromIntensity: 0,
          cooldownSeconds: previous.cooldownSeconds,
          seed: previous.seed
        });
      }
      return makeState({
        mode: "release",
        event: previous.event,
        elapsedSeconds: elapsed,
        intensity: previous.releaseFromIntensity * (1 - releaseProgress),
        releaseFromIntensity: previous.releaseFromIntensity,
        cooldownSeconds: previous.cooldownSeconds,
        seed: previous.seed,
        frozenProgress: previous.progress
      });
    }
    if (!eligible) {
      // Idle while ineligible: cooldown still ticks (it is anti-spam, not a
      // reward timer), and no RNG is consumed.
      return makeState({
        mode: "idle",
        event: null,
        elapsedSeconds: 0,
        intensity: 0,
        releaseFromIntensity: 0,
        cooldownSeconds: Math.max(0, previous.cooldownSeconds - delta),
        seed: previous.seed
      });
    }
  }

  if (previous.mode === "release") {
    // Eligibility returned mid-release: keep fading out, then re-arm.
    const elapsed = previous.elapsedSeconds + delta;
    const releaseProgress = elapsed / OBSERVATORY_RARE_EVENT_RELEASE_SECONDS;
    if (releaseProgress < 1) {
      return makeState({
        mode: "release",
        event: previous.event,
        elapsedSeconds: elapsed,
        intensity: previous.releaseFromIntensity * (1 - releaseProgress),
        releaseFromIntensity: previous.releaseFromIntensity,
        cooldownSeconds: previous.cooldownSeconds,
        seed: previous.seed,
        frozenProgress: previous.progress
      });
    }
    return makeState({
      mode: "idle",
      event: null,
      elapsedSeconds: 0,
      intensity: 0,
      releaseFromIntensity: 0,
      cooldownSeconds: previous.cooldownSeconds,
      seed: previous.seed
    });
  }

  if (previous.mode === "active") {
    const definition = OBSERVATORY_RARE_EVENTS[previous.event];
    const elapsed = previous.elapsedSeconds + delta;
    if (elapsed >= definition.durationSeconds) {
      return makeState({
        mode: "idle",
        event: null,
        elapsedSeconds: 0,
        intensity: 0,
        releaseFromIntensity: 0,
        cooldownSeconds,
        seed: previous.seed
      });
    }
    return makeState({
      mode: "active",
      event: previous.event,
      elapsedSeconds: elapsed,
      intensity: rareEventEnvelope(
        elapsed / definition.durationSeconds,
        definition
      ),
      releaseFromIntensity: 0,
      cooldownSeconds: previous.cooldownSeconds,
      seed: previous.seed
    });
  }

  // Idle and eligible. A forced (QA) event uses a fixed seed so harness
  // screenshots of a pinned event are reproducible across runs.
  if (forced) {
    return startEvent(forced, {
      seed: Number.isFinite(forcedSeed) ? forcedSeed : 0.5,
      cooldownSeconds: 0
    });
  }
  const remainingCooldown = Math.max(0, previous.cooldownSeconds - delta);
  if (remainingCooldown > 0 || available.length === 0) {
    return makeState({
      mode: "idle",
      event: null,
      elapsedSeconds: 0,
      intensity: 0,
      releaseFromIntensity: 0,
      cooldownSeconds: remainingCooldown,
      seed: previous.seed
    });
  }
  if (random() < rareEventTriggerProbability(chancePerSecond, delta)) {
    const index = Math.min(
      available.length - 1,
      Math.floor(random() * available.length)
    );
    return startEvent(available[index], {
      seed: random(),
      cooldownSeconds: 0
    });
  }
  return makeState({
    mode: "idle",
    event: null,
    elapsedSeconds: 0,
    intensity: 0,
    releaseFromIntensity: 0,
    cooldownSeconds: 0,
    seed: previous.seed
  });
}
