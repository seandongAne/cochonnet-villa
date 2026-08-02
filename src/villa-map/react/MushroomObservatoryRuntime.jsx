import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  createObservatoryAdaptationState,
  stepObservatoryAdaptation
} from "../observatory-adaptation.js";
import {
  createObservatoryQualityState,
  evaluateObservatoryStencilSupport,
  getObservatoryQualityPreset,
  stepObservatoryQuality
} from "../observatory-quality.js";
import {
  createObservatoryPortal,
  disposeObservatoryPortal,
  resizeObservatoryPortal,
  updateObservatoryPortalCamera,
  updateObservatoryPortalComposite
} from "../observatory-portal.js";
import {
  createMushroomNebula,
  disposeMushroomNebula,
  MUSHROOM_NEBULA_MATERIAL_NAME,
  setMushroomNebulaQuality,
  updateMushroomNebula
} from "../mushroom-nebula.js";
import {
  createGaiaStarPoints,
  disposeGaiaStarPoints,
  GAIA_STAR_CATALOG_URL,
  setGaiaStarPixelRatio,
  setGaiaStarReveal
} from "../gaia-stars.js";
import {
  createMushroomSkyAperture,
  disposeMushroomSky,
  isMushroomObservatorySkyPosition,
  MUSHROOM_SKY_BACKDROP_NAME,
  MUSHROOM_SKY_IMAGE_BRIGHTNESS,
  removeMushroomSkyAperture,
  setMushroomSkyPixelRatio,
  updateMushroomSky
} from "../mushroom-sky.js";
import {
  MUSHROOM_STAR_DOME_NAME,
  MUSHROOM_STAR_TEXTURE_URL
} from "../mushroom-interior.js";
import { MUSHROOM_INTERIOR } from "../world.js";

const CLOSED_CEILING_COLOR = new THREE.Color("#010208");
const GAIA_RENDER_ORDER = -920;
const PORTAL_ORIGIN = new THREE.Vector3(
  MUSHROOM_INTERIOR.center.x,
  MUSHROOM_INTERIOR.eyeY[2],
  MUSHROOM_INTERIOR.center.z
);
const COSMOS_ORIGIN = new THREE.Vector3(0, 0, 0);
const PORTAL_REVEAL_EPSILON = 0.001;
// Additive volumetric light is deliberately a supporting layer. At full
// scotopic adaptation it should tint and deepen the Milky Way, never turn the
// entire aperture into a luminous lavender screen.
const NEBULA_COMPOSITE_INTENSITY = 0.12;
const OBSERVATORY_SHADER_FAILURE_KINDS = new Map([
  [MUSHROOM_NEBULA_MATERIAL_NAME, "portal"],
  ["mushroom-observatory-portal-composite-material", "portal"],
  ["mushroom-distant-sky-material", "native-sky"],
  ["mushroom-twinkling-star-material", "native-sky"],
  ["mushroom-gaia-star-material", "gaia"]
]);

function isInsideMushroomPocket(position) {
  const dx = position.x - MUSHROOM_INTERIOR.center.x;
  const dz = position.z - MUSHROOM_INTERIOR.center.z;
  return position.y < -20 && Math.hypot(dx, dz) < 15;
}

function isNearObservatoryPrewarmPosition(position) {
  return isInsideMushroomPocket(position)
    && position.y >= MUSHROOM_INTERIOR.eyeY[1] - 2
    && position.y <= MUSHROOM_INTERIOR.eyeY[2] + 5;
}

function gaiaLodForQuality(quality) {
  if (quality === "high") return "high";
  if (quality === "medium") return "medium";
  if (quality === "low") return "low";
  return null;
}

function configureGaiaStencil(points) {
  const material = points?.material;
  if (!material) return;
  material.stencilWrite = true;
  material.stencilRef = 7;
  material.stencilFunc = THREE.EqualStencilFunc;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.KeepStencilOp;
  material.needsUpdate = true;
  points.renderOrder = GAIA_RENDER_ORDER;
}

function detectHalfFloatPortal(gl) {
  if (!gl.capabilities.isWebGL2) return false;
  // Half-float must be both renderable and linearly filterable. Falling back
  // to RGBA8 is visually harmless for this intentionally subtle layer.
  return Boolean(
    gl.extensions.get("EXT_color_buffer_float")
      && gl.extensions.get("OES_texture_float_linear")
  );
}

function detectStencilBuffer(gl) {
  const context = gl.getContext();
  const attributes = context.getContextAttributes?.();
  let stencilBits = 0;
  try {
    stencilBits = context.getParameter(context.STENCIL_BITS);
  } catch {
    stencilBits = 0;
  }
  return evaluateObservatoryStencilSupport({
    requestedStencil: attributes?.stencil === true,
    stencilBits
  });
}

function findObservatoryShaderFailure(gl, ignoredMaterialNames = new Set()) {
  const failedProgram = gl.info.programs?.find((program) => (
    OBSERVATORY_SHADER_FAILURE_KINDS.has(program.name)
      && !ignoredMaterialNames.has(program.name)
      && program.diagnostics?.runnable === false
  ));
  if (!failedProgram) return null;
  const error = new Error(
    `Observatory shader failed to link (${failedProgram.name})`
  );
  error.observatoryShaderFailure = OBSERVATORY_SHADER_FAILURE_KINDS.get(
    failedProgram.name
  );
  error.observatoryMaterialName = failedProgram.name;
  return error;
}

function detectRuntimeCapabilities(gl, reducedMotion, stencil = detectStencilBuffer(gl)) {
  return {
    webgl2: gl.capabilities.isWebGL2,
    halfFloat: detectHalfFloatPortal(gl),
    stencil,
    cpuCores: navigator.hardwareConcurrency,
    deviceMemoryGb: navigator.deviceMemory,
    dpr: gl.getPixelRatio(),
    reducedMotion
  };
}

// Browser-only bridge for the Impossible Observatory. The 4K panorama, Gaia
// catalogue and hero stars remain native-resolution main-scene layers. Only
// the low-frequency volumetric nebula enters the bounded offscreen Portal.
export function MushroomObservatoryRuntime({
  interior,
  sky,
  lightsOn,
  adaptationRef
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const getState = useThree((state) => state.get);
  const resourcesRef = useRef(null);
  const qualityRef = useRef(null);
  const startGaiaLoadRef = useRef(null);
  const applyQualityRef = useRef(null);
  const handlePortalFailureRef = useRef(null);
  const prewarmNativeRef = useRef(null);
  const handleShaderFailureRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    let loadedTexture = null;
    let textureIdleHandle = null;
    let textureIdleUsesRequest = false;
    const lifecycleToken = {};
    const abortController = new AbortController();
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const search = new URLSearchParams(window.location.search);
    const diagnosticsMode = ["test", "perf"].includes(search.get("observatory"));
    const motionOverride = diagnosticsMode ? search.get("motion") : null;
    const requestedQuality = diagnosticsMode ? search.get("quality") : null;
    const qualityOverride = ["high", "medium", "low", "minimum"].includes(
      requestedQuality
    )
      ? requestedQuality
      : null;
    const readReducedMotion = () => (
      motionOverride === "full"
        ? false
        : motionOverride === "reduce"
          ? true
          : motionQuery?.matches === true
    );
    const stencilSupported = detectStencilBuffer(gl);
    const resources = {
      reducedMotion: readReducedMotion(),
      requestedQuality: qualityOverride,
      qualityLocked: qualityOverride && stencilSupported ? qualityOverride : null,
      stencilSupported,
      contextLost: false,
      contextLossCount: 0,
      contextRestoreCount: 0,
      skipNextPerformanceSample: false,
      halfFloatSupported: detectHalfFloatPortal(gl),
      portalScene: new THREE.Scene(),
      portal: null,
      nebula: null,
      gaia: null,
      gaiaBinary: null,
      gaiaLoadStarted: false,
      gaiaError: null,
      gaiaShaderError: null,
      gaiaFetchStartedAt: 0,
      gaiaFetchMs: 0,
      gaiaBuildMs: 0,
      portalError: null,
      portalFrames: 0,
      portalPrewarmed: false,
      portalLoadRequested: false,
      portalPrewarmStartedAt: 0,
      portalPrewarmMs: 0,
      portalRenderedThisFrame: false,
      framebufferChecked: false,
      forceUnsignedByte: false,
      qualityApplied: null,
      lastTargetKey: "",
      aperture: null,
      dome: null,
      domeWasVisible: true,
      domeFallbackColor: null,
      textureReady: false,
      textureError: false,
      textureGpuReady: false,
      textureUploadMs: 0,
      nativeSkyPrewarmed: false,
      compositePrewarmed: false,
      gaiaPrewarmed: false,
      nativePrewarmMs: 0,
      nativeSkyError: null,
      skyDisabled: false,
      gaiaDisabled: false,
      handledShaderFailures: new Set(),
      nativePrewarmTarget: null
    };
    resources.portalScene.background = new THREE.Color("#000000");
    resourcesRef.current = resources;
    sky.userData.lifecycleToken = lifecycleToken;

    const cancelTexturePreupload = () => {
      if (textureIdleHandle === null) return;
      if (textureIdleUsesRequest) {
        window.cancelIdleCallback?.(textureIdleHandle);
      } else {
        window.clearTimeout(textureIdleHandle);
      }
      textureIdleHandle = null;
    };

    const preuploadSkyTexture = (texture) => {
      textureIdleHandle = null;
      if (!mounted || resources.contextLost || !texture?.isTexture) return;
      const startedAt = performance.now();
      try {
        gl.initTexture(texture);
        resources.textureGpuReady = true;
        resources.textureUploadMs += performance.now() - startedAt;
      } catch {
        resources.textureError = true;
        if (texture !== fallbackTexture) {
          if (backdropMaterial?.uniforms?.uSkyTexture) {
            backdropMaterial.uniforms.uSkyTexture.value = fallbackTexture;
          }
          if (loadedTexture === texture) loadedTexture = null;
          texture.dispose();
          if (fallbackTexture?.isTexture) preuploadSkyTexture(fallbackTexture);
        }
      }
    };

    const scheduleTexturePreupload = (texture) => {
      cancelTexturePreupload();
      resources.textureGpuReady = false;
      if (typeof window.requestIdleCallback === "function") {
        textureIdleUsesRequest = true;
        textureIdleHandle = window.requestIdleCallback(
          () => preuploadSkyTexture(texture),
          { timeout: 2000 }
        );
      } else {
        textureIdleUsesRequest = false;
        textureIdleHandle = window.setTimeout(
          () => preuploadSkyTexture(texture),
          0
        );
      }
    };

    const syncMotionPreference = () => {
      resources.reducedMotion = readReducedMotion();
    };
    motionQuery?.addEventListener?.("change", syncMotionPreference);

    const dome = interior.getObjectByName(MUSHROOM_STAR_DOME_NAME);
    const backdrop = sky.getObjectByName(MUSHROOM_SKY_BACKDROP_NAME);
    const backdropMaterial = backdrop?.material;
    const fallbackTexture = backdropMaterial?.uniforms?.uSkyTexture?.value ?? null;

    if (dome?.isMesh && backdropMaterial?.isShaderMaterial) {
      resources.dome = dome;
      resources.domeWasVisible = dome.visible;
      resources.domeFallbackColor = dome.material?.color?.clone?.() ?? null;
      resources.aperture = stencilSupported
        ? createMushroomSkyAperture(dome)
        : null;
      setMushroomSkyPixelRatio(sky, gl.getPixelRatio());

      const loader = new THREE.TextureLoader();
      loader.load(
        MUSHROOM_STAR_TEXTURE_URL,
        (texture) => {
          if (!mounted) {
            texture.dispose();
            return;
          }
          texture.name = "qwantani-night-puresky-dome-4k";
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.generateMipmaps = false;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.anisotropy = Math.max(
            1,
            Math.min(8, gl.capabilities.getMaxAnisotropy())
          );
          loadedTexture = texture;
          backdropMaterial.uniforms.uSkyTexture.value = texture;
          backdropMaterial.uniforms.uBrightness.value = MUSHROOM_SKY_IMAGE_BRIGHTNESS;
          resources.textureReady = true;
          sky.userData.textureReady = true;
          scheduleTexturePreupload(texture);
        },
        undefined,
        () => {
          resources.textureError = true;
          // Keep the procedural fallback and hero stars available even when
          // the 4K photograph cannot be decoded.
          resources.textureReady = true;
          sky.userData.textureReady = true;
          scheduleTexturePreupload(fallbackTexture);
        }
      );
    }

    function disposePortalResources() {
      if (resources.nebula) {
        disposeMushroomNebula(resources.nebula);
        resources.nebula = null;
      }
      if (resources.portal) {
        disposeObservatoryPortal(resources.portal);
        resources.portal = null;
      }
      resources.portalScene.clear();
      resources.portalScene.background = new THREE.Color("#000000");
      resources.portalPrewarmed = false;
      resources.compositePrewarmed = false;
      resources.portalRenderedThisFrame = false;
      resources.framebufferChecked = false;
      resources.lastTargetKey = "";
    }

    function createPortalResources(preset) {
      const state = getState();
      const type = resources.halfFloatSupported && !resources.forceUnsignedByte
        ? THREE.HalfFloatType
        : THREE.UnsignedByteType;
      resources.portal = createObservatoryPortal({
        sourceCamera: state.camera,
        portalOrigin: PORTAL_ORIGIN,
        cosmosOrigin: COSMOS_ORIGIN,
        width: state.size.width,
        height: state.size.height,
        pixelRatio: gl.getPixelRatio(),
        quality: preset.portalQuality,
        type
      });
      resources.nebula = createMushroomNebula({
        quality: preset.nebulaQuality,
        reveal: 1,
        resolution: [
          resources.portal.renderTarget.width,
          resources.portal.renderTarget.height
        ]
      });
      resources.portalScene.add(resources.nebula);
      resources.portal.composite.visible = false;
      resources.compositePrewarmed = false;
      scene.add(resources.portal.composite);
    }

    function getNativePrewarmTarget() {
      if (resources.nativePrewarmTarget) return resources.nativePrewarmTarget;
      resources.nativePrewarmTarget = new THREE.WebGLRenderTarget(1, 1, {
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        type: THREE.UnsignedByteType
      });
      resources.nativePrewarmTarget.texture.name =
        "mushroom-observatory-native-prewarm-target";
      resources.nativePrewarmTarget.texture.colorSpace = THREE.NoColorSpace;
      return resources.nativePrewarmTarget;
    }

    function createWarmupProxy(source) {
      let proxy = null;
      if (source?.isPoints) {
        proxy = new THREE.Points(source.geometry, source.material);
      } else if (source?.isMesh) {
        proxy = new THREE.Mesh(source.geometry, source.material);
      }
      if (!proxy) return null;
      proxy.frustumCulled = false;
      proxy.renderOrder = source.renderOrder;
      return proxy;
    }

    function renderWarmupObjects(sources) {
      const warmupScene = new THREE.Scene();
      for (const source of sources) {
        const proxy = createWarmupProxy(source);
        if (proxy) warmupScene.add(proxy);
      }
      if (warmupScene.children.length === 0) return;
      const previousTarget = gl.getRenderTarget();
      const previousXrEnabled = gl.xr.enabled;
      try {
        gl.xr.enabled = false;
        // Three includes the active framebuffer's output colour space in the
        // program cache key. Compile once with the default framebuffer active
        // so the real Canvas variant is ready before the first reveal.
        gl.setRenderTarget(null);
        gl.compile(warmupScene, camera, scene);

        // The tiny offscreen draw additionally uploads geometry/uniform state
        // without exposing any celestial pixels while the room lights are on.
        gl.setRenderTarget(getNativePrewarmTarget());
        gl.render(warmupScene, camera);
      } finally {
        gl.setRenderTarget(previousTarget);
        gl.xr.enabled = previousXrEnabled;
        warmupScene.clear();
      }
    }

    function replaceGaia(quality) {
      const lod = gaiaLodForQuality(quality);
      if (resources.gaia) {
        disposeGaiaStarPoints(resources.gaia);
        resources.gaia = null;
      }
      if (
        !lod
        || !resources.gaiaBinary
        || !mounted
        || !resources.stencilSupported
        || resources.contextLost
        || resources.gaiaDisabled
      ) return;
      try {
        const buildStartedAt = performance.now();
        resources.gaia = createGaiaStarPoints(resources.gaiaBinary, {
          lod,
          pixelRatio: gl.getPixelRatio(),
          reveal: 0
        });
        configureGaiaStencil(resources.gaia);
        resources.gaia.visible = false;
        resources.gaiaPrewarmed = false;
        scene.add(resources.gaia);
        resources.gaiaBuildMs = performance.now() - buildStartedAt;
      } catch (error) {
        resources.gaiaError = error instanceof Error ? error.message : String(error);
      }
    }

    function handlePortalFailure(error, { forceLow = false } = {}) {
      resources.portalError = error instanceof Error ? error.message : String(error);
      const failedTargetWasHalfFloat = resources.portal?.renderTarget?.texture?.type
        === THREE.HalfFloatType;
      if (failedTargetWasHalfFloat && !resources.forceUnsignedByte && !forceLow) {
        resources.forceUnsignedByte = true;
        disposePortalResources();
        resources.qualityApplied = null;
        applyQuality(qualityRef.current?.quality ?? "medium");
        return;
      }

      disposePortalResources();
      resources.qualityLocked = null;
      qualityRef.current = createObservatoryQualityState({
        capabilities: detectRuntimeCapabilities(
          gl,
          resources.reducedMotion,
          resources.stencilSupported
        ),
        initialQuality: "low",
        maximumQuality: "low"
      });
      resources.qualityApplied = null;
      applyQuality("low");
    }
    handlePortalFailureRef.current = handlePortalFailure;

    function handleShaderFailure(error) {
      const materialName = error?.observatoryMaterialName;
      if (materialName) resources.handledShaderFailures.add(materialName);
      const message = error instanceof Error ? error.message : String(error);
      if (error?.observatoryShaderFailure === "gaia") {
        resources.gaiaDisabled = true;
        resources.gaiaShaderError = message;
        resources.gaiaPrewarmed = false;
        if (resources.gaia) {
          disposeGaiaStarPoints(resources.gaia);
          resources.gaia = null;
        }
        return;
      }
      if (error?.observatoryShaderFailure === "native-sky") {
        resources.skyDisabled = true;
        resources.nativeSkyError = message;
        resources.nativeSkyPrewarmed = false;
        sky.visible = false;
        if (resources.aperture) resources.aperture.visible = false;
        if (resources.gaia) resources.gaia.visible = false;
        if (resources.portal) resources.portal.composite.visible = false;
        disposePortalResources();
        if (resources.gaia) {
          disposeGaiaStarPoints(resources.gaia);
          resources.gaia = null;
        }
        return;
      }
      handlePortalFailure(error, { forceLow: true });
    }
    handleShaderFailureRef.current = handleShaderFailure;

    function applyQuality(quality) {
      const preset = getObservatoryQualityPreset(quality);
      try {
        if (
          preset.volumetricFbo
          && resources.portalLoadRequested
          && resources.stencilSupported
          && !resources.contextLost
        ) {
          if (!resources.portal) {
            createPortalResources(preset);
          } else {
            setMushroomNebulaQuality(resources.nebula, preset.nebulaQuality);
          }
        } else if (!preset.volumetricFbo || !resources.stencilSupported) {
          disposePortalResources();
        }
      } catch (error) {
        handlePortalFailure(error, { forceLow: true });
        return;
      }
      if (resources.gaiaBinary) replaceGaia(quality);
      resources.qualityApplied = quality;
    }
    applyQualityRef.current = applyQuality;

    function prewarmNativeResources() {
      if (
        resources.contextLost
        || !resources.stencilSupported
        || resources.skyDisabled
      ) return;
      let didWork = false;
      const prewarmLayer = (kind, materialName, sources, onSuccess) => {
        didWork = true;
        try {
          renderWarmupObjects(sources);
          onSuccess();
        } catch (error) {
          const typedError = error instanceof Error
            ? error
            : new Error(String(error));
          typedError.observatoryShaderFailure = kind;
          typedError.observatoryMaterialName = materialName;
          handleShaderFailure(typedError);
        }
      };
      if (
        !resources.nativeSkyPrewarmed
        && resources.textureReady
        && !resources.textureGpuReady
      ) {
        cancelTexturePreupload();
        preuploadSkyTexture(
          backdropMaterial?.uniforms?.uSkyTexture?.value ?? fallbackTexture
        );
      }
      const startedAt = performance.now();
      if (!resources.nativeSkyPrewarmed && resources.textureReady) {
        prewarmLayer(
          "native-sky",
          "mushroom-distant-sky-material",
          [
            sky.userData.backdrop,
            sky.userData.stars,
            resources.aperture
          ],
          () => { resources.nativeSkyPrewarmed = true; }
        );
      }
      if (resources.portal && !resources.compositePrewarmed) {
        prewarmLayer(
          "portal",
          "mushroom-observatory-portal-composite-material",
          [resources.portal.composite],
          () => { resources.compositePrewarmed = true; }
        );
      }
      if (resources.gaia && !resources.gaiaPrewarmed) {
        prewarmLayer(
          "gaia",
          "mushroom-gaia-star-material",
          [resources.gaia],
          () => { resources.gaiaPrewarmed = true; }
        );
      }
      if (didWork) {
        resources.nativePrewarmMs += performance.now() - startedAt;
      }
      const shaderFailure = findObservatoryShaderFailure(
        gl,
        resources.handledShaderFailures
      );
      if (shaderFailure) handleShaderFailure(shaderFailure);
    }
    prewarmNativeRef.current = prewarmNativeResources;

    startGaiaLoadRef.current = async () => {
      if (resources.gaiaLoadStarted || !mounted) return;
      resources.gaiaLoadStarted = true;
      resources.gaiaFetchStartedAt = performance.now();
      try {
        const response = await fetch(GAIA_STAR_CATALOG_URL, {
          signal: abortController.signal
        });
        if (!response.ok) {
          throw new Error(`Gaia catalogue request failed (${response.status})`);
        }
        const binary = await response.arrayBuffer();
        if (!mounted) return;
        resources.gaiaFetchMs = performance.now() - resources.gaiaFetchStartedAt;
        resources.gaiaBinary = binary;
        replaceGaia(qualityRef.current?.quality ?? "medium");
      } catch (error) {
        if (error?.name !== "AbortError") {
          resources.gaiaError = error instanceof Error ? error.message : String(error);
        }
      }
    };

    qualityRef.current = createObservatoryQualityState({
      capabilities: detectRuntimeCapabilities(
        gl,
        resources.reducedMotion,
        resources.stencilSupported
      ),
      ...(qualityOverride && resources.stencilSupported
        ? { initialQuality: qualityOverride, maximumQuality: qualityOverride }
        : {})
    });
    adaptationRef.current = createObservatoryAdaptationState({
      lightsOn,
      inLoft: isMushroomObservatorySkyPosition(camera.position),
      reducedMotion: resources.reducedMotion
    });
    applyQuality(qualityRef.current.quality);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resources.skipNextPerformanceSample = true;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleContextLost = (event) => {
      event.preventDefault();
      resources.contextLost = true;
      resources.contextLossCount += 1;
      resources.portalError = "WebGL context lost";
      sky.visible = false;
      if (resources.aperture) resources.aperture.visible = false;
      if (resources.gaia) resources.gaia.visible = false;
      if (resources.portal) resources.portal.composite.visible = false;
      if (resources.dome) resources.dome.visible = resources.domeWasVisible;
    };
    const handleContextRestored = () => {
      resources.contextRestoreCount += 1;
      queueMicrotask(() => {
        if (!mounted) return;
        resources.contextLost = false;
        resources.stencilSupported = detectStencilBuffer(gl);
        resources.halfFloatSupported = detectHalfFloatPortal(gl);
        resources.qualityLocked = qualityOverride && resources.stencilSupported
          ? qualityOverride
          : null;
        resources.skipNextPerformanceSample = true;
        resources.handledShaderFailures.clear();
        resources.skyDisabled = false;
        resources.gaiaDisabled = false;
        resources.nativeSkyError = null;
        resources.gaiaShaderError = null;
        resources.nativeSkyPrewarmed = false;
        resources.gaiaPrewarmed = false;
        resources.nativePrewarmMs = 0;
        resources.textureUploadMs = 0;
        resources.portalRenderedThisFrame = false;
        scheduleTexturePreupload(
          backdropMaterial?.uniforms?.uSkyTexture?.value ?? fallbackTexture
        );
        if (resources.stencilSupported && !resources.aperture && resources.dome) {
          resources.aperture = createMushroomSkyAperture(resources.dome);
        } else if (!resources.stencilSupported && resources.aperture) {
          removeMushroomSkyAperture(resources.aperture);
          resources.aperture = null;
        }
        resources.forceUnsignedByte = false;
        disposePortalResources();
        if (resources.gaia) {
          disposeGaiaStarPoints(resources.gaia);
          resources.gaia = null;
        }
        qualityRef.current = createObservatoryQualityState({
          capabilities: detectRuntimeCapabilities(
            gl,
            resources.reducedMotion,
            resources.stencilSupported
          ),
          ...(qualityOverride && resources.stencilSupported
            ? { initialQuality: qualityOverride, maximumQuality: qualityOverride }
            : {})
        });
        resources.qualityApplied = null;
        applyQuality(qualityRef.current.quality);
        resources.portalError = null;
      });
    };
    gl.domElement.addEventListener("webglcontextlost", handleContextLost);
    gl.domElement.addEventListener("webglcontextrestored", handleContextRestored);

    const runtimeSnapshot = () => {
      const quality = qualityRef.current;
      const adaptation = adaptationRef.current;
      const target = resources.portal?.renderTarget;
      return {
        active: adaptation?.inLoft === true,
        quality: quality?.quality ?? "minimum",
        maximumQuality: quality?.maximumQuality ?? "minimum",
        lockedQuality: resources.qualityLocked,
        requestedQuality: resources.requestedQuality,
        p95Ms: quality?.p95Ms ?? 0,
        adaptation: adaptation
          ? {
              mode: adaptation.mode,
              phaseElapsedSeconds: adaptation.phaseElapsedSeconds,
              channels: adaptation.channels,
              reducedMotion: adaptation.reducedMotion
            }
          : null,
        portal: {
          enabled: Boolean(resources.portal),
          type: !target
            ? "disabled"
            : target.texture.type === THREE.HalfFloatType
              ? "half-float"
              : "rgba8",
          width: target?.width ?? 0,
          height: target?.height ?? 0,
          estimatedTargetBytes: target
            ? target.width * target.height * (
                target.texture.type === THREE.HalfFloatType ? 8 : 4
              )
            : 0,
          addedDrawCalls: (resources.portalRenderedThisFrame ? 1 : 0)
            + (resources.portal?.composite.visible ? 1 : 0),
          fboPassActive: resources.portalRenderedThisFrame,
          compositeActive: resources.portal?.composite.visible === true,
          frames: resources.portalFrames,
          prewarmed: resources.portalPrewarmed,
          prewarmMs: resources.portalPrewarmMs,
          error: resources.portalError
        },
        gaia: {
          loading: resources.gaiaLoadStarted && !resources.gaiaBinary && !resources.gaiaError,
          ready: Boolean(resources.gaia),
          count: resources.gaia?.userData?.count ?? 0,
          lod: resources.gaia?.userData?.lod ?? null,
          addedDrawCalls: resources.gaia?.visible ? 1 : 0,
          fetchMs: resources.gaiaFetchMs,
          buildMs: resources.gaiaBuildMs,
          prewarmed: resources.gaiaPrewarmed,
          error: resources.gaiaError ?? resources.gaiaShaderError
        },
        nativeSky: {
          prewarmed: resources.nativeSkyPrewarmed,
          compositePrewarmed: resources.compositePrewarmed,
          prewarmMs: resources.nativePrewarmMs,
          textureGpuReady: resources.textureGpuReady,
          textureUploadMs: resources.textureUploadMs,
          addedDrawCalls: (sky.visible ? 2 : 0)
            + (resources.aperture?.visible ? 1 : 0),
          error: resources.nativeSkyError
        },
        backdrop4k: {
          ready: resources.textureReady,
          error: resources.textureError
        },
        capabilities: {
          stencil: resources.stencilSupported,
          halfFloat: resources.halfFloatSupported,
          contextLost: resources.contextLost,
          contextLossCount: resources.contextLossCount,
          contextRestoreCount: resources.contextRestoreCount
        }
      };
    };
    window.__villaObservatoryRuntimeSnapshot = runtimeSnapshot;

    return () => {
      mounted = false;
      cancelTexturePreupload();
      abortController.abort();
      motionQuery?.removeEventListener?.("change", syncMotionPreference);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      gl.domElement.removeEventListener("webglcontextlost", handleContextLost);
      gl.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
      startGaiaLoadRef.current = null;
      applyQualityRef.current = null;
      handlePortalFailureRef.current = null;
      prewarmNativeRef.current = null;
      handleShaderFailureRef.current = null;
      if (window.__villaObservatoryRuntimeSnapshot === runtimeSnapshot) {
        delete window.__villaObservatoryRuntimeSnapshot;
      }
      disposePortalResources();
      if (resources.gaia) {
        disposeGaiaStarPoints(resources.gaia);
        resources.gaia = null;
      }
      resources.nativePrewarmTarget?.dispose();
      resources.nativePrewarmTarget = null;
      sky.userData.textureReady = false;
      sky.visible = false;
      if (resources.dome) {
        resources.dome.visible = resources.domeWasVisible;
        if (resources.domeFallbackColor && resources.dome.material?.color) {
          resources.dome.material.color.copy(resources.domeFallbackColor);
        }
      }
      removeMushroomSkyAperture(resources.aperture);
      if (backdropMaterial?.uniforms?.uSkyTexture?.value === loadedTexture) {
        backdropMaterial.uniforms.uSkyTexture.value = fallbackTexture;
      }
      loadedTexture?.dispose();
      resourcesRef.current = null;
      queueMicrotask(() => {
        if (sky.userData.lifecycleToken === lifecycleToken) {
          disposeMushroomSky(sky);
        }
      });
    };
    // `lightsOn` is intentionally consumed by the frame director, not this
    // resource-lifecycle effect. Toggling the physical switch must never tear
    // down and rebuild the FBO, 4K texture or Gaia buffers.
  }, [adaptationRef, camera, getState, gl, interior, scene, sky]);

  useFrame((_, delta) => {
    const resources = resourcesRef.current;
    if (!resources) return;
    resources.portalRenderedThisFrame = false;
    const frameDelta = Math.min(Math.max(delta || 0, 0), 0.1);
    const inLoft = isMushroomObservatorySkyPosition(camera.position);
    adaptationRef.current = stepObservatoryAdaptation(adaptationRef.current, {
      deltaSeconds: frameDelta,
      lightsOn,
      inLoft,
      reducedMotion: resources.reducedMotion
    });
    const adaptation = adaptationRef.current;
    const channels = adaptation.channels;
    const nearObservatory = isNearObservatoryPrewarmPosition(camera.position);

    const visiblePage = typeof document === "undefined"
      || document.visibilityState === "visible";
    const skipPerformanceSample = resources.skipNextPerformanceSample;
    resources.skipNextPerformanceSample = false;
    if (!resources.qualityLocked) {
      qualityRef.current = stepObservatoryQuality(qualityRef.current, {
        // Hidden-tab recovery is skipped explicitly above. Real sustained
        // long frames remain evidence and are capped only to prevent a single
        // debugger pause from poisoning the rolling window.
        frameTimeMs: visiblePage && !skipPerformanceSample && delta > 0
          ? Math.min(delta * 1000, 250)
          : undefined,
        deltaSeconds: Math.min(Math.max(delta || 0, 0), 0.25),
        active: inLoft && !lightsOn && visiblePage
      });
    }
    if (resources.qualityApplied !== qualityRef.current.quality) {
      applyQualityRef.current?.(qualityRef.current.quality);
    }

    if (
      nearObservatory
      && resources.stencilSupported
      && qualityRef.current?.maximumQuality !== "minimum"
    ) {
      startGaiaLoadRef.current?.();
      if (
        qualityRef.current.preset.volumetricFbo
        && !resources.portalLoadRequested
      ) {
        resources.portalLoadRequested = true;
        resources.portalPrewarmStartedAt = performance.now();
        applyQualityRef.current?.(qualityRef.current.quality);
      }
    }

    if (nearObservatory) prewarmNativeRef.current?.();
    const shaderFailure = findObservatoryShaderFailure(
      gl,
      resources.handledShaderFailures
    );
    if (shaderFailure) handleShaderFailureRef.current?.(shaderFailure);

    if (
      !resources.stencilSupported
      || resources.contextLost
      || resources.skyDisabled
    ) {
      sky.visible = false;
      if (resources.aperture) resources.aperture.visible = false;
      if (resources.gaia) resources.gaia.visible = false;
      if (resources.portal) resources.portal.composite.visible = false;
      if (resources.dome) {
        resources.dome.visible = resources.domeWasVisible;
        if (resources.domeFallbackColor && resources.dome.material?.color) {
          resources.dome.material.color.copy(CLOSED_CEILING_COLOR).lerp(
            resources.domeFallbackColor,
            channels.roomDarkness
          );
        }
      }
      return;
    }

    setMushroomSkyPixelRatio(sky, gl.getPixelRatio());
    const forceActive = Boolean(resources.gaia || resources.portal);
    const celestialVisible = Math.max(
      channels.portalReveal,
      channels.brightStarReveal,
      channels.faintStarReveal,
      channels.nebulaReveal
    ) > PORTAL_REVEAL_EPSILON;
    const skyIsActive = updateMushroomSky(sky, camera.position, frameDelta, {
      reducedMotion: adaptation.celestialMotionScale === 0,
      aperture: resources.aperture,
      backdropReveal: channels.portalReveal,
      starReveal: channels.brightStarReveal,
      forceActive,
      activeEnabled: celestialVisible
    });

    if (resources.dome) {
      resources.dome.visible = skyIsActive ? false : resources.domeWasVisible;
      if (resources.domeFallbackColor && resources.dome.material?.color) {
        resources.dome.material.color.copy(CLOSED_CEILING_COLOR).lerp(
          resources.domeFallbackColor,
          channels.roomDarkness
        );
      }
    }

    if (resources.gaia) {
      resources.gaia.position.copy(camera.position);
      resources.gaia.visible = skyIsActive && channels.faintStarReveal > 0.001;
      setGaiaStarPixelRatio(resources.gaia, gl.getPixelRatio());
      setGaiaStarReveal(resources.gaia, channels.faintStarReveal);
    }

    const portal = resources.portal;
    if (!portal || !resources.nebula) return;

    const state = getState();
    const targetKey = [
      Math.round(state.size.width),
      Math.round(state.size.height),
      gl.getPixelRatio().toFixed(2),
      qualityRef.current.quality
    ].join(":");
    if (targetKey !== resources.lastTargetKey) {
      resizeObservatoryPortal(portal, {
        width: state.size.width,
        height: state.size.height,
        pixelRatio: gl.getPixelRatio(),
        quality: qualityRef.current.preset.portalQuality
      });
      resources.lastTargetKey = targetKey;
      resources.framebufferChecked = false;
      resources.portalPrewarmed = false;
      resources.portalPrewarmStartedAt = performance.now();
      portal.composite.visible = false;
    }

    updateObservatoryPortalComposite(portal.composite, {
      reveal: channels.nebulaReveal * NEBULA_COMPOSITE_INTENSITY
    });
    portal.composite.visible = skyIsActive
      && channels.nebulaReveal > PORTAL_REVEAL_EPSILON;

    const shouldPrewarm = nearObservatory && !resources.portalPrewarmed;
    const shouldAnimate = inLoft
      && channels.nebulaReveal > PORTAL_REVEAL_EPSILON;
    if (!shouldPrewarm && !shouldAnimate) return;

    updateObservatoryPortalCamera(camera, portal.camera, {
      portalOrigin: PORTAL_ORIGIN,
      cosmosOrigin: COSMOS_ORIGIN,
      parallaxScale: portal.parallaxScale
    });
    const parallax = portal.camera.userData.observatoryParallaxOffset;
    updateMushroomNebula(resources.nebula, frameDelta, {
      reveal: 1,
      parallax,
      resolution: [portal.renderTarget.width, portal.renderTarget.height],
      camera: portal.camera,
      reducedMotion: adaptation.celestialMotionScale === 0
    });

    const previousTarget = gl.getRenderTarget();
    const previousXrEnabled = gl.xr.enabled;
    try {
      gl.xr.enabled = false;
      gl.setRenderTarget(portal.renderTarget);
      if (!resources.framebufferChecked) {
        const context = gl.getContext();
        const status = context.checkFramebufferStatus(context.FRAMEBUFFER);
        if (status !== context.FRAMEBUFFER_COMPLETE) {
          throw new Error(`Portal framebuffer incomplete (${status})`);
        }
        resources.framebufferChecked = true;
      }
      gl.render(resources.portalScene, portal.camera);
      const portalShaderFailure = findObservatoryShaderFailure(
        gl,
        resources.handledShaderFailures
      );
      if (portalShaderFailure) throw portalShaderFailure;
      resources.portalFrames += 1;
      resources.portalRenderedThisFrame = true;
      if (!resources.portalPrewarmed && resources.portalPrewarmStartedAt > 0) {
        resources.portalPrewarmMs = performance.now()
          - resources.portalPrewarmStartedAt;
      }
      resources.portalPrewarmed = true;
      resources.portalError = null;
    } catch (error) {
      if (!resources.contextLost) {
        if (error?.observatoryShaderFailure) {
          handleShaderFailureRef.current?.(error);
        } else {
          handlePortalFailureRef.current?.(error);
        }
      }
    } finally {
      gl.setRenderTarget(previousTarget);
      gl.xr.enabled = previousXrEnabled;
    }
  }, -1);

  return null;
}
