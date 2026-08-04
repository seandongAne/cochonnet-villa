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
  normalizeObservatoryQualityPreference
} from "../observatory-quality-preference.js";
import {
  createObservatoryPortal,
  disposeObservatoryPortal,
  OBSERVATORY_PORTAL_DEFAULT_LENS_RADIUS,
  projectObservatoryPortalLens,
  resizeObservatoryPortal,
  updateObservatoryPortalCamera,
  updateObservatoryPortalComposite
} from "../observatory-portal.js";
import {
  createObservatoryBlackHole,
  disposeObservatoryBlackHole,
  OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR,
  OBSERVATORY_BLACK_HOLE_PRESENTATION_SCALE,
  OBSERVATORY_BLACK_HOLE_WORLD_DISTANCE,
  prewarmObservatoryBlackHole,
  setObservatoryBlackHoleVisible,
  updateObservatoryBlackHole
} from "../observatory-black-hole.js";
import {
  createObservatoryBlackHolePass,
  disposeObservatoryBlackHolePass,
  OBSERVATORY_BLACK_HOLE_PASS_COMPOSITE_MATERIAL_NAME,
  resizeObservatoryBlackHolePass,
  updateObservatoryBlackHolePassCamera,
  updateObservatoryBlackHolePassComposite
} from "../observatory-black-hole-pass.js";
import {
  createObservatoryRelativisticLens,
  disposeObservatoryRelativisticLens,
  disposeObservatoryRelativisticLensLuts,
  getObservatoryRelativisticLensSupport,
  loadObservatoryRelativisticLensLuts,
  OBSERVATORY_RELATIVISTIC_LENS_MATERIAL_NAME,
  OBSERVATORY_RELATIVISTIC_LENS_OPTICAL_SCALE,
  prewarmObservatoryRelativisticLens,
  setObservatoryRelativisticLensLuts,
  setObservatoryRelativisticLensVisible,
  updateObservatoryRelativisticLens
} from "../observatory-relativistic-lens.js";
import {
  createObservatoryStarVolume,
  disposeObservatoryStarVolume,
  getObservatoryStarVolumeCounts,
  OBSERVATORY_STAR_VOLUME_MATERIAL_NAME,
  prewarmObservatoryStarVolume,
  setObservatoryStarVolumeVisible,
  updateObservatoryStarVolume
} from "../observatory-star-volume.js";
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
  setGaiaStarLens,
  setGaiaStarReveal
} from "../gaia-stars.js";
import {
  createObservatoryGaiaSourceMap,
  disposeObservatoryGaiaSourceMap,
  OBSERVATORY_GAIA_SOURCE_MAP_MATERIAL_NAME,
  OBSERVATORY_HERO_SOURCE_MAP_MATERIAL_NAME,
  prewarmObservatoryGaiaSourceMap
} from "../observatory-gaia-source-map.js";
import {
  createObservatoryKerrLens,
  disposeObservatoryKerrLens,
  disposeObservatoryKerrLensAtlases,
  getObservatoryKerrLensSupport,
  isObservatoryKerrLensAtlasReady,
  loadObservatoryKerrLensAtlases,
  OBSERVATORY_KERR_LENS_ALPHA_EXTENT,
  OBSERVATORY_KERR_LENS_INCLINATION_DEGREES,
  OBSERVATORY_KERR_LENS_MATERIAL_NAME,
  prewarmObservatoryKerrLens,
  setObservatoryKerrLensAtlases,
  setObservatoryKerrLensVisible,
  updateObservatoryKerrLens
} from "../observatory-kerr-lens.js";
import {
  createMushroomSkyAperture,
  disposeMushroomSky,
  isMushroomObservatorySkyPosition,
  MUSHROOM_SKY_BACKDROP_NAME,
  MUSHROOM_SKY_IMAGE_BRIGHTNESS,
  MUSHROOM_SKY_LENS_DEFAULT_EINSTEIN_RADIUS,
  MUSHROOM_SKY_LENS_DEFAULT_HORIZON_RADIUS,
  MUSHROOM_SKY_LENS_DEFAULT_INFLUENCE_RADIUS,
  removeMushroomSkyAperture,
  setMushroomSkyLens,
  setMushroomSkyPixelRatio,
  updateMushroomSky
} from "../mushroom-sky.js";
import {
  MUSHROOM_OBSERVATORY_DOME_RIM_NAME,
  MUSHROOM_OBSERVATORY_OUTER_WALL_NAME,
  MUSHROOM_OBSERVATORY_SWITCH_NAME,
  MUSHROOM_OBSERVATORY_UPPER_SOIL_NAME,
  MUSHROOM_OBSERVATORY_WALL_NAME,
  MUSHROOM_STAR_DOME_NAME,
  MUSHROOM_STAR_TEXTURE_HIGH_URL,
  MUSHROOM_STAR_TEXTURE_URL
} from "../mushroom-interior.js";
import {
  createObservatoryRareEventsState,
  OBSERVATORY_RARE_EVENT_CHANCE_PER_SECOND,
  OBSERVATORY_RARE_EVENT_IDS,
  OBSERVATORY_RARE_EVENT_MIN_STAR_REVEAL,
  stepObservatoryRareEvents
} from "../observatory-events.js";
import {
  disposeObservatorySkyEventsVisual,
  OBSERVATORY_KILONOVA_NAME,
  OBSERVATORY_SUPERNOVA_NAME,
  OBSERVATORY_UFO_NAME,
  updateObservatorySkyEventsVisual
} from "../observatory-sky-events.js";
import {
  createObservatoryRiftState,
  stepObservatoryRift
} from "../observatory-rift.js";
import {
  disposeObservatoryRiftVisual,
  updateObservatoryRiftVisual
} from "../observatory-rift-visual.js";
import { MUSHROOM_INTERIOR } from "../world.js";

const CLOSED_CEILING_COLOR = new THREE.Color("#010208");
const GAIA_RENDER_ORDER = -920;
// Network-level Gaia fetch failures (rejection, HTTP error, interrupted
// body) may be transient, so the approach trigger may retry — but never
// hammer a dead endpoint for the whole session.
const GAIA_FETCH_MAX_ATTEMPTS = 3;
const PORTAL_ORIGIN = new THREE.Vector3(
  MUSHROOM_INTERIOR.center.x,
  MUSHROOM_INTERIOR.eyeY[2],
  MUSHROOM_INTERIOR.center.z
);
const COSMOS_ORIGIN = new THREE.Vector3(0, 0, 0);
const PORTAL_REVEAL_EPSILON = 0.001;
// The Portal now carries both emission and opacity. Extinction supplies the
// unmistakable depth cue (near dust crossing fixed far stars) while restrained
// emission prevents the aperture becoming a luminous lavender screen.
const NEBULA_EMISSION_STRENGTH = 0.04;
const NEBULA_EXTINCTION_STRENGTH = 0.9;
// 星云增强: the rare-event surge multiplies Portal emission (and slightly
// lifts reveal) without touching the ray-march step count, so its cost is
// identical to the ordinary nebula frame.
const NEBULA_SURGE_EMISSION_GAIN = 2.2;
const NEBULA_SURGE_REVEAL_GAIN = 0.45;
const BASE_IMAGE_COMPARISON_BRIGHTNESS = 0.46;
const LENS_REVEAL_DAMPING = 2.25;
const LENS_HIDE_DAMPING = 4.8;
const LENS_WORLD_DISTANCE = OBSERVATORY_BLACK_HOLE_WORLD_DISTANCE;
const LENS_DISTANCE_SCALE_MIN = 0.78;
const LENS_DISTANCE_SCALE_MAX = 1.28;
// Unlike the far panorama, this hidden singularity occupies a finite point in
// the impossible room. Walking therefore shifts it slightly against Gaia's
// camera-centred catalogue, an honest binocular-like depth cue on a flat
// monitor. The direction remains high and inside the centre QA view.
const LENS_WORLD_POSITION = new THREE.Vector3(
  OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR.x,
  OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR.y,
  OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR.z
);
const lensDirectionScratch = new THREE.Vector3();
const lensScreenScratch = new THREE.Vector2();
const portalResolutionScratch = [0, 0];
// The global shader-failure sweep walks gl.info.programs linearly, which is
// wasted work on every steady-state frame. Scan in a short burst right after
// compile-triggering events (quality changes, prewarm work) so asynchronous
// link failures still surface promptly, then fall back to a slow heartbeat.
// Frame-counter driven — not wall clock — so the diagnostics harness's
// manually-advanced frames stay deterministic.
const OBSERVATORY_SHADER_SCAN_BURST_FRAMES = 8;
const OBSERVATORY_SHADER_SCAN_INTERVAL_FRAMES = 30;
const blackHoleClearColorScratch = new THREE.Color();
const relativisticSkyRotationScratch = new THREE.Matrix3();
const relativisticSkyRotation4Scratch = new THREE.Matrix4();
// Roughly 60 degrees to the centre view: inclined enough to expose distinct
// primary/secondary arcs without compressing the receding image into a dark
// leaf that reads as a shader seam.
const RELATIVISTIC_DISC_NORMAL = new THREE.Vector3(0.62, 0.52, 0.59).normalize();
const KERR_TARGET_SPIN_AXIS = RELATIVISTIC_DISC_NORMAL.clone().negate();
const KERR_INCLINATION_RADIANS = THREE.MathUtils.degToRad(
  OBSERVATORY_KERR_LENS_INCLINATION_DEGREES
);
const KERR_INCLINATION_SIN = Math.sin(KERR_INCLINATION_RADIANS);
const KERR_INCLINATION_COS = Math.cos(KERR_INCLINATION_RADIANS);
// The shipped Schwarzschild calibration has a 2 m optical Schwarzschild
// radius, hence one geometric mass unit M is one world metre at presentation
// scale 1. The shared presentation scale enlarges the apparent event across
// all three render paths together (see observatory-black-hole.js).
const KERR_MASS_WORLD_SCALE = 1 * OBSERVATORY_BLACK_HOLE_PRESENTATION_SCALE;
// The 2026-08 restyle extends the luminous disc across most of the lensed
// field (the transfer atlas bakes valid crossings out to ~11.7 M), so the
// event reads as a dominant ribbon disc like the cinematic reference instead
// of a small gold core inside a large milky sky warp. The old "two hard
// wedges" objection to a wide disc no longer applies: the Saturn-style ring
// gaps and sheared streaks give the outer lanes structure and translucency.
const KERR_DISC_OUTER_RADIUS = 10.5;
const KERR_DISC_OPACITY = 0.78;
const KERR_STAR_SOURCE_BRIGHTNESS = 0.82;
const kerrObserverOutScratch = new THREE.Vector3();
const kerrImageRightScratch = new THREE.Vector3();
const kerrImageUpScratch = new THREE.Vector3();
const kerrWorldXScratch = new THREE.Vector3();
const kerrWorldYScratch = new THREE.Vector3();
const kerrWorldZScratch = new THREE.Vector3();
const kerrToWorldScratch = new THREE.Matrix3();
const kerrStarSourceRotationScratch = new THREE.Matrix3();
const OBSERVATORY_SHADER_FAILURE_KINDS = new Map([
  [MUSHROOM_NEBULA_MATERIAL_NAME, "portal"],
  [OBSERVATORY_RELATIVISTIC_LENS_MATERIAL_NAME, "relativistic-lens"],
  [OBSERVATORY_KERR_LENS_MATERIAL_NAME, "kerr-lens"],
  [OBSERVATORY_GAIA_SOURCE_MAP_MATERIAL_NAME, "kerr-lens"],
  [OBSERVATORY_HERO_SOURCE_MAP_MATERIAL_NAME, "kerr-lens"],
  ["mushroom-observatory-portal-composite-material", "portal"],
  ["mushroom-distant-sky-material", "native-sky"],
  ["mushroom-twinkling-star-material", "native-sky"],
  ["mushroom-observatory-rift-aperture-material", "native-sky"],
  ["mushroom-observatory-rift-fragment-material", "native-sky"],
  ["mushroom-gaia-star-material", "gaia"],
  [OBSERVATORY_STAR_VOLUME_MATERIAL_NAME, "star-volume"],
  [OBSERVATORY_BLACK_HOLE_PASS_COMPOSITE_MATERIAL_NAME, "black-hole"],
  ["mushroom-observatory-black-hole-horizon-material", "black-hole"],
  ["mushroom-observatory-black-hole-scale-moon-material", "black-hole"],
  ["mushroom-observatory-black-hole-debris-material", "black-hole"],
  ["mushroom-observatory-black-hole-photon-ring-material-1", "black-hole"],
  ["mushroom-observatory-black-hole-photon-ring-material-2", "black-hole"],
  ["mushroom-observatory-black-hole-disk-material-1", "black-hole"],
  ["mushroom-observatory-black-hole-disk-material-2", "black-hole"],
  ["mushroom-observatory-black-hole-disk-material-3", "black-hole"],
  // Rare-event sky layers fail soft as one unit: a broken event shader
  // removes the 11 sky-rendered events from the availability pool while the
  // surge/transit (which render through other systems) stay possible.
  ["mushroom-observatory-meteor-material", "sky-events"],
  ["mushroom-observatory-comet-material", "sky-events"],
  [`${OBSERVATORY_SUPERNOVA_NAME}-material`, "sky-events"],
  ["mushroom-observatory-bolide-material", "sky-events"],
  ["mushroom-observatory-satellite-material", "sky-events"],
  ["mushroom-observatory-planet-material", "sky-events"],
  ["mushroom-observatory-aurora-material", "sky-events"],
  ["mushroom-observatory-constellation-line-material", "sky-events"],
  ["mushroom-observatory-constellation-star-material", "sky-events"],
  ["mushroom-observatory-moon-material", "sky-events"],
  [`${OBSERVATORY_KILONOVA_NAME}-material`, "sky-events"],
  [`${OBSERVATORY_UFO_NAME}-material`, "sky-events"]
]);

function hasRelativisticLensLuts(resources) {
  return Boolean(
    resources?.relativisticLens
    && resources.relativisticLuts
    && !resources.relativisticLuts.disposed
    && !resources.relativisticDisabled
    && !resources.blackHoleDisabled
  );
}

function isRelativisticLensPrimary(resources) {
  return hasRelativisticLensLuts(resources)
    && resources.relativisticPrewarmed === true
    && resources.blackHolePass?.disposed === false;
}

function hasKerrLensAtlases(resources) {
  return Boolean(
    resources?.kerrLens
    && isObservatoryKerrLensAtlasReady(resources.kerrAtlases)
    && !resources.kerrDisabled
    && !resources.blackHoleDisabled
  );
}

function isKerrLensPrimary(resources, quality) {
  return (quality === "high" || quality === "medium")
    && hasKerrLensAtlases(resources)
    && resources.kerrPrewarmed === true
    && resources.gaiaSourceMapPrewarmed === true
    && resources.gaiaSourceMap?.texture?.isTexture === true
    && isRelativisticLensPrimary(resources)
    && resources.blackHolePass?.disposed === false;
}

function updateKerrFrame(lensDirection) {
  // The transfer atlas is baked for a fixed 60-degree observer. Preserve the
  // finite world-space disc orientation as closely as that contract allows,
  // then rebuild the exact orthonormal atlas frame around the current lens
  // direction so walking changes position/scale without shearing the shadow.
  kerrObserverOutScratch.copy(lensDirection).negate().normalize();
  kerrImageUpScratch.copy(kerrObserverOutScratch)
    .multiplyScalar(KERR_INCLINATION_COS)
    .sub(KERR_TARGET_SPIN_AXIS);
  if (kerrImageUpScratch.lengthSq() < 1e-8) {
    kerrImageUpScratch.set(0, 1, 0)
      .addScaledVector(kerrObserverOutScratch, -kerrObserverOutScratch.y);
  }
  kerrImageUpScratch.normalize();
  kerrImageRightScratch.crossVectors(lensDirection, kerrImageUpScratch)
    .normalize();
  kerrWorldXScratch.copy(kerrObserverOutScratch)
    .multiplyScalar(KERR_INCLINATION_SIN)
    .addScaledVector(kerrImageUpScratch, KERR_INCLINATION_COS)
    .normalize();
  kerrWorldYScratch.copy(kerrObserverOutScratch)
    .multiplyScalar(KERR_INCLINATION_COS)
    .addScaledVector(kerrImageUpScratch, -KERR_INCLINATION_SIN)
    .normalize();
  kerrWorldZScratch.copy(kerrImageRightScratch);
  kerrToWorldScratch.set(
    kerrWorldXScratch.x, kerrWorldYScratch.x, kerrWorldZScratch.x,
    kerrWorldXScratch.y, kerrWorldYScratch.y, kerrWorldZScratch.y,
    kerrWorldXScratch.z, kerrWorldYScratch.z, kerrWorldZScratch.z
  );
  return {
    imageRight: kerrImageRightScratch,
    imageUp: kerrImageUpScratch,
    kerrToWorld: kerrToWorldScratch
  };
}

function getRelativisticSkyRotation(sky) {
  const rotationY = sky?.userData?.backdrop?.rotation?.y ?? 0;
  relativisticSkyRotation4Scratch.makeRotationY(-rotationY);
  return relativisticSkyRotationScratch.setFromMatrix4(
    relativisticSkyRotation4Scratch
  );
}

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
  // Rendering into a HalfFloatType target only needs a color-renderable
  // half-float framebuffer: EXT_color_buffer_float or its half-float subset.
  // Half-float linear *filtering* is core WebGL2 — the 32-bit-float linear
  // extension governs float textures these targets never use. The
  // checkFramebufferStatus + RGBA8 retry ladder below stays as the safety
  // net, and falling back to RGBA8 is visually harmless for this layer.
  return Boolean(
    gl.extensions.get("EXT_color_buffer_float")
      || gl.extensions.get("EXT_color_buffer_half_float")
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

function updateRiftFadeSurfaces(resources, amount) {
  const dissolve = THREE.MathUtils.clamp(
    Number.isFinite(amount) ? amount : 0,
    0,
    1
  );
  for (const surface of resources?.riftFadeSurfaces ?? []) {
    const opacity = surface.opacity * (1 - dissolve);
    surface.material.opacity = opacity;
    surface.object.visible = surface.visible && opacity > 0.001;
  }
}

function countVisibleDrawables(root) {
  if (!root?.visible) return 0;
  let count = 0;
  root.traverse((object) => {
    if (
      object.visible
      && (object.isMesh || object.isPoints || object.isInstancedMesh)
    ) {
      count += 1;
    }
  });
  return count;
}

function resetHiddenEffectRendering(resources, sky, riftVisual) {
  if (!resources) return;
  resources.riftState = createObservatoryRiftState({
    reducedMotion: resources.reducedMotion
  });
  updateRiftFadeSurfaces(resources, 0);
  if (riftVisual) {
    riftVisual.visible = false;
    if (!riftVisual.userData.disposed) {
      riftVisual.userData.elapsed = 0;
      riftVisual.userData.settledFragmentFactor = 0;
    }
  }
  resources.lensAmount = 0;
  resources.lensDistance = LENS_WORLD_DISTANCE;
  resources.lensAngularScale = 1;
  resources.portalLensVisible = false;
  setMushroomSkyLens(sky, { amount: 0 });
  if (resources.gaia) setGaiaStarLens(resources.gaia, { amount: 0 });
  if (resources.portal) {
    updateObservatoryPortalComposite(resources.portal.composite, {
      lensAmount: 0
    });
  }
  if (resources.blackHole) {
    setObservatoryBlackHoleVisible(resources.blackHole, false);
    updateObservatoryBlackHole(
      resources.blackHole,
      null,
      resources.blackHole.userData.timeSeconds,
      0,
      resources.blackHole.userData.quality
    );
  }
  if (resources.relativisticLens) {
    setObservatoryRelativisticLensVisible(resources.relativisticLens, false);
  }
  if (resources.kerrLens) {
    setObservatoryKerrLensVisible(resources.kerrLens, false);
  }
  if (resources.blackHolePass) {
    updateObservatoryBlackHolePassComposite(resources.blackHolePass.composite, {
      reveal: 0,
      visible: false
    });
  }
  if (resources.starVolume) {
    setObservatoryStarVolumeVisible(resources.starVolume, false);
    updateObservatoryStarVolume(
      resources.starVolume,
      null,
      resources.starVolume.userData.lastInputTime ?? 0,
      0,
      {
        motionScale: 0,
        quality: resources.starVolume.userData.quality,
        pixelRatio: 1
      }
    );
  }
}

// Browser-only bridge for the Impossible Observatory. The 4K panorama, Gaia
// catalogue and hero stars remain native-resolution main-scene layers. Only
// the low-frequency volumetric nebula enters the bounded offscreen Portal.
export function MushroomObservatoryRuntime({
  interior,
  sky,
  lightsOn,
  adaptationRef,
  riftVisual,
  skyEventsVisual = null,
  riftOpen = false,
  lensActive = false,
  audioFrameRef,
  onHiddenEffectsReset,
  onRareEventChange,
  qualityPreference = "auto",
  onQualityStatusChange
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
  const ensureHiddenCosmosRef = useRef(null);
  const renderBlackHolePassRef = useRef(null);
  const requestHighSkyTextureRef = useRef(null);
  const startRelativisticLoadRef = useRef(null);
  const startKerrLoadRef = useRef(null);
  const updateKerrLensRef = useRef(null);
  const onQualityStatusChangeRef = useRef(onQualityStatusChange);
  onQualityStatusChangeRef.current = onQualityStatusChange;
  const onRareEventChangeRef = useRef(onRareEventChange);
  onRareEventChangeRef.current = onRareEventChange;

  useEffect(() => {
    let mounted = true;
    let loadedTexture = null;
    let loadedHighTexture = null;
    let textureIdleHandle = null;
    let textureIdleUsesRequest = false;
    const lifecycleToken = {};
    const abortController = new AbortController();
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const search = new URLSearchParams(window.location.search);
    const diagnosticsMode = ["test", "perf"].includes(search.get("observatory"));
    const motionOverride = diagnosticsMode ? search.get("motion") : null;
    const requestedQuality = diagnosticsMode ? search.get("quality") : null;
    const requestedSkyMode = diagnosticsMode ? search.get("sky") : null;
    // Rare celestial events: ordinary visits roll the configured per-second
    // hazard; the QA harness stays deterministic (chance 0) and instead pins
    // one event via `event=` (aimed with `eventseed=`) so screenshots and
    // perf runs can exercise each phenomenon.
    const requestedRareEvent = diagnosticsMode ? search.get("event") : null;
    const forcedRareEvent = OBSERVATORY_RARE_EVENT_IDS.includes(
      requestedRareEvent
    )
      ? requestedRareEvent
      : null;
    // Optional companion to `event=`: aim the pinned occurrence (its sky
    // position/path derive from this seed) at a chosen harness camera.
    const requestedRareEventSeed = diagnosticsMode
      ? Number.parseFloat(search.get("eventseed") ?? "")
      : Number.NaN;
    const forcedRareEventSeed = Number.isFinite(requestedRareEventSeed)
      ? Math.min(0.999, Math.max(0, requestedRareEventSeed))
      : 0.5;
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
    // Resolve the physical switch once from the mounted pocket-space object.
    // The other two sources reuse the same finite world anchors as the visual
    // Rift and black hole, so HRTF direction changes honestly as the player
    // walks or turns instead of following the camera like a stereo overlay.
    const switchWorldPosition = new THREE.Vector3();
    interior.updateWorldMatrix(true, true);
    const switchObject = interior.getObjectByName(
      MUSHROOM_OBSERVATORY_SWITCH_NAME
    );
    if (switchObject) {
      switchObject.getWorldPosition(switchWorldPosition);
    } else {
      switchWorldPosition.copy(PORTAL_ORIGIN);
    }
    const audioSourcePositions = Object.freeze({
      switch: Object.freeze(switchWorldPosition.toArray()),
      rift: Object.freeze([
        PORTAL_ORIGIN.x,
        PORTAL_ORIGIN.y + 6,
        PORTAL_ORIGIN.z
      ]),
      lens: Object.freeze(LENS_WORLD_POSITION.toArray())
    });
    const stencilSupported = detectStencilBuffer(gl);
    const relativisticSupport = getObservatoryRelativisticLensSupport(gl);
    const kerrSupport = getObservatoryKerrLensSupport(gl);
    const resources = {
      reducedMotion: readReducedMotion(),
      comparisonMode: requestedSkyMode === "base" ? "base" : "impossible",
      diagnosticsQualityOverride: qualityOverride,
      playerQualityPreference: "auto",
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
      gaiaSourceMap: null,
      gaiaSourceMapError: null,
      gaiaSourceMapPrewarmed: false,
      gaiaSourceMapPrewarmMs: 0,
      gaiaBinary: null,
      gaiaLoadStarted: false,
      gaiaFetchAttempts: 0,
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
      hiddenCosmosLoadRequested: false,
      rareEventsState: createObservatoryRareEventsState(),
      rareEventChancePerSecond: diagnosticsMode
        ? 0
        : OBSERVATORY_RARE_EVENT_CHANCE_PER_SECOND,
      forcedRareEvent,
      forcedRareEventSeed,
      lastReportedRareEvent: null,
      skyEventsDisabled: false,
      skyEventsError: null,
      blackHole: null,
      blackHolePass: null,
      blackHoleForceUnsignedByte: false,
      blackHoleDisabled: false,
      blackHoleError: null,
      blackHoleFrames: 0,
      blackHoleRenderedThisFrame: false,
      blackHoleFramebufferChecked: false,
      blackHolePrewarmed: false,
      blackHoleCompositePrewarmed: false,
      blackHolePrewarmStartedAt: 0,
      blackHolePrewarmMs: 0,
      blackHoleLastTargetKey: "",
      relativisticSupport,
      relativisticLens: null,
      relativisticLuts: null,
      relativisticLoadStarted: false,
      relativisticLoadPending: false,
      relativisticFetchStartedAt: 0,
      relativisticFetchMs: 0,
      relativisticDisabled: !relativisticSupport.supported,
      relativisticError: relativisticSupport.supported
        ? null
        : "WebGL2 unavailable",
      relativisticPrewarmed: false,
      relativisticPrewarmMs: 0,
      kerrSupport,
      kerrLens: null,
      kerrAtlases: null,
      kerrLoadStarted: false,
      kerrLoadPending: false,
      kerrFetchStartedAt: 0,
      kerrFetchMs: 0,
      kerrDisabled: !kerrSupport.supported,
      kerrError: kerrSupport.supported ? null : kerrSupport.fallback,
      kerrPrewarmed: false,
      kerrPrewarmMs: 0,
      starVolume: null,
      starVolumeDisabled: false,
      starVolumeError: null,
      starVolumePrewarmed: false,
      starVolumePrewarmMs: 0,
      qualityApplied: null,
      lastTargetKey: "",
      aperture: null,
      dome: null,
      domeWasVisible: true,
      domeFallbackColor: null,
      textureReady: false,
      textureError: false,
      highTextureLoadStarted: false,
      highTextureReady: false,
      highTextureError: false,
      activeSkyTextureTier: "fallback",
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
      frameIndex: 0,
      shaderScanBurstFramesLeft: OBSERVATORY_SHADER_SCAN_BURST_FRAMES,
      lastShaderScanFrame: -OBSERVATORY_SHADER_SCAN_INTERVAL_FRAMES,
      nativePrewarmTarget: null,
      riftState: createObservatoryRiftState(),
      riftFadeSurfaces: [],
      lensAmount: 0,
      lensDirection: new THREE.Vector3(0, 1, 0),
      lensDistance: LENS_WORLD_DISTANCE,
      lensAngularScale: 1,
      portalLensVisible: false,
      requestedRift: false,
      requestedLens: false,
      hiddenResetRequested: false,
      audioSourcePositions
    };
    if (audioFrameRef?.current) {
      audioFrameRef.current.sourcePositions = audioSourcePositions;
      // Fail closed until the ordered frame director has published the first
      // complete adaptation/Rift/Lens snapshot.
      audioFrameRef.current.runtimeAvailable = false;
      audioFrameRef.current.visualAvailable = false;
    }
    resources.reportQualityStatus = () => {
      const qualityState = qualityRef.current;
      onQualityStatusChangeRef.current?.({
        activeQuality: qualityState?.quality ?? "minimum",
        // Manual locks intentionally replace the controller's live ceiling,
        // but the player panel should still report the device's Auto
        // recommendation rather than echoing the selected manual tier.
        maximumQuality:
          qualityState?.capabilityAssessment?.maximumQuality
          ?? qualityState?.maximumQuality
          ?? "minimum",
        lockedQuality: resources.qualityLocked,
        preference: resources.diagnosticsQualityOverride
          ?? resources.playerQualityPreference
          ?? "auto"
      });
    };
    resources.portalScene.background = new THREE.Color("#000000");
    resourcesRef.current = resources;
    sky.userData.lifecycleToken = lifecycleToken;
    if (riftVisual) riftVisual.userData.lifecycleToken = lifecycleToken;
    if (skyEventsVisual) {
      skyEventsVisual.userData.lifecycleToken = lifecycleToken;
    }

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
        if (backdropMaterial?.uniforms?.uSkyTexture?.value === texture) {
          resources.textureGpuReady = true;
        }
        resources.textureUploadMs += performance.now() - startedAt;
      } catch {
        const isHighTexture = texture === loadedHighTexture;
        if (isHighTexture) {
          resources.highTextureError = true;
          resources.highTextureReady = false;
        } else {
          resources.textureError = true;
        }
        if (texture !== fallbackTexture) {
          if (backdropMaterial?.uniforms?.uSkyTexture) {
            const replacement = isHighTexture && loadedTexture?.isTexture
              ? loadedTexture
              : fallbackTexture;
            backdropMaterial.uniforms.uSkyTexture.value = replacement;
            resources.activeSkyTextureTier = replacement === loadedTexture
              ? "4k"
              : "fallback";
          }
          if (loadedTexture === texture) loadedTexture = null;
          if (loadedHighTexture === texture) loadedHighTexture = null;
          texture.dispose();
          const replacement = backdropMaterial?.uniforms?.uSkyTexture?.value;
          if (replacement?.isTexture) preuploadSkyTexture(replacement);
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

    const configureSkyTexture = (texture, name) => {
      texture.name = name;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      // The Schwarzschild pass can compress thousands of source texels into
      // one photon-ring pixel. Trilinear mip selection keeps that footprint
      // energy-stable instead of turning the photographic stars into moire.
      // Magnified regions still resolve from the original 4K/8K base level.
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = Math.max(
        1,
        Math.min(8, gl.capabilities.getMaxAnisotropy())
      );
      return texture;
    };

    const activateSkyTexture = (texture, tier) => {
      if (!texture?.isTexture || !backdropMaterial?.uniforms?.uSkyTexture) {
        return false;
      }
      backdropMaterial.uniforms.uSkyTexture.value = texture;
      backdropMaterial.uniforms.uBrightness.value = MUSHROOM_SKY_IMAGE_BRIGHTNESS;
      resources.activeSkyTextureTier = tier;
      resources.textureReady = true;
      sky.userData.textureReady = true;
      resources.textureGpuReady = false;
      scheduleTexturePreupload(texture);
      return true;
    };

    resources.riftFadeSurfaces = [
      MUSHROOM_OBSERVATORY_WALL_NAME,
      MUSHROOM_OBSERVATORY_OUTER_WALL_NAME,
      MUSHROOM_OBSERVATORY_UPPER_SOIL_NAME,
      MUSHROOM_OBSERVATORY_DOME_RIM_NAME
    ]
      .map((name) => interior.getObjectByName(name))
      .filter((object) => object?.material?.isMaterial)
      .map((object) => ({
        object,
        material: object.material,
        opacity: object.material.opacity,
        visible: object.visible
      }));

    if (dome?.isMesh && backdropMaterial?.isShaderMaterial) {
      resources.dome = dome;
      resources.domeWasVisible = dome.visible;
      resources.domeFallbackColor = dome.material?.color?.clone?.() ?? null;
      resources.aperture = stencilSupported
        ? createMushroomSkyAperture(dome)
        : null;
      setMushroomSkyPixelRatio(sky, gl.getPixelRatio());

      const loader = new THREE.TextureLoader();
      const requestHighSkyTexture = () => {
        if (
          !mounted
          || resources.contextLost
          || resources.highTextureLoadStarted
          || resources.highTextureReady
          || resources.highTextureError
          || gl.capabilities.maxTextureSize < 8192
        ) return false;
        resources.highTextureLoadStarted = true;
        loader.load(
          MUSHROOM_STAR_TEXTURE_HIGH_URL,
          (texture) => {
            if (!mounted) {
              texture.dispose();
              return;
            }
            loadedHighTexture = configureSkyTexture(
              texture,
              "qwantani-night-puresky-dome-8k"
            );
            resources.highTextureReady = true;
            resources.highTextureError = false;
            if (qualityRef.current?.quality === "high") {
              activateSkyTexture(loadedHighTexture, "8k");
            }
          },
          undefined,
          () => {
            if (!mounted || sky.userData.lifecycleToken !== lifecycleToken) return;
            resources.highTextureError = true;
          }
        );
        return true;
      };
      requestHighSkyTextureRef.current = requestHighSkyTexture;
      loader.load(
        MUSHROOM_STAR_TEXTURE_URL,
        (texture) => {
          if (!mounted) {
            texture.dispose();
            return;
          }
          loadedTexture = configureSkyTexture(
            texture,
            "qwantani-night-puresky-dome-4k"
          );
          if (
            qualityRef.current?.quality !== "high"
            || !loadedHighTexture?.isTexture
          ) {
            activateSkyTexture(loadedTexture, "4k");
          }
          resources.textureReady = true;
          sky.userData.textureReady = true;
        },
        undefined,
        () => {
          if (!mounted || sky.userData.lifecycleToken !== lifecycleToken) return;
          resources.textureError = true;
          // Keep the procedural fallback and hero stars available even when
          // the 4K photograph cannot be decoded.
          resources.textureReady = true;
          sky.userData.textureReady = true;
          scheduleTexturePreupload(
            backdropMaterial?.uniforms?.uSkyTexture?.value ?? fallbackTexture
          );
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
      resources.portalLensVisible = false;
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

    function disposeBlackHolePassResources({ disposeCore = false } = {}) {
      if (resources.blackHolePass) {
        disposeObservatoryBlackHolePass(resources.blackHolePass);
        resources.blackHolePass = null;
      }
      resources.blackHoleRenderedThisFrame = false;
      resources.blackHoleFramebufferChecked = false;
      resources.blackHoleCompositePrewarmed = false;
      resources.blackHoleLastTargetKey = "";
      if (disposeCore && resources.blackHole) {
        disposeObservatoryBlackHole(resources.blackHole);
        resources.blackHole = null;
        resources.blackHolePrewarmed = false;
      }
    }

    function disposeRelativisticResources({ disposeLuts = false } = {}) {
      if (resources.relativisticLens) {
        disposeObservatoryRelativisticLens(resources.relativisticLens);
        resources.relativisticLens = null;
      }
      resources.relativisticPrewarmed = false;
      if (disposeLuts && resources.relativisticLuts) {
        disposeObservatoryRelativisticLensLuts(resources.relativisticLuts);
        resources.relativisticLuts = null;
      }
    }

    function disposeKerrResources({ disposeAtlases = false } = {}) {
      if (resources.kerrLens) {
        disposeObservatoryKerrLens(resources.kerrLens);
        resources.kerrLens = null;
      }
      resources.kerrPrewarmed = false;
      if (disposeAtlases && resources.kerrAtlases) {
        disposeObservatoryKerrLensAtlases(resources.kerrAtlases);
        resources.kerrAtlases = null;
      }
    }

    function disposeHiddenCosmosResources() {
      disposeBlackHolePassResources({ disposeCore: true });
      disposeKerrResources({ disposeAtlases: true });
      disposeRelativisticResources({ disposeLuts: true });
      if (resources.starVolume) {
        resources.starVolume.removeFromParent();
        disposeObservatoryStarVolume(resources.starVolume);
        resources.starVolume = null;
      }
      resources.starVolumePrewarmed = false;
    }

    function disposeGaiaSourceMapResources() {
      if (resources.gaiaSourceMap) {
        disposeObservatoryGaiaSourceMap(resources.gaiaSourceMap);
        resources.gaiaSourceMap = null;
      }
      resources.gaiaSourceMapPrewarmed = false;
      resources.kerrPrewarmed = false;
    }

    function ensureHiddenCosmosResources(
      quality = qualityRef.current?.quality ?? "medium"
    ) {
      if (
        !mounted
        || resources.contextLost
        || !resources.stencilSupported
        || quality === "minimum"
      ) return false;
      const state = getState();

      if (!resources.starVolume && !resources.starVolumeDisabled) {
        resources.starVolume = createObservatoryStarVolume();
        setObservatoryStarVolumeVisible(resources.starVolume, false);
        scene.add(resources.starVolume);
      }

      if (!resources.blackHole && !resources.blackHoleDisabled) {
        resources.blackHole = createObservatoryBlackHole({
          anchor: LENS_WORLD_POSITION,
          // The shared presentation scale keeps the fail-soft procedural disc
          // the same apparent size as the Kerr/Schwarzschild paths, so a lens
          // fallback never visibly shrinks the event mid-session.
          scale: OBSERVATORY_BLACK_HOLE_PRESENTATION_SCALE,
          quality,
          visible: false
        });
      }

      const blackHoleTargetType = resources.halfFloatSupported
        && !resources.blackHoleForceUnsignedByte
        ? THREE.HalfFloatType
        : THREE.UnsignedByteType;
      if (
        resources.relativisticSupport.supported
        && !resources.relativisticDisabled
        && !resources.relativisticLens
      ) {
        resources.relativisticLens = createObservatoryRelativisticLens({
          skyTexture: backdropMaterial?.uniforms?.uSkyTexture?.value ?? null,
          luts: resources.relativisticLuts,
          quality,
          visible: false,
          reveal: 0,
          lensPosition: LENS_WORLD_POSITION,
          discNormal: RELATIVISTIC_DISC_NORMAL,
          // Track the shared presentation scale so the Low-tier disc and the
          // Kerr underlay stay the same apparent size as the Kerr atlas path.
          opticalScale: OBSERVATORY_RELATIVISTIC_LENS_OPTICAL_SCALE
            * OBSERVATORY_BLACK_HOLE_PRESENTATION_SCALE,
          hdrOutput: blackHoleTargetType === THREE.HalfFloatType
        });
      }

      if (
        resources.kerrSupport.supported
        && !resources.kerrDisabled
        && !resources.kerrLens
      ) {
        lensDirectionScratch.copy(LENS_WORLD_POSITION)
          .sub(state.camera.position)
          .normalize();
        const kerrFrame = updateKerrFrame(lensDirectionScratch);
        resources.kerrLens = createObservatoryKerrLens({
          skyTexture: backdropMaterial?.uniforms?.uSkyTexture?.value ?? null,
          starSourceTexture: resources.gaiaSourceMap?.texture ?? null,
          atlases: resources.kerrAtlases,
          quality,
          visible: false,
          reveal: 0,
          lensPosition: LENS_WORLD_POSITION,
          imageRight: kerrFrame.imageRight,
          imageUp: kerrFrame.imageUp,
          kerrToWorld: kerrFrame.kerrToWorld,
          skyRotation: getRelativisticSkyRotation(sky),
          starSourceRotation: kerrStarSourceRotationScratch.identity(),
          massWorldScale: KERR_MASS_WORLD_SCALE,
          hdrOutput: blackHoleTargetType === THREE.HalfFloatType
        });
      }

      if (
        resources.blackHole
        && !resources.blackHolePass
        && !resources.blackHoleDisabled
      ) {
        resources.blackHolePass = createObservatoryBlackHolePass({
          sourceCamera: state.camera,
          width: state.size.width,
          height: state.size.height,
          pixelRatio: gl.getPixelRatio(),
          quality,
          type: blackHoleTargetType
        });
        resources.blackHolePass.scene.add(resources.blackHole);
        if (resources.relativisticLens) {
          resources.blackHolePass.scene.add(resources.relativisticLens);
          updateObservatoryRelativisticLens(
            resources.relativisticLens,
            state.camera,
            {
              reveal: 0,
              quality,
              skyTexture: backdropMaterial?.uniforms?.uSkyTexture?.value ?? null,
              luts: resources.relativisticLuts,
              lensPosition: LENS_WORLD_POSITION,
              discNormal: RELATIVISTIC_DISC_NORMAL,
              hdrOutput: blackHoleTargetType === THREE.HalfFloatType
            }
          );
        }
        if (resources.kerrLens) {
          resources.blackHolePass.scene.add(resources.kerrLens);
          const kerrFrame = updateKerrFrame(lensDirectionScratch
            .copy(LENS_WORLD_POSITION)
            .sub(state.camera.position)
            .normalize());
          updateObservatoryKerrLens(resources.kerrLens, state.camera, {
            reveal: 0,
            quality,
            skyTexture: backdropMaterial?.uniforms?.uSkyTexture?.value ?? null,
            starSourceTexture: resources.gaiaSourceMap?.texture ?? null,
            atlases: resources.kerrAtlases,
            lensPosition: LENS_WORLD_POSITION,
            imageRight: kerrFrame.imageRight,
            imageUp: kerrFrame.imageUp,
            kerrToWorld: kerrFrame.kerrToWorld,
            skyRotation: getRelativisticSkyRotation(sky),
            starSourceRotation: kerrStarSourceRotationScratch.identity(),
            massWorldScale: KERR_MASS_WORLD_SCALE,
            discOuterRadius: KERR_DISC_OUTER_RADIUS,
            discOpacity: KERR_DISC_OPACITY,
            hdrOutput: blackHoleTargetType === THREE.HalfFloatType
          });
        }
        scene.add(resources.blackHolePass.composite);
        resources.blackHolePrewarmStartedAt = performance.now();
      }
      return Boolean(
        resources.blackHolePass
        || resources.starVolume
        || resources.relativisticLens
        || resources.kerrLens
      );
    }

    function handleBlackHoleFailure(
      error,
      { allowRgba8Retry = true } = {}
    ) {
      resources.blackHoleError = error instanceof Error
        ? error.message
        : String(error);
      const failedTargetWasHalfFloat = resources.blackHolePass
        ?.renderTarget?.texture?.type === THREE.HalfFloatType;
      if (
        failedTargetWasHalfFloat
        && !resources.blackHoleForceUnsignedByte
        && allowRgba8Retry
      ) {
        resources.blackHoleForceUnsignedByte = true;
        resources.blackHolePrewarmed = false;
        disposeBlackHolePassResources();
        ensureHiddenCosmosResources(qualityRef.current?.quality ?? "medium");
        return;
      }
      resources.blackHoleDisabled = true;
      resources.blackHolePrewarmed = false;
      resources.relativisticPrewarmed = false;
      resources.kerrPrewarmed = false;
      if (resources.blackHole) {
        setObservatoryBlackHoleVisible(resources.blackHole, false);
      }
      if (resources.relativisticLens) {
        setObservatoryRelativisticLensVisible(
          resources.relativisticLens,
          false
        );
      }
      if (resources.kerrLens) {
        setObservatoryKerrLensVisible(resources.kerrLens, false);
      }
      if (resources.blackHolePass) {
        updateObservatoryBlackHolePassComposite(
          resources.blackHolePass.composite,
          { reveal: 0, visible: false }
        );
      }
    }

    function renderBlackHolePass({ prewarm = false } = {}) {
      const pass = resources.blackHolePass;
      if (
        !pass
        || !resources.blackHole
        || resources.blackHoleDisabled
        || resources.contextLost
      ) return false;

      updateObservatoryBlackHolePassCamera(camera, pass);
      const previousTarget = gl.getRenderTarget();
      const previousXrEnabled = gl.xr.enabled;
      const previousAutoClear = gl.autoClear;
      const previousClearAlpha = gl.getClearAlpha();
      gl.getClearColor(blackHoleClearColorScratch);
      try {
        gl.xr.enabled = false;
        gl.autoClear = false;
        // Allocate and validate the real HDR target during prewarm, but do the
        // otherwise invisible shader/geometry upload on the shared 1x1 target.
        // A full-resolution warmup frame made the High Schwarzschild path pay
        // almost the complete render cost before the visitor pressed F.
        gl.setRenderTarget(pass.renderTarget);
        if (!resources.blackHoleFramebufferChecked) {
          const context = gl.getContext();
          const status = context.checkFramebufferStatus(context.FRAMEBUFFER);
          if (status !== context.FRAMEBUFFER_COMPLETE) {
            throw new Error(`Black-hole framebuffer incomplete (${status})`);
          }
          resources.blackHoleFramebufferChecked = true;
        }
        if (prewarm) gl.setRenderTarget(getNativePrewarmTarget());
        gl.setClearColor(0x000000, 0);
        gl.clear(true, true, false);
        gl.render(pass.scene, pass.camera);
        const shaderFailure = findObservatoryShaderFailure(
          gl,
          resources.handledShaderFailures
        );
        if (shaderFailure) throw shaderFailure;
        if (!prewarm) {
          resources.blackHoleFrames += 1;
          resources.blackHoleRenderedThisFrame = true;
        }
        resources.blackHoleError = null;
        return true;
      } catch (error) {
        if (!resources.contextLost) {
          if (error?.observatoryShaderFailure) {
            handleShaderFailureRef.current?.(error);
          } else {
            handleBlackHoleFailure(error);
          }
        }
        return false;
      } finally {
        gl.setRenderTarget(previousTarget);
        gl.setClearColor(blackHoleClearColorScratch, previousClearAlpha);
        gl.autoClear = previousAutoClear;
        gl.xr.enabled = previousXrEnabled;
      }
    }
    ensureHiddenCosmosRef.current = ensureHiddenCosmosResources;
    renderBlackHolePassRef.current = renderBlackHolePass;

    function updateKerrLensRuntime(
      activeCamera,
      {
        reveal = 0,
        quality = qualityRef.current?.quality ?? "medium",
        timeSeconds = sky.userData.elapsed ?? 0,
        starSourceBrightness = KERR_STAR_SOURCE_BRIGHTNESS
      } = {}
    ) {
      if (!resources.kerrLens || !activeCamera) return false;
      const direction = lensDirectionScratch.copy(LENS_WORLD_POSITION)
        .sub(activeCamera.position)
        .normalize();
      const kerrFrame = updateKerrFrame(direction);
      return updateObservatoryKerrLens(resources.kerrLens, activeCamera, {
        timeSeconds,
        reveal,
        quality,
        skyTexture: backdropMaterial?.uniforms?.uSkyTexture?.value ?? null,
        starSourceTexture: resources.gaiaSourceMap?.texture ?? null,
        atlases: resources.kerrAtlases,
        lensPosition: LENS_WORLD_POSITION,
        imageRight: kerrFrame.imageRight,
        imageUp: kerrFrame.imageUp,
        kerrToWorld: kerrFrame.kerrToWorld,
        skyRotation: getRelativisticSkyRotation(sky),
        starSourceRotation: kerrStarSourceRotationScratch.identity(),
        massWorldScale: KERR_MASS_WORLD_SCALE,
        skyBrightness: backdropMaterial?.uniforms?.uBrightness?.value
          ?? MUSHROOM_SKY_IMAGE_BRIGHTNESS,
        starSourceBrightness,
        discOuterRadius: KERR_DISC_OUTER_RADIUS,
        discOpacity: KERR_DISC_OPACITY,
        hdrOutput: resources.blackHolePass?.renderTarget?.texture?.type
          === THREE.HalfFloatType
      });
    }
    updateKerrLensRef.current = updateKerrLensRuntime;

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
      // The source map borrows Gaia's geometry, so it must release that
      // reference before the owning Points object disposes the old buffer.
      disposeGaiaSourceMapResources();
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
        if (quality === "high" || quality === "medium") {
          try {
            resources.gaiaSourceMap = createObservatoryGaiaSourceMap(
              resources.gaia,
              {
                quality,
                heroStars: sky.userData.stars
              }
            );
            resources.gaiaSourceMapError = null;
            resources.gaiaSourceMapPrewarmed = false;
          } catch (sourceMapError) {
            resources.gaiaSourceMapError = sourceMapError instanceof Error
              ? sourceMapError.message
              : String(sourceMapError);
            disposeGaiaSourceMapResources();
          }
        }
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
        disposeGaiaSourceMapResources();
        if (resources.gaia) {
          disposeGaiaStarPoints(resources.gaia);
          resources.gaia = null;
        }
        return;
      }
      if (error?.observatoryShaderFailure === "star-volume") {
        resources.starVolumeDisabled = true;
        resources.starVolumeError = message;
        resources.starVolumePrewarmed = false;
        if (resources.starVolume) {
          setObservatoryStarVolumeVisible(resources.starVolume, false);
        }
        return;
      }
      if (error?.observatoryShaderFailure === "sky-events") {
        resources.skyEventsDisabled = true;
        resources.skyEventsError = message;
        if (skyEventsVisual) {
          skyEventsVisual.visible = false;
          disposeObservatorySkyEventsVisual(skyEventsVisual);
        }
        return;
      }
      if (error?.observatoryShaderFailure === "relativistic-lens") {
        resources.relativisticDisabled = true;
        resources.relativisticError = message;
        resources.relativisticPrewarmed = false;
        if (resources.relativisticLens) {
          setObservatoryRelativisticLensVisible(
            resources.relativisticLens,
            false
          );
        }
        // The layer is disabled for the rest of the session (only a context
        // restore re-detects support, and that path re-fetches from scratch),
        // so free the ~2 MB float LUT textures too instead of holding
        // permanently-unusable CPU+GPU memory until unmount.
        disposeRelativisticResources({ disposeLuts: true });
        return;
      }
      if (error?.observatoryShaderFailure === "kerr-lens") {
        resources.kerrDisabled = true;
        resources.kerrError = message;
        resources.kerrPrewarmed = false;
        resources.gaiaSourceMapError ??= message;
        if (resources.kerrLens) {
          setObservatoryKerrLensVisible(resources.kerrLens, false);
        }
        // Same rationale: the disabled Kerr path can never reuse its ~8.3 MB
        // CPU + ~8.3 MB GPU transfer atlases this session. A context restore
        // clears kerrDisabled and re-fetches the atlases from scratch.
        disposeKerrResources({ disposeAtlases: true });
        return;
      }
      if (error?.observatoryShaderFailure === "black-hole") {
        handleBlackHoleFailure(error, { allowRgba8Retry: false });
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
        resetHiddenEffectRendering(resources, sky, riftVisual);
        disposePortalResources();
        disposeGaiaSourceMapResources();
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
      if (quality === "high" && loadedHighTexture?.isTexture) {
        activateSkyTexture(loadedHighTexture, "8k");
      } else if (quality !== "high" && loadedTexture?.isTexture) {
        activateSkyTexture(loadedTexture, "4k");
      }
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
      if (resources.hiddenCosmosLoadRequested && quality !== "minimum") {
        ensureHiddenCosmosResources(quality);
        resources.blackHoleLastTargetKey = "";
      } else if (quality === "minimum") {
        if (resources.blackHole) {
          setObservatoryBlackHoleVisible(resources.blackHole, false);
        }
        if (resources.relativisticLens) {
          setObservatoryRelativisticLensVisible(
            resources.relativisticLens,
            false
          );
        }
        if (resources.kerrLens) {
          setObservatoryKerrLensVisible(resources.kerrLens, false);
        }
        // Minimum is the allocation-free legacy-Lens fallback. Release the
        // finite black-hole target immediately; an adjacent-tier upgrade will
        // rebuild and re-prewarm it through ensureHiddenCosmosResources().
        disposeBlackHolePassResources();
        if (resources.starVolume) {
          setObservatoryStarVolumeVisible(resources.starVolume, false);
        }
      }
      if (resources.gaiaBinary) replaceGaia(quality);
      resources.qualityApplied = quality;
      // New tier ⇒ new/changed materials may compile over the next frames.
      resources.shaderScanBurstFramesLeft = OBSERVATORY_SHADER_SCAN_BURST_FRAMES;
      resources.reportQualityStatus?.();
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
      if (
        resources.blackHolePass
        && resources.blackHole
        && !resources.blackHoleDisabled
        && !resources.blackHolePrewarmed
      ) {
        didWork = true;
        const blackHoleStartedAt = performance.now();
        const restore = prewarmObservatoryBlackHole(
          resources.blackHole,
          qualityRef.current?.quality ?? "medium"
        );
        try {
          resources.blackHolePrewarmed = renderBlackHolePass({ prewarm: true });
        } finally {
          if (typeof restore === "function") restore();
          if (resources.blackHolePrewarmed) {
            resources.blackHolePrewarmMs += performance.now()
              - blackHoleStartedAt;
          }
        }
      }
      if (
        resources.gaiaSourceMap
        && !resources.gaiaSourceMapPrewarmed
      ) {
        didWork = true;
        const sourceMapStartedAt = performance.now();
        try {
          prewarmObservatoryGaiaSourceMap(resources.gaiaSourceMap, gl);
          resources.gaiaSourceMapPrewarmed =
            resources.gaiaSourceMap.prewarmed === true;
          if (resources.gaiaSourceMapPrewarmed) {
            resources.gaiaSourceMapPrewarmMs += performance.now()
              - sourceMapStartedAt;
          }
        } catch (error) {
          resources.gaiaSourceMapError = error instanceof Error
            ? error.message
            : String(error);
          disposeGaiaSourceMapResources();
        }
      }
      if (
        resources.blackHolePass
        && hasRelativisticLensLuts(resources)
        && !resources.relativisticPrewarmed
      ) {
        didWork = true;
        const relativisticStartedAt = performance.now();
        const passUsesHdr = resources.blackHolePass.renderTarget.texture.type
          === THREE.HalfFloatType;
        updateObservatoryRelativisticLens(
          resources.relativisticLens,
          camera,
          {
            reveal: 0,
            quality: qualityRef.current?.quality ?? "medium",
            skyTexture: backdropMaterial?.uniforms?.uSkyTexture?.value ?? null,
            luts: resources.relativisticLuts,
            lensPosition: LENS_WORLD_POSITION,
            discNormal: RELATIVISTIC_DISC_NORMAL,
            skyRotation: getRelativisticSkyRotation(sky),
            skyBrightness: MUSHROOM_SKY_IMAGE_BRIGHTNESS,
            hdrOutput: passUsesHdr
          }
        );
        const restore = prewarmObservatoryRelativisticLens(
          resources.relativisticLens,
          qualityRef.current?.quality ?? "medium"
        );
        try {
          resources.relativisticPrewarmed = renderBlackHolePass({
            prewarm: true
          });
        } finally {
          if (typeof restore === "function") restore();
          if (resources.relativisticPrewarmed) {
            resources.relativisticPrewarmMs += performance.now()
              - relativisticStartedAt;
          }
        }
      }
      if (
        resources.blackHolePass
        && hasKerrLensAtlases(resources)
        && resources.gaiaSourceMapPrewarmed
        && resources.relativisticPrewarmed
        && !resources.kerrPrewarmed
        && (
          qualityRef.current?.quality === "high"
          || qualityRef.current?.quality === "medium"
        )
      ) {
        didWork = true;
        const kerrStartedAt = performance.now();
        updateKerrLensRuntime(camera, {
          reveal: 0,
          quality: qualityRef.current?.quality ?? "medium"
        });
        const restore = prewarmObservatoryKerrLens(
          resources.kerrLens,
          qualityRef.current?.quality ?? "medium"
        );
        try {
          resources.kerrPrewarmed = renderBlackHolePass({ prewarm: true });
        } finally {
          if (typeof restore === "function") restore();
          if (resources.kerrPrewarmed) {
            resources.kerrPrewarmMs += performance.now() - kerrStartedAt;
          }
        }
      }
      if (
        resources.blackHolePass
        && !resources.blackHoleDisabled
        && !resources.blackHoleCompositePrewarmed
      ) {
        prewarmLayer(
          "black-hole",
          OBSERVATORY_BLACK_HOLE_PASS_COMPOSITE_MATERIAL_NAME,
          [resources.blackHolePass.composite],
          () => { resources.blackHoleCompositePrewarmed = true; }
        );
      }
      if (
        resources.starVolume
        && !resources.starVolumeDisabled
        && !resources.starVolumePrewarmed
      ) {
        didWork = true;
        const starStartedAt = performance.now();
        try {
          prewarmObservatoryStarVolume(
            resources.starVolume,
            (_volume, points) => renderWarmupObjects([points]),
            {
              quality: qualityRef.current?.quality ?? "medium",
              pixelRatio: gl.getPixelRatio()
            }
          );
          resources.starVolumePrewarmed = true;
          resources.starVolumePrewarmMs += performance.now() - starStartedAt;
        } catch (error) {
          const typedError = error instanceof Error
            ? error
            : new Error(String(error));
          typedError.observatoryShaderFailure = "star-volume";
          typedError.observatoryMaterialName = OBSERVATORY_STAR_VOLUME_MATERIAL_NAME;
          handleShaderFailure(typedError);
        }
      }
      if (!resources.nativeSkyPrewarmed && resources.textureReady) {
        prewarmLayer(
          "native-sky",
          "mushroom-distant-sky-material",
          [
            sky.userData.backdrop,
            sky.userData.stars,
            resources.aperture,
            riftVisual?.userData?.aperture,
            riftVisual?.userData?.fragments,
            riftVisual?.userData?.shards,
            ...(riftVisual?.userData?.rings ?? [])
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
        // Fresh compiles: keep the per-frame failure sweep hot for a burst so
        // asynchronously-resolving link failures are caught promptly.
        resources.shaderScanBurstFramesLeft = OBSERVATORY_SHADER_SCAN_BURST_FRAMES;
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
      resources.gaiaError = null;
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
        // Unmount teardown aborts the fetch; that is not a failure and must
        // never consume a retry attempt.
        if (error?.name === "AbortError") return;
        resources.gaiaError = error instanceof Error ? error.message : String(error);
        // Everything that reaches this catch is a network-level failure
        // (fetch rejection, HTTP error status, interrupted body). Decode
        // failures of corrupt data are caught inside replaceGaia and stay
        // permanently disabled — retrying cannot repair them — but one
        // transient blip must not drop the star layer for the session:
        // clearing the started flag lets the approach trigger retry.
        resources.gaiaFetchAttempts += 1;
        if (resources.gaiaFetchAttempts < GAIA_FETCH_MAX_ATTEMPTS) {
          resources.gaiaLoadStarted = false;
        }
      }
    };

    startRelativisticLoadRef.current = async () => {
      if (
        resources.relativisticLoadPending
        || resources.relativisticLuts
        || resources.relativisticError
        || resources.relativisticDisabled
        || !resources.relativisticSupport.supported
        || !mounted
      ) return;
      resources.relativisticLoadStarted = true;
      resources.relativisticLoadPending = true;
      resources.relativisticFetchStartedAt = performance.now();
      try {
        const luts = await loadObservatoryRelativisticLensLuts({
          fetchImpl: fetch,
          linear: resources.relativisticSupport.floatLinear,
          signal: abortController.signal
        });
        // A shader failure can disable the layer while this fetch was in
        // flight; storing the LUTs then would strand them until unmount.
        if (!mounted || resources.relativisticDisabled) {
          disposeObservatoryRelativisticLensLuts(luts);
          return;
        }
        resources.relativisticFetchMs = performance.now()
          - resources.relativisticFetchStartedAt;
        resources.relativisticLuts = luts;
        resources.relativisticError = null;
        resources.relativisticPrewarmed = false;
        if (resources.relativisticLens) {
          setObservatoryRelativisticLensLuts(
            resources.relativisticLens,
            luts,
            { ownsLuts: false }
          );
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          resources.relativisticError = error instanceof Error
            ? error.message
            : String(error);
        }
      } finally {
        resources.relativisticLoadPending = false;
      }
    };

    startKerrLoadRef.current = async () => {
      if (
        resources.kerrLoadPending
        || resources.kerrAtlases
        || resources.kerrError
        || resources.kerrDisabled
        || !resources.kerrSupport.supported
        || !mounted
      ) return;
      resources.kerrLoadStarted = true;
      resources.kerrLoadPending = true;
      resources.kerrFetchStartedAt = performance.now();
      try {
        const atlases = await loadObservatoryKerrLensAtlases({
          fetchImpl: fetch,
          signal: abortController.signal
        });
        // Mirror of the LUT guard: never store atlases for a layer that a
        // shader failure disabled while the fetch was in flight.
        if (!mounted || resources.kerrDisabled) {
          disposeObservatoryKerrLensAtlases(atlases);
          return;
        }
        resources.kerrFetchMs = performance.now()
          - resources.kerrFetchStartedAt;
        resources.kerrAtlases = atlases;
        resources.kerrError = null;
        resources.kerrPrewarmed = false;
        if (resources.kerrLens) {
          setObservatoryKerrLensAtlases(
            resources.kerrLens,
            atlases,
            { ownsAtlases: false }
          );
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          resources.kerrError = error instanceof Error
            ? error.message
            : String(error);
        }
      } finally {
        resources.kerrLoadPending = false;
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
      if (resources.blackHolePass) {
        resources.blackHolePass.composite.visible = false;
      }
      if (resources.blackHole) {
        setObservatoryBlackHoleVisible(resources.blackHole, false);
      }
      if (resources.starVolume) {
        setObservatoryStarVolumeVisible(resources.starVolume, false);
      }
      resetHiddenEffectRendering(resources, sky, riftVisual);
      if (resources.dome) resources.dome.visible = resources.domeWasVisible;
    };
    const handleContextRestored = () => {
      resources.contextRestoreCount += 1;
      queueMicrotask(() => {
        if (!mounted) return;
        resources.contextLost = false;
        resources.stencilSupported = detectStencilBuffer(gl);
        resources.halfFloatSupported = detectHalfFloatPortal(gl);
        const restoredQualityOverride = resources.diagnosticsQualityOverride
          ?? (resources.playerQualityPreference !== "auto"
            ? resources.playerQualityPreference
            : null);
        resources.requestedQuality = restoredQualityOverride;
        resources.qualityLocked = restoredQualityOverride
          && resources.stencilSupported
          ? restoredQualityOverride
          : null;
        resources.skipNextPerformanceSample = true;
        resources.handledShaderFailures.clear();
        resources.skyDisabled = false;
        resources.gaiaDisabled = false;
        resources.blackHoleDisabled = false;
        resources.relativisticSupport = getObservatoryRelativisticLensSupport(gl);
        resources.relativisticDisabled = !resources.relativisticSupport.supported;
        resources.kerrSupport = getObservatoryKerrLensSupport(gl);
        resources.kerrDisabled = !resources.kerrSupport.supported;
        resources.starVolumeDisabled = false;
        resources.nativeSkyError = null;
        resources.gaiaShaderError = null;
        resources.blackHoleError = null;
        resources.relativisticError = resources.relativisticSupport.supported
          ? null
          : "WebGL2 unavailable";
        resources.kerrError = resources.kerrSupport.supported
          ? null
          : resources.kerrSupport.fallback;
        resources.starVolumeError = null;
        resources.nativeSkyPrewarmed = false;
        resources.gaiaPrewarmed = false;
        resources.gaiaSourceMapPrewarmed = false;
        resources.blackHolePrewarmed = false;
        resources.blackHoleCompositePrewarmed = false;
        resources.relativisticPrewarmed = false;
        resources.kerrPrewarmed = false;
        resources.starVolumePrewarmed = false;
        resources.nativePrewarmMs = 0;
        resources.gaiaSourceMapPrewarmMs = 0;
        resources.blackHolePrewarmMs = 0;
        resources.relativisticPrewarmMs = 0;
        resources.kerrPrewarmMs = 0;
        resources.starVolumePrewarmMs = 0;
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
        resources.blackHoleForceUnsignedByte = false;
        disposePortalResources();
        disposeBlackHolePassResources();
        for (const texture of Object.values(resources.kerrAtlases ?? {})) {
          if (texture?.isTexture) texture.needsUpdate = true;
        }
        disposeGaiaSourceMapResources();
        if (resources.gaia) {
          disposeGaiaStarPoints(resources.gaia);
          resources.gaia = null;
        }
        const restoredInitialQuality = qualityRef.current?.quality;
        qualityRef.current = createObservatoryQualityState({
          capabilities: detectRuntimeCapabilities(
            gl,
            resources.reducedMotion,
            resources.stencilSupported
          ),
          ...(resources.qualityLocked
            ? {
                initialQuality: resources.qualityLocked,
                maximumQuality: resources.qualityLocked
              }
            : { initialQuality: restoredInitialQuality })
        });
        resources.qualityApplied = null;
        applyQuality(qualityRef.current.quality);
        if (resources.hiddenCosmosLoadRequested) {
          ensureHiddenCosmosResources(qualityRef.current.quality);
        }
        resources.portalError = null;
      });
    };
    gl.domElement.addEventListener("webglcontextlost", handleContextLost);
    gl.domElement.addEventListener("webglcontextrestored", handleContextRestored);

    const runtimeSnapshot = () => {
      const quality = qualityRef.current;
      const adaptation = adaptationRef.current;
      const target = resources.portal?.renderTarget;
      const blackHoleTarget = resources.blackHolePass?.renderTarget;
      const starCounts = getObservatoryStarVolumeCounts(
        resources.starVolume?.userData?.quality ?? quality?.quality ?? "minimum"
      );
      return {
        active: adaptation?.inLoft === true,
        quality: quality?.quality ?? "minimum",
        maximumQuality: quality?.maximumQuality ?? "minimum",
        lockedQuality: resources.qualityLocked,
        requestedQuality: resources.requestedQuality,
        skyMode: resources.comparisonMode,
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
        blackHole: {
          ready: Boolean(
            resources.blackHolePass
            && (
              resources.blackHole
              || resources.relativisticLens
              || resources.kerrLens
            )
          ),
          visible: resources.blackHolePass?.composite.visible === true,
          mode: isKerrLensPrimary(resources, quality?.quality)
            ? "kerr-atlas"
            : isRelativisticLensPrimary(resources)
              ? "schwarzschild-lut"
              : "procedural-fallback",
          type: !blackHoleTarget
            ? "disabled"
            : blackHoleTarget.texture.type === THREE.HalfFloatType
              ? "half-float"
              : "rgba8",
          quality: resources.blackHole?.userData?.quality ?? "minimum",
          width: blackHoleTarget?.width ?? 0,
          height: blackHoleTarget?.height ?? 0,
          estimatedTargetBytes: blackHoleTarget
            ? blackHoleTarget.width * blackHoleTarget.height * (
                blackHoleTarget.texture.type === THREE.HalfFloatType ? 12 : 8
              )
            : 0,
          cameraDistance: resources.blackHole?.userData?.cameraDistance ?? null,
          angularRadius: resources.blackHole?.userData?.angularRadius ?? 0,
          reveal: Math.max(
            resources.blackHole?.userData?.reveal ?? 0,
            resources.relativisticLens?.userData?.reveal ?? 0,
            resources.kerrLens?.userData?.reveal ?? 0
          ),
          addedDrawCalls: resources.blackHoleRenderedThisFrame
            ? countVisibleDrawables(resources.blackHolePass?.scene)
              + (resources.blackHolePass?.composite.visible ? 1 : 0)
            : 0,
          fboPassActive: resources.blackHoleRenderedThisFrame,
          frames: resources.blackHoleFrames,
          prewarmed: resources.blackHolePrewarmed
            && resources.blackHoleCompositePrewarmed
            && (
              !hasRelativisticLensLuts(resources)
              || resources.relativisticPrewarmed
            ),
          kerrPrewarmed: resources.kerrPrewarmed,
          prewarmMs: resources.blackHolePrewarmMs
            + resources.relativisticPrewarmMs
            + resources.kerrPrewarmMs,
          error: resources.blackHoleError
        },
        relativisticLens: {
          supported: resources.relativisticSupport.supported,
          lutFilter: resources.relativisticSupport.lutFilter,
          loading: resources.relativisticLoadPending,
          ready: isRelativisticLensPrimary(resources),
          lutReady: hasRelativisticLensLuts(resources),
          fallback: resources.relativisticLens?.userData?.fallback ?? true,
          fetchMs: resources.relativisticFetchMs,
          prewarmed: resources.relativisticPrewarmed,
          prewarmMs: resources.relativisticPrewarmMs,
          error: resources.relativisticError
        },
        kerrLens: {
          supported: resources.kerrSupport.supported,
          fallback: resources.kerrSupport.fallback,
          loading: resources.kerrLoadPending,
          ready: isKerrLensPrimary(resources, quality?.quality),
          atlasReady: isObservatoryKerrLensAtlasReady(resources.kerrAtlases),
          sourceMapReady: resources.gaiaSourceMapPrewarmed,
          sourceStarsReady: resources.kerrLens?.userData?.sourceStarsReady
            ?? false,
          quality: resources.kerrLens?.userData?.quality ?? null,
          spin: 0.94,
          inclinationDegrees: OBSERVATORY_KERR_LENS_INCLINATION_DEGREES,
          fetchMs: resources.kerrFetchMs,
          prewarmed: resources.kerrPrewarmed,
          prewarmMs: resources.kerrPrewarmMs,
          fallbackReason: resources.kerrLens?.userData?.fallbackReason ?? null,
          error: resources.kerrError ?? resources.gaiaSourceMapError
        },
        starVolume: {
          ready: Boolean(resources.starVolume),
          visible: resources.starVolume?.visible === true,
          quality: resources.starVolume?.userData?.quality ?? "minimum",
          count: starCounts.total,
          shells: 3,
          addedDrawCalls: resources.starVolume?.visible ? 1 : 0,
          reveal: resources.starVolume?.userData?.reveal ?? 0,
          motionFrozen: adaptation?.celestialMotionScale === 0,
          prewarmed: resources.starVolumePrewarmed,
          prewarmMs: resources.starVolumePrewarmMs,
          error: resources.starVolumeError
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
          sourceMap: {
            ready: Boolean(resources.gaiaSourceMap?.rendered),
            prewarmed: resources.gaiaSourceMapPrewarmed,
            quality: resources.gaiaSourceMap?.quality ?? null,
            width: resources.gaiaSourceMap?.width ?? 0,
            height: resources.gaiaSourceMap?.height ?? 0,
            includesHeroStars: Boolean(resources.gaiaSourceMap?.heroPoints),
            prewarmMs: resources.gaiaSourceMapPrewarmMs,
            error: resources.gaiaSourceMapError
          },
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
        hiddenEffects: {
          requestedRift: resources.requestedRift,
          requestedLens: resources.requestedLens,
          riftMode: resources.riftState?.mode ?? "closed",
          riftProgress: resources.riftState?.transitionProgress ?? 0,
          riftChannels: resources.riftState?.channels ?? null,
          lensAmount: resources.lensAmount,
          lensDirection: resources.lensDirection.toArray(),
          lensDistance: resources.lensDistance,
          lensAngularScale: resources.lensAngularScale,
          portalLensVisible: resources.portalLensVisible,
          blackHoleVisible: resources.blackHolePass?.composite.visible === true,
          starVolumeVisible: resources.starVolume?.visible === true
        },
        audio: audioFrameRef?.current?.audio ?? {
          supported: false,
          unlocked: false,
          contextState: "uninitialized",
          active: false
        },
        backdrop4k: {
          ready: resources.textureReady,
          error: resources.textureError,
          activeTier: resources.activeSkyTextureTier,
          highLoading: resources.highTextureLoadStarted
            && !resources.highTextureReady
            && !resources.highTextureError,
          highReady: resources.highTextureReady,
          highError: resources.highTextureError
        },
        capabilities: {
          stencil: resources.stencilSupported,
          halfFloat: resources.halfFloatSupported,
          webgl2: gl.capabilities.isWebGL2,
          contextLost: resources.contextLost,
          contextLossCount: resources.contextLossCount,
          contextRestoreCount: resources.contextRestoreCount
        }
      };
    };
    const setComparisonMode = (mode) => {
      resources.comparisonMode = mode === "base" ? "base" : "impossible";
      return resources.comparisonMode;
    };
    if (diagnosticsMode) {
      // Both QA globals stay query-gated (?observatory=test|perf), matching
      // the SetSkyMode hook: ordinary visitors get no window-level probe.
      window.__villaObservatoryRuntimeSnapshot = runtimeSnapshot;
      window.__villaObservatoryRuntimeSetSkyMode = setComparisonMode;
    }

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
      ensureHiddenCosmosRef.current = null;
      renderBlackHolePassRef.current = null;
      requestHighSkyTextureRef.current = null;
      startRelativisticLoadRef.current = null;
      startKerrLoadRef.current = null;
      updateKerrLensRef.current = null;
      if (window.__villaObservatoryRuntimeSnapshot === runtimeSnapshot) {
        delete window.__villaObservatoryRuntimeSnapshot;
      }
      if (window.__villaObservatoryRuntimeSetSkyMode === setComparisonMode) {
        delete window.__villaObservatoryRuntimeSetSkyMode;
      }
      disposePortalResources();
      disposeHiddenCosmosResources();
      disposeGaiaSourceMapResources();
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
      resetHiddenEffectRendering(resources, sky, riftVisual);
      removeMushroomSkyAperture(resources.aperture);
      if (
        backdropMaterial?.uniforms?.uSkyTexture?.value === loadedTexture
        || backdropMaterial?.uniforms?.uSkyTexture?.value === loadedHighTexture
      ) {
        backdropMaterial.uniforms.uSkyTexture.value = fallbackTexture;
      }
      loadedTexture?.dispose();
      loadedHighTexture?.dispose();
      if (audioFrameRef?.current) {
        audioFrameRef.current.inLoft = false;
        audioFrameRef.current.nearObservatory = false;
        audioFrameRef.current.visualAvailable = false;
        audioFrameRef.current.runtimeAvailable = false;
      }
      resourcesRef.current = null;
      queueMicrotask(() => {
        if (sky.userData.lifecycleToken === lifecycleToken) {
          disposeMushroomSky(sky);
        }
        if (riftVisual?.userData.lifecycleToken === lifecycleToken) {
          disposeObservatoryRiftVisual(riftVisual);
        }
        if (skyEventsVisual?.userData.lifecycleToken === lifecycleToken) {
          disposeObservatorySkyEventsVisual(skyEventsVisual);
        }
      });
    };
    // `lightsOn` is intentionally consumed by the frame director, not this
    // resource-lifecycle effect. Toggling the physical switch must never tear
    // down and rebuild the FBO, 4K texture or Gaia buffers.
  }, [
    adaptationRef,
    audioFrameRef,
    camera,
    getState,
    gl,
    interior,
    riftVisual,
    scene,
    sky,
    skyEventsVisual
  ]);

  // Player-facing quality changes update the live allocation/LOD policy in
  // place. They must never tear down the long-lived texture/FBO lifecycle
  // effect above. Query-only QA overrides remain authoritative when present.
  useEffect(() => {
    const resources = resourcesRef.current;
    if (!resources || resources.diagnosticsQualityOverride) return;

    const preference = normalizeObservatoryQualityPreference(qualityPreference);
    const requestedQuality = preference === "auto" ? null : preference;
    resources.playerQualityPreference = preference;
    resources.requestedQuality = requestedQuality;
    resources.qualityLocked = requestedQuality && resources.stencilSupported
      ? requestedQuality
      : null;

    const currentQuality = qualityRef.current?.quality;
    qualityRef.current = createObservatoryQualityState({
      capabilities: detectRuntimeCapabilities(
        gl,
        resources.reducedMotion,
        resources.stencilSupported
      ),
      ...(resources.qualityLocked
        ? {
            initialQuality: resources.qualityLocked,
            maximumQuality: resources.qualityLocked
          }
        : { initialQuality: currentQuality })
    });

    if (resources.qualityApplied !== qualityRef.current.quality) {
      applyQualityRef.current?.(qualityRef.current.quality);
    } else {
      resources.reportQualityStatus?.();
    }
  }, [gl, qualityPreference]);

  useFrame((_, delta) => {
    const resources = resourcesRef.current;
    if (!resources) return;
    // Publish a fail-closed baseline before any branch can return early. This
    // is especially important during stencil/shader/context failures: the
    // later audio bridge must never keep playing last frame's valid cosmos.
    const audioFrame = audioFrameRef?.current;
    if (audioFrame) {
      audioFrame.runtimeAvailable = false;
      audioFrame.visualAvailable = false;
    }
    resources.portalRenderedThisFrame = false;
    resources.blackHoleRenderedThisFrame = false;
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
    if (audioFrame) {
      audioFrame.inLoft = inLoft;
      audioFrame.nearObservatory = nearObservatory;
    }
    const baseImageComparison = resources.comparisonMode === "base";
    resources.requestedRift = Boolean(riftOpen);
    resources.requestedLens = Boolean(lensActive);

    if (!inLoft && (riftOpen || lensActive)) {
      if (!resources.hiddenResetRequested) {
        resources.hiddenResetRequested = true;
        onHiddenEffectsReset?.();
      }
      resetHiddenEffectRendering(resources, sky, riftVisual);
    } else {
      resources.hiddenResetRequested = false;
    }

    const hiddenSkyAvailable = resources.textureReady
      || Boolean(resources.gaia)
      || Boolean(resources.portal);
    const hiddenEffectsRenderable = resources.stencilSupported
      && !resources.contextLost
      && !resources.skyDisabled
      && !baseImageComparison
      && hiddenSkyAvailable;

    // Rare celestial events (流星雨 / 彗星 / 星云增强 / 黑洞凌日). The director
    // is stepped here — inside the single -1 frame owner — so it shares the
    // adaptation timing source and can never tick while unmounted. Eligibility
    // requires genuine stargazing: dark loft, renderable sky, stars actually
    // out. Every infrastructure failure or relight cancels via the same gate.
    const rareEligible = hiddenEffectsRenderable
      && inLoft
      && !lightsOn
      && channels.brightStarReveal >= OBSERVATORY_RARE_EVENT_MIN_STAR_REVEAL;
    resources.rareEventsState = stepObservatoryRareEvents(
      resources.rareEventsState,
      {
        deltaSeconds: frameDelta,
        eligible: rareEligible,
        availability: {
          skyLayer: Boolean(skyEventsVisual)
            && !skyEventsVisual.userData.disposed
            && !resources.skyEventsDisabled,
          nebula: Boolean(resources.portal && resources.nebula)
            && qualityRef.current?.preset?.volumetricFbo === true,
          blackHole: Boolean(resources.blackHole)
            && !resources.blackHoleDisabled
            && (qualityRef.current?.quality ?? "minimum") !== "minimum"
        },
        chancePerSecond: resources.rareEventChancePerSecond,
        forcedEvent: resources.forcedRareEvent,
        forcedSeed: resources.forcedRareEventSeed,
        random: Math.random
      }
    );
    const rareEvents = resources.rareEventsState;
    const rareChannels = rareEvents.channels;
    // The HUD caption and the journal sighting both wait for the envelope to
    // genuinely open (≥ 0.5): a relight one second in never records an event
    // the player could not actually have seen.
    const rareEventForHud = rareEvents.mode === "active"
      && rareEvents.intensity >= 0.5
      ? rareEvents.event
      : null;
    if (rareEventForHud !== resources.lastReportedRareEvent) {
      resources.lastReportedRareEvent = rareEventForHud;
      onRareEventChangeRef.current?.(rareEventForHud);
    }

    let nativeLensAmount = 0;
    if (!hiddenEffectsRenderable) {
      // Infrastructure failures and the QA base-image comparison fail closed
      // immediately. A gradual close here could reveal an unstencilled void.
      resetHiddenEffectRendering(resources, sky, riftVisual);
    } else {
      const riftVisualAvailable = riftVisual && !riftVisual.userData.disposed;
      resources.riftState = riftVisualAvailable
        ? stepObservatoryRift(resources.riftState, {
            deltaSeconds: frameDelta,
            targetOpen: !lightsOn && riftOpen,
            inLoft,
            reducedMotion: resources.reducedMotion
          })
        : createObservatoryRiftState({ reducedMotion: resources.reducedMotion });
      const riftChannels = resources.riftState.channels;
      updateRiftFadeSurfaces(resources, riftChannels.wallDissolve);
      if (riftVisualAvailable) {
        updateObservatoryRiftVisual(riftVisual, riftChannels, frameDelta, {
          pixelRatio: gl.getPixelRatio()
        });
      }

      // 黑洞凌日 reuses the entire hidden-F lens pipeline: the event envelope
      // feeds the same damped reveal target, so the transit inherits the Kerr
      // → Schwarzschild → analytic fail-soft ladder, the FBO pass and the
      // audio layer without any second code path.
      const lensTarget = inLoft && !lightsOn
        ? Math.max(lensActive ? 1 : 0, rareChannels.blackHole)
        : 0;
      resources.lensAmount = THREE.MathUtils.damp(
        resources.lensAmount,
        lensTarget,
        lensTarget > resources.lensAmount ? LENS_REVEAL_DAMPING : LENS_HIDE_DAMPING,
        frameDelta
      );
      if (resources.lensAmount < 0.0005) resources.lensAmount = 0;
      if (resources.lensAmount > 0.9995) resources.lensAmount = 1;

      lensDirectionScratch.copy(LENS_WORLD_POSITION).sub(camera.position);
      resources.lensDistance = Math.max(lensDirectionScratch.length(), 0.001);
      resources.lensDirection.copy(lensDirectionScratch)
        .multiplyScalar(1 / resources.lensDistance);
      resources.lensAngularScale = THREE.MathUtils.clamp(
        LENS_WORLD_DISTANCE / resources.lensDistance,
        LENS_DISTANCE_SCALE_MIN,
        LENS_DISTANCE_SCALE_MAX
      );
      const einsteinRadius = MUSHROOM_SKY_LENS_DEFAULT_EINSTEIN_RADIUS
        * resources.lensAngularScale;
      const influenceRadius = MUSHROOM_SKY_LENS_DEFAULT_INFLUENCE_RADIUS
        * resources.lensAngularScale;
      const horizonRadius = MUSHROOM_SKY_LENS_DEFAULT_HORIZON_RADIUS
        * resources.lensAngularScale;
      const activeLensQuality = qualityRef.current?.quality ?? "minimum";
      const kerrPrimary = isKerrLensPrimary(resources, activeLensQuality);
      const sourceMaskAmount = kerrPrimary
        ? resources.lensAmount * Math.max(
            channels.portalReveal,
            channels.brightStarReveal
          )
        : 0;
      const sourceMaskRadius = Math.atan(
        OBSERVATORY_KERR_LENS_ALPHA_EXTENT
          * KERR_MASS_WORLD_SCALE
          / Math.max(resources.lensDistance, 0.001)
      );
      nativeLensAmount = (kerrPrimary || isRelativisticLensPrimary(resources))
        ? 0
        : resources.lensAmount;
      setMushroomSkyLens(sky, {
        amount: nativeLensAmount,
        direction: resources.lensDirection,
        einsteinRadius,
        influenceRadius,
        horizonRadius,
        // The native ring remains a fail-soft fallback. The finite 3D pass
        // supplies the dominant photon shells whenever it is available.
        ringStrength: resources.blackHolePass && !resources.blackHoleDisabled
          ? 0.2
          : 1.55,
        sourceMaskAmount,
        sourceMaskRadius
      });
    }
    const riftChannels = resources.riftState.channels;

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
      if (qualityRef.current?.quality === "high") {
        requestHighSkyTextureRef.current?.();
      }
      startRelativisticLoadRef.current?.();
      if (
        qualityRef.current?.quality === "high"
        || qualityRef.current?.quality === "medium"
      ) {
        startKerrLoadRef.current?.();
      }
      startGaiaLoadRef.current?.();
      if (!resources.hiddenCosmosLoadRequested) {
        resources.hiddenCosmosLoadRequested = true;
      }
      ensureHiddenCosmosRef.current?.(qualityRef.current.quality);
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
    resources.frameIndex += 1;
    // Throttled catch-all sweep for main-scene observatory materials (the
    // portal/black-hole passes and prewarm already scan inline after their
    // own renders). Burst frames follow compile events; otherwise a slow
    // heartbeat suffices, and far from the observatory nothing new can fail.
    const shaderScanDue = (inLoft || nearObservatory)
      && (
        resources.shaderScanBurstFramesLeft > 0
        || resources.frameIndex - resources.lastShaderScanFrame
          >= OBSERVATORY_SHADER_SCAN_INTERVAL_FRAMES
      );
    if (shaderScanDue) {
      if (resources.shaderScanBurstFramesLeft > 0) {
        resources.shaderScanBurstFramesLeft -= 1;
      }
      resources.lastShaderScanFrame = resources.frameIndex;
      const shaderFailure = findObservatoryShaderFailure(
        gl,
        resources.handledShaderFailures
      );
      if (shaderFailure) handleShaderFailureRef.current?.(shaderFailure);
    }

    if (
      !resources.stencilSupported
      || resources.contextLost
      || resources.skyDisabled
    ) {
      sky.visible = false;
      if (resources.aperture) resources.aperture.visible = false;
      if (resources.gaia) resources.gaia.visible = false;
      if (resources.portal) resources.portal.composite.visible = false;
      resetHiddenEffectRendering(resources, sky, riftVisual);
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
    const skyBackdropMaterial = sky.userData.backdrop?.material;
    if (skyBackdropMaterial?.uniforms?.uBrightness) {
      const backgroundFactor = Math.max(
        0.24,
        1
          - riftChannels.backdropSuppression * 0.62
          - resources.lensAmount * 0.12
      );
      skyBackdropMaterial.uniforms.uBrightness.value = baseImageComparison
        ? BASE_IMAGE_COMPARISON_BRIGHTNESS
        : MUSHROOM_SKY_IMAGE_BRIGHTNESS * backgroundFactor;
    }
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
      // A transiting moon washes out the fainter half of the hero stars —
      // the honest dark-adaptation cost of moonlight.
      starReveal: baseImageComparison
        ? 0
        : channels.brightStarReveal * (1 - rareChannels.moon * 0.35),
      forceActive,
      activeEnabled: celestialVisible
    });
    if (!skyIsActive && riftVisual) riftVisual.visible = false;

    if (skyEventsVisual) {
      const skyEventsActive = skyIsActive && !baseImageComparison;
      updateObservatorySkyEventsVisual(skyEventsVisual, {
        timeSeconds: sky.userData.elapsed ?? 0,
        channels: skyEventsActive ? rareChannels : null,
        progress: rareEvents.progress,
        seed: rareEvents.seed,
        motionScale: adaptation.celestialMotionScale,
        // Event layers live among the stars; scaling by the star reveal
        // keeps a cancelled event from outliving the relighting sky.
        intensityScale: Math.max(
          channels.brightStarReveal,
          channels.faintStarReveal
        )
      });
    }

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
      resources.gaia.visible = !baseImageComparison
        && skyIsActive
        && channels.faintStarReveal > 0.001;
      setGaiaStarPixelRatio(resources.gaia, gl.getPixelRatio());
      // Moonlight suppresses the faint Gaia field hardest, exactly like a
      // real bright-moon night.
      setGaiaStarReveal(
        resources.gaia,
        channels.faintStarReveal * (1 - rareChannels.moon * 0.8)
      );
      setGaiaStarLens(resources.gaia, {
        amount: nativeLensAmount,
        direction: resources.lensDirection,
        einsteinRadius: MUSHROOM_SKY_LENS_DEFAULT_EINSTEIN_RADIUS
          * resources.lensAngularScale,
        influenceRadius: MUSHROOM_SKY_LENS_DEFAULT_INFLUENCE_RADIUS
          * resources.lensAngularScale,
        sourceMaskAmount: isKerrLensPrimary(
          resources,
          qualityRef.current?.quality ?? "minimum"
        )
          ? resources.lensAmount * Math.max(
              channels.portalReveal,
              channels.brightStarReveal
            )
          : 0,
        sourceMaskRadius: Math.atan(
          OBSERVATORY_KERR_LENS_ALPHA_EXTENT
            * KERR_MASS_WORLD_SCALE
            / Math.max(resources.lensDistance, 0.001)
        )
      });
    }

    const state = getState();
    const hiddenQuality = qualityRef.current?.quality ?? "minimum";
    const celestialTime = sky.userData.elapsed ?? 0;
    const finiteLensGate = skyIsActive
      && !baseImageComparison
      && inLoft
      && resources.lensAmount > PORTAL_REVEAL_EPSILON;
    const finiteStarAmount = Math.max(
      resources.lensAmount,
      riftChannels.foregroundDepth
    );
    const finiteStarGate = skyIsActive
      && !baseImageComparison
      && inLoft
      && finiteStarAmount > PORTAL_REVEAL_EPSILON;

    if (resources.starVolume) {
      const starVolumeReveal = finiteStarGate
        ? finiteStarAmount * Math.max(
            channels.brightStarReveal,
            channels.faintStarReveal
          )
        : 0;
      setObservatoryStarVolumeVisible(
        resources.starVolume,
        finiteStarGate && !resources.starVolumeDisabled
      );
      updateObservatoryStarVolume(
        resources.starVolume,
        camera,
        celestialTime,
        starVolumeReveal,
        {
          motionScale: adaptation.celestialMotionScale,
          quality: hiddenQuality,
          pixelRatio: gl.getPixelRatio()
        }
      );
    }

    const blackHoleReveal = finiteLensGate
      ? resources.lensAmount * Math.max(
          channels.portalReveal,
          channels.brightStarReveal
        )
      : 0;
    const relativisticPrimary = isRelativisticLensPrimary(resources)
      && hiddenQuality !== "minimum";
    const kerrPrimary = isKerrLensPrimary(resources, hiddenQuality);
    const fallbackBlackHoleVisible = finiteLensGate
      && hiddenQuality !== "minimum"
      && !resources.blackHoleDisabled
      && !relativisticPrimary;
    let fallbackBlackHoleActive = false;
    if (resources.blackHole) {
      setObservatoryBlackHoleVisible(
        resources.blackHole,
        fallbackBlackHoleVisible
      );
      fallbackBlackHoleActive = updateObservatoryBlackHole(
        resources.blackHole,
        camera,
        celestialTime,
        fallbackBlackHoleVisible ? blackHoleReveal : 0,
        hiddenQuality
      );
    }

    let relativisticActive = false;
    if (resources.relativisticLens) {
      const relativisticVisible = finiteLensGate && relativisticPrimary;
      setObservatoryRelativisticLensVisible(
        resources.relativisticLens,
        relativisticVisible
      );
      relativisticActive = updateObservatoryRelativisticLens(
        resources.relativisticLens,
        camera,
        {
          timeSeconds: celestialTime,
          reveal: relativisticVisible ? blackHoleReveal : 0,
          quality: hiddenQuality,
          skyTexture: skyBackdropMaterial?.uniforms?.uSkyTexture?.value ?? null,
          luts: resources.relativisticLuts,
          lensPosition: LENS_WORLD_POSITION,
          discNormal: RELATIVISTIC_DISC_NORMAL,
          skyRotation: getRelativisticSkyRotation(sky),
          skyBrightness: skyBackdropMaterial?.uniforms?.uBrightness?.value
            ?? MUSHROOM_SKY_IMAGE_BRIGHTNESS,
          blackHoleRadius: 1.35,
          discInnerRadius: 3.08,
          // Matches the Kerr path's extended ribbon disc so the Low tier and
          // the underlay keep the same dominant-disc composition.
          discOuterRadius: KERR_DISC_OUTER_RADIUS,
          // Kerr owns the visible disc in High/Medium. Keep the Schwarzschild
          // ray warp and shadow hot as the per-pixel underlay, but suppress its
          // larger analytic disc so it cannot protrude beyond the square Kerr
          // atlas as two bright fallback wedges. Low still gets the full disc.
          discOpacity: kerrPrimary ? 0 : 0.94,
          // The acceptance cone tracks the enlarged apparent event; 0.48 rad
          // at presentation scale 1.5 preserves the original headroom ratio
          // between the luminous disc and the shader's angular cutoff.
          influenceRadius: 0.48
            * OBSERVATORY_BLACK_HOLE_PRESENTATION_SCALE
            * resources.lensAngularScale,
          hdrOutput: resources.blackHolePass?.renderTarget?.texture?.type
            === THREE.HalfFloatType
        }
      );
    }
    let kerrActive = false;
    if (resources.kerrLens) {
      const kerrVisible = finiteLensGate && kerrPrimary;
      setObservatoryKerrLensVisible(resources.kerrLens, kerrVisible);
      kerrActive = updateKerrLensRef.current?.(camera, {
        timeSeconds: celestialTime,
        reveal: kerrVisible ? blackHoleReveal : 0,
        quality: hiddenQuality,
        starSourceBrightness: KERR_STAR_SOURCE_BRIGHTNESS * Math.max(
          channels.brightStarReveal * 0.52,
          channels.faintStarReveal
        )
      }) === true;
    }
    const blackHoleActive = kerrActive
      || relativisticActive
      || fallbackBlackHoleActive;

    if (resources.blackHolePass) {
      const blackHoleTargetKey = [
        Math.round(state.size.width),
        Math.round(state.size.height),
        gl.getPixelRatio().toFixed(2),
        hiddenQuality
      ].join(":");
      if (
        hiddenQuality !== "minimum"
        && blackHoleTargetKey !== resources.blackHoleLastTargetKey
      ) {
        resizeObservatoryBlackHolePass(resources.blackHolePass, {
          width: state.size.width,
          height: state.size.height,
          pixelRatio: gl.getPixelRatio(),
          quality: hiddenQuality
        });
        resources.blackHoleLastTargetKey = blackHoleTargetKey;
        resources.blackHoleFramebufferChecked = false;
      }
      updateObservatoryBlackHolePassComposite(
        resources.blackHolePass.composite,
        { reveal: 1, visible: false }
      );
      const blackHoleRendered = blackHoleActive
        && renderBlackHolePassRef.current?.() === true;
      updateObservatoryBlackHolePassComposite(
        resources.blackHolePass.composite,
        { visible: blackHoleRendered }
      );
    }

    // Publish the values that actually reached the renderer. The audio bridge
    // runs at priority -0.5 after this -1 director, so it consumes the exact
    // same light adaptation, Rift transition and lens reveal without owning a
    // second timer or trusting the earlier React request booleans.
    if (audioFrame) {
      audioFrame.deltaSeconds = frameDelta;
      audioFrame.celestialTime = celestialTime;
      audioFrame.inLoft = inLoft;
      audioFrame.nearObservatory = nearObservatory;
      audioFrame.runtimeAvailable = !resources.contextLost
        && resources.stencilSupported;
      audioFrame.visualAvailable = hiddenEffectsRenderable
        && skyIsActive
        && !baseImageComparison;
      audioFrame.adaptationMode = adaptation.mode;
      audioFrame.adaptationChannels = channels;
      audioFrame.riftState = resources.riftState;
      audioFrame.lensAmount = resources.lensAmount;
      audioFrame.blackHoleReveal = blackHoleReveal;
      // The transit already sounds through lensAmount; the id/intensity let a
      // future audio layer give meteors or the surge their own voice.
      audioFrame.rareEvent = rareEvents.event;
      audioFrame.rareEventIntensity = rareEvents.intensity;
      audioFrame.lensAngularScale = resources.lensAngularScale;
      audioFrame.quality = hiddenQuality;
      audioFrame.reducedMotion = resources.reducedMotion;
      audioFrame.sourcePositions = resources.audioSourcePositions
        ?? audioFrame.sourcePositions;
    }

    const portal = resources.portal;
    if (!portal || !resources.nebula) return;

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

    lensScreenScratch.set(0.5, 0.5);
    resources.portalLensVisible = resources.lensAmount > 0
      && projectObservatoryPortalLens(camera, LENS_WORLD_POSITION, lensScreenScratch);
    updateObservatoryPortalComposite(portal.composite, {
      reveal: Math.min(
        1,
        channels.nebulaReveal
          * (1 + rareChannels.nebulaBoost * NEBULA_SURGE_REVEAL_GAIN)
      ),
      emissionStrength: NEBULA_EMISSION_STRENGTH
        * (1 + rareChannels.nebulaBoost * NEBULA_SURGE_EMISSION_GAIN),
      extinctionStrength: NEBULA_EXTINCTION_STRENGTH,
      lensAmount: resources.portalLensVisible ? resources.lensAmount : 0,
      lensCenter: lensScreenScratch,
      lensAspect: state.size.width / Math.max(1, state.size.height),
      lensRadius: OBSERVATORY_PORTAL_DEFAULT_LENS_RADIUS
        * resources.lensAngularScale
    });
    portal.composite.visible = skyIsActive
      && !baseImageComparison
      && channels.nebulaReveal > PORTAL_REVEAL_EPSILON;

    const shouldPrewarm = nearObservatory && !resources.portalPrewarmed;
    const shouldAnimate = !baseImageComparison
      && inLoft
      && channels.nebulaReveal > PORTAL_REVEAL_EPSILON;
    if (!shouldPrewarm && !shouldAnimate) return;

    updateObservatoryPortalCamera(camera, portal.camera, {
      portalOrigin: PORTAL_ORIGIN,
      cosmosOrigin: COSMOS_ORIGIN,
      parallaxScale: Math.min(
        0.58,
        portal.parallaxScale * (
          1 + riftChannels.foregroundParallax * 0.85
        ) + riftChannels.foregroundParallax * 0.08
      )
    });
    const parallax = portal.camera.userData.observatoryParallaxOffset;
    // updateMushroomNebula copies the resolution into its uniform, so a
    // module-scope scratch avoids a fresh array allocation every frame.
    portalResolutionScratch[0] = portal.renderTarget.width;
    portalResolutionScratch[1] = portal.renderTarget.height;
    updateMushroomNebula(resources.nebula, frameDelta, {
      reveal: 1,
      parallax,
      resolution: portalResolutionScratch,
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
