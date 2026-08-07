import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createObservatoryRareEventsState,
  getAvailableObservatoryRareEventIds,
  OBSERVATORY_RARE_EVENT_CHANCE_PER_SECOND,
  OBSERVATORY_RARE_EVENT_COOLDOWN_SECONDS,
  OBSERVATORY_RARE_EVENT_IDS,
  OBSERVATORY_RARE_EVENT_RECENT_MEMORY,
  OBSERVATORY_RARE_EVENT_RELEASE_SECONDS,
  OBSERVATORY_RARE_EVENTS,
  rareEventEnvelope,
  rareEventTriggerProbability,
  selectWeightedObservatoryRareEvent,
  stepObservatoryRareEvents
} from "../src/villa-map/observatory-events.js";

const ALL_AVAILABLE = Object.freeze({
  skyLayer: true,
  nebula: true,
  blackHole: true
});

function sequenceRandom(values) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
}

function stepDark(state, overrides = {}) {
  return stepObservatoryRareEvents(state, {
    deltaSeconds: 1 / 60,
    eligible: true,
    availability: ALL_AVAILABLE,
    random: () => 0.999,
    ...overrides
  });
}

test("the per-second chance is exactly 3% and frame-rate independent", () => {
  assert.equal(OBSERVATORY_RARE_EVENT_CHANCE_PER_SECOND, 0.03);
  assert.ok(
    Math.abs(rareEventTriggerProbability(0.03, 1) - 0.03) < 1e-12,
    "one whole second must carry exactly the configured hazard"
  );

  // Composing 60 small frames must equal one big frame over the same span:
  // survival probabilities multiply, (1-p)^(1/60*60) === (1-p)^1.
  const dt = 1 / 60;
  const perFrame = rareEventTriggerProbability(0.03, dt);
  const survival60 = Math.pow(1 - perFrame, 60);
  assert.ok(
    Math.abs((1 - survival60) - rareEventTriggerProbability(0.03, 1)) < 1e-9,
    "sliced frames must compose to the same per-second probability"
  );

  assert.equal(rareEventTriggerProbability(0, 1), 0);
  assert.equal(rareEventTriggerProbability(0.03, 0), 0);
  assert.equal(rareEventTriggerProbability(0.03, Number.NaN), 0);
});

test("all special events explicitly use equal test-phase weights", () => {
  for (const [eventId, definition] of Object.entries(OBSERVATORY_RARE_EVENTS)) {
    assert.equal(definition.weight, 1, `${eventId} must declare weight: 1`);
  }

  const pool = ["comet", "aurora", "ufo"];
  assert.equal(selectWeightedObservatoryRareEvent(pool, 0), "comet");
  assert.equal(
    selectWeightedObservatoryRareEvent(pool, (1 / 3) - Number.EPSILON),
    "comet"
  );
  assert.equal(selectWeightedObservatoryRareEvent(pool, 1 / 3), "aurora");
  assert.equal(selectWeightedObservatoryRareEvent(pool, 2 / 3), "ufo");
  assert.equal(selectWeightedObservatoryRareEvent(pool, 1), "ufo");
  assert.equal(selectWeightedObservatoryRareEvent([], 0.5), null);
});

test("reduced motion and shader failures prune the pool before selection", () => {
  const motionRequired = [
    "meteor-shower",
    "bolide",
    "satellite-train",
    "ufo"
  ];
  const fullPool = getAvailableObservatoryRareEventIds({
    availability: ALL_AVAILABLE
  });
  const reducedPool = getAvailableObservatoryRareEventIds({
    availability: ALL_AVAILABLE,
    reducedMotion: true
  });
  assert.deepEqual(
    fullPool.filter((id) => OBSERVATORY_RARE_EVENTS[id].requiresMotion),
    motionRequired
  );
  assert.equal(fullPool.length, 13);
  assert.equal(reducedPool.length, 9);
  for (const eventId of motionRequired) {
    assert.ok(!reducedPool.includes(eventId), `${eventId} must not be rolled`);
  }

  const disabled = new Set(["comet", "black-hole-transit"]);
  const afterFailures = getAvailableObservatoryRareEventIds({
    availability: ALL_AVAILABLE,
    disabledEventIds: disabled
  });
  assert.equal(afterFailures.length, 11);
  assert.ok(!afterFailures.includes("comet"));
  assert.ok(!afterFailures.includes("black-hole-transit"));
  assert.ok(afterFailures.includes("supernova"));

  assert.equal(
    getAvailableObservatoryRareEventIds({
      availability: { skyLayer: true, nebula: false, blackHole: true }
    }).length,
    12,
    "a Low-style pool loses only the Portal-dependent surge"
  );
  assert.equal(
    getAvailableObservatoryRareEventIds({
      availability: { skyLayer: true, nebula: false, blackHole: false },
      reducedMotion: true
    }).length,
    7,
    "Minimum + reduced motion keeps only renderable static phenomena"
  );
});

test("paused directors preserve the exact state, clock and RNG position", () => {
  let state = stepDark(createObservatoryRareEventsState(), {
    forcedEvent: "comet"
  });
  state = stepDark(state, {
    deltaSeconds: 8,
    forcedEvent: null
  });
  const activeElapsed = state.elapsedSeconds;
  const activeProgress = state.progress;
  let randomCalls = 0;
  const pausedActive = stepObservatoryRareEvents(state, {
    deltaSeconds: 1000,
    eligible: false,
    availability: { skyLayer: false, nebula: false, blackHole: false },
    paused: true,
    random: () => {
      randomCalls += 1;
      return 0;
    }
  });
  assert.equal(pausedActive, state, "pause should return the frozen state object");
  assert.equal(pausedActive.elapsedSeconds, activeElapsed);
  assert.equal(pausedActive.progress, activeProgress);
  assert.equal(randomCalls, 0);

  const cooldown = stepDark(state, {
    deltaSeconds: OBSERVATORY_RARE_EVENTS.comet.durationSeconds,
    forcedEvent: null
  });
  assert.equal(cooldown.cooldownSeconds, OBSERVATORY_RARE_EVENT_COOLDOWN_SECONDS);
  const pausedCooldown = stepObservatoryRareEvents(cooldown, {
    deltaSeconds: 1000,
    eligible: true,
    availability: ALL_AVAILABLE,
    paused: true,
    random: () => {
      randomCalls += 1;
      return 0;
    }
  });
  assert.equal(pausedCooldown, cooldown);
  assert.equal(
    pausedCooldown.cooldownSeconds,
    OBSERVATORY_RARE_EVENT_COOLDOWN_SECONDS
  );
  assert.equal(randomCalls, 0);
});

test("no roll can ever fire while ineligible (lights on / off-loft)", () => {
  let state = createObservatoryRareEventsState();
  for (let frame = 0; frame < 600; frame += 1) {
    state = stepObservatoryRareEvents(state, {
      deltaSeconds: 1 / 60,
      eligible: false,
      availability: ALL_AVAILABLE,
      // Even an RNG that always demands a trigger must be ignored.
      random: () => 0
    });
    assert.equal(state.mode, "idle");
    assert.equal(state.event, null);
    assert.equal(state.intensity, 0);
  }
});

test("an eligible frame with a winning roll starts one available event", () => {
  const state = stepDark(createObservatoryRareEventsState(), {
    // roll wins (0 < p), selection picks index 0, seed 0.42.
    random: sequenceRandom([0, 0, 0.42])
  });
  assert.equal(state.mode, "active");
  assert.equal(state.event, OBSERVATORY_RARE_EVENT_IDS[0]);
  assert.equal(state.seed, 0.42);
  assert.equal(state.label, OBSERVATORY_RARE_EVENTS[state.event].label);
});

test("selection respects availability: gated events never fire when missing", () => {
  const gated = new Set(["nebula-surge", "black-hole-transit"]);
  const seen = new Set();
  for (let pick = 0; pick < 40; pick += 1) {
    const state = stepDark(createObservatoryRareEventsState(), {
      availability: { skyLayer: true, nebula: false, blackHole: false },
      random: sequenceRandom([0, pick / 40, 0.5])
    });
    assert.equal(state.mode, "active");
    assert.ok(
      !gated.has(state.event),
      `gated events must not start unavailable (got ${state.event})`
    );
    seen.add(state.event);
  }
  assert.equal(
    seen.size,
    OBSERVATORY_RARE_EVENT_IDS.length - gated.size,
    "equal-weight selection must reach every sky-layer event"
  );

  // A broken sky-event layer (shader failure) removes the 11 sky-rendered
  // events; only the Portal surge and the lens transit stay possible.
  for (let pick = 0; pick < 10; pick += 1) {
    const state = stepDark(createObservatoryRareEventsState(), {
      availability: { skyLayer: false, nebula: true, blackHole: true },
      random: sequenceRandom([0, pick / 10, 0.5])
    });
    assert.ok(
      gated.has(state.event),
      `without the sky layer only surge/transit may start (got ${state.event})`
    );
  }

  // Nothing available → the roll can never start anything.
  const idle = stepDark(createObservatoryRareEventsState(), {
    availability: { skyLayer: false, nebula: false, blackHole: false },
    random: () => 0
  });
  assert.equal(idle.mode, "idle");
});

test("every event maps to its own channel with the envelope intensity", () => {
  for (const [id, definition] of Object.entries(OBSERVATORY_RARE_EVENTS)) {
    let state = stepDark(createObservatoryRareEventsState(), {
      forcedEvent: id
    });
    // Advance to mid-event where the envelope is fully open.
    state = stepDark(state, {
      deltaSeconds: definition.durationSeconds / 2,
      forcedEvent: null
    });
    assert.equal(state.event, id);
    assert.ok(state.intensity > 0.99, `${id} envelope should peak mid-event`);
    for (const [channel, value] of Object.entries(state.channels)) {
      if (channel === definition.channel) {
        assert.equal(value, state.intensity);
      } else {
        assert.equal(value, 0, `${id} must not drive ${channel}`);
      }
    }
  }
});

test("the envelope ramps from and back to zero inside the duration", () => {
  const definition = OBSERVATORY_RARE_EVENTS["meteor-shower"];
  assert.equal(rareEventEnvelope(0, definition), 0);
  assert.equal(rareEventEnvelope(1, definition), 0);
  assert.ok(rareEventEnvelope(0.5, definition) > 0.99);
  assert.ok(rareEventEnvelope(0.08, definition) > 0);
});

test("a completed event enters cooldown and cannot immediately re-trigger", () => {
  let state = stepDark(createObservatoryRareEventsState(), {
    forcedEvent: null,
    random: sequenceRandom([0, 0, 0.5])
  });
  const definition = OBSERVATORY_RARE_EVENTS[state.event];
  state = stepDark(state, { deltaSeconds: definition.durationSeconds + 1 });
  assert.equal(state.mode, "idle");
  assert.equal(state.event, null);
  assert.equal(
    state.cooldownSeconds,
    OBSERVATORY_RARE_EVENT_COOLDOWN_SECONDS
  );

  // A winning roll during cooldown must be ignored…
  state = stepDark(state, { random: () => 0 });
  assert.equal(state.mode, "idle");
  assert.ok(state.cooldownSeconds > 0);

  // …until the cooldown has fully elapsed.
  state = stepDark(state, {
    deltaSeconds: OBSERVATORY_RARE_EVENT_COOLDOWN_SECONDS,
    random: () => 0.999
  });
  assert.equal(state.cooldownSeconds, 0);
  state = stepDark(state, { random: sequenceRandom([0, 0, 0.5]) });
  assert.equal(state.mode, "active");
});

test("losing eligibility mid-event releases smoothly and never resurrects", () => {
  let state = stepDark(createObservatoryRareEventsState(), {
    forcedEvent: "comet"
  });
  state = stepDark(state, { deltaSeconds: 20 });
  const peak = state.intensity;
  assert.ok(peak > 0.9);

  // Lights back on: the event begins a bounded release fade.
  state = stepObservatoryRareEvents(state, {
    deltaSeconds: 1 / 60,
    eligible: false,
    availability: ALL_AVAILABLE
  });
  assert.equal(state.mode, "release");
  assert.equal(state.event, "comet");

  state = stepObservatoryRareEvents(state, {
    deltaSeconds: OBSERVATORY_RARE_EVENT_RELEASE_SECONDS / 2,
    eligible: false,
    availability: ALL_AVAILABLE
  });
  assert.equal(state.mode, "release");
  assert.ok(state.intensity < peak);
  assert.ok(state.intensity > 0);

  // Eligibility returning mid-release must finish the fade, not resurrect.
  state = stepDark(state, {
    deltaSeconds: OBSERVATORY_RARE_EVENT_RELEASE_SECONDS
  });
  assert.equal(state.mode, "idle");
  assert.equal(state.event, null);
  assert.equal(state.intensity, 0);
});

test("losing an event's availability mid-flight cancels it", () => {
  let state = stepDark(createObservatoryRareEventsState(), {
    forcedEvent: "black-hole-transit"
  });
  state = stepDark(state, { deltaSeconds: 10, forcedEvent: null });
  assert.equal(state.mode, "active");

  // Quality tier collapse: the black hole stops being renderable.
  state = stepDark(state, {
    availability: { skyLayer: true, nebula: true, blackHole: false },
    forcedEvent: null
  });
  assert.equal(state.mode, "release");
});

test("a release freezes the event's progress so paths cannot teleport", () => {
  let state = stepDark(createObservatoryRareEventsState(), {
    forcedEvent: "comet"
  });
  state = stepDark(state, { deltaSeconds: 20 });
  const progressAtCancel = state.progress;
  assert.ok(progressAtCancel > 0.4);

  state = stepObservatoryRareEvents(state, {
    deltaSeconds: 1 / 60,
    eligible: false,
    availability: ALL_AVAILABLE
  });
  assert.equal(state.mode, "release");
  assert.equal(state.progress, progressAtCancel);
  state = stepObservatoryRareEvents(state, {
    deltaSeconds: OBSERVATORY_RARE_EVENT_RELEASE_SECONDS / 2,
    eligible: false,
    availability: ALL_AVAILABLE
  });
  assert.equal(
    state.progress,
    progressAtCancel,
    "the fading comet must hold its place on the arc"
  );
});

test("a cancelled event still spends the full cooldown", () => {
  let state = stepDark(createObservatoryRareEventsState(), {
    random: sequenceRandom([0, 0, 0.5])
  });
  assert.equal(state.mode, "active");

  // Relight cancels the event…
  state = stepObservatoryRareEvents(state, {
    deltaSeconds: OBSERVATORY_RARE_EVENT_RELEASE_SECONDS + 0.1,
    eligible: false,
    availability: ALL_AVAILABLE
  });
  state = stepObservatoryRareEvents(state, {
    deltaSeconds: OBSERVATORY_RARE_EVENT_RELEASE_SECONDS + 0.1,
    eligible: false,
    availability: ALL_AVAILABLE
  });
  assert.equal(state.mode, "idle");
  assert.ok(
    state.cooldownSeconds > 0,
    "toggling the lights must not become a reroll lever"
  );

  // …and a winning roll right after the relight is still ignored.
  state = stepDark(state, { random: () => 0 });
  assert.equal(state.mode, "idle");
});

test("a forced event starts immediately with a deterministic seed", () => {
  const state = stepDark(createObservatoryRareEventsState(), {
    forcedEvent: "nebula-surge",
    // The RNG must not influence a forced start.
    random: () => {
      throw new Error("forced events must not consume the RNG");
    }
  });
  assert.equal(state.mode, "active");
  assert.equal(state.event, "nebula-surge");
  assert.equal(state.seed, 0.5);

  // The harness can aim a pinned occurrence with an explicit seed.
  const aimed = stepDark(createObservatoryRareEventsState(), {
    forcedEvent: "moon-transit",
    forcedSeed: 0.555
  });
  assert.equal(aimed.seed, 0.555);
  const guarded = stepDark(createObservatoryRareEventsState(), {
    forcedEvent: "moon-transit",
    forcedSeed: Number.NaN
  });
  assert.equal(guarded.seed, 0.5, "a bad forced seed falls back to 0.5");
});

test("identical RNG sequences reproduce identical trigger timelines", () => {
  const script = [0.9, 0.8, 0.00001, 0.6, 0.33, 0.7, 0.9];
  const run = () => {
    let state = createObservatoryRareEventsState();
    const events = [];
    const random = sequenceRandom(script);
    for (let frame = 0; frame < 6; frame += 1) {
      state = stepObservatoryRareEvents(state, {
        deltaSeconds: 0.5,
        eligible: true,
        availability: ALL_AVAILABLE,
        random
      });
      events.push(`${state.mode}:${state.event ?? "-"}`);
    }
    return events.join("|");
  };
  assert.equal(run(), run());
});

test("states are frozen and expose the full channel set", () => {
  const state = createObservatoryRareEventsState();
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.channels));
  assert.deepEqual(
    Object.keys(state.channels).sort(),
    [
      "aurora",
      "blackHole",
      "bolide",
      "comet",
      "constellation",
      "kilonova",
      "meteor",
      "moon",
      "nebulaBoost",
      "planets",
      "satellites",
      "supernova",
      "ufo"
    ]
  );
  assert.equal(OBSERVATORY_RARE_EVENT_IDS.length, 13);
  const channels = new Set();
  for (const id of OBSERVATORY_RARE_EVENT_IDS) {
    const definition = OBSERVATORY_RARE_EVENTS[id];
    assert.ok(
      definition.durationSeconds > 10,
      "special events should be leisurely, not blink-and-miss flashes"
    );
    assert.equal(
      typeof definition.journal,
      "string",
      `${id} needs a journal line for the wall book`
    );
    channels.add(definition.channel);
  }
  assert.equal(
    channels.size,
    OBSERVATORY_RARE_EVENT_IDS.length,
    "every event must own a distinct channel"
  );
});

// ---- Anti-streak pseudo-random selection ----------------------------------

/** Run the active event to completion, then burn through the cooldown. */
function completeAndCoolDown(state, availability = ALL_AVAILABLE) {
  let next = stepObservatoryRareEvents(state, {
    deltaSeconds: state.durationSeconds + 1,
    eligible: true,
    availability,
    random: () => 0.999
  });
  next = stepObservatoryRareEvents(next, {
    deltaSeconds: OBSERVATORY_RARE_EVENT_COOLDOWN_SECONDS + 1,
    eligible: true,
    availability,
    random: () => 0.999
  });
  assert.equal(next.mode, "idle");
  assert.equal(next.cooldownSeconds, 0);
  return next;
}

function startNext(state, selection, availability = ALL_AVAILABLE) {
  const next = stepObservatoryRareEvents(state, {
    deltaSeconds: 1,
    eligible: true,
    availability,
    random: sequenceRandom([0, selection, 0.5])
  });
  assert.equal(next.mode, "active");
  return next;
}

test("selection remembers the last started events and never repeats them back-to-back", () => {
  assert.equal(OBSERVATORY_RARE_EVENT_RECENT_MEMORY, 2);

  // Selection index 0 would re-pick the same first event every time under
  // plain uniform selection; the recency window must steer it onward.
  let state = startNext(createObservatoryRareEventsState(), 0);
  const first = state.event;
  assert.deepEqual(state.recentEvents, [first]);

  state = startNext(completeAndCoolDown(state), 0);
  const second = state.event;
  assert.notEqual(second, first);
  assert.deepEqual(state.recentEvents, [second, first]);

  state = startNext(completeAndCoolDown(state), 0);
  const third = state.event;
  assert.ok(![first, second].includes(third));
  assert.deepEqual(
    state.recentEvents,
    [third, second],
    "the memory holds only the last two started events"
  );

  // With [third, second] excluded, index 0 may legally return to `first`.
  state = startNext(completeAndCoolDown(state), 0);
  assert.equal(state.event, first);
});

test("long random runs contain no immediate repeats while the pool is healthy", () => {
  // Small deterministic LCG so the run is reproducible.
  let lcg = 42;
  const rng = () => {
    lcg = (lcg * 1664525 + 1013904223) % 4294967296;
    return lcg / 4294967296;
  };
  let state = createObservatoryRareEventsState();
  let previousEvent = null;
  const started = [];
  for (let i = 0; i < 60; i += 1) {
    state = stepObservatoryRareEvents(state, {
      deltaSeconds: 1,
      eligible: true,
      availability: ALL_AVAILABLE,
      random: sequenceRandom([0, rng(), rng()])
    });
    assert.equal(state.mode, "active");
    if (previousEvent !== null) {
      assert.notEqual(
        state.event,
        previousEvent,
        "two consecutive occurrences must never be the same event"
      );
    }
    started.push(state.event);
    previousEvent = state.event;
    state = completeAndCoolDown(state);
  }
  assert.ok(
    new Set(started).size >= 10,
    "a 60-event run should still visit most of the 13-event pool"
  );
});

test("a two-event pool alternates and a single-event pool may repeat", () => {
  const twoAvailable = Object.freeze({
    skyLayer: false,
    nebula: true,
    blackHole: true
  });
  let state = startNext(
    createObservatoryRareEventsState(),
    0.9,
    twoAvailable
  );
  const sequence = [state.event];
  for (let i = 0; i < 4; i += 1) {
    state = startNext(
      completeAndCoolDown(state, twoAvailable),
      0.9,
      twoAvailable
    );
    sequence.push(state.event);
  }
  for (let i = 1; i < sequence.length; i += 1) {
    assert.notEqual(
      sequence[i],
      sequence[i - 1],
      "a two-event pool must alternate rather than streak"
    );
  }

  // A fully collapsed pool (only the transit renderable) is allowed to
  // repeat — starving every event would be worse than a streak.
  const onlyTransit = Object.freeze({
    skyLayer: false,
    nebula: false,
    blackHole: true
  });
  let collapsed = startNext(
    createObservatoryRareEventsState(),
    0.5,
    onlyTransit
  );
  assert.equal(collapsed.event, "black-hole-transit");
  collapsed = startNext(
    completeAndCoolDown(collapsed, onlyTransit),
    0.5,
    onlyTransit
  );
  assert.equal(collapsed.event, "black-hole-transit");
});

test("recency memory survives idle, release and ineligible stretches", () => {
  let state = startNext(createObservatoryRareEventsState(), 0);
  const first = state.event;

  // Cancel mid-event (lights back on) → release → idle while ineligible.
  state = stepObservatoryRareEvents(state, {
    deltaSeconds: 1 / 60,
    eligible: false,
    availability: ALL_AVAILABLE,
    random: () => 0.999
  });
  assert.equal(state.mode, "release");
  assert.deepEqual(state.recentEvents, [first]);
  state = stepObservatoryRareEvents(state, {
    deltaSeconds: OBSERVATORY_RARE_EVENT_RELEASE_SECONDS + 1,
    eligible: false,
    availability: ALL_AVAILABLE,
    random: () => 0.999
  });
  assert.equal(state.mode, "idle");
  assert.deepEqual(state.recentEvents, [first]);

  // Cooldown out, then the next start still avoids the cancelled event.
  state = stepObservatoryRareEvents(state, {
    deltaSeconds: OBSERVATORY_RARE_EVENT_COOLDOWN_SECONDS + 1,
    eligible: true,
    availability: ALL_AVAILABLE,
    random: () => 0.999
  });
  state = startNext(state, 0);
  assert.notEqual(state.event, first);
});
