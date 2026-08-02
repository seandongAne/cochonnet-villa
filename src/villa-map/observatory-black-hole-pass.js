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
    maxWidth: 1280,
    maxHeight: 720
  }),
  medium: Object.freeze({
    id: "medium",
    renderScale: 0.75,
    maxWidth: 960,
    maxHeight: 540
  }),
  low: Object.freeze({
    id: "low",
    renderScale: 0.5,
    maxWidth: 720,
    maxHeight: 405
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

  varying vec2 vUv;

  void main() {
    vec4 blackHoleLayer = texture2D(uBlackHoleTexture, vUv);
    float reveal = clamp(uReveal, 0.0, 1.0);

    // The pass texture already uses premultiplied semantics: opaque black
    // geometry stores alpha while additive accretion geometry may contribute
    // radiance with little or no alpha. Scaling both channels preserves that
    // relationship during the reveal transition. Custom blending then yields:
    // final = source.rgb + existingCosmos * (1 - source.a).
    gl_FragColor = vec4(
      blackHoleLayer.rgb * reveal,
      blackHoleLayer.a * reveal
    );
    #include <colorspace_fragment>
  }
`;

const cameraWorldPositionScratch = new THREE.Vector3();
const cameraWorldQuaternionScratch = new THREE.Quaternion();

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
  return camera;
}

export function createObservatoryBlackHolePassCompositeMaterial({
  texture = null,
  reveal = 0,
  stencilRef = OBSERVATORY_BLACK_HOLE_PASS_STENCIL_REF
} = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uBlackHoleTexture: { value: texture },
      uReveal: {
        value: THREE.MathUtils.clamp(
          Number.isFinite(reveal) ? reveal : 0,
          0,
          1
        )
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
  material.userData.observatoryDisposed = false;
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
  { texture, reveal, visible } = {}
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
    stencilRef
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
      texture: pass.renderTarget.texture
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
