import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";

import {
  calculateObservatoryBlackHolePassLocalHdrSettings,
  calculateObservatoryBlackHolePassTargetSize,
  createObservatoryBlackHolePass,
  createObservatoryBlackHolePassComposite,
  createObservatoryBlackHolePassRenderTarget,
  disposeObservatoryBlackHolePass,
  disposeObservatoryBlackHolePassComposite,
  disposeObservatoryBlackHolePassRenderTarget,
  getObservatoryBlackHolePassQuality,
  OBSERVATORY_BLACK_HOLE_PASS_COMPOSITE_NAME,
  OBSERVATORY_BLACK_HOLE_PASS_DEFAULT_QUALITY,
  OBSERVATORY_BLACK_HOLE_PASS_LOCAL_HDR_PROFILES,
  OBSERVATORY_BLACK_HOLE_PASS_QUALITY_PRESETS,
  OBSERVATORY_BLACK_HOLE_PASS_RENDER_ORDER,
  OBSERVATORY_BLACK_HOLE_PASS_STENCIL_REF,
  resizeObservatoryBlackHolePass,
  updateObservatoryBlackHolePassCamera,
  updateObservatoryBlackHolePassComposite
} from "../src/villa-map/observatory-black-hole-pass.js";

test("black-hole local HDR is bounded to High/Medium and Low keeps the legacy path", () => {
  assert.deepEqual(
    Object.keys(OBSERVATORY_BLACK_HOLE_PASS_LOCAL_HDR_PROFILES),
    ["high", "medium", "low"]
  );

  const high = calculateObservatoryBlackHolePassLocalHdrSettings({
    width: 1920,
    height: 1080,
    quality: "high"
  });
  const medium = calculateObservatoryBlackHolePassLocalHdrSettings({
    width: 1280,
    height: 720,
    quality: "medium"
  });
  const low = calculateObservatoryBlackHolePassLocalHdrSettings({
    width: 960,
    height: 540,
    quality: "low"
  });

  assert.equal(high.enabled, true);
  assert.equal(medium.enabled, true);
  assert.equal(low.enabled, false);
  assert.equal(high.sampleTier, 2);
  assert.equal(medium.sampleTier, 1);
  assert.equal(low.sampleTier, 0);
  assert.ok(high.haloStrength > medium.haloStrength);
  assert.ok(high.coreGain > medium.coreGain);
  assert.ok(medium.coreGain > 1);
  assert.equal(low.haloStrength, 0);
  assert.equal(low.coreGain, 1);
  assert.equal(low.haloRadiusPixels, 0);
  assert.ok(high.haloRadiusPixels <= 96);
  assert.ok(medium.haloRadiusPixels <= 64);
  assert.equal(high.inverseWidth, 1 / 1920);
  assert.equal(high.inverseHeight, 1 / 1080);
});

test("black-hole pass quality tiers preserve aspect and enforce their own caps", () => {
  assert.deepEqual(
    Object.keys(OBSERVATORY_BLACK_HOLE_PASS_QUALITY_PRESETS),
    ["high", "medium", "low"]
  );
  assert.equal(
    getObservatoryBlackHolePassQuality("unknown").id,
    OBSERVATORY_BLACK_HOLE_PASS_DEFAULT_QUALITY
  );

  for (const [quality, expected] of [
    ["HIGH", [1920, 1080]],
    ["medium", [1280, 720]],
    ["low", [960, 540]]
  ]) {
    const size = calculateObservatoryBlackHolePassTargetSize({
      width: 3840,
      height: 2160,
      pixelRatio: 2,
      quality
    });
    assert.deepEqual([size.width, size.height], expected);
    assert.equal(size.width / size.height, 16 / 9);
  }

  const portrait = calculateObservatoryBlackHolePassTargetSize({
    width: 1080,
    height: 1920,
    pixelRatio: 2,
    quality: "high"
  });
  assert.ok(portrait.width <= 1920);
  assert.ok(portrait.height <= 1080);
  assert.ok(Math.abs(portrait.width / portrait.height - 1080 / 1920) < 0.002);
});

test("black-hole target keeps depth, drops stencil/MSAA/mipmaps, and disposes once", () => {
  const target = createObservatoryBlackHolePassRenderTarget({
    width: 4000,
    height: 2250,
    pixelRatio: 2,
    quality: "high"
  });
  assert.deepEqual([target.width, target.height], [1920, 1080]);
  assert.equal(target.depthBuffer, true);
  assert.equal(target.stencilBuffer, false);
  assert.equal(target.samples, 0);
  assert.equal(target.texture.generateMipmaps, false);
  assert.equal(target.texture.minFilter, THREE.LinearFilter);
  assert.equal(target.texture.magFilter, THREE.LinearFilter);
  assert.equal(target.texture.colorSpace, THREE.NoColorSpace);
  assert.equal(target.texture.type, THREE.UnsignedByteType);

  let disposals = 0;
  target.addEventListener("dispose", () => { disposals += 1; });
  assert.equal(disposeObservatoryBlackHolePassRenderTarget(target), true);
  assert.equal(disposeObservatoryBlackHolePassRenderTarget(target), false);
  assert.equal(disposals, 1);
});

test("black-hole pass camera copies full world translation, rotation, and projection", () => {
  const rig = new THREE.Group();
  rig.position.set(8, -3, 5);
  rig.rotation.set(0.08, -0.3, 0.04, "YXZ");
  const source = new THREE.PerspectiveCamera(61, 16 / 9, 0.2, 350);
  source.position.set(3, 4, -7);
  source.rotation.set(-0.24, 0.48, 0.03, "YXZ");
  source.zoom = 1.15;
  source.updateProjectionMatrix();
  rig.add(source);
  rig.updateMatrixWorld(true);

  const pass = createObservatoryBlackHolePass({
    sourceCamera: source,
    width: 800,
    height: 450,
    quality: "medium"
  });
  const expectedPosition = source.getWorldPosition(new THREE.Vector3());
  const expectedQuaternion = source.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(pass.camera.position.distanceTo(expectedPosition) < 1e-9);
  assert.ok(pass.camera.quaternion.angleTo(expectedQuaternion) < 1e-7);
  assert.deepEqual(
    pass.camera.projectionMatrix.toArray(),
    source.projectionMatrix.toArray()
  );

  const lensAnchor = new THREE.Object3D();
  lensAnchor.name = "mushroom-observatory-black-hole";
  lensAnchor.position.copy(expectedPosition).addScaledVector(
    source.getWorldDirection(new THREE.Vector3()),
    42
  );
  lensAnchor.userData.cameraDistance = 42;
  lensAnchor.userData.angularRadius = 0.17;
  pass.scene.add(lensAnchor);
  updateObservatoryBlackHolePassCamera(source, pass);
  assert.ok(
    pass.composite.material.uniforms.uLensUvCenter.value.distanceTo(
      new THREE.Vector2(0.5, 0.5)
    ) < 1e-7
  );
  assert.ok(pass.composite.material.uniforms.uLensUvRadius.value > 0.08);
  assert.ok(pass.composite.material.uniforms.uLensUvRadius.value < 0.2);

  const previousPosition = pass.camera.position.clone();
  rig.position.x += 4;
  rig.updateMatrixWorld(true);
  assert.equal(updateObservatoryBlackHolePassCamera(source, pass), pass.camera);
  const movedPosition = source.getWorldPosition(new THREE.Vector3());
  assert.ok(pass.camera.position.distanceTo(movedPosition) < 1e-9);
  assert.ok(Math.abs(pass.camera.position.distanceTo(previousPosition) - 4) < 1e-9);

  rig.rotation.y += 0.2;
  rig.updateMatrixWorld(true);
  updateObservatoryBlackHolePassCamera(source, pass);
  const rotatedQuaternion = source.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(pass.camera.quaternion.angleTo(rotatedQuaternion) < 1e-7);

  disposeObservatoryBlackHolePass(pass);
});

test("fullscreen composite is stencil-clipped and preserves premultiplied pass semantics", () => {
  const texture = new THREE.Texture();
  const composite = createObservatoryBlackHolePassComposite({
    texture,
    reveal: 0.35,
    width: 1280,
    height: 720,
    quality: "medium"
  });
  const material = composite.material;

  assert.equal(composite.name, OBSERVATORY_BLACK_HOLE_PASS_COMPOSITE_NAME);
  assert.equal(composite.geometry.attributes.position.count, 3);
  assert.equal(composite.frustumCulled, false);
  assert.equal(composite.renderOrder, OBSERVATORY_BLACK_HOLE_PASS_RENDER_ORDER);
  assert.equal(composite.renderOrder, -890);
  assert.equal(material.uniforms.uBlackHoleTexture.value, texture);
  assert.equal(material.uniforms.uReveal.value, 0.35);
  assert.equal(material.defines.OBSERVATORY_BH_LOCAL_HDR, 1);
  assert.deepEqual(
    material.uniforms.uInvResolution.value.toArray(),
    [1 / 1280, 1 / 720]
  );
  assert.ok(material.uniforms.uHaloRadiusPixels.value > 0);
  assert.ok(material.uniforms.uHaloStrength.value > 0);
  assert.ok(material.uniforms.uCoreGain.value > 1);
  assert.deepEqual(material.uniforms.uLensUvCenter.value.toArray(), [0.5, 0.5]);
  assert.equal(material.uniforms.uLensUvRadius.value, 0.12);
  assert.equal(material.uniforms.uCompositeAspect.value, 1280 / 720);
  assert.equal(material.transparent, true);
  assert.equal(material.blending, THREE.CustomBlending);
  assert.equal(material.blendEquation, THREE.AddEquation);
  assert.equal(material.blendSrc, THREE.OneFactor);
  assert.equal(material.blendDst, THREE.OneMinusSrcAlphaFactor);
  assert.equal(material.blendSrcAlpha, THREE.OneFactor);
  assert.equal(material.blendDstAlpha, THREE.OneMinusSrcAlphaFactor);
  assert.equal(material.depthTest, false);
  assert.equal(material.depthWrite, false);
  assert.equal(material.stencilWrite, true);
  assert.equal(material.stencilRef, OBSERVATORY_BLACK_HOLE_PASS_STENCIL_REF);
  assert.equal(material.stencilFunc, THREE.EqualStencilFunc);
  assert.equal(material.stencilFail, THREE.KeepStencilOp);
  assert.equal(material.stencilZFail, THREE.KeepStencilOp);
  assert.equal(material.stencilZPass, THREE.KeepStencilOp);
  assert.match(material.fragmentShader, /localRadiance \* reveal/);
  assert.match(material.fragmentShader, /blackHoleLayer\.a \* reveal/);
  assert.match(
    material.fragmentShader,
    /observatoryThermalEnergy\([\s\S]*colour\.r - colour\.b[\s\S]*colour\.g - colour\.b/
  );
  assert.match(material.fragmentShader, /immediateSupport/);
  assert.match(material.fragmentShader, /supportedNeutralRidge/);
  assert.match(material.fragmentShader, /float coreCandidate = supportedNeutralRidge/);
  assert.match(material.fragmentShader, /pow\(coreCandidate, 2\.15\)/);
  assert.match(material.fragmentShader, /flatNeutralShoulder/);
  assert.match(material.fragmentShader, /carrierLift \* 0\.12/);
  assert.match(material.fragmentShader, /uLensUvCenter/);
  assert.match(material.fragmentShader, /uLensUvRadius/);
  assert.match(material.fragmentShader, /aureoleTail/);
  assert.match(material.fragmentShader, /smoothGold/);
  assert.doesNotMatch(material.fragmentShader, /photonWhite|photonPeak/);
  assert.doesNotMatch(material.fragmentShader, /nearEnergy|middleEnergy|farEnergy/);
  assert.match(material.fragmentShader, /uCoreGain/);
  assert.match(material.fragmentShader, /uHaloStrength/);
  assert.match(material.fragmentShader, /#if OBSERVATORY_BH_LOCAL_HDR >= 1/);
  assert.match(material.fragmentShader, /#if OBSERVATORY_BH_LOCAL_HDR >= 2/);
  assert.match(material.fragmentShader, /whitePeak/);
  const thermalExtractor = material.fragmentShader.match(
    /float observatoryThermalEnergy\(vec3 colour\) \{[\s\S]*?\n  \}/
  )?.[0] ?? "";
  assert.ok(thermalExtractor.length > 0);
  assert.doesNotMatch(thermalExtractor, /alpha|blackHoleLayer/);
  assert.match(
    material.fragmentShader,
    /existingCosmos \* \(1 - source\.a\)/
  );
  assert.match(material.fragmentShader, /#include <colorspace_fragment>/);

  assert.equal(updateObservatoryBlackHolePassComposite(composite, {
    reveal: 4,
    visible: false
  }), true);
  assert.equal(material.uniforms.uReveal.value, 1);
  assert.equal(composite.visible, false);

  const materialVersion = material.version;
  assert.equal(updateObservatoryBlackHolePassComposite(composite, {
    width: 960,
    height: 540,
    quality: "low"
  }), true);
  assert.equal(material.defines.OBSERVATORY_BH_LOCAL_HDR, 0);
  assert.equal(material.uniforms.uHaloRadiusPixels.value, 0);
  assert.equal(material.uniforms.uHaloStrength.value, 0);
  assert.equal(material.uniforms.uCoreGain.value, 1);
  assert.ok(material.version > materialVersion);

  let geometryDisposals = 0;
  let materialDisposals = 0;
  composite.geometry.addEventListener("dispose", () => { geometryDisposals += 1; });
  material.addEventListener("dispose", () => { materialDisposals += 1; });
  assert.equal(disposeObservatoryBlackHolePassComposite(composite), true);
  assert.equal(disposeObservatoryBlackHolePassComposite(composite), false);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  texture.dispose();
});

test("aggregate pass resizes, keeps its texture binding, and disposes idempotently", () => {
  const source = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 200);
  source.position.set(-6, -30.4, 18);
  source.lookAt(3, 8, 3);
  source.updateMatrixWorld(true);
  const pass = createObservatoryBlackHolePass({
    sourceCamera: source,
    width: 640,
    height: 360,
    pixelRatio: 1,
    quality: "low"
  });

  assert.equal(pass.scene.isScene, true);
  assert.equal(pass.camera.isCamera, true);
  assert.equal(pass.renderTarget.depthBuffer, true);
  assert.equal(
    pass.composite.material.uniforms.uBlackHoleTexture.value,
    pass.renderTarget.texture
  );
  assert.equal(pass.composite.visible, false);
  assert.equal(pass.composite.material.defines.OBSERVATORY_BH_LOCAL_HDR, 0);
  assert.equal(pass.composite.material.uniforms.uHaloStrength.value, 0);

  const size = resizeObservatoryBlackHolePass(pass, {
    width: 8000,
    height: 4500,
    pixelRatio: 2,
    quality: "high"
  });
  assert.deepEqual([size.width, size.height], [1920, 1080]);
  assert.equal(pass.quality, "high");
  assert.equal(pass.composite.material.defines.OBSERVATORY_BH_LOCAL_HDR, 2);
  assert.deepEqual(
    pass.composite.material.uniforms.uInvResolution.value.toArray(),
    [1 / 1920, 1 / 1080]
  );
  assert.ok(pass.composite.material.uniforms.uHaloStrength.value > 0);
  assert.equal(
    pass.composite.material.uniforms.uBlackHoleTexture.value,
    pass.renderTarget.texture
  );

  const ownedChild = new THREE.Object3D();
  pass.scene.add(ownedChild);
  const host = new THREE.Scene();
  host.add(pass.composite);
  let targetDisposals = 0;
  let geometryDisposals = 0;
  pass.renderTarget.addEventListener("dispose", () => { targetDisposals += 1; });
  pass.composite.geometry.addEventListener("dispose", () => { geometryDisposals += 1; });

  assert.equal(disposeObservatoryBlackHolePass(pass), true);
  assert.equal(disposeObservatoryBlackHolePass(pass), false);
  assert.equal(pass.disposed, true);
  assert.equal(pass.scene.children.length, 0);
  assert.equal(pass.composite.parent, null);
  assert.equal(targetDisposals, 1);
  assert.equal(geometryDisposals, 1);
  assert.equal(resizeObservatoryBlackHolePass(pass, { width: 10, height: 10 }), null);
  assert.equal(updateObservatoryBlackHolePassCamera(source, pass), null);
});
