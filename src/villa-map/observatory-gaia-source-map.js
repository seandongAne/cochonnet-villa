import * as THREE from "three";

// Static Gaia radiance atlas for relativistic source-space sampling.
//
// Kerr/Schwarzschild passes need to bend every celestial layer with the same
// source direction. Rendering the existing Gaia geometry once into this
// upper-hemisphere equirectangular target lets the lens shader sample the
// measured stars alongside the photographic panorama, without re-projecting
// an independent Points layer after lensing. The source geometry remains
// shared with gaia-stars.js and is deliberately never disposed here.

export const OBSERVATORY_GAIA_SOURCE_MAP_NAME =
  "mushroom-observatory-gaia-source-map";
export const OBSERVATORY_GAIA_SOURCE_MAP_SCENE_NAME =
  "mushroom-observatory-gaia-source-map-scene";
export const OBSERVATORY_GAIA_SOURCE_MAP_CAMERA_NAME =
  "mushroom-observatory-gaia-source-map-camera";
export const OBSERVATORY_GAIA_SOURCE_MAP_POINTS_NAME =
  "mushroom-observatory-gaia-source-map-points";
export const OBSERVATORY_HERO_SOURCE_MAP_POINTS_NAME =
  "mushroom-observatory-hero-source-map-points";
export const OBSERVATORY_GAIA_SOURCE_MAP_MATERIAL_NAME =
  "mushroom-observatory-gaia-source-map-material";
export const OBSERVATORY_HERO_SOURCE_MAP_MATERIAL_NAME =
  "mushroom-observatory-hero-source-map-material";
export const OBSERVATORY_GAIA_SOURCE_MAP_TEXTURE_NAME =
  "mushroom-observatory-gaia-source-map-texture";
export const OBSERVATORY_GAIA_SOURCE_MAP_DEFAULT_QUALITY = "medium";

export const OBSERVATORY_GAIA_SOURCE_MAP_QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({
    id: "high",
    width: 4096,
    height: 1024
  }),
  medium: Object.freeze({
    id: "medium",
    width: 2048,
    height: 512
  })
});

const REQUIRED_GEOMETRY_ATTRIBUTES = Object.freeze([
  "position",
  "aMagnitude",
  "aIntensity",
  "aStarColor"
]);
const REQUIRED_HERO_GEOMETRY_ATTRIBUTES = Object.freeze([
  "position",
  "aPhase",
  "aTwinkleSpeed",
  "aTwinkleStrength",
  "aSize",
  "aRadiance",
  "aColor"
]);

const GAIA_SOURCE_MAP_VERTEX_SHADER = /* glsl */ `
  uniform float uPointSupportPx;
  uniform float uMagnitudeLimit;
  uniform float uMagnitudeFeather;

  attribute float aMagnitude;
  attribute float aIntensity;
  attribute vec3 aStarColor;

  varying float vHemisphereVisible;
  varying float vIntensity;
  varying float vMagnitudeVisibility;
  varying float vPointSupportPx;
  varying vec3 vStarColor;

  const float PI = 3.141592653589793;

  void main() {
    vec3 sourceDirection = normalize(position);
    vHemisphereVisible = step(0.0, sourceDirection.y);
    vIntensity = max(aIntensity, 0.0);
    vMagnitudeVisibility = 1.0 - smoothstep(
      uMagnitudeLimit,
      uMagnitudeLimit + uMagnitudeFeather,
      aMagnitude
    );
    vPointSupportPx = uPointSupportPx;
    vStarColor = aStarColor;

    // This is exactly the unrotated world/ICRS convention used by the native
    // sky. The photo applies its own rotation at sample time; Gaia must not.
    float u = fract(atan(sourceDirection.z, -sourceDirection.x) / (2.0 * PI));
    float v = asin(clamp(sourceDirection.y, -1.0, 1.0)) / (0.5 * PI);
    vec2 clipPosition = vec2(u, clamp(v, 0.0, 1.0)) * 2.0 - 1.0;

    // Keep the catalogue's lower hemisphere out of the 4:1 upper-dome map.
    // The fragment-side discard below is authoritative; moving the centre
    // off-screen additionally avoids raster work for almost half the source.
    if (sourceDirection.y < 0.0) clipPosition = vec2(2.0);
    gl_Position = vec4(clipPosition, 0.0, 1.0);
    gl_PointSize = uPointSupportPx;
  }
`;

const GAIA_SOURCE_MAP_FRAGMENT_SHADER = /* glsl */ `
  uniform float uRadianceScale;

  varying float vHemisphereVisible;
  varying float vIntensity;
  varying float vMagnitudeVisibility;
  varying float vPointSupportPx;
  varying vec3 vStarColor;

  void main() {
    if (vHemisphereVisible < 0.5) discard;

    vec2 pixelPosition = (gl_PointCoord - vec2(0.5))
      * max(vPointSupportPx, 1.0);
    float pixelRadius = length(pixelPosition);

    // The useful centre stays around one atlas pixel. There is intentionally
    // no broad secondary Gaussian: a wide low-energy halo was the source of
    // the previous stylised "light bulb" appearance.
    const float STAR_SIGMA_PX = 0.36;
    float stellarCore = exp(
      -0.5 * pow(pixelRadius / STAR_SIGMA_PX, 2.0)
    );

    // Only the very brightest catalogue measurements can cross this gate.
    // The spikes are narrow, short, and carry very little energy.
    float diffractionGate = smoothstep(3.65, 4.15, vIntensity);
    float verticalSpike = exp(-0.5 * pow(pixelPosition.x / 0.11, 2.0))
      * exp(-0.5 * pow(pixelPosition.y / 1.15, 2.0));
    float horizontalSpike = exp(-0.5 * pow(pixelPosition.y / 0.11, 2.0))
      * exp(-0.5 * pow(pixelPosition.x / 1.15, 2.0));
    float diffractionSpike = (verticalSpike + horizontalSpike)
      * diffractionGate * 0.012;

    float coverage = clamp(stellarCore + diffractionSpike, 0.0, 1.0)
      * vMagnitudeVisibility;
    if (coverage < 1.0 / 2048.0) discard;

    // The target is RGBA8, so compress the catalogue's sparse high-intensity
    // tail while preserving a crisp white-hot centre and restrained BP-RP
    // colour. Additive blending applies coverage exactly once.
    float prominence = smoothstep(0.45, 3.6, vIntensity);
    float sourceEnergy = 1.0 - exp(-vIntensity * 1.35);
    vec3 stellarColour = mix(
      vec3(1.0),
      vStarColor,
      mix(0.10, 0.34, prominence)
    );
    gl_FragColor = vec4(
      stellarColour * sourceEnergy * uRadianceScale,
      coverage
    );
  }
`;

const HERO_SOURCE_MAP_VERTEX_SHADER = /* glsl */ `
  uniform mat3 uDirectionTransform;
  uniform float uTime;
  uniform float uPointSupportPx;

  attribute float aPhase;
  attribute float aTwinkleSpeed;
  attribute float aTwinkleStrength;
  attribute float aSize;
  attribute float aRadiance;
  attribute vec3 aColor;

  varying float vHemisphereVisible;
  varying float vPsfScale;
  varying float vRadiance;
  varying float vPointSupportPx;
  varying vec3 vStarColor;

  const float PI = 3.141592653589793;

  void main() {
    // Unlike Gaia, the procedural hero field owns a very slow object-space
    // celestial drift. Snapshot that real transform when the atlas is baked;
    // never confuse it with the photographic panorama's independent rotation.
    vec3 sourceDirection = normalize(uDirectionTransform * position);
    vHemisphereVisible = step(0.0, sourceDirection.y);
    float wave = sin(uTime * aTwinkleSpeed + aPhase);
    float secondWave = sin(
      uTime * (aTwinkleSpeed * 0.61) + aPhase * 1.73
    );
    float scintillation = 1.0 + aTwinkleStrength * (
      wave * 0.72 + secondWave * 0.28
    );
    vPsfScale = clamp(aSize, 0.0, 1.0);
    vRadiance = max(aRadiance * scintillation, 0.0);
    vPointSupportPx = uPointSupportPx;
    vStarColor = aColor;

    float u = fract(atan(sourceDirection.z, -sourceDirection.x) / (2.0 * PI));
    float v = asin(clamp(sourceDirection.y, -1.0, 1.0)) / (0.5 * PI);
    vec2 clipPosition = vec2(u, clamp(v, 0.0, 1.0)) * 2.0 - 1.0;
    if (sourceDirection.y < 0.0) clipPosition = vec2(2.0);
    gl_Position = vec4(clipPosition, 0.0, 1.0);
    gl_PointSize = uPointSupportPx;
  }
`;

const HERO_SOURCE_MAP_FRAGMENT_SHADER = /* glsl */ `
  uniform float uRadianceScale;

  varying float vHemisphereVisible;
  varying float vPsfScale;
  varying float vRadiance;
  varying float vPointSupportPx;
  varying vec3 vStarColor;

  void main() {
    if (vHemisphereVisible < 0.5) discard;

    vec2 pixelPosition = (gl_PointCoord - vec2(0.5))
      * max(vPointSupportPx, 1.0);
    float pixelRadius = length(pixelPosition);

    // Match the Gaia atlas's unresolved, sharp-core photographic response.
    // aSize may vary the sub-pixel core only slightly; it cannot grow a halo.
    float sigmaPx = mix(0.34, 0.40, vPsfScale);
    float coreNormalization = pow(0.37 / sigmaPx, 2.0);
    float stellarCore = exp(
      -0.5 * pow(pixelRadius / sigmaPx, 2.0)
    ) * coreNormalization;

    // The seeded radiance tail admits only a handful of restrained spikes.
    float diffractionGate = smoothstep(4.85, 5.65, vRadiance);
    float verticalSpike = exp(-0.5 * pow(pixelPosition.x / 0.11, 2.0))
      * exp(-0.5 * pow(pixelPosition.y / 1.25, 2.0));
    float horizontalSpike = exp(-0.5 * pow(pixelPosition.y / 0.11, 2.0))
      * exp(-0.5 * pow(pixelPosition.x / 1.25, 2.0));
    float diffractionSpike = (verticalSpike + horizontalSpike)
      * diffractionGate * 0.016;

    float coverage = clamp(stellarCore + diffractionSpike, 0.0, 1.0);
    if (coverage < 1.0 / 2048.0) discard;

    float prominence = smoothstep(0.55, 4.8, vRadiance);
    float sourceEnergy = 1.0 - exp(-vRadiance * 1.22);
    vec3 stellarColour = mix(
      vec3(1.0),
      vStarColor,
      mix(0.10, 0.36, prominence)
    );
    gl_FragColor = vec4(
      stellarColour * sourceEnergy * uRadianceScale,
      coverage
    );
  }
`;

const heroQuaternionScratch = new THREE.Quaternion();
const heroRotationMatrixScratch = new THREE.Matrix4();

function geometryFrom(source) {
  if (source?.isBufferGeometry) return source;
  if (source?.geometry?.isBufferGeometry) return source.geometry;
  return null;
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function magnitudeLimitFrom(source, geometry) {
  const sourceMaximum = source?.userData?.maximumMagnitude;
  if (Number.isFinite(sourceMaximum)) return sourceMaximum + 0.35;

  const magnitudes = geometry.getAttribute("aMagnitude");
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < magnitudes.count; index += 1) {
    const magnitude = magnitudes.getX(index);
    if (Number.isFinite(magnitude)) maximum = Math.max(maximum, magnitude);
  }
  return Number.isFinite(maximum) ? maximum + 0.35 : 30;
}

function validateGeometry(geometry) {
  if (!geometry?.isBufferGeometry) {
    throw new TypeError(
      "Gaia source map requires a THREE.Points or BufferGeometry source"
    );
  }
  for (const attributeName of REQUIRED_GEOMETRY_ATTRIBUTES) {
    if (!geometry.getAttribute(attributeName)) {
      throw new TypeError(
        `Gaia source geometry is missing ${attributeName}`
      );
    }
  }
  return geometry;
}

function validateHeroGeometry(geometry) {
  if (!geometry?.isBufferGeometry) {
    throw new TypeError(
      "Hero source map requires a THREE.Points or BufferGeometry source"
    );
  }
  for (const attributeName of REQUIRED_HERO_GEOMETRY_ATTRIBUTES) {
    if (!geometry.getAttribute(attributeName)) {
      throw new TypeError(
        `Hero source geometry is missing ${attributeName}`
      );
    }
  }
  return geometry;
}

export function getObservatoryGaiaSourceMapQuality(quality) {
  const key = typeof quality === "string" ? quality.toLowerCase() : "";
  return OBSERVATORY_GAIA_SOURCE_MAP_QUALITY_PRESETS[key]
    ?? OBSERVATORY_GAIA_SOURCE_MAP_QUALITY_PRESETS[
      OBSERVATORY_GAIA_SOURCE_MAP_DEFAULT_QUALITY
    ];
}

export function createObservatoryGaiaSourceMapRenderTarget({
  quality = OBSERVATORY_GAIA_SOURCE_MAP_DEFAULT_QUALITY
} = {}) {
  const preset = getObservatoryGaiaSourceMapQuality(quality);
  const renderTarget = new THREE.WebGLRenderTarget(
    preset.width,
    preset.height,
    {
      depthBuffer: false,
      stencilBuffer: false,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      samples: 0
    }
  );
  renderTarget.texture.name = OBSERVATORY_GAIA_SOURCE_MAP_TEXTURE_NAME;
  renderTarget.texture.colorSpace = THREE.NoColorSpace;
  renderTarget.texture.wrapS = THREE.RepeatWrapping;
  renderTarget.texture.wrapT = THREE.ClampToEdgeWrapping;
  renderTarget.texture.generateMipmaps = true;
  renderTarget.userData = {
    ...(renderTarget.userData ?? {}),
    observatoryQuality: preset.id,
    observatoryDisposed: false
  };
  return renderTarget;
}

export function createObservatoryGaiaSourceMapMaterial({
  magnitudeLimit = 30,
  magnitudeFeather = 0.42,
  pointSupportPx = 7,
  radianceScale = 1
} = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPointSupportPx: {
        value: THREE.MathUtils.clamp(
          finitePositive(pointSupportPx, 7),
          5,
          9
        )
      },
      uMagnitudeLimit: {
        value: Number.isFinite(magnitudeLimit) ? magnitudeLimit : 30
      },
      uMagnitudeFeather: {
        value: THREE.MathUtils.clamp(
          finitePositive(magnitudeFeather, 0.42),
          0.05,
          2
        )
      },
      uRadianceScale: {
        value: THREE.MathUtils.clamp(
          finitePositive(radianceScale, 1),
          0.05,
          4
        )
      }
    },
    vertexShader: GAIA_SOURCE_MAP_VERTEX_SHADER,
    fragmentShader: GAIA_SOURCE_MAP_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false
  });
  material.name = OBSERVATORY_GAIA_SOURCE_MAP_MATERIAL_NAME;
  return material;
}

export function createObservatoryHeroSourceMapMaterial({
  time = 0,
  pointSupportPx = 7,
  radianceScale = 1
} = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDirectionTransform: { value: new THREE.Matrix3() },
      uTime: { value: Number.isFinite(time) ? time : 0 },
      uPointSupportPx: {
        value: THREE.MathUtils.clamp(
          finitePositive(pointSupportPx, 7),
          5,
          9
        )
      },
      uRadianceScale: {
        value: THREE.MathUtils.clamp(
          finitePositive(radianceScale, 1),
          0.05,
          4
        )
      }
    },
    vertexShader: HERO_SOURCE_MAP_VERTEX_SHADER,
    fragmentShader: HERO_SOURCE_MAP_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false
  });
  material.name = OBSERVATORY_HERO_SOURCE_MAP_MATERIAL_NAME;
  return material;
}

function syncHeroSourceMapLayer(sourceMap) {
  const source = sourceMap?.userData?.heroSource;
  const material = sourceMap?.heroMaterial;
  if (!material) return;

  if (source?.isObject3D) {
    source.updateWorldMatrix(true, false);
    source.getWorldQuaternion(heroQuaternionScratch);
    heroRotationMatrixScratch.makeRotationFromQuaternion(heroQuaternionScratch);
    material.uniforms.uDirectionTransform.value.setFromMatrix4(
      heroRotationMatrixScratch
    );
    const liveTime = source.material?.uniforms?.uTime?.value;
    if (
      sourceMap.userData.heroTimeOverride === null
      && Number.isFinite(liveTime)
    ) {
      material.uniforms.uTime.value = liveTime;
    }
  } else {
    material.uniforms.uDirectionTransform.value.identity();
  }
}

function attachHeroSourceMapLayer(
  sourceMap,
  source,
  {
    time,
    pointSupportPx,
    radianceScale
  } = {}
) {
  const geometry = validateHeroGeometry(geometryFrom(source));
  const liveTime = source?.material?.uniforms?.uTime?.value;
  const timeOverride = Number.isFinite(time) ? time : null;
  const material = createObservatoryHeroSourceMapMaterial({
    time: timeOverride ?? (Number.isFinite(liveTime) ? liveTime : 0),
    pointSupportPx,
    radianceScale
  });
  const points = new THREE.Points(geometry, material);
  points.name = OBSERVATORY_HERO_SOURCE_MAP_POINTS_NAME;
  points.frustumCulled = false;
  points.renderOrder = 1;
  points.userData.observatorySharedGeometry = true;
  sourceMap.scene.add(points);
  sourceMap.heroPoints = points;
  sourceMap.heroMaterial = material;
  sourceMap.userData.heroSource = source;
  sourceMap.userData.heroSharedGeometry = geometry;
  sourceMap.userData.heroSourceCount = geometry.getAttribute("position").count;
  sourceMap.userData.heroTimeOverride = timeOverride;
  syncHeroSourceMapLayer(sourceMap);
}

export function createObservatoryGaiaSourceMap(
  source,
  {
    quality = OBSERVATORY_GAIA_SOURCE_MAP_DEFAULT_QUALITY,
    heroStars = null,
    heroTime,
    heroPointSupportPx,
    heroRadianceScale,
    magnitudeLimit,
    magnitudeFeather,
    pointSupportPx,
    radianceScale
  } = {}
) {
  const geometry = validateGeometry(geometryFrom(source));
  const preset = getObservatoryGaiaSourceMapQuality(quality);
  const scene = new THREE.Scene();
  scene.name = OBSERVATORY_GAIA_SOURCE_MAP_SCENE_NAME;

  // The shader writes clip-space equirectangular coordinates directly, but a
  // real orthographic camera keeps this pass explicit and renderer-friendly.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  camera.name = OBSERVATORY_GAIA_SOURCE_MAP_CAMERA_NAME;
  camera.position.z = 1;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const material = createObservatoryGaiaSourceMapMaterial({
    magnitudeLimit: Number.isFinite(magnitudeLimit)
      ? magnitudeLimit
      : magnitudeLimitFrom(source, geometry),
    magnitudeFeather,
    pointSupportPx,
    radianceScale
  });
  const points = new THREE.Points(geometry, material);
  points.name = OBSERVATORY_GAIA_SOURCE_MAP_POINTS_NAME;
  points.frustumCulled = false;
  points.userData.observatorySharedGeometry = true;
  scene.add(points);

  const renderTarget = createObservatoryGaiaSourceMapRenderTarget({
    quality: preset.id
  });
  const sourceMap = {
    name: OBSERVATORY_GAIA_SOURCE_MAP_NAME,
    scene,
    camera,
    points,
    material,
    heroPoints: null,
    heroMaterial: null,
    renderTarget,
    texture: renderTarget.texture,
    quality: preset.id,
    width: preset.width,
    height: preset.height,
    ownsGeometry: false,
    dirty: true,
    rendered: false,
    prewarmed: false,
    renderCount: 0,
    disposed: false,
    userData: {
      sharedGeometry: geometry,
      sourceCount: geometry.getAttribute("position").count,
      heroSource: null,
      heroSharedGeometry: null,
      heroSourceCount: 0,
      heroTimeOverride: null
    }
  };
  if (heroStars) {
    attachHeroSourceMapLayer(sourceMap, heroStars, {
      time: heroTime,
      pointSupportPx: heroPointSupportPx,
      radianceScale: heroRadianceScale
    });
  }
  return sourceMap;
}

export function setObservatoryGaiaSourceMapGeometry(sourceMap, source) {
  if (!sourceMap || sourceMap.disposed) return false;
  const geometry = validateGeometry(geometryFrom(source));
  if (sourceMap.points.geometry === geometry) return false;
  sourceMap.points.geometry = geometry;
  sourceMap.userData.sharedGeometry = geometry;
  sourceMap.userData.sourceCount = geometry.getAttribute("position").count;
  sourceMap.material.uniforms.uMagnitudeLimit.value = magnitudeLimitFrom(
    source,
    geometry
  );
  sourceMap.dirty = true;
  sourceMap.rendered = false;
  return true;
}

export function setObservatoryGaiaSourceMapHeroStars(
  sourceMap,
  source,
  options = {}
) {
  if (!sourceMap || sourceMap.disposed) return false;
  if (sourceMap.heroPoints) {
    sourceMap.heroPoints.removeFromParent();
    sourceMap.heroMaterial.dispose();
    sourceMap.heroPoints = null;
    sourceMap.heroMaterial = null;
    sourceMap.userData.heroSource = null;
    sourceMap.userData.heroSharedGeometry = null;
    sourceMap.userData.heroSourceCount = 0;
    sourceMap.userData.heroTimeOverride = null;
  }
  if (source) attachHeroSourceMapLayer(sourceMap, source, options);
  sourceMap.dirty = true;
  sourceMap.rendered = false;
  return true;
}

export function resizeObservatoryGaiaSourceMap(
  sourceMap,
  { quality = sourceMap?.quality } = {}
) {
  if (!sourceMap || sourceMap.disposed) return null;
  const preset = getObservatoryGaiaSourceMapQuality(quality);
  const changed = sourceMap.renderTarget.width !== preset.width
    || sourceMap.renderTarget.height !== preset.height;
  if (changed) {
    sourceMap.renderTarget.setSize(preset.width, preset.height);
    sourceMap.dirty = true;
    sourceMap.rendered = false;
  }
  sourceMap.quality = preset.id;
  sourceMap.width = preset.width;
  sourceMap.height = preset.height;
  sourceMap.renderTarget.userData.observatoryQuality = preset.id;
  return Object.freeze({
    quality: preset.id,
    width: preset.width,
    height: preset.height,
    changed
  });
}

/**
 * Populate the static atlas at most once per geometry/quality revision.
 *
 * Renderer state is restored even when compilation or rendering fails. The
 * full target draw is also the prewarm: unlike a dynamic pass, this texture is
 * the final reusable result and should not be redrawn every frame.
 */
export function renderObservatoryGaiaSourceMap(
  sourceMap,
  renderer,
  { force = false, prewarm = false } = {}
) {
  if (
    !sourceMap
    || sourceMap.disposed
    || !renderer?.isWebGLRenderer && typeof renderer?.render !== "function"
  ) {
    return false;
  }
  if (!sourceMap.dirty && !force) {
    if (prewarm && sourceMap.rendered) sourceMap.prewarmed = true;
    return false;
  }

  const previousTarget = renderer.getRenderTarget?.() ?? null;
  const previousAutoClear = renderer.autoClear;
  const previousXrEnabled = renderer.xr?.enabled;
  const previousClearAlpha = renderer.getClearAlpha?.();
  const previousClearColor = renderer.getClearColor
    ? renderer.getClearColor(new THREE.Color())
    : null;

  try {
    syncHeroSourceMapLayer(sourceMap);
    if (renderer.xr) renderer.xr.enabled = false;
    if ("autoClear" in renderer) renderer.autoClear = false;
    renderer.setRenderTarget(sourceMap.renderTarget);
    renderer.setClearColor?.(0x000000, 0);
    renderer.clear?.(true, false, false);
    renderer.render(sourceMap.scene, sourceMap.camera);
    sourceMap.dirty = false;
    sourceMap.rendered = true;
    sourceMap.prewarmed ||= prewarm;
    sourceMap.renderCount += 1;
    return true;
  } finally {
    renderer.setRenderTarget(previousTarget);
    if (previousClearColor && Number.isFinite(previousClearAlpha)) {
      renderer.setClearColor(previousClearColor, previousClearAlpha);
    }
    if ("autoClear" in renderer) renderer.autoClear = previousAutoClear;
    if (renderer.xr) renderer.xr.enabled = previousXrEnabled;
  }
}

export function prewarmObservatoryGaiaSourceMap(sourceMap, renderer) {
  return renderObservatoryGaiaSourceMap(sourceMap, renderer, {
    prewarm: true
  });
}

export function disposeObservatoryGaiaSourceMap(sourceMap) {
  if (!sourceMap || sourceMap.disposed) return false;
  sourceMap.points.removeFromParent();
  sourceMap.heroPoints?.removeFromParent();
  sourceMap.camera.removeFromParent();
  sourceMap.scene.clear();
  sourceMap.material.dispose();
  sourceMap.heroMaterial?.dispose();
  sourceMap.renderTarget.userData.observatoryDisposed = true;
  sourceMap.renderTarget.dispose();
  // Both point geometries are borrowed references. Never call dispose() on
  // either: gaia-stars.js and mushroom-sky.js remain their sole owners.
  sourceMap.disposed = true;
  sourceMap.dirty = false;
  return true;
}
