import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";

import {
  createMushroomSky,
  disposeMushroomSky
} from "../src/villa-map/mushroom-sky.js";

import {
  createObservatoryGaiaSourceMap,
  createObservatoryGaiaSourceMapMaterial,
  createObservatoryHeroSourceMapMaterial,
  disposeObservatoryGaiaSourceMap,
  getObservatoryGaiaSourceMapQuality,
  OBSERVATORY_GAIA_SOURCE_MAP_CAMERA_NAME,
  OBSERVATORY_GAIA_SOURCE_MAP_DEFAULT_QUALITY,
  OBSERVATORY_GAIA_SOURCE_MAP_MATERIAL_NAME,
  OBSERVATORY_GAIA_SOURCE_MAP_POINTS_NAME,
  OBSERVATORY_GAIA_SOURCE_MAP_QUALITY_PRESETS,
  OBSERVATORY_GAIA_SOURCE_MAP_SCENE_NAME,
  OBSERVATORY_GAIA_SOURCE_MAP_TEXTURE_NAME,
  OBSERVATORY_HERO_SOURCE_MAP_MATERIAL_NAME,
  OBSERVATORY_HERO_SOURCE_MAP_POINTS_NAME,
  prewarmObservatoryGaiaSourceMap,
  renderObservatoryGaiaSourceMap,
  resizeObservatoryGaiaSourceMap,
  setObservatoryGaiaSourceMapGeometry,
  setObservatoryGaiaSourceMapHeroStars
} from "../src/villa-map/observatory-gaia-source-map.js";

function createSharedGaiaGeometry(offset = 0) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -1, 0.4 + offset, 0.2,
    0.3, 0.8, -0.5,
    0.5, -0.2, 0.3
  ], 3));
  geometry.setAttribute("aMagnitude", new THREE.Float32BufferAttribute([
    1.2,
    7.4,
    11.1
  ], 1));
  geometry.setAttribute("aIntensity", new THREE.Float32BufferAttribute([
    4.3,
    0.3,
    0.06
  ], 1));
  geometry.setAttribute("aStarColor", new THREE.Float32BufferAttribute([
    1, 0.9, 0.8,
    0.8, 0.9, 1,
    1, 1, 1
  ], 3));
  return geometry;
}

function createSourcePoints(geometry = createSharedGaiaGeometry()) {
  const points = new THREE.Points(geometry, new THREE.PointsMaterial());
  points.userData.maximumMagnitude = 11.1;
  return points;
}

class FakeRenderer {
  constructor() {
    this.autoClear = true;
    this.xr = { enabled: true };
    this.target = { name: "previous-target" };
    this.clearColor = new THREE.Color(0x123456);
    this.clearAlpha = 0.6;
    this.calls = [];
  }

  getRenderTarget() {
    return this.target;
  }

  setRenderTarget(target) {
    this.calls.push(["target", target]);
    this.target = target;
  }

  getClearColor(target) {
    return target.copy(this.clearColor);
  }

  getClearAlpha() {
    return this.clearAlpha;
  }

  setClearColor(colour, alpha) {
    this.calls.push(["clearColor", colour, alpha]);
    this.clearColor.set(colour);
    this.clearAlpha = alpha;
  }

  clear(colour, depth, stencil) {
    this.calls.push(["clear", colour, depth, stencil]);
  }

  render(scene, camera) {
    this.calls.push(["render", scene, camera]);
  }
}

test("Gaia source-map quality tiers are fixed 4:1 upper-hemisphere atlases", () => {
  assert.deepEqual(
    Object.keys(OBSERVATORY_GAIA_SOURCE_MAP_QUALITY_PRESETS),
    ["high", "medium"]
  );
  assert.deepEqual(
    getObservatoryGaiaSourceMapQuality("HIGH"),
    OBSERVATORY_GAIA_SOURCE_MAP_QUALITY_PRESETS.high
  );
  assert.deepEqual(
    getObservatoryGaiaSourceMapQuality("unknown"),
    OBSERVATORY_GAIA_SOURCE_MAP_QUALITY_PRESETS[
      OBSERVATORY_GAIA_SOURCE_MAP_DEFAULT_QUALITY
    ]
  );
  assert.deepEqual(
    [
      OBSERVATORY_GAIA_SOURCE_MAP_QUALITY_PRESETS.high.width,
      OBSERVATORY_GAIA_SOURCE_MAP_QUALITY_PRESETS.high.height
    ],
    [4096, 1024]
  );
  assert.deepEqual(
    [
      OBSERVATORY_GAIA_SOURCE_MAP_QUALITY_PRESETS.medium.width,
      OBSERVATORY_GAIA_SOURCE_MAP_QUALITY_PRESETS.medium.height
    ],
    [2048, 512]
  );
});

test("factory reuses Gaia geometry in an independent scene and RGBA8 target", () => {
  const source = createSourcePoints();
  const sourceMap = createObservatoryGaiaSourceMap(source, { quality: "high" });

  assert.equal(sourceMap.scene.name, OBSERVATORY_GAIA_SOURCE_MAP_SCENE_NAME);
  assert.equal(sourceMap.camera.name, OBSERVATORY_GAIA_SOURCE_MAP_CAMERA_NAME);
  assert.equal(sourceMap.camera.isOrthographicCamera, true);
  assert.equal(sourceMap.points.name, OBSERVATORY_GAIA_SOURCE_MAP_POINTS_NAME);
  assert.equal(sourceMap.material.name, OBSERVATORY_GAIA_SOURCE_MAP_MATERIAL_NAME);
  assert.equal(sourceMap.points.geometry, source.geometry);
  assert.notEqual(sourceMap.material, source.material);
  assert.equal(sourceMap.ownsGeometry, false);
  assert.equal(sourceMap.points.userData.observatorySharedGeometry, true);
  assert.equal(sourceMap.scene.children.length, 1);

  assert.deepEqual(
    [sourceMap.renderTarget.width, sourceMap.renderTarget.height],
    [4096, 1024]
  );
  assert.equal(sourceMap.texture, sourceMap.renderTarget.texture);
  assert.equal(sourceMap.texture.name, OBSERVATORY_GAIA_SOURCE_MAP_TEXTURE_NAME);
  assert.equal(sourceMap.texture.format, THREE.RGBAFormat);
  assert.equal(sourceMap.texture.type, THREE.UnsignedByteType);
  assert.equal(sourceMap.texture.colorSpace, THREE.NoColorSpace);
  assert.equal(sourceMap.texture.generateMipmaps, true);
  assert.equal(sourceMap.texture.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(sourceMap.texture.magFilter, THREE.LinearFilter);
  assert.equal(sourceMap.texture.wrapS, THREE.RepeatWrapping);
  assert.equal(sourceMap.texture.wrapT, THREE.ClampToEdgeWrapping);
  assert.equal(sourceMap.renderTarget.depthBuffer, false);
  assert.equal(sourceMap.renderTarget.stencilBuffer, false);
  assert.equal(sourceMap.renderTarget.samples, 0);

  source.material.dispose();
  disposeObservatoryGaiaSourceMap(sourceMap);
  source.geometry.dispose();
});

test("shader uses unrotated ICRS upper-dome mapping and a sharp halo-free PSF", () => {
  const material = createObservatoryGaiaSourceMapMaterial();
  assert.match(
    material.vertexShader,
    /fract\(atan\(sourceDirection\.z, -sourceDirection\.x\) \/ \(2\.0 \* PI\)\)/
  );
  assert.match(
    material.vertexShader,
    /asin\(clamp\(sourceDirection\.y, -1\.0, 1\.0\)\) \/ \(0\.5 \* PI\)/
  );
  assert.match(material.vertexShader, /sourceDirection\.y < 0\.0/);
  assert.match(material.fragmentShader, /vHemisphereVisible < 0\.5\) discard/);
  assert.doesNotMatch(material.vertexShader, /uniform\s+float\s+uSkyRotation/);
  assert.doesNotMatch(material.vertexShader, /mat[234]\s+\w*[Rr]otation/);
  assert.match(material.fragmentShader, /STAR_SIGMA_PX = 0\.36/);
  assert.match(material.fragmentShader, /smoothstep\(3\.65, 4\.15, vIntensity\)/);
  assert.match(material.fragmentShader, /diffractionGate \* 0\.012/);
  assert.doesNotMatch(material.fragmentShader, /secondaryGaussian|stellarHalo/);
  assert.equal(material.uniforms.uPointSupportPx.value, 7);
  assert.equal(material.blending, THREE.AdditiveBlending);
  assert.equal(material.depthTest, false);
  assert.equal(material.depthWrite, false);
  assert.equal(material.toneMapped, false);
  material.dispose();
});

test("optional procedural hero geometry joins the same atlas with its real contract", () => {
  const source = createSourcePoints();
  const sky = createMushroomSky({ starCount: 24, seed: 71 });
  const heroStars = sky.userData.stars;
  heroStars.material.uniforms.uTime.value = 3.25;
  sky.rotation.y = 0.07;
  sky.updateMatrixWorld(true);

  const sourceMap = createObservatoryGaiaSourceMap(source, {
    quality: "high",
    heroStars
  });
  assert.equal(sourceMap.scene.children.length, 2);
  assert.equal(sourceMap.heroPoints.name, OBSERVATORY_HERO_SOURCE_MAP_POINTS_NAME);
  assert.equal(
    sourceMap.heroMaterial.name,
    OBSERVATORY_HERO_SOURCE_MAP_MATERIAL_NAME
  );
  assert.equal(sourceMap.heroPoints.geometry, heroStars.geometry);
  assert.notEqual(sourceMap.heroMaterial, heroStars.material);
  assert.equal(sourceMap.heroPoints.userData.observatorySharedGeometry, true);
  assert.equal(sourceMap.userData.heroSource, heroStars);
  assert.equal(sourceMap.userData.heroSourceCount, 24);
  assert.equal(sourceMap.heroMaterial.uniforms.uTime.value, 3.25);

  for (const name of [
    "aPhase",
    "aTwinkleSpeed",
    "aTwinkleStrength",
    "aSize",
    "aRadiance",
    "aColor"
  ]) {
    assert.ok(heroStars.geometry.getAttribute(name), `missing ${name}`);
  }

  const expectedDirection = new THREE.Vector3(1, 0.5, -0.2)
    .normalize()
    .applyQuaternion(heroStars.getWorldQuaternion(new THREE.Quaternion()));
  const transformedDirection = new THREE.Vector3(1, 0.5, -0.2)
    .normalize()
    .applyMatrix3(
      sourceMap.heroMaterial.uniforms.uDirectionTransform.value
    )
    .normalize();
  assert.ok(expectedDirection.angleTo(transformedDirection) < 1e-7);

  disposeObservatoryGaiaSourceMap(sourceMap);
  source.material.dispose();
  source.geometry.dispose();
  disposeMushroomSky(sky);
});

test("hero atlas shader keeps sharp cores, no Airy halo, and only rare spikes", () => {
  const material = createObservatoryHeroSourceMapMaterial({ time: 2.5 });
  assert.match(material.vertexShader, /attribute float aRadiance/);
  assert.match(material.vertexShader, /attribute vec3 aColor/);
  assert.match(material.vertexShader, /uDirectionTransform \* position/);
  assert.match(material.vertexShader, /uTime \* aTwinkleSpeed \+ aPhase/);
  assert.match(
    material.vertexShader,
    /fract\(atan\(sourceDirection\.z, -sourceDirection\.x\) \/ \(2\.0 \* PI\)\)/
  );
  assert.match(material.vertexShader, /sourceDirection\.y < 0\.0/);
  assert.match(material.fragmentShader, /sigmaPx = mix\(0\.34, 0\.40/);
  assert.match(material.fragmentShader, /smoothstep\(4\.85, 5\.65, vRadiance\)/);
  assert.match(material.fragmentShader, /diffractionGate \* 0\.016/);
  assert.doesNotMatch(material.fragmentShader, /float\s+airyWing|float\s+\w*[Hh]alo/);
  assert.equal(material.uniforms.uTime.value, 2.5);
  assert.equal(material.blending, THREE.AdditiveBlending);
  assert.equal(material.depthTest, false);
  assert.equal(material.depthWrite, false);
  material.dispose();
});

test("render/prewarm populates once and restores renderer state", () => {
  const source = createSourcePoints();
  const sourceMap = createObservatoryGaiaSourceMap(source);
  const renderer = new FakeRenderer();
  const previousTarget = renderer.target;
  const previousColor = renderer.clearColor.clone();

  assert.equal(prewarmObservatoryGaiaSourceMap(sourceMap, renderer), true);
  assert.equal(sourceMap.rendered, true);
  assert.equal(sourceMap.prewarmed, true);
  assert.equal(sourceMap.dirty, false);
  assert.equal(sourceMap.renderCount, 1);
  assert.equal(renderer.target, previousTarget);
  assert.equal(renderer.autoClear, true);
  assert.equal(renderer.xr.enabled, true);
  assert.equal(renderer.clearAlpha, 0.6);
  assert.equal(renderer.clearColor.equals(previousColor), true);
  assert.equal(
    renderer.calls.filter(([kind]) => kind === "render").length,
    1
  );

  assert.equal(renderObservatoryGaiaSourceMap(sourceMap, renderer), false);
  assert.equal(sourceMap.renderCount, 1);
  assert.equal(renderObservatoryGaiaSourceMap(
    sourceMap,
    renderer,
    { force: true }
  ), true);
  assert.equal(sourceMap.renderCount, 2);

  disposeObservatoryGaiaSourceMap(sourceMap);
  source.material.dispose();
  source.geometry.dispose();
});

test("quality/geometry revisions invalidate the atlas without taking ownership", () => {
  const source = createSourcePoints();
  const sourceMap = createObservatoryGaiaSourceMap(source, { quality: "medium" });
  const renderer = new FakeRenderer();
  renderObservatoryGaiaSourceMap(sourceMap, renderer);

  const size = resizeObservatoryGaiaSourceMap(sourceMap, { quality: "high" });
  assert.deepEqual(
    [size.quality, size.width, size.height, size.changed],
    ["high", 4096, 1024, true]
  );
  assert.equal(sourceMap.dirty, true);
  assert.equal(sourceMap.rendered, false);
  assert.equal(sourceMap.renderTarget.userData.observatoryQuality, "high");
  assert.equal(renderObservatoryGaiaSourceMap(sourceMap, renderer), true);

  const secondGeometry = createSharedGaiaGeometry(0.1);
  const secondSource = createSourcePoints(secondGeometry);
  assert.equal(
    setObservatoryGaiaSourceMapGeometry(sourceMap, secondSource),
    true
  );
  assert.equal(sourceMap.points.geometry, secondGeometry);
  assert.equal(sourceMap.userData.sharedGeometry, secondGeometry);
  assert.equal(sourceMap.dirty, true);
  assert.equal(
    sourceMap.material.uniforms.uMagnitudeLimit.value,
    secondSource.userData.maximumMagnitude + 0.35
  );

  let firstGeometryDisposals = 0;
  let secondGeometryDisposals = 0;
  let materialDisposals = 0;
  let targetDisposals = 0;
  source.geometry.addEventListener("dispose", () => {
    firstGeometryDisposals += 1;
  });
  secondGeometry.addEventListener("dispose", () => {
    secondGeometryDisposals += 1;
  });
  sourceMap.material.addEventListener("dispose", () => {
    materialDisposals += 1;
  });
  sourceMap.renderTarget.addEventListener("dispose", () => {
    targetDisposals += 1;
  });

  assert.equal(disposeObservatoryGaiaSourceMap(sourceMap), true);
  assert.equal(disposeObservatoryGaiaSourceMap(sourceMap), false);
  assert.equal(firstGeometryDisposals, 0);
  assert.equal(secondGeometryDisposals, 0);
  assert.equal(materialDisposals, 1);
  assert.equal(targetDisposals, 1);
  assert.equal(sourceMap.scene.children.length, 0);
  assert.equal(resizeObservatoryGaiaSourceMap(sourceMap, { quality: "medium" }), null);
  assert.equal(renderObservatoryGaiaSourceMap(sourceMap, renderer), false);

  source.material.dispose();
  secondSource.material.dispose();
  source.geometry.dispose();
  secondGeometry.dispose();
});

test("hero replacement/removal invalidates the atlas and never owns hero geometry", () => {
  const source = createSourcePoints();
  const firstSky = createMushroomSky({ starCount: 8, seed: 2 });
  const secondSky = createMushroomSky({ starCount: 12, seed: 3 });
  const sourceMap = createObservatoryGaiaSourceMap(source, {
    heroStars: firstSky.userData.stars
  });
  const firstGeometry = firstSky.userData.stars.geometry;
  const secondGeometry = secondSky.userData.stars.geometry;
  let firstGeometryDisposals = 0;
  let secondGeometryDisposals = 0;
  firstGeometry.addEventListener("dispose", () => {
    firstGeometryDisposals += 1;
  });
  secondGeometry.addEventListener("dispose", () => {
    secondGeometryDisposals += 1;
  });

  const firstAtlasMaterial = sourceMap.heroMaterial;
  let firstAtlasMaterialDisposals = 0;
  firstAtlasMaterial.addEventListener("dispose", () => {
    firstAtlasMaterialDisposals += 1;
  });
  assert.equal(setObservatoryGaiaSourceMapHeroStars(
    sourceMap,
    secondSky.userData.stars,
    { time: 9 }
  ), true);
  assert.equal(firstAtlasMaterialDisposals, 1);
  assert.equal(sourceMap.heroPoints.geometry, secondGeometry);
  assert.equal(sourceMap.userData.heroSourceCount, 12);
  assert.equal(sourceMap.heroMaterial.uniforms.uTime.value, 9);
  assert.equal(sourceMap.dirty, true);

  assert.equal(setObservatoryGaiaSourceMapHeroStars(sourceMap, null), true);
  assert.equal(sourceMap.heroPoints, null);
  assert.equal(sourceMap.heroMaterial, null);
  assert.equal(sourceMap.userData.heroSource, null);
  assert.equal(sourceMap.scene.children.length, 1);
  assert.equal(firstGeometryDisposals, 0);
  assert.equal(secondGeometryDisposals, 0);

  disposeObservatoryGaiaSourceMap(sourceMap);
  assert.equal(firstGeometryDisposals, 0);
  assert.equal(secondGeometryDisposals, 0);
  source.material.dispose();
  source.geometry.dispose();
  disposeMushroomSky(firstSky);
  disposeMushroomSky(secondSky);
  assert.equal(firstGeometryDisposals, 1);
  assert.equal(secondGeometryDisposals, 1);
});

test("factory rejects non-Gaia geometry instead of silently rendering garbage", () => {
  assert.throws(
    () => createObservatoryGaiaSourceMap(new THREE.BufferGeometry()),
    /missing position/
  );
  assert.throws(
    () => createObservatoryGaiaSourceMap(null),
    /requires a THREE\.Points or BufferGeometry/
  );
});
