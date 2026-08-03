import * as THREE from "three";

import {
  MUSHROOM_INTERIOR_CENTER,
  MUSHROOM_INTERIOR_EYE_Y
} from "./mushroom-interior-config.js";
import { normalizeObservatoryQuality } from "./observatory-quality.js";

export const OBSERVATORY_BLACK_HOLE_NAME = "mushroom-observatory-black-hole";
export const OBSERVATORY_BLACK_HOLE_HORIZON_NAME =
  "mushroom-observatory-black-hole-horizon";
export const OBSERVATORY_BLACK_HOLE_PHOTON_RING_NAME =
  "mushroom-observatory-black-hole-photon-ring";
export const OBSERVATORY_BLACK_HOLE_DISK_ROOT_NAME =
  "mushroom-observatory-black-hole-disk-root";
export const OBSERVATORY_BLACK_HOLE_DEBRIS_NAME =
  "mushroom-observatory-black-hole-debris";
export const OBSERVATORY_BLACK_HOLE_MOON_NAME =
  "mushroom-observatory-black-hole-scale-moon";

export const OBSERVATORY_BLACK_HOLE_DEFAULT_QUALITY = "medium";
export const OBSERVATORY_BLACK_HOLE_WORLD_DISTANCE = 42;
// These are reference orbital periods for the moving gas pattern, not a
// rotation of the event horizon or the disc mesh. The three render paths
// (Kerr atlas, Schwarzschild LUT and procedural fallback) share this cadence:
// a visitor can read the motion within a few seconds without seeing a portal-
// like rigidly spinning ring. The middle flow is the authored 15 s reference;
// inner and outer flows preserve the original 2:3:5 differential ratio.
export const OBSERVATORY_BLACK_HOLE_FLOW_PERIODS = Object.freeze({
  inner: 10,
  middle: 15,
  outer: 25
});

const LOFT_ORIGIN = new THREE.Vector3(
  MUSHROOM_INTERIOR_CENTER.x,
  MUSHROOM_INTERIOR_EYE_Y[2],
  MUSHROOM_INTERIOR_CENTER.z
);
// Compose the hidden event near the visual centre of the loft-center camera,
// not at the top edge of the dome. The slight horizontal/vertical offset
// preserves room for parallax while keeping the full 14.4 m disc readable.
const DEFAULT_DIRECTION = new THREE.Vector3(
  0.11776325,
  0.98693308,
  -0.10997683
).normalize();
const DEFAULT_ANCHOR_VECTOR = DEFAULT_DIRECTION
  .clone()
  .multiplyScalar(OBSERVATORY_BLACK_HOLE_WORLD_DISTANCE)
  .add(LOFT_ORIGIN);

// This matches the finite anchor used by the first hidden lens experiment. It
// intentionally does not follow the camera: walking across the loft changes
// both its screen direction and angular size against the camera-centred sky.
export const OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR = Object.freeze({
  x: DEFAULT_ANCHOR_VECTOR.x,
  y: DEFAULT_ANCHOR_VECTOR.y,
  z: DEFAULT_ANCHOR_VECTOR.z
});

export const OBSERVATORY_BLACK_HOLE_DEFAULT_TILT = Object.freeze({
  x: THREE.MathUtils.degToRad(52),
  y: THREE.MathUtils.degToRad(20),
  z: THREE.MathUtils.degToRad(-12)
});

export const OBSERVATORY_BLACK_HOLE_QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({
    id: "high",
    diskLayers: 3,
    photonShells: 2,
    debrisCount: 72
  }),
  medium: Object.freeze({
    id: "medium",
    diskLayers: 3,
    photonShells: 2,
    debrisCount: 40
  }),
  low: Object.freeze({
    id: "low",
    diskLayers: 1,
    photonShells: 1,
    debrisCount: 16
  }),
  minimum: Object.freeze({
    id: "minimum",
    diskLayers: 0,
    photonShells: 1,
    debrisCount: 0
  })
});

const HORIZON_RADIUS = 2.18;
// The luminous disc is 14.4 m across at its largest layer. At the default
// 42 m anchor it reads as a substantial finite object without swallowing the
// whole observatory aperture.
const DISK_OUTER_RADIUS = 7.2;
const DEBRIS_MAX_COUNT = OBSERVATORY_BLACK_HOLE_QUALITY_PRESETS.high.debrisCount;
const REVEAL_EPSILON = 0.001;
const OCCLUSION_REVEAL_THRESHOLD = 0.08;
const PREWARM_REVEAL = 0.01;
const TWO_PI = Math.PI * 2;

const DISK_LAYER_DEFINITIONS = Object.freeze([
  Object.freeze({
    innerRadius: 2.72,
    outerRadius: 4.36,
    thickness: 0.28,
    height: -0.13,
    segments: 144,
    flowSpeed: TWO_PI / OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.inner,
    referenceRadius: 3.54,
    phase: 0.4,
    brightness: 2.55,
    approach: "#ffd45a",
    recede: "#5e1700"
  }),
  Object.freeze({
    innerRadius: 3.86,
    outerRadius: 5.78,
    thickness: 0.42,
    height: 0.08,
    segments: 128,
    flowSpeed: TWO_PI / OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.middle,
    referenceRadius: 4.82,
    phase: 2.2,
    brightness: 1.42,
    approach: "#ff9d0a",
    recede: "#210700"
  }),
  Object.freeze({
    innerRadius: 5.08,
    outerRadius: DISK_OUTER_RADIUS,
    thickness: 0.58,
    height: 0.31,
    segments: 112,
    flowSpeed: TWO_PI / OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.outer,
    referenceRadius: 6.14,
    phase: 4.1,
    brightness: 0.64,
    approach: "#9a4300",
    recede: "#080200"
  })
]);

const HORIZON_VERTEX_SHADER = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HORIZON_FRAGMENT_SHADER = /* glsl */ `
  uniform float uReveal;

  float screenDither(vec2 pixel) {
    return fract(sin(dot(floor(pixel), vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    float coverage = smoothstep(0.0, 0.34, uReveal);
    if (screenDither(gl_FragCoord.xy) > coverage) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    #include <colorspace_fragment>
  }
`;

const PHOTON_RING_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const PHOTON_RING_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColour;
  uniform float uIntensity;
  uniform float uReveal;
  uniform float uTime;

  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  void main() {
    float facing = abs(dot(normalize(vWorldNormal), normalize(vViewDirection)));
    float narrowRim = pow(clamp(1.0 - facing, 0.0, 1.0), 18.0);
    float wideRim = pow(clamp(1.0 - facing, 0.0, 1.0), 5.5) * 0.12;
    float pulse = 0.94 + 0.06 * sin(uTime * 0.72);
    float alpha = (narrowRim + wideRim) * uIntensity * uReveal * pulse;
    if (alpha < 0.006) discard;
    float whiteHeat = pow(clamp(narrowRim, 0.0, 1.0), 0.35);
    vec3 colour = mix(uColour, vec3(1.0, 0.965, 0.82), whiteHeat * 0.72);
    vec3 radiance = colour * (1.1 + narrowRim * 2.4);
    vec3 mappedRadiance = vec3(1.0) - exp(-radiance * 0.92);
    float emissiveBoost = 1.18 + narrowRim * 2.2;
    gl_FragColor = vec4(mappedRadiance * emissiveBoost, alpha);
    #include <colorspace_fragment>
  }
`;

const MOON_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const MOON_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uLightDirection;
  uniform vec3 uCrescentColour;
  uniform float uReveal;

  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  float screenDither(vec2 pixel) {
    return fract(sin(dot(floor(pixel), vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    float coverage = smoothstep(0.0, 0.46, uReveal);
    if (screenDither(gl_FragCoord.xy) > coverage) discard;
    vec3 normalDirection = normalize(vWorldNormal);
    float illumination = dot(normalDirection, normalize(uLightDirection));
    float crescent = smoothstep(0.34, 0.67, illumination);
    float limb = pow(
      clamp(1.0 - abs(dot(normalDirection, normalize(vViewDirection))), 0.0, 1.0),
      4.2
    );
    vec3 darkBody = vec3(0.004, 0.0025, 0.001);
    vec3 colour = darkBody + uCrescentColour * (crescent * 0.9 + limb * 0.16);
    gl_FragColor = vec4(colour * coverage, 1.0);
    #include <colorspace_fragment>
  }
`;

const DISK_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uReferenceRadius;
  uniform float uLayerPhase;

  attribute float aRadius;
  attribute float aAzimuth;
  attribute float aSurface;

  varying float vDoppler;
  varying float vFlowPhase;
  varying float vRadius;
  varying float vSurface;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec3 localTangent = normalize(vec3(-sin(aAzimuth), 0.0, cos(aAzimuth)));
    vec3 worldTangent = normalize(mat3(modelMatrix) * localTangent);
    vec3 eyeDirection = normalize(cameraPosition - worldPosition.xyz);

    // The sign changes across the finite tilted disc. It drives a blue,
    // brighter approaching side and a dimmer red receding side.
    vDoppler = dot(worldTangent, eyeDirection);
    vRadius = aRadius;
    vSurface = aSurface;
    // The authored layers establish the 10/15/25 s Kepler-like progression.
    // A gentle intra-layer differential keeps filaments shearing naturally
    // without making the inner edge race around like a rigid VFX ring.
    float differentialSpeed = uFlowSpeed * pow(
      uReferenceRadius / max(aRadius, 1.0),
      0.35
    );
    vFlowPhase = aAzimuth - uTime * differentialSpeed + uLayerPhase;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const DISK_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uApproachColour;
  uniform vec3 uRecedeColour;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform float uBrightness;
  uniform float uReveal;
  uniform float uTime;

  varying float vDoppler;
  varying float vFlowPhase;
  varying float vRadius;
  varying float vSurface;

  void main() {
    float radialWidth = max(uOuterRadius - uInnerRadius, 0.001);
    float radialPosition = (vRadius - uInnerRadius) / radialWidth;
    float innerFade = smoothstep(0.0, 0.13, radialPosition);
    float outerFade = 1.0 - smoothstep(0.78, 1.0, radialPosition);
    float radialFade = innerFade * outerFade;

    // Long spiral lanes carry most of the readable motion. Sparse compact
    // hotspots sit inside them, rather than forming a uniformly luminous
    // annulus. (0.5 + 0.5*sin(x))^8 has the exact circular mean below, so the
    // stronger contrast does not raise the disc's average emitted energy.
    const float HOTSPOT_MEAN = 0.196380615234375;
    float longStream = sin(vFlowPhase * 2.0 - vRadius * 1.42);
    float filamentStream = sin(vFlowPhase * 5.0 - vRadius * 2.85);
    float hotspotShape = pow(
      0.5 + 0.5 * sin(vFlowPhase * 3.0 - vRadius * 1.16),
      8.0
    );
    float flowStructure = 1.0
      + longStream * 0.30
      + filamentStream * 0.14
      + (hotspotShape - HOTSPOT_MEAN) * 0.58;
    // 0.69 matches the previous layered-lane mean; only spatial contrast and
    // motion readability change, not the average black/gold balance.
    float filament = 0.69 * flowStructure;
    float surfaceLight = mix(0.62, 1.0, abs(vSurface));

    float approachMix = pow(smoothstep(-0.62, 0.86, vDoppler), 1.7);
    vec3 dopplerGold = mix(uRecedeColour, uApproachColour, approachMix);
    // Keep the solar-white heat in a narrow physical band beside the horizon.
    // The wider disc stays gold, amber and near-black instead of clipping into
    // the pale, uniformly bright ring that additive blending produced before.
    float innerHeat = pow(clamp((3.72 - vRadius) / 1.0, 0.0, 1.0), 1.55);
    vec3 whiteHot = vec3(1.0, 0.965, 0.82);
    float approachHeat = smoothstep(-0.05, 0.72, vDoppler);
    vec3 colour = mix(
      dopplerGold,
      whiteHot,
      innerHeat * (0.16 + approachHeat * 0.7)
    );
    float relativisticBeaming = 0.62
      + 1.48 * max(vDoppler, 0.0)
      - 0.18 * max(-vDoppler, 0.0);
    float alpha = radialFade
      * (0.2 + filament * 0.72)
      * surfaceLight
      * uReveal;
    if (alpha < 0.012) discard;

    vec3 radiance = colour
      * uBrightness
      * max(relativisticBeaming, 0.2)
      * (0.64 + filament * 1.42)
      * (0.74 + innerHeat * 1.35);
    // The black-hole target is intentionally RGBA8. Compress radiance locally
    // so a solar-white inner flow and dark-gold outer lanes survive instead
    // of clipping into one flat white band before the main-scene composite.
    float luminance = dot(radiance, vec3(0.2126, 0.7152, 0.0722));
    vec3 mappedRadiance = vec3(1.0) - exp(-radiance * 0.54);
    float solarHeat = smoothstep(1.9, 4.6, luminance)
      * innerHeat
      * mix(0.1, 1.0, approachHeat);
    mappedRadiance = mix(mappedRadiance, whiteHot, solarHeat * 0.86);
    float goldContrast = mix(0.54, 1.0, approachMix);
    mappedRadiance *= goldContrast;
    // A white-hot core conveys solar intensity in an LDR target; keeping the
    // multiplier close to one preserves the surrounding saturated gold.
    float emissiveBoost = 0.94 + innerHeat * 0.08 + solarHeat * 0.06;
    gl_FragColor = vec4(mappedRadiance * emissiveBoost, alpha);
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

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
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

export function normalizeObservatoryBlackHoleQuality(quality) {
  return normalizeObservatoryQuality(
    quality,
    OBSERVATORY_BLACK_HOLE_DEFAULT_QUALITY
  );
}

export function getObservatoryBlackHoleQualityPreset(quality) {
  return OBSERVATORY_BLACK_HOLE_QUALITY_PRESETS[
    normalizeObservatoryBlackHoleQuality(quality)
  ];
}

function pushVertex(attributes, position, normal, uv, radius, azimuth, surface) {
  attributes.positions.push(position[0], position[1], position[2]);
  attributes.normals.push(normal[0], normal[1], normal[2]);
  attributes.uvs.push(uv[0], uv[1]);
  attributes.radii.push(radius);
  attributes.azimuths.push(azimuth);
  attributes.surfaces.push(surface);
}

function pushQuad(attributes, vertices) {
  const order = [0, 1, 2, 0, 2, 3];
  for (const index of order) {
    const vertex = vertices[index];
    pushVertex(
      attributes,
      vertex.position,
      vertex.normal,
      vertex.uv,
      vertex.radius,
      vertex.azimuth,
      vertex.surface
    );
  }
}

function annulusVertex(radius, y, angle, normal, uv, surface) {
  return {
    position: [Math.cos(angle) * radius, y, Math.sin(angle) * radius],
    normal,
    uv,
    radius,
    azimuth: angle,
    surface
  };
}

function createThickAnnulusGeometry({
  innerRadius,
  outerRadius,
  thickness,
  segments
}) {
  const attributes = {
    positions: [],
    normals: [],
    uvs: [],
    radii: [],
    azimuths: [],
    surfaces: []
  };
  const halfThickness = thickness * 0.5;

  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    const u0 = index / segments;
    const u1 = (index + 1) / segments;
    const outerNormal0 = [Math.cos(a0), 0, Math.sin(a0)];
    const outerNormal1 = [Math.cos(a1), 0, Math.sin(a1)];
    const innerNormal0 = [-Math.cos(a0), 0, -Math.sin(a0)];
    const innerNormal1 = [-Math.cos(a1), 0, -Math.sin(a1)];

    pushQuad(attributes, [
      annulusVertex(innerRadius, halfThickness, a0, [0, 1, 0], [u0, 0], 1),
      annulusVertex(outerRadius, halfThickness, a0, [0, 1, 0], [u0, 1], 1),
      annulusVertex(outerRadius, halfThickness, a1, [0, 1, 0], [u1, 1], 1),
      annulusVertex(innerRadius, halfThickness, a1, [0, 1, 0], [u1, 0], 1)
    ]);
    pushQuad(attributes, [
      annulusVertex(innerRadius, -halfThickness, a1, [0, -1, 0], [u1, 0], -1),
      annulusVertex(outerRadius, -halfThickness, a1, [0, -1, 0], [u1, 1], -1),
      annulusVertex(outerRadius, -halfThickness, a0, [0, -1, 0], [u0, 1], -1),
      annulusVertex(innerRadius, -halfThickness, a0, [0, -1, 0], [u0, 0], -1)
    ]);
    pushQuad(attributes, [
      annulusVertex(outerRadius, -halfThickness, a0, outerNormal0, [u0, 0], 0),
      annulusVertex(outerRadius, -halfThickness, a1, outerNormal1, [u1, 0], 0),
      annulusVertex(outerRadius, halfThickness, a1, outerNormal1, [u1, 1], 0),
      annulusVertex(outerRadius, halfThickness, a0, outerNormal0, [u0, 1], 0)
    ]);
    pushQuad(attributes, [
      annulusVertex(innerRadius, -halfThickness, a1, innerNormal1, [u1, 0], 0),
      annulusVertex(innerRadius, -halfThickness, a0, innerNormal0, [u0, 0], 0),
      annulusVertex(innerRadius, halfThickness, a0, innerNormal0, [u0, 1], 0),
      annulusVertex(innerRadius, halfThickness, a1, innerNormal1, [u1, 1], 0)
    ]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(attributes.positions, 3)
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(attributes.normals, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(attributes.uvs, 2));
  geometry.setAttribute(
    "aRadius",
    new THREE.Float32BufferAttribute(attributes.radii, 1)
  );
  geometry.setAttribute(
    "aAzimuth",
    new THREE.Float32BufferAttribute(attributes.azimuths, 1)
  );
  geometry.setAttribute(
    "aSurface",
    new THREE.Float32BufferAttribute(attributes.surfaces, 1)
  );
  geometry.userData = { innerRadius, outerRadius, thickness, segments };
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createHorizon() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uReveal: { value: 0 } },
    vertexShader: HORIZON_VERTEX_SHADER,
    fragmentShader: HORIZON_FRAGMENT_SHADER,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    side: THREE.FrontSide,
    toneMapped: false,
    fog: false
  });
  material.name = "mushroom-observatory-black-hole-horizon-material";
  const horizon = new THREE.Mesh(
    new THREE.SphereGeometry(HORIZON_RADIUS, 64, 40),
    material
  );
  horizon.name = OBSERVATORY_BLACK_HOLE_HORIZON_NAME;
  horizon.renderOrder = 80;
  horizon.frustumCulled = false;
  return horizon;
}

function createPhotonRing(index) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColour: {
        value: new THREE.Color(index === 0 ? "#ffd76a" : "#ff7812")
      },
      uIntensity: { value: index === 0 ? 1.15 : 0.24 },
      uReveal: { value: 0 },
      uTime: { value: 0 }
    },
    vertexShader: PHOTON_RING_VERTEX_SHADER,
    fragmentShader: PHOTON_RING_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
    fog: false
  });
  material.name = `mushroom-observatory-black-hole-photon-ring-material-${index + 1}`;
  const ring = new THREE.Mesh(
    new THREE.SphereGeometry(HORIZON_RADIUS * (index === 0 ? 1.14 : 1.27), 64, 40),
    material
  );
  ring.name = `${OBSERVATORY_BLACK_HOLE_PHOTON_RING_NAME}-${index + 1}`;
  ring.renderOrder = 120 + index;
  ring.frustumCulled = false;
  return ring;
}

function createScaleMoon() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uLightDirection: {
        value: new THREE.Vector3(-0.72, 0.18, 0.67).normalize()
      },
      uCrescentColour: { value: new THREE.Color("#c9a66a") },
      uReveal: { value: 0 }
    },
    vertexShader: MOON_VERTEX_SHADER,
    fragmentShader: MOON_FRAGMENT_SHADER,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    side: THREE.FrontSide,
    toneMapped: false,
    fog: false
  });
  material.name = "mushroom-observatory-black-hole-scale-moon-material";
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.76, 32, 22),
    material
  );
  moon.name = OBSERVATORY_BLACK_HOLE_MOON_NAME;
  // Offset from the luminous disc and slightly toward the visitor. Besides
  // supplying familiar scale, it can genuinely occlude the far disc while
  // the disc's transparent glow never paints over its depth-written body.
  moon.position.set(6.34, 2.42, 1.18);
  moon.rotation.set(-0.12, 0.46, 0.08);
  moon.renderOrder = 84;
  moon.frustumCulled = false;
  moon.userData.radius = 0.76;
  moon.userData.role = "finite-scale-reference";
  return moon;
}

function createDiskLayer(definition, index) {
  const geometry = createThickAnnulusGeometry(definition);
  const occluderMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    colorWrite: false,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    // Push the invisible pre-pass a hair away from the camera. The colour
    // shader uses an equivalent but separately compiled vertex path; without
    // this tolerance tiny depth-rounding differences show up as radial black
    // cracks between otherwise continuous annulus triangles.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false
  });
  occluderMaterial.name =
    `mushroom-observatory-black-hole-disk-occluder-material-${index + 1}`;

  const occluder = new THREE.Mesh(geometry, occluderMaterial);
  occluder.name = `mushroom-observatory-black-hole-disk-occluder-${index + 1}`;
  occluder.position.y = definition.height;
  occluder.renderOrder = 90 + index;
  occluder.frustumCulled = false;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFlowSpeed: { value: definition.flowSpeed },
      uReferenceRadius: { value: definition.referenceRadius },
      uLayerPhase: { value: definition.phase },
      uApproachColour: { value: new THREE.Color(definition.approach) },
      uRecedeColour: { value: new THREE.Color(definition.recede) },
      uInnerRadius: { value: definition.innerRadius },
      uOuterRadius: { value: definition.outerRadius },
      uBrightness: { value: definition.brightness },
      uReveal: { value: 0 }
    },
    vertexShader: DISK_VERTEX_SHADER,
    fragmentShader: DISK_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false
  });
  material.name = `mushroom-observatory-black-hole-disk-material-${index + 1}`;
  // The depth-only pass already resolves the nearest front/back surface. A
  // single transparent colour pass avoids Three's default double-sided pair.
  material.forceSinglePass = true;

  const glow = new THREE.Mesh(geometry, material);
  glow.name = `mushroom-observatory-black-hole-disk-layer-${index + 1}`;
  glow.position.y = definition.height;
  glow.renderOrder = 132 + index;
  glow.frustumCulled = false;

  return { definition, geometry, occluder, glow, material };
}

function createDebris() {
  const random = seededRandom(0x62686f6c);
  const geometry = new THREE.TetrahedronGeometry(0.07, 0);
  const material = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false
  });
  material.name = "mushroom-observatory-black-hole-debris-material";
  const debris = new THREE.InstancedMesh(geometry, material, DEBRIS_MAX_COUNT);
  debris.name = OBSERVATORY_BLACK_HOLE_DEBRIS_NAME;
  debris.renderOrder = 150;
  debris.frustumCulled = false;

  const orbits = [];
  const whiteGold = new THREE.Color("#fff0b0");
  const deepGold = new THREE.Color("#b94b06");
  for (let index = 0; index < DEBRIS_MAX_COUNT; index += 1) {
    const band = index % 4;
    const radius = 3.05 + band * 0.94 + random() * 0.72;
    const phase = random() * Math.PI * 2;
    const height = (random() - 0.5) * (0.25 + band * 0.17);
    const scale = 0.48 + random() * 1.18;
    const flowBlend = radius <= 4.82
      ? THREE.MathUtils.smoothstep(radius, 3.05, 4.82)
      : THREE.MathUtils.smoothstep(radius, 4.82, 6.59);
    const referencePeriod = radius <= 4.82
      ? THREE.MathUtils.lerp(
        OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.inner,
        OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.middle,
        flowBlend
      )
      : THREE.MathUtils.lerp(
        OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.middle,
        OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.outer,
        flowBlend
      );
    const speed = TWO_PI / (referencePeriod * (0.96 + random() * 0.08));
    const wobble = random() * Math.PI * 2;
    orbits.push({ radius, phase, height, scale, speed, wobble });
    debris.setColorAt(
      index,
      deepGold.clone().lerp(whiteGold, index % 2 === 0 ? 0.72 : 0.35)
    );
  }
  if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
  debris.userData.orbits = orbits;
  debris.userData.radii = orbits.map((orbit) => orbit.radius);
  debris.count = 0;
  return debris;
}

const debrisMatrix = new THREE.Matrix4();
const debrisPosition = new THREE.Vector3();
const debrisQuaternion = new THREE.Quaternion();
const debrisScale = new THREE.Vector3();
const debrisEuler = new THREE.Euler();
const blackHoleWorldPosition = new THREE.Vector3();
const cameraWorldPosition = new THREE.Vector3();

function updateDebrisMatrices(debris, timeSeconds) {
  const orbits = debris.userData.orbits ?? [];
  for (let index = 0; index < debris.count; index += 1) {
    const orbit = orbits[index];
    const angle = orbit.phase + timeSeconds * orbit.speed;
    debrisPosition.set(
      Math.cos(angle) * orbit.radius,
      orbit.height + Math.sin(angle * 2.0 + orbit.wobble) * 0.12,
      Math.sin(angle) * orbit.radius
    );
    debrisEuler.set(
      orbit.wobble + angle * 0.31,
      -angle,
      orbit.phase + angle * 0.17
    );
    debrisQuaternion.setFromEuler(debrisEuler);
    debrisScale.set(
      orbit.scale * 0.56,
      orbit.scale * 1.48,
      orbit.scale * 0.38
    );
    debrisMatrix.compose(debrisPosition, debrisQuaternion, debrisScale);
    debris.setMatrixAt(index, debrisMatrix);
  }
  debris.instanceMatrix.needsUpdate = true;
}

function applyQualityVisibility(
  blackHole,
  quality,
  { active, reveal, prewarm = false } = {}
) {
  const resources = blackHole.userData.resources;
  const preset = getObservatoryBlackHoleQualityPreset(quality);
  resources.horizon.visible = active;
  resources.moon.visible = active;
  resources.photonRings.forEach((ring, index) => {
    ring.visible = active && index < preset.photonShells;
  });
  resources.diskLayers.forEach((layer, index) => {
    const layerActive = active && index < preset.diskLayers;
    layer.glow.visible = layerActive;
    layer.occluder.visible = layerActive
      && (prewarm || reveal >= OCCLUSION_REVEAL_THRESHOLD);
  });
  resources.debris.count = preset.debrisCount;
  resources.debris.visible = active && preset.debrisCount > 0;
  return preset;
}

function setRevealUniforms(blackHole, reveal, timeSeconds) {
  const resources = blackHole.userData.resources;
  resources.horizon.material.uniforms.uReveal.value = reveal;
  resources.moon.material.uniforms.uReveal.value = reveal;
  for (const ring of resources.photonRings) {
    ring.material.uniforms.uReveal.value = reveal;
    ring.material.uniforms.uTime.value = timeSeconds;
  }
  for (const layer of resources.diskLayers) {
    layer.material.uniforms.uReveal.value = reveal;
    layer.material.uniforms.uTime.value = timeSeconds;
  }
  resources.debris.material.opacity = reveal * 0.28;
}

export function createObservatoryBlackHole({
  anchor = OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR,
  tilt = OBSERVATORY_BLACK_HOLE_DEFAULT_TILT,
  scale = 1,
  quality = OBSERVATORY_BLACK_HOLE_DEFAULT_QUALITY,
  visible = false
} = {}) {
  const blackHole = new THREE.Group();
  blackHole.name = OBSERVATORY_BLACK_HOLE_NAME;
  copyVector3(blackHole.position, anchor, OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR);
  blackHole.scale.setScalar(THREE.MathUtils.clamp(finite(scale, 1), 0.1, 5));

  const content = new THREE.Group();
  content.name = "mushroom-observatory-black-hole-content";
  const horizon = createHorizon();
  const photonRings = [createPhotonRing(0), createPhotonRing(1)];
  const moon = createScaleMoon();
  const diskRoot = new THREE.Group();
  diskRoot.name = OBSERVATORY_BLACK_HOLE_DISK_ROOT_NAME;
  copyVector3(diskRoot.rotation, tilt, OBSERVATORY_BLACK_HOLE_DEFAULT_TILT);

  const diskLayers = DISK_LAYER_DEFINITIONS.map(createDiskLayer);
  for (const layer of diskLayers) diskRoot.add(layer.occluder, layer.glow);
  const debris = createDebris();
  diskRoot.add(debris);
  content.add(horizon, moon, ...photonRings, diskRoot);
  blackHole.add(content);

  const safeQuality = normalizeObservatoryBlackHoleQuality(quality);
  blackHole.userData.resources = {
    content,
    horizon,
    moon,
    photonRings,
    diskRoot,
    diskLayers,
    debris
  };
  blackHole.userData.anchor = blackHole.position.clone();
  blackHole.userData.requestedVisible = Boolean(visible);
  blackHole.userData.reveal = 0;
  blackHole.userData.timeSeconds = 0;
  blackHole.userData.quality = safeQuality;
  blackHole.userData.cameraDistance = Infinity;
  blackHole.userData.angularRadius = 0;
  blackHole.userData.disposed = false;
  blackHole.userData.prewarming = false;
  blackHole.visible = false;

  applyQualityVisibility(blackHole, safeQuality, {
    active: false,
    reveal: 0
  });
  setRevealUniforms(blackHole, 0, 0);
  updateDebrisMatrices(debris, 0);
  return blackHole;
}

export function setObservatoryBlackHoleVisible(blackHole, visible) {
  if (!blackHole || blackHole.userData.disposed) return false;
  blackHole.userData.requestedVisible = Boolean(visible);
  if (!blackHole.userData.requestedVisible) blackHole.visible = false;
  return true;
}

export function updateObservatoryBlackHole(
  blackHole,
  camera,
  timeSeconds,
  reveal,
  quality = OBSERVATORY_BLACK_HOLE_DEFAULT_QUALITY
) {
  if (!blackHole || blackHole.userData.disposed) return false;
  const safeTime = Number.isFinite(timeSeconds)
    ? Math.max(0, timeSeconds)
    : blackHole.userData.timeSeconds;
  const safeReveal = THREE.MathUtils.clamp(finite(reveal, 0), 0, 1);
  const safeQuality = normalizeObservatoryBlackHoleQuality(quality);
  const active = blackHole.userData.requestedVisible
    && safeReveal > REVEAL_EPSILON;

  blackHole.userData.timeSeconds = safeTime;
  blackHole.userData.reveal = safeReveal;
  blackHole.userData.quality = safeQuality;
  blackHole.visible = active;

  const preset = applyQualityVisibility(blackHole, safeQuality, {
    active,
    reveal: safeReveal
  });
  setRevealUniforms(blackHole, safeReveal, safeTime);

  const revealEase = THREE.MathUtils.smoothstep(safeReveal, 0, 1);
  blackHole.userData.resources.content.scale.setScalar(0.84 + revealEase * 0.16);
  // Keep the lights-on/hidden path CPU-quiet. The first active frame rebuilds
  // every orbit from absolute time, so pausing this work cannot create drift.
  if (active) {
    updateDebrisMatrices(blackHole.userData.resources.debris, safeTime);
  }

  if (camera?.isCamera) {
    blackHole.getWorldPosition(blackHoleWorldPosition);
    camera.getWorldPosition(cameraWorldPosition);
    const distance = Math.max(
      blackHoleWorldPosition.distanceTo(cameraWorldPosition),
      0.001
    );
    blackHole.userData.cameraDistance = distance;
    blackHole.userData.angularRadius = Math.atan(
      DISK_OUTER_RADIUS * blackHole.scale.x / distance
    );
  } else {
    blackHole.userData.cameraDistance = Infinity;
    blackHole.userData.angularRadius = 0;
  }
  blackHole.userData.activePreset = preset;
  return active;
}

/**
 * Temporarily exposes the requested tier so a renderer can compile it against
 * the real target framebuffer. Call the returned restore function after the
 * compile/upload draw; production visibility and reveal are restored exactly.
 */
export function prewarmObservatoryBlackHole(
  blackHole,
  quality = "high"
) {
  if (!blackHole || blackHole.userData.disposed) return false;
  const resources = blackHole.userData.resources;
  const objectStates = [];
  blackHole.traverse((object) => {
    objectStates.push({ object, visible: object.visible });
  });
  const revealStates = [];
  blackHole.traverse((object) => {
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material ? [object.material] : [];
    for (const material of materials) {
      if (material.uniforms?.uReveal) {
        revealStates.push({
          uniform: material.uniforms.uReveal,
          value: material.uniforms.uReveal.value
        });
        material.uniforms.uReveal.value = PREWARM_REVEAL;
      }
    }
  });
  const debrisCount = resources.debris.count;
  const debrisOpacity = resources.debris.material.opacity;
  const contentScale = resources.content.scale.clone();
  blackHole.userData.prewarming = true;
  blackHole.visible = true;
  resources.content.visible = true;
  resources.content.scale.setScalar(1);
  applyQualityVisibility(blackHole, quality, {
    active: true,
    reveal: PREWARM_REVEAL,
    prewarm: true
  });
  resources.debris.material.opacity = PREWARM_REVEAL;
  updateDebrisMatrices(resources.debris, blackHole.userData.timeSeconds);

  let restored = false;
  return function restoreObservatoryBlackHoleAfterPrewarm() {
    if (restored || blackHole.userData.disposed) return false;
    restored = true;
    for (const state of objectStates) state.object.visible = state.visible;
    for (const state of revealStates) state.uniform.value = state.value;
    resources.debris.count = debrisCount;
    resources.debris.material.opacity = debrisOpacity;
    resources.content.scale.copy(contentScale);
    blackHole.userData.prewarming = false;
    return true;
  };
}

export function disposeObservatoryBlackHole(blackHole) {
  if (!blackHole || blackHole.userData.disposed) return false;
  blackHole.userData.disposed = true;
  blackHole.userData.prewarming = false;
  blackHole.visible = false;

  const geometries = new Set();
  const materials = new Set();
  blackHole.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (Array.isArray(object.material)) {
      for (const material of object.material) {
        if (material) materials.add(material);
      }
    } else if (object.material) {
      materials.add(object.material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  blackHole.clear();
  return true;
}
