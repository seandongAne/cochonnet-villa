import * as THREE from "three";

import { OBSERVATORY_BLACK_HOLE_FLOW_PERIODS } from "./observatory-black-hole.js";

// Offline Kerr transfer-atlas renderer for the hidden Observatory lens.
//
// The atlas contains physical null-geodesic transfer results, not a baked
// image. The fragment shader uses those results to sample the live 8K sky and
// Gaia/hero source map through the same exit direction, then shades the first
// two equatorial-disc crossings from their precomputed redshift and time.
// This module deliberately stays browser/React independent so decoding,
// lifecycle and shader contracts remain covered by the Node test suite.

export const OBSERVATORY_KERR_LENS_NAME =
  "mushroom-observatory-kerr-lens";
export const OBSERVATORY_KERR_LENS_MATERIAL_NAME =
  "mushroom-observatory-kerr-lens-material";
export const OBSERVATORY_KERR_LENS_RENDER_ORDER = -894;
export const OBSERVATORY_KERR_LENS_DEFAULT_QUALITY = "medium";

export const OBSERVATORY_KERR_LENS_SPIN = 0.94;
export const OBSERVATORY_KERR_LENS_INCLINATION_DEGREES = 60;
export const OBSERVATORY_KERR_LENS_OBSERVER_RADIUS = 1_000;
export const OBSERVATORY_KERR_LENS_ATLAS_WIDTH = 384;
export const OBSERVATORY_KERR_LENS_ATLAS_HEIGHT = 384;
export const OBSERVATORY_KERR_LENS_ALPHA_EXTENT = 12;
export const OBSERVATORY_KERR_LENS_BETA_EXTENT = 12;
export const OBSERVATORY_KERR_LENS_ISCO_RADIUS = 2.023593104700402;

export const OBSERVATORY_KERR_LENS_RAY_STATUS = Object.freeze({
  escaped: 0,
  captured: 1,
  unresolved: 2,
  invalid: 3
});

export const OBSERVATORY_KERR_LENS_SKY_URL =
  "/data/observatory-kerr-sky-v1.bin";
export const OBSERVATORY_KERR_LENS_DISC_PRIMARY_URL =
  "/data/observatory-kerr-disc-primary-v1.bin";
export const OBSERVATORY_KERR_LENS_DISC_SECONDARY_URL =
  "/data/observatory-kerr-disc-secondary-v1.bin";
export const OBSERVATORY_KERR_LENS_PATH_URL =
  "/data/observatory-kerr-path-v1.bin";
export const OBSERVATORY_KERR_LENS_META_URL =
  "/data/observatory-kerr-transfer-atlas-v1.meta.json";

export const OBSERVATORY_KERR_LENS_ATLAS_SPECS = Object.freeze({
  sky: Object.freeze({
    kind: "sky",
    width: OBSERVATORY_KERR_LENS_ATLAS_WIDTH,
    height: OBSERVATORY_KERR_LENS_ATLAS_HEIGHT,
    channels: 4,
    format: THREE.RGBAFormat,
    internalFormat: "RGBA32F",
    url: OBSERVATORY_KERR_LENS_SKY_URL
  }),
  discPrimary: Object.freeze({
    kind: "disc-primary",
    width: OBSERVATORY_KERR_LENS_ATLAS_WIDTH,
    height: OBSERVATORY_KERR_LENS_ATLAS_HEIGHT,
    channels: 4,
    format: THREE.RGBAFormat,
    internalFormat: "RGBA32F",
    url: OBSERVATORY_KERR_LENS_DISC_PRIMARY_URL
  }),
  discSecondary: Object.freeze({
    kind: "disc-secondary",
    width: OBSERVATORY_KERR_LENS_ATLAS_WIDTH,
    height: OBSERVATORY_KERR_LENS_ATLAS_HEIGHT,
    channels: 4,
    format: THREE.RGBAFormat,
    internalFormat: "RGBA32F",
    url: OBSERVATORY_KERR_LENS_DISC_SECONDARY_URL
  }),
  path: Object.freeze({
    kind: "path",
    width: OBSERVATORY_KERR_LENS_ATLAS_WIDTH,
    height: OBSERVATORY_KERR_LENS_ATLAS_HEIGHT,
    channels: 2,
    format: THREE.RGFormat,
    internalFormat: "RG32F",
    url: OBSERVATORY_KERR_LENS_PATH_URL
  })
});

export const OBSERVATORY_KERR_LENS_QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({ id: "high", enabled: true, secondaryDisc: true }),
  medium: Object.freeze({ id: "medium", enabled: true, secondaryDisc: true }),
  low: Object.freeze({ id: "low", enabled: false, secondaryDisc: false }),
  minimum: Object.freeze({
    id: "minimum",
    enabled: false,
    secondaryDisc: false
  })
});

const PREWARM_REVEAL = 0.01;
const REVEAL_EPSILON = 0.001;
const DEFAULT_MASS_WORLD_SCALE = 2;
const DEFAULT_DISC_OUTER_RADIUS = 7.6;
const DEFAULT_DISC_OPACITY = 0.94;

const FULLSCREEN_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const KERR_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  precision highp int;

  uniform sampler2D uSkyTexture;
  uniform sampler2D uStarSourceTexture;
  uniform sampler2D uKerrSkyAtlas;
  uniform sampler2D uKerrDiscPrimaryAtlas;
  uniform sampler2D uKerrDiscSecondaryAtlas;
  uniform sampler2D uKerrPathAtlas;
  uniform mat4 uCameraWorldMatrix;
  uniform mat4 uProjectionInverse;
  uniform mat3 uKerrToWorld;
  uniform mat3 uSkyRotation;
  uniform mat3 uStarSourceRotation;
  uniform vec3 uCameraPosition;
  uniform vec3 uLensPosition;
  uniform vec3 uImageRight;
  uniform vec3 uImageUp;
  uniform vec2 uAtlasSize;
  uniform vec2 uAtlasExtent;
  uniform float uMassWorldScale;
  uniform float uSkyBrightness;
  uniform float uStarSourceBrightness;
  uniform float uDiscOuterRadius;
  uniform float uDiscOpacity;
  uniform float uReveal;
  uniform float uTime;
  uniform float uAtlasReady;
  uniform float uSkyReady;
  uniform float uStarSourceReady;
  uniform float uSecondaryDisc;
  uniform float uHdrOutput;

  varying vec2 vUv;
  layout(location = 0) out vec4 observatoryFragColor;

  const float PI = 3.141592653589793;
  const float KERR_ISCO = 2.023593104700402;
  const float STATUS_ESCAPED = 0.0;
  const float STATUS_CAPTURED = 1.0;
  // Gas-pattern periods only: the event horizon, 60-degree Kerr frame and
  // transfer atlas remain fixed. The middle reference completes one orbit in
  // 15 seconds, with physically legible differential flow either side.
  const float FLOW_INNER_PERIOD = ${OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.inner.toFixed(1)};
  const float FLOW_MIDDLE_PERIOD = ${OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.middle.toFixed(1)};
  const float FLOW_OUTER_PERIOD = ${OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.outer.toFixed(1)};
  const float FLOW_HOTSPOT_MEAN = 0.196380615234375;
  // Exact circular means for pow(0.5 + 0.5*cos(theta), 4/10).
  // Subtracting them lets the long rotating arc and its narrow leading knot
  // carry much stronger local contrast without lifting the disc's mean flux.
  const float FLOW_ROTATION_ARC_MEAN = 0.2734375;
  const float FLOW_LEADING_HOTSPOT_MEAN = 0.17619705200195312;

  vec2 seamSafeDerivative(vec2 derivativeValue) {
    return vec2(
      derivativeValue.x - round(derivativeValue.x),
      derivativeValue.y
    );
  }

  vec2 upperSkyUv(vec3 direction) {
    vec3 ray = normalize(direction);
    float longitude = atan(ray.z, -ray.x) / (2.0 * PI);
    float latitude = asin(clamp(ray.y, -1.0, 1.0)) / (0.5 * PI);
    return vec2(fract(longitude), clamp(latitude, 0.0, 1.0));
  }

  vec3 darkHorizon(vec3 direction) {
    float below = clamp(-direction.y * 5.0, 0.0, 1.0);
    return mix(vec3(0.0022, 0.0032, 0.0075), vec3(0.0004), below);
  }

  vec3 sampleUpperSource(
    sampler2D sourceTexture,
    vec3 direction,
    mat3 sourceRotation,
    float brightness,
    bool allowDarkHorizon
  ) {
    vec3 sourceDirection = normalize(sourceRotation * direction);
    // The shipped photograph is an upper-dome crop, while a Kerr geodesic can
    // exit anywhere on a full source sphere. A hard black lower hemisphere is
    // therefore not a physical horizon: the lens magnifies that asset seam
    // into two triangular caustic patches. Fold the missing hemisphere through
    // the source equator (continuous in value), then softly attenuate it so the
    // completion stays subordinate without sacrificing lensed sky detail.
    float sourceY = sourceDirection.y;
    vec3 completedDirection = normalize(vec3(
      sourceDirection.x,
      abs(sourceDirection.y),
      sourceDirection.z
    ));
    vec2 uv = upperSkyUv(completedDirection);
    vec2 dx = seamSafeDerivative(dFdx(uv));
    vec2 dy = seamSafeDerivative(dFdy(uv));
    vec3 radiance = textureGrad(sourceTexture, uv, dx, dy).rgb;
    float lowerCompletion = smoothstep(-0.58, 0.0, sourceY);
    if (allowDarkHorizon) {
      float photoWeight = mix(0.42, 1.0, lowerCompletion);
      radiance = mix(darkHorizon(sourceDirection), radiance, photoWeight);
    } else {
      radiance *= mix(0.64, 1.0, lowerCompletion);
    }
    return radiance * brightness;
  }

  ivec2 atlasTexel(vec2 atlasUv) {
    vec2 texel = floor(clamp(atlasUv, vec2(0.0), vec2(1.0)) * uAtlasSize);
    return ivec2(clamp(texel, vec2(0.0), uAtlasSize - 1.0));
  }

  vec3 sampleKerrExitDirection(
    vec2 atlasUv,
    float centreStatus,
    float centreOrder,
    vec3 centreDirection
  ) {
    // Status and image order remain discrete, but the direction field inside
    // one physical lensing band is continuous. Topology-aware 2x2 filtering
    // prevents a 384px transfer atlas from polygonising an 8K source image.
    vec2 pixel = atlasUv * uAtlasSize - 0.5;
    ivec2 base = ivec2(floor(pixel));
    vec2 blend = fract(pixel);
    ivec2 atlasMax = ivec2(uAtlasSize) - ivec2(1);
    ivec2 p00 = clamp(base, ivec2(0), atlasMax);
    ivec2 p10 = clamp(base + ivec2(1, 0), ivec2(0), atlasMax);
    ivec2 p01 = clamp(base + ivec2(0, 1), ivec2(0), atlasMax);
    ivec2 p11 = clamp(base + ivec2(1, 1), ivec2(0), atlasMax);
    vec4 s00 = texelFetch(uKerrSkyAtlas, p00, 0);
    vec4 s10 = texelFetch(uKerrSkyAtlas, p10, 0);
    vec4 s01 = texelFetch(uKerrSkyAtlas, p01, 0);
    vec4 s11 = texelFetch(uKerrSkyAtlas, p11, 0);
    vec2 o00 = texelFetch(uKerrPathAtlas, p00, 0).rg;
    vec2 o10 = texelFetch(uKerrPathAtlas, p10, 0).rg;
    vec2 o01 = texelFetch(uKerrPathAtlas, p01, 0).rg;
    vec2 o11 = texelFetch(uKerrPathAtlas, p11, 0).rg;
    float t00 = (abs(floor(s00.a + 0.5) - centreStatus) < 0.25
      && abs(floor(o00.y + 0.5) - centreOrder) < 0.25) ? 1.0 : 0.0;
    float t10 = (abs(floor(s10.a + 0.5) - centreStatus) < 0.25
      && abs(floor(o10.y + 0.5) - centreOrder) < 0.25) ? 1.0 : 0.0;
    float t01 = (abs(floor(s01.a + 0.5) - centreStatus) < 0.25
      && abs(floor(o01.y + 0.5) - centreOrder) < 0.25) ? 1.0 : 0.0;
    float t11 = (abs(floor(s11.a + 0.5) - centreStatus) < 0.25
      && abs(floor(o11.y + 0.5) - centreOrder) < 0.25) ? 1.0 : 0.0;
    float w00 = (1.0 - blend.x) * (1.0 - blend.y) * t00;
    float w10 = blend.x * (1.0 - blend.y) * t10;
    float w01 = (1.0 - blend.x) * blend.y * t01;
    float w11 = blend.x * blend.y * t11;
    vec3 direction = s00.xyz * w00 + s10.xyz * w10
      + s01.xyz * w01 + s11.xyz * w11;
    return dot(direction, direction) > 0.04
      ? normalize(direction)
      : normalize(centreDirection);
  }

  float noise21(vec2 value) {
    return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
  }

  bool validDiscCrossing(vec4 crossing) {
    return crossing.x >= KERR_ISCO
      && crossing.x <= uDiscOuterRadius
      && crossing.z > 0.001;
  }

  vec4 sampleDiscCrossing(
    sampler2D atlas,
    vec2 atlasUv,
    out float validCoverage
  ) {
    vec2 pixel = atlasUv * uAtlasSize - 0.5;
    ivec2 base = ivec2(floor(pixel));
    vec2 blend = fract(pixel);
    ivec2 atlasMax = ivec2(uAtlasSize) - ivec2(1);
    ivec2 p00 = clamp(base, ivec2(0), atlasMax);
    ivec2 p10 = clamp(base + ivec2(1, 0), ivec2(0), atlasMax);
    ivec2 p01 = clamp(base + ivec2(0, 1), ivec2(0), atlasMax);
    ivec2 p11 = clamp(base + ivec2(1, 1), ivec2(0), atlasMax);
    vec4 c00 = texelFetch(atlas, p00, 0);
    vec4 c10 = texelFetch(atlas, p10, 0);
    vec4 c01 = texelFetch(atlas, p01, 0);
    vec4 c11 = texelFetch(atlas, p11, 0);
    float w00 = (1.0 - blend.x) * (1.0 - blend.y)
      * (validDiscCrossing(c00) ? 1.0 : 0.0);
    float w10 = blend.x * (1.0 - blend.y)
      * (validDiscCrossing(c10) ? 1.0 : 0.0);
    float w01 = (1.0 - blend.x) * blend.y
      * (validDiscCrossing(c01) ? 1.0 : 0.0);
    float w11 = blend.x * blend.y
      * (validDiscCrossing(c11) ? 1.0 : 0.0);
    validCoverage = w00 + w10 + w01 + w11;
    if (validCoverage <= 1e-5) return vec4(0.0);
    float inverseCoverage = 1.0 / validCoverage;
    float radius = (c00.x * w00 + c10.x * w10 + c01.x * w01
      + c11.x * w11) * inverseCoverage;
    vec2 azimuthVector = vec2(
      sin(c00.y) * w00 + sin(c10.y) * w10 + sin(c01.y) * w01
        + sin(c11.y) * w11,
      cos(c00.y) * w00 + cos(c10.y) * w10 + cos(c01.y) * w01
        + cos(c11.y) * w11
    );
    float azimuth = atan(azimuthVector.x, azimuthVector.y);
    float redshift = (c00.z * w00 + c10.z * w10 + c01.z * w01
      + c11.z * w11) * inverseCoverage;
    float crossingTime = (c00.w * w00 + c10.w * w10 + c01.w * w01
      + c11.w * w11) * inverseCoverage;
    return vec4(radius, azimuth, redshift, crossingTime);
  }

  vec4 shadeDisc(
    vec4 crossing,
    float imageWeight,
    float validCoverage
  ) {
    float radius = crossing.x;
    float azimuth = crossing.y;
    float redshift = crossing.z;
    float crossingTime = crossing.w;
    bool valid = radius >= KERR_ISCO
      && radius <= uDiscOuterRadius
      && redshift > 0.001;
    if (!valid) return vec4(0.0);

    float innerEdge = smoothstep(KERR_ISCO, KERR_ISCO + 0.38, radius);
    // A broad, cool outer-disc taper is both closer to a finite thermal disc
    // and avoids presenting the atlas' r=Rout contour as a hard polygon at
    // room scale.
    float outerFadeStart = max(
      KERR_ISCO + 0.5,
      uDiscOuterRadius * 0.62
    );
    float outerEdge = 1.0 - smoothstep(
      outerFadeStart,
      uDiscOuterRadius,
      radius
    );
    float noTorque = pow(
      max(1.0 - sqrt(KERR_ISCO / max(radius, KERR_ISCO)), 0.0),
      0.25
    );
    float temperature = pow(KERR_ISCO / radius, 0.75) * noTorque;
    float observedTemperature = temperature * clamp(redshift, 0.0, 3.5);

    vec3 deepGold = vec3(0.12, 0.009, 0.0004);
    vec3 solarGold = vec3(5.8, 1.5, 0.04);
    vec3 hotCore = vec3(11.0, 4.2, 0.55);
    vec3 colour = mix(deepGold, solarGold, smoothstep(0.08, 0.38, observedTemperature));
    colour = mix(colour, hotCore, smoothstep(0.42, 0.88, observedTemperature));
    // Only the strongly blueshifted approaching inner gas crosses into a
    // white-blue thermal tier, echoing the reference art's hot arcs while the
    // receding side and outer lanes stay black/gold. The threshold sits above
    // the rest-frame temperature peak, so no whole ring can reach it at once.
    vec3 blueWhite = vec3(9.5, 10.5, 12.5);
    colour = mix(colour, blueWhite, smoothstep(0.98, 1.42, observedTemperature));

    float emissionTime = uTime - crossingTime * 0.0025;
    float normalizedFlowRadius = clamp(
      (radius - KERR_ISCO) / max(uDiscOuterRadius - KERR_ISCO, 0.001),
      0.0,
      1.0
    );
    float orbitalPeriod = mix(
      FLOW_INNER_PERIOD,
      FLOW_MIDDLE_PERIOD,
      smoothstep(0.0, 0.5, normalizedFlowRadius)
    );
    orbitalPeriod = mix(
      orbitalPeriod,
      FLOW_OUTER_PERIOD,
      smoothstep(0.5, 1.0, normalizedFlowRadius)
    );
    float flowPhase = azimuth - emissionTime * (2.0 * PI / orbitalPeriod);
    // Low-frequency spiral lanes remain coherent over long arcs. Higher-
    // frequency filaments and sparse hot knots ride inside them, making a
    // brief observation visibly dynamic without a rigid disc rotation.
    float longStream = sin(flowPhase * 2.0 - radius * 1.42);
    float filamentStream = sin(
      flowPhase * 5.0 - radius * 2.85 + sin(radius * 1.7) * 0.62
    );
    float hotspotShape = pow(
      0.5 + 0.5 * sin(
        flowPhase * 3.0 - radius * 1.16 + sin(radius * 2.1) * 0.48
      ),
      8.0
    );
    // Saturn-style ring banding: dozens of thin concentric emissivity lanes
    // give the disc the dense ribbon structure of the cinematic reference.
    // The bands are azimuth-free and static in disc coordinates, so each
    // radius keeps a constant azimuthal mean over time (no ring pulsing) —
    // yet as soon as gas streaks shear across them the rotation reads.
    float ringBands =
        sin(radius * 14.0) * 0.45
      + sin(radius * 23.0 + 1.7) * 0.30
      + sin(radius * 41.0 + 4.2) * 0.25;
    float bandProfile = smoothstep(0.0, 0.35, normalizedFlowRadius);
    float ringStructure = 1.0 + ringBands * mix(0.10, 0.34, bandProfile);
    // Sheared gas streaks: high-frequency zero-mean carriers whose phase
    // advances with the local orbital rate. Differential rotation stretches
    // them into trailing spiral filaments, so motion is trackable everywhere
    // on the disc instead of only at the single hero knot.
    float streakA = sin(flowPhase * 9.0 - radius * 9.5);
    float streakB = sin(
      flowPhase * 17.0 - radius * 16.0 + sin(radius * 3.3) * 1.1
    );
    // Differential flow remains in the small-scale gas. The hero tracer uses
    // the middle reference period as one coherent source-space arc; giving
    // every radius its own tracer period wound a long-running session into a
    // stack of bright spring-like loops.
    float tracerPhase = azimuth
      - emissionTime * (2.0 * PI / FLOW_MIDDLE_PERIOD);
    float rotationArc = pow(
      0.5 + 0.5 * cos(tracerPhase - radius * 0.18),
      4.0
    );
    float leadingHotspot = pow(
      0.5 + 0.5 * cos(tracerPhase - radius * 0.18 - 0.52),
      10.0
    );
    // One smooth source-radius band becomes one primary lensed arc. Its broad
    // Gaussian shoulders avoid the hard concentric outlines produced by the
    // previous almost-full-disc window.
    // Squared by multiplication: pow(x, 2.0) is undefined for negative x in
    // GLSL ES 1.00 and can NaN inside the window on some drivers.
    float ribbonRadialDistance = (radius - (KERR_ISCO + 1.55)) / 0.72;
    float ribbonRadialWindow = exp(-ribbonRadialDistance * ribbonRadialDistance);
    // Higher image orders should read only as a faint physical echo, not copy
    // the hero tracer into another set of luminous loops.
    float tracerImageWeight = mix(
      0.04,
      1.0,
      step(0.5, imageWeight)
    );
    float tracerContrastWeight = ribbonRadialWindow * tracerImageWeight;
    // Every carrier below is zero mean. Most of the old broad-band energy is
    // moved into the single long arc and its leading knot: this creates a
    // trackable direction marker instead of merely making the texture busier.
    // the azimuthally integrated emissivity remains exactly the old value.
    float flowStructure = (1.0
      + longStream * 0.10
      + filamentStream * 0.04
      + streakA * 0.14
      + streakB * 0.09
      + (hotspotShape - FLOW_HOTSPOT_MEAN) * 0.20
      + tracerContrastWeight * (
        (rotationArc - FLOW_ROTATION_ARC_MEAN) * 1.10
        + (leadingHotspot - FLOW_LEADING_HOTSPOT_MEAN) * 1.50
      )) * ringStructure;
    flowStructure = max(flowStructure, 0.0);
    // A narrow thermal crest just outside the ISCO creates the white-hot
    // lensed inner edge. It is always present, but the leading knot pushes a
    // small segment toward solar white rather than making a uniform neon ring.
    float innerHeatDistance = (radius - (KERR_ISCO + 0.40)) / 0.31;
    float innerHeat = exp(-innerHeatDistance * innerHeatDistance);
    float platinumRibbon = ribbonRadialWindow * (
      rotationArc * 0.68 + leadingHotspot * 0.32
    ) * tracerImageWeight;
    // Keep the physical inner crest warm, but do not let the moving hero arc
    // whiten the whole Doppler crescent. Motion will receive a separate gold
    // display tracer after the HDR shoulder below.
    float movingWhiteHeat = innerHeat * (
      0.02 + tracerImageWeight * (
        rotationArc * 0.035 + leadingHotspot * 0.16
      )
    ) + platinumRibbon * (0.04 + leadingHotspot * 0.08);
    vec3 whiteGold = vec3(16.0, 13.0, 8.0);
    colour = mix(colour, whiteGold, clamp(movingWhiteHeat, 0.0, 0.48));
    // A shallower falloff than the previous 1.72 exponent keeps the extended
    // outer lanes glowing golden-brown (reference-style luminous ribbons)
    // instead of collapsing into a dim translucent haze past ~2 ISCO.
    float radialEmission = pow(KERR_ISCO / radius, 1.15) * noTorque;
    // Liouville invariance for specific intensity: I_nu / nu^3 is conserved.
    float relativisticBoost = pow(clamp(redshift, 0.0, 3.5), 3.0);
    // Thermal emissivity and optical coverage are separate quantities. Using
    // radialEmission in both radiance and alpha squared the visual falloff and
    // left only two over-bright Doppler wedges. A gently varying optical depth
    // keeps the full warped disc legible while emission remains physical.
    float opticalCoverage = mix(
      0.48,
      0.82,
      smoothstep(0.025, 0.42, radialEmission)
    );
    // The ring gaps thin the disc's optical depth as well as its emission, so
    // lensed sky and Gaia stars graze through the darker outer lanes exactly
    // where the reference art shows translucent ribbons.
    float ringCoverage = clamp(
      1.0 + ringBands * (0.10 + 0.38 * bandProfile),
      0.34,
      1.5
    );
    float alpha = innerEdge * outerEdge * opticalCoverage * ringCoverage
      * validCoverage * uDiscOpacity * imageWeight;
    alpha = clamp(alpha, 0.0, 0.97);
    vec3 radiance = colour * radialEmission * relativisticBoost
      * flowStructure * 0.88;
    // The physical g^3 thermal term can almost erase a moving knot when it
    // crosses the receding side. Keep that Doppler asymmetry in the broad
    // disc, but give the narrow tracer a bounded optically-thick visibility
    // floor. This is concentrated source radiance, not a screen-space ring or
    // whole-frame gain, and keeps the same 10/15/25-second source motion.
    float carrierRelativisticBoost = pow(
      clamp(redshift, 0.50, 2.20),
      1.40
    );
    float ribbonCarrier = ribbonRadialWindow * (
      rotationArc * 0.78 + leadingHotspot * 0.55
    ) * tracerImageWeight;
    vec3 platinumRibbonColour = mix(
      vec3(10.0, 2.4, 0.08),
      vec3(22.0, 9.0, 0.8),
      0.35 + leadingHotspot * 0.65
    );
    radiance += platinumRibbonColour
      * radialEmission
      * carrierRelativisticBoost
      * ribbonCarrier
      * 0.32;
    // Redistribute, rather than globally add, display brightness. The broad
    // disc gets a firmer shoulder than before, while only the narrow inner
    // crest receives HDR-like headroom. This preserves the dark sky and black
    // event horizon while allowing a white-hot moving segment to read.
    float discLuminance = dot(radiance, vec3(0.2126, 0.7152, 0.0722));
    float baseShoulder = uHdrOutput > 0.5 ? 0.74 : 0.90;
    // Half-float targets retain an intrinsic ~20x luminance ceiling for only
    // the moving platinum tracer. The downstream low-exposure composite then
    // has real highlight energy to work with instead of upscaling brown LDR.
    float hotShoulder = uHdrOutput > 0.5 ? 0.05 : 0.28;
    float highlightHeadroom = clamp(
      max(
        innerHeat * (
          0.015 + tracerImageWeight * (
            rotationArc * 0.02 + leadingHotspot * 0.15
          )
        ),
        platinumRibbon * (0.10 + leadingHotspot * 0.25)
      ),
      0.0,
      1.0
    );
    float shoulderStrength = mix(
      baseShoulder,
      hotShoulder,
      highlightHeadroom
    );
    radiance /= 1.0 + discLuminance * shoulderStrength;
    // Re-inject one bounded, saturated gold source-space arc after the
    // shoulder. The previous pre-shoulder platinum signal was compressed into
    // the almost-static pale Doppler crescent. This post-shoulder tracer stays
    // position-readable at low room exposure, yet its Gaussian radius,
    // one-sided angular carrier and 4% secondary weight prevent a closed ring
    // or a field of luminous coils.
    float displayTracer = ribbonCarrier * mix(
      0.78,
      1.0,
      smoothstep(0.20, 1.10, carrierRelativisticBoost)
    );
    vec3 goldTracerColour = mix(
      vec3(2.8, 0.62, 0.025),
      // Only the narrow leading knot reaches a near-white solar colour. The
      // much longer carrier stays amber, so the moving cue reads as HDR
      // without flattening into another pale crescent.
      vec3(12.0, 9.0, 4.8),
      smoothstep(0.08, 0.92, leadingHotspot)
    );
    // Final display-space lift: enough for the moving arc to read from normal
    // viewing distance, while its narrow Gaussian footprint keeps the frame's
    // average luminance essentially unchanged.
    float goldTracerEnergy = 0.96 + leadingHotspot * 0.39;
    radiance += goldTracerColour * displayTracer * goldTracerEnergy;
    return vec4(radiance * alpha, alpha);
  }

  void main() {
    if (uAtlasReady < 0.5 || uSkyReady < 0.5 || uReveal <= 0.0) discard;

    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 viewPoint = uProjectionInverse * vec4(ndc, 1.0, 1.0);
    vec3 viewDirection = normalize(viewPoint.xyz / max(abs(viewPoint.w), 1e-6));
    vec3 rayDirection = normalize(mat3(uCameraWorldMatrix) * viewDirection);
    vec3 lensVector = uLensPosition - uCameraPosition;
    float cameraDistance = length(lensVector);
    if (cameraDistance <= uMassWorldScale * 1.001) discard;
    vec3 lensDirection = lensVector / cameraDistance;

    vec3 imageRight = uImageRight
      - lensDirection * dot(uImageRight, lensDirection);
    if (length(imageRight) < 1e-5) {
      imageRight = cross(
        abs(lensDirection.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0),
        lensDirection
      );
    }
    imageRight = normalize(imageRight);
    vec3 imageUp = uImageUp
      - lensDirection * dot(uImageUp, lensDirection)
      - imageRight * dot(uImageUp, imageRight);
    if (length(imageUp) < 1e-5) imageUp = cross(lensDirection, imageRight);
    imageUp = normalize(imageUp);

    float forward = dot(rayDirection, lensDirection);
    if (forward <= 0.0) discard;
    vec2 tangentOffset = vec2(
      dot(rayDirection, imageRight),
      dot(rayDirection, imageUp)
    ) / max(forward, 1e-5);
    vec2 alphaBeta = tangentOffset * cameraDistance
      / max(uMassWorldScale, 1e-5);
    vec2 atlasAbsolute = abs(alphaBeta);
    if (atlasAbsolute.x > uAtlasExtent.x
      || atlasAbsolute.y > uAtlasExtent.y) discard;

    vec2 atlasUv = vec2(
      (alphaBeta.x + uAtlasExtent.x) / (2.0 * uAtlasExtent.x),
      (uAtlasExtent.y - alphaBeta.y) / (2.0 * uAtlasExtent.y)
    );
    ivec2 texel = atlasTexel(atlasUv);
    // Status/order are discrete topology labels. Nearest texelFetch prevents
    // interpolation across the event horizon and unresolved critical rays.
    vec4 skyTransfer = texelFetch(uKerrSkyAtlas, texel, 0);
    float status = floor(skyTransfer.a + 0.5);
    if (status > STATUS_CAPTURED + 0.25) discard;

    vec2 pathTransfer = texelFetch(uKerrPathAtlas, texel, 0).rg;
    vec3 sceneColour = vec3(0.0);
    if (status < STATUS_ESCAPED + 0.25) {
      if (dot(skyTransfer.xyz, skyTransfer.xyz) < 0.25) discard;
      float imageOrder = floor(pathTransfer.y + 0.5);
      vec3 atlasExitDirection = sampleKerrExitDirection(
        atlasUv,
        status,
        imageOrder,
        skyTransfer.xyz
      );
      vec3 exitDirection = normalize(uKerrToWorld * atlasExitDirection);
      sceneColour = sampleUpperSource(
        uSkyTexture,
        exitDirection,
        uSkyRotation,
        uSkyBrightness,
        true
      );
      // Long near-hole paths cross more circumblack-hole material than the
      // unobstructed source sky. Attenuate only the diffuse photograph toward
      // small impact parameters; sharp Gaia/hero photons are added below and
      // remain the high-frequency visual anchor instead of turning the warped
      // Milky Way into two dominant image-like wedges.
      float normalizedImpact = length(alphaBeta / uAtlasExtent);
      float diffuseTransmission = mix(
        0.08,
        1.0,
        smoothstep(0.20, 0.82, normalizedImpact)
      );
      sceneColour *= diffuseTransmission;
      if (uStarSourceReady > 0.5) {
        vec3 starRadiance = sampleUpperSource(
          uStarSourceTexture,
          exitDirection,
          uStarSourceRotation,
          uStarSourceBrightness,
          false
        );
        float delayedTime = uTime - max(pathTransfer.x, 0.0) * 0.0025;
        float phase = noise21(floor(upperSkyUv(exitDirection) * 4096.0));
        float scintillation = 0.975 + 0.025 * sin(
          delayedTime * mix(1.1, 2.4, phase) + phase * 2.0 * PI
        );
        sceneColour += starRadiance * scintillation;
      }
    }

    if (uSecondaryDisc > 0.5) {
      float secondaryCoverage = 0.0;
      vec4 secondaryCrossing = sampleDiscCrossing(
        uKerrDiscSecondaryAtlas,
        atlasUv,
        secondaryCoverage
      );
      vec4 secondary = shadeDisc(
        secondaryCrossing,
        0.26,
        secondaryCoverage
      );
      sceneColour = sceneColour * (1.0 - secondary.a) + secondary.rgb;
    }
    float primaryCoverage = 0.0;
    vec4 primaryCrossing = sampleDiscCrossing(
      uKerrDiscPrimaryAtlas,
      atlasUv,
      primaryCoverage
    );
    vec4 primary = shadeDisc(
      primaryCrossing,
      1.0,
      primaryCoverage
    );
    sceneColour = sceneColour * (1.0 - primary.a) + primary.rgb;

    float edgeDistance = max(
      atlasAbsolute.x / uAtlasExtent.x,
      atlasAbsolute.y / uAtlasExtent.y
    );
    float edgeAa = max(fwidth(edgeDistance) * 1.5, 1.0 / uAtlasSize.x);
    float atlasCoverage = 1.0 - smoothstep(
      0.72 - edgeAa,
      1.0,
      edgeDistance
    );
    float coverage = atlasCoverage * clamp(uReveal, 0.0, 1.0);
    if (coverage <= 1.0 / 4096.0) discard;
    // Captured rays intentionally contribute opaque black unless a valid disc
    // crossing above emitted light. Unresolved/invalid pixels were discarded,
    // allowing the already-hot Schwarzschild layer underneath to show through.
    observatoryFragColor = vec4(sceneColour * coverage, coverage);
  }
`;

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function asDataView(binary) {
  if (binary instanceof ArrayBuffer) return new DataView(binary);
  if (ArrayBuffer.isView(binary)) {
    return new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  }
  throw new TypeError(
    "Observatory Kerr atlas must be an ArrayBuffer or typed-array view"
  );
}

function atlasSpecFromKind(kind) {
  const normalized = String(kind ?? "").toLowerCase();
  if (normalized === "sky") return OBSERVATORY_KERR_LENS_ATLAS_SPECS.sky;
  if (normalized === "disc-primary" || normalized === "discprimary") {
    return OBSERVATORY_KERR_LENS_ATLAS_SPECS.discPrimary;
  }
  if (normalized === "disc-secondary" || normalized === "discsecondary") {
    return OBSERVATORY_KERR_LENS_ATLAS_SPECS.discSecondary;
  }
  if (normalized === "path") return OBSERVATORY_KERR_LENS_ATLAS_SPECS.path;
  throw new RangeError(`Unknown observatory Kerr atlas kind: ${kind}`);
}

function materialFrom(value) {
  if (value?.isMaterial) return value;
  return value?.material?.isMaterial ? value.material : null;
}

function copyVector3(target, value, fallback) {
  if (value?.isVector3) return target.copy(value);
  if (Array.isArray(value)) {
    return target.set(
      finite(value[0], fallback.x),
      finite(value[1], fallback.y),
      finite(value[2], fallback.z)
    );
  }
  return target.set(
    finite(value?.x, fallback.x),
    finite(value?.y, fallback.y),
    finite(value?.z, fallback.z)
  );
}

function copyMatrix3(target, value) {
  if (value?.isMatrix3) return target.copy(value);
  if (value?.isMatrix4) return target.setFromMatrix4(value);
  if (Array.isArray(value) && value.length >= 9) return target.fromArray(value);
  return target.identity();
}

export function normalizeObservatoryKerrLensQuality(quality) {
  const normalized = typeof quality === "string" ? quality.toLowerCase() : "";
  return OBSERVATORY_KERR_LENS_QUALITY_PRESETS[normalized]?.id
    ?? OBSERVATORY_KERR_LENS_DEFAULT_QUALITY;
}

export function getObservatoryKerrLensQualityPreset(quality) {
  return OBSERVATORY_KERR_LENS_QUALITY_PRESETS[
    normalizeObservatoryKerrLensQuality(quality)
  ];
}

export function getObservatoryKerrLensSupport(rendererOrCapabilities) {
  const capabilities = rendererOrCapabilities?.capabilities
    ?? rendererOrCapabilities
    ?? {};
  const webgl2 = capabilities.isWebGL2 === true;
  const maxTextureSize = Number.isFinite(capabilities.maxTextureSize)
    ? capabilities.maxTextureSize
    : 0;
  const atlasSizeSupported = maxTextureSize === 0
    || maxTextureSize >= OBSERVATORY_KERR_LENS_ATLAS_WIDTH;
  return Object.freeze({
    webgl2,
    maxTextureSize,
    atlasSizeSupported,
    supported: webgl2 && atlasSizeSupported,
    fallback: webgl2 && atlasSizeSupported ? null : "schwarzschild-lut"
  });
}

export function decodeObservatoryKerrLensAtlas(binary, kind) {
  const spec = atlasSpecFromKind(kind);
  const view = asDataView(binary);
  const expectedFloats = 2 + spec.width * spec.height * spec.channels;
  const expectedBytes = expectedFloats * Float32Array.BYTES_PER_ELEMENT;
  if (view.byteLength !== expectedBytes) {
    throw new RangeError(
      `${spec.kind} Kerr atlas has ${view.byteLength} bytes; expected ${expectedBytes}`
    );
  }
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  if (width !== spec.width || height !== spec.height) {
    throw new RangeError(
      `${spec.kind} Kerr atlas header is ${width}x${height}; expected ${spec.width}x${spec.height}`
    );
  }
  const data = new Float32Array(spec.width * spec.height * spec.channels);
  for (let index = 0; index < data.length; index += 1) {
    const value = view.getFloat32(
      (index + 2) * Float32Array.BYTES_PER_ELEMENT,
      true
    );
    if (!Number.isFinite(value)) {
      throw new RangeError(`${spec.kind} Kerr atlas contains a non-finite texel`);
    }
    data[index] = value;
  }
  return {
    kind: spec.kind,
    width: spec.width,
    height: spec.height,
    channels: spec.channels,
    data
  };
}

export function createObservatoryKerrLensAtlasTexture(decoded) {
  const spec = atlasSpecFromKind(decoded?.kind);
  if (
    decoded.width !== spec.width
    || decoded.height !== spec.height
    || decoded.channels !== spec.channels
    || !(decoded.data instanceof Float32Array)
    || decoded.data.length !== spec.width * spec.height * spec.channels
  ) {
    throw new TypeError(`Invalid decoded ${spec.kind} Kerr atlas`);
  }
  const texture = new THREE.DataTexture(
    decoded.data,
    decoded.width,
    decoded.height,
    spec.format,
    THREE.FloatType
  );
  texture.name = `mushroom-observatory-kerr-${spec.kind}-atlas`;
  texture.internalFormat = spec.internalFormat;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // Topology/status labels and invalid disc crossings must never interpolate.
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.colorSpace = THREE.NoColorSpace;
  texture.userData.observatoryKerrAtlasKind = spec.kind;
  texture.userData.observatoryDisposed = false;
  texture.needsUpdate = true;
  return texture;
}

export function createObservatoryKerrLensAtlases({
  sky,
  discPrimary,
  discSecondary,
  path
} = {}) {
  const decode = (value, kind) => value?.data instanceof Float32Array
    ? value
    : decodeObservatoryKerrLensAtlas(value, kind);
  return {
    sky: createObservatoryKerrLensAtlasTexture(decode(sky, "sky")),
    discPrimary: createObservatoryKerrLensAtlasTexture(
      decode(discPrimary, "disc-primary")
    ),
    discSecondary: createObservatoryKerrLensAtlasTexture(
      decode(discSecondary, "disc-secondary")
    ),
    path: createObservatoryKerrLensAtlasTexture(decode(path, "path")),
    disposed: false
  };
}

export function isObservatoryKerrLensAtlasReady(atlases) {
  return Boolean(
    atlases?.sky?.isTexture
    && atlases?.discPrimary?.isTexture
    && atlases?.discSecondary?.isTexture
    && atlases?.path?.isTexture
    && !atlases.disposed
  );
}

export async function loadObservatoryKerrLensAtlases({
  fetchImpl = globalThis.fetch,
  skyUrl = OBSERVATORY_KERR_LENS_SKY_URL,
  discPrimaryUrl = OBSERVATORY_KERR_LENS_DISC_PRIMARY_URL,
  discSecondaryUrl = OBSERVATORY_KERR_LENS_DISC_SECONDARY_URL,
  pathUrl = OBSERVATORY_KERR_LENS_PATH_URL,
  signal
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required to load Kerr atlases");
  }
  const requests = [
    ["sky", skyUrl],
    ["disc-primary", discPrimaryUrl],
    ["disc-secondary", discSecondaryUrl],
    ["path", pathUrl]
  ];
  const responses = await Promise.all(
    requests.map(([, url]) => fetchImpl(url, { signal }))
  );
  for (let index = 0; index < responses.length; index += 1) {
    if (!responses[index]?.ok) {
      throw new Error(
        `Failed to load Kerr ${requests[index][0]} atlas (${responses[index]?.status ?? "network"})`
      );
    }
  }
  const binaries = await Promise.all(
    responses.map((response) => response.arrayBuffer())
  );
  return createObservatoryKerrLensAtlases({
    sky: binaries[0],
    discPrimary: binaries[1],
    discSecondary: binaries[2],
    path: binaries[3]
  });
}

export function disposeObservatoryKerrLensAtlases(atlases) {
  if (!atlases || atlases.disposed) return false;
  for (const texture of [
    atlases.sky,
    atlases.discPrimary,
    atlases.discSecondary,
    atlases.path
  ]) {
    if (!texture?.isTexture || texture.userData?.observatoryDisposed) continue;
    texture.dispose();
    texture.userData.observatoryDisposed = true;
  }
  atlases.disposed = true;
  return true;
}

export function createObservatoryKerrLensMaterial({
  skyTexture = null,
  starSourceTexture = null,
  atlases = null,
  quality = OBSERVATORY_KERR_LENS_DEFAULT_QUALITY,
  reveal = 0,
  massWorldScale = DEFAULT_MASS_WORLD_SCALE,
  skyBrightness = 0.36,
  starSourceBrightness = 0.72,
  discOuterRadius = DEFAULT_DISC_OUTER_RADIUS,
  discOpacity = DEFAULT_DISC_OPACITY,
  hdrOutput = true
} = {}) {
  const preset = getObservatoryKerrLensQualityPreset(quality);
  const atlasReady = isObservatoryKerrLensAtlasReady(atlases);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSkyTexture: { value: skyTexture },
      uStarSourceTexture: { value: starSourceTexture },
      uKerrSkyAtlas: { value: atlases?.sky ?? null },
      uKerrDiscPrimaryAtlas: { value: atlases?.discPrimary ?? null },
      uKerrDiscSecondaryAtlas: { value: atlases?.discSecondary ?? null },
      uKerrPathAtlas: { value: atlases?.path ?? null },
      uCameraWorldMatrix: { value: new THREE.Matrix4() },
      uProjectionInverse: { value: new THREE.Matrix4() },
      uKerrToWorld: { value: new THREE.Matrix3() },
      uSkyRotation: { value: new THREE.Matrix3() },
      uStarSourceRotation: { value: new THREE.Matrix3() },
      uCameraPosition: { value: new THREE.Vector3() },
      uLensPosition: { value: new THREE.Vector3(0, 0, -42) },
      uImageRight: { value: new THREE.Vector3(1, 0, 0) },
      uImageUp: { value: new THREE.Vector3(0, 1, 0) },
      uAtlasSize: {
        value: new THREE.Vector2(
          OBSERVATORY_KERR_LENS_ATLAS_WIDTH,
          OBSERVATORY_KERR_LENS_ATLAS_HEIGHT
        )
      },
      uAtlasExtent: {
        value: new THREE.Vector2(
          OBSERVATORY_KERR_LENS_ALPHA_EXTENT,
          OBSERVATORY_KERR_LENS_BETA_EXTENT
        )
      },
      uMassWorldScale: {
        value: finitePositive(massWorldScale, DEFAULT_MASS_WORLD_SCALE)
      },
      uSkyBrightness: {
        value: THREE.MathUtils.clamp(finite(skyBrightness, 0.36), 0, 4)
      },
      uStarSourceBrightness: {
        value: THREE.MathUtils.clamp(finite(starSourceBrightness, 0.72), 0, 4)
      },
      uDiscOuterRadius: {
        value: Math.max(
          finitePositive(discOuterRadius, DEFAULT_DISC_OUTER_RADIUS),
          OBSERVATORY_KERR_LENS_ISCO_RADIUS + 0.5
        )
      },
      uDiscOpacity: {
        value: THREE.MathUtils.clamp(finite(discOpacity, DEFAULT_DISC_OPACITY), 0, 1)
      },
      uReveal: { value: THREE.MathUtils.clamp(finite(reveal, 0), 0, 1) },
      uTime: { value: 0 },
      uAtlasReady: { value: atlasReady ? 1 : 0 },
      uSkyReady: { value: skyTexture?.isTexture ? 1 : 0 },
      uStarSourceReady: { value: starSourceTexture?.isTexture ? 1 : 0 },
      uSecondaryDisc: {
        value: preset.enabled && preset.secondaryDisc ? 1 : 0
      },
      uHdrOutput: { value: hdrOutput === false ? 0 : 1 }
    },
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: KERR_FRAGMENT_SHADER,
    glslVersion: THREE.GLSL3,
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false
  });
  material.name = OBSERVATORY_KERR_LENS_MATERIAL_NAME;
  material.userData.observatoryDisposed = false;
  material.userData.requiresWebGL2 = true;
  material.userData.kerrAtlases = atlasReady ? atlases : null;
  material.userData.quality = preset.id;
  material.userData.fallback = !atlasReady;
  material.userData.fallbackReason = atlasReady ? null : "atlas-unavailable";
  return material;
}

export function createObservatoryKerrLens({
  visible = false,
  ownsAtlases = false,
  lensPosition,
  imageRight,
  imageUp,
  kerrToWorld,
  skyRotation,
  starSourceRotation,
  ...materialOptions
} = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -1, -1, 0,
    3, -1, 0,
    -1, 3, 0
  ], 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([
    0, 0,
    2, 0,
    0, 2
  ], 2));
  const material = createObservatoryKerrLensMaterial(materialOptions);
  const lens = new THREE.Mesh(geometry, material);
  lens.name = OBSERVATORY_KERR_LENS_NAME;
  lens.frustumCulled = false;
  lens.renderOrder = OBSERVATORY_KERR_LENS_RENDER_ORDER;
  lens.visible = Boolean(visible);

  if (lensPosition !== undefined) {
    copyVector3(material.uniforms.uLensPosition.value, lensPosition, material.uniforms.uLensPosition.value);
  }
  if (imageRight !== undefined) {
    copyVector3(material.uniforms.uImageRight.value, imageRight, material.uniforms.uImageRight.value).normalize();
  }
  if (imageUp !== undefined) {
    copyVector3(material.uniforms.uImageUp.value, imageUp, material.uniforms.uImageUp.value).normalize();
  }
  if (kerrToWorld !== undefined) copyMatrix3(material.uniforms.uKerrToWorld.value, kerrToWorld);
  if (skyRotation !== undefined) copyMatrix3(material.uniforms.uSkyRotation.value, skyRotation);
  if (starSourceRotation !== undefined) {
    copyMatrix3(material.uniforms.uStarSourceRotation.value, starSourceRotation);
  }

  lens.userData.requestedVisible = Boolean(visible);
  lens.userData.quality = material.userData.quality;
  lens.userData.atlases = material.userData.kerrAtlases;
  lens.userData.ownsAtlases = Boolean(ownsAtlases);
  lens.userData.atlasReady = material.uniforms.uAtlasReady.value > 0.5;
  lens.userData.sourceStarsReady = material.uniforms.uStarSourceReady.value > 0.5;
  lens.userData.fallback = material.userData.fallback;
  lens.userData.fallbackReason = material.userData.fallbackReason;
  lens.userData.reveal = material.uniforms.uReveal.value;
  lens.userData.timeSeconds = 0;
  lens.userData.prewarming = false;
  lens.userData.disposed = false;
  return lens;
}

export function setObservatoryKerrLensAtlases(lensOrMaterial, atlases, { ownsAtlases } = {}) {
  const material = materialFrom(lensOrMaterial);
  if (!material?.uniforms || material.userData?.observatoryDisposed) return false;
  const ready = isObservatoryKerrLensAtlasReady(atlases);
  material.uniforms.uKerrSkyAtlas.value = ready ? atlases.sky : null;
  material.uniforms.uKerrDiscPrimaryAtlas.value = ready ? atlases.discPrimary : null;
  material.uniforms.uKerrDiscSecondaryAtlas.value = ready ? atlases.discSecondary : null;
  material.uniforms.uKerrPathAtlas.value = ready ? atlases.path : null;
  material.uniforms.uAtlasReady.value = ready ? 1 : 0;
  material.userData.kerrAtlases = ready ? atlases : null;
  material.userData.fallback = !ready;
  material.userData.fallbackReason = ready ? null : "atlas-unavailable";
  if (lensOrMaterial?.isObject3D) {
    lensOrMaterial.userData.atlases = ready ? atlases : null;
    lensOrMaterial.userData.atlasReady = ready;
    lensOrMaterial.userData.fallback = !ready;
    lensOrMaterial.userData.fallbackReason = ready ? null : "atlas-unavailable";
    if (ownsAtlases !== undefined) lensOrMaterial.userData.ownsAtlases = Boolean(ownsAtlases);
  }
  return ready;
}

export function setObservatoryKerrLensVisible(lens, visible) {
  if (!lens?.isObject3D || lens.userData.disposed) return false;
  lens.userData.requestedVisible = Boolean(visible);
  if (!lens.userData.requestedVisible) lens.visible = false;
  return true;
}

export function updateObservatoryKerrLens(lens, camera, {
  time,
  timeSeconds,
  reveal,
  quality,
  skyTexture,
  starSourceTexture,
  atlases,
  lensPosition,
  imageRight,
  imageUp,
  kerrToWorld,
  skyRotation,
  starSourceRotation,
  massWorldScale,
  skyBrightness,
  starSourceBrightness,
  discOuterRadius,
  discOpacity,
  hdrOutput
} = {}) {
  if (!lens?.isObject3D || lens.userData.disposed || !camera?.isCamera) return false;
  const material = materialFrom(lens);
  if (!material?.uniforms || material.userData.observatoryDisposed) return false;
  if (atlases !== undefined) setObservatoryKerrLensAtlases(lens, atlases);
  const preset = getObservatoryKerrLensQualityPreset(quality ?? lens.userData.quality);
  const safeReveal = THREE.MathUtils.clamp(finite(reveal, lens.userData.reveal), 0, 1);
  const safeTime = finite(timeSeconds, finite(time, lens.userData.timeSeconds));
  if (skyTexture !== undefined) material.uniforms.uSkyTexture.value = skyTexture;
  if (starSourceTexture !== undefined) material.uniforms.uStarSourceTexture.value = starSourceTexture;
  material.uniforms.uSkyReady.value = material.uniforms.uSkyTexture.value?.isTexture ? 1 : 0;
  material.uniforms.uStarSourceReady.value = material.uniforms.uStarSourceTexture.value?.isTexture ? 1 : 0;
  material.uniforms.uSecondaryDisc.value = preset.enabled && preset.secondaryDisc ? 1 : 0;
  material.uniforms.uReveal.value = safeReveal;
  material.uniforms.uTime.value = safeTime;

  camera.updateWorldMatrix(true, false);
  material.uniforms.uCameraWorldMatrix.value.copy(camera.matrixWorld);
  material.uniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
  camera.getWorldPosition(material.uniforms.uCameraPosition.value);
  if (lensPosition !== undefined) copyVector3(material.uniforms.uLensPosition.value, lensPosition, material.uniforms.uLensPosition.value);
  if (imageRight !== undefined) copyVector3(material.uniforms.uImageRight.value, imageRight, material.uniforms.uImageRight.value).normalize();
  if (imageUp !== undefined) copyVector3(material.uniforms.uImageUp.value, imageUp, material.uniforms.uImageUp.value).normalize();
  if (kerrToWorld !== undefined) copyMatrix3(material.uniforms.uKerrToWorld.value, kerrToWorld);
  if (skyRotation !== undefined) copyMatrix3(material.uniforms.uSkyRotation.value, skyRotation);
  if (starSourceRotation !== undefined) copyMatrix3(material.uniforms.uStarSourceRotation.value, starSourceRotation);
  if (massWorldScale !== undefined) material.uniforms.uMassWorldScale.value = finitePositive(massWorldScale, DEFAULT_MASS_WORLD_SCALE);
  if (skyBrightness !== undefined) material.uniforms.uSkyBrightness.value = THREE.MathUtils.clamp(finite(skyBrightness, 0.36), 0, 4);
  if (starSourceBrightness !== undefined) material.uniforms.uStarSourceBrightness.value = THREE.MathUtils.clamp(finite(starSourceBrightness, 0.72), 0, 4);
  if (discOuterRadius !== undefined) material.uniforms.uDiscOuterRadius.value = Math.max(finitePositive(discOuterRadius, DEFAULT_DISC_OUTER_RADIUS), OBSERVATORY_KERR_LENS_ISCO_RADIUS + 0.5);
  if (discOpacity !== undefined) material.uniforms.uDiscOpacity.value = THREE.MathUtils.clamp(finite(discOpacity, DEFAULT_DISC_OPACITY), 0, 1);
  if (hdrOutput !== undefined) material.uniforms.uHdrOutput.value = hdrOutput === false ? 0 : 1;

  lens.userData.quality = preset.id;
  lens.userData.reveal = safeReveal;
  lens.userData.timeSeconds = safeTime;
  lens.userData.atlasReady = material.uniforms.uAtlasReady.value > 0.5;
  lens.userData.sourceStarsReady = material.uniforms.uStarSourceReady.value > 0.5;
  lens.userData.fallback = !preset.enabled || !lens.userData.atlasReady;
  lens.userData.fallbackReason = !preset.enabled
    ? "quality-fallback"
    : lens.userData.atlasReady ? null : "atlas-unavailable";
  material.userData.quality = preset.id;
  material.userData.fallback = lens.userData.fallback;
  material.userData.fallbackReason = lens.userData.fallbackReason;
  const active = lens.userData.requestedVisible
    && preset.enabled
    && lens.userData.atlasReady
    && safeReveal > REVEAL_EPSILON
    && material.uniforms.uSkyReady.value > 0.5;
  lens.visible = active;
  return active;
}

export function prewarmObservatoryKerrLens(lens, quality = OBSERVATORY_KERR_LENS_DEFAULT_QUALITY) {
  if (!lens?.isObject3D || lens.userData.disposed) return false;
  const material = materialFrom(lens);
  if (!material?.uniforms || material.userData.observatoryDisposed) return false;
  const previous = {
    visible: lens.visible,
    requestedVisible: lens.userData.requestedVisible,
    prewarming: lens.userData.prewarming,
    reveal: material.uniforms.uReveal.value,
    secondaryDisc: material.uniforms.uSecondaryDisc.value
  };
  const preset = getObservatoryKerrLensQualityPreset(quality);
  lens.userData.prewarming = true;
  lens.visible = true;
  material.uniforms.uReveal.value = PREWARM_REVEAL;
  material.uniforms.uSecondaryDisc.value = preset.enabled && preset.secondaryDisc ? 1 : 0;
  let restored = false;
  return function restoreObservatoryKerrLensAfterPrewarm() {
    if (restored || lens.userData.disposed) return false;
    restored = true;
    lens.visible = previous.visible;
    lens.userData.requestedVisible = previous.requestedVisible;
    lens.userData.prewarming = previous.prewarming;
    material.uniforms.uReveal.value = previous.reveal;
    material.uniforms.uSecondaryDisc.value = previous.secondaryDisc;
    return true;
  };
}

export function disposeObservatoryKerrLens(lens) {
  if (!lens?.isObject3D || lens.userData.disposed) return false;
  lens.userData.disposed = true;
  lens.userData.prewarming = false;
  const material = materialFrom(lens);
  lens.geometry?.dispose();
  material?.dispose();
  if (material) material.userData.observatoryDisposed = true;
  if (lens.userData.ownsAtlases) disposeObservatoryKerrLensAtlases(lens.userData.atlases);
  lens.removeFromParent();
  lens.clear();
  return true;
}

export {
  FULLSCREEN_VERTEX_SHADER as OBSERVATORY_KERR_LENS_VERTEX_SHADER,
  KERR_FRAGMENT_SHADER as OBSERVATORY_KERR_LENS_FRAGMENT_SHADER
};
