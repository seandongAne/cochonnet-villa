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
export const OBSERVATORY_PORTAL_DEFAULT_PARALLAX_SCALE = 0.2;
export const OBSERVATORY_PORTAL_DEFAULT_EMISSION_STRENGTH = 0.04;
export const OBSERVATORY_PORTAL_DEFAULT_EXTINCTION_STRENGTH = 0.9;
export const OBSERVATORY_PORTAL_DEFAULT_LENS_RADIUS = 0.085;

export const OBSERVATORY_PORTAL_QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({
    id: "high",
    // The Portal carries only low-frequency volumetric colour. Keeping it
    // below native resolution is intentional: backdrop and stars remain in
    // the main scene at full Canvas resolution.
    renderScale: 0.68,
    maxWidth: OBSERVATORY_PORTAL_TARGET_MAX_WIDTH,
    maxHeight: OBSERVATORY_PORTAL_TARGET_MAX_HEIGHT,
    parallaxScale: 0.26
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
  uniform float uEmissionStrength;
  uniform float uExtinctionStrength;
  uniform float uLensAmount;
  uniform vec2 uLensCenter;
  uniform float uLensAspect;
  uniform float uLensRadius;

  varying vec2 vUv;

  void main() {
    // The inactive branch is an exact UV passthrough and avoids lens math on
    // every Portal pixel during the ordinary observatory experience.
    vec2 portalUv = vUv;
    float lensOcclusion = 0.0;
    if (uLensAmount > 0.0) {
      vec2 lensMetric = (vUv - uLensCenter) * vec2(uLensAspect, 1.0);
      float rawLensDistance = length(lensMetric);
      float lensDistance = max(rawLensDistance, 0.002);
      float lensInfluence = 1.0 - smoothstep(
        uLensRadius,
        uLensRadius * 3.2,
        lensDistance
      );
      // This intentional counter-warp is stronger than the far field's
      // spherical deflection. Near dust shears in the opposing direction,
      // making the depth split readable on a flat display.
      float lensDeflection = uLensAmount
        * lensInfluence
        * 0.013
        / (lensDistance + 0.045);
      vec2 radialDirection = lensMetric / max(rawLensDistance, 0.00001);
      vec2 warpedMetric = lensMetric + radialDirection * lensDeflection;
      portalUv = uLensCenter + warpedMetric / vec2(uLensAspect, 1.0);
      lensOcclusion = 1.0 - smoothstep(
        uLensRadius * 0.12,
        uLensRadius * 0.58,
        lensDistance
      );
    }
    vec4 portalVolume = texture2D(
      uPortalTexture,
      clamp(portalUv, vec2(0.0), vec2(1.0))
    );
    portalVolume *= 1.0 - lensOcclusion * uLensAmount * 0.88;
    float reveal = clamp(uReveal, 0.0, 1.0);
    vec3 emission = portalVolume.rgb * uEmissionStrength * reveal;
    float extinction = clamp(
      portalVolume.a * uExtinctionStrength * reveal,
      0.0,
      0.72
    );
    // Custom premultiplied-style blending evaluates:
    // final = emission + existingSky * (1 - extinction).
    gl_FragColor = vec4(emission, extinction);
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

const portalLensProjectionScratch = new THREE.Vector3();

/**
 * Project a finite world-space lens into Portal UV space.
 *
 * A point behind the camera can still produce plausible-looking NDC values,
 * so callers must not use `Vector3.project()` alone. This helper rejects the
 * rear hemisphere, non-finite projections and points too far outside the
 * viewport to influence a visible Portal pixel.
 */
export function projectObservatoryPortalLens(
  camera,
  worldPosition,
  target = new THREE.Vector2(),
  viewportMargin = 0.45
) {
  target.set(0.5, 0.5);
  if (!camera?.isCamera || !worldPosition) return false;

  const worldX = Array.isArray(worldPosition) || ArrayBuffer.isView(worldPosition)
    ? worldPosition[0]
    : worldPosition.x;
  const worldY = Array.isArray(worldPosition) || ArrayBuffer.isView(worldPosition)
    ? worldPosition[1]
    : worldPosition.y;
  const worldZ = Array.isArray(worldPosition) || ArrayBuffer.isView(worldPosition)
    ? worldPosition[2]
    : worldPosition.z;
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || !Number.isFinite(worldZ)) {
    return false;
  }
  portalLensProjectionScratch.set(worldX, worldY, worldZ);

  camera.updateWorldMatrix?.(true, false);
  portalLensProjectionScratch.applyMatrix4(camera.matrixWorldInverse);
  const near = Number.isFinite(camera.near) ? Math.max(camera.near, 0.001) : 0.001;
  if (!Number.isFinite(portalLensProjectionScratch.z)
    || portalLensProjectionScratch.z >= -near) {
    return false;
  }

  portalLensProjectionScratch.set(worldX, worldY, worldZ).project(camera);
  const x = portalLensProjectionScratch.x * 0.5 + 0.5;
  const y = portalLensProjectionScratch.y * 0.5 + 0.5;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  target.set(x, y);

  const margin = THREE.MathUtils.clamp(
    Number.isFinite(viewportMargin) ? viewportMargin : 0.45,
    0,
    2
  );
  return x >= -margin && x <= 1 + margin && y >= -margin && y <= 1 + margin;
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
  emissionStrength = OBSERVATORY_PORTAL_DEFAULT_EMISSION_STRENGTH,
  extinctionStrength = OBSERVATORY_PORTAL_DEFAULT_EXTINCTION_STRENGTH,
  lensAmount = 0,
  lensCenter = [0.5, 0.5],
  lensAspect = 1,
  lensRadius = OBSERVATORY_PORTAL_DEFAULT_LENS_RADIUS,
  stencilRef = OBSERVATORY_PORTAL_STENCIL_REF
} = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPortalTexture: { value: texture },
      uReveal: {
        value: THREE.MathUtils.clamp(Number.isFinite(reveal) ? reveal : 0, 0, 1)
      },
      uEmissionStrength: {
        value: THREE.MathUtils.clamp(
          Number.isFinite(emissionStrength)
            ? emissionStrength
            : OBSERVATORY_PORTAL_DEFAULT_EMISSION_STRENGTH,
          0,
          2
        )
      },
      uExtinctionStrength: {
        value: THREE.MathUtils.clamp(
          Number.isFinite(extinctionStrength)
            ? extinctionStrength
            : OBSERVATORY_PORTAL_DEFAULT_EXTINCTION_STRENGTH,
          0,
          2
        )
      },
      uLensAmount: {
        value: THREE.MathUtils.clamp(
          Number.isFinite(lensAmount) ? lensAmount : 0,
          0,
          1
        )
      },
      uLensCenter: {
        value: new THREE.Vector2(
          Number.isFinite(lensCenter?.x)
            ? lensCenter.x
            : Number.isFinite(lensCenter?.[0]) ? lensCenter[0] : 0.5,
          Number.isFinite(lensCenter?.y)
            ? lensCenter.y
            : Number.isFinite(lensCenter?.[1]) ? lensCenter[1] : 0.5
        )
      },
      uLensAspect: {
        value: THREE.MathUtils.clamp(
          Number.isFinite(lensAspect) ? lensAspect : 1,
          0.25,
          4
        )
      },
      uLensRadius: {
        value: THREE.MathUtils.clamp(
          Number.isFinite(lensRadius)
            ? lensRadius
            : OBSERVATORY_PORTAL_DEFAULT_LENS_RADIUS,
          0.02,
          0.3
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
  // Gaia and hero stars use -920/-900. Draw after them so near dust can absorb
  // the fixed far field; ordinary room transparency (order 0) remains in front.
  composite.renderOrder = -880;
  composite.userData.observatoryDisposed = false;
  return composite;
}

export function updateObservatoryPortalComposite(
  compositeOrMaterial,
  {
    texture,
    reveal,
    emissionStrength,
    extinctionStrength,
    lensAmount,
    lensCenter,
    lensAspect,
    lensRadius
  } = {}
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
  if (emissionStrength !== undefined) {
    material.uniforms.uEmissionStrength.value = THREE.MathUtils.clamp(
      Number.isFinite(emissionStrength) ? emissionStrength : 0,
      0,
      2
    );
  }
  if (extinctionStrength !== undefined) {
    material.uniforms.uExtinctionStrength.value = THREE.MathUtils.clamp(
      Number.isFinite(extinctionStrength) ? extinctionStrength : 0,
      0,
      2
    );
  }
  if (lensAmount !== undefined) {
    material.uniforms.uLensAmount.value = THREE.MathUtils.clamp(
      Number.isFinite(lensAmount) ? lensAmount : 0,
      0,
      1
    );
  }
  if (lensCenter !== undefined) {
    material.uniforms.uLensCenter.value.set(
      Number.isFinite(lensCenter?.x)
        ? lensCenter.x
        : Number.isFinite(lensCenter?.[0]) ? lensCenter[0] : 0,
      Number.isFinite(lensCenter?.y)
        ? lensCenter.y
        : Number.isFinite(lensCenter?.[1]) ? lensCenter[1] : 0
    );
  }
  if (lensAspect !== undefined) {
    material.uniforms.uLensAspect.value = THREE.MathUtils.clamp(
      Number.isFinite(lensAspect) ? lensAspect : 1,
      0.25,
      4
    );
  }
  if (lensRadius !== undefined) {
    material.uniforms.uLensRadius.value = THREE.MathUtils.clamp(
      Number.isFinite(lensRadius) ? lensRadius : OBSERVATORY_PORTAL_DEFAULT_LENS_RADIUS,
      0.02,
      0.3
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
