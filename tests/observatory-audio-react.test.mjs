import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createObservatoryAudioDirectorState,
  stepObservatoryAudioDirector
} from "../src/villa-map/observatory-audio.js";

const source = readFileSync(fileURLToPath(new URL(
  "../src/villa-map/react/MushroomObservatoryAudio.jsx",
  import.meta.url
)), "utf8");

test("the React bridge consumes the node-pure director and the actual runtime frame", () => {
  assert.match(source, /createObservatoryAudioDirectorState/);
  assert.match(source, /stepObservatoryAudioDirector/);
  assert.match(
    source,
    /export function MushroomObservatoryAudio\(\{ audioFrameRef, muted = false \}\)/
  );
  assert.match(source, /useFrame\(\(_, delta\) => \{/);
  assert.match(source, /\}, AUDIO_FRAME_PRIORITY\)/);
  assert.match(source, /const AUDIO_FRAME_PRIORITY = -0\.5/);
  assert.match(source, /adaptationMode: frame\.adaptationMode/);
  assert.match(source, /adaptationChannels: frame\.adaptationChannels/);
  assert.match(source, /riftState: frame\.riftState/);
  assert.match(source, /riftChannels: frame\.riftState\?\.channels \?\? frame\.riftChannels/);
  assert.match(source, /lensAmount: frame\.lensAmount/);
  assert.match(source, /blackHoleReveal: frame\.blackHoleReveal/);
  assert.match(source, /visualAvailable: frame\.visualAvailable/);
  assert.match(source, /runtimeAvailable: frame\.runtimeAvailable/);
  assert.match(source, /const channels = directorState\?\.mix/);
  assert.match(source, /state\?\.cues \?\? state\?\.events/);
});

test("the director factory remains node-pure, finite and compatible with the bridge", () => {
  const initial = createObservatoryAudioDirectorState();
  assert.ok(initial && typeof initial === "object");
  assert.ok(initial.mix && typeof initial.mix === "object");
  assert.ok(Array.isArray(initial.events));

  const next = stepObservatoryAudioDirector(initial, {
    deltaSeconds: 0.25,
    adaptationMode: "darkening",
    adaptationChannels: {
      houseLight: 0.72,
      roomDarkness: 0.28,
      portalReveal: 0,
      brightStarReveal: 0,
      scotopicAdaptation: 0,
      nebulaReveal: 0,
      faintStarReveal: 0
    },
    riftState: {
      targetOpen: false,
      mode: "closed",
      transitionProgress: 0,
      channels: { ringIntensity: 0, foregroundDepth: 0 }
    },
    riftChannels: { ringIntensity: 0, foregroundDepth: 0 },
    lensAmount: 0,
    blackHoleReveal: 0,
    inLoft: true,
    visualAvailable: false,
    runtimeAvailable: true,
    pageVisible: true,
    userActivated: true,
    muted: false,
    reducedMotion: false
  });

  assert.ok(next && typeof next === "object");
  assert.ok(next.mix && typeof next.mix === "object");
  assert.ok(Array.isArray(next.events));
  for (const value of Object.values(next.mix)) {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0 && value <= 1);
  }
  assert.equal(next.mix.master, 1);
  assert.ok(next.mix.roomTone > 0);
  for (const key of [
    "cosmosAir",
    "starAir",
    "riftSweep",
    "riftBed",
    "lensDrone",
    "lensFlow"
  ]) {
    assert.equal(next.mix[key], 0);
  }
});

test("AudioContext construction is lazy and requires a trusted gesture", () => {
  assert.match(source, /function getAudioContextConstructor\(\)/);
  assert.match(source, /const unlockFromTrustedGesture = \(event\) => \{/);
  assert.match(
    source,
    /const hasLiveUserActivation = event\?\.isTrusted\s*\|\| globalThis\.navigator\?\.userActivation\?\.isActive === true/
  );
  assert.match(
    source,
    /if \(!hasLiveUserActivation \|\| event\.repeat \|\| disposedRef\.current\) return/
  );
  assert.match(
    source,
    /if \(frame\?\.inLoft !== true && frame\?\.nearObservatory !== true\) return/
  );
  assert.match(
    source,
    /if \(!engineRef\.current\) \{\s*engineRef\.current = createProceduralAudioEngine\(frame\)/
  );
  assert.match(source, /ensureEngineRunning\(engineRef\.current\)/);
  assert.match(source, /document\.addEventListener\("pointerdown", unlockFromTrustedGesture, true\)/);
  assert.match(source, /document\.addEventListener\("click", unlockFromTrustedGesture, true\)/);
  assert.match(source, /document\.addEventListener\("keydown", unlockFromTrustedGesture, true\)/);
  assert.doesNotMatch(source, /new AudioContext\s*\(/);
  assert.doesNotMatch(source, /new webkitAudioContext\s*\(/);
});

test("one fixed procedural graph supplies HRTF loops and a shared limiter", () => {
  assert.match(source, /function createDeterministicNoiseBuffer\(/);
  assert.match(source, /seconds = 9\.7/);
  assert.match(source, /context\.sampleRate \* 0\.08/);
  assert.match(source, /LOOP_NOISE_OFFSETS_SECONDS = Object\.freeze\(\[/);
  for (const offset of ["0.37", "1.91", "3.43", "5.08", "6.74", "8.29"]) {
    assert.match(source, new RegExp(offset.replace(".", "\\.")));
  }
  assert.match(
    source,
    /noise\.start\(0, Math\.max\(0, finite\(noiseOffsetSeconds\)\) % noiseBuffer\.duration\)/
  );
  assert.match(source, /function createSyntheticImpulseResponse\(/);
  assert.match(source, /context\.createBufferSource\(\)/);
  assert.match(source, /noise\.loop = true/);
  assert.match(source, /context\.createOscillator\(\)/);
  assert.match(source, /context\.createBiquadFilter\(\)/);
  assert.match(source, /context\.createPanner\(\)/);
  assert.match(source, /panner\.panningModel = spatialModel/);
  assert.match(source, /spatialModel: "HRTF"/);
  assert.match(source, /context\.createConvolver\(\)/);
  assert.match(source, /context\.createDynamicsCompressor\(\)/);
  assert.match(source, /limiter\.threshold\.value = -20/);
  assert.match(source, /graphBuilds: 1/);
  assert.match(source, /contextCount: 1/);
  assert.match(source, /if \(engine\.lastQuality === qualityId\) return preset/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /new Audio\s*\(/);
});

test("listener and fixed spatial carriers follow the camera and real source positions", () => {
  assert.match(source, /camera\.getWorldPosition\(scratch\.position\)/);
  assert.match(source, /camera\.getWorldDirection\(scratch\.forward\)\.normalize\(\)/);
  assert.match(source, /scratch\.up\.copy\(camera\.up\)\.applyQuaternion\(camera\.quaternion\)\.normalize\(\)/);
  assert.match(source, /setListenerPose\(/);
  assert.match(source, /const sources = frame\?\.sourcePositions \?\? \{\}/);
  assert.match(source, /readPosition\(sources\.switch/);
  assert.match(source, /readPosition\(sources\.rift/);
  assert.match(source, /readPosition\(sources\.lens/);
  assert.match(source, /OBSERVATORY_BLACK_HOLE_FLOW_PERIODS\.inner/);
  assert.match(source, /OBSERVATORY_BLACK_HOLE_FLOW_PERIODS\.middle/);
  assert.match(source, /OBSERVATORY_BLACK_HOLE_FLOW_PERIODS\.outer/);
  assert.match(
    source,
    /riftSweep: clamp01\(\s*frame\?\.riftState\?\.transitionProgress/
  );
  assert.match(source, /if \(!reducedMotion\) engine\.motionSeconds \+=/);
  assert.doesNotMatch(source, /OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR/);
});

test("short smoothing, finite cues and quality fallbacks avoid an endless noisy bed", () => {
  assert.match(source, /setTargetAtTime/);
  assert.match(source, /FAST_MUTE_TIME_CONSTANT = 0\.018/);
  assert.match(source, /NORMAL_SMOOTHING_TIME_CONSTANT = 0\.035/);
  assert.match(source, /tone\.stop\(end \+ 0\.02\)/);
  assert.match(source, /noise\.stop\(end \+ 0\.02\)/);
  assert.match(source, /tone\.onended = finish/);
  assert.match(source, /high: Object\.freeze\(\{ wet: 0\.17, spatialModel: "HRTF"/);
  assert.match(source, /low: Object\.freeze\(\{ wet: 0, spatialModel: "HRTF"/);
  assert.match(source, /minimum: Object\.freeze\(\{ wet: 0, spatialModel: "equalpower"/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
});

test("room cues survive the Portal delay while cosmos failures still fail closed", () => {
  assert.match(
    source,
    /const runtimeActive = frame\.inLoft === true\s*&& frame\.runtimeAvailable !== false/
  );
  assert.doesNotMatch(
    source,
    /const runtimeActive =[\s\S]{0,160}frame\.visualAvailable !== false/
  );
  assert.match(source, /visualAvailable: frame\.visualAvailable/);
  assert.match(source, /webglAvailableRef\.current/);
});

test("the costly graph exists only near the observatory and suspends while away", () => {
  assert.match(source, /frame\?\.inLoft !== true && frame\?\.nearObservatory !== true/);
  assert.match(source, /const AWAY_SUSPEND_DELAY_SECONDS = 0\.75/);
  assert.match(
    source,
    /const nearAudioZone = frame\?\.inLoft === true \|\| frame\?\.nearObservatory === true/
  );
  assert.match(source, /engine\.awaySeconds \+= Math\.max\(0, finite\(deltaSeconds\)\)/);
  assert.match(source, /engine\.awaySeconds < AWAY_SUSPEND_DELAY_SECONDS/);
  assert.match(source, /engine\.context\.suspend\?\.\(\)/);
  assert.match(source, /updateProximitySuspension\(\s*engine,\s*frame,\s*safeDelta,/);
  assert.match(source, /if \(engine\.context\.state === "running"\) \{/);
  assert.match(source, /canResume\s*&& engine\.unlockRequested/);
  assert.match(source, /engine\.awaySuspended \|\| engine\.suspendRequested/);
  assert.match(source, /ensureEngineRunning\(engine\)/);
});

test("visibility, WebGL loss and unmount all mute and dispose idempotently", () => {
  assert.match(source, /document\.addEventListener\("visibilitychange", handleVisibility\)/);
  assert.match(source, /gl\.domElement\.addEventListener\("webglcontextlost", handleContextLost\)/);
  assert.match(source, /gl\.domElement\.addEventListener\("webglcontextrestored", handleContextRestored\)/);
  assert.match(source, /fastMuteEngine\(engineRef\.current\)/);
  assert.match(source, /for \(const oneShot of engine\.oneShots\) disposeOneShot\(oneShot\)/);
  assert.match(source, /engine\.oneShots\.clear\(\)/);
  assert.match(source, /engineRef\.current\?\.unlockRequested/);
  assert.match(source, /ensureEngineRunning\(engineRef\.current\)/);
  assert.match(source, /function disposeAudioEngine\(engine\) \{\s*if \(!engine \|\| engine\.disposed\) return/);
  assert.match(source, /safeStop\(voice\.noise\)/);
  assert.match(source, /safeStop\(voice\.oscillator\)/);
  assert.match(source, /engine\.context\.close\?\.\(\)/);
  assert.match(source, /document\.removeEventListener\("pointerdown", unlockFromTrustedGesture, true\)/);
  assert.match(source, /document\.removeEventListener\("click", unlockFromTrustedGesture, true\)/);
  assert.match(source, /gl\.domElement\.removeEventListener\("webglcontextlost", handleContextLost\)/);
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*if \(muted\) fastMuteEngine\(engineRef\.current\);\s*\}, \[muted\]\)/
  );
});

test("each rendered frame publishes bounded audio diagnostics", () => {
  assert.match(source, /frame\.audio = diagnostics/);
  assert.match(source, /contextState:/);
  assert.match(source, /muted: Boolean\(requestedMuted\)/);
  assert.match(source, /muteReason,/);
  assert.match(source, /graphBuilds:/);
  assert.match(source, /contextCount:/);
  assert.match(source, /activeOneShots:/);
  assert.match(source, /targets:/);
  assert.match(source, /listener:/);
  assert.match(source, /sources:/);
  assert.match(source, /failure:/);
  assert.match(source, /writeAudioDiagnostics\(\s*audioFrameRef,/);
});
