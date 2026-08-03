import * as THREE from "three";

// Node-pure render-pass primitives for the hidden F-key black-hole event.
//
// The browser runtime owns the renderer and decides when to render `scene` into
// `renderTarget`. This module owns only deterministic Three.js objects and
// lifecycle helpers, keeping the pass importable by the Node test suite.

export const OBSERVATORY_BLACK_HOLE_PASS_NAME =
  "mushroom-observatory-black-hole-pass";
export const OBSERVATORY_BLACK_HOLE_PASS_SCENE_NAME =
  "mushroom-observatory-black-hole-scene";
export const OBSERVATORY_BLACK_HOLE_PASS_CAMERA_NAME =
  "mushroom-observatory-black-hole-camera";
export const OBSERVATORY_BLACK_HOLE_PASS_TARGET_NAME =
  "mushroom-observatory-black-hole-target";
export const OBSERVATORY_BLACK_HOLE_PASS_COMPOSITE_NAME =
  "mushroom-observatory-black-hole-composite";
export const OBSERVATORY_BLACK_HOLE_PASS_COMPOSITE_MATERIAL_NAME =
  "mushroom-observatory-black-hole-composite-material";
export const OBSERVATORY_BLACK_HOLE_PASS_STENCIL_REF = 7;
export const OBSERVATORY_BLACK_HOLE_PASS_RENDER_ORDER = -890;
export const OBSERVATORY_BLACK_HOLE_PASS_DEFAULT_QUALITY = "medium";

export const OBSERVATORY_BLACK_HOLE_PASS_QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({
    id: "high",
    renderScale: 1,
    maxWidth: 1920,
    maxHeight: 1080
  }),
  medium: Object.freeze({
    id: "medium",
    renderScale: 0.85,
    maxWidth: 1280,
    maxHeight: 720
  }),
  low: Object.freeze({
    id: "low",
    renderScale: 0.6,
    maxWidth: 960,
    maxHeight: 540
  })
});

// A deliberately local, single-pass highlight treatment for the black-hole
// render target. This is not whole-scene Bloom: the composite can only sample
// the isolated black-hole texture, and its extractor rejects the cool/neutral
// point highlights that make up most of the lensed Gaia field. The white-hot
// core is admitted only when neighbouring warm disc energy supports it.
//
// Low keeps the previous one-sample composite exactly. Besides preserving its
// visual fallback, the compile-time define removes every extra texture lookup
// on constrained hardware.
export const OBSERVATORY_BLACK_HOLE_PASS_LOCAL_HDR_PROFILES = Object.freeze({
  high: Object.freeze({
    id: "high",
    enabled: true,
    sampleTier: 2,
    haloStrength: 3.2,
    coreGain: 3.1,
    haloRadiusFraction: 0.085,
    maxHaloRadiusPixels: 96
  }),
  medium: Object.freeze({
    id: "medium",
    enabled: true,
    sampleTier: 1,
    haloStrength: 1.9,
    coreGain: 2.35,
    haloRadiusFraction: 0.065,
    maxHaloRadiusPixels: 64
  }),
  low: Object.freeze({
    id: "low",
    enabled: false,
    sampleTier: 0,
    haloStrength: 0,
    coreGain: 1,
    haloRadiusFraction: 0,
    maxHaloRadiusPixels: 0
  })
});

const COMPOSITE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    // This oversized triangle already contains clip-space coordinates. The
    // physical dome stencil, rather than a camera-space mesh, supplies its
    // visible silhouette in the main scene.
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const COMPOSITE_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uBlackHoleTexture;
  uniform float uReveal;
  uniform vec2 uInvResolution;
  uniform float uHaloRadiusPixels;
  uniform float uHaloStrength;
  uniform float uCoreGain;
  uniform vec2 uLensUvCenter;
  uniform float uLensUvRadius;
  uniform float uCompositeAspect;

  varying vec2 vUv;

  #if OBSERVATORY_BH_LOCAL_HDR >= 1
  float observatoryLuminance(vec3 colour) {
    return dot(colour, vec3(0.2126, 0.7152, 0.0722));
  }

  // Extract the broad thermal-gold disc, rather than every bright point in
  // the isolated target. Neutral white is intentionally excluded here: a
  // white pixel earns core gain below only when warm neighbours prove that it
  // belongs to the accretion flow instead of a Gaia star.
  float observatoryThermalEnergy(vec3 colour) {
    float luminance = observatoryLuminance(colour);
    float warmChroma = max(
      max(colour.r - colour.b, colour.g - colour.b * 0.94),
      0.0
    );
    float thermalMask = smoothstep(0.004, 0.085, warmChroma);
    float highlightMask = smoothstep(0.035, 0.38, luminance);
    return min(luminance * 1.32, 1.55) * thermalMask * highlightMask;
  }

  vec3 observatoryColourTap(vec2 offset) {
    return texture2D(
      uBlackHoleTexture,
      clamp(vUv + offset, vec2(0.0), vec2(1.0))
    ).rgb;
  }

  #endif

  void main() {
    vec4 blackHoleLayer = texture2D(uBlackHoleTexture, vUv);
    float reveal = clamp(uReveal, 0.0, 1.0);
    vec3 localRadiance = blackHoleLayer.rgb;

    #if OBSERVATORY_BH_LOCAL_HDR >= 1
      float centreLuminance = observatoryLuminance(blackHoleLayer.rgb);
      float centreThermalRaw = observatoryThermalEnergy(blackHoleLayer.rgb);
      // A 2.4 px cross tests the real thickness of the inner flow. It keeps
      // isolated stars out of the white-hot core without mistaking the thin
      // Kerr rim for a point, as the derivative-only version did.
      vec2 corePixel = uInvResolution * 2.4;
      vec3 neighbourRight = observatoryColourTap(vec2( corePixel.x, 0.0));
      vec3 neighbourLeft = observatoryColourTap(vec2(-corePixel.x, 0.0));
      vec3 neighbourUp = observatoryColourTap(vec2(0.0,  corePixel.y));
      vec3 neighbourDown = observatoryColourTap(vec2(0.0, -corePixel.y));
      float immediateSupport = observatoryThermalEnergy(neighbourRight)
        + observatoryThermalEnergy(neighbourLeft)
        + observatoryThermalEnergy(neighbourUp)
        + observatoryThermalEnergy(neighbourDown);
      immediateSupport = min(immediateSupport * 0.46, 1.0);
      float neighbourLuminance = (
        observatoryLuminance(neighbourRight)
        + observatoryLuminance(neighbourLeft)
        + observatoryLuminance(neighbourUp)
        + observatoryLuminance(neighbourDown)
      ) * 0.25;
      float ridgeContrast = max(
        centreLuminance - neighbourLuminance,
        0.0
      );
      float ridgeShape = smoothstep(0.012, 0.13, ridgeContrast);

      float channelMaximum = max(
        max(blackHoleLayer.r, blackHoleLayer.g),
        blackHoleLayer.b
      );
      float channelMinimum = min(
        min(blackHoleLayer.r, blackHoleLayer.g),
        blackHoleLayer.b
      );
      float relativeChroma = (channelMaximum - channelMinimum)
        / max(centreLuminance, 0.08);
      float nearNeutral = 1.0 - smoothstep(0.14, 0.42, relativeChroma);

      // Warm gold is the moving carrier and must retain its hue. Give it only
      // a small chroma-preserving lift. Display white is reserved for a local
      // near-neutral luminance maximum with warm disc support around it.
      float carrierLift = smoothstep(0.08, 0.48, centreThermalRaw)
        * smoothstep(0.035, 0.24, immediateSupport);
      localRadiance *= 1.0 + carrierLift * 0.12;

      float supportedNeutralRidge = nearNeutral
        * smoothstep(0.48, 0.98, centreLuminance)
        * ridgeShape
        * smoothstep(0.035, 0.25, immediateSupport);
      float coreCandidate = supportedNeutralRidge;
      // A steep response preserves amber mid-tones and reserves display white
      // for the hottest narrow ridge instead of flattening the full Doppler
      // crescent into one white plate.
      float coreMask = pow(coreCandidate, 2.15);

      // Compress only the broad, flat neutral shoulder that previously hid
      // the animated gold tracers. This is local to warm-supported disc pixels
      // and therefore cannot dim the surrounding Gaia field.
      float flatNeutralShoulder = nearNeutral
        * smoothstep(0.34, 0.82, centreLuminance)
        * (1.0 - ridgeShape)
        * smoothstep(0.025, 0.20, immediateSupport);
      localRadiance *= 1.0 - flatNeutralShoulder * 0.34;
      localRadiance *= mix(1.0, uCoreGain, coreMask);
      // Multiplication cannot make a dim source look HDR. Add a tightly
      // supported white-gold peak so the hottest inner flow deliberately
      // reaches display white while its amber skirt communicates over-range
      // energy through simultaneous contrast.
      float whitePeak = pow(coreMask, 1.12) * (uCoreGain - 1.0) * 0.92;
      localRadiance += vec3(1.34, 1.14, 0.84) * whitePeak;

      // The earlier sparse blur copied the thin Kerr rim into visible loops.
      // Instead, use the real projected lens centre and angular radius to draw
      // a continuous aureole with an exponential skirt. Its inner gate keeps
      // the event horizon black, while the Doppler-side bias retains the
      // physical asymmetry already present in the Kerr transfer.
      vec2 lensDelta = vUv - uLensUvCenter;
      lensDelta.x *= uCompositeAspect;
      float lensRadius = max(uLensUvRadius, uInvResolution.y * 24.0);
      float aureoleInnerRadius = max(
        lensRadius * 0.24,
        uHaloRadiusPixels * uInvResolution.y * 0.11
      );
      float lensDistance = length(lensDelta);
      float approachSide = mix(
        0.72,
        1.18,
        smoothstep(-aureoleInnerRadius, aureoleInnerRadius, lensDelta.x)
      );
      float horizonCut = smoothstep(
        aureoleInnerRadius * 0.74,
        aureoleInnerRadius * 1.02,
        lensDistance
      );
      float aureoleTail = exp(
        -max(lensDistance - aureoleInnerRadius, 0.0)
        / max(lensRadius * 0.27, 0.0001)
      );
      float outerCut = 1.0 - smoothstep(
        lensRadius * 0.86,
        lensRadius * 1.20,
        lensDistance
      );
      float aureole = horizonCut * aureoleTail * outerCut * approachSide;
      #if OBSERVATORY_BH_LOCAL_HDR >= 2
        aureole *= 1.0;
      #else
        aureole *= 0.78;
      #endif

      vec3 smoothGold = vec3(1.18, 0.55, 0.12)
        * aureole * uHaloStrength * 0.062;
      localRadiance += min(
        smoothGold,
        vec3(0.36, 0.17, 0.045)
      );
    #endif

    // The pass texture already uses premultiplied semantics: opaque black
    // geometry stores alpha while additive accretion geometry may contribute
    // radiance with little or no alpha. Scaling both channels preserves that
    // relationship during the reveal transition. Custom blending then yields:
    // final = source.rgb + existingCosmos * (1 - source.a).
    gl_FragColor = vec4(
      localRadiance * reveal,
      blackHoleLayer.a * reveal
    );
    #include <colorspace_fragment>
  }
`;

const cameraWorldPositionScratch = new THREE.Vector3();
const cameraWorldQuaternionScratch = new THREE.Quaternion();
const lensWorldPositionScratch = new THREE.Vector3();
const lensProjectedScratch = new THREE.Vector3();
const lensProjectedEdgeScratch = new THREE.Vector3();
const cameraWorldUpScratch = new THREE.Vector3();
const BLACK_HOLE_LENS_ANCHOR_NAME = "mushroom-observatory-black-hole";

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function calculateObservatoryBlackHolePassLocalHdrSettings({
  width = 1,
  height = 1,
  quality = OBSERVATORY_BLACK_HOLE_PASS_DEFAULT_QUALITY
} = {}) {
  const safeWidth = finitePositive(width, 1);
  const safeHeight = finitePositive(height, 1);
  const qualityPreset = getObservatoryBlackHolePassQuality(quality);
  const profile = OBSERVATORY_BLACK_HOLE_PASS_LOCAL_HDR_PROFILES[
    qualityPreset.id
  ];
  const shortEdge = Math.min(safeWidth, safeHeight);
  const haloRadiusPixels = profile.enabled
    ? Math.min(
      Math.max(1, shortEdge * profile.haloRadiusFraction),
      profile.maxHaloRadiusPixels
    )
    : 0;

  return Object.freeze({
    quality: profile.id,
    enabled: profile.enabled,
    sampleTier: profile.sampleTier,
    width: safeWidth,
    height: safeHeight,
    inverseWidth: 1 / safeWidth,
    inverseHeight: 1 / safeHeight,
    haloRadiusPixels,
    haloStrength: profile.haloStrength,
    coreGain: profile.coreGain
  });
}

function applyObservatoryBlackHolePassLocalHdrSettings(
  material,
  options = {}
) {
  if (!material?.uniforms) return null;
  const previous = material.userData?.observatoryLocalHdrSettings;
  const settings = calculateObservatoryBlackHolePassLocalHdrSettings({
    width: options.width ?? previous?.width ?? 1,
    height: options.height ?? previous?.height ?? 1,
    quality: options.quality ?? previous?.quality
      ?? OBSERVATORY_BLACK_HOLE_PASS_DEFAULT_QUALITY
  });
  material.uniforms.uInvResolution.value.set(
    settings.inverseWidth,
    settings.inverseHeight
  );
  material.uniforms.uHaloRadiusPixels.value = settings.haloRadiusPixels;
  material.uniforms.uHaloStrength.value = settings.haloStrength;
  material.uniforms.uCoreGain.value = settings.coreGain;
  material.uniforms.uCompositeAspect.value = settings.width / settings.height;

  const localHdrDefine = settings.sampleTier;
  material.defines ??= {};
  if (material.defines.OBSERVATORY_BH_LOCAL_HDR !== localHdrDefine) {
    material.defines.OBSERVATORY_BH_LOCAL_HDR = localHdrDefine;
    material.needsUpdate = true;
  }
  material.userData ??= {};
  material.userData.observatoryLocalHdrSettings = settings;
  return settings;
}

function blackHoleCompositeMaterialFrom(value) {
  if (value?.isMaterial) return value;
  return value?.material?.isMaterial ? value.material : null;
}

function blackHolePassCameraFrom(value) {
  if (value?.isCamera) return value;
  return value?.camera?.isCamera ? value.camera : null;
}

function createCameraLike(sourceCamera) {
  let camera;
  if (sourceCamera?.isOrthographicCamera) {
    camera = new THREE.OrthographicCamera(
      sourceCamera.left,
      sourceCamera.right,
      sourceCamera.top,
      sourceCamera.bottom,
      sourceCamera.near,
      sourceCamera.far
    );
  } else {
    camera = new THREE.PerspectiveCamera(
      sourceCamera?.isPerspectiveCamera ? sourceCamera.fov : 70,
      sourceCamera?.isPerspectiveCamera ? sourceCamera.aspect : 1,
      sourceCamera?.isCamera ? sourceCamera.near : 0.1,
      sourceCamera?.isCamera ? sourceCamera.far : 200
    );
  }
  camera.name = OBSERVATORY_BLACK_HOLE_PASS_CAMERA_NAME;
  return camera;
}

function updateObservatoryBlackHolePassLensProjection(pass, camera) {
  const material = blackHoleCompositeMaterialFrom(pass?.composite);
  const lensAnchor = pass?.scene?.getObjectByName?.(
    BLACK_HOLE_LENS_ANCHOR_NAME
  );
  if (
    !material?.uniforms?.uLensUvCenter
    || !material.uniforms.uLensUvRadius
    || !lensAnchor?.isObject3D
    || !camera?.isCamera
  ) return false;

  pass.scene.updateMatrixWorld(true);
  lensAnchor.getWorldPosition(lensWorldPositionScratch);
  lensProjectedScratch.copy(lensWorldPositionScratch).project(camera);
  if (
    !Number.isFinite(lensProjectedScratch.x)
    || !Number.isFinite(lensProjectedScratch.y)
  ) return false;

  material.uniforms.uLensUvCenter.value.set(
    lensProjectedScratch.x * 0.5 + 0.5,
    lensProjectedScratch.y * 0.5 + 0.5
  );

  const angularRadius = lensAnchor.userData?.angularRadius;
  const cameraDistance = lensAnchor.userData?.cameraDistance;
  if (
    Number.isFinite(angularRadius)
    && angularRadius > 0
    && Number.isFinite(cameraDistance)
    && cameraDistance > 0
  ) {
    cameraWorldUpScratch.copy(camera.up)
      .applyQuaternion(cameraWorldQuaternionScratch)
      .normalize();
    lensProjectedEdgeScratch.copy(lensWorldPositionScratch).addScaledVector(
      cameraWorldUpScratch,
      Math.tan(angularRadius) * cameraDistance
    ).project(camera);
    const radiusUv = Math.abs(
      lensProjectedEdgeScratch.y - lensProjectedScratch.y
    ) * 0.5;
    if (Number.isFinite(radiusUv) && radiusUv > 0) {
      material.uniforms.uLensUvRadius.value = THREE.MathUtils.clamp(
        radiusUv,
        0.018,
        0.42
      );
    }
  }
  return true;
}

export function getObservatoryBlackHolePassQuality(quality) {
  const key = typeof quality === "string" ? quality.toLowerCase() : "";
  return OBSERVATORY_BLACK_HOLE_PASS_QUALITY_PRESETS[key]
    ?? OBSERVATORY_BLACK_HOLE_PASS_QUALITY_PRESETS[
      OBSERVATORY_BLACK_HOLE_PASS_DEFAULT_QUALITY
    ];
}

export function calculateObservatoryBlackHolePassTargetSize({
  width = 1,
  height = 1,
  pixelRatio = 1,
  quality = OBSERVATORY_BLACK_HOLE_PASS_DEFAULT_QUALITY
} = {}) {
  const preset = getObservatoryBlackHolePassQuality(quality);
  const safeWidth = finitePositive(width, 1);
  const safeHeight = finitePositive(height, 1);
  const safePixelRatio = finitePositive(pixelRatio, 1);
  const desiredWidth = safeWidth * safePixelRatio * preset.renderScale;
  const desiredHeight = safeHeight * safePixelRatio * preset.renderScale;
  const capScale = Math.min(
    1,
    preset.maxWidth / desiredWidth,
    preset.maxHeight / desiredHeight
  );

  return Object.freeze({
    width: Math.max(1, Math.round(desiredWidth * capScale)),
    height: Math.max(1, Math.round(desiredHeight * capScale)),
    quality: preset.id,
    renderScale: preset.renderScale,
    pixelRatio: safePixelRatio
  });
}

export function createObservatoryBlackHolePassRenderTarget({
  width = 1,
  height = 1,
  pixelRatio = 1,
  quality = OBSERVATORY_BLACK_HOLE_PASS_DEFAULT_QUALITY,
  type = THREE.UnsignedByteType
} = {}) {
  const size = calculateObservatoryBlackHolePassTargetSize({
    width,
    height,
    pixelRatio,
    quality
  });
  const renderTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
    depthBuffer: true,
    stencilBuffer: false,
    format: THREE.RGBAFormat,
    type,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    samples: 0
  });
  renderTarget.texture.name = OBSERVATORY_BLACK_HOLE_PASS_TARGET_NAME;
  renderTarget.texture.colorSpace = THREE.NoColorSpace;
  renderTarget.texture.generateMipmaps = false;
  renderTarget.userData = {
    ...(renderTarget.userData ?? {}),
    observatoryQuality: size.quality,
    observatoryDisposed: false
  };
  return renderTarget;
}

export function resizeObservatoryBlackHolePassRenderTarget(
  renderTarget,
  options = {}
) {
  if (
    !renderTarget?.isRenderTarget
    || renderTarget.userData?.observatoryDisposed
  ) {
    return null;
  }
  const size = calculateObservatoryBlackHolePassTargetSize(options);
  if (renderTarget.width !== size.width || renderTarget.height !== size.height) {
    renderTarget.setSize(size.width, size.height);
  }
  renderTarget.userData ??= {};
  renderTarget.userData.observatoryQuality = size.quality;
  return size;
}

/**
 * Copy the source camera's complete world transform and projection.
 *
 * Unlike the nebula Portal's deliberately compressed camera translation, the
 * finite black-hole scene receives one-to-one room movement. This is the
 * motion-parallax cue that makes walking across L3 change the disk silhouette.
 */
export function updateObservatoryBlackHolePassCamera(
  sourceCamera,
  passOrCamera
) {
  const camera = blackHolePassCameraFrom(passOrCamera);
  if (
    !sourceCamera?.isCamera
    || !camera
    || passOrCamera?.disposed === true
  ) {
    return null;
  }

  sourceCamera.updateWorldMatrix(true, false);
  sourceCamera.getWorldPosition(cameraWorldPositionScratch);
  sourceCamera.getWorldQuaternion(cameraWorldQuaternionScratch);
  camera.position.copy(cameraWorldPositionScratch);
  camera.quaternion.copy(cameraWorldQuaternionScratch);
  camera.scale.set(1, 1, 1);
  camera.up.copy(sourceCamera.up);
  camera.projectionMatrix.copy(sourceCamera.projectionMatrix);
  camera.projectionMatrixInverse.copy(sourceCamera.projectionMatrixInverse);
  camera.layers.mask = sourceCamera.layers.mask;

  for (const key of [
    "near",
    "far",
    "zoom",
    "aspect",
    "fov",
    "focus",
    "filmGauge",
    "filmOffset",
    "left",
    "right",
    "top",
    "bottom"
  ]) {
    if (key in sourceCamera && key in camera) camera[key] = sourceCamera[key];
  }
  if ("coordinateSystem" in sourceCamera && "coordinateSystem" in camera) {
    camera.coordinateSystem = sourceCamera.coordinateSystem;
  }

  camera.updateMatrixWorld(true);
  camera.userData.observatorySourceWorldPosition =
    cameraWorldPositionScratch.clone();
  updateObservatoryBlackHolePassLensProjection(passOrCamera, camera);
  return camera;
}

export function createObservatoryBlackHolePassCompositeMaterial({
  texture = null,
  reveal = 0,
  stencilRef = OBSERVATORY_BLACK_HOLE_PASS_STENCIL_REF,
  width = 1,
  height = 1,
  quality = OBSERVATORY_BLACK_HOLE_PASS_DEFAULT_QUALITY
} = {}) {
  const localHdrSettings = calculateObservatoryBlackHolePassLocalHdrSettings({
    width,
    height,
    quality
  });
  const material = new THREE.ShaderMaterial({
    defines: {
      OBSERVATORY_BH_LOCAL_HDR: localHdrSettings.sampleTier
    },
    uniforms: {
      uBlackHoleTexture: { value: texture },
      uReveal: {
        value: THREE.MathUtils.clamp(
          Number.isFinite(reveal) ? reveal : 0,
          0,
          1
        )
      },
      uInvResolution: {
        value: new THREE.Vector2(
          localHdrSettings.inverseWidth,
          localHdrSettings.inverseHeight
        )
      },
      uHaloRadiusPixels: { value: localHdrSettings.haloRadiusPixels },
      uHaloStrength: { value: localHdrSettings.haloStrength },
      uCoreGain: { value: localHdrSettings.coreGain },
      uLensUvCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uLensUvRadius: { value: 0.12 },
      uCompositeAspect: {
        value: localHdrSettings.width / localHdrSettings.height
      }
    },
    vertexShader: COMPOSITE_VERTEX_SHADER,
    fragmentShader: COMPOSITE_FRAGMENT_SHADER,
    transparent: true,
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
    fog: false,
    stencilWrite: true,
    stencilRef,
    stencilFunc: THREE.EqualStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.KeepStencilOp
  });
  material.name = OBSERVATORY_BLACK_HOLE_PASS_COMPOSITE_MATERIAL_NAME;
  material.userData = {
    ...material.userData,
    observatoryDisposed: false,
    observatoryLocalHdrSettings: localHdrSettings
  };
  return material;
}

export function createObservatoryBlackHolePassComposite(options = {}) {
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

  const composite = new THREE.Mesh(
    geometry,
    createObservatoryBlackHolePassCompositeMaterial(options)
  );
  composite.name = OBSERVATORY_BLACK_HOLE_PASS_COMPOSITE_NAME;
  composite.frustumCulled = false;
  // Gaia/hero stars are -920/-900 and the near-nebula composite is -880.
  // The black-hole pass therefore occludes the far field while foreground
  // portal dust can still cross in front of the event horizon.
  composite.renderOrder = OBSERVATORY_BLACK_HOLE_PASS_RENDER_ORDER;
  composite.userData.observatoryDisposed = false;
  return composite;
}

export function updateObservatoryBlackHolePassComposite(
  compositeOrMaterial,
  { texture, reveal, visible, width, height, quality } = {}
) {
  const material = blackHoleCompositeMaterialFrom(compositeOrMaterial);
  if (!material?.uniforms || material.userData?.observatoryDisposed) return false;
  if (texture !== undefined) {
    material.uniforms.uBlackHoleTexture.value = texture;
  }
  if (reveal !== undefined) {
    material.uniforms.uReveal.value = THREE.MathUtils.clamp(
      Number.isFinite(reveal) ? reveal : 0,
      0,
      1
    );
  }
  if (width !== undefined || height !== undefined || quality !== undefined) {
    applyObservatoryBlackHolePassLocalHdrSettings(material, {
      width,
      height,
      quality
    });
  }
  if (visible !== undefined && compositeOrMaterial?.isObject3D) {
    compositeOrMaterial.visible = Boolean(visible);
  }
  return true;
}

export function disposeObservatoryBlackHolePassRenderTarget(renderTarget) {
  if (!renderTarget?.isRenderTarget) return false;
  renderTarget.userData ??= {};
  if (renderTarget.userData.observatoryDisposed) return false;
  renderTarget.dispose();
  renderTarget.userData.observatoryDisposed = true;
  return true;
}

export function disposeObservatoryBlackHolePassComposite(compositeOrMaterial) {
  const material = blackHoleCompositeMaterialFrom(compositeOrMaterial);
  const composite = compositeOrMaterial?.isObject3D ? compositeOrMaterial : null;
  const lifecycleOwner = composite ?? material;
  if (!lifecycleOwner) return false;
  lifecycleOwner.userData ??= {};
  if (lifecycleOwner.userData.observatoryDisposed) return false;

  composite?.geometry?.dispose();
  material?.dispose();
  lifecycleOwner.userData.observatoryDisposed = true;
  if (material) material.userData.observatoryDisposed = true;
  composite?.removeFromParent();
  return true;
}

export function createObservatoryBlackHolePass({
  sourceCamera = null,
  stencilRef = OBSERVATORY_BLACK_HOLE_PASS_STENCIL_REF,
  ...renderTargetOptions
} = {}) {
  const quality = getObservatoryBlackHolePassQuality(
    renderTargetOptions.quality
  );
  const scene = new THREE.Scene();
  scene.name = OBSERVATORY_BLACK_HOLE_PASS_SCENE_NAME;
  const camera = createCameraLike(sourceCamera);
  const renderTarget = createObservatoryBlackHolePassRenderTarget({
    ...renderTargetOptions,
    quality: quality.id
  });
  const composite = createObservatoryBlackHolePassComposite({
    texture: renderTarget.texture,
    reveal: 0,
    stencilRef,
    width: renderTarget.width,
    height: renderTarget.height,
    quality: quality.id
  });
  composite.visible = false;

  const pass = {
    name: OBSERVATORY_BLACK_HOLE_PASS_NAME,
    scene,
    camera,
    renderTarget,
    composite,
    quality: quality.id,
    disposed: false
  };
  if (sourceCamera?.isCamera) {
    updateObservatoryBlackHolePassCamera(sourceCamera, pass);
  }
  return pass;
}

export function resizeObservatoryBlackHolePass(pass, options = {}) {
  if (!pass || pass.disposed) return null;
  const size = resizeObservatoryBlackHolePassRenderTarget(
    pass.renderTarget,
    options
  );
  if (size) {
    pass.quality = size.quality;
    updateObservatoryBlackHolePassComposite(pass.composite, {
      texture: pass.renderTarget.texture,
      width: size.width,
      height: size.height,
      quality: size.quality
    });
  }
  return size;
}

export function disposeObservatoryBlackHolePass(pass) {
  if (!pass || pass.disposed) return false;
  disposeObservatoryBlackHolePassComposite(pass.composite);
  disposeObservatoryBlackHolePassRenderTarget(pass.renderTarget);
  pass.camera?.removeFromParent();
  pass.camera?.clear();
  pass.scene?.clear();
  pass.disposed = true;
  return true;
}

export {
  COMPOSITE_FRAGMENT_SHADER as OBSERVATORY_BLACK_HOLE_PASS_COMPOSITE_FRAGMENT_SHADER,
  COMPOSITE_VERTEX_SHADER as OBSERVATORY_BLACK_HOLE_PASS_COMPOSITE_VERTEX_SHADER
};
