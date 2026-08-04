import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import * as THREE from "three";

import { traceKerrRay } from "../scripts/build-kerr-transfer-atlas.mjs";

import { OBSERVATORY_BLACK_HOLE_FLOW_PERIODS } from "../src/villa-map/observatory-black-hole.js";

import {
  createObservatoryKerrLens,
  createObservatoryKerrLensAtlases,
  decodeObservatoryKerrLensAtlas,
  disposeObservatoryKerrLens,
  disposeObservatoryKerrLensAtlases,
  getObservatoryKerrLensQualityPreset,
  getObservatoryKerrLensSupport,
  isObservatoryKerrLensAtlasReady,
  loadObservatoryKerrLensAtlases,
  OBSERVATORY_KERR_LENS_ALPHA_EXTENT,
  OBSERVATORY_KERR_LENS_ATLAS_HEIGHT,
  OBSERVATORY_KERR_LENS_ATLAS_SPECS,
  OBSERVATORY_KERR_LENS_ATLAS_WIDTH,
  OBSERVATORY_KERR_LENS_BETA_EXTENT,
  OBSERVATORY_KERR_LENS_DISC_PRIMARY_URL,
  OBSERVATORY_KERR_LENS_DISC_SECONDARY_URL,
  OBSERVATORY_KERR_LENS_FRAGMENT_SHADER,
  OBSERVATORY_KERR_LENS_INCLINATION_DEGREES,
  OBSERVATORY_KERR_LENS_ISCO_RADIUS,
  OBSERVATORY_KERR_LENS_MATERIAL_NAME,
  OBSERVATORY_KERR_LENS_META_URL,
  OBSERVATORY_KERR_LENS_NAME,
  OBSERVATORY_KERR_LENS_OBSERVER_RADIUS,
  OBSERVATORY_KERR_LENS_PATH_URL,
  OBSERVATORY_KERR_LENS_QUALITY_PRESETS,
  OBSERVATORY_KERR_LENS_RAY_STATUS,
  OBSERVATORY_KERR_LENS_RENDER_ORDER,
  OBSERVATORY_KERR_LENS_SKY_URL,
  OBSERVATORY_KERR_LENS_SPIN,
  prewarmObservatoryKerrLens,
  setObservatoryKerrLensAtlases,
  setObservatoryKerrLensVisible,
  updateObservatoryKerrLens
} from "../src/villa-map/observatory-kerr-lens.js";

const ROOT_URL = new URL("../", import.meta.url);

async function bundledBinary(fileName) {
  const bytes = await readFile(new URL(`public/data/${fileName}`, ROOT_URL));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function createBundledAtlases() {
  const [sky, discPrimary, discSecondary, path] = await Promise.all([
    bundledBinary("observatory-kerr-sky-v1.bin"),
    bundledBinary("observatory-kerr-disc-primary-v1.bin"),
    bundledBinary("observatory-kerr-disc-secondary-v1.bin"),
    bundledBinary("observatory-kerr-path-v1.bin")
  ]);
  return createObservatoryKerrLensAtlases({ sky, discPrimary, discSecondary, path });
}

function createCamera() {
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 200);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateProjectionMatrix();
  camera.updateWorldMatrix(true, false);
  return camera;
}

test("Kerr v1 constants match the fixed physical atlas and quality fallback policy", () => {
  assert.equal(OBSERVATORY_KERR_LENS_SPIN, 0.94);
  assert.equal(OBSERVATORY_KERR_LENS_INCLINATION_DEGREES, 60);
  assert.equal(OBSERVATORY_KERR_LENS_OBSERVER_RADIUS, 1_000);
  assert.deepEqual(
    [OBSERVATORY_KERR_LENS_ATLAS_WIDTH, OBSERVATORY_KERR_LENS_ATLAS_HEIGHT],
    [384, 384]
  );
  assert.deepEqual(
    [OBSERVATORY_KERR_LENS_ALPHA_EXTENT, OBSERVATORY_KERR_LENS_BETA_EXTENT],
    [12, 12]
  );
  assert.ok(Math.abs(OBSERVATORY_KERR_LENS_ISCO_RADIUS - 2.023593104700402) < 1e-12);
  assert.deepEqual(OBSERVATORY_KERR_LENS_RAY_STATUS, {
    escaped: 0,
    captured: 1,
    unresolved: 2,
    invalid: 3
  });
  assert.deepEqual(Object.keys(OBSERVATORY_KERR_LENS_QUALITY_PRESETS), [
    "high", "medium", "low", "minimum"
  ]);
  assert.equal(getObservatoryKerrLensQualityPreset("HIGH").enabled, true);
  assert.equal(getObservatoryKerrLensQualityPreset("medium").secondaryDisc, true);
  assert.equal(getObservatoryKerrLensQualityPreset("low").enabled, false);
  assert.equal(getObservatoryKerrLensQualityPreset("minimum").enabled, false);
  assert.equal(OBSERVATORY_KERR_LENS_SKY_URL, "/data/observatory-kerr-sky-v1.bin");
  assert.equal(OBSERVATORY_KERR_LENS_DISC_PRIMARY_URL, "/data/observatory-kerr-disc-primary-v1.bin");
  assert.equal(OBSERVATORY_KERR_LENS_DISC_SECONDARY_URL, "/data/observatory-kerr-disc-secondary-v1.bin");
  assert.equal(OBSERVATORY_KERR_LENS_PATH_URL, "/data/observatory-kerr-path-v1.bin");
  assert.equal(OBSERVATORY_KERR_LENS_META_URL, "/data/observatory-kerr-transfer-atlas-v1.meta.json");
});

test("bundled RGBA/RG binaries decode to finite nearest-filter DataTextures", async () => {
  const binaries = {
    sky: await bundledBinary("observatory-kerr-sky-v1.bin"),
    discPrimary: await bundledBinary("observatory-kerr-disc-primary-v1.bin"),
    discSecondary: await bundledBinary("observatory-kerr-disc-secondary-v1.bin"),
    path: await bundledBinary("observatory-kerr-path-v1.bin")
  };
  const decodedPath = decodeObservatoryKerrLensAtlas(binaries.path, "path");
  assert.equal(decodedPath.channels, 2);
  assert.equal(decodedPath.data.length, 384 * 384 * 2);
  assert.ok(decodedPath.data.every(Number.isFinite));
  assert.throws(
    () => decodeObservatoryKerrLensAtlas(binaries.path.slice(0, -4), "path"),
    /expected/
  );
  assert.throws(
    () => decodeObservatoryKerrLensAtlas(binaries.path, "unknown"),
    /Unknown/
  );

  const atlases = createObservatoryKerrLensAtlases(binaries);
  assert.equal(isObservatoryKerrLensAtlasReady(atlases), true);
  for (const [key, texture] of Object.entries({
    sky: atlases.sky,
    discPrimary: atlases.discPrimary,
    discSecondary: atlases.discSecondary,
    path: atlases.path
  })) {
    const spec = OBSERVATORY_KERR_LENS_ATLAS_SPECS[key];
    assert.equal(texture.isDataTexture, true);
    assert.equal(texture.image.width, 384);
    assert.equal(texture.image.height, 384);
    assert.equal(texture.format, spec.format);
    assert.equal(texture.internalFormat, spec.internalFormat);
    assert.equal(texture.type, THREE.FloatType);
    assert.equal(texture.minFilter, THREE.NearestFilter);
    assert.equal(texture.magFilter, THREE.NearestFilter);
    assert.equal(texture.generateMipmaps, false);
    assert.equal(texture.flipY, false);
    assert.equal(texture.colorSpace, THREE.NoColorSpace);
  }
  disposeObservatoryKerrLensAtlases(atlases);
});

test("loader fetches the four exact assets with one abort signal", async () => {
  const urlToFile = new Map([
    [OBSERVATORY_KERR_LENS_SKY_URL, "observatory-kerr-sky-v1.bin"],
    [OBSERVATORY_KERR_LENS_DISC_PRIMARY_URL, "observatory-kerr-disc-primary-v1.bin"],
    [OBSERVATORY_KERR_LENS_DISC_SECONDARY_URL, "observatory-kerr-disc-secondary-v1.bin"],
    [OBSERVATORY_KERR_LENS_PATH_URL, "observatory-kerr-path-v1.bin"]
  ]);
  const signal = new AbortController().signal;
  const requests = [];
  const atlases = await loadObservatoryKerrLensAtlases({
    signal,
    fetchImpl: async (url, options) => {
      requests.push([url, options.signal]);
      const file = urlToFile.get(url);
      return file
        ? { ok: true, arrayBuffer: () => bundledBinary(file) }
        : { ok: false, status: 404 };
    }
  });
  assert.deepEqual(requests.map(([url]) => url), [...urlToFile.keys()]);
  assert.ok(requests.every(([, requestSignal]) => requestSignal === signal));
  assert.equal(isObservatoryKerrLensAtlasReady(atlases), true);
  disposeObservatoryKerrLensAtlases(atlases);
});

test("shader keeps topology nearest, composes photo and source stars through one exit ray, and preserves hot fallback pixels", () => {
  const shader = OBSERVATORY_KERR_LENS_FRAGMENT_SHADER;
  assert.deepEqual(OBSERVATORY_BLACK_HOLE_FLOW_PERIODS, {
    inner: 10,
    middle: 15,
    outer: 25
  });
  assert.match(shader, /texelFetch\(uKerrSkyAtlas, texel, 0\)/);
  assert.match(shader, /float status = floor\(skyTransfer\.a \+ 0\.5\)/);
  assert.match(shader, /if \(status > STATUS_CAPTURED \+ 0\.25\) discard/);
  assert.match(shader, /vec3 atlasExitDirection = sampleKerrExitDirection/);
  assert.match(shader, /vec3 exitDirection = normalize\(uKerrToWorld \* atlasExitDirection\)/);
  assert.match(shader, /uSkyTexture,[\s\S]*?exitDirection/);
  assert.match(shader, /uStarSourceTexture,[\s\S]*?exitDirection/);
  assert.match(shader, /float diffuseTransmission = mix/);
  assert.match(shader, /0\.08,[\s\S]*?smoothstep\(0\.20, 0\.82, normalizedImpact\)/);
  assert.match(shader, /sceneColour \*= diffuseTransmission/);
  assert.match(shader, /abs\(sourceDirection\.y\)/);
  assert.match(shader, /float lowerCompletion = smoothstep\(-0\.58, 0\.0, sourceY\)/);
  assert.match(shader, /darkHorizon/);
  assert.match(shader, /pow\(clamp\(redshift, 0\.0, 3\.5\), 3\.0\)/);
  assert.match(shader, /uKerrDiscSecondaryAtlas/);
  assert.match(shader, /uKerrDiscPrimaryAtlas/);
  assert.match(shader, /const float FLOW_INNER_PERIOD = 10\.0/);
  assert.match(shader, /const float FLOW_MIDDLE_PERIOD = 15\.0/);
  assert.match(shader, /const float FLOW_OUTER_PERIOD = 25\.0/);
  assert.match(shader, /azimuth - emissionTime \* \(2\.0 \* PI \/ orbitalPeriod\)/);
  assert.match(shader, /float longStream = sin\(flowPhase \* 2\.0/);
  assert.match(shader, /float hotspotShape = pow/);
  assert.match(shader, /hotspotShape - FLOW_HOTSPOT_MEAN/);
  assert.match(shader, /const float FLOW_ROTATION_ARC_MEAN = 0\.2734375/);
  assert.match(shader, /const float FLOW_LEADING_HOTSPOT_MEAN = 0\.17619705200195312/);
  assert.match(shader, /float tracerPhase = azimuth/);
  assert.match(shader, /2\.0 \* PI \/ FLOW_MIDDLE_PERIOD/);
  assert.match(shader, /float rotationArc = pow/);
  assert.match(shader, /float leadingHotspot = pow/);
  assert.match(shader, /\(rotationArc - FLOW_ROTATION_ARC_MEAN\) \* 1\.10/);
  assert.match(shader, /\(leadingHotspot - FLOW_LEADING_HOTSPOT_MEAN\) \* 1\.50/);
  // Gaussians squared by multiplication — pow(x, 2.0) is undefined for
  // negative x in GLSL ES 1.00 and can NaN on some drivers.
  assert.match(
    shader,
    /float innerHeat = exp\(-innerHeatDistance \* innerHeatDistance\)/
  );
  assert.match(
    shader,
    /float ribbonRadialWindow = exp\(-ribbonRadialDistance \* ribbonRadialDistance\)/
  );
  assert.match(shader, /\(radius - \(KERR_ISCO \+ 1\.55\)\) \/ 0\.72/);
  assert.match(shader, /float tracerImageWeight = mix/);
  assert.match(shader, /0\.04,[\s\S]*?step\(0\.5, imageWeight\)/);
  assert.match(shader, /float platinumRibbon = ribbonRadialWindow/);
  assert.match(shader, /vec3 hotCore = vec3\(11\.0, 4\.2, 0\.55\)/);
  assert.match(shader, /0\.02 \+ tracerImageWeight/);
  assert.match(shader, /rotationArc \* 0\.035 \+ leadingHotspot \* 0\.16/);
  assert.match(shader, /platinumRibbon \* \(0\.04 \+ leadingHotspot \* 0\.08\)/);
  assert.match(shader, /vec3 whiteGold = vec3\(16\.0, 13\.0, 8\.0\)/);
  assert.match(shader, /clamp\(movingWhiteHeat, 0\.0, 0\.48\)/);
  assert.match(shader, /float carrierRelativisticBoost = pow/);
  assert.match(shader, /clamp\(redshift, 0\.50, 2\.20\)/);
  assert.match(shader, /vec3 platinumRibbonColour = mix/);
  assert.match(shader, /radiance \+= platinumRibbonColour/);
  assert.match(shader, /float hotShoulder = uHdrOutput > 0\.5 \? 0\.05 : 0\.28/);
  assert.match(shader, /float shoulderStrength = mix/);
  assert.match(shader, /\* flowStructure \* 0\.88/);
  assert.match(shader, /float displayTracer = ribbonCarrier \* mix/);
  assert.match(shader, /vec3 goldTracerColour = mix/);
  assert.match(shader, /vec3\(2\.8, 0\.62, 0\.025\)/);
  assert.match(shader, /vec3\(12\.0, 9\.0, 4\.8\)/);
  assert.match(shader, /radiance \+= goldTracerColour \* displayTracer/);
  assert.ok(
    shader.indexOf("radiance += goldTracerColour * displayTracer")
      > shader.indexOf("radiance /= 1.0 + discLuminance * shoulderStrength"),
    "gold motion tracer must survive the HDR shoulder"
  );
  assert.doesNotMatch(shader, /quietStructure|emissionTime \* 0\.045/);
  assert.doesNotMatch(shader, /UnrealBloomPass|EffectComposer|uBloom/);
  assert.match(shader, /Captured rays intentionally contribute opaque black/);
  assert.match(shader, /0\.72 - edgeAa,[\s\S]*?edgeDistance/);
  assert.doesNotMatch(shader, /texture\(uKerrSkyAtlas/);
});

test("screen-to-atlas mapping keeps +beta on atlas row 0 and matches the shipped disc's near/far asymmetry", async () => {
  const shader = OBSERVATORY_KERR_LENS_FRAGMENT_SHADER;
  // Pin the exact screen->atlas uv expressions for BOTH axes: column 0 holds
  // alpha=-12 and row 0 holds beta=+12, matching the generator's
  // "top-to-bottom; betaMax to betaMin" row order read with flipY=false
  // texelFetch addressing.  Any sign flip here mirrors the lensed sky and the
  // disc's near/far side without failing a single geometry test, so the
  // expressions are pinned as text AND re-executed on the CPU below.
  const atlasUvSource = shader.match(/vec2 atlasUv = vec2\(\n([\s\S]*?)\n\s*\);/);
  assert.ok(atlasUvSource, "fragment shader must derive atlasUv from alphaBeta");
  const [uExpression, vExpression] = atlasUvSource[1]
    .split(",\n")
    .map((component) => component.trim());
  assert.equal(uExpression, "(alphaBeta.x + uAtlasExtent.x) / (2.0 * uAtlasExtent.x)");
  assert.equal(vExpression, "(uAtlasExtent.y - alphaBeta.y) / (2.0 * uAtlasExtent.y)");
  assert.match(
    shader,
    /vec2 texel = floor\(clamp\(atlasUv, vec2\(0\.0\), vec2\(1\.0\)\) \* uAtlasSize\);\n\s*return ivec2\(clamp\(texel, vec2\(0\.0\), uAtlasSize - 1\.0\)\);/
  );

  // Reproduce the shader's alphaBeta->texel mapping on the CPU, compiled from
  // the shader source itself so an orientation flip cannot hide behind a
  // "helpfully" updated text pin: a flipped expression would select mirrored
  // rows below and fail the physical assertions directly.
  const compileComponent = (expression) => {
    const residue = expression.replace(
      /alphaBeta\.[xy]|uAtlasExtent\.[xy]|\d+(?:\.\d+)?|[()+\-*/\s]/g,
      ""
    );
    assert.equal(residue, "", `unexpected atlasUv tokens: ${residue}`);
    return new Function(
      "alphaBetaX",
      "alphaBetaY",
      "extentX",
      "extentY",
      `"use strict"; return (${expression
        .replaceAll("alphaBeta.x", "alphaBetaX")
        .replaceAll("alphaBeta.y", "alphaBetaY")
        .replaceAll("uAtlasExtent.x", "extentX")
        .replaceAll("uAtlasExtent.y", "extentY")});`
    );
  };
  const atlasU = compileComponent(uExpression);
  const atlasV = compileComponent(vExpression);
  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const shaderTexel = (alpha, beta) => {
    const u = clamp01(atlasU(
      alpha,
      beta,
      OBSERVATORY_KERR_LENS_ALPHA_EXTENT,
      OBSERVATORY_KERR_LENS_BETA_EXTENT
    ));
    const v = clamp01(atlasV(
      alpha,
      beta,
      OBSERVATORY_KERR_LENS_ALPHA_EXTENT,
      OBSERVATORY_KERR_LENS_BETA_EXTENT
    ));
    return {
      x: Math.min(
        OBSERVATORY_KERR_LENS_ATLAS_WIDTH - 1,
        Math.floor(u * OBSERVATORY_KERR_LENS_ATLAS_WIDTH)
      ),
      y: Math.min(
        OBSERVATORY_KERR_LENS_ATLAS_HEIGHT - 1,
        Math.floor(v * OBSERVATORY_KERR_LENS_ATLAS_HEIGHT)
      )
    };
  };

  const sky = decodeObservatoryKerrLensAtlas(
    await bundledBinary("observatory-kerr-sky-v1.bin"),
    "sky"
  );
  const primary = decodeObservatoryKerrLensAtlas(
    await bundledBinary("observatory-kerr-disc-primary-v1.bin"),
    "disc-primary"
  );
  const texelValues = (atlas, { x, y }) => {
    // flipY=false + texelFetch: texel row y is the y-th stored row of the bin.
    const offset = (y * atlas.width + x) * atlas.channels;
    return Array.from(atlas.data.subarray(offset, offset + atlas.channels));
  };

  // What is actually beta-asymmetric at a=0.94, i=60deg (the capture mask is
  // beta-symmetric, so only these transfer quantities can see a flip): the
  // observer sits 30deg above the equatorial disc and beta>0 initializes
  // increasing Boyer-Lindquist theta, so +beta rays dive directly through the
  // NEAR side of the disc in front of the hole (first crossing at large
  // radius, azimuth ~ 0 toward the observer, coordinate time just under the
  // ~1000M chord), while -beta rays first climb away from the equatorial
  // plane and reach it only after bending around the FAR side (compact image:
  // small radius, azimuth ~ +/-pi, ~20M extra light travel time).  Strong
  // deflection toward the hole likewise swings +beta exit directions to the
  // +Y (spin-axis) hemisphere and -beta exits to -Y.  Every probe below sits
  // exactly on a centre of the 0.0625M texel grid, so the nearest texel is
  // unambiguous and the offline tracer reproduces the stored texel to
  // float32 precision.
  const checkProbe = (alpha, beta) => {
    const ray = traceKerrRay(alpha, beta);
    const texel = shaderTexel(alpha, beta);
    const [dirX, dirY, dirZ, status] = texelValues(sky, texel);
    const [radius, azimuth, redshift, time] = texelValues(primary, texel);
    assert.equal(
      status,
      ray.status,
      `atlas status at (${alpha}, ${beta}) must match the traced ray`
    );
    if (ray.status === OBSERVATORY_KERR_LENS_RAY_STATUS.escaped) {
      assert.ok(Math.abs(dirX - ray.sourceDirection[0]) < 1e-6);
      assert.ok(
        Math.abs(dirY - ray.sourceDirection[1]) < 1e-6,
        `atlas exit direction Y at (${alpha}, ${beta}) is ${dirY}; traced ${ray.sourceDirection[1]}`
      );
      assert.ok(Math.abs(dirZ - ray.sourceDirection[2]) < 1e-6);
    }
    const crossing = ray.discCrossings[0];
    assert.ok(crossing, `probe (${alpha}, ${beta}) must have a primary disc crossing`);
    assert.ok(Math.abs(radius - crossing.radius) < 1e-5);
    assert.ok(Math.abs(azimuth - crossing.azimuth) < 1e-5);
    assert.ok(Math.abs(redshift - crossing.redshift) < 1e-6);
    assert.ok(Math.abs(time - crossing.coordinateTime) < 1e-3);
    return { status, dirY, radius, azimuth, time };
  };

  const top = checkProbe(0.03125, 5.96875);
  const bottom = checkProbe(0.03125, -5.96875);
  assert.equal(top.status, OBSERVATORY_KERR_LENS_RAY_STATUS.escaped);
  assert.equal(bottom.status, OBSERVATORY_KERR_LENS_RAY_STATUS.escaped);
  assert.ok(top.dirY > 0.85, "+beta ray must exit toward the +Y spin axis");
  assert.ok(bottom.dirY < -0.85, "-beta ray must exit below the equator");
  assert.ok(
    top.dirY - bottom.dirY > 1.7,
    "a vertical mapping flip would swap the exit hemispheres"
  );
  assert.ok(Math.abs(top.azimuth) < 0.1, "near side faces observer azimuth 0");
  assert.ok(Math.abs(bottom.azimuth) > 2.5, "far side sits at azimuth ~ +/-pi");
  assert.ok(top.radius > 10, "direct near-side image at large radius");
  assert.ok(
    bottom.radius > OBSERVATORY_KERR_LENS_ISCO_RADIUS && bottom.radius < 6,
    "far-side image lands inside the shader-valid disc band"
  );
  assert.ok(
    bottom.time - top.time > 15,
    "wrapping behind the hole must cost ~20M of extra travel time"
  );

  // The alpha axis is pinned by frame dragging: the shadow is displaced
  // toward +alpha, so +5M is captured while -5M escapes.
  const right = checkProbe(5.03125, -0.03125);
  const left = checkProbe(-5.03125, -0.03125);
  assert.equal(
    right.status,
    OBSERVATORY_KERR_LENS_RAY_STATUS.captured,
    "frame dragging must keep the shadow displaced toward +alpha"
  );
  assert.equal(left.status, OBSERVATORY_KERR_LENS_RAY_STATUS.escaped);

  // The same near/far asymmetry holds in aggregate for the shipped file's row
  // order, independent of any probe choice: top rows (+beta) image the near
  // side directly at larger radii and earlier times than the wrapped far-side
  // rows (-beta).
  const halves = [
    { count: 0, radiusSum: 0, timeSum: 0 },
    { count: 0, radiusSum: 0, timeSum: 0 }
  ];
  for (let y = 0; y < primary.height; y += 1) {
    const half = halves[y < primary.height / 2 ? 0 : 1];
    for (let x = 0; x < primary.width; x += 1) {
      const offset = (y * primary.width + x) * primary.channels;
      const radius = primary.data[offset];
      if (radius <= 0) continue;
      half.count += 1;
      half.radiusSum += radius;
      half.timeSum += primary.data[offset + 3];
    }
  }
  const [topHalf, bottomHalf] = halves;
  assert.ok(topHalf.count > 60_000 && bottomHalf.count > 60_000);
  const meanRadiusGap = topHalf.radiusSum / topHalf.count
    - bottomHalf.radiusSum / bottomHalf.count;
  const meanTimeGap = bottomHalf.timeSum / bottomHalf.count
    - topHalf.timeSum / topHalf.count;
  assert.ok(
    meanRadiusGap > 2,
    `near-side rows must image larger mean disc radii (gap ${meanRadiusGap})`
  );
  assert.ok(
    meanTimeGap > 10,
    `far-side rows must arrive later on average (gap ${meanTimeGap})`
  );
});

test("single-sided Kerr carriers make rotation readable in 2-4 seconds without raising mean flux", () => {
  const isco = OBSERVATORY_KERR_LENS_ISCO_RADIUS;
  // Mirrors the runtime's KERR_DISC_OUTER_RADIUS (extended ribbon disc).
  const outer = 10.5;
  const hotspotMean = 0.196380615234375;
  const rotationArcMean = 0.2734375;
  const leadingHotspotMean = 0.17619705200195312;
  const smoothstep = (edge0, edge1, value) => {
    const amount = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return amount * amount * (3 - 2 * amount);
  };
  const orbitalPeriodAt = (radius) => {
    const normalizedRadius = Math.max(
      0,
      Math.min(1, (radius - isco) / (outer - isco))
    );
    let period = OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.inner
      + (OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.middle
        - OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.inner)
        * smoothstep(0, 0.5, normalizedRadius);
    period += (OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.outer - period)
      * smoothstep(0.5, 1, normalizedRadius);
    return period;
  };
  // Mirrors the shader's static Saturn-ring banding: azimuth-free, so it can
  // scale the per-radius mean but never make it vary over time.
  const ringStructureAt = (radius) => {
    const ringBands = Math.sin(radius * 14.0) * 0.45
      + Math.sin(radius * 23.0 + 1.7) * 0.30
      + Math.sin(radius * 41.0 + 4.2) * 0.25;
    const normalizedRadius = Math.max(
      0,
      Math.min(1, (radius - isco) / (outer - isco))
    );
    const bandProfile = smoothstep(0, 0.35, normalizedRadius);
    return 1 + ringBands * (0.10 + 0.24 * bandProfile);
  };
  const flowStructureAt = (azimuth, radius, timeSeconds) => {
    const flowPhase = azimuth
      - timeSeconds * (2 * Math.PI / orbitalPeriodAt(radius));
    const longStream = Math.sin(flowPhase * 2 - radius * 1.42);
    const filamentStream = Math.sin(
      flowPhase * 5 - radius * 2.85 + Math.sin(radius * 1.7) * 0.62
    );
    const streakA = Math.sin(flowPhase * 9 - radius * 9.5);
    const streakB = Math.sin(
      flowPhase * 17 - radius * 16 + Math.sin(radius * 3.3) * 1.1
    );
    const hotspotShape = Math.pow(
      0.5 + 0.5 * Math.sin(
        flowPhase * 3 - radius * 1.16 + Math.sin(radius * 2.1) * 0.48
      ),
      8
    );
    const tracerPhase = azimuth
      - timeSeconds * (2 * Math.PI / OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.middle);
    const rotationArc = Math.pow(
      0.5 + 0.5 * Math.cos(tracerPhase - radius * 0.18),
      4
    );
    const leadingHotspot = Math.pow(
      0.5 + 0.5 * Math.cos(tracerPhase - radius * 0.18 - 0.52),
      10
    );
    const ribbonRadialWindow = Math.exp(-Math.pow(
      (radius - (isco + 1.55)) / 0.72,
      2
    ));
    return Math.max(0, (1
      + longStream * 0.10
      + filamentStream * 0.04
      + streakA * 0.14
      + streakB * 0.09
      + (hotspotShape - hotspotMean) * 0.20
      + ribbonRadialWindow * (
        (rotationArc - rotationArcMean) * 1.10
        + (leadingHotspot - leadingHotspotMean) * 1.50
      )) * ringStructureAt(radius));
  };
  const sampleCount = 8_192;
  const middleRadius = isco + 1.55;
  const profileAt = (timeSeconds) => Array.from(
    { length: sampleCount },
    (_, index) => flowStructureAt(
      index / sampleCount * Math.PI * 2,
      middleRadius,
      timeSeconds
    )
  );
  const base = profileAt(0);
  const afterTwoSeconds = profileAt(2);
  const afterFourSeconds = profileAt(4);
  const azimuthalMean = (profile) => (
    profile.reduce((sum, value) => sum + value, 0) / profile.length
  );
  const mean = azimuthalMean(base);
  const minimum = Math.min(...base);
  const maximum = Math.max(...base);
  // The static ring banding scales each radius' mean (it is a texture), but
  // every moving carrier stays zero-mean: the azimuthal mean must be exactly
  // the ring factor and must not vary with time (no ring pulsing).
  assert.ok(
    Math.abs(mean - ringStructureAt(middleRadius)) < 1e-9,
    `mean flux drifted to ${mean}`
  );
  assert.ok(
    Math.abs(azimuthalMean(afterTwoSeconds) - mean) < 1e-9
      && Math.abs(azimuthalMean(afterFourSeconds) - mean) < 1e-9,
    "azimuthal mean must not vary over time"
  );
  assert.ok(maximum / minimum > 8, "the moving arc needs strong spatial contrast");

  const peakDegrees = (profile) => (
    profile.indexOf(Math.max(...profile)) / sampleCount * 360
  );
  const circularAdvance = (from, to) => ((to - from + 540) % 360) - 180;
  const twoSecondAdvance = circularAdvance(
    peakDegrees(base),
    peakDegrees(afterTwoSeconds)
  );
  const fourSecondAdvance = circularAdvance(
    peakDegrees(base),
    peakDegrees(afterFourSeconds)
  );
  // Expected advances derive from the shared middle carrier period, folded
  // into the (-180, 180] range the circular comparison reports. The sheared
  // gas streaks ride at the LOCAL orbital rate (faster than the tracer at
  // this radius), so the profile's argmax wobbles around the hero tracer by
  // up to a streak wavelength — the tolerance covers that wobble while still
  // rejecting the pre-restyle cadence (which advanced only 48 degrees).
  const foldDegrees = (degrees) => ((degrees % 360) + 540) % 360 - 180;
  const expectedTwoSecond = foldDegrees(
    2 * 360 / OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.middle
  );
  const expectedFourSecond = foldDegrees(
    4 * 360 / OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.middle
  );
  assert.ok(
    Math.abs(twoSecondAdvance - expectedTwoSecond) < 25,
    `middle carrier should move about ${expectedTwoSecond} degrees in 2 `
      + `seconds, got ${twoSecondAdvance}`
  );
  assert.ok(
    Math.abs(fourSecondAdvance - expectedFourSecond) < 25,
    `middle carrier should fold to about ${expectedFourSecond} degrees after `
      + `4 seconds, got ${fourSecondAdvance}`
  );

  const innerAdvance = 2 * 360 / OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.inner;
  const outerAdvance = 2 * 360 / OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.outer;
  assert.equal(innerAdvance, 72);
  assert.equal(outerAdvance, 28.8);
  assert.ok(innerAdvance > twoSecondAdvance && twoSecondAdvance > outerAdvance);

  // The narrow tracer remains visible on the receding side without changing
  // the broad physical g^3 Doppler term. This prevents a tracked feature from
  // disappearing halfway through its orbit.
  const recedingRedshift = 0.28;
  const physicalBoost = Math.pow(recedingRedshift, 3);
  const carrierBoost = Math.pow(Math.max(0.5, recedingRedshift), 1.4);
  assert.ok(carrierBoost / physicalBoost > 17);
  assert.equal(1 / 0.05, 20, "HalfFloat tracer should retain intrinsic HDR headroom");
  assert.ok(
    0.04 * 0.26 < 0.011,
    "secondary image tracer should remain only a faint lensed echo"
  );
});

test("factory and update expose runtime state, frames and strict tier activation", async () => {
  const atlases = await createBundledAtlases();
  const skyTexture = new THREE.Texture();
  const starSourceTexture = new THREE.Texture();
  const kerrToWorld = new THREE.Matrix3().set(
    0, 0, 1,
    0, 1, 0,
    -1, 0, 0
  );
  const lens = createObservatoryKerrLens({
    atlases,
    skyTexture,
    starSourceTexture,
    visible: true,
    quality: "high",
    lensPosition: [1, 2, -40]
  });
  assert.equal(lens.name, OBSERVATORY_KERR_LENS_NAME);
  assert.equal(lens.material.name, OBSERVATORY_KERR_LENS_MATERIAL_NAME);
  assert.equal(lens.renderOrder, OBSERVATORY_KERR_LENS_RENDER_ORDER);
  assert.equal(OBSERVATORY_KERR_LENS_RENDER_ORDER, -894);
  assert.equal(lens.material.premultipliedAlpha, true);
  assert.equal(lens.material.blendSrc, THREE.OneFactor);
  assert.equal(lens.material.blendDst, THREE.OneMinusSrcAlphaFactor);
  assert.equal(lens.userData.atlasReady, true);
  assert.equal(lens.userData.sourceStarsReady, true);

  const active = updateObservatoryKerrLens(lens, createCamera(), {
    timeSeconds: 4.5,
    reveal: 1,
    quality: "high",
    lensPosition: [0, 4, -42],
    imageRight: [1, 0, 0],
    imageUp: [0, 1, 0],
    kerrToWorld,
    massWorldScale: 2.1,
    skyBrightness: 0.42,
    starSourceBrightness: 0.6,
    discOuterRadius: 8.1,
    discOpacity: 0.88,
    hdrOutput: false
  });
  assert.equal(active, true);
  assert.equal(lens.visible, true);
  assert.equal(lens.userData.timeSeconds, 4.5);
  assert.equal(lens.userData.reveal, 1);
  assert.equal(lens.material.uniforms.uMassWorldScale.value, 2.1);
  assert.equal(lens.material.uniforms.uSkyBrightness.value, 0.42);
  assert.equal(lens.material.uniforms.uStarSourceBrightness.value, 0.6);
  assert.equal(lens.material.uniforms.uDiscOuterRadius.value, 8.1);
  assert.equal(lens.material.uniforms.uDiscOpacity.value, 0.88);
  assert.equal(lens.material.uniforms.uHdrOutput.value, 0);
  assert.ok(lens.material.uniforms.uKerrToWorld.value.equals(kerrToWorld));

  assert.equal(updateObservatoryKerrLens(lens, createCamera(), {
    quality: "low", reveal: 1
  }), false);
  assert.equal(lens.visible, false);
  assert.equal(lens.userData.fallbackReason, "quality-fallback");
  disposeObservatoryKerrLens(lens);
  disposeObservatoryKerrLensAtlases(atlases);
  skyTexture.dispose();
  starSourceTexture.dispose();
});

test("atlas replacement, prewarm restoration and owned disposal are idempotent", async () => {
  const atlases = await createBundledAtlases();
  const skyTexture = new THREE.Texture();
  const lens = createObservatoryKerrLens({
    atlases,
    skyTexture,
    ownsAtlases: true,
    visible: false,
    reveal: 0,
    quality: "medium"
  });
  assert.equal(setObservatoryKerrLensAtlases(lens, null), false);
  assert.equal(lens.userData.atlasReady, false);
  assert.equal(setObservatoryKerrLensAtlases(lens, atlases, { ownsAtlases: true }), true);

  const restore = prewarmObservatoryKerrLens(lens, "high");
  assert.equal(typeof restore, "function");
  assert.equal(lens.visible, true);
  assert.equal(lens.userData.prewarming, true);
  assert.equal(lens.material.uniforms.uReveal.value, 0.01);
  assert.equal(restore(), true);
  assert.equal(restore(), false);
  assert.equal(lens.visible, false);
  assert.equal(lens.userData.prewarming, false);
  assert.equal(lens.material.uniforms.uReveal.value, 0);

  let atlasDisposals = 0;
  for (const texture of [atlases.sky, atlases.discPrimary, atlases.discSecondary, atlases.path]) {
    texture.addEventListener("dispose", () => { atlasDisposals += 1; });
  }
  assert.equal(disposeObservatoryKerrLens(lens), true);
  assert.equal(disposeObservatoryKerrLens(lens), false);
  assert.equal(atlasDisposals, 4);
  assert.equal(atlases.disposed, true);
  assert.equal(setObservatoryKerrLensVisible(lens, true), false);
  assert.equal(prewarmObservatoryKerrLens(lens), false);
  skyTexture.dispose();
});

test("support requires WebGL2 and enough atlas texture size", () => {
  assert.deepEqual(
    getObservatoryKerrLensSupport({ isWebGL2: true, maxTextureSize: 8192 }),
    {
      webgl2: true,
      maxTextureSize: 8192,
      atlasSizeSupported: true,
      supported: true,
      fallback: null
    }
  );
  assert.equal(getObservatoryKerrLensSupport({
    isWebGL2: false,
    maxTextureSize: 8192
  }).supported, false);
  assert.equal(getObservatoryKerrLensSupport({
    isWebGL2: true,
    maxTextureSize: 256
  }).fallback, "schwarzschild-lut");
});
