import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";

import {
  createObservatoryAudioDirectorState,
  stepObservatoryAudioDirector
} from "../observatory-audio.js";
import { OBSERVATORY_BLACK_HOLE_FLOW_PERIODS } from "../observatory-black-hole.js";

const AUDIO_FRAME_PRIORITY = -0.5;
const TWO_PI = Math.PI * 2;
const MASTER_LEVEL = 0.4;
const FAST_MUTE_TIME_CONSTANT = 0.018;
const NORMAL_SMOOTHING_TIME_CONSTANT = 0.035;
const AWAY_SUSPEND_DELAY_SECONDS = 0.75;
const DEFAULT_POSITION = Object.freeze({ x: 0, y: 0, z: 0 });
const LOOP_NOISE_OFFSETS_SECONDS = Object.freeze([
  0.37,
  1.91,
  3.43,
  5.08,
  6.74,
  8.29
]);

const LOOP_VOICE_SPECS = Object.freeze({
  room: Object.freeze({
    filterType: "lowpass",
    filterFrequency: 680,
    oscillatorFrequency: 112,
    oscillatorType: "sine",
    noiseLevel: 0.34,
    toneLevel: 0.28
  }),
  sky: Object.freeze({
    filterType: "bandpass",
    filterFrequency: 1850,
    oscillatorFrequency: 370,
    oscillatorType: "sine",
    noiseLevel: 0.52,
    toneLevel: 0.025
  }),
  rift: Object.freeze({
    filterType: "bandpass",
    filterFrequency: 920,
    oscillatorFrequency: 68,
    oscillatorType: "triangle",
    noiseLevel: 0.42,
    toneLevel: 0.24
  }),
  lensInner: Object.freeze({
    filterType: "bandpass",
    filterFrequency: 2550,
    oscillatorFrequency: 104,
    oscillatorType: "sine",
    noiseLevel: 0.46,
    toneLevel: 0.12
  }),
  lensMiddle: Object.freeze({
    filterType: "bandpass",
    filterFrequency: 1420,
    oscillatorFrequency: 69,
    oscillatorType: "sine",
    noiseLevel: 0.38,
    toneLevel: 0.18
  }),
  lensOuter: Object.freeze({
    filterType: "bandpass",
    filterFrequency: 720,
    oscillatorFrequency: 46,
    oscillatorType: "sine",
    noiseLevel: 0.3,
    toneLevel: 0.21
  })
});

const QUALITY_AUDIO_PRESETS = Object.freeze({
  high: Object.freeze({ wet: 0.17, spatialModel: "HRTF", lensScale: 1 }),
  medium: Object.freeze({ wet: 0.12, spatialModel: "HRTF", lensScale: 0.84 }),
  low: Object.freeze({ wet: 0, spatialModel: "HRTF", lensScale: 0.58 }),
  minimum: Object.freeze({ wet: 0, spatialModel: "equalpower", lensScale: 0.34 })
});

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, finite(value)));
}

function readPosition(value, fallback = DEFAULT_POSITION) {
  if (Array.isArray(value)) {
    return {
      x: finite(value[0], fallback.x),
      y: finite(value[1], fallback.y),
      z: finite(value[2], fallback.z)
    };
  }
  return {
    x: finite(value?.x, fallback.x),
    y: finite(value?.y, fallback.y),
    z: finite(value?.z, fallback.z)
  };
}

function setParamTarget(param, value, now, timeConstant = NORMAL_SMOOTHING_TIME_CONSTANT) {
  if (!param) return;
  const safeValue = finite(value);
  try {
    param.setTargetAtTime(safeValue, now, Math.max(0.001, timeConstant));
  } catch {
    try {
      param.value = safeValue;
    } catch {
      // A detached or browser-owned AudioParam may reject late writes.
    }
  }
}

function setParamValue(param, value, now) {
  if (!param) return;
  const safeValue = finite(value);
  try {
    param.setValueAtTime(safeValue, now);
  } catch {
    try {
      param.value = safeValue;
    } catch {
      // Fail soft on old Web Audio implementations.
    }
  }
}

function setPannerPosition(panner, position, now) {
  if (!panner) return;
  const safe = readPosition(position);
  if (panner.positionX) {
    setParamTarget(panner.positionX, safe.x, now, 0.02);
    setParamTarget(panner.positionY, safe.y, now, 0.02);
    setParamTarget(panner.positionZ, safe.z, now, 0.02);
    return;
  }
  try {
    panner.setPosition?.(safe.x, safe.y, safe.z);
  } catch {
    // A dry mono fallback is preferable to breaking the visual runtime.
  }
}

function setListenerPose(listener, position, forward, up, now) {
  if (!listener) return;
  if (listener.positionX) {
    setParamTarget(listener.positionX, position.x, now, 0.015);
    setParamTarget(listener.positionY, position.y, now, 0.015);
    setParamTarget(listener.positionZ, position.z, now, 0.015);
    setParamTarget(listener.forwardX, forward.x, now, 0.015);
    setParamTarget(listener.forwardY, forward.y, now, 0.015);
    setParamTarget(listener.forwardZ, forward.z, now, 0.015);
    setParamTarget(listener.upX, up.x, now, 0.015);
    setParamTarget(listener.upY, up.y, now, 0.015);
    setParamTarget(listener.upZ, up.z, now, 0.015);
    return;
  }
  try {
    listener.setPosition?.(position.x, position.y, position.z);
    listener.setOrientation?.(
      forward.x,
      forward.y,
      forward.z,
      up.x,
      up.y,
      up.z
    );
  } catch {
    // Legacy listener updates are best effort only.
  }
}

function safeDisconnect(node) {
  try {
    node?.disconnect?.();
  } catch {
    // Disconnect is not guaranteed idempotent in older Safari releases.
  }
}

function safeStop(node, when = 0) {
  try {
    node?.stop?.(when);
  } catch {
    // Already stopped or never started.
  }
}

function createDeterministicNoiseBuffer(context, seconds = 9.7) {
  const length = Math.max(1, Math.round(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x6d2b79f5;
  let previous = 0;
  for (let index = 0; index < data.length; index += 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const white = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    // Slightly correlated noise is less hissy than raw white noise while the
    // per-voice filters retain enough detail for diffraction-like motion.
    previous = previous * 0.58 + white * 0.42;
    data[index] = previous * 0.72;
  }
  // Cross-blend the final 80 ms into the buffer head. Every fixed carrier gets
  // a different deterministic offset below, and none exposes a hard loop seam.
  const blendLength = Math.min(
    data.length,
    Math.max(1, Math.round(context.sampleRate * 0.08))
  );
  const blendStart = data.length - blendLength;
  for (let index = 0; index < blendLength; index += 1) {
    const amount = (index + 1) / blendLength;
    data[blendStart + index] = data[blendStart + index] * (1 - amount)
      + data[index] * amount;
  }
  return buffer;
}

function createSyntheticImpulseResponse(context, seconds = 1.1) {
  const length = Math.max(1, Math.round(context.sampleRate * seconds));
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let seed = channel === 0 ? 0x9e3779b9 : 0x85ebca6b;
    let damped = 0;
    for (let index = 0; index < data.length; index += 1) {
      seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
      const white = ((seed >>> 0) / 0xffffffff) * 2 - 1;
      damped = damped * 0.72 + white * 0.28;
      const time = index / context.sampleRate;
      data[index] = damped * Math.exp(-6.1 * time) * 0.22;
    }
    // A few asymmetric early reflections make the generated response stereo
    // without relying on an external room impulse asset.
    for (const [milliseconds, amount] of [
      [17 + channel * 3, 0.18],
      [31 + channel * 5, -0.12],
      [49 + channel * 7, 0.085],
      [79 + channel * 11, 0.055]
    ]) {
      const sample = Math.min(length - 1, Math.round(milliseconds * context.sampleRate / 1000));
      data[sample] += amount;
    }
  }
  return buffer;
}

function createSpatialPanner(context, position, spatialModel = "HRTF") {
  const panner = context.createPanner();
  panner.panningModel = spatialModel;
  panner.distanceModel = "inverse";
  panner.refDistance = 7;
  panner.maxDistance = 96;
  panner.rolloffFactor = 0.32;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
  setPannerPosition(panner, position, context.currentTime);
  return panner;
}

function createLoopVoice(
  context,
  noiseBuffer,
  bus,
  spec,
  position,
  noiseOffsetSeconds
) {
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseGain = context.createGain();
  noiseGain.gain.value = spec.noiseLevel;

  const oscillator = context.createOscillator();
  oscillator.type = spec.oscillatorType;
  oscillator.frequency.value = spec.oscillatorFrequency;
  const toneGain = context.createGain();
  toneGain.gain.value = spec.toneLevel;

  const envelope = context.createGain();
  envelope.gain.value = 0;
  const filter = context.createBiquadFilter();
  filter.type = spec.filterType;
  filter.frequency.value = spec.filterFrequency;
  filter.Q.value = spec.filterType === "bandpass" ? 1.4 : 0.72;
  const panner = createSpatialPanner(context, position);

  noise.connect(noiseGain);
  noiseGain.connect(envelope);
  oscillator.connect(toneGain);
  toneGain.connect(envelope);
  envelope.connect(filter);
  filter.connect(panner);
  panner.connect(bus);
  noise.start(0, Math.max(0, finite(noiseOffsetSeconds)) % noiseBuffer.duration);
  oscillator.start();

  return {
    noise,
    noiseGain,
    oscillator,
    toneGain,
    envelope,
    filter,
    panner,
    nodes: [noise, noiseGain, oscillator, toneGain, envelope, filter, panner]
  };
}

function getAudioContextConstructor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? window.webkitAudioContext ?? null;
}

function createSilentEngine(reason = "unsupported") {
  return {
    supported: false,
    disposed: false,
    failure: reason,
    unlocked: false,
    unlockRequested: false,
    graphBuilds: 0,
    contextCount: 0,
    oneShots: new Set(),
    lastFrameCueKeys: new Set(),
    signalState: null,
    motionSeconds: 0
  };
}

function createProceduralAudioEngine(frame) {
  const ContextConstructor = getAudioContextConstructor();
  if (!ContextConstructor) return createSilentEngine("audio-context-unavailable");

  let context;
  try {
    context = new ContextConstructor({ latencyHint: "interactive" });
  } catch {
    try {
      context = new ContextConstructor();
    } catch {
      return createSilentEngine("audio-context-create-failed");
    }
  }

  try {
    const sourcePositions = frame?.sourcePositions ?? {};
    const switchPosition = readPosition(sourcePositions.switch);
    const riftPosition = readPosition(sourcePositions.rift, switchPosition);
    const lensPosition = readPosition(sourcePositions.lens, riftPosition);
    const noiseBuffer = createDeterministicNoiseBuffer(context);

    const mechanicalBus = context.createGain();
    const roomBus = context.createGain();
    const celestialBus = context.createGain();
    const wetSend = context.createGain();
    const wetReturn = context.createGain();
    const master = context.createGain();
    const highpass = context.createBiquadFilter();
    const limiter = context.createDynamicsCompressor();
    const output = context.createGain();

    mechanicalBus.gain.value = 1;
    roomBus.gain.value = 1;
    celestialBus.gain.value = 1;
    wetSend.gain.value = 0.12;
    wetReturn.gain.value = 1;
    master.gain.value = 0;
    highpass.type = "highpass";
    highpass.frequency.value = 28;
    limiter.threshold.value = -20;
    limiter.knee.value = 18;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.22;
    output.gain.value = MASTER_LEVEL;

    mechanicalBus.connect(master);
    roomBus.connect(master);
    celestialBus.connect(master);
    master.connect(highpass);
    highpass.connect(limiter);
    limiter.connect(output);
    output.connect(context.destination);

    let convolver = null;
    try {
      convolver = context.createConvolver();
      convolver.normalize = false;
      convolver.buffer = createSyntheticImpulseResponse(context);
      mechanicalBus.connect(wetSend);
      roomBus.connect(wetSend);
      celestialBus.connect(wetSend);
      wetSend.connect(convolver);
      convolver.connect(wetReturn);
      wetReturn.connect(master);
    } catch {
      convolver = null;
      wetSend.gain.value = 0;
    }

    const voices = {
      room: createLoopVoice(
        context,
        noiseBuffer,
        roomBus,
        LOOP_VOICE_SPECS.room,
        switchPosition,
        LOOP_NOISE_OFFSETS_SECONDS[0]
      ),
      sky: createLoopVoice(
        context,
        noiseBuffer,
        celestialBus,
        LOOP_VOICE_SPECS.sky,
        riftPosition,
        LOOP_NOISE_OFFSETS_SECONDS[1]
      ),
      rift: createLoopVoice(
        context,
        noiseBuffer,
        celestialBus,
        LOOP_VOICE_SPECS.rift,
        riftPosition,
        LOOP_NOISE_OFFSETS_SECONDS[2]
      ),
      lens: [
        createLoopVoice(
          context,
          noiseBuffer,
          celestialBus,
          LOOP_VOICE_SPECS.lensInner,
          lensPosition,
          LOOP_NOISE_OFFSETS_SECONDS[3]
        ),
        createLoopVoice(
          context,
          noiseBuffer,
          celestialBus,
          LOOP_VOICE_SPECS.lensMiddle,
          lensPosition,
          LOOP_NOISE_OFFSETS_SECONDS[4]
        ),
        createLoopVoice(
          context,
          noiseBuffer,
          celestialBus,
          LOOP_VOICE_SPECS.lensOuter,
          lensPosition,
          LOOP_NOISE_OFFSETS_SECONDS[5]
        )
      ]
    };

    return {
      supported: true,
      disposed: false,
      failure: null,
      context,
      noiseBuffer,
      voices,
      buses: { mechanicalBus, roomBus, celestialBus },
      wetSend,
      wetReturn,
      convolver,
      master,
      highpass,
      limiter,
      output,
      graphNodes: [
        mechanicalBus,
        roomBus,
        celestialBus,
        wetSend,
        wetReturn,
        convolver,
        master,
        highpass,
        limiter,
        output
      ].filter(Boolean),
      unlocked: context.state === "running",
      unlockRequested: false,
      graphBuilds: 1,
      contextCount: 1,
      oneShots: new Set(),
      lastFrameCueKeys: new Set(),
      signalState: null,
      motionSeconds: 0,
      spatialModel: "HRTF",
      lastTargets: { master: 0, room: 0, sky: 0, rift: 0, lens: 0 },
      sourceSnapshot: {
        switch: switchPosition,
        rift: riftPosition,
        lens: lensPosition,
        lensOrbit: []
      },
      lastQuality: null,
      awaySeconds: 0,
      suspendRequested: false,
      awaySuspended: false
    };
  } catch (error) {
    try {
      context.close?.();
    } catch {
      // Ignore a partial graph cleanup failure.
    }
    const silent = createSilentEngine("audio-graph-create-failed");
    silent.error = error instanceof Error ? error.message : String(error);
    return silent;
  }
}

function ensureEngineRunning(engine) {
  if (!engine?.supported || engine.disposed) return;
  engine.unlockRequested = true;
  if (engine.context.state === "running") {
    engine.unlocked = true;
    engine.suspendRequested = false;
    engine.awaySuspended = false;
    engine.awaySeconds = 0;
    return;
  }
  try {
    // A one-sample silent source helps older iOS WebKit unlock the output path
    // while remaining genuinely inaudible.
    if (!engine.unlockPrimed) {
      const silent = engine.context.createBufferSource();
      silent.buffer = engine.context.createBuffer(1, 1, engine.context.sampleRate);
      const silentGain = engine.context.createGain();
      silentGain.gain.value = 0;
      silent.connect(silentGain);
      silentGain.connect(engine.context.destination);
      silent.start();
      silent.onended = () => {
        safeDisconnect(silent);
        safeDisconnect(silentGain);
      };
      engine.unlockPrimed = true;
    }
    const result = engine.context.resume?.();
    Promise.resolve(result).then(() => {
      if (!engine.disposed) {
        engine.unlocked = engine.context.state === "running";
        if (engine.unlocked) {
          engine.suspendRequested = false;
          engine.awaySuspended = false;
          engine.awaySeconds = 0;
        }
      }
    }).catch(() => {
      // Safari may remain interrupted until the next trusted gesture.
    });
    engine.unlocked = engine.context.state === "running" || engine.unlocked;
  } catch {
    // Retry on the next trusted gesture; visuals remain fully independent.
  }
}

function fastMuteEngine(engine) {
  if (!engine?.supported || engine.disposed) return;
  setParamTarget(
    engine.master.gain,
    0,
    engine.context.currentTime,
    FAST_MUTE_TIME_CONSTANT
  );
  engine.lastTargets.master = 0;
  // A suspended AudioContext freezes finite cue time. Stop those sources now
  // so an old detent/sweep tail cannot reappear when a hidden tab, muted game,
  // or distant player later resumes the already-unlocked context.
  for (const oneShot of engine.oneShots) disposeOneShot(oneShot);
  engine.oneShots.clear();
}

function updateProximitySuspension(engine, frame, deltaSeconds, canResume = true) {
  if (!engine?.supported || engine.disposed) return;
  const nearAudioZone = frame?.inLoft === true || frame?.nearObservatory === true;
  if (nearAudioZone) {
    engine.awaySeconds = 0;
    if (engine.context.state === "running") {
      engine.suspendRequested = false;
      engine.awaySuspended = false;
    } else if (
      canResume
      && engine.unlockRequested
      && (engine.awaySuspended || engine.suspendRequested)
    ) {
      // This context was suspended by our own proximity policy after a prior
      // trusted unlock. Re-entering the observatory should restore it without
      // forcing the visitor to discover that another arbitrary key press is
      // required. Browsers that still demand activation fail softly and the
      // next trusted gesture retries ensureEngineRunning.
      ensureEngineRunning(engine);
    }
    return;
  }

  engine.awaySeconds += Math.max(0, finite(deltaSeconds));
  fastMuteEngine(engine);
  if (
    engine.awaySeconds < AWAY_SUSPEND_DELAY_SECONDS
    || engine.suspendRequested
    || engine.context.state !== "running"
  ) {
    return;
  }

  engine.suspendRequested = true;
  try {
    const suspending = engine.context.suspend?.();
    Promise.resolve(suspending).then(() => {
      if (!engine.disposed) engine.awaySuspended = true;
    }).catch(() => {
      if (!engine.disposed) engine.suspendRequested = false;
    });
  } catch {
    engine.suspendRequested = false;
  }
}

function disposeOneShot(oneShot) {
  if (!oneShot || oneShot.disposed) return;
  oneShot.disposed = true;
  safeStop(oneShot.tone);
  safeStop(oneShot.noise);
  for (const node of oneShot.nodes) safeDisconnect(node);
}

function disposeAudioEngine(engine) {
  if (!engine || engine.disposed) return;
  if (!engine.supported) {
    engine.disposed = true;
    return;
  }

  fastMuteEngine(engine);
  engine.disposed = true;
  for (const oneShot of engine.oneShots) disposeOneShot(oneShot);
  engine.oneShots.clear();
  const loopVoices = [
    engine.voices.room,
    engine.voices.sky,
    engine.voices.rift,
    ...engine.voices.lens
  ];
  for (const voice of loopVoices) {
    safeStop(voice.noise);
    safeStop(voice.oscillator);
    for (const node of voice.nodes) safeDisconnect(node);
  }
  for (const node of engine.graphNodes) safeDisconnect(node);
  try {
    const closing = engine.context.close?.();
    closing?.catch?.(() => {});
  } catch {
    // Closing an already-closed context is harmless.
  }
}

function cueName(cue) {
  if (typeof cue === "string") return cue;
  return String(cue?.type ?? cue?.kind ?? cue?.name ?? cue?.id ?? "cue");
}

function cuePositionFor(name, sourcePositions) {
  if (/switch|light|room/i.test(name)) return sourcePositions.switch;
  if (/lens|black.?hole/i.test(name)) return sourcePositions.lens;
  return sourcePositions.rift;
}

function cueToneSpec(name) {
  if (/switch/i.test(name)) {
    return { duration: 0.085, from: 980, to: 210, peak: 0.07, type: "triangle", noise: 0.018 };
  }
  if (/light.*on|relight|restore/i.test(name)) {
    return { duration: 0.52, from: 92, to: 185, peak: 0.032, type: "sine", noise: 0.009 };
  }
  if (/light.*off|dark/i.test(name)) {
    return { duration: 0.84, from: 132, to: 54, peak: 0.034, type: "sine", noise: 0.012 };
  }
  if (/rift.*close|rift.*off|collapse/i.test(name)) {
    return { duration: 0.62, from: 72, to: 245, peak: 0.035, type: "triangle", noise: 0.014 };
  }
  if (/rift/i.test(name)) {
    return { duration: 0.9, from: 118, to: 48, peak: 0.038, type: "triangle", noise: 0.016 };
  }
  if (/lens.*close|lens.*off|black.*off/i.test(name)) {
    return { duration: 0.58, from: 82, to: 210, peak: 0.032, type: "sine", noise: 0.012 };
  }
  return { duration: 1.05, from: 48, to: 86, peak: 0.04, type: "sine", noise: 0.014 };
}

function playProceduralCue(engine, cue, sourcePositions) {
  if (!engine?.supported || engine.disposed || !engine.unlocked) return;
  const name = cueName(cue);
  const spec = cueToneSpec(name);
  const context = engine.context;
  const now = context.currentTime + 0.008;
  const end = now + spec.duration;

  try {
    const tone = context.createOscillator();
    tone.type = spec.type;
    setParamValue(tone.frequency, spec.from, now);
    try {
      tone.frequency.exponentialRampToValueAtTime(Math.max(20, spec.to), end);
    } catch {
      setParamValue(tone.frequency, spec.to, end);
    }
    const noise = context.createBufferSource();
    noise.buffer = engine.noiseBuffer;
    const toneGain = context.createGain();
    const noiseGain = context.createGain();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const panner = createSpatialPanner(
      context,
      cuePositionFor(name, sourcePositions),
      engine.spatialModel
    );

    toneGain.gain.value = 1;
    noiseGain.gain.value = spec.noise;
    filter.type = /switch/i.test(name) ? "highpass" : "lowpass";
    filter.frequency.value = /switch/i.test(name) ? 680 : 1900;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(spec.peak, now + Math.min(0.045, spec.duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    tone.connect(toneGain);
    toneGain.connect(envelope);
    noise.connect(noiseGain);
    noiseGain.connect(envelope);
    envelope.connect(filter);
    filter.connect(panner);
    panner.connect(/switch|light|room/i.test(name)
      ? engine.buses.mechanicalBus
      : engine.buses.celestialBus);

    const oneShot = {
      tone,
      noise,
      nodes: [tone, noise, toneGain, noiseGain, envelope, filter, panner],
      disposed: false
    };
    engine.oneShots.add(oneShot);
    const finish = () => {
      disposeOneShot(oneShot);
      engine.oneShots.delete(oneShot);
    };
    tone.onended = finish;
    tone.start(now);
    noise.start(now, 0, spec.duration);
    tone.stop(end + 0.02);
    noise.stop(end + 0.02);
  } catch {
    // One failed cue must not silence later cues or affect rendering.
  }
}

function readDirectorCues(state) {
  const ownsCueList = Object.prototype.hasOwnProperty.call(state ?? {}, "cues")
    || Object.prototype.hasOwnProperty.call(state ?? {}, "events");
  const value = state?.cues ?? state?.events;
  if (Array.isArray(value)) return { ownsCueList, cues: value };
  return { ownsCueList, cues: value ? [value] : [] };
}

function deriveFallbackCues(engine, frame) {
  const houseLight = clamp01(frame?.adaptationChannels?.houseLight ?? 1);
  const riftTarget = Boolean(frame?.riftState?.targetOpen);
  const lensAmount = clamp01(frame?.lensAmount);
  const prior = engine.signalState;
  engine.signalState = { houseLight, riftTarget, lensAmount };
  if (!prior) return [];

  const cues = [];
  if (prior.houseLight > 0.98 && houseLight < 0.98) cues.push("lights-off");
  if (prior.houseLight < 0.02 && houseLight > 0.02) cues.push("lights-on");
  if (prior.riftTarget !== riftTarget) cues.push(riftTarget ? "rift-open" : "rift-close");
  const lensDelta = lensAmount - prior.lensAmount;
  const priorDelta = finite(engine.lastLensDelta);
  if (lensDelta > 0.0005 && priorDelta <= 0.0005) cues.push("lens-open");
  if (lensDelta < -0.0005 && priorDelta >= -0.0005) cues.push("lens-close");
  engine.lastLensDelta = lensDelta;
  return cues;
}

function readChannel(source, names, fallback = 0) {
  for (const name of names) {
    if (Number.isFinite(source?.[name])) return clamp01(source[name]);
  }
  return clamp01(fallback);
}

function deriveAudioTargets(directorState, frame) {
  const hasCanonicalMix = Boolean(directorState?.mix);
  const channels = directorState?.mix
    ?? directorState?.channels
    ?? directorState?.gains
    ?? directorState?.targets
    ?? {};
  const adaptation = frame?.adaptationChannels ?? {};
  const houseLight = clamp01(adaptation.houseLight ?? 1);
  const scotopic = clamp01(adaptation.scotopicAdaptation);
  const portalReveal = clamp01(adaptation.portalReveal);
  const riftChannels = frame?.riftState?.channels ?? {};
  const lensAmount = clamp01(frame?.lensAmount);
  const fallbackRoom = 4 * houseLight * (1 - houseLight);
  const fallbackSky = portalReveal * (1 - scotopic);
  const fallbackRift = clamp01(riftChannels.ringIntensity);
  const fallbackLens = 4 * lensAmount * (1 - lensAmount);

  const cosmosAir = readChannel(channels, ["cosmosAir"]);
  const starAir = readChannel(channels, ["starAir"]);
  const riftSweepGain = readChannel(channels, ["riftSweep"]);
  const riftBed = readChannel(channels, ["riftBed"]);
  const lensDrone = readChannel(channels, ["lensDrone"]);
  const lensFlow = readChannel(channels, ["lensFlow"]);

  return {
    master: readChannel(channels, ["master", "masterGain", "audibility"], 1),
    room: hasCanonicalMix
      ? readChannel(channels, ["roomTone"])
      : readChannel(
        channels,
        ["room", "roomGain", "roomTransition", "housePower"],
        fallbackRoom
      ),
    sky: hasCanonicalMix
      ? Math.max(cosmosAir, starAir)
      : readChannel(
        channels,
        ["sky", "skyGain", "starReveal", "cosmos", "cosmosGain"],
        fallbackSky
      ),
    rift: hasCanonicalMix
      ? Math.max(riftSweepGain, riftBed)
      : readChannel(
        channels,
        ["rift", "riftGain", "riftTransition", "riftFlow"],
        fallbackRift
      ),
    lens: hasCanonicalMix
      ? Math.max(lensDrone, lensFlow)
      : readChannel(
        channels,
        ["lens", "lensGain", "blackHole", "blackHoleGain"],
        fallbackLens
      ),
    // Spatial travel follows the real reversible visual progress; mix.riftSweep
    // is an amplitude envelope and deliberately peaks/fades within that path.
    riftSweep: clamp01(
      frame?.riftState?.transitionProgress
      ?? frame?.riftState?.channels?.apertureExpansion
    ),
    // Prefer the renderer's real celestial clock when it is present. The
    // local fallback advances only the inaudible spatial carrier and freezes
    // under reduced motion; it never controls a visual or reveal timeline.
    motionSeconds: [
      frame?.celestialTime,
      frame?.celestialTimeSeconds,
      frame?.visualElapsedSeconds,
      frame?.blackHoleTimeSeconds,
      directorState?.motionSeconds
    ].find(Number.isFinite) ?? null
  };
}

function qualityPreset(quality) {
  return QUALITY_AUDIO_PRESETS[String(quality ?? "medium").toLowerCase()]
    ?? QUALITY_AUDIO_PRESETS.medium;
}

function updateQuality(engine, quality, now) {
  const qualityId = String(quality ?? "medium").toLowerCase();
  const preset = qualityPreset(qualityId);
  if (engine.lastQuality === qualityId) return preset;
  engine.lastQuality = qualityId;
  engine.spatialModel = preset.spatialModel;
  setParamTarget(engine.wetSend.gain, engine.convolver ? preset.wet : 0, now, 0.08);
  const panners = [
    engine.voices.room.panner,
    engine.voices.sky.panner,
    engine.voices.rift.panner,
    ...engine.voices.lens.map((voice) => voice.panner)
  ];
  for (const panner of panners) {
    try {
      panner.panningModel = preset.spatialModel;
    } catch {
      // Some engines make panningModel effectively construction-only.
    }
  }
  return preset;
}

function updateSourcePositions(engine, frame, targets, deltaSeconds) {
  const context = engine.context;
  const now = context.currentTime;
  const sources = frame?.sourcePositions ?? {};
  const switchPosition = readPosition(sources.switch, engine.sourceSnapshot.switch);
  const riftOrigin = readPosition(sources.rift, engine.sourceSnapshot.rift);
  const lensOrigin = readPosition(sources.lens, engine.sourceSnapshot.lens);
  const reducedMotion = Boolean(frame?.reducedMotion);
  if (!reducedMotion) engine.motionSeconds += Math.max(0, finite(deltaSeconds));
  const motionSeconds = targets.motionSeconds ?? engine.motionSeconds;

  setPannerPosition(engine.voices.room.panner, switchPosition, now);
  setPannerPosition(engine.voices.sky.panner, {
    x: riftOrigin.x,
    y: riftOrigin.y + 4.8,
    z: riftOrigin.z
  }, now);

  const riftAngle = reducedMotion
    ? Math.PI * 0.28
    : motionSeconds / OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.middle * TWO_PI
      + targets.riftSweep * Math.PI;
  const riftRadius = 2.2 + targets.riftSweep * 4.5;
  const riftPosition = {
    x: riftOrigin.x + Math.cos(riftAngle) * riftRadius,
    y: riftOrigin.y + 1.4 + targets.riftSweep * 4.2,
    z: riftOrigin.z + Math.sin(riftAngle) * riftRadius
  };
  setPannerPosition(engine.voices.rift.panner, riftPosition, now);

  const periods = [
    OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.inner,
    OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.middle,
    OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.outer
  ];
  const radii = [1.8, 3.5, 5.4];
  const lensOrbit = engine.voices.lens.map((voice, index) => {
    const phase = index * TWO_PI / 3;
    const angle = reducedMotion
      ? phase
      : phase + motionSeconds / periods[index] * TWO_PI;
    const position = {
      x: lensOrigin.x + Math.cos(angle) * radii[index],
      y: lensOrigin.y + Math.sin(angle * 0.53 + phase) * (0.42 + index * 0.22),
      z: lensOrigin.z + Math.sin(angle) * radii[index]
    };
    setPannerPosition(voice.panner, position, now);
    return position;
  });

  engine.sourceSnapshot = {
    switch: switchPosition,
    rift: riftPosition,
    lens: lensOrigin,
    lensOrbit
  };
}

function applyAudioFrame(engine, directorState, frame, deltaSeconds, active) {
  if (!engine?.supported || engine.disposed) return;
  const context = engine.context;
  const now = context.currentTime;
  const targets = deriveAudioTargets(directorState, frame);
  const preset = updateQuality(engine, frame?.quality, now);
  updateSourcePositions(engine, frame, targets, deltaSeconds);

  const masterTarget = active ? targets.master : 0;
  setParamTarget(
    engine.master.gain,
    masterTarget,
    now,
    active ? NORMAL_SMOOTHING_TIME_CONSTANT : FAST_MUTE_TIME_CONSTANT
  );
  setParamTarget(engine.voices.room.envelope.gain, active ? targets.room * 0.04 : 0, now);
  setParamTarget(engine.voices.sky.envelope.gain, active ? targets.sky * 0.026 : 0, now);
  setParamTarget(engine.voices.rift.envelope.gain, active ? targets.rift * 0.052 : 0, now);
  const lensWeights = [0.46, 0.62, 0.38];
  engine.voices.lens.forEach((voice, index) => {
    setParamTarget(
      voice.envelope.gain,
      active ? targets.lens * preset.lensScale * lensWeights[index] * 0.045 : 0,
      now
    );
  });

  setParamTarget(engine.voices.room.filter.frequency, 260 + targets.room * 880, now, 0.06);
  setParamTarget(engine.voices.sky.filter.frequency, 1100 + targets.sky * 3100, now, 0.06);
  setParamTarget(engine.voices.rift.filter.frequency, 420 + targets.riftSweep * 2800, now, 0.045);
  setParamTarget(engine.voices.rift.oscillator.frequency, 52 + targets.rift * 46, now, 0.06);
  setParamTarget(engine.voices.lens[0].filter.frequency, 1900 + targets.lens * 2500, now, 0.05);
  setParamTarget(engine.voices.lens[1].filter.frequency, 980 + targets.lens * 1700, now, 0.05);
  setParamTarget(engine.voices.lens[2].filter.frequency, 520 + targets.lens * 920, now, 0.05);

  engine.lastTargets = {
    master: masterTarget,
    room: active ? targets.room : 0,
    sky: active ? targets.sky : 0,
    rift: active ? targets.rift : 0,
    lens: active ? targets.lens : 0
  };
}

function writeAudioDiagnostics(audioFrameRef, diagnostics) {
  const frame = audioFrameRef?.current;
  if (!frame || typeof frame !== "object") return;
  try {
    frame.audio = diagnostics;
  } catch {
    // Diagnostics are informative only; a frozen host snapshot is valid.
  }
}

function buildDiagnostics(
  engine,
  frame,
  directorState,
  active,
  pageVisible,
  webglAvailable,
  requestedMuted
) {
  const ContextConstructor = getAudioContextConstructor();
  const muteReason = requestedMuted
    ? "user"
    : !pageVisible
      ? "page-hidden"
      : !webglAvailable
        ? "webgl-context"
        : frame?.inLoft !== true
          ? "outside-loft"
          : frame?.runtimeAvailable === false
            ? "runtime-unavailable"
            : engine && !engine.supported
              ? "unsupported"
              : !engine?.unlocked
                ? "locked"
                : engine?.context?.state !== "running"
                  ? "context-suspended"
                  : null;
  return {
    supported: engine ? Boolean(engine.supported) : Boolean(ContextConstructor),
    contextState: engine?.supported ? engine.context.state : "uninitialized",
    unlocked: Boolean(engine?.unlocked),
    unlockRequested: Boolean(engine?.unlockRequested),
    muted: Boolean(requestedMuted),
    muteReason,
    active: Boolean(active),
    pageVisible: Boolean(pageVisible),
    webglAvailable: Boolean(webglAvailable),
    quality: frame?.quality ?? "unknown",
    reducedMotion: Boolean(frame?.reducedMotion),
    spatialModel: engine?.spatialModel ?? null,
    graphBuilds: engine?.graphBuilds ?? 0,
    contextCount: engine?.contextCount ?? 0,
    activeOneShots: engine?.oneShots?.size ?? 0,
    targets: engine?.lastTargets ?? {
      master: 0,
      room: 0,
      sky: 0,
      rift: 0,
      lens: 0
    },
    listener: engine?.listenerSnapshot ?? null,
    sources: engine?.sourceSnapshot ?? frame?.sourcePositions ?? null,
    director: directorState?.diagnostics ?? null,
    failure: engine?.failure ?? null
  };
}

export function MushroomObservatoryAudio({ audioFrameRef, muted = false }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const engineRef = useRef(null);
  const directorRef = useRef(null);
  const disposedRef = useRef(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const pageVisibleRef = useRef(
    typeof document === "undefined" ? true : document.visibilityState !== "hidden"
  );
  const webglAvailableRef = useRef(true);
  const scratchRef = useRef({
    position: new Vector3(),
    forward: new Vector3(),
    up: new Vector3()
  });
  if (!directorRef.current) {
    directorRef.current = createObservatoryAudioDirectorState();
  }

  useEffect(() => {
    disposedRef.current = false;

    const unlockFromTrustedGesture = (event) => {
      // `isTrusted` covers ordinary pointer/keyboard input. A few browser
      // accessibility bridges dispatch the semantic click differently while
      // still exposing a live User Activation; accepting that browser-owned
      // signal does not let script-generated clicks bypass autoplay policy.
      const hasLiveUserActivation = event?.isTrusted
        || globalThis.navigator?.userActivation?.isActive === true;
      if (!hasLiveUserActivation || event.repeat || disposedRef.current) return;
      const frame = audioFrameRef?.current;
      if (frame?.inLoft !== true && frame?.nearObservatory !== true) return;
      const needsRebaseline = !engineRef.current?.unlocked
        || engineRef.current?.context?.state !== "running";
      if (!engineRef.current) {
        engineRef.current = createProceduralAudioEngine(frame);
      }
      ensureEngineRunning(engineRef.current);
      if (needsRebaseline) {
        // Capture the pre-key visual state during the gesture's capture phase.
        // If this same E/R/F press changes React state later in the event, the
        // next rendered snapshot still emits its tactile edge exactly once.
        directorRef.current = createObservatoryAudioDirectorState({
          adaptationMode: frame.adaptationMode,
          adaptationChannels: frame.adaptationChannels,
          riftState: frame.riftState,
          riftChannels: frame.riftState?.channels ?? frame.riftChannels,
          lensAmount: frame.lensAmount,
          blackHoleReveal: frame.blackHoleReveal,
          inLoft: frame.inLoft,
          visualAvailable: frame.visualAvailable,
          runtimeAvailable: frame.runtimeAvailable,
          pageVisible: pageVisibleRef.current,
          userActivated: true,
          muted: Boolean(mutedRef.current),
          reducedMotion: Boolean(frame.reducedMotion)
        });
      }
    };
    const handleVisibility = () => {
      pageVisibleRef.current = document.visibilityState !== "hidden";
      if (!pageVisibleRef.current) {
        fastMuteEngine(engineRef.current);
        try {
          const suspending = engineRef.current?.context?.suspend?.();
          suspending?.catch?.(() => {});
        } catch {
          // Resume is retried only on the next trusted gesture.
        }
      } else if (
        engineRef.current?.unlockRequested
        && (
          audioFrameRef?.current?.inLoft === true
          || audioFrameRef?.current?.nearObservatory === true
        )
      ) {
        // Returning to a tab is allowed to resume a context that this visitor
        // already unlocked. If the browser still requires activation the
        // promise simply stays suspended and the next gesture retries it.
        ensureEngineRunning(engineRef.current);
      }
    };
    const handleContextLost = () => {
      webglAvailableRef.current = false;
      fastMuteEngine(engineRef.current);
    };
    const handleContextRestored = () => {
      webglAvailableRef.current = true;
    };

    document.addEventListener("pointerdown", unlockFromTrustedGesture, true);
    // Keyboard-activated buttons and some assistive technologies emit a
    // trusted click without a preceding PointerEvent. The same idempotent
    // path keeps those visitors inside the browser's activation allowance.
    document.addEventListener("click", unlockFromTrustedGesture, true);
    document.addEventListener("keydown", unlockFromTrustedGesture, true);
    document.addEventListener("visibilitychange", handleVisibility);
    gl.domElement.addEventListener("webglcontextlost", handleContextLost);
    gl.domElement.addEventListener("webglcontextrestored", handleContextRestored);

    return () => {
      disposedRef.current = true;
      document.removeEventListener("pointerdown", unlockFromTrustedGesture, true);
      document.removeEventListener("click", unlockFromTrustedGesture, true);
      document.removeEventListener("keydown", unlockFromTrustedGesture, true);
      document.removeEventListener("visibilitychange", handleVisibility);
      gl.domElement.removeEventListener("webglcontextlost", handleContextLost);
      gl.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
      disposeAudioEngine(engineRef.current);
      engineRef.current = null;
    };
  }, [audioFrameRef, gl]);

  // Deterministic QA uses frameloop="never", so a React M-key update may not
  // be followed by a render frame. User mute must still cut the graph now.
  useEffect(() => {
    if (muted) fastMuteEngine(engineRef.current);
  }, [muted]);

  useFrame((_, delta) => {
    const frame = audioFrameRef?.current;
    if (!frame || typeof frame !== "object") return;
    const safeDelta = Math.min(0.1, Math.max(0, finite(delta)));
    const engine = engineRef.current;
    updateProximitySuspension(
      engine,
      frame,
      safeDelta,
      pageVisibleRef.current
        && webglAvailableRef.current
        && !muted
        && frame.runtimeAvailable !== false
    );
    const contextRunning = engine?.supported && engine.context.state === "running";
    if (contextRunning) engine.unlocked = true;

    try {
      directorRef.current = stepObservatoryAudioDirector(directorRef.current, {
        deltaSeconds: safeDelta,
        adaptationMode: frame.adaptationMode,
        adaptationChannels: frame.adaptationChannels,
        riftState: frame.riftState,
        riftChannels: frame.riftState?.channels ?? frame.riftChannels,
        lensAmount: frame.lensAmount,
        blackHoleReveal: frame.blackHoleReveal,
        inLoft: frame.inLoft,
        visualAvailable: frame.visualAvailable,
        runtimeAvailable: frame.runtimeAvailable,
        muted: Boolean(muted),
        pageVisible: pageVisibleRef.current,
        userActivated: Boolean(engine?.unlocked && contextRunning),
        reducedMotion: Boolean(frame.reducedMotion)
      });
    } catch (error) {
      if (engine) {
        engine.failure = engine.failure ?? (
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // The tactile switch and 0-0.9 s room power-down must remain audible before
    // the cosmos becomes visually available at the 0.38 s Portal delay.
    // The pure director gates sky/R/F buses with visualAvailable; this outer
    // lifecycle gate only fail-closes the whole graph when the runtime does.
    const runtimeActive = frame.inLoft === true
      && frame.runtimeAvailable !== false;
    const active = Boolean(
      engine?.supported
      && engine.unlocked
      && contextRunning
      && !muted
      && pageVisibleRef.current
      && webglAvailableRef.current
      && runtimeActive
    );

    if (engine?.supported) {
      const scratch = scratchRef.current;
      camera.getWorldPosition(scratch.position);
      camera.getWorldDirection(scratch.forward).normalize();
      scratch.up.copy(camera.up).applyQuaternion(camera.quaternion).normalize();
      setListenerPose(
        engine.context.listener,
        scratch.position,
        scratch.forward,
        scratch.up,
        engine.context.currentTime
      );
      engine.listenerSnapshot = {
        position: {
          x: scratch.position.x,
          y: scratch.position.y,
          z: scratch.position.z
        },
        forward: {
          x: scratch.forward.x,
          y: scratch.forward.y,
          z: scratch.forward.z
        },
        up: { x: scratch.up.x, y: scratch.up.y, z: scratch.up.z }
      };

      applyAudioFrame(engine, directorRef.current, frame, safeDelta, active);
      const directorCues = readDirectorCues(directorRef.current);
      const cues = directorCues.ownsCueList
        ? directorCues.cues
        : deriveFallbackCues(engine, frame);
      const currentCueKeys = new Set();
      let playedSwitchDetent = false;
      for (const cue of cues) {
        const name = cueName(cue);
        const serial = typeof cue === "object"
          ? cue.serial ?? cue.sequence ?? cue.token ?? ""
          : "";
        const key = `${name}:${serial}`;
        currentCueKeys.add(key);
        if (active && !engine.lastFrameCueKeys.has(key)) {
          if (!playedSwitchDetent && /light|rift|lens/i.test(name)) {
            playProceduralCue(engine, "switch-detent", engine.sourceSnapshot);
            playedSwitchDetent = true;
          }
          playProceduralCue(engine, cue, engine.sourceSnapshot);
        }
      }
      engine.lastFrameCueKeys = currentCueKeys;
      if (!active) fastMuteEngine(engine);
    }

    writeAudioDiagnostics(
      audioFrameRef,
      buildDiagnostics(
        engine,
        frame,
        directorRef.current,
        active,
        pageVisibleRef.current,
        webglAvailableRef.current,
        muted
      )
    );
  }, AUDIO_FRAME_PRIORITY);

  return null;
}
