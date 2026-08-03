import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import * as THREE from "three";

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
  assert.match(shader, /Captured rays intentionally contribute opaque black/);
  assert.match(shader, /0\.72 - edgeAa,[\s\S]*?edgeDistance/);
  assert.doesNotMatch(shader, /texture\(uKerrSkyAtlas/);
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
