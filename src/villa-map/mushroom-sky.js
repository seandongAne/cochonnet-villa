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
// backdrop. Crisp GPU stars sit above it; keeping the photo below unity avoids
// the luminous-screen cue that made the old physical dome feel nearby.
export const MUSHROOM_SKY_IMAGE_BRIGHTNESS = 0.46;

// A complete revolution takes many hours. The motion should be felt as a
// living sky over time, never read as a rotating photograph.
export const MUSHROOM_SKY_BACKDROP_DRIFT = 0.00012;
export const MUSHROOM_SKY_STAR_DRIFT = -0.00028;

// Most points breathe very gently while the larger stars get a deeper,
// quicker pulse. The speed values are radians per second, so this range gives
// the noticeable stars a roughly 2-5 second cycle without making the whole
// ceiling flash in sync.
export const MUSHROOM_SKY_TWINKLE_SPEED_MIN = 1.15;
export const MUSHROOM_SKY_TWINKLE_SPEED_MAX = 2.9;

const SKY_STENCIL_REF = 7;
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

  void main() {
    vec3 ray = normalize(vSkyDirection);
    vec3 referenceAxis = abs(ray.y) > 0.94
      ? vec3(1.0, 0.0, 0.0)
      : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(referenceAxis, ray));
    vec3 bitangent = normalize(cross(ray, tangent));

    // Remove pin-point detail from the photograph without spreading every
    // source star into a visible blur kernel. Only a locally bright centre is
    // pulled toward its four-direction surround; broad Milky Way clouds stay.
    float spread = 0.0035;
    vec3 centre = readSky(ray);
    vec3 surround = (
      readSky(normalize(ray + tangent * spread))
      + readSky(normalize(ray - tangent * spread))
      + readSky(normalize(ray + bitangent * spread))
      + readSky(normalize(ray - bitangent * spread))
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

    gl_FragColor = vec4(sky, 1.0);
    #include <colorspace_fragment>
  }
`;

const STAR_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;

  attribute float aPhase;
  attribute float aTwinkleSpeed;
  attribute float aTwinkleStrength;
  attribute float aSize;
  attribute vec3 aColor;

  varying float vBrightness;
  varying float vTwinkleStrength;
  varying vec3 vColor;

  void main() {
    float wave = sin(uTime * aTwinkleSpeed + aPhase);
    float secondWave = sin(uTime * (aTwinkleSpeed * 0.61) + aPhase * 1.73);
    float shimmer = 0.5 + 0.5 * (wave * 0.72 + secondWave * 0.28);
    // A narrow crest gives a few prominent points a recognisable sparkle,
    // while the slower shimmer keeps the transition organic between peaks.
    float sparkle = pow(max(0.0, 0.5 + 0.5 * wave), 10.0);
    float fullTwinkle = 0.28 + 0.58 * shimmer + 0.52 * sparkle;
    vBrightness = mix(0.84, fullTwinkle, aTwinkleStrength);
    vTwinkleStrength = aTwinkleStrength;
    vColor = aColor;

    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    // Screen-space sizes avoid the "near particles" cue caused by perspective
    // attenuation. These are celestial points, not dust floating in the room.
    float sizePulse = mix(
      1.0,
      0.78 + 0.30 * shimmer + 0.28 * sparkle,
      aTwinkleStrength
    );
    gl_PointSize = aSize * uPixelRatio * sizePulse;
  }
`;

const STAR_FRAGMENT_SHADER = /* glsl */ `
  uniform float uReveal;

  varying float vBrightness;
  varying float vTwinkleStrength;
  varying vec3 vColor;

  void main() {
    float distanceFromCentre = length(gl_PointCoord - vec2(0.5));
    float core = 1.0 - smoothstep(0.05, 0.48, distanceFromCentre);
    float halo = 1.0 - smoothstep(0.18, 0.5, distanceFromCentre);
    vec2 fromCentre = abs(gl_PointCoord - vec2(0.5));
    float verticalRay = (1.0 - smoothstep(0.035, 0.11, fromCentre.x))
      * (1.0 - smoothstep(0.18, 0.5, fromCentre.y));
    float horizontalRay = (1.0 - smoothstep(0.035, 0.11, fromCentre.y))
      * (1.0 - smoothstep(0.18, 0.5, fromCentre.x));
    float heroStar = smoothstep(0.72, 0.96, vTwinkleStrength);
    float brightCrest = smoothstep(0.88, 1.18, vBrightness);
    float flare = (verticalRay + horizontalRay) * heroStar * brightCrest;
    float alpha = (core * 0.90 + halo * 0.28 + flare * 0.74)
      * vBrightness * uReveal;
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(
      vColor * (1.05 + vBrightness * 0.40 + flare * 0.55),
      alpha
    );
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

// Mirrors the vertex-shader curve so node tests can verify that elapsed real
// time produces a perceptible (not merely non-zero) change in star output.
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
  const shimmer = 0.5 + 0.5 * (wave * 0.72 + secondWave * 0.28);
  const sparkle = Math.max(0, 0.5 + 0.5 * wave) ** 10;
  const fullTwinkle = 0.28 + 0.58 * shimmer + 0.52 * sparkle;
  return THREE.MathUtils.lerp(0.84, fullTwinkle, safeStrength);
}

function configureSkyStencil(material) {
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
    sizes[index] = 1.4 + Math.pow(prominence, 2.6) * 4.2;
    // Tiny background points stay calm; the sparse larger stars visibly
    // breathe. Correlating strength with size avoids a noisy TV-static look.
    strengths[index] = 0.28 + Math.pow(prominence, 1.1) * 0.72;

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
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
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
      uReveal: { value: 0 }
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
    new THREE.SphereGeometry(radius, 72, 28, 0, Math.PI * 2, 0, Math.PI / 2),
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
      uReveal: { value: 0 }
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
  sky.userData.disposed = false;
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

  if (!reducedMotion) {
    sky.userData.elapsed += Math.min(Math.max(delta || 0, 0), 0.1);
  }

  const elapsed = sky.userData.elapsed;
  const backdrop = sky.userData.backdrop;
  const stars = sky.userData.stars;
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
  backdrop.rotation.y = SKY_START_ROTATION + elapsed * MUSHROOM_SKY_BACKDROP_DRIFT;
  stars.rotation.y = STAR_START_ROTATION + elapsed * MUSHROOM_SKY_STAR_DRIFT;
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
