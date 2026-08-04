import * as THREE from "three";

import {
  MUSHROOM_FLOOR_Y_RANGES,
  MUSHROOM_INTERIOR_CENTER,
  MUSHROOM_INTERIOR_LOCAL_RADIUS,
  MUSHROOM_INTERIOR_SCALE
} from "./mushroom-interior-config.js";

// The observatory sits below the meadow, so a conventional distant sky would
// be hidden by the terrain above it. Scene.jsx uses the physical roof dome as
// an invisible stencil aperture, then draws this camera-centred sky through
// that aperture. The result behaves like an infinitely distant sky without
// leaking through the round room's walls.
export const MUSHROOM_SKY_NAME = "mushroom-observatory-distant-sky";
export const MUSHROOM_SKY_BACKDROP_NAME = "mushroom-observatory-sky-backdrop";
export const MUSHROOM_SKY_STARS_NAME = "mushroom-observatory-twinkling-stars";
export const MUSHROOM_SKY_APERTURE_NAME = "mushroom-observatory-sky-aperture";
export const MUSHROOM_SKY_RADIUS = 80;
export const MUSHROOM_SKY_STAR_COUNT = 360;
// The photograph is deliberately subdued into a low-frequency Milky Way
// backdrop. Crisp GPU stars and the volumetric dust layer carry the living
// detail; keeping the photograph this subdued stops it reading as the single
// dominant ceiling image.
export const MUSHROOM_SKY_IMAGE_BRIGHTNESS = 0.36;

// Default parent-space direction and angular dimensions for the hidden
// lensing event. Runtime may derive that direction and a restrained angular
// scale from a finite world anchor; the actual far layers remain
// camera-centred, so they still have no ordinary translation parallax.
export const MUSHROOM_SKY_LENS_DEFAULT_DIRECTION = Object.freeze({
  x: 0.31,
  y: 0.79,
  z: -0.53
});
export const MUSHROOM_SKY_LENS_DEFAULT_EINSTEIN_RADIUS = 0.095;
export const MUSHROOM_SKY_LENS_DEFAULT_INFLUENCE_RADIUS = 0.42;
export const MUSHROOM_SKY_LENS_DEFAULT_HORIZON_RADIUS = 0.032;
export const MUSHROOM_SKY_LENS_DEFAULT_RING_STRENGTH = 1.15;

// A complete revolution takes many hours. The motion should be felt as a
// living sky over time, never read as a rotating photograph.
export const MUSHROOM_SKY_BACKDROP_DRIFT = 0.00012;
export const MUSHROOM_SKY_STAR_DRIFT = -0.00028;

// The hero points scintillate by only a few percent. Speed values are radians
// per second, so independent phases remain perceptible without turning the
// ceiling into a synchronized pulse or changing apparent stellar diameter.
export const MUSHROOM_SKY_TWINKLE_SPEED_MIN = 1.15;
export const MUSHROOM_SKY_TWINKLE_SPEED_MAX = 2.9;

const SKY_STENCIL_REF = 7;
// Match mushroom-nebula's precision-friendly clock window. uTime feeds fp32
// sine arguments in the star vertex shader; unwrapped it degrades twinkle in
// multi-hour sessions. 4096 s keeps arguments <= ~11.9k rad (fp32 ULP there is
// ~1.4e-3 rad) and the wrap is harmless for the multiplied twinkle
// frequencies: each star's phases jump at the seam, but aTwinkleStrength caps
// at 0.042, so the worst one-frame flux step is ~8 percent on a handful of
// stars once every ~68 minutes — below the live scintillation amplitude. The
// slow drift rotations are NOT derived from this clock (a 4096 s wrap would
// snap the panorama by ~28 degrees); they integrate incrementally in fp64.
const SKY_TIME_WRAP_SECONDS = 4096;
const APERTURE_RENDER_ORDER = 900;
const BACKDROP_RENDER_ORDER = 901;
// Transparent objects render after the opaque stencil/backdrop regardless of
// this value. A negative order keeps future glass or translucent room decor in
// front of the stars instead of letting celestial points paint over it.
const STAR_RENDER_ORDER = -900;
const SKY_START_ROTATION = -0.34;
const STAR_START_ROTATION = 0.18;

const BACKDROP_VERTEX_SHADER = /* glsl */ `
  varying vec3 vSkyDirection;

  void main() {
    vSkyDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BACKDROP_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uSkyTexture;
  uniform float uBrightness;
  uniform float uReveal;
  uniform float uLensAmount;
  uniform vec3 uLensDirection;
  uniform float uLensEinsteinRadius;
  uniform float uLensInfluenceRadius;
  uniform float uLensHorizonRadius;
  uniform float uLensRingStrength;

  varying vec3 vSkyDirection;

  const float PI = 3.141592653589793;

  vec2 skyUv(vec3 direction) {
    vec3 ray = normalize(direction);
    float u = fract(atan(ray.z, -ray.x) / (2.0 * PI));
    float v = clamp(asin(clamp(ray.y, -1.0, 1.0)) / (0.5 * PI), 0.0, 1.0);
    return vec2(u, v);
  }

  vec3 readSky(vec3 direction) {
    return texture2D(uSkyTexture, skyUv(direction)).rgb;
  }

  float angularDistance(vec3 first, vec3 second) {
    vec3 a = normalize(first);
    vec3 b = normalize(second);
    return atan(length(cross(a, b)), clamp(dot(a, b), -1.0, 1.0));
  }

  vec3 lensBackdropDirection(vec3 apparentDirection) {
    // This branch keeps the ordinary observatory on its original texture path
    // when the hidden event is inactive.
    if (uLensAmount <= 0.0) return apparentDirection;

    vec3 lensDirection = normalize(uLensDirection);
    float alignment = clamp(dot(apparentDirection, lensDirection), -1.0, 1.0);
    float imageAngle = angularDistance(apparentDirection, lensDirection);
    if (imageAngle >= uLensInfluenceRadius) return apparentDirection;

    vec3 radialDirection = apparentDirection - lensDirection * alignment;
    if (length(radialDirection) < 0.00001) {
      vec3 fallbackAxis = abs(lensDirection.y) < 0.92
        ? vec3(0.0, 1.0, 0.0)
        : vec3(1.0, 0.0, 0.0);
      radialDirection = cross(fallbackAxis, lensDirection);
    }
    radialDirection = normalize(radialDirection);

    // Inverse point-mass lens equation. At the Einstein radius every azimuth
    // samples the same source direction, producing a true geometric ring in
    // the panorama rather than a bright decal laid over the photograph.
    float safeImageAngle = max(imageAngle, 0.003);
    float lensSquared = uLensEinsteinRadius * uLensEinsteinRadius * uLensAmount;
    float sourceAngle = imageAngle - lensSquared / safeImageAngle;
    sourceAngle = clamp(
      sourceAngle,
      -uLensInfluenceRadius,
      uLensInfluenceRadius
    );
    float influence = 1.0 - smoothstep(
      uLensEinsteinRadius * 1.45,
      uLensInfluenceRadius,
      imageAngle
    );
    sourceAngle = mix(imageAngle, sourceAngle, influence);
    vec3 sourceDirection = lensDirection * cos(sourceAngle)
      + radialDirection * sin(sourceAngle);
    return normalize(sourceDirection);
  }

  void main() {
    vec3 ray = normalize(vSkyDirection);
    vec3 sampledRay = lensBackdropDirection(ray);
    vec3 referenceAxis = abs(sampledRay.y) > 0.94
      ? vec3(1.0, 0.0, 0.0)
      : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(referenceAxis, sampledRay));
    vec3 bitangent = normalize(cross(sampledRay, tangent));

    // Remove pin-point detail from the photograph without spreading every
    // source star into a visible blur kernel. Only a locally bright centre is
    // pulled toward its four-direction surround; broad Milky Way clouds stay.
    float spread = 0.0035;
    vec3 centre = readSky(sampledRay);
    vec3 surround = (
      readSky(normalize(sampledRay + tangent * spread))
      + readSky(normalize(sampledRay - tangent * spread))
      + readSky(normalize(sampledRay + bitangent * spread))
      + readSky(normalize(sampledRay - bitangent * spread))
    ) * 0.25;
    float centreLuma = dot(centre, vec3(0.2126, 0.7152, 0.0722));
    float surroundLuma = dot(surround, vec3(0.2126, 0.7152, 0.0722));
    float pointDetail = smoothstep(0.035, 0.18, centreLuma - surroundLuma);
    vec3 sky = mix(centre, surround, pointDetail * 0.92);

    // Calm the panorama's non-converging top row at the last few degrees of
    // zenith. The procedural stars keep this patch alive instead of empty.
    float poleBlend = smoothstep(0.992, 0.9997, ray.y);
    sky = mix(sky, vec3(0.012, 0.018, 0.045), poleBlend * 0.78);
    sky = pow(max(sky, vec3(0.0)), vec3(1.06)) * uBrightness * uReveal;

    // A native-fragment event horizon and anti-aliased photon ring make the
    // event unmistakably volumetric even though the original Milky Way remains
    // a panorama. The ring follows the same spherical lens equation as both
    // procedural star layers; it is not baked into or upscaled with the 4K map.
    if (uLensAmount > 0.0) {
      vec3 lensDirection = normalize(uLensDirection);
      float imageAngle = angularDistance(ray, lensDirection);
      float lensVisibility = smoothstep(0.015, 0.16, uLensAmount);
      float lensScale = sqrt(max(uLensAmount, 0.0));
      float horizonRadius = uLensHorizonRadius * lensScale;
      float einsteinRadius = uLensEinsteinRadius * lensScale;
      float pixelAngle = max(fwidth(imageAngle), 0.00028);
      float horizon = 1.0 - smoothstep(
        horizonRadius - pixelAngle * 1.25,
        horizonRadius + pixelAngle * 1.25,
        imageAngle
      );
      float ringWidth = max(pixelAngle * 2.2, uLensEinsteinRadius * 0.026);
      float photonRing = 1.0 - smoothstep(
        ringWidth,
        ringWidth * 2.2,
        abs(imageAngle - einsteinRadius)
      );

      vec3 ringAxis = abs(lensDirection.y) < 0.92
        ? normalize(cross(vec3(0.0, 1.0, 0.0), lensDirection))
        : normalize(cross(vec3(1.0, 0.0, 0.0), lensDirection));
      vec3 ringBitangent = normalize(cross(lensDirection, ringAxis));
      vec3 ringRadial = ray - lensDirection * dot(ray, lensDirection);
      if (length(ringRadial) < 0.00001) ringRadial = ringAxis;
      ringRadial = normalize(ringRadial);
      float ringAzimuth = atan(
        dot(ringRadial, ringBitangent),
        dot(ringRadial, ringAxis)
      );
      float relativisticBeaming = 0.72 + 0.28 * cos(ringAzimuth - 0.65);
      vec3 photonColour = mix(
        vec3(0.44, 0.66, 1.0),
        vec3(1.0, 0.72, 0.34),
        0.5 + 0.5 * cos(ringAzimuth + 0.35)
      );
      sky += photonColour
        * photonRing
        * relativisticBeaming
        * uLensRingStrength
        * lensVisibility
        * uReveal;
      sky *= 1.0 - horizon * lensVisibility;
    }

    gl_FragColor = vec4(sky, 1.0);
    #include <colorspace_fragment>
  }
`;

const STAR_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uLensAmount;
  uniform vec3 uLensDirection;
  uniform float uLensEinsteinRadius;
  uniform float uLensInfluenceRadius;
  uniform float uLensSourceMaskAmount;
  uniform float uLensSourceMaskRadius;

  attribute float aPhase;
  attribute float aTwinkleSpeed;
  attribute float aTwinkleStrength;
  attribute float aSize;
  attribute float aRadiance;
  attribute vec3 aColor;

  varying float vBrightness;
  varying float vLensMagnification;
  varying float vLensSourceVisibility;
  varying float vPsfScale;
  varying float vRadiance;
  varying float vSpriteSizePx;
  varying vec3 vColor;

  float angularDistance(vec3 first, vec3 second) {
    vec3 a = normalize(first);
    vec3 b = normalize(second);
    return atan(length(cross(a, b)), clamp(dot(a, b), -1.0, 1.0));
  }

  vec3 lensStarPosition(vec3 sourcePosition) {
    if (uLensAmount <= 0.0) return sourcePosition;

    float sphereRadius = length(sourcePosition);
    vec3 sourceDirection = sourcePosition / max(sphereRadius, 0.0001);
    vec3 lensDirection = normalize(uLensDirection);
    float alignment = clamp(dot(sourceDirection, lensDirection), -1.0, 1.0);
    float sourceAngle = angularDistance(sourceDirection, lensDirection);
    if (sourceAngle >= uLensInfluenceRadius) return sourcePosition;

    vec3 radialDirection = sourceDirection - lensDirection * alignment;
    if (length(radialDirection) < 0.00001) {
      vec3 fallbackAxis = abs(lensDirection.y) < 0.92
        ? vec3(0.0, 1.0, 0.0)
        : vec3(1.0, 0.0, 0.0);
      radialDirection = cross(fallbackAxis, lensDirection);
    }
    radialDirection = normalize(radialDirection);

    float lensSquared = uLensEinsteinRadius * uLensEinsteinRadius * uLensAmount;
    float imageAngle = 0.5 * (
      sourceAngle + sqrt(sourceAngle * sourceAngle + 4.0 * lensSquared)
    );
    float influence = 1.0 - smoothstep(
      uLensEinsteinRadius * 1.35,
      uLensInfluenceRadius,
      sourceAngle
    );
    imageAngle = mix(sourceAngle, imageAngle, influence);
    vec3 apparentDirection = lensDirection * cos(imageAngle)
      + radialDirection * sin(imageAngle);
    return normalize(apparentDirection) * sphereRadius;
  }

  void main() {
    float wave = sin(uTime * aTwinkleSpeed + aPhase);
    float secondWave = sin(uTime * (aTwinkleSpeed * 0.61) + aPhase * 1.73);
    // Atmospheric scintillation is a weak radiance modulation. It never
    // changes the PSF size, and reduced motion freezes uTime in the runtime.
    vBrightness = 1.0 + aTwinkleStrength * (
      wave * 0.72 + secondWave * 0.28
    );
    vec3 apparentPosition = position;
    vLensMagnification = 1.0;
    float sourceAngle = angularDistance(position, uLensDirection);
    float sourceMask = 1.0 - smoothstep(
      uLensSourceMaskRadius * 0.88,
      uLensSourceMaskRadius,
      sourceAngle
    );
    vLensSourceVisibility = 1.0
      - clamp(uLensSourceMaskAmount, 0.0, 1.0) * sourceMask;
    if (uLensAmount > 0.0) {
      float lensInfluence = uLensAmount * (
        1.0 - smoothstep(uLensEinsteinRadius, uLensInfluenceRadius, sourceAngle)
      );
      vLensMagnification += lensInfluence * 0.72;
      apparentPosition = lensStarPosition(position);
    }
    vPsfScale = aSize;
    vRadiance = aRadiance;
    vColor = aColor;

    vec4 viewPosition = modelViewMatrix * vec4(apparentPosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    // Fixed screen-space support avoids both perspective particles and the
    // old stylised size pulse. The visible PSF inside remains about 1 CSS px.
    gl_PointSize = 8.0 * uPixelRatio;
    vSpriteSizePx = gl_PointSize;
  }
`;

const STAR_FRAGMENT_SHADER = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uReveal;

  varying float vBrightness;
  varying float vLensMagnification;
  varying float vLensSourceVisibility;
  varying float vPsfScale;
  varying float vRadiance;
  varying float vSpriteSizePx;
  varying vec3 vColor;

  void main() {
    vec2 centred = gl_PointCoord - vec2(0.5);
    float safePixelRatio = max(uPixelRatio, 0.5);
    vec2 pixelPositionCss = centred * max(vSpriteSizePx, 1.0) / safePixelRatio;
    float pixelRadiusCss = length(pixelPositionCss);
    float prominence = smoothstep(0.55, 4.8, vRadiance);

    // One-pixel analytic PSF with an energy-normalized core and a barely
    // visible Airy ring. aSize changes sigma only within photographic bounds.
    float sigmaCss = mix(0.38, 0.47, clamp(vPsfScale, 0.0, 1.0));
    float coreNormalization = pow(0.42 / sigmaCss, 2.0);
    float stellarCore = exp(
      -0.5 * pow(pixelRadiusCss / sigmaCss, 2.0)
    ) * coreNormalization;
    float airyWing = exp(
      -0.5 * pow((pixelRadiusCss - 1.5) / 0.28, 2.0)
    ) * mix(0.01, 0.035, prominence);

    // Only a handful of the seeded 360 stars reach this radiance tail.
    // Their diffraction spikes stay sub-pixel narrow and never inflate into
    // the old cross-shaped bulb.
    float diffractionGate = smoothstep(4.7, 5.5, vRadiance);
    float verticalSpike = exp(-0.5 * pow(pixelPositionCss.x / 0.23, 2.0))
      * exp(-0.5 * pow(pixelPositionCss.y / 2.75, 2.0));
    float horizontalSpike = exp(-0.5 * pow(pixelPositionCss.y / 0.23, 2.0))
      * exp(-0.5 * pow(pixelPositionCss.x / 2.75, 2.0));
    float diffractionSpike = (verticalSpike + horizontalSpike)
      * diffractionGate * 0.095;

    float edge = max(abs(centred.x), abs(centred.y));
    float edgeAA = max(fwidth(edge), 0.001);
    float spriteSupport = 1.0 - smoothstep(0.5 - edgeAA, 0.5, edge);
    float coverage = clamp(
      (stellarCore + airyWing + diffractionSpike) * spriteSupport,
      0.0,
      1.0
    );
    float alpha = coverage * uReveal * vLensSourceVisibility;
    if (alpha < 1.0 / 2048.0) discard;

    // Brightness, scintillation and gravitational magnification are radiance,
    // not alpha. Additive blending therefore applies flux exactly once.
    float chroma = mix(0.12, 0.42, prominence);
    vec3 stellarColour = mix(vec3(1.0), vColor, chroma);
    vec3 sourceRadiance = stellarColour
      * vRadiance
      * vBrightness
      * vLensMagnification;
    gl_FragColor = vec4(sourceRadiance, alpha);
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

// Mirrors the vertex-shader curve so node tests can verify the weak,
// asynchronous radiance modulation and the reduced-motion freeze path.
export function calculateMushroomStarTwinkle(
  time,
  speed,
  phase,
  strength = 1
) {
  const safeTime = Number.isFinite(time) ? time : 0;
  const safeSpeed = Number.isFinite(speed) ? speed : MUSHROOM_SKY_TWINKLE_SPEED_MIN;
  const safePhase = Number.isFinite(phase) ? phase : 0;
  const safeStrength = THREE.MathUtils.clamp(
    Number.isFinite(strength) ? strength : 1,
    0,
    1
  );
  const wave = Math.sin(safeTime * safeSpeed + safePhase);
  const secondWave = Math.sin(
    safeTime * (safeSpeed * 0.61) + safePhase * 1.73
  );
  return 1 + safeStrength * (wave * 0.72 + secondWave * 0.28);
}

// Shared by every camera-centred sky layer, including the rare-event layer in
// observatory-sky-events.js, so a stencil-config change can never fork.
export function configureSkyStencil(material) {
  material.stencilWrite = true;
  material.stencilRef = SKY_STENCIL_REF;
  material.stencilFunc = THREE.EqualStencilFunc;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.KeepStencilOp;
  return material;
}

function createStarGeometry(starCount, radius, seed) {
  const random = seededRandom(seed);
  const positions = new Float32Array(starCount * 3);
  const phases = new Float32Array(starCount);
  const speeds = new Float32Array(starCount);
  const strengths = new Float32Array(starCount);
  const sizes = new Float32Array(starCount);
  const radiances = new Float32Array(starCount);
  const colors = new Float32Array(starCount * 3);
  const palette = [
    new THREE.Color("#dbe9ff"),
    new THREE.Color("#fff6dd"),
    new THREE.Color("#bed6ff"),
    new THREE.Color("#ffffff")
  ];

  for (let index = 0; index < starCount; index += 1) {
    // Uniformly distribute directions across the upper hemisphere. A small
    // horizon margin keeps point sprites from being sliced by the aperture.
    const y = 0.06 + random() * 0.94;
    const azimuth = random() * Math.PI * 2;
    const horizontal = Math.sqrt(1 - y * y);
    const starRadius = radius * (0.965 + random() * 0.025);
    const offset = index * 3;
    positions[offset] = Math.cos(azimuth) * horizontal * starRadius;
    positions[offset + 1] = y * starRadius;
    positions[offset + 2] = Math.sin(azimuth) * horizontal * starRadius;
    phases[index] = random() * Math.PI * 2;
    speeds[index] = MUSHROOM_SKY_TWINKLE_SPEED_MIN
      + random() * (
        MUSHROOM_SKY_TWINKLE_SPEED_MAX - MUSHROOM_SKY_TWINKLE_SPEED_MIN
      );
    const prominence = random();
    sizes[index] = 0.24 + Math.pow(prominence, 1.5) * 0.76;
    // Scintillation changes flux by at most about four percent. Radiance uses
    // a long tail so brightness never needs to masquerade as a larger sprite.
    strengths[index] = 0.006 + Math.pow(prominence, 4) * 0.036;
    radiances[index] = 0.09
      + Math.pow(prominence, 3) * 0.66
      + Math.pow(prominence, 24) * 5.5;

    const color = palette[Math.floor(random() * palette.length)];
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aTwinkleSpeed", new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute("aTwinkleStrength", new THREE.BufferAttribute(strengths, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aRadiance", new THREE.BufferAttribute(radiances, 1));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

const lensDirectionScratch = new THREE.Vector3();
const lensQuaternionScratch = new THREE.Quaternion();

function copyMushroomLensDirection(target, direction) {
  if (direction?.isVector3) {
    target.copy(direction);
  } else if (Array.isArray(direction) || ArrayBuffer.isView(direction)) {
    target.set(
      Number(direction[0]),
      Number(direction[1]),
      Number(direction[2])
    );
  } else if (direction && typeof direction === "object") {
    target.set(Number(direction.x), Number(direction.y), Number(direction.z));
  } else {
    target.set(
      MUSHROOM_SKY_LENS_DEFAULT_DIRECTION.x,
      MUSHROOM_SKY_LENS_DEFAULT_DIRECTION.y,
      MUSHROOM_SKY_LENS_DEFAULT_DIRECTION.z
    );
  }

  if (
    !Number.isFinite(target.x)
    || !Number.isFinite(target.y)
    || !Number.isFinite(target.z)
    || target.lengthSq() < 1e-8
  ) {
    target.set(
      MUSHROOM_SKY_LENS_DEFAULT_DIRECTION.x,
      MUSHROOM_SKY_LENS_DEFAULT_DIRECTION.y,
      MUSHROOM_SKY_LENS_DEFAULT_DIRECTION.z
    );
  }
  return target.normalize();
}

function applyMushroomSkyLensUniforms(sky) {
  const state = sky?.userData?.lens;
  if (!state) return;

  for (const object of [sky.userData.backdrop, sky.userData.stars]) {
    const uniforms = object?.material?.uniforms;
    if (!uniforms?.uLensAmount) continue;
    // The public direction is fixed in the sky group's parent space. Convert
    // it into each independently drifting child's local space so the black
    // hole stays fixed while the old panorama and hero field continue their
    // barely perceptible celestial rotation underneath it.
    lensQuaternionScratch.copy(object.quaternion).invert();
    lensDirectionScratch.copy(state.direction).applyQuaternion(lensQuaternionScratch);
    uniforms.uLensDirection.value.copy(lensDirectionScratch).normalize();
    uniforms.uLensAmount.value = state.amount;
    uniforms.uLensEinsteinRadius.value = state.einsteinRadius;
    uniforms.uLensInfluenceRadius.value = state.influenceRadius;
    if (uniforms.uLensSourceMaskAmount) {
      uniforms.uLensSourceMaskAmount.value = state.sourceMaskAmount;
    }
    if (uniforms.uLensSourceMaskRadius) {
      uniforms.uLensSourceMaskRadius.value = state.sourceMaskRadius;
    }
    if (uniforms.uLensHorizonRadius) {
      uniforms.uLensHorizonRadius.value = state.horizonRadius;
    }
    if (uniforms.uLensRingStrength) {
      uniforms.uLensRingStrength.value = state.ringStrength;
    }
  }
}

export function createMushroomSky({
  starCount = MUSHROOM_SKY_STAR_COUNT,
  radius = MUSHROOM_SKY_RADIUS,
  seed = 0x5ca1ab1e
} = {}) {
  const sky = new THREE.Group();
  sky.name = MUSHROOM_SKY_NAME;
  sky.visible = false;

  const backdropMaterial = configureSkyStencil(new THREE.ShaderMaterial({
    uniforms: {
      uSkyTexture: { value: null },
      uBrightness: { value: MUSHROOM_SKY_IMAGE_BRIGHTNESS },
      uReveal: { value: 0 },
      uLensAmount: { value: 0 },
      uLensDirection: {
        value: copyMushroomLensDirection(new THREE.Vector3())
      },
      uLensEinsteinRadius: {
        value: MUSHROOM_SKY_LENS_DEFAULT_EINSTEIN_RADIUS
      },
      uLensInfluenceRadius: {
        value: MUSHROOM_SKY_LENS_DEFAULT_INFLUENCE_RADIUS
      },
      uLensHorizonRadius: {
        value: MUSHROOM_SKY_LENS_DEFAULT_HORIZON_RADIUS
      },
      uLensRingStrength: {
        value: MUSHROOM_SKY_LENS_DEFAULT_RING_STRENGTH
      }
    },
    vertexShader: BACKDROP_VERTEX_SHADER,
    fragmentShader: BACKDROP_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false
  }));
  backdropMaterial.name = "mushroom-distant-sky-material";

  const backdrop = new THREE.Mesh(
    // The ordinary physical dome stencil still exposes only the photographic
    // upper hemisphere. R's expanded stencil reaches a little below the eye
    // horizon to meet the L3 floor, so extend the far shell into the texture's
    // deliberately dark horizon row instead of revealing the meadow colour.
    new THREE.SphereGeometry(radius, 72, 32, 0, Math.PI * 2, 0, Math.PI * 0.59),
    backdropMaterial
  );
  backdrop.name = MUSHROOM_SKY_BACKDROP_NAME;
  backdrop.rotation.y = SKY_START_ROTATION;
  backdrop.renderOrder = BACKDROP_RENDER_ORDER;
  backdrop.frustumCulled = false;
  sky.add(backdrop);

  const starMaterial = configureSkyStencil(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uReveal: { value: 0 },
      uLensAmount: { value: 0 },
      uLensDirection: {
        value: copyMushroomLensDirection(new THREE.Vector3())
      },
      uLensEinsteinRadius: {
        value: MUSHROOM_SKY_LENS_DEFAULT_EINSTEIN_RADIUS
      },
      uLensInfluenceRadius: {
        value: MUSHROOM_SKY_LENS_DEFAULT_INFLUENCE_RADIUS
      },
      uLensSourceMaskAmount: { value: 0 },
      uLensSourceMaskRadius: {
        value: MUSHROOM_SKY_LENS_DEFAULT_INFLUENCE_RADIUS
      }
    },
    vertexShader: STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false
  }));
  starMaterial.name = "mushroom-twinkling-star-material";

  const stars = new THREE.Points(
    createStarGeometry(starCount, radius, seed),
    starMaterial
  );
  stars.name = MUSHROOM_SKY_STARS_NAME;
  stars.rotation.y = STAR_START_ROTATION;
  stars.renderOrder = STAR_RENDER_ORDER;
  stars.frustumCulled = false;
  sky.add(stars);

  sky.userData.textureReady = false;
  sky.userData.elapsed = 0;
  sky.userData.reveal = 0;
  sky.userData.backdropReveal = 0;
  sky.userData.starReveal = 0;
  sky.userData.twinkleSample = 0;
  sky.userData.backdrop = backdrop;
  sky.userData.stars = stars;
  sky.userData.lens = {
    amount: 0,
    direction: copyMushroomLensDirection(new THREE.Vector3()),
    einsteinRadius: MUSHROOM_SKY_LENS_DEFAULT_EINSTEIN_RADIUS,
    influenceRadius: MUSHROOM_SKY_LENS_DEFAULT_INFLUENCE_RADIUS,
    horizonRadius: MUSHROOM_SKY_LENS_DEFAULT_HORIZON_RADIUS,
    ringStrength: MUSHROOM_SKY_LENS_DEFAULT_RING_STRENGTH,
    sourceMaskAmount: 0,
    sourceMaskRadius: MUSHROOM_SKY_LENS_DEFAULT_INFLUENCE_RADIUS
  };
  sky.userData.disposed = false;
  applyMushroomSkyLensUniforms(sky);
  return sky;
}

export function createMushroomSkyAperture(dome) {
  if (!dome?.isMesh) return null;

  // Share the dome geometry but own a tiny stencil-only material. The mask is
  // added beside the physical dome so it inherits the exact same pocket-space
  // scale and transform. Its geometry must therefore NOT be disposed here.
  const material = new THREE.MeshBasicMaterial({
    color: "#000000",
    side: THREE.BackSide,
    colorWrite: false,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    fog: false
  });
  material.name = "mushroom-sky-aperture-stencil";
  material.stencilWrite = true;
  material.stencilRef = SKY_STENCIL_REF;
  material.stencilFunc = THREE.AlwaysStencilFunc;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.ReplaceStencilOp;

  const aperture = new THREE.Mesh(dome.geometry, material);
  aperture.name = MUSHROOM_SKY_APERTURE_NAME;
  aperture.position.copy(dome.position);
  aperture.quaternion.copy(dome.quaternion);
  aperture.scale.copy(dome.scale);
  aperture.visible = false;
  aperture.renderOrder = APERTURE_RENDER_ORDER;
  aperture.frustumCulled = false;
  dome.parent?.add(aperture);
  return aperture;
}

export function removeMushroomSkyAperture(aperture) {
  if (!aperture) return;
  aperture.removeFromParent();
  aperture.material?.dispose();
}

export function isMushroomObservatorySkyPosition(position) {
  if (!position) return false;
  const dx = position.x - MUSHROOM_INTERIOR_CENTER.x;
  const dz = position.z - MUSHROOM_INTERIOR_CENTER.z;
  const pocketRadius = MUSHROOM_INTERIOR_LOCAL_RADIUS * MUSHROOM_INTERIOR_SCALE + 1;
  // Camera Y is eye height, so use the same L2/L3 hand-off that floor and
  // furniture collision logic uses. Starting at the physical slab would make
  // the distant sky pop in only on the last part of the upper stair.
  const loftRange = MUSHROOM_FLOOR_Y_RANGES[4];
  return (
    Math.hypot(dx, dz) <= pocketRadius
    && position.y >= loftRange.minY
    && position.y <= loftRange.maxY
  );
}

export function updateMushroomSky(
  sky,
  cameraPosition,
  delta,
  {
    reducedMotion = false,
    aperture = null,
    reveal = 1,
    backdropReveal = reveal,
    starReveal = reveal,
    forceActive = false,
    activeEnabled = true
  } = {}
) {
  if (!sky || !cameraPosition || sky.userData.disposed) return false;

  const active = activeEnabled
    && (sky.userData.textureReady === true || forceActive)
    && isMushroomObservatorySkyPosition(cameraPosition);
  sky.visible = active;
  if (aperture) aperture.visible = active;
  if (!active) return false;

  // Exact camera centring removes translation parallax. Turning the player's
  // head still reveals a different direction, while walking cannot make the
  // Milky Way slide across the nearby roof like a printed photograph.
  sky.position.copy(cameraPosition);

  const backdrop = sky.userData.backdrop;
  const stars = sky.userData.stars;
  if (!reducedMotion) {
    const frameDelta = Math.min(Math.max(delta || 0, 0), 0.1);
    // Keep long-running sessions within a precision-friendly time window for
    // the fp32 shader clock, while the drift rotations accumulate in fp64 so
    // the photographic panorama stays seam-free across the wrap.
    sky.userData.elapsed = (sky.userData.elapsed + frameDelta)
      % SKY_TIME_WRAP_SECONDS;
    backdrop.rotation.y += frameDelta * MUSHROOM_SKY_BACKDROP_DRIFT;
    stars.rotation.y += frameDelta * MUSHROOM_SKY_STAR_DRIFT;
  }

  const elapsed = sky.userData.elapsed;
  const backdropRevealAmount = THREE.MathUtils.clamp(
    Number.isFinite(backdropReveal) ? backdropReveal : 0,
    0,
    1
  );
  const starRevealAmount = THREE.MathUtils.clamp(
    Number.isFinite(starReveal) ? starReveal : 0,
    0,
    1
  );
  applyMushroomSkyLensUniforms(sky);
  backdrop.material.uniforms.uReveal.value = backdropRevealAmount;
  stars.material.uniforms.uTime.value = elapsed;
  stars.material.uniforms.uReveal.value = starRevealAmount;
  const phases = stars.geometry.attributes.aPhase;
  const speeds = stars.geometry.attributes.aTwinkleSpeed;
  const strengths = stars.geometry.attributes.aTwinkleStrength;
  sky.userData.twinkleSample = calculateMushroomStarTwinkle(
    elapsed,
    speeds.getX(0),
    phases.getX(0),
    strengths.getX(0)
  );
  // Keep the legacy aggregate for diagnostics while exposing the independent
  // channels used by the unified observatory adaptation director.
  sky.userData.reveal = Math.max(backdropRevealAmount, starRevealAmount);
  sky.userData.backdropReveal = backdropRevealAmount;
  sky.userData.starReveal = starRevealAmount;
  return true;
}

export function setMushroomSkyPixelRatio(sky, pixelRatio) {
  const stars = sky?.userData.stars;
  if (!stars?.material?.uniforms?.uPixelRatio) return;
  stars.material.uniforms.uPixelRatio.value = THREE.MathUtils.clamp(
    Number.isFinite(pixelRatio) ? pixelRatio : 1,
    1,
    1.8
  );
}

export function setMushroomSkyLens(sky, lens = {}) {
  const state = sky?.userData?.lens;
  if (!state || sky.userData.disposed) return;

  const options = typeof lens === "number" ? { amount: lens } : (lens ?? {});
  state.amount = Number.isFinite(options.amount)
    ? THREE.MathUtils.clamp(options.amount, 0, 1)
    : state.amount;
  state.einsteinRadius = Number.isFinite(options.einsteinRadius)
    ? THREE.MathUtils.clamp(options.einsteinRadius, 0.015, 0.22)
    : state.einsteinRadius;
  const requestedInfluence = Number.isFinite(options.influenceRadius)
    ? options.influenceRadius
    : state.influenceRadius;
  state.influenceRadius = THREE.MathUtils.clamp(
    Math.max(requestedInfluence, state.einsteinRadius * 1.6),
    0.08,
    0.9
  );
  state.horizonRadius = Number.isFinite(options.horizonRadius)
    ? THREE.MathUtils.clamp(
      options.horizonRadius,
      0.004,
      state.einsteinRadius * 0.65
    )
    : Math.min(state.horizonRadius, state.einsteinRadius * 0.65);
  state.ringStrength = Number.isFinite(options.ringStrength)
    ? THREE.MathUtils.clamp(options.ringStrength, 0, 2)
    : state.ringStrength;
  state.sourceMaskAmount = Number.isFinite(options.sourceMaskAmount)
    ? THREE.MathUtils.clamp(options.sourceMaskAmount, 0, 1)
    : state.amount <= 0
      ? 0
      : state.sourceMaskAmount;
  state.sourceMaskRadius = Number.isFinite(options.sourceMaskRadius)
    ? THREE.MathUtils.clamp(options.sourceMaskRadius, 0.08, 0.9)
    : state.sourceMaskRadius;
  if (options.direction !== undefined) {
    copyMushroomLensDirection(state.direction, options.direction);
  }

  applyMushroomSkyLensUniforms(sky);
}

export function disposeMushroomSky(sky) {
  if (!sky || sky.userData.disposed) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  sky.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => {
      materials.add(material);
      if (material.map) textures.add(material.map);
      Object.values(material.uniforms ?? {}).forEach((uniform) => {
        if (uniform?.value?.isTexture) textures.add(uniform.value);
      });
    });
  });

  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  sky.clear();
  sky.visible = false;
  sky.userData.disposed = true;
}
