import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  getObservatoryQualityPreset
} from "../src/villa-map/observatory-quality.js";

function readSource(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
    "utf8"
  );
}

function withoutWhitespace(source) {
  return source.replace(/\s+/g, " ");
}

function matchCount(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

const runtime = readSource(
  "src/villa-map/react/MushroomObservatoryRuntime.jsx"
);
const scene = readSource("src/villa-map/react/Scene.jsx");
const diagnostics = readSource(
  "src/villa-map/react/ObservatoryDiagnostics.jsx"
);
const gaia = readSource("src/villa-map/gaia-stars.js");

test("the -1 frame director owns one shared adaptation state and maps every channel", () => {
  assert.equal(
    matchCount(runtime, /\buseFrame\s*\(/g),
    1,
    "the runtime should have one ordered frame director"
  );
  assert.match(
    runtime,
    /useFrame\s*\(\s*\([^)]*\)\s*=>\s*\{[\s\S]*?stepObservatoryAdaptation\([\s\S]*?\n\s*\},\s*-1\s*\);/,
    "the observatory update must run after controls (-2) and before normal render"
  );

  for (const component of [
    "MushroomObservatoryLights",
    "MushroomObservatoryPalette",
    "MushroomObservatoryExposure",
    "MushroomObservatoryRuntime"
  ]) {
    assert.match(
      scene,
      new RegExp(
        `<${component}\\b[\\s\\S]*?adaptationRef=\\{observatoryAdaptationRef\\}[\\s\\S]*?\\/>`
      ),
      `${component} must consume the same shared adaptation ref`
    );
  }

  assert.ok(
    matchCount(
      scene,
      /const houseLight = adaptationRef\.current\?\.channels\?\.houseLight \?\? 1;/g
    ) >= 4,
    "lighting, palette, exposure and markers should follow houseLight"
  );
  assert.match(runtime, /backdropReveal:\s*channels\.portalReveal/);
  assert.match(
    runtime,
    /starReveal:\s*baseImageComparison \? 0 : channels\.brightStarReveal/
  );
  assert.match(
    runtime,
    /resources\.dome\.material\.color\.copy\([\s\S]*?channels\.roomDarkness/
  );
  assert.match(
    runtime,
    /setGaiaStarReveal\(resources\.gaia,\s*channels\.faintStarReveal\)/
  );
  assert.match(
    runtime,
    /updateObservatoryPortalComposite\([\s\S]*?channels\.nebulaReveal/
  );
  assert.match(runtime, /emissionStrength:\s*NEBULA_EMISSION_STRENGTH/);
  assert.match(runtime, /extinctionStrength:\s*NEBULA_EXTINCTION_STRENGTH/);
  assert.ok(
    matchCount(
      runtime,
      /reducedMotion:\s*adaptation\.celestialMotionScale === 0/g
    ) >= 2,
    "one motion channel must freeze both the native sky and nebula"
  );
});

test("only the volumetric nebula enters the FBO portal", () => {
  const portalAdds = [...runtime.matchAll(
    /resources\.portalScene\.add\(\s*([^\n;)]+)\s*\)/g
  )].map((match) => match[1].trim());

  assert.deepEqual(
    portalAdds,
    ["resources.nebula"],
    "the 4K panorama, hero stars and Gaia must not be downsampled into the FBO"
  );
  assert.match(
    runtime,
    /gl\.render\(resources\.portalScene,\s*portal\.camera\)/
  );
  assert.match(runtime, /scene\.add\(resources\.portal\.composite\)/);
  assert.match(runtime, /updateMushroomSky\(sky,\s*camera\.position/);
  assert.doesNotMatch(
    runtime,
    /portalScene\.add\([^)]*(?:gaia|sky|backdrop|stars)/i
  );
});

test("R and F share one distant star volume while the finite black hole remains F-only", () => {
  for (const factory of [
    "createObservatoryBlackHole",
    "createObservatoryBlackHolePass",
    "createObservatoryStarVolume"
  ]) {
    assert.match(runtime, new RegExp(`${factory}\\(`));
  }
  assert.match(
    runtime,
    /resources\.blackHolePass\.scene\.add\(resources\.blackHole\)/,
    "the self-occluding 3D object must render in its own depth buffer"
  );
  assert.match(
    runtime,
    /scene\.add\(resources\.starVolume\)/,
    "finite stars stay native-resolution in the stencil-clipped main scene"
  );
  assert.match(runtime, /updateObservatoryBlackHolePassCamera\(camera, pass\)/);
  assert.match(runtime, /gl\.setClearColor\(0x000000, 0\)/);
  assert.match(runtime, /gl\.clear\(true, true, false\)/);
  assert.match(runtime, /gl\.render\(pass\.scene, pass\.camera\)/);
  assert.match(
    runtime,
    /updateObservatoryStarVolume\([\s\S]*?motionScale:\s*adaptation\.celestialMotionScale[\s\S]*?quality:\s*hiddenQuality/
  );
  const sharedStarAmount = runtime.match(
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*Math\.max\(\s*resources\.lensAmount,\s*riftChannels\.foregroundDepth\s*\)/
  );
  assert.ok(
    sharedStarAmount,
    "the distant star volume must use the stronger of the R depth and F lens channels"
  );
  const sharedStarAmountName = sharedStarAmount[1];
  const starVolumeReveal = runtime.match(
    /const\s+starVolumeReveal\s*=([\s\S]*?);/
  );
  assert.ok(starVolumeReveal);
  assert.match(
    starVolumeReveal[1],
    new RegExp(`\\b${sharedStarAmountName}\\b`),
    "both hidden effects must reveal the same finite star field"
  );

  const lensOnlyGate = runtime.match(
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*skyIsActive[\s\S]{0,320}?resources\.lensAmount\s*>\s*PORTAL_REVEAL_EPSILON\s*;/
  );
  assert.ok(lensOnlyGate, "the finite black-hole pass needs a separate F-only gate");
  const blackHoleReveal = runtime.match(
    /const\s+blackHoleReveal\s*=([\s\S]*?);/
  );
  assert.ok(blackHoleReveal);
  assert.match(blackHoleReveal[1], new RegExp(`\\b${lensOnlyGate[1]}\\b`));
  assert.match(blackHoleReveal[1], /resources\.lensAmount/);
  assert.doesNotMatch(
    blackHoleReveal[1],
    /riftChannels\.foregroundDepth/,
    "R may add distant stars but must never summon the F-only black hole"
  );
  assert.match(runtime, /hiddenQuality !== "minimum"/);
  assert.match(runtime, /createObservatoryBlackHole\(\{[\s\S]*?scale:\s*1,/);
  assert.match(
    runtime,
    /else if \(quality === "minimum"\)[\s\S]*?disposeBlackHolePassResources\(\)/,
    "Minimum must release the finite black-hole FBO and keep the legacy lens"
  );
});

test("the Bruneton Schwarzschild layer stays hot beneath the physical Kerr path", () => {
  for (const api of [
    "loadObservatoryRelativisticLensLuts",
    "createObservatoryRelativisticLens",
    "updateObservatoryRelativisticLens",
    "prewarmObservatoryRelativisticLens"
  ]) {
    assert.match(runtime, new RegExp(`${api}\\(`));
  }
  assert.match(
    runtime,
    /resources\.blackHolePass\.scene\.add\(resources\.relativisticLens\)/,
    "the HDR lens must share the finite black-hole FBO and its stencil composite"
  );
  assert.match(
    runtime,
    /loadObservatoryRelativisticLensLuts\(\{[\s\S]*?linear:\s*resources\.relativisticSupport\.floatLinear,[\s\S]*?signal:\s*abortController\.signal/
  );
  assert.match(
    runtime,
    /resources\.relativisticLoadPending[\s\S]*?\|\| resources\.relativisticLuts[\s\S]*?resources\.relativisticLoadPending = true;[\s\S]*?finally \{\s*resources\.relativisticLoadPending = false;/
  );
  assert.match(runtime, /const relativisticPrimary = isRelativisticLensPrimary\(resources\)/);
  assert.match(runtime, /&& !relativisticPrimary;/);
  assert.match(
    runtime,
    /nativeLensAmount = \(kerrPrimary \|\| isRelativisticLensPrimary\(resources\)\)[\s\S]*?\? 0[\s\S]*?: resources\.lensAmount/
  );
  assert.match(
    runtime,
    /updateObservatoryRelativisticLens\([\s\S]*?skyTexture:\s*skyBackdropMaterial\?\.uniforms\?\.uSkyTexture[\s\S]*?skyRotation:\s*getRelativisticSkyRotation\(sky\)[\s\S]*?hdrOutput:/
  );
  assert.match(runtime, /blackHoleRadius:\s*1\.35/);
  assert.match(runtime, /discOuterRadius:\s*7\.6/);
  assert.match(runtime, /discOpacity:\s*kerrPrimary \? 0 : 0\.94/);
  assert.match(
    runtime,
    /RELATIVISTIC_DISC_NORMAL = new THREE\.Vector3\(0\.62, 0\.52, 0\.59\)\.normalize\(\)/
  );
  assert.match(runtime, /observatoryShaderFailure === "relativistic-lens"/);
  assert.match(
    runtime,
    /mode:\s*isKerrLensPrimary\(resources, quality\?\.quality\)[\s\S]*?"schwarzschild-lut"/
  );
});

test("High and Medium use one offline Kerr exit ray for photo, Gaia and hero stars", () => {
  for (const api of [
    "loadObservatoryKerrLensAtlases",
    "createObservatoryKerrLens",
    "updateObservatoryKerrLens",
    "prewarmObservatoryKerrLens",
    "createObservatoryGaiaSourceMap"
  ]) {
    assert.match(runtime, new RegExp(`${api}\\(`));
  }
  assert.match(
    runtime,
    /createObservatoryGaiaSourceMap\([\s\S]*?resources\.gaia,[\s\S]*?heroStars:\s*sky\.userData\.stars/
  );
  assert.match(
    runtime,
    /resources\.blackHolePass\.scene\.add\(resources\.relativisticLens\)[\s\S]*?resources\.blackHolePass\.scene\.add\(resources\.kerrLens\)/,
    "Schwarzschild must render first as the already-hot per-pixel underlay"
  );
  assert.match(
    runtime,
    /loadObservatoryKerrLensAtlases\(\{[\s\S]*?fetchImpl:\s*fetch,[\s\S]*?signal:\s*abortController\.signal/
  );
  assert.match(
    runtime,
    /function isKerrLensPrimary\(resources, quality\)[\s\S]*?quality === "high"[\s\S]*?quality === "medium"[\s\S]*?resources\.gaiaSourceMapPrewarmed === true[\s\S]*?isRelativisticLensPrimary\(resources\)/
  );
  assert.match(
    runtime,
    /updateObservatoryKerrLens\(resources\.kerrLens,[\s\S]*?skyTexture:[\s\S]*?starSourceTexture:\s*resources\.gaiaSourceMap\?\.texture[\s\S]*?kerrToWorld:[\s\S]*?skyRotation:[\s\S]*?starSourceRotation:/
  );
  assert.match(runtime, /sourceMaskAmount:\s*isKerrLensPrimary\(/);
  assert.match(runtime, /observatoryShaderFailure === "kerr-lens"/);
  assert.match(
    runtime,
    /mode:\s*isKerrLensPrimary\(resources, quality\?\.quality\)[\s\S]*?"kerr-atlas"/
  );
});

test("Gaia stays one native-resolution main-scene Points draw behind the roof stencil", () => {
  assert.equal(
    matchCount(gaia, /new THREE\.Points\s*\(/g),
    1,
    "the catalogue factory must issue one Points draw"
  );
  assert.doesNotMatch(gaia, /new THREE\.(?:Group|Mesh)\s*\(/);
  assert.match(runtime, /resources\.gaia = createGaiaStarPoints\(/);
  assert.match(runtime, /scene\.add\(resources\.gaia\)/);
  assert.match(runtime, /resources\.gaia\.position\.copy\(camera\.position\)/);
  assert.match(runtime, /material\.stencilWrite = true/);
  assert.match(runtime, /material\.stencilRef = 7/);
  assert.match(runtime, /material\.stencilFunc = THREE\.EqualStencilFunc/);
  assert.match(runtime, /points\.renderOrder = GAIA_RENDER_ORDER/);
});

test("Low and Minimum remove the volumetric FBO while preserving fallbacks", () => {
  for (const quality of ["low", "minimum"]) {
    const preset = getObservatoryQualityPreset(quality);
    assert.equal(preset.volumetricFbo, false, `${quality} must allocate no FBO`);
    assert.equal(preset.portalQuality, null);
    assert.equal(preset.nebulaQuality, null);
    assert.equal(preset.backdrop4k, true);
    assert.equal(preset.proceduralStarsFallback, true);
  }

  const compact = withoutWhitespace(runtime);
  assert.match(
    compact,
    /preset\.volumetricFbo && resources\.portalLoadRequested && resources\.stencilSupported[\s\S]*?createPortalResources\(preset\)/
  );
  assert.match(
    compact,
    /else if \(!preset\.volumetricFbo \|\| !resources\.stencilSupported\) \{ disposePortalResources\(\); \}/
  );
  assert.match(runtime, /if \(quality === "low"\) return "low"/);
  assert.match(runtime, /return null;/);
});

test("catalogue fetch is abortable and all owned GPU/browser resources are cleaned", () => {
  assert.match(runtime, /const abortController = new AbortController\(\)/);
  assert.match(
    runtime,
    /fetch\(GAIA_STAR_CATALOG_URL,\s*\{\s*signal:\s*abortController\.signal\s*\}\)/
  );
  assert.match(runtime, /resources\.gaiaLoadStarted \|\| !mounted/);
  assert.match(
    runtime,
    /const replacement = isHighTexture && loadedTexture\?\.isTexture[\s\S]*?\? loadedTexture[\s\S]*?: fallbackTexture;[\s\S]*?loadedTexture === texture[\s\S]*?loadedHighTexture === texture[\s\S]*?texture\.dispose\(\);[\s\S]*?replacement\?\.isTexture/
  );

  for (const cleanup of [
    /abortController\.abort\(\)/,
    /removeEventListener\?\.\("change",\s*syncMotionPreference\)/,
    /disposePortalResources\(\)/,
    /disposeHiddenCosmosResources\(\)/,
    /disposeObservatoryBlackHolePass\(resources\.blackHolePass\)/,
    /disposeObservatoryBlackHole\(resources\.blackHole\)/,
    /disposeObservatoryRelativisticLens\(resources\.relativisticLens\)/,
    /disposeObservatoryRelativisticLensLuts\(resources\.relativisticLuts\)/,
    /disposeObservatoryKerrLens\(resources\.kerrLens\)/,
    /disposeObservatoryKerrLensAtlases\(resources\.kerrAtlases\)/,
    /disposeObservatoryGaiaSourceMap\(resources\.gaiaSourceMap\)/,
    /disposeObservatoryStarVolume\(resources\.starVolume\)/,
    /disposeGaiaStarPoints\(resources\.gaia\)/,
    /removeMushroomSkyAperture\(resources\.aperture\)/,
    /loadedTexture\?\.dispose\(\)/,
    /disposeMushroomSky\(sky\)/
  ]) {
    assert.match(runtime, cleanup);
  }
  assert.match(runtime, /resourcesRef\.current = null/);
});

test("the portal resizes on viewport, DPR or tier changes", () => {
  assert.match(
    runtime,
    /const targetKey = \[[\s\S]*?state\.size\.width[\s\S]*?state\.size\.height[\s\S]*?gl\.getPixelRatio\(\)[\s\S]*?qualityRef\.current\.quality[\s\S]*?\]\.join\(":"\)/
  );
  assert.match(
    runtime,
    /resizeObservatoryPortal\(portal,\s*\{[\s\S]*?width:\s*state\.size\.width[\s\S]*?height:\s*state\.size\.height[\s\S]*?pixelRatio:\s*gl\.getPixelRatio\(\)[\s\S]*?quality:\s*qualityRef\.current\.preset\.portalQuality[\s\S]*?\}\)/
  );
  assert.match(
    runtime,
    /resources\.lastTargetKey = targetKey;\s*resources\.framebufferChecked = false;/
  );
});

test("HalfFloat failure rebuilds as RGBA8 and a second failure falls back to Low", () => {
  assert.match(
    runtime,
    /halfFloatSupported && !resources\.forceUnsignedByte\s*\? THREE\.HalfFloatType\s*:\s*THREE\.UnsignedByteType/
  );
  assert.match(runtime, /resources\.forceUnsignedByte = true/);
  assert.match(
    runtime,
    /resources\.halfFloatSupported[\s\S]*?&& !resources\.blackHoleForceUnsignedByte[\s\S]*?\? THREE\.HalfFloatType[\s\S]*?: THREE\.UnsignedByteType/
  );
  assert.match(
    runtime,
    /failedTargetWasHalfFloat[\s\S]*?!resources\.blackHoleForceUnsignedByte[\s\S]*?resources\.blackHoleForceUnsignedByte = true;[\s\S]*?disposeBlackHolePassResources\(\);[\s\S]*?ensureHiddenCosmosResources\(/
  );
  assert.match(
    runtime,
    /resources\.forceUnsignedByte = true;[\s\S]*?resources\.qualityApplied = null;[\s\S]*?applyQuality\(qualityRef\.current\?\.quality \?\? "medium"\)/
  );
  assert.match(
    runtime,
    /initialQuality:\s*"low",\s*maximumQuality:\s*"low"/
  );
  assert.match(
    runtime,
    /type:\s*!target[\s\S]*?\? "disabled"[\s\S]*?: target\.texture\.type === THREE\.HalfFloatType[\s\S]*?\? "half-float"[\s\S]*?: "rgba8"/
  );
  assert.match(runtime, /gl\.setRenderTarget\(previousTarget\)/);
  assert.match(runtime, /gl\.xr\.enabled = previousXrEnabled/);
  assert.match(
    runtime,
    /gl\.setRenderTarget\(pass\.renderTarget\);[\s\S]*?checkFramebufferStatus[\s\S]*?if \(prewarm\) gl\.setRenderTarget\(getNativePrewarmTarget\(\)\);[\s\S]*?gl\.render\(pass\.scene, pass\.camera\)/
  );
});

test("diagnostics expose runtime state and motion query overrides stay QA-only", () => {
  assert.match(runtime, /window\.__villaObservatoryRuntimeSnapshot = runtimeSnapshot/);
  for (const field of [
    "adaptation",
    "portal",
    "blackHole",
    "relativisticLens",
    "kerrLens",
    "starVolume",
    "gaia",
    "backdrop4k"
  ]) {
    assert.match(runtime, new RegExp(`\\b${field}:`));
  }
  assert.match(
    diagnostics,
    /typeof window\.__villaObservatoryRuntimeSnapshot === "function"/
  );
  assert.match(
    diagnostics,
    /providers\.runtime = window\.__villaObservatoryRuntimeSnapshot\(\)/
  );
  assert.match(
    runtime,
    /if \(window\.__villaObservatoryRuntimeSnapshot === runtimeSnapshot\) \{\s*delete window\.__villaObservatoryRuntimeSnapshot;/
  );

  assert.match(
    runtime,
    /const diagnosticsMode = \["test", "perf"\]\.includes\(search\.get\("observatory"\)\)/
  );
  assert.match(
    runtime,
    /const motionOverride = diagnosticsMode \? search\.get\("motion"\) : null/
  );
  assert.match(runtime, /requestedSkyMode === "base" \? "base" : "impossible"/);
  assert.match(runtime, /window\.__villaObservatoryRuntimeSetSkyMode = setComparisonMode/);
  assert.match(runtime, /const skyBackdropMaterial = sky\.userData\.backdrop\?\.material/);
  assert.match(runtime, /starReveal:\s*baseImageComparison \? 0 : channels\.brightStarReveal/);
  assert.match(runtime, /resources\.gaia\.visible = !baseImageComparison/);
  assert.match(
    runtime,
    /motionOverride === "full"[\s\S]*?motionOverride === "reduce"[\s\S]*?motionQuery\?\.matches === true/
  );
});

test("stencil, context loss and shader failures all fail closed", () => {
  assert.match(runtime, /getContextAttributes\?\.\(\)/);
  assert.match(runtime, /getParameter\(context\.STENCIL_BITS\)/);
  assert.match(runtime, /evaluateObservatoryStencilSupport\(/);
  assert.match(
    runtime,
    /if \(\s*!resources\.stencilSupported\s*\|\| resources\.contextLost\s*\|\| resources\.skyDisabled\s*\) \{[\s\S]*?sky\.visible = false;[\s\S]*?resources\.portal\.composite\.visible = false;/
  );
  assert.match(runtime, /findObservatoryShaderFailure\(/);
  assert.match(runtime, /program\.diagnostics\?\.runnable === false/);
  assert.match(runtime, /addEventListener\("webglcontextlost", handleContextLost\)/);
  assert.match(runtime, /addEventListener\("webglcontextrestored", handleContextRestored\)/);
  assert.match(runtime, /removeEventListener\("webglcontextlost", handleContextLost\)/);
  assert.match(runtime, /removeEventListener\("webglcontextrestored", handleContextRestored\)/);
});

test("L2 preloads once, open lights draw no cosmos, and QA tiers stay locked", () => {
  assert.match(runtime, /isNearObservatoryPrewarmPosition\(camera\.position\)/);
  assert.match(
    runtime,
    /nearObservatory[\s\S]*?resources\.portalLoadRequested = true;[\s\S]*?applyQualityRef\.current\?\.\(qualityRef\.current\.quality\)/
  );
  assert.match(
    runtime,
    /const shouldPrewarm = nearObservatory && !resources\.portalPrewarmed;/
  );
  assert.match(runtime, /activeEnabled:\s*celestialVisible/);
  assert.match(runtime, /if \(!resources\.qualityLocked\) \{[\s\S]*?stepObservatoryQuality\(/);
  assert.match(runtime, /deltaSeconds:\s*Math\.min\(Math\.max\(delta \|\| 0, 0\), 0\.25\)/);
  assert.match(runtime, /lockedQuality:\s*resources\.qualityLocked/);
});

test("native layers precompile the main Canvas variant before offscreen upload", () => {
  assert.match(
    runtime,
    /new THREE\.WebGLRenderTarget\(1, 1,[\s\S]*?depthBuffer:\s*false,[\s\S]*?stencilBuffer:\s*false/
  );
  assert.match(
    runtime,
    /renderWarmupObjects\(sources\)[\s\S]*?gl\.setRenderTarget\(null\);[\s\S]*?gl\.compile\(warmupScene, camera, scene\);[\s\S]*?gl\.setRenderTarget\(getNativePrewarmTarget\(\)\);[\s\S]*?gl\.render\(warmupScene, camera\)/
  );
  for (const source of [
    "sky.userData.backdrop",
    "sky.userData.stars",
    "resources.aperture",
    "resources.portal.composite",
    "resources.gaia"
  ]) {
    assert.match(runtime, new RegExp(source.replaceAll(".", "\\.")));
  }
  assert.match(runtime, /if \(nearObservatory\) prewarmNativeRef\.current\?\.\(\)/);
  assert.match(runtime, /resources\.nativePrewarmTarget\?\.dispose\(\)/);
});

test("shader failures are classified and per-frame draw metrics report actual work", () => {
  for (const material of [
    "mushroom-distant-sky-material",
    "mushroom-twinkling-star-material",
    "mushroom-gaia-star-material",
    "mushroom-observatory-portal-composite-material",
    "OBSERVATORY_BLACK_HOLE_PASS_COMPOSITE_MATERIAL_NAME",
    "OBSERVATORY_RELATIVISTIC_LENS_MATERIAL_NAME",
    "OBSERVATORY_KERR_LENS_MATERIAL_NAME",
    "OBSERVATORY_GAIA_SOURCE_MAP_MATERIAL_NAME",
    "OBSERVATORY_STAR_VOLUME_MATERIAL_NAME"
  ]) {
    assert.match(runtime, new RegExp(material));
  }
  assert.match(runtime, /observatoryShaderFailure === "gaia"/);
  assert.match(runtime, /observatoryShaderFailure === "black-hole"/);
  assert.match(runtime, /observatoryShaderFailure === "relativistic-lens"/);
  assert.match(runtime, /observatoryShaderFailure === "kerr-lens"/);
  assert.match(runtime, /observatoryShaderFailure === "star-volume"/);
  assert.match(runtime, /observatoryShaderFailure === "native-sky"/);
  assert.match(runtime, /resources\.portalRenderedThisFrame = false/);
  assert.match(runtime, /resources\.portalRenderedThisFrame = true/);
  assert.match(
    runtime,
    /addedDrawCalls:\s*\(resources\.portalRenderedThisFrame \? 1 : 0\)[\s\S]*?resources\.portal\?\.composite\.visible/
  );
  assert.match(runtime, /addedDrawCalls:\s*\(sky\.visible \? 2 : 0\)/);
  assert.match(
    runtime,
    /const shouldAnimate = !baseImageComparison\s*&& inLoft\s*&& channels\.nebulaReveal > PORTAL_REVEAL_EPSILON;/
  );
});

test("hidden Rift/Lens events fail closed and preserve finite-distance depth cues", () => {
  assert.match(runtime, /stepObservatoryRift\(/);
  assert.match(runtime, /updateObservatoryRiftVisual\(/);
  assert.match(runtime, /updateRiftFadeSurfaces\(resources, riftChannels\.wallDissolve\)/);
  assert.match(runtime, /resetHiddenEffectRendering\(resources, sky, riftVisual\)/);
  assert.match(
    runtime,
    /riftVisual\.userData\.elapsed = 0;\s*riftVisual\.userData\.settledFragmentFactor = 0;/,
    "hard resets should clear the settled near-fragment diagnostic state"
  );
  assert.match(runtime, /riftVisual\.userData\.lifecycleToken = lifecycleToken/);
  assert.match(
    runtime,
    /riftVisual\?\.userData\.lifecycleToken === lifecycleToken[\s\S]*?disposeObservatoryRiftVisual\(riftVisual\)/,
    "StrictMode remounts must not dispose the replacement lifecycle"
  );
  assert.match(runtime, /LENS_WORLD_POSITION[\s\S]*?resources\.lensDistance/);
  assert.match(runtime, /LENS_WORLD_DISTANCE \/ resources\.lensDistance/);
  assert.match(runtime, /projectObservatoryPortalLens\(camera, LENS_WORLD_POSITION/);
  assert.match(runtime, /setObservatoryBlackHoleVisible\(/);
  assert.match(runtime, /updateObservatoryBlackHole\(/);
  assert.match(runtime, /setObservatoryStarVolumeVisible\(/);
  assert.match(runtime, /updateObservatoryStarVolume\(/);
  assert.match(runtime, /disposeHiddenCosmosResources\(\)/);
  assert.match(
    runtime,
    /lensAmount:\s*resources\.portalLensVisible \? resources\.lensAmount : 0/,
    "the FBO distortion must disappear when the finite lens is behind the camera"
  );
  assert.match(runtime, /backdropSuppression \* 0\.62/);
  assert.match(runtime, /resources\.lensAmount \* 0\.12/);
});
