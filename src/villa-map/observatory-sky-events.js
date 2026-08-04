// Rare-event sky layers: meteors, a comet, a supernova, a bolide with its
// persistent train, a satellite train, a planetary conjunction, aurora
// curtains, seeded stick-figure constellations, a phased moon, a kilonova
// ripple and a darting UFO — all drawn on the same camera-centred 80 m shell
// as the other observatory sky layers and clipped by the identical stencil
// aperture (ref 7). Node-pure like the rest of the core: no window/document/
// TextureLoader at import time, deterministic geometry from fixed seeds,
// idempotent dispose.
//
// The whole group renders nothing while every event channel is zero (the
// group is invisible), preserving the lights-on rule of zero sustained
// cosmos draws. Each occurrence's look (sky position, path, phase, shape) is
// derived once from the director's per-event seed, so a QA-pinned event
// replays identically.

import * as THREE from "three";

import { configureSkyStencil, MUSHROOM_SKY_RADIUS } from "./mushroom-sky.js";

export const OBSERVATORY_SKY_EVENTS_NAME = "mushroom-observatory-sky-events";
export const OBSERVATORY_METEORS_NAME = "mushroom-observatory-meteor-shower";
export const OBSERVATORY_COMET_NAME = "mushroom-observatory-comet";
export const OBSERVATORY_SUPERNOVA_NAME = "mushroom-observatory-supernova";
export const OBSERVATORY_BOLIDE_NAME = "mushroom-observatory-bolide";
export const OBSERVATORY_SATELLITES_NAME =
  "mushroom-observatory-satellite-train";
export const OBSERVATORY_PLANETS_NAME =
  "mushroom-observatory-planet-conjunction";
export const OBSERVATORY_AURORA_NAME = "mushroom-observatory-aurora";
export const OBSERVATORY_CONSTELLATION_NAME =
  "mushroom-observatory-constellation";
export const OBSERVATORY_CONSTELLATION_LINES_NAME =
  "mushroom-observatory-constellation-lines";
export const OBSERVATORY_CONSTELLATION_STARS_NAME =
  "mushroom-observatory-constellation-stars";
export const OBSERVATORY_MOON_NAME = "mushroom-observatory-moon";
export const OBSERVATORY_KILONOVA_NAME = "mushroom-observatory-kilonova";
export const OBSERVATORY_UFO_NAME = "mushroom-observatory-ufo";
// Slightly inside the backdrop shell so streaks never z-fight the photo sky.
export const OBSERVATORY_SKY_EVENTS_RADIUS = MUSHROOM_SKY_RADIUS - 2;
export const OBSERVATORY_METEOR_COUNT = 42;
export const OBSERVATORY_SATELLITE_COUNT = 8;
// Motion-dominant phenomena opt out entirely under prefers-reduced-motion
// (a frozen streak or a frozen dash reads as a glitch, not a sight); the
// slow progress-driven crossings and static glows stay.
export const OBSERVATORY_MOTION_SUPPRESSED_CHANNELS = Object.freeze([
  "meteor",
  "bolide",
  "satellites",
  "ufo"
]);
// Between the hero stars (-900) and any translucent room decor: event layers
// paint over stars but stay behind future glass, matching the stars' rationale.
const EVENT_RENDER_ORDER = -899;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seedInteger(seed, salt) {
  return (Math.floor(seed * 0xffffffff) ^ salt) >>> 0;
}

// Shared GLSL: tangent basis around a unit direction, giving every billboard
// a stable "east/north" frame without any matrix inverse (plain ShaderMaterial
// compiles as GLSL ES 1.00).
const BASIS_GLSL = /* glsl */ `
  void tangentBasis(vec3 dir, out vec3 east, out vec3 north) {
    vec3 up = abs(dir.y) > 0.94 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    east = normalize(cross(up, dir));
    north = normalize(cross(dir, east));
  }
`;

const ANCHORED_VERTEX_SHADER = /* glsl */ `
  uniform vec3 uDir;
  uniform float uRadius;
  uniform float uHalfSize;

  attribute vec2 aCorner;

  varying vec2 vUv;

  ${""}
  ${BASIS_GLSL}

  void main() {
    vec3 east;
    vec3 north;
    tangentBasis(uDir, east, north);
    vec3 vertexPosition = uDir * uRadius
      + east * aCorner.x * uHalfSize
      + north * aCorner.y * uHalfSize;
    vUv = aCorner;
    gl_Position = projectionMatrix * modelViewMatrix
      * vec4(vertexPosition, 1.0);
  }
`;

function createLayerMaterial({ vertexShader, fragmentShader, uniforms }) {
  return configureSkyStencil(new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    // Billboards are anchored on the shell with outward tangent frames, so
    // the viewer at the centre always sees their back face; the aurora strip
    // curves through both orientations. Double-sided is the only correct
    // culling mode for every event layer.
    side: THREE.DoubleSide
  }));
}

// Quad helper: `count` billboards, aCorner in [-1,1]^2, aIndex per quad.
function createQuadGeometry(count) {
  const corners = new Float32Array(count * 4 * 2);
  const indices16 = new Uint16Array(count * 6);
  const indexAttr = new Float32Array(count * 4);
  for (let quad = 0; quad < count; quad += 1) {
    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = quad * 4 + corner;
      corners.set(
        [corner < 2 ? -1 : 1, corner % 2 === 0 ? -1 : 1],
        vertex * 2
      );
      indexAttr[vertex] = quad;
    }
    indices16.set(
      [
        quad * 4,
        quad * 4 + 2,
        quad * 4 + 1,
        quad * 4 + 1,
        quad * 4 + 2,
        quad * 4 + 3
      ],
      quad * 6
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3)
  );
  geometry.setAttribute("aCorner", new THREE.BufferAttribute(corners, 2));
  geometry.setAttribute("aIndex", new THREE.BufferAttribute(indexAttr, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices16, 1));
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    OBSERVATORY_SKY_EVENTS_RADIUS + 8
  );
  return geometry;
}

function seededDirection(random, minAltitude, maxAltitude, target) {
  const azimuth = random() * Math.PI * 2;
  const altitude = minAltitude + random() * (maxAltitude - minAltitude);
  return target.set(
    Math.cos(azimuth) * Math.cos(altitude),
    Math.sin(altitude),
    Math.sin(azimuth) * Math.cos(altitude)
  ).normalize();
}

const pathStartScratch = new THREE.Vector3();
const pathReferenceScratch = new THREE.Vector3();
const pathTangentScratch = new THREE.Vector3();

// One seeded great circle through a high point: `start` is the apex, tangent
// mostly horizontal, so apex-centred traversals stay above the dome horizon.
function seededGreatCircle(random, startTarget, tangentTarget) {
  const azimuth = random() * Math.PI * 2;
  const altitude = 0.5 + random() * 0.6;
  startTarget.set(
    Math.cos(azimuth) * Math.cos(altitude),
    Math.sin(altitude),
    Math.sin(azimuth) * Math.cos(altitude)
  ).normalize();
  const referenceAzimuth = azimuth + Math.PI * (0.4 + random() * 0.2);
  pathReferenceScratch.set(
    Math.cos(referenceAzimuth),
    0.18 + random() * 0.3,
    Math.sin(referenceAzimuth)
  ).normalize();
  tangentTarget.copy(pathReferenceScratch)
    .addScaledVector(startTarget, -pathReferenceScratch.dot(startTarget))
    .normalize();
}

/* ------------------------------ meteors ------------------------------- */

const METEOR_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;
  uniform float uIntensity;

  attribute vec3 aStart;
  attribute vec3 aTangent;
  // x: cycle rate (1/s), y: duty fraction of the cycle spent in flight,
  // z: travel arc (rad), w: phase offset.
  attribute vec4 aTiming;
  // x: arc start offset (rad), y: streak brightness, z: width scale,
  // w: tail arc (rad).
  attribute vec4 aShape;
  attribute vec2 aCorner;

  varying vec2 vStreak;
  varying float vAlpha;

  vec3 flightDirection(float angle) {
    return normalize(aStart * cos(angle) + aTangent * sin(angle));
  }

  void main() {
    float cycle = fract(uTime * aTiming.x + aTiming.w);
    float local = cycle / max(aTiming.y, 1e-4);
    float inFlight = step(local, 1.0);

    float headAngle = aShape.x + local * aTiming.z;
    vec3 head = flightDirection(headAngle);
    vec3 tail = flightDirection(headAngle - aShape.w);
    vec3 along = head - tail;
    // The viewer stands at the shell's centre, so the sphere tangent
    // perpendicular to the travel direction is also perpendicular to the view
    // ray — a free billboard axis with no matrix inverse needed.
    vec3 side = normalize(cross(normalize(along + vec3(1e-5)), head));

    vec3 vertexPosition = mix(tail, head, aCorner.x) * uRadius
      + side * aCorner.y * aShape.z;
    vStreak = aCorner;
    // Fade each meteor in/out across its own flight so streaks never pop at
    // birth or burnout; between flights the quad collapses to the origin.
    float flightFade = smoothstep(0.0, 0.12, local)
      * (1.0 - smoothstep(0.72, 1.0, local));
    vAlpha = inFlight * flightFade * aShape.y * uIntensity;

    gl_Position = projectionMatrix * modelViewMatrix
      * vec4(vertexPosition * inFlight, 1.0);
  }
`;

const METEOR_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec2 vStreak;
  varying float vAlpha;

  void main() {
    if (vAlpha <= 0.0005) discard;
    // Head-bright profile along the streak, soft falloff across it.
    float along = pow(clamp(vStreak.x, 0.0, 1.0), 2.2);
    float across = 1.0 - clamp(abs(vStreak.y), 0.0, 1.0);
    float alpha = vAlpha * along * across * across;
    vec3 color = mix(
      vec3(0.62, 0.74, 1.0),
      vec3(1.0, 0.98, 0.9),
      along
    );
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

function createMeteorGeometry(count, random) {
  const starts = new Float32Array(count * 4 * 3);
  const tangents = new Float32Array(count * 4 * 3);
  const timings = new Float32Array(count * 4 * 4);
  const shapes = new Float32Array(count * 4 * 4);
  const corners = new Float32Array(count * 4 * 2);
  const indices = new Uint16Array(count * 6);

  const start = new THREE.Vector3();
  const reference = new THREE.Vector3();
  const tangent = new THREE.Vector3();

  for (let meteor = 0; meteor < count; meteor += 1) {
    // Radiant-ish: launch points cluster in the upper hemisphere and travel
    // downward-ish arcs, like a shower with a high radiant.
    const azimuth = random() * Math.PI * 2;
    const altitude = 0.35 + random() * 1.05;
    start.set(
      Math.cos(azimuth) * Math.cos(altitude),
      Math.sin(altitude),
      Math.sin(azimuth) * Math.cos(altitude)
    ).normalize();
    reference.set(
      Math.cos(azimuth + 2.4) * 0.4,
      -1,
      Math.sin(azimuth + 2.4) * 0.4
    ).normalize();
    tangent.copy(reference)
      .addScaledVector(start, -reference.dot(start))
      .normalize();

    const rate = 1 / (3.4 + random() * 5.2);
    const duty = (0.85 + random() * 0.75) * rate;
    const arc = 0.34 + random() * 0.42;
    const phase = random();
    const arcStart = (random() - 0.5) * 0.5;
    const brightness = 0.55 + random() * 0.45;
    const width = 0.32 + random() * 0.5;
    const tailArc = arc * (0.22 + random() * 0.16);

    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = meteor * 4 + corner;
      starts.set([start.x, start.y, start.z], vertex * 3);
      tangents.set([tangent.x, tangent.y, tangent.z], vertex * 3);
      timings.set([rate, duty, arc, phase], vertex * 4);
      shapes.set([arcStart, brightness, width, tailArc], vertex * 4);
      corners.set(
        [corner < 2 ? 0 : 1, corner % 2 === 0 ? -1 : 1],
        vertex * 2
      );
    }
    indices.set(
      [
        meteor * 4,
        meteor * 4 + 2,
        meteor * 4 + 1,
        meteor * 4 + 1,
        meteor * 4 + 2,
        meteor * 4 + 3
      ],
      meteor * 6
    );
  }

  const geometry = new THREE.BufferGeometry();
  // The vertex shader synthesizes positions; the zero-filled attribute only
  // keeps three.js bookkeeping (draw range, raycast guards) on a normal path.
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3)
  );
  geometry.setAttribute("aStart", new THREE.BufferAttribute(starts, 3));
  geometry.setAttribute("aTangent", new THREE.BufferAttribute(tangents, 3));
  geometry.setAttribute("aTiming", new THREE.BufferAttribute(timings, 4));
  geometry.setAttribute("aShape", new THREE.BufferAttribute(shapes, 4));
  geometry.setAttribute("aCorner", new THREE.BufferAttribute(corners, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    OBSERVATORY_SKY_EVENTS_RADIUS + 4
  );
  return geometry;
}

/* ------------------------------- comet -------------------------------- */

const PATH_VERTEX_SHADER = /* glsl */ `
  uniform float uRadius;
  uniform vec3 uPathStart;
  uniform vec3 uPathTangent;
  uniform float uPathAngle;
  uniform float uTailArc;
  uniform float uWidth;

  attribute vec2 aCorner;

  varying vec2 vComa;

  vec3 pathDirection(float angle) {
    return normalize(uPathStart * cos(angle) + uPathTangent * sin(angle));
  }

  void main() {
    // aCorner.x in [0, ~1.18]: 1 = coma centre (head), 0 = tail tip. The quad
    // hugs the great-circle chord between head and tail; the fragment shader
    // shapes it.
    vec3 head = pathDirection(uPathAngle);
    vec3 tail = pathDirection(uPathAngle - uTailArc);
    vec3 along = head - tail;
    vec3 side = normalize(cross(normalize(along + vec3(1e-5)), head));

    vec3 vertexPosition = mix(tail, head, aCorner.x) * uRadius
      + side * aCorner.y * uWidth;
    vComa = aCorner;
    gl_Position = projectionMatrix * modelViewMatrix
      * vec4(vertexPosition, 1.0);
  }
`;

const COMET_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uIntensity;

  varying vec2 vComa;

  void main() {
    if (uIntensity <= 0.0005) discard;
    float along = vComa.x;
    float across = clamp(abs(vComa.y), 0.0, 1.0);
    // Radial gaussian coma centred on along = 1: the quad extends past the
    // head, so the glow is round rather than a truncated fan.
    vec2 fromHead = vec2((1.0 - along) * 6.5, across * 1.9);
    float coma = exp(-dot(fromHead, fromHead)) * 2.4;
    // A long tail that narrows and fades toward the tip, with soft edges,
    // and never leaks forward of the coma.
    float tailAlong = clamp(along, 0.0, 1.0);
    float spread = mix(1.0, 0.22, tailAlong);
    float tail = pow(tailAlong, 1.6)
      * pow(clamp(1.0 - across / max(spread, 1e-3), 0.0, 1.0), 3.0)
      * (1.0 - smoothstep(0.96, 1.04, along))
      * 0.5;
    float alpha = uIntensity * clamp(coma + tail, 0.0, 2.0);
    vec3 color = mix(
      vec3(0.55, 0.72, 1.0),
      vec3(0.95, 0.99, 1.0),
      smoothstep(0.5, 1.0, tailAlong)
    );
    gl_FragColor = vec4(color * alpha, min(alpha, 1.0));
  }
`;

function createCometGeometry() {
  // The head corners sit at 1.18, past the coma centre (along = 1), so the
  // head glow renders as a full radial gaussian instead of a truncated fan.
  const corners = new Float32Array([0, -1, 0, 1, 1.18, -1, 1.18, 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("aCorner", new THREE.BufferAttribute(corners, 2));
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(4 * 3), 3)
  );
  geometry.setIndex(new THREE.BufferAttribute(
    new Uint16Array([0, 2, 1, 1, 2, 3]),
    1
  ));
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    OBSERVATORY_SKY_EVENTS_RADIUS + 4
  );
  return geometry;
}

/* ----------------------------- supernova ------------------------------ */

const SUPERNOVA_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uIntensity;
  uniform float uProgress;

  varying vec2 vUv;

  void main() {
    if (uIntensity <= 0.0005) discard;
    float r = length(vUv);
    // Tight, hot core…
    float core = exp(-r * r * 30.0) * 2.2;
    // …with four long razor-thin diffraction rays that shorten as the star
    // dims, so the detonation reads as a blazing star, never a blob.
    float spikeReach = mix(1.0, 0.4, uProgress);
    float spikes = (
      pow(max(0.0, 1.0 - abs(vUv.x) / spikeReach), 2.0)
        * exp(-vUv.y * vUv.y * 520.0)
      + pow(max(0.0, 1.0 - abs(vUv.y) / spikeReach), 2.0)
        * exp(-vUv.x * vUv.x * 520.0)
    ) * 2.2;
    float halo = exp(-r * r * 4.5) * 0.34;
    // Blue-white detonation cooling toward a warm ember as it fades.
    vec3 color = mix(
      vec3(0.78, 0.86, 1.0),
      vec3(1.0, 0.82, 0.6),
      smoothstep(0.25, 0.95, uProgress)
    );
    float alpha = (core + spikes + halo) * uIntensity;
    gl_FragColor = vec4(color * alpha, min(alpha, 1.0));
  }
`;

/* ------------------------------- bolide ------------------------------- */

const BOLIDE_VERTEX_SHADER = /* glsl */ `
  uniform float uRadius;
  uniform vec3 uPathStart;
  uniform vec3 uPathTangent;
  uniform float uProgress;

  attribute vec2 aCorner;
  attribute float aIndex;

  varying vec2 vUv;
  varying float vPart;

  vec3 pathDirection(float angle) {
    return normalize(uPathStart * cos(angle) + uPathTangent * sin(angle));
  }

  void main() {
    float flightT = clamp(uProgress / 0.12, 0.0, 1.0);
    float headAngle = mix(-0.42, 0.38, flightT);
    float isTrain = step(0.5, aIndex);

    // Streak: a short bright head segment during the flight window.
    // Train: a widening quad over the whole travelled arc afterwards.
    float tailAngle = mix(headAngle - 0.09, -0.42, isTrain);
    vec3 head = pathDirection(headAngle);
    vec3 tail = pathDirection(tailAngle);
    vec3 along = head - tail;
    vec3 side = normalize(cross(normalize(along + vec3(1e-5)), head));

    float width = mix(1.3, 1.6 + 3.4 * uProgress, isTrain);
    // "active" is a reserved word in GLSL ES — using it as an identifier
    // fails shader compilation (ANGLE enforces this), which would fail-soft
    // the entire sky-event layer.
    float partGate = mix(
      1.0 - step(0.135, uProgress),
      step(0.03, uProgress),
      isTrain
    );

    vec3 vertexPosition = (
      mix(tail, head, aCorner.x * 0.5 + 0.5) * uRadius
      + side * aCorner.y * width
    ) * partGate;
    vUv = vec2(aCorner.x * 0.5 + 0.5, aCorner.y);
    vPart = isTrain;
    gl_Position = projectionMatrix * modelViewMatrix
      * vec4(vertexPosition, 1.0);
  }
`;

const BOLIDE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uIntensity;
  uniform float uProgress;

  varying vec2 vUv;
  varying float vPart;

  void main() {
    if (uIntensity <= 0.0005) discard;
    float across = 1.0 - clamp(abs(vUv.y), 0.0, 1.0);
    float alpha;
    vec3 color;
    if (vPart < 0.5) {
      // The fireball itself: head-bright, with a terminal flash as it bursts.
      float along = pow(clamp(vUv.x, 0.0, 1.0), 1.8);
      float flash = exp(-abs(uProgress - 0.115) * 30.0) * 2.6;
      alpha = (along * 1.6 + flash) * across * across * uIntensity;
      color = mix(vec3(1.0, 0.72, 0.4), vec3(1.0, 0.98, 0.92), along);
    } else {
      // The persistent train: brightest where the burst happened, slowly
      // dissipating and cooling to a coppery green.
      float fade = pow(
        1.0 - clamp((uProgress - 0.12) / 0.88, 0.0, 1.0),
        1.5
      );
      float along = pow(clamp(vUv.x, 0.0, 1.0), 1.4);
      alpha = along * across * across * fade * 0.85 * uIntensity;
      color = mix(vec3(0.55, 0.85, 0.6), vec3(1.0, 0.8, 0.5), along);
    }
    gl_FragColor = vec4(color * alpha, min(alpha, 1.0));
  }
`;

/* ----------------------------- satellites ----------------------------- */

const SATELLITE_VERTEX_SHADER = /* glsl */ `
  uniform float uRadius;
  uniform vec3 uPathStart;
  uniform vec3 uPathTangent;
  uniform float uProgress;

  attribute vec2 aCorner;
  attribute float aIndex;

  varying vec2 vUv;
  varying float vIndex;

  ${""}
  ${BASIS_GLSL}

  vec3 pathDirection(float angle) {
    return normalize(uPathStart * cos(angle) + uPathTangent * sin(angle));
  }

  void main() {
    float angle = mix(-1.05, 1.05, uProgress) - aIndex * 0.055;
    vec3 dir = pathDirection(angle);
    vec3 east;
    vec3 north;
    tangentBasis(dir, east, north);
    vec3 vertexPosition = dir * uRadius
      + east * aCorner.x * 1.05
      + north * aCorner.y * 1.05;
    vUv = aCorner;
    vIndex = aIndex;
    gl_Position = projectionMatrix * modelViewMatrix
      * vec4(vertexPosition, 1.0);
  }
`;

const SATELLITE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uIntensity;

  varying vec2 vUv;
  varying float vIndex;

  void main() {
    if (uIntensity <= 0.0005) discard;
    float r = length(vUv);
    float brightness = 0.9
      + 0.5 * fract(sin(vIndex * 12.9898) * 43758.5453);
    float alpha = (exp(-r * r * 16.0) + exp(-r * r * 4.0) * 0.2)
      * brightness * uIntensity;
    gl_FragColor = vec4(vec3(0.92, 0.95, 1.0) * alpha, min(alpha, 1.0));
  }
`;

/* ------------------------------ planets ------------------------------- */

const PLANET_VERTEX_SHADER = /* glsl */ `
  uniform vec3 uDir;
  uniform float uRadius;
  uniform float uSeparation;

  attribute vec2 aCorner;
  attribute float aIndex;

  varying vec2 vUv;
  varying float vIndex;

  ${""}
  ${BASIS_GLSL}

  void main() {
    vec3 east;
    vec3 north;
    tangentBasis(uDir, east, north);
    float offset = (aIndex - 1.0) * uSeparation * uRadius;
    float lift = sin(aIndex * 2.1) * uSeparation * 0.35 * uRadius;
    float halfSize = 2.1 - 0.35 * abs(aIndex - 1.0);
    vec3 vertexPosition = uDir * uRadius
      + east * (offset + aCorner.x * halfSize)
      + north * (lift + aCorner.y * halfSize);
    vUv = aCorner;
    vIndex = aIndex;
    gl_Position = projectionMatrix * modelViewMatrix
      * vec4(vertexPosition, 1.0);
  }
`;

const PLANET_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uIntensity;

  varying vec2 vUv;
  varying float vIndex;

  void main() {
    if (uIntensity <= 0.0005) discard;
    float r = length(vUv);
    vec3 color = vIndex < 0.5
      ? vec3(1.0, 0.62, 0.45)
      : vIndex < 1.5
        ? vec3(1.0, 0.96, 0.86)
        : vec3(0.95, 0.87, 0.62);
    float alpha = (exp(-r * r * 18.0) + exp(-r * r * 3.0) * 0.22)
      * uIntensity;
    gl_FragColor = vec4(color * alpha, min(alpha, 1.0));
  }
`;

/* ------------------------------- aurora ------------------------------- */

const AURORA_VERTEX_SHADER = /* glsl */ `
  uniform float uRadius;
  uniform float uCenterAz;
  uniform float uTime;
  uniform float uMotion;

  attribute vec2 aParam;
  attribute float aLayer;

  varying vec2 vParam;
  varying float vLayer;

  void main() {
    float azSpan = 2.7 + aLayer * 0.4;
    float az = uCenterAz + (aParam.x - 0.5) * azSpan + aLayer * 0.18;
    float t = uTime * uMotion;
    float ripple = (
      sin(aParam.x * 9.4 + t * 0.55 + aLayer * 2.3)
      + 0.6 * sin(aParam.x * 17.3 - t * 0.34)
    ) * (0.018 + 0.03 * aParam.y);
    // Curtains climb from just above the dome rim well into the sky, so the
    // display clears the stencil horizon from every loft viewpoint.
    float alt = 0.18 + aLayer * 0.07 + aParam.y * 0.58 + ripple;
    vec3 dir = vec3(cos(az) * cos(alt), sin(alt), sin(az) * cos(alt));
    vParam = aParam;
    vLayer = aLayer;
    gl_Position = projectionMatrix * modelViewMatrix
      * vec4(dir * uRadius, 1.0);
  }
`;

const AURORA_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uIntensity;
  uniform float uTime;
  uniform float uMotion;

  varying vec2 vParam;
  varying float vLayer;

  void main() {
    if (uIntensity <= 0.0005) discard;
    float t = uTime * uMotion;
    // Vertical curtain rays sliding along the band.
    float rays = 0.6 + 0.4 * sin(
      vParam.x * 70.0 + sin(vParam.x * 13.0) * 3.0 + t * 0.8 + vLayer * 5.0
    );
    vec3 color = mix(
      vec3(0.22, 1.0, 0.5),
      vec3(0.6, 0.35, 0.98),
      smoothstep(0.3, 1.0, vParam.y)
    );
    float vertical = pow(1.0 - vParam.y, 1.35)
      * smoothstep(0.0, 0.12, vParam.y);
    float edge = smoothstep(0.0, 0.08, vParam.x)
      * smoothstep(1.0, 0.92, vParam.x);
    float alpha = uIntensity * vertical * edge * rays
      * (vLayer > 0.5 ? 0.6 : 1.0) * 1.5;
    gl_FragColor = vec4(color * alpha, min(alpha, 1.0));
  }
`;

function createAuroraGeometry(azSegments = 56, altSegments = 5, layers = 2) {
  const columns = azSegments + 1;
  const rows = altSegments + 1;
  const perLayer = columns * rows;
  const vertexCount = perLayer * layers;
  const params = new Float32Array(vertexCount * 2);
  const layerAttr = new Float32Array(vertexCount);
  const indices = new Uint16Array(azSegments * altSegments * 6 * layers);

  let indexOffset = 0;
  for (let layer = 0; layer < layers; layer += 1) {
    const base = layer * perLayer;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const vertex = base + row * columns + column;
        params[vertex * 2] = column / azSegments;
        params[vertex * 2 + 1] = row / altSegments;
        layerAttr[vertex] = layer;
      }
    }
    for (let row = 0; row < altSegments; row += 1) {
      for (let column = 0; column < azSegments; column += 1) {
        const a = base + row * columns + column;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        indices.set([a, c, b, b, c, d], indexOffset);
        indexOffset += 6;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3)
  );
  geometry.setAttribute("aParam", new THREE.BufferAttribute(params, 2));
  geometry.setAttribute("aLayer", new THREE.BufferAttribute(layerAttr, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    OBSERVATORY_SKY_EVENTS_RADIUS + 4
  );
  return geometry;
}

/* ---------------------------- constellation --------------------------- */

// Hand-authored stick figures in a [-1, 1] design plane. The 猪猪山庄 sky
// naturally hosts a pig alongside the classic dipper, a mushroom and a heart.
export const OBSERVATORY_CONSTELLATION_SHAPES = Object.freeze([
  Object.freeze({
    name: "北斗勺子",
    points: [
      [-1, -0.1], [-0.55, 0.06], [-0.12, 0.02], [0.22, -0.08],
      [0.6, 0.14], [0.94, -0.12], [0.55, -0.4]
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]]
  }),
  Object.freeze({
    name: "猪猪",
    points: [
      [0.7, 0], [0.49, 0.49], [0, 0.7], [-0.49, 0.49],
      [-0.7, 0], [-0.49, -0.49], [0, -0.7], [0.49, -0.49],
      [-0.62, 0.95], [0.62, 0.95],
      [0, -0.08], [0.16, -0.24], [0, -0.4], [-0.16, -0.24]
    ],
    lines: [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0],
      [3, 8], [8, 2], [1, 9], [9, 2],
      [10, 11], [11, 12], [12, 13], [13, 10]
    ]
  }),
  Object.freeze({
    name: "蘑菇",
    points: [
      [-0.9, 0.1], [-0.6, 0.5], [-0.2, 0.72], [0.2, 0.72],
      [0.6, 0.5], [0.9, 0.1],
      [-0.3, 0.08], [-0.24, -0.7], [0.24, -0.7], [0.3, 0.08]
    ],
    lines: [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
      [6, 7], [7, 8], [8, 9]
    ]
  }),
  Object.freeze({
    name: "爱心",
    points: [
      [0, 0.35], [0.35, 0.75], [0.75, 0.45], [0.55, -0.1],
      [0, -0.65], [-0.55, -0.1], [-0.75, 0.45], [-0.35, 0.75]
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0]]
  })
]);

const CONSTELLATION_MAX_POINTS = 14;
const CONSTELLATION_MAX_LINE_VERTICES = 32;
const CONSTELLATION_SCALE_RADIANS = 0.2;

const constellationDirScratch = new THREE.Vector3();
const constellationEastScratch = new THREE.Vector3();
const constellationNorthScratch = new THREE.Vector3();
const constellationUpScratch = new THREE.Vector3();
const constellationPointScratch = new THREE.Vector3();

function writeConstellationVertex(target, offset, x, y, radius) {
  constellationPointScratch.copy(constellationDirScratch)
    .multiplyScalar(radius)
    .addScaledVector(constellationEastScratch, x)
    .addScaledVector(constellationNorthScratch, y);
  target[offset] = constellationPointScratch.x;
  target[offset + 1] = constellationPointScratch.y;
  target[offset + 2] = constellationPointScratch.z;
}

/* -------------------------------- moon -------------------------------- */

const MOON_VERTEX_SHADER = /* glsl */ `
  uniform float uRadius;
  uniform vec3 uPathStart;
  uniform vec3 uPathTangent;
  uniform float uPathAngle;
  uniform float uHalfSize;

  attribute vec2 aCorner;

  varying vec2 vUv;

  ${""}
  ${BASIS_GLSL}

  void main() {
    vec3 dir = normalize(
      uPathStart * cos(uPathAngle) + uPathTangent * sin(uPathAngle)
    );
    vec3 east;
    vec3 north;
    tangentBasis(dir, east, north);
    vec3 vertexPosition = dir * uRadius
      + east * aCorner.x * uHalfSize
      + north * aCorner.y * uHalfSize;
    vUv = aCorner;
    gl_Position = projectionMatrix * modelViewMatrix
      * vec4(vertexPosition, 1.0);
  }
`;

const MOON_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uIntensity;
  uniform float uPhase;

  varying vec2 vUv;

  void main() {
    if (uIntensity <= 0.0005) discard;
    float r = length(vUv);
    float disc = smoothstep(1.0, 0.965, r);
    // Fake-sphere terminator: the seeded phase angle slides the light around
    // the limb, giving crescents through gibbous moons per occurrence.
    vec3 normal = vec3(vUv, sqrt(max(0.0, 1.0 - r * r)));
    vec3 light = normalize(vec3(cos(uPhase), 0.2, sin(uPhase) * 0.8 + 0.35));
    float lit = pow(clamp(dot(normal, light), 0.0, 1.0), 0.85);
    // Cheap maria mottling — enough texture to read as the Moon, no sampler.
    float maria = 0.86
      + 0.14 * sin(vUv.x * 7.1 + 1.3) * sin(vUv.y * 6.3 - 0.7);
    float surface = (0.12 + 0.95 * lit) * maria;
    float halo = r > 1.0 ? exp(-(r - 1.0) * 4.0) * 0.22 : 0.0;
    float alpha = (disc * surface + halo) * uIntensity;
    gl_FragColor = vec4(vec3(0.93, 0.95, 1.0) * alpha, min(alpha, 1.0));
  }
`;

/* ------------------------------ kilonova ------------------------------ */

const KILONOVA_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uIntensity;
  uniform float uProgress;

  varying vec2 vUv;

  void main() {
    if (uIntensity <= 0.0005) discard;
    float r = length(vUv);
    // A brief golden-white detonation flash…
    float flash = exp(-r * r * 34.0) * exp(-uProgress * 10.0) * 3.0;
    // …then a single luminous ripple expanding across the sky and thinning
    // out as it goes.
    float ringRadius = 0.06 + 0.85 * pow(max(uProgress, 0.0), 0.62);
    float ringWidth = 0.035 + 0.05 * uProgress;
    // Squared by multiplication: pow(x, 2.0) is undefined for negative x in
    // GLSL ES 1.00 and NaNs inside the ring on some drivers.
    float ringDistance = (r - ringRadius) / ringWidth;
    float ring = exp(-ringDistance * ringDistance)
      * pow(max(1.0 - uProgress, 0.0), 1.2) * 1.1;
    vec3 flashColor = vec3(1.0, 0.93, 0.75);
    vec3 ringColor = mix(
      vec3(0.4, 0.95, 0.95),
      vec3(0.7, 0.45, 1.0),
      clamp(r, 0.0, 1.0)
    );
    vec3 color = flashColor * flash + ringColor * ring;
    float alpha = (flash + ring) * uIntensity;
    gl_FragColor = vec4(color * uIntensity, min(alpha, 1.0));
  }
`;

/* -------------------------------- ufo --------------------------------- */

const UFO_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uIntensity;
  uniform float uTime;

  varying vec2 vUv;

  void main() {
    if (uIntensity <= 0.0005) discard;
    float r = length(vUv);
    float pulse = 0.8 + 0.2 * sin(uTime * 7.0);
    float core = exp(-r * r * 42.0) * pulse;
    float ringDistance = (r - 0.5) / 0.12;
    float ring = exp(-ringDistance * ringDistance) * 0.45;
    float alpha = (core + ring) * uIntensity;
    gl_FragColor = vec4(vec3(0.75, 1.0, 0.85) * alpha, alpha);
  }
`;

const UFO_SEGMENT_COUNT = 5;
const ufoBaseScratch = new THREE.Vector3();
const ufoEastScratch = new THREE.Vector3();
const ufoNorthScratch = new THREE.Vector3();
const ufoFromScratch = new THREE.Vector3();
const ufoToScratch = new THREE.Vector3();

/* ------------------------------ assembly ------------------------------ */

function anchoredQuadMesh({ name, halfSize, fragmentShader, extraUniforms }) {
  const material = createLayerMaterial({
    uniforms: {
      uDir: { value: new THREE.Vector3(0, 1, 0) },
      uRadius: { value: OBSERVATORY_SKY_EVENTS_RADIUS },
      uHalfSize: { value: halfSize },
      uIntensity: { value: 0 },
      ...extraUniforms
    },
    vertexShader: ANCHORED_VERTEX_SHADER,
    fragmentShader
  });
  material.name = `${name}-material`;
  const mesh = new THREE.Mesh(createQuadGeometry(1), material);
  mesh.name = name;
  mesh.renderOrder = EVENT_RENDER_ORDER;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

export function createObservatorySkyEventsVisual({
  radius = OBSERVATORY_SKY_EVENTS_RADIUS,
  meteorCount = OBSERVATORY_METEOR_COUNT,
  seed = 0x5eeded
} = {}) {
  const group = new THREE.Group();
  group.name = OBSERVATORY_SKY_EVENTS_NAME;
  group.visible = false;

  const random = seededRandom(seed);

  const meteorMaterial = createLayerMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRadius: { value: radius },
      uIntensity: { value: 0 }
    },
    vertexShader: METEOR_VERTEX_SHADER,
    fragmentShader: METEOR_FRAGMENT_SHADER
  });
  meteorMaterial.name = "mushroom-observatory-meteor-material";
  const meteors = new THREE.Mesh(
    createMeteorGeometry(meteorCount, random),
    meteorMaterial
  );
  meteors.name = OBSERVATORY_METEORS_NAME;
  meteors.renderOrder = EVENT_RENDER_ORDER;
  meteors.frustumCulled = false;
  meteors.visible = false;
  group.add(meteors);

  const cometMaterial = createLayerMaterial({
    uniforms: {
      uRadius: { value: radius },
      uIntensity: { value: 0 },
      uPathStart: { value: new THREE.Vector3(1, 0.25, 0).normalize() },
      uPathTangent: { value: new THREE.Vector3(0, 0.6, 1).normalize() },
      uPathAngle: { value: 0 },
      uTailArc: { value: 0.5 },
      uWidth: { value: 3.2 }
    },
    vertexShader: PATH_VERTEX_SHADER,
    fragmentShader: COMET_FRAGMENT_SHADER
  });
  cometMaterial.name = "mushroom-observatory-comet-material";
  const comet = new THREE.Mesh(createCometGeometry(), cometMaterial);
  comet.name = OBSERVATORY_COMET_NAME;
  comet.renderOrder = EVENT_RENDER_ORDER - 1;
  comet.frustumCulled = false;
  comet.visible = false;
  group.add(comet);

  const supernova = anchoredQuadMesh({
    name: OBSERVATORY_SUPERNOVA_NAME,
    halfSize: 7.2,
    fragmentShader: SUPERNOVA_FRAGMENT_SHADER,
    extraUniforms: { uProgress: { value: 0 } }
  });
  group.add(supernova);

  const bolideMaterial = createLayerMaterial({
    uniforms: {
      uRadius: { value: radius },
      uIntensity: { value: 0 },
      uProgress: { value: 0 },
      uPathStart: { value: new THREE.Vector3(1, 0.4, 0).normalize() },
      uPathTangent: { value: new THREE.Vector3(0, 0.5, 1).normalize() }
    },
    vertexShader: BOLIDE_VERTEX_SHADER,
    fragmentShader: BOLIDE_FRAGMENT_SHADER
  });
  bolideMaterial.name = "mushroom-observatory-bolide-material";
  const bolide = new THREE.Mesh(createQuadGeometry(2), bolideMaterial);
  bolide.name = OBSERVATORY_BOLIDE_NAME;
  bolide.renderOrder = EVENT_RENDER_ORDER;
  bolide.frustumCulled = false;
  bolide.visible = false;
  group.add(bolide);

  const satelliteMaterial = createLayerMaterial({
    uniforms: {
      uRadius: { value: radius },
      uIntensity: { value: 0 },
      uProgress: { value: 0 },
      uPathStart: { value: new THREE.Vector3(1, 0.5, 0).normalize() },
      uPathTangent: { value: new THREE.Vector3(0, 0.4, 1).normalize() }
    },
    vertexShader: SATELLITE_VERTEX_SHADER,
    fragmentShader: SATELLITE_FRAGMENT_SHADER
  });
  satelliteMaterial.name = "mushroom-observatory-satellite-material";
  const satellites = new THREE.Mesh(
    createQuadGeometry(OBSERVATORY_SATELLITE_COUNT),
    satelliteMaterial
  );
  satellites.name = OBSERVATORY_SATELLITES_NAME;
  satellites.renderOrder = EVENT_RENDER_ORDER;
  satellites.frustumCulled = false;
  satellites.visible = false;
  group.add(satellites);

  const planetMaterial = createLayerMaterial({
    uniforms: {
      uRadius: { value: radius },
      uIntensity: { value: 0 },
      uSeparation: { value: 0.01 },
      uDir: { value: new THREE.Vector3(0, 1, 0) }
    },
    vertexShader: PLANET_VERTEX_SHADER,
    fragmentShader: PLANET_FRAGMENT_SHADER
  });
  planetMaterial.name = "mushroom-observatory-planet-material";
  const planets = new THREE.Mesh(createQuadGeometry(3), planetMaterial);
  planets.name = OBSERVATORY_PLANETS_NAME;
  planets.renderOrder = EVENT_RENDER_ORDER;
  planets.frustumCulled = false;
  planets.visible = false;
  group.add(planets);

  const auroraMaterial = createLayerMaterial({
    uniforms: {
      uRadius: { value: radius },
      uIntensity: { value: 0 },
      uCenterAz: { value: 0 },
      uTime: { value: 0 },
      uMotion: { value: 1 }
    },
    vertexShader: AURORA_VERTEX_SHADER,
    fragmentShader: AURORA_FRAGMENT_SHADER
  });
  auroraMaterial.name = "mushroom-observatory-aurora-material";
  const aurora = new THREE.Mesh(createAuroraGeometry(), auroraMaterial);
  aurora.name = OBSERVATORY_AURORA_NAME;
  aurora.renderOrder = EVENT_RENDER_ORDER;
  aurora.frustumCulled = false;
  aurora.visible = false;
  group.add(aurora);

  const constellation = new THREE.Group();
  constellation.name = OBSERVATORY_CONSTELLATION_NAME;
  constellation.visible = false;
  const constellationLineMaterial = configureSkyStencil(
    new THREE.LineBasicMaterial({
      color: "#9fd8ff",
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false
    })
  );
  constellationLineMaterial.name =
    "mushroom-observatory-constellation-line-material";
  const constellationLineGeometry = new THREE.BufferGeometry();
  constellationLineGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array(CONSTELLATION_MAX_LINE_VERTICES * 3),
      3
    )
  );
  constellationLineGeometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    OBSERVATORY_SKY_EVENTS_RADIUS + 4
  );
  const constellationLines = new THREE.LineSegments(
    constellationLineGeometry,
    constellationLineMaterial
  );
  constellationLines.name = OBSERVATORY_CONSTELLATION_LINES_NAME;
  constellationLines.renderOrder = EVENT_RENDER_ORDER;
  constellationLines.frustumCulled = false;
  const constellationStarMaterial = configureSkyStencil(
    new THREE.PointsMaterial({
      color: "#dff0ff",
      size: 6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false
    })
  );
  constellationStarMaterial.name =
    "mushroom-observatory-constellation-star-material";
  const constellationStarGeometry = new THREE.BufferGeometry();
  constellationStarGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array(CONSTELLATION_MAX_POINTS * 3),
      3
    )
  );
  constellationStarGeometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    OBSERVATORY_SKY_EVENTS_RADIUS + 4
  );
  const constellationStars = new THREE.Points(
    constellationStarGeometry,
    constellationStarMaterial
  );
  constellationStars.name = OBSERVATORY_CONSTELLATION_STARS_NAME;
  constellationStars.renderOrder = EVENT_RENDER_ORDER;
  constellationStars.frustumCulled = false;
  constellation.add(constellationLines);
  constellation.add(constellationStars);
  group.add(constellation);

  const moonMaterial = createLayerMaterial({
    uniforms: {
      uRadius: { value: radius },
      uIntensity: { value: 0 },
      uHalfSize: { value: 5.4 },
      uPhase: { value: 0 },
      uPathStart: { value: new THREE.Vector3(1, 0.5, 0).normalize() },
      uPathTangent: { value: new THREE.Vector3(0, 0.4, 1).normalize() },
      uPathAngle: { value: 0 }
    },
    vertexShader: MOON_VERTEX_SHADER,
    fragmentShader: MOON_FRAGMENT_SHADER
  });
  moonMaterial.name = "mushroom-observatory-moon-material";
  const moon = new THREE.Mesh(createQuadGeometry(1), moonMaterial);
  moon.name = OBSERVATORY_MOON_NAME;
  moon.renderOrder = EVENT_RENDER_ORDER;
  moon.frustumCulled = false;
  moon.visible = false;
  group.add(moon);

  const kilonova = anchoredQuadMesh({
    name: OBSERVATORY_KILONOVA_NAME,
    halfSize: 46,
    fragmentShader: KILONOVA_FRAGMENT_SHADER,
    extraUniforms: { uProgress: { value: 0 } }
  });
  group.add(kilonova);

  const ufo = anchoredQuadMesh({
    name: OBSERVATORY_UFO_NAME,
    halfSize: 1.15,
    fragmentShader: UFO_FRAGMENT_SHADER,
    extraUniforms: { uTime: { value: 0 } }
  });
  group.add(ufo);

  group.userData.meteors = meteors;
  group.userData.comet = comet;
  group.userData.supernova = supernova;
  group.userData.bolide = bolide;
  group.userData.satellites = satellites;
  group.userData.planets = planets;
  group.userData.aurora = aurora;
  group.userData.constellation = constellation;
  group.userData.constellationLines = constellationLines;
  group.userData.constellationStars = constellationStars;
  group.userData.moon = moon;
  group.userData.kilonova = kilonova;
  group.userData.ufo = ufo;
  group.userData.appliedSeeds = {};
  group.userData.ufoPath = null;
  group.userData.disposed = false;
  return group;
}

/* --------------------------- seed application ------------------------- */

function applyCometPath(group, seed) {
  const random = seededRandom(seedInteger(seed, 0xc0e7));
  seededGreatCircle(random, pathStartScratch, pathTangentScratch);
  const material = group.userData.comet.material;
  material.uniforms.uPathStart.value.copy(pathStartScratch);
  material.uniforms.uPathTangent.value.copy(pathTangentScratch);
}

function applyGreatCirclePath(material, seed, salt) {
  const random = seededRandom(seedInteger(seed, salt));
  seededGreatCircle(random, pathStartScratch, pathTangentScratch);
  material.uniforms.uPathStart.value.copy(pathStartScratch);
  material.uniforms.uPathTangent.value.copy(pathTangentScratch);
  return random;
}

function applyAnchoredDirection(material, seed, salt, minAlt, maxAlt) {
  const random = seededRandom(seedInteger(seed, salt));
  seededDirection(random, minAlt, maxAlt, material.uniforms.uDir.value);
  return random;
}

function applyConstellation(group, seed) {
  const random = seededRandom(seedInteger(seed, 0x57a5));
  const shapes = OBSERVATORY_CONSTELLATION_SHAPES;
  const shape = shapes[Math.min(
    shapes.length - 1,
    Math.floor(random() * shapes.length)
  )];
  seededDirection(random, 0.5, 1.1, constellationDirScratch);
  const roll = random() * Math.PI * 2;
  constellationUpScratch.set(0, 1, 0);
  if (Math.abs(constellationDirScratch.y) > 0.94) {
    constellationUpScratch.set(1, 0, 0);
  }
  constellationEastScratch.crossVectors(
    constellationUpScratch,
    constellationDirScratch
  ).normalize();
  constellationNorthScratch.crossVectors(
    constellationDirScratch,
    constellationEastScratch
  ).normalize();
  // Bake the roll into the basis so the whole figure rotates together.
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);
  const east = constellationEastScratch.clone();
  constellationEastScratch.multiplyScalar(cosRoll)
    .addScaledVector(constellationNorthScratch, sinRoll)
    .normalize();
  constellationNorthScratch.multiplyScalar(cosRoll)
    .addScaledVector(east, -sinRoll)
    .normalize();

  const radius = group.userData.moon.material.uniforms.uRadius.value;
  const scale = CONSTELLATION_SCALE_RADIANS * radius;

  const lines = group.userData.constellationLines;
  const stars = group.userData.constellationStars;
  const linePositions = lines.geometry.attributes.position.array;
  const starPositions = stars.geometry.attributes.position.array;
  shape.points.forEach(([x, y], index) => {
    writeConstellationVertex(
      starPositions,
      index * 3,
      x * scale,
      y * scale,
      radius
    );
  });
  shape.lines.forEach(([from, to], index) => {
    const [fx, fy] = shape.points[from];
    const [tx, ty] = shape.points[to];
    writeConstellationVertex(
      linePositions,
      index * 6,
      fx * scale,
      fy * scale,
      radius
    );
    writeConstellationVertex(
      linePositions,
      index * 6 + 3,
      tx * scale,
      ty * scale,
      radius
    );
  });
  lines.geometry.attributes.position.needsUpdate = true;
  stars.geometry.attributes.position.needsUpdate = true;
  lines.geometry.setDrawRange(0, shape.lines.length * 2);
  stars.geometry.setDrawRange(0, shape.points.length);
}

function applyUfoPath(group, seed) {
  const random = seededRandom(seedInteger(seed, 0x0f0));
  seededDirection(random, 0.5, 1.0, ufoBaseScratch);
  ufoEastScratch.set(0, 1, 0);
  if (Math.abs(ufoBaseScratch.y) > 0.94) ufoEastScratch.set(1, 0, 0);
  const east = new THREE.Vector3()
    .crossVectors(ufoEastScratch, ufoBaseScratch)
    .normalize();
  const north = new THREE.Vector3()
    .crossVectors(ufoBaseScratch, east)
    .normalize();
  ufoNorthScratch.copy(north);
  const waypoints = [];
  for (let index = 0; index <= UFO_SEGMENT_COUNT; index += 1) {
    // The final waypoint darts far off the patch — the exit dash.
    const reach = index === UFO_SEGMENT_COUNT ? 0.55 : 0.15;
    waypoints.push(
      ufoBaseScratch.clone()
        .addScaledVector(east, (random() - 0.5) * 2 * reach)
        .addScaledVector(north, (random() - 0.5) * 2 * reach)
        .normalize()
    );
  }
  group.userData.ufoPath = waypoints;
}

function updateUfoDirection(group, progress) {
  const waypoints = group.userData.ufoPath;
  if (!waypoints) return;
  const clamped = Math.min(0.999, Math.max(0, progress));
  const scaled = clamped * UFO_SEGMENT_COUNT;
  const segment = Math.floor(scaled);
  const local = scaled - segment;
  // Hold for 55% of each segment, then dash with a smoothstep ease.
  const dash = Math.min(1, Math.max(0, (local - 0.55) / 0.45));
  const eased = dash * dash * (3 - 2 * dash);
  ufoFromScratch.copy(waypoints[segment]);
  ufoToScratch.copy(waypoints[Math.min(segment + 1, waypoints.length - 1)]);
  const material = group.userData.ufo.material;
  material.uniforms.uDir.value
    .copy(ufoFromScratch)
    .lerp(ufoToScratch, eased)
    .normalize();
}

/* -------------------------------- update ------------------------------ */

function seedApplied(group, key, seed, apply) {
  if (group.userData.appliedSeeds[key] === seed) return;
  group.userData.appliedSeeds[key] = seed;
  apply();
}

/**
 * Drive every event layer from the director's channel set. Only the active
 * event's channel is non-zero, so at most one layer group renders per frame.
 */
export function updateObservatorySkyEventsVisual(
  group,
  {
    timeSeconds = 0,
    channels = null,
    progress = 0,
    seed = 0,
    motionScale = 1,
    intensityScale = 1
  } = {}
) {
  if (!group || group.userData.disposed) return false;
  const level = (key, motionSuppressed = false) => (
    Math.max(0, channels?.[key] ?? 0)
      * intensityScale
      * (motionSuppressed ? motionScale : 1)
  );

  const meteors = group.userData.meteors;
  const meteorIntensity = level("meteor", true);
  meteors.visible = meteorIntensity > 0.001;
  if (meteors.visible) {
    meteors.material.uniforms.uTime.value = timeSeconds;
    meteors.material.uniforms.uIntensity.value = meteorIntensity;
  }

  const comet = group.userData.comet;
  const cometIntensity = level("comet");
  comet.visible = cometIntensity > 0.001;
  if (comet.visible) {
    seedApplied(group, "comet", seed, () => applyCometPath(group, seed));
    comet.material.uniforms.uIntensity.value = cometIntensity;
    // Apex-centred crossing: rise through the first half, set through the
    // second, staying above the dome horizon for the whole event.
    comet.material.uniforms.uPathAngle.value =
      (Math.min(1, Math.max(0, progress)) - 0.5) * 1.9;
  }

  const supernova = group.userData.supernova;
  const supernovaIntensity = level("supernova");
  supernova.visible = supernovaIntensity > 0.001;
  if (supernova.visible) {
    seedApplied(group, "supernova", seed, () => {
      applyAnchoredDirection(supernova.material, seed, 0x5a97, 0.45, 1.15);
    });
    supernova.material.uniforms.uIntensity.value = supernovaIntensity;
    supernova.material.uniforms.uProgress.value = progress;
  }

  const bolide = group.userData.bolide;
  const bolideIntensity = level("bolide", true);
  bolide.visible = bolideIntensity > 0.001;
  if (bolide.visible) {
    seedApplied(group, "bolide", seed, () => {
      applyGreatCirclePath(bolide.material, seed, 0xb011);
    });
    bolide.material.uniforms.uIntensity.value = bolideIntensity;
    bolide.material.uniforms.uProgress.value = progress;
  }

  const satellites = group.userData.satellites;
  const satelliteIntensity = level("satellites", true);
  satellites.visible = satelliteIntensity > 0.001;
  if (satellites.visible) {
    seedApplied(group, "satellites", seed, () => {
      applyGreatCirclePath(satellites.material, seed, 0x5a7e);
    });
    satellites.material.uniforms.uIntensity.value = satelliteIntensity;
    satellites.material.uniforms.uProgress.value = progress;
  }

  const planets = group.userData.planets;
  const planetIntensity = level("planets");
  planets.visible = planetIntensity > 0.001;
  if (planets.visible) {
    seedApplied(group, "planets", seed, () => {
      applyAnchoredDirection(planets.material, seed, 0x91a7, 0.4, 1.0);
    });
    planets.material.uniforms.uIntensity.value = planetIntensity;
    // The conjunction slowly relaxes: bodies drift apart through the event.
    planets.material.uniforms.uSeparation.value =
      0.008 + Math.min(1, Math.max(0, progress)) * 0.02;
  }

  const aurora = group.userData.aurora;
  const auroraIntensity = level("aurora");
  aurora.visible = auroraIntensity > 0.001;
  if (aurora.visible) {
    seedApplied(group, "aurora", seed, () => {
      const random = seededRandom(seedInteger(seed, 0xa42a));
      aurora.material.uniforms.uCenterAz.value = random() * Math.PI * 2;
    });
    aurora.material.uniforms.uIntensity.value = auroraIntensity;
    aurora.material.uniforms.uTime.value = timeSeconds;
    aurora.material.uniforms.uMotion.value = motionScale;
  }

  const constellation = group.userData.constellation;
  const constellationIntensity = level("constellation");
  constellation.visible = constellationIntensity > 0.001;
  if (constellation.visible) {
    seedApplied(group, "constellation", seed, () => {
      applyConstellation(group, seed);
    });
    group.userData.constellationLines.material.opacity =
      0.85 * constellationIntensity;
    group.userData.constellationStars.material.opacity =
      Math.min(1, 1.2 * constellationIntensity);
  }

  const moon = group.userData.moon;
  const moonIntensity = level("moon");
  moon.visible = moonIntensity > 0.001;
  if (moon.visible) {
    seedApplied(group, "moon", seed, () => {
      const random = applyGreatCirclePath(moon.material, seed, 0x300d);
      moon.material.uniforms.uPhase.value = random() * Math.PI * 2;
    });
    moon.material.uniforms.uIntensity.value = moonIntensity;
    moon.material.uniforms.uPathAngle.value =
      (Math.min(1, Math.max(0, progress)) - 0.5) * 1.3;
  }

  const kilonova = group.userData.kilonova;
  const kilonovaIntensity = level("kilonova");
  kilonova.visible = kilonovaIntensity > 0.001;
  if (kilonova.visible) {
    seedApplied(group, "kilonova", seed, () => {
      applyAnchoredDirection(kilonova.material, seed, 0x717a, 0.55, 1.1);
    });
    kilonova.material.uniforms.uIntensity.value = kilonovaIntensity;
    kilonova.material.uniforms.uProgress.value = progress;
  }

  const ufo = group.userData.ufo;
  const ufoIntensity = level("ufo", true);
  ufo.visible = ufoIntensity > 0.001;
  if (ufo.visible) {
    seedApplied(group, "ufo", seed, () => applyUfoPath(group, seed));
    updateUfoDirection(group, progress);
    ufo.material.uniforms.uIntensity.value = ufoIntensity;
    ufo.material.uniforms.uTime.value = timeSeconds;
  }

  group.visible = meteors.visible
    || comet.visible
    || supernova.visible
    || bolide.visible
    || satellites.visible
    || planets.visible
    || aurora.visible
    || constellation.visible
    || moon.visible
    || kilonova.visible
    || ufo.visible;
  return group.visible;
}

export function disposeObservatorySkyEventsVisual(group) {
  if (!group || group.userData.disposed) return;
  group.userData.disposed = true;
  const disposeObject = (object) => {
    if (!object) return;
    object.geometry?.dispose();
    object.material?.dispose();
    object.removeFromParent();
  };
  for (const key of [
    "meteors",
    "comet",
    "supernova",
    "bolide",
    "satellites",
    "planets",
    "aurora",
    "constellationLines",
    "constellationStars",
    "moon",
    "kilonova",
    "ufo"
  ]) {
    disposeObject(group.userData[key]);
    group.userData[key] = null;
  }
  group.userData.constellation?.removeFromParent();
  group.userData.constellation = null;
  group.userData.ufoPath = null;
  group.remove(...group.children);
  group.removeFromParent();
}
