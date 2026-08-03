import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import * as THREE from "three";

import { OBSERVATORY_BLACK_HOLE_FLOW_PERIODS } from "../src/villa-map/observatory-black-hole.js";

import {
  createObservatoryRelativisticLens,
  createObservatoryRelativisticLensLuts,
  decodeObservatoryRelativisticLensLut,
  disposeObservatoryRelativisticLens,
  disposeObservatoryRelativisticLensLuts,
  getObservatoryRelativisticLensQualityPreset,
  getObservatoryRelativisticLensSupport,
  loadObservatoryRelativisticLensLuts,
  normalizeObservatoryRelativisticLensQuality,
  OBSERVATORY_RELATIVISTIC_LENS_DEFLECTION_URL,
  OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER,
  OBSERVATORY_RELATIVISTIC_LENS_INVERSE_RADIUS_URL,
  OBSERVATORY_RELATIVISTIC_LENS_LUT_SPECS,
  OBSERVATORY_RELATIVISTIC_LENS_MATERIAL_NAME,
  OBSERVATORY_RELATIVISTIC_LENS_META_URL,
  OBSERVATORY_RELATIVISTIC_LENS_NAME,
  OBSERVATORY_RELATIVISTIC_LENS_OPTICAL_SCALE,
  OBSERVATORY_RELATIVISTIC_LENS_QUALITY_PRESETS,
  OBSERVATORY_RELATIVISTIC_LENS_RENDER_ORDER,
  OBSERVATORY_RELATIVISTIC_LENS_STENCIL_REF,
  prewarmObservatoryRelativisticLens,
  setObservatoryRelativisticLensLuts,
  setObservatoryRelativisticLensVisible,
  updateObservatoryRelativisticLens
} from "../src/villa-map/observatory-relativistic-lens.js";

const DATA_ROOT = new URL("../public/data/", import.meta.url);
const DEFLECTION_PATH = new URL(
  "observatory-black-hole-ray-deflection-v1.bin",
  DATA_ROOT
);
const INVERSE_RADIUS_PATH = new URL(
  "observatory-black-hole-ray-inverse-radius-v1.bin",
  DATA_ROOT
);
const META_PATH = new URL(
  "observatory-black-hole-schwarzschild-lut-v1.meta.json",
  DATA_ROOT
);
const LICENSE_PATH = new URL(
  "observatory-black-hole-lut-LICENSE.txt",
  DATA_ROOT
);

const EXPECTED_HASHES = Object.freeze({
  deflection: "1080f45a12fba81321771c2071f4a31795444b110833f61384a9bdf7d057c19d",
  inverseRadius: "7fa22a9270e61f2842c97fb1a9398bcb13e1a965ad39b0f73169354a0d608b04"
});

let binaryPromise;
function readLutBinaries() {
  binaryPromise ??= Promise.all([
    readFile(DEFLECTION_PATH),
    readFile(INVERSE_RADIUS_PATH)
  ]).then(([deflection, inverseRadius]) => ({ deflection, inverseRadius }));
  return binaryPromise;
}

async function createBundledLuts(options) {
  const binary = await readLutBinaries();
  return createObservatoryRelativisticLensLuts({ ...binary, ...options });
}

function createSkyTexture() {
  const texture = new THREE.DataTexture(
    new Uint8Array([
      8, 12, 24, 255,
      32, 42, 66, 255,
      220, 190, 132, 255,
      12, 18, 38, 255
    ]),
    2,
    2,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createCamera() {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
  camera.position.set(-6, -30.4, 18);
  camera.lookAt(-1, 10.5, 13);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

test("bundled Bruneton tables retain exact dimensions, hashes, provenance, and BSD licence", async () => {
  const [binary, rawMeta, licence] = await Promise.all([
    readLutBinaries(),
    readFile(META_PATH, "utf8"),
    readFile(LICENSE_PATH, "utf8")
  ]);
  const metadata = JSON.parse(rawMeta);

  assert.equal(binary.deflection.byteLength, 2_097_160);
  assert.equal(binary.inverseRadius.byteLength, 16_392);
  assert.equal(
    createHash("sha256").update(binary.deflection).digest("hex"),
    EXPECTED_HASHES.deflection
  );
  assert.equal(
    createHash("sha256").update(binary.inverseRadius).digest("hex"),
    EXPECTED_HASHES.inverseRadius
  );

  assert.equal(metadata.schema, "cochonnet-observatory-schwarzschild-lut");
  assert.equal(metadata.version, 1);
  assert.equal(metadata.source.license, "BSD-3-Clause");
  assert.equal(
    metadata.source.revision,
    "e72b3f293409893a6fa25528b29572c96fc57f57"
  );
  assert.match(metadata.source.paper, /2010\.08735/);
  assert.deepEqual(
    metadata.files.map(({ width, height, channels }) => ({
      width,
      height,
      channels
    })),
    [
      { width: 512, height: 512, channels: 2 },
      { width: 64, height: 32, channels: 2 }
    ]
  );
  assert.match(licence, /Copyright \(c\) 2020 Eric Bruneton/);
  assert.match(licence, /Neither the name of the copyright holder/);
  assert.match(licence, /AS IS/);

  assert.equal(
    OBSERVATORY_RELATIVISTIC_LENS_DEFLECTION_URL,
    "/data/observatory-black-hole-ray-deflection-v1.bin"
  );
  assert.equal(
    OBSERVATORY_RELATIVISTIC_LENS_INVERSE_RADIUS_URL,
    "/data/observatory-black-hole-ray-inverse-radius-v1.bin"
  );
  assert.equal(
    OBSERVATORY_RELATIVISTIC_LENS_META_URL,
    "/data/observatory-black-hole-schwarzschild-lut-v1.meta.json"
  );
});

test("LUT decoder validates Bruneton headers and creates finite RG32F data", async () => {
  const binary = await readLutBinaries();
  const deflection = decodeObservatoryRelativisticLensLut(
    binary.deflection,
    "deflection"
  );
  const inverseRadius = decodeObservatoryRelativisticLensLut(
    binary.inverseRadius,
    "inverse-radius"
  );

  assert.deepEqual(
    [deflection.width, deflection.height, deflection.channels],
    [512, 512, 2]
  );
  assert.deepEqual(
    [inverseRadius.width, inverseRadius.height, inverseRadius.channels],
    [64, 32, 2]
  );
  assert.equal(deflection.data.length, 512 * 512 * 2);
  assert.equal(inverseRadius.data.length, 64 * 32 * 2);
  assert.ok(deflection.data.every(Number.isFinite));
  assert.ok(inverseRadius.data.every(Number.isFinite));
  assert.ok(Math.max(...inverseRadius.data) > 100);
  assert.ok(
    deflection.data.some((value) => value > Math.PI * 2),
    "near-critical rays must retain multiple-turn deflections"
  );

  assert.throws(
    () => decodeObservatoryRelativisticLensLut(binary.deflection.subarray(4), "deflection"),
    /bytes; expected/
  );
  assert.throws(
    () => decodeObservatoryRelativisticLensLut(binary.deflection, "unknown"),
    /Unknown observatory Schwarzschild LUT kind/
  );
});

test("texture factory exposes immutable-size, non-colour RG32F lookup textures", async () => {
  const luts = await createBundledLuts();
  for (const [key, texture] of Object.entries({
    deflection: luts.deflection,
    inverseRadius: luts.inverseRadius
  })) {
    const spec = OBSERVATORY_RELATIVISTIC_LENS_LUT_SPECS[key];
    assert.equal(texture.isDataTexture, true);
    assert.equal(texture.image.width, spec.width);
    assert.equal(texture.image.height, spec.height);
    assert.equal(texture.format, THREE.RGFormat);
    assert.equal(texture.type, THREE.FloatType);
    assert.equal(texture.internalFormat, "RG32F");
    assert.equal(texture.colorSpace, THREE.NoColorSpace);
    assert.equal(texture.minFilter, THREE.LinearFilter);
    assert.equal(texture.magFilter, THREE.LinearFilter);
    assert.equal(texture.generateMipmaps, false);
    assert.equal(texture.flipY, false);
    assert.ok(texture.version > 0);
  }

  let disposed = 0;
  luts.deflection.addEventListener("dispose", () => { disposed += 1; });
  luts.inverseRadius.addEventListener("dispose", () => { disposed += 1; });
  assert.equal(disposeObservatoryRelativisticLensLuts(luts), true);
  assert.equal(disposeObservatoryRelativisticLensLuts(luts), false);
  assert.equal(disposed, 2);
});

test("quality and capability contracts preserve an analytic and nearest-filter fallback", () => {
  assert.deepEqual(
    Object.keys(OBSERVATORY_RELATIVISTIC_LENS_QUALITY_PRESETS).sort(),
    ["high", "low", "medium", "minimum"]
  );
  assert.equal(normalizeObservatoryRelativisticLensQuality("HIGH"), "high");
  assert.equal(normalizeObservatoryRelativisticLensQuality("unknown"), "medium");
  assert.equal(getObservatoryRelativisticLensQualityPreset("high").rayBundleTaps, 3);
  assert.equal(getObservatoryRelativisticLensQualityPreset("medium").rayBundleTaps, 1);
  assert.equal(getObservatoryRelativisticLensQualityPreset("medium").secondaryDisc, true);
  assert.equal(getObservatoryRelativisticLensQualityPreset("minimum").useLuts, false);

  assert.deepEqual(
    getObservatoryRelativisticLensSupport({ isWebGL2: false }),
    {
      webgl2: false,
      supported: false,
      floatLinear: false,
      lutFilter: "nearest",
      fallback: "analytic"
    }
  );
  assert.deepEqual(
    getObservatoryRelativisticLensSupport({
      capabilities: { isWebGL2: true },
      extensions: { has: () => false }
    }),
    {
      webgl2: true,
      supported: true,
      floatLinear: false,
      lutFilter: "nearest",
      fallback: "nearest-lut"
    }
  );
  assert.equal(
    getObservatoryRelativisticLensSupport({
      capabilities: { isWebGL2: true },
      extensions: { has: () => true }
    }).fallback,
    null
  );
});

test("full-screen material samples the photographic sky through the Schwarzschild tables", async () => {
  const [luts, skyTexture] = await Promise.all([
    createBundledLuts(),
    Promise.resolve(createSkyTexture())
  ]);
  const lens = createObservatoryRelativisticLens({
    luts,
    skyTexture,
    quality: "high",
    visible: true,
    reveal: 1,
    stencilRef: OBSERVATORY_RELATIVISTIC_LENS_STENCIL_REF,
    lensPosition: [-1, 10.5, 13]
  });
  const material = lens.material;

  assert.equal(lens.name, OBSERVATORY_RELATIVISTIC_LENS_NAME);
  assert.equal(material.name, OBSERVATORY_RELATIVISTIC_LENS_MATERIAL_NAME);
  assert.equal(lens.renderOrder, OBSERVATORY_RELATIVISTIC_LENS_RENDER_ORDER);
  assert.equal(lens.frustumCulled, false);
  assert.equal(lens.geometry.attributes.position.count, 3);
  assert.equal(material.glslVersion, THREE.GLSL3);
  assert.equal(material.transparent, true);
  assert.equal(material.premultipliedAlpha, true);
  assert.equal(material.blending, THREE.CustomBlending);
  assert.equal(material.blendSrc, THREE.OneFactor);
  assert.equal(material.blendDst, THREE.OneMinusSrcAlphaFactor);
  assert.equal(material.depthTest, false);
  assert.equal(material.depthWrite, false);
  assert.equal(material.stencilWrite, true);
  assert.equal(material.stencilRef, OBSERVATORY_RELATIVISTIC_LENS_STENCIL_REF);
  assert.equal(material.stencilFunc, THREE.EqualStencilFunc);
  assert.equal(material.uniforms.uSkyTexture.value, skyTexture);
  assert.equal(material.uniforms.uRayDeflectionTexture.value, luts.deflection);
  assert.equal(material.uniforms.uRayInverseRadiusTexture.value, luts.inverseRadius);
  assert.equal(material.uniforms.uUseLuts.value, 1);
  assert.equal(material.uniforms.uSecondaryDisc.value, 1);
  assert.equal(material.uniforms.uRayBundleTaps.value, 3);
  assert.equal(material.defines.OBSERVATORY_MANUAL_LUT_BILINEAR, 0);
  assert.equal(material.uniforms.uHdrOutput.value, 1);
  assert.equal(
    material.uniforms.uOpticalScale.value,
    OBSERVATORY_RELATIVISTIC_LENS_OPTICAL_SCALE
  );
  assert.ok(OBSERVATORY_RELATIVISTIC_LENS_OPTICAL_SCALE >= 1.45);
  assert.deepEqual(OBSERVATORY_BLACK_HOLE_FLOW_PERIODS, {
    inner: 10,
    middle: 15,
    outer: 25
  });

  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /traceSchwarzschildRay/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /lookupRayDeflection/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /lookupRayInverseRadius/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /sampleLutBilinear/);
  assert.match(
    OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER,
    /#if OBSERVATORY_MANUAL_LUT_BILINEAR == 0/
  );
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /texelFetch/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /textureGrad\(uSkyTexture/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /magnification/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /criticalGlint/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /trace\.u1/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /trace\.u0/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /specialRelativistic/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /gravitational/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /pow\(doppler, 3\.0\)/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /blackBodyGold/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /discFbm/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /const float FLOW_INNER_PERIOD = 10\.0/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /const float FLOW_MIDDLE_PERIOD = 15\.0/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /const float FLOW_OUTER_PERIOD = 25\.0/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /2\.0 \* PI \/ orbitalPeriod/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /float longStream = sin\(flowPhase \* 2\.0/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /hotspotShape - FLOW_HOTSPOT_MEAN/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /\* flowStructure/);
  assert.doesNotMatch(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /0\.31 \/ pow/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /pointDirection/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /discAxisY/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /cheapWarp/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /eventHorizonMask/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /hdrRadiance/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /mappedLuminance/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /emissiveCoverage/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /glintGain/);
  assert.match(OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER, /analyticFallbackTrace/);
  assert.doesNotMatch(
    OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER,
    /broadLane|fineLane|turbulenceLane|orbitalTangent|warpedPoint|silhouetteCollar/
  );

  disposeObservatoryRelativisticLens(lens);
  disposeObservatoryRelativisticLensLuts(luts);
  skyTexture.dispose();
});

test("update copies the real camera, changes quality, and reports LUT fallback explicitly", async () => {
  const luts = await createBundledLuts();
  const skyTexture = createSkyTexture();
  const camera = createCamera();
  const lens = createObservatoryRelativisticLens({
    luts,
    skyTexture,
    quality: "medium",
    visible: true
  });
  assert.equal(
    lens.material.stencilWrite,
    false,
    "the pass-scene mesh leaves dome stencil ownership to the main composite"
  );
  const position = new THREE.Vector3(-1, 10.5, 13);
  const skyRotation = new THREE.Matrix3().set(
    0, -1, 0,
    1, 0, 0,
    0, 0, 1
  );

  assert.equal(updateObservatoryRelativisticLens(lens, camera, {
    timeSeconds: 8.5,
    reveal: 1,
    quality: "high",
    lensPosition: position,
    discNormal: [0.1, 0.9, 0.2],
    skyRotation,
    skyBrightness: 0.48,
    blackHoleRadius: 1.9,
    discInnerRadius: 3.12,
    discOuterRadius: 8.2,
    discOpacity: 0.72,
    influenceRadius: 0.61,
    opticalScale: 1.62
  }), true);
  assert.equal(lens.visible, true);
  assert.equal(lens.userData.quality, "high");
  assert.equal(lens.userData.fallback, false);
  assert.equal(lens.material.uniforms.uTime.value, 8.5);
  assert.equal(lens.material.uniforms.uReveal.value, 1);
  assert.equal(lens.material.uniforms.uUseLuts.value, 1);
  assert.equal(lens.material.uniforms.uSecondaryDisc.value, 1);
  assert.equal(lens.material.uniforms.uRayBundleTaps.value, 3);
  assert.deepEqual(
    lens.material.uniforms.uCameraPosition.value.toArray(),
    camera.position.toArray()
  );
  assert.deepEqual(
    lens.material.uniforms.uLensPosition.value.toArray(),
    position.toArray()
  );
  assert.deepEqual(
    lens.material.uniforms.uSkyRotation.value.toArray(),
    skyRotation.toArray()
  );
  assert.equal(lens.material.uniforms.uBlackHoleRadius.value, 1.9);
  assert.equal(lens.material.uniforms.uDiscInnerRadius.value, 3.12);
  assert.equal(lens.material.uniforms.uDiscOuterRadius.value, 8.2);
  assert.equal(lens.material.uniforms.uOpticalScale.value, 1.62);

  assert.equal(updateObservatoryRelativisticLens(lens, camera, {
    reveal: 1,
    quality: "high",
    hdrOutput: false
  }), true);
  assert.equal(lens.material.uniforms.uHdrOutput.value, 0);

  assert.equal(updateObservatoryRelativisticLens(lens, camera, {
    reveal: 1,
    quality: "minimum"
  }), true);
  assert.equal(lens.material.uniforms.uUseLuts.value, 0);
  assert.equal(lens.material.uniforms.uSecondaryDisc.value, 0);
  assert.equal(lens.userData.fallback, false, "minimum deliberately selects analytic mode");

  assert.equal(updateObservatoryRelativisticLens(lens, camera, {
    reveal: 1,
    quality: "high",
    forceAnalytic: true
  }), true);
  assert.equal(lens.material.uniforms.uUseLuts.value, 0);
  assert.equal(lens.userData.fallback, true);
  assert.equal(lens.userData.fallbackReason, "forced-analytic");

  assert.equal(setObservatoryRelativisticLensLuts(lens, null), false);
  assert.equal(lens.material.defines.OBSERVATORY_MANUAL_LUT_BILINEAR, 0);
  assert.equal(updateObservatoryRelativisticLens(lens, camera, {
    reveal: 1,
    quality: "high"
  }), true);
  assert.equal(lens.userData.fallbackReason, "lut-unavailable");

  assert.equal(setObservatoryRelativisticLensVisible(lens, false), true);
  assert.equal(updateObservatoryRelativisticLens(lens, camera, { reveal: 1 }), false);
  assert.equal(lens.visible, false);

  disposeObservatoryRelativisticLens(lens);
  disposeObservatoryRelativisticLensLuts(luts);
  skyTexture.dispose();
});

test("prewarm restores production state and owned disposal is idempotent", async () => {
  const luts = await createBundledLuts({ linear: false });
  const skyTexture = createSkyTexture();
  const lens = createObservatoryRelativisticLens({
    luts,
    ownsLuts: true,
    skyTexture,
    quality: "low",
    visible: false,
    reveal: 0
  });
  let geometryDisposals = 0;
  let materialDisposals = 0;
  let lutDisposals = 0;
  lens.geometry.addEventListener("dispose", () => { geometryDisposals += 1; });
  lens.material.addEventListener("dispose", () => { materialDisposals += 1; });
  luts.deflection.addEventListener("dispose", () => { lutDisposals += 1; });
  luts.inverseRadius.addEventListener("dispose", () => { lutDisposals += 1; });

  assert.equal(luts.deflection.minFilter, THREE.NearestFilter);
  assert.equal(lens.material.defines.OBSERVATORY_MANUAL_LUT_BILINEAR, 1);
  const restore = prewarmObservatoryRelativisticLens(lens, "high");
  assert.equal(typeof restore, "function");
  assert.equal(lens.visible, true);
  assert.equal(lens.userData.prewarming, true);
  assert.equal(lens.material.uniforms.uUseLuts.value, 1);
  assert.equal(lens.material.uniforms.uSecondaryDisc.value, 1);
  assert.equal(lens.material.uniforms.uRayBundleTaps.value, 3);
  assert.ok(lens.material.uniforms.uReveal.value > 0);

  assert.equal(restore(), true);
  assert.equal(restore(), false);
  assert.equal(lens.visible, false);
  assert.equal(lens.userData.prewarming, false);
  assert.equal(lens.material.uniforms.uReveal.value, 0);
  assert.equal(lens.material.uniforms.uRayBundleTaps.value, 1);

  assert.equal(disposeObservatoryRelativisticLens(lens), true);
  assert.equal(disposeObservatoryRelativisticLens(lens), false);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(lutDisposals, 2);
  assert.equal(luts.disposed, true);
  assert.equal(setObservatoryRelativisticLensVisible(lens, true), false);
  assert.equal(prewarmObservatoryRelativisticLens(lens), false);
  assert.equal(
    updateObservatoryRelativisticLens(lens, createCamera(), { reveal: 1 }),
    false
  );
  skyTexture.dispose();
});

test("async loader stays browser-owner friendly through injected fetch", async () => {
  const binary = await readLutBinaries();
  const requests = [];
  const bodies = new Map([
    [OBSERVATORY_RELATIVISTIC_LENS_DEFLECTION_URL, binary.deflection],
    [OBSERVATORY_RELATIVISTIC_LENS_INVERSE_RADIUS_URL, binary.inverseRadius]
  ]);
  const fetchImpl = async (url, options) => {
    requests.push({ url, signal: options?.signal });
    const body = bodies.get(url);
    return {
      ok: Boolean(body),
      status: body ? 200 : 404,
      arrayBuffer: async () => body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength
      )
    };
  };
  const controller = new AbortController();
  const luts = await loadObservatoryRelativisticLensLuts({
    fetchImpl,
    signal: controller.signal,
    linear: false
  });
  assert.deepEqual(
    requests.map(({ url }) => url),
    [
      OBSERVATORY_RELATIVISTIC_LENS_DEFLECTION_URL,
      OBSERVATORY_RELATIVISTIC_LENS_INVERSE_RADIUS_URL
    ]
  );
  assert.equal(requests.every(({ signal }) => signal === controller.signal), true);
  assert.equal(luts.deflection.minFilter, THREE.NearestFilter);
  assert.equal(luts.inverseRadius.minFilter, THREE.NearestFilter);
  disposeObservatoryRelativisticLensLuts(luts);
});
