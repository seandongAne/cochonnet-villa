import * as THREE from "three";

// Pure Three.js building blocks for the observatory's secondary view. This
// module deliberately owns no renderer, DOM node, React hook, texture loader,
// or animation loop. A browser bridge can therefore decide when to render the
// FBO while Node tests can exercise every transform and lifecycle contract.

export const OBSERVATORY_PORTAL_NAME = "mushroom-observatory-portal";
export const OBSERVATORY_PORTAL_COMPOSITE_NAME =
  "mushroom-observatory-portal-composite";
export const OBSERVATORY_PORTAL_STENCIL_REF = 7;
export const OBSERVATORY_PORTAL_TARGET_MAX_WIDTH = 1280;
export const OBSERVATORY_PORTAL_TARGET_MAX_HEIGHT = 720;
export const OBSERVATORY_PORTAL_DEFAULT_QUALITY = "medium";
export const OBSERVATORY_PORTAL_DEFAULT_PARALLAX_SCALE = 0.16;

export const OBSERVATORY_PORTAL_QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({
    id: "high",
    // The Portal carries only low-frequency volumetric colour. Keeping it
    // below native resolution is intentional: backdrop and stars remain in
    // the main scene at full Canvas resolution.
    renderScale: 0.68,
    maxWidth: OBSERVATORY_PORTAL_TARGET_MAX_WIDTH,
    maxHeight: OBSERVATORY_PORTAL_TARGET_MAX_HEIGHT,
    parallaxScale: 0.22
  }),
  medium: Object.freeze({
    id: "medium",
    renderScale: 0.55,
    maxWidth: 960,
    maxHeight: 540,
    parallaxScale: OBSERVATORY_PORTAL_DEFAULT_PARALLAX_SCALE
  }),
  low: Object.freeze({
    id: "low",
    // Retained as a sizing contract for tests/tools. Production Low disables
    // ray marching entirely through observatory-quality.js.
    renderScale: 0.4,
    maxWidth: 640,
    maxHeight: 360,
    parallaxScale: 0.1
  })
});

const COMPOSITE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    // The oversized triangle already contains clip-space coordinates. It does
    // not move with the room camera; the real dome stencil supplies its shape.
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const COMPOSITE_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uPortalTexture;
  uniform float uReveal;

  varying vec2 vUv;

  void main() {
    vec3 portalRadiance = texture2D(
      uPortalTexture,
      clamp(vUv, vec2(0.0), vec2(1.0))
    ).rgb;
    gl_FragColor = vec4(portalRadiance, clamp(uReveal, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function vectorComponent(value, key) {
  return Number.isFinite(value?.[key]) ? value[key] : 0;
}

function copyVector3(target, value) {
  if (Array.isArray(value)) {
    target.set(
      Number.isFinite(value[0]) ? value[0] : 0,
      Number.isFinite(value[1]) ? value[1] : 0,
      Number.isFinite(value[2]) ? value[2] : 0
    );
  } else {
    target.set(
      vectorComponent(value, "x"),
      vectorComponent(value, "y"),
      vectorComponent(value, "z")
    );
  }
  return target;
}

function portalMaterialFrom(value) {
  if (value?.isMaterial) return value;
  return value?.material?.isMaterial ? value.material : null;
}

export function getObservatoryPortalQuality(quality) {
  const key = typeof quality === "string" ? quality.toLowerCase() : "";
  return OBSERVATORY_PORTAL_QUALITY_PRESETS[key]
    ?? OBSERVATORY_PORTAL_QUALITY_PRESETS[OBSERVATORY_PORTAL_DEFAULT_QUALITY];
}

/**
 * Calculate an aspect-preserving physical FBO size. Even the high preset is
 * hard-capped at 1280x720 so a Retina/4K canvas cannot silently allocate a
 * huge volume buffer.
 */
export function calculateObservatoryPortalTargetSize({
  width = 1,
  height = 1,
  pixelRatio = 1,
  quality = OBSERVATORY_PORTAL_DEFAULT_QUALITY
} = {}) {
  const preset = getObservatoryPortalQuality(quality);
  const safeWidth = finitePositive(width, 1);
  const safeHeight = finitePositive(height, 1);
  const safePixelRatio = finitePositive(pixelRatio, 1);
  const desiredWidth = safeWidth * safePixelRatio * preset.renderScale;
  const desiredHeight = safeHeight * safePixelRatio * preset.renderScale;
  const maximumWidth = Math.min(
    preset.maxWidth,
    OBSERVATORY_PORTAL_TARGET_MAX_WIDTH
  );
  const maximumHeight = Math.min(
    preset.maxHeight,
    OBSERVATORY_PORTAL_TARGET_MAX_HEIGHT
  );
  const capScale = Math.min(
    1,
    maximumWidth / desiredWidth,
    maximumHeight / desiredHeight
  );

  return Object.freeze({
    width: Math.max(1, Math.round(desiredWidth * capScale)),
    height: Math.max(1, Math.round(desiredHeight * capScale)),
    quality: preset.id,
    renderScale: preset.renderScale,
    pixelRatio: safePixelRatio
  });
}

export function createObservatoryPortalRenderTarget({
  width = 1,
  height = 1,
  pixelRatio = 1,
  quality = OBSERVATORY_PORTAL_DEFAULT_QUALITY,
  type = THREE.UnsignedByteType
} = {}) {
  const size = calculateObservatoryPortalTargetSize({
    width,
    height,
    pixelRatio,
    quality
  });
  const renderTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
    depthBuffer: false,
    stencilBuffer: false,
    format: THREE.RGBAFormat,
    type,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    samples: 0
  });
  renderTarget.texture.name = "mushroom-observatory-nebula-target";
  // The nebula shader writes linear radiance. The composite performs the one
  // and only output-colour conversion after sampling this target.
  renderTarget.texture.colorSpace = THREE.NoColorSpace;
  renderTarget.texture.generateMipmaps = false;
  renderTarget.userData = {
    ...(renderTarget.userData ?? {}),
    observatoryQuality: size.quality,
    observatoryDisposed: false
  };
  return renderTarget;
}

export function resizeObservatoryPortalRenderTarget(renderTarget, options = {}) {
  if (!renderTarget?.isRenderTarget) return null;
  const size = calculateObservatoryPortalTargetSize(options);
  if (renderTarget.width !== size.width || renderTarget.height !== size.height) {
    renderTarget.setSize(size.width, size.height);
  }
  renderTarget.userData ??= {};
  renderTarget.userData.observatoryQuality = size.quality;
  return size;
}

/**
 * Map room-scale camera translation into a much smaller cosmic translation.
 * Rotation and the exact projection matrix are copied verbatim, making this
 * compatible with a future off-axis/head-tracked projection.
 */
export function calculateObservatoryPortalParallaxOffset(
  sourcePosition,
  portalOrigin,
  parallaxScale = OBSERVATORY_PORTAL_DEFAULT_PARALLAX_SCALE,
  target = new THREE.Vector3()
) {
  const safeScale = THREE.MathUtils.clamp(
    Number.isFinite(parallaxScale)
      ? parallaxScale
      : OBSERVATORY_PORTAL_DEFAULT_PARALLAX_SCALE,
    0,
    1
  );
  return target.set(
    (vectorComponent(sourcePosition, "x") - vectorComponent(portalOrigin, "x"))
      * safeScale,
    (vectorComponent(sourcePosition, "y") - vectorComponent(portalOrigin, "y"))
      * safeScale,
    (vectorComponent(sourcePosition, "z") - vectorComponent(portalOrigin, "z"))
      * safeScale
  );
}

export function updateObservatoryPortalCamera(
  sourceCamera,
  portalCamera,
  {
    portalOrigin = null,
    cosmosOrigin = null,
    parallaxScale = OBSERVATORY_PORTAL_DEFAULT_PARALLAX_SCALE
  } = {}
) {
  if (!sourceCamera?.isCamera || !portalCamera?.isCamera) return null;

  sourceCamera.updateMatrixWorld(true);
  const sourcePosition = sourceCamera.getWorldPosition(new THREE.Vector3());
  const sourceQuaternion = sourceCamera.getWorldQuaternion(new THREE.Quaternion());
  const offset = calculateObservatoryPortalParallaxOffset(
    sourcePosition,
    portalOrigin,
    parallaxScale
  );
  const cosmicAnchor = copyVector3(new THREE.Vector3(), cosmosOrigin);

  portalCamera.position.copy(cosmicAnchor).add(offset);
  portalCamera.quaternion.copy(sourceQuaternion);
  portalCamera.projectionMatrix.copy(sourceCamera.projectionMatrix);
  portalCamera.projectionMatrixInverse.copy(sourceCamera.projectionMatrixInverse);

  // Preserve the ordinary camera fields for consumers that inspect or later
  // update the dedicated portal camera's projection.
  for (const key of ["near", "far", "zoom", "aspect", "fov"]) {
    if (key in sourceCamera && key in portalCamera) {
      portalCamera[key] = sourceCamera[key];
    }
  }
  portalCamera.updateMatrixWorld(true);
  portalCamera.userData.observatoryParallaxOffset = offset.clone();
  return portalCamera;
}

/**
 * Centre an infinite/far celestial layer on the portal camera. Its children
 * retain an identical camera-relative vector after translation, giving them
 * exactly zero translation parallax while a static near layer remains free to
 * exhibit the scaled camera movement above.
 */
export function centerObservatoryPortalFarField(farField, portalCamera) {
  if (!farField?.isObject3D || !portalCamera?.isCamera) return null;
  const cameraWorldPosition = portalCamera.getWorldPosition(new THREE.Vector3());
  if (farField.parent) {
    farField.parent.updateMatrixWorld(true);
    farField.parent.worldToLocal(cameraWorldPosition);
  }
  farField.position.copy(cameraWorldPosition);
  farField.updateMatrixWorld(true);
  return farField;
}

export function createObservatoryPortalCompositeMaterial({
  texture = null,
  reveal = 0,
  stencilRef = OBSERVATORY_PORTAL_STENCIL_REF
} = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPortalTexture: { value: texture },
      uReveal: {
        value: THREE.MathUtils.clamp(Number.isFinite(reveal) ? reveal : 0, 0, 1)
      }
    },
    vertexShader: COMPOSITE_VERTEX_SHADER,
    fragmentShader: COMPOSITE_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
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
  material.name = "mushroom-observatory-portal-composite-material";
  material.userData.observatoryDisposed = false;
  return material;
}

export function createObservatoryPortalComposite(options = {}) {
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
    createObservatoryPortalCompositeMaterial(options)
  );
  composite.name = OBSERVATORY_PORTAL_COMPOSITE_NAME;
  composite.frustumCulled = false;
  // The current crisp stars use -900. Draw the low-frequency nebula first so
  // stars remain sharp and room transparency can still appear over both.
  composite.renderOrder = -950;
  composite.userData.observatoryDisposed = false;
  return composite;
}

export function updateObservatoryPortalComposite(
  compositeOrMaterial,
  { texture, reveal } = {}
) {
  const material = portalMaterialFrom(compositeOrMaterial);
  if (!material?.uniforms) return false;
  if (texture !== undefined) {
    material.uniforms.uPortalTexture.value = texture;
  }
  if (reveal !== undefined) {
    material.uniforms.uReveal.value = THREE.MathUtils.clamp(
      Number.isFinite(reveal) ? reveal : 0,
      0,
      1
    );
  }
  return true;
}

export function disposeObservatoryPortalRenderTarget(renderTarget) {
  if (!renderTarget?.isRenderTarget) return false;
  renderTarget.userData ??= {};
  if (renderTarget.userData.observatoryDisposed) return false;
  renderTarget.dispose();
  renderTarget.userData.observatoryDisposed = true;
  return true;
}

export function disposeObservatoryPortalComposite(compositeOrMaterial) {
  const material = portalMaterialFrom(compositeOrMaterial);
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

/**
 * Convenience aggregate for the future React bridge. The target begins at a
 * bounded size, the composite already samples it, and disposal is idempotent.
 */
export function createObservatoryPortal({
  sourceCamera = null,
  portalOrigin = null,
  cosmosOrigin = null,
  parallaxScale,
  ...renderTargetOptions
} = {}) {
  const quality = getObservatoryPortalQuality(renderTargetOptions.quality);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  const renderTarget = createObservatoryPortalRenderTarget({
    ...renderTargetOptions,
    quality: quality.id
  });
  const composite = createObservatoryPortalComposite({
    texture: renderTarget.texture,
    reveal: 0
  });
  const portal = {
    name: OBSERVATORY_PORTAL_NAME,
    camera,
    renderTarget,
    composite,
    quality: quality.id,
    portalOrigin: copyVector3(new THREE.Vector3(), portalOrigin),
    cosmosOrigin: copyVector3(new THREE.Vector3(), cosmosOrigin),
    parallaxScale: Number.isFinite(parallaxScale)
      ? THREE.MathUtils.clamp(parallaxScale, 0, 1)
      : quality.parallaxScale,
    disposed: false
  };

  if (sourceCamera?.isCamera) {
    updateObservatoryPortalCamera(sourceCamera, camera, portal);
  }
  return portal;
}

export function resizeObservatoryPortal(portal, options = {}) {
  if (!portal || portal.disposed) return null;
  const size = resizeObservatoryPortalRenderTarget(portal.renderTarget, options);
  if (size) {
    portal.quality = size.quality;
    const quality = getObservatoryPortalQuality(size.quality);
    portal.parallaxScale = Number.isFinite(options.parallaxScale)
      ? THREE.MathUtils.clamp(options.parallaxScale, 0, 1)
      : quality.parallaxScale;
  }
  return size;
}

export function disposeObservatoryPortal(portal) {
  if (!portal || portal.disposed) return false;
  disposeObservatoryPortalComposite(portal.composite);
  disposeObservatoryPortalRenderTarget(portal.renderTarget);
  portal.disposed = true;
  return true;
}

export {
  COMPOSITE_FRAGMENT_SHADER as OBSERVATORY_PORTAL_COMPOSITE_FRAGMENT_SHADER,
  COMPOSITE_VERTEX_SHADER as OBSERVATORY_PORTAL_COMPOSITE_VERTEX_SHADER
};
