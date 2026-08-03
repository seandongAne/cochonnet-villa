import * as THREE from "three";

import {
  MUSHROOM_INTERIOR_CENTER,
  MUSHROOM_INTERIOR_EYE_Y,
  MUSHROOM_INTERIOR_LOCAL_RADIUS,
  MUSHROOM_INTERIOR_SCALE
} from "./mushroom-interior-config.js";
import { normalizeObservatoryQuality } from "./observatory-quality.js";

export const OBSERVATORY_STAR_VOLUME_NAME = "mushroom-observatory-star-volume";
export const OBSERVATORY_STAR_VOLUME_POINTS_NAME =
  "mushroom-observatory-star-volume-points";
export const OBSERVATORY_STAR_VOLUME_MATERIAL_NAME =
  "mushroom-observatory-star-volume-material";
export const OBSERVATORY_STAR_VOLUME_STENCIL_REF = 7;
export const OBSERVATORY_STAR_VOLUME_DEFAULT_SEED = 0x73746172;

// This is the same finite direction used by the Observatory Lab lens anchor.
// Keeping the default here avoids a React/runtime import while still arranging
// the sparse foreground volume around (but never through) the event horizon.
export const OBSERVATORY_STAR_VOLUME_BLACK_HOLE_DIRECTION = Object.freeze({
  x: 0.11776325,
  y: 0.98693308,
  z: -0.10997683
});

// All three bands sit close to the camera's 200 m far plane, with deliberate
// gaps between them. Translation still produces a subtle near/middle/far
// depth ordering, but no star can read as a room-scale light floating beside
// the visitor. Gaia and the 4K panorama remain camera-centred at infinity.
export const OBSERVATORY_STAR_VOLUME_SHELLS = Object.freeze([
  Object.freeze({ id: "near", minRadius: 72, maxRadius: 96 }),
  Object.freeze({ id: "middle", minRadius: 112, maxRadius: 145 }),
  Object.freeze({ id: "far", minRadius: 160, maxRadius: 184 })
]);

// This remains much smaller than Gaia's 8k/35k/80k catalogue, but is dense
// enough to make lateral movement reveal several shallow distance layers. The
// entire volume remains one draw call at every non-Minimum tier.
export const OBSERVATORY_STAR_VOLUME_COUNTS = Object.freeze({
  minimum: Object.freeze({ stars: 0, dust: 0, total: 0 }),
  low: Object.freeze({ stars: 800, dust: 120, total: 920 }),
  medium: Object.freeze({ stars: 2400, dust: 360, total: 2760 }),
  high: Object.freeze({ stars: 5200, dust: 720, total: 5920 })
});

const QUALITY_LEVEL = Object.freeze({ minimum: 0, low: 1, medium: 2, high: 3 });
const QUALITY_ORDER = Object.freeze(["low", "medium", "high"]);
const STAR_KIND = 0;
const DUST_KIND = 1;
const VISIBILITY_EPSILON = 0.001;
const ROOM_SAFE_RADIUS =
  MUSHROOM_INTERIOR_LOCAL_RADIUS * MUSHROOM_INTERIOR_SCALE + 0.9;
const TWO_PI = Math.PI * 2;

const STAR_VOLUME_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uPixelRatio;
  uniform float uQualityLevel;

  attribute float aKind;
  attribute float aPhase;
  attribute float aPeriod;
  attribute float aTemperature;
  attribute float aQualityRank;
  attribute float aShell;
  attribute float aDrift;
  attribute float aBrightness;

  varying float vAlpha;
  varying float vKind;
  varying float vPhase;
  varying float vPeriod;
  varying float vTemperature;
  varying float vBrightness;
  varying float vSpriteSizePx;

  void main() {
    float enabled = 1.0 - step(uQualityLevel + 0.01, aQualityRank);
    vec3 radial = normalize(position);
    vec3 helper = abs(radial.y) > 0.92
      ? vec3(1.0, 0.0, 0.0)
      : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(helper, radial));
    vec3 bitangent = normalize(cross(radial, tangent));

    // Dust drifts only a few centimetres in world space. Stars move even less;
    // the dominant depth cue remains honest camera translation parallax.
    float driftClock = uTime / max(3.0, aPeriod * 1.7);
    vec3 displaced = position
      + tangent * sin(driftClock + aPhase) * aDrift
      + bitangent * cos(driftClock * 0.73 + aPhase * 1.31) * aDrift * 0.58;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vec4 viewPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * viewPosition;

    // Stars are unresolved light sources: distance changes their parallax and
    // flux, never their apparent diameter. A fixed support sprite gives the
    // analytic ~1 CSS-pixel PSF and rare diffraction tail enough HiDPI samples.
    // The legacy aSize geometry attribute is intentionally not consumed.
    float spriteSizeCss = mix(7.0, 5.0, aKind);
    gl_PointSize = enabled > 0.5 ? spriteSizeCss * uPixelRatio : 0.0;

    // Even if a visitor reaches the extreme wall edge, no point pops through
    // the camera. This fade is normally 1 because generation starts outside
    // the physical room and dome safety envelope.
    float cameraSafety = smoothstep(2.8, 6.2, distance(worldPosition.xyz, cameraPosition));
    // The close layer is only a quiet parallax reference. Most visible energy
    // lives in the dense far shell so the field reads as deep space.
    float shellAttenuation = mix(0.32, 0.88, aShell / 2.0);
    vAlpha = enabled * uReveal * cameraSafety;
    vKind = aKind;
    vPhase = aPhase;
    vPeriod = aPeriod;
    vTemperature = aTemperature;
    vBrightness = aBrightness * shellAttenuation;
    vSpriteSizePx = gl_PointSize;
  }
`;

const STAR_VOLUME_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;

  varying float vAlpha;
  varying float vKind;
  varying float vPhase;
  varying float vPeriod;
  varying float vTemperature;
  varying float vBrightness;
  varying float vSpriteSizePx;

  const float PI = 3.141592653589793;

  void main() {
    vec2 centred = gl_PointCoord - vec2(0.5);
    if (vAlpha < 0.001) discard;
    float safePixelRatio = max(uPixelRatio, 0.5);
    vec2 pixelPositionCss = centred * max(vSpriteSizePx, 1.0)
      / safePixelRatio;
    float pixelRadiusCss = length(pixelPositionCss);
    float prominence = smoothstep(0.18, 1.8, vBrightness);

    // Per-point period and phase prevent a synchronized ceiling pulse. A weak
    // second oscillator breaks the repeated sine silhouette without becoming
    // the large SDF flare already supplied by the distant hero-star layer.
    float phase = uTime * (2.0 * PI / max(0.5, vPeriod)) + vPhase;
    float asynchronousTwinkle = 0.985
      + 0.01 * sin(phase)
      + 0.005 * sin(phase * 0.37 + vPhase * 1.73);

    // Fixed-energy analytic point-spread function. sigma=0.42 CSS px gives a
    // ~0.99 CSS-pixel FWHM at every DPR. There is no brightness-driven radius,
    // isotropic glow halo, or size pulse: stellar energy stays in RGB below.
    const float STAR_SIGMA_CSS = 0.42;
    const float DUST_SIGMA_CSS = 0.31;
    float starCore = exp(
      -0.5 * pow(pixelRadiusCss / STAR_SIGMA_CSS, 2.0)
    );
    float dustCore = exp(
      -0.5 * pow(pixelRadiusCss / DUST_SIGMA_CSS, 2.0)
    );

    // Only the brightest ~2% of the deterministic population reaches this
    // gate. Per-star rotation avoids a repeated stylised cross icon.
    float diffractionGate = smoothstep(3.35, 4.05, vBrightness);
    float spikeAngle = vPhase * 0.5;
    float spikeCos = cos(spikeAngle);
    float spikeSin = sin(spikeAngle);
    vec2 spikePosition = mat2(
      spikeCos, -spikeSin,
      spikeSin, spikeCos
    ) * pixelPositionCss;
    float transverseWidth = 0.16;
    float longitudinalWidth = 2.15;
    float verticalSpike = exp(
      -0.5 * pow(spikePosition.x / transverseWidth, 2.0)
    ) * exp(
      -0.5 * pow(spikePosition.y / longitudinalWidth, 2.0)
    );
    float horizontalSpike = exp(
      -0.5 * pow(spikePosition.y / transverseWidth, 2.0)
    ) * exp(
      -0.5 * pow(spikePosition.x / longitudinalWidth, 2.0)
    );
    float diffractionSpike = (verticalSpike + horizontalSpike)
      * diffractionGate * 0.052;
    float edge = max(abs(centred.x), abs(centred.y));
    float edgeAA = max(fwidth(edge), 0.001);
    float spriteSupport = 1.0 - smoothstep(0.5 - edgeAA, 0.5, edge);
    float starPsf = clamp(
      (starCore + diffractionSpike) * spriteSupport,
      0.0,
      1.0
    );
    float dustPsf = dustCore * spriteSupport;
    float pulse = mix(0.995, asynchronousTwinkle, prominence);

    vec3 warm = vec3(1.0, 0.91, 0.83);
    vec3 neutral = vec3(0.96, 0.98, 1.0);
    vec3 cool = vec3(0.84, 0.91, 1.0);
    vec3 colour = vTemperature < 0.5
      ? mix(warm, neutral, vTemperature * 2.0)
      : mix(neutral, cool, (vTemperature - 0.5) * 2.0);
    float chroma = mix(0.1, 0.42, prominence);
    colour = mix(vec3(1.0), colour, chroma);

    // Brightness belongs in RGB, not alpha: AdditiveBlending applies source
    // alpha once. This preserves a physical long-tail radiance distribution
    // instead of squaring it and inflating bright stars into opaque bulbs.
    float coverage = mix(starPsf, dustPsf, vKind);
    float alpha = coverage * vAlpha;
    if (alpha < 1.0 / 2048.0) discard;
    // AdditiveBlending already multiplies RGB by source alpha. Supplying
    // straight (rather than premultiplied) colour keeps faint dust readable
    // without squaring its deliberately low opacity.
    vec3 starSource = colour * vBrightness * pulse;
    vec3 dustSource = vec3(0.35, 0.45, 0.62) * vBrightness * 0.0025;
    gl_FragColor = vec4(mix(starSource, dustSource, vKind), alpha);
    #include <colorspace_fragment>
  }
`;

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

function copyVector3(target, value, fallback) {
  if (value?.isVector3) return target.copy(value);
  if (Array.isArray(value) && value.length >= 3) {
    return target.set(value[0], value[1], value[2]);
  }
  if (value && [value.x, value.y, value.z].every(Number.isFinite)) {
    return target.set(value.x, value.y, value.z);
  }
  return target.copy(fallback);
}

function configureStencilTest(material) {
  material.stencilWrite = true;
  material.stencilRef = OBSERVATORY_STAR_VOLUME_STENCIL_REF;
  material.stencilFunc = THREE.EqualStencilFunc;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.KeepStencilOp;
  return material;
}

function createFocusBasis(direction) {
  const helper = Math.abs(direction.y) > 0.92
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3().crossVectors(helper, direction).normalize();
  const bitangent = new THREE.Vector3().crossVectors(direction, tangent).normalize();
  return { tangent, bitangent };
}

function directionAroundFocus(random, focusDirection, focusBasis, kind) {
  const minimumAngle = kind === DUST_KIND ? 0.105 : 0.145;
  const maximumAngle = kind === DUST_KIND ? 0.46 : 0.6;
  const angle = THREE.MathUtils.lerp(
    minimumAngle,
    maximumAngle,
    Math.sqrt(random())
  );
  const azimuth = random() * TWO_PI;
  const direction = focusDirection.clone().multiplyScalar(Math.cos(angle));
  direction.addScaledVector(
    focusBasis.tangent,
    Math.sin(angle) * Math.cos(azimuth)
  );
  direction.addScaledVector(
    focusBasis.bitangent,
    Math.sin(angle) * Math.sin(azimuth)
  );
  return direction.normalize();
}

function randomDomeDirection(random) {
  const y = THREE.MathUtils.lerp(-0.2, 1, random());
  const azimuth = random() * TWO_PI;
  const horizontal = Math.sqrt(Math.max(0, 1 - y * y));
  return new THREE.Vector3(
    Math.cos(azimuth) * horizontal,
    y,
    Math.sin(azimuth) * horizontal
  );
}

function isSafeVolumePosition(position, direction, focusDirection, kind) {
  const horizontalRadius = Math.hypot(position.x, position.z);
  const clearsRoom = horizontalRadius >= ROOM_SAFE_RADIUS
    || position.y >= ROOM_SAFE_RADIUS;
  if (!clearsRoom) return false;

  // Preserve an actual dark event-horizon core. Dust is allowed closer than
  // stars so it can describe the lens in depth without painting over it.
  const clearanceAngle = kind === DUST_KIND ? 0.075 : 0.115;
  return direction.dot(focusDirection) <= Math.cos(clearanceAngle);
}

function chooseShell(index) {
  // Stable 10/25/65 split puts most samples near the far plane while retaining
  // two quieter reference layers for subtle translation parallax.
  const slot = index % 20;
  if (slot < 2) return 0;
  if (slot < 7) return 1;
  return 2;
}

function createRecord(random, index, kind, qualityRank, focusDirection, focusBasis) {
  const shellIndex = chooseShell(index);
  const shell = OBSERVATORY_STAR_VOLUME_SHELLS[shellIndex];
  let direction;
  let position;

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const focusProbability = kind === DUST_KIND ? 0.44 : 0.11;
    direction = random() < focusProbability
      ? directionAroundFocus(random, focusDirection, focusBasis, kind)
      : randomDomeDirection(random);
    const radius = THREE.MathUtils.lerp(
      shell.minRadius,
      shell.maxRadius,
      random()
    );
    position = direction.clone().multiplyScalar(radius);
    if (isSafeVolumePosition(position, direction, focusDirection, kind)) break;
    position = null;
  }

  // The acceptance region is intentionally broad, so this is only a total
  // safety fallback for pathological custom focus directions.
  if (!position) {
    direction = new THREE.Vector3(-focusDirection.z, 0.36, focusDirection.x)
      .normalize();
    position = direction.multiplyScalar(shell.maxRadius);
  }

  const phase = random() * TWO_PI;
  const period = kind === STAR_KIND
    ? THREE.MathUtils.lerp(2.35, 7.4, random())
    : THREE.MathUtils.lerp(7.5, 16, random());
  const size = kind === STAR_KIND
    ? THREE.MathUtils.lerp(0.48, 1.04, Math.pow(random(), 1.7))
    : THREE.MathUtils.lerp(0.42, 0.72, random());
  const temperature = THREE.MathUtils.clamp(
    0.5 + (random() - 0.5) * 0.86,
    0,
    1
  );
  const drift = kind === STAR_KIND
    ? THREE.MathUtils.lerp(0.008, 0.028, random())
    : THREE.MathUtils.lerp(0.035, 0.16, random());
  const luminosity = random();
  const brightness = kind === STAR_KIND
    ? 0.055
      + 0.48 * Math.pow(luminosity, 2.7)
      + 3.8 * Math.pow(luminosity, 18)
    : THREE.MathUtils.lerp(0.018, 0.055, luminosity);

  return {
    position,
    kind,
    phase,
    period,
    size,
    temperature,
    qualityRank,
    shell: shellIndex,
    drift,
    brightness
  };
}

function createRecords(seed, focusDirection) {
  const random = seededRandom(seed);
  const focusBasis = createFocusBasis(focusDirection);
  const records = [];
  let globalIndex = 0;

  for (const [kind, countKey] of [[STAR_KIND, "stars"], [DUST_KIND, "dust"]]) {
    let previousCount = 0;
    for (const quality of QUALITY_ORDER) {
      const targetCount = OBSERVATORY_STAR_VOLUME_COUNTS[quality][countKey];
      const qualityRank = QUALITY_LEVEL[quality];
      for (let index = previousCount; index < targetCount; index += 1) {
        records.push(createRecord(
          random,
          globalIndex,
          kind,
          qualityRank,
          focusDirection,
          focusBasis
        ));
        globalIndex += 1;
      }
      previousCount = targetCount;
    }
  }
  return records;
}

function createGeometry(seed, focusDirection) {
  const records = createRecords(seed, focusDirection);
  const count = records.length;
  const positions = new Float32Array(count * 3);
  const kinds = new Float32Array(count);
  const phases = new Float32Array(count);
  const periods = new Float32Array(count);
  const sizes = new Float32Array(count);
  const temperatures = new Float32Array(count);
  const qualityRanks = new Float32Array(count);
  const shells = new Float32Array(count);
  const drifts = new Float32Array(count);
  const brightnesses = new Float32Array(count);

  records.forEach((record, index) => {
    const offset = index * 3;
    positions[offset] = record.position.x;
    positions[offset + 1] = record.position.y;
    positions[offset + 2] = record.position.z;
    kinds[index] = record.kind;
    phases[index] = record.phase;
    periods[index] = record.period;
    sizes[index] = record.size;
    temperatures[index] = record.temperature;
    qualityRanks[index] = record.qualityRank;
    shells[index] = record.shell;
    drifts[index] = record.drift;
    brightnesses[index] = record.brightness;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aKind", new THREE.BufferAttribute(kinds, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aPeriod", new THREE.BufferAttribute(periods, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aTemperature", new THREE.BufferAttribute(temperatures, 1));
  geometry.setAttribute("aQualityRank", new THREE.BufferAttribute(qualityRanks, 1));
  geometry.setAttribute("aShell", new THREE.BufferAttribute(shells, 1));
  geometry.setAttribute("aDrift", new THREE.BufferAttribute(drifts, 1));
  geometry.setAttribute("aBrightness", new THREE.BufferAttribute(brightnesses, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function createMaterial() {
  const material = configureStencilTest(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uPixelRatio: { value: 1 },
      uQualityLevel: { value: QUALITY_LEVEL.medium }
    },
    vertexShader: STAR_VOLUME_VERTEX_SHADER,
    fragmentShader: STAR_VOLUME_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    // The pocket is buried under the meadow. The physical dome's late,
    // depth-tested stencil has already rejected room/furniture foreground;
    // testing these exterior finite points against the ordinary scene depth
    // would let the meadow above incorrectly hide the middle/far shells.
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false
  }));
  material.name = OBSERVATORY_STAR_VOLUME_MATERIAL_NAME;
  return material;
}

function resolveUpdateOptions(motionScaleOrOptions, quality, extraOptions) {
  if (motionScaleOrOptions && typeof motionScaleOrOptions === "object") {
    return motionScaleOrOptions;
  }
  if (typeof motionScaleOrOptions === "string") {
    return { ...extraOptions, motionScale: 1, quality: motionScaleOrOptions };
  }
  return {
    ...extraOptions,
    motionScale: motionScaleOrOptions,
    quality
  };
}

function normalizedMotionScale(value) {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 1, 0, 2);
}

export function getObservatoryStarVolumeCounts(quality = "medium") {
  return OBSERVATORY_STAR_VOLUME_COUNTS[normalizeObservatoryQuality(quality)];
}

export function createObservatoryStarVolume({
  seed = OBSERVATORY_STAR_VOLUME_DEFAULT_SEED,
  center,
  blackHoleDirection
} = {}) {
  const defaultCenter = new THREE.Vector3(
    MUSHROOM_INTERIOR_CENTER.x,
    MUSHROOM_INTERIOR_EYE_Y[2] - 0.05,
    MUSHROOM_INTERIOR_CENTER.z
  );
  const defaultFocus = new THREE.Vector3(
    OBSERVATORY_STAR_VOLUME_BLACK_HOLE_DIRECTION.x,
    OBSERVATORY_STAR_VOLUME_BLACK_HOLE_DIRECTION.y,
    OBSERVATORY_STAR_VOLUME_BLACK_HOLE_DIRECTION.z
  );
  const focusDirection = copyVector3(
    new THREE.Vector3(),
    blackHoleDirection,
    defaultFocus
  );
  if (focusDirection.lengthSq() < 1e-8) focusDirection.copy(defaultFocus);
  focusDirection.normalize();

  const volume = new THREE.Group();
  volume.name = OBSERVATORY_STAR_VOLUME_NAME;
  copyVector3(volume.position, center, defaultCenter);
  volume.visible = false;

  const points = new THREE.Points(
    createGeometry(seed, focusDirection),
    createMaterial()
  );
  points.name = OBSERVATORY_STAR_VOLUME_POINTS_NAME;
  // Gaia/hero stars draw first; finite depth points then stay behind ordinary
  // translucent room props. The depth-tested dome stencil already owns opaque
  // foreground occlusion for this otherwise impossible buried pocket.
  // Stay behind the finite black-hole composite (-890). The existing Portal
  // dust remains the nearest cosmic layer at -880, so it can still cross and
  // extinguish both the stars and the singularity.
  points.renderOrder = -895;
  points.frustumCulled = false;
  points.visible = false;
  volume.add(points);

  volume.userData.points = points;
  volume.userData.seed = seed >>> 0;
  volume.userData.focusDirection = focusDirection.clone();
  volume.userData.elapsed = 0;
  volume.userData.lastInputTime = null;
  volume.userData.reveal = 0;
  volume.userData.quality = "medium";
  volume.userData.visibilityRequested = true;
  volume.userData.lastCameraPosition = new THREE.Vector3();
  volume.userData.prewarmed = false;
  volume.userData.disposed = false;
  volume.userData.worldAnchored = true;
  return volume;
}

/**
 * Update the fixed finite volume. The fifth argument may be an options object
 * (`{ motionScale, quality, pixelRatio }`) or the positional motion scale,
 * followed by quality. Absolute input time is integrated so motionScale=0
 * freezes twinkle/drift without a jump when animation resumes.
 */
export function updateObservatoryStarVolume(
  volume,
  camera,
  timeSeconds,
  reveal,
  motionScaleOrOptions = 1,
  quality = "medium",
  extraOptions = {}
) {
  if (!volume || volume.userData.disposed) return false;
  const points = volume.userData.points;
  const material = points.material;
  const options = resolveUpdateOptions(
    motionScaleOrOptions,
    quality,
    extraOptions
  );
  const resolvedQuality = normalizeObservatoryQuality(options.quality);
  const qualityLevel = QUALITY_LEVEL[resolvedQuality];
  const resolvedReveal = THREE.MathUtils.clamp(
    Number.isFinite(reveal) ? reveal : 0,
    0,
    1
  );
  const inputTime = Number.isFinite(timeSeconds)
    ? Math.max(0, timeSeconds)
    : (volume.userData.lastInputTime ?? 0);

  if (volume.userData.lastInputTime === null) {
    volume.userData.lastInputTime = inputTime;
  } else {
    const delta = Math.min(
      Math.max(inputTime - volume.userData.lastInputTime, 0),
      0.5
    );
    volume.userData.elapsed += delta * normalizedMotionScale(options.motionScale);
    volume.userData.lastInputTime = inputTime;
  }

  material.uniforms.uTime.value = volume.userData.elapsed;
  material.uniforms.uReveal.value = resolvedReveal;
  material.uniforms.uQualityLevel.value = qualityLevel;
  material.uniforms.uPixelRatio.value = THREE.MathUtils.clamp(
    Number.isFinite(options.pixelRatio) ? options.pixelRatio : 1,
    0.5,
    2
  );

  if (camera?.position?.isVector3) {
    volume.userData.lastCameraPosition.copy(camera.position);
  }
  volume.userData.reveal = resolvedReveal;
  volume.userData.quality = resolvedQuality;

  const active = volume.userData.visibilityRequested
    && qualityLevel > 0
    && resolvedReveal > VISIBILITY_EPSILON;
  volume.visible = active;
  points.visible = active;
  return active;
}

export function setObservatoryStarVolumeVisible(volume, visible) {
  if (!volume || volume.userData.disposed) return false;
  volume.userData.visibilityRequested = Boolean(visible);
  const qualityLevel = QUALITY_LEVEL[volume.userData.quality] ?? 0;
  const active = volume.userData.visibilityRequested
    && qualityLevel > 0
    && volume.userData.reveal > VISIBILITY_EPSILON;
  volume.visible = active;
  volume.userData.points.visible = active;
  return active;
}

/**
 * Temporarily exposes the highest requested shader branch to a caller-owned
 * compile/draw callback, then restores every visibility/uniform value. This
 * keeps WebGL ownership in MushroomObservatoryRuntime while the factory stays
 * importable and testable in Node.
 */
export function prewarmObservatoryStarVolume(
  volume,
  prewarm,
  { quality = "high", pixelRatio = 1 } = {}
) {
  if (!volume || volume.userData.disposed) return false;
  const points = volume.userData.points;
  const material = points.material;
  const snapshot = {
    volumeVisible: volume.visible,
    pointsVisible: points.visible,
    reveal: material.uniforms.uReveal.value,
    pixelRatio: material.uniforms.uPixelRatio.value,
    qualityLevel: material.uniforms.uQualityLevel.value
  };

  volume.visible = true;
  points.visible = true;
  material.uniforms.uReveal.value = 1;
  material.uniforms.uPixelRatio.value = THREE.MathUtils.clamp(pixelRatio, 0.5, 2);
  material.uniforms.uQualityLevel.value = QUALITY_LEVEL[
    normalizeObservatoryQuality(quality)
  ];

  try {
    if (typeof prewarm === "function") prewarm(volume, points, material);
    volume.userData.prewarmed = true;
  } finally {
    volume.visible = snapshot.volumeVisible;
    points.visible = snapshot.pointsVisible;
    material.uniforms.uReveal.value = snapshot.reveal;
    material.uniforms.uPixelRatio.value = snapshot.pixelRatio;
    material.uniforms.uQualityLevel.value = snapshot.qualityLevel;
  }
  return true;
}

export function disposeObservatoryStarVolume(volume) {
  if (!volume || volume.userData.disposed) return false;
  volume.userData.disposed = true;
  volume.visible = false;
  const points = volume.userData.points;
  points.visible = false;
  points.geometry.dispose();
  points.material.dispose();
  volume.clear();
  return true;
}
