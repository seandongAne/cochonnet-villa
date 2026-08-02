import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";

import {
  calculateObservatoryPortalParallaxOffset,
  calculateObservatoryPortalTargetSize,
  centerObservatoryPortalFarField,
  createObservatoryPortal,
  createObservatoryPortalComposite,
  createObservatoryPortalRenderTarget,
  disposeObservatoryPortal,
  disposeObservatoryPortalComposite,
  disposeObservatoryPortalRenderTarget,
  getObservatoryPortalQuality,
  OBSERVATORY_PORTAL_DEFAULT_EMISSION_STRENGTH,
  OBSERVATORY_PORTAL_DEFAULT_EXTINCTION_STRENGTH,
  OBSERVATORY_PORTAL_DEFAULT_LENS_RADIUS,
  OBSERVATORY_PORTAL_COMPOSITE_NAME,
  OBSERVATORY_PORTAL_DEFAULT_QUALITY,
  OBSERVATORY_PORTAL_QUALITY_PRESETS,
  OBSERVATORY_PORTAL_STENCIL_REF,
  OBSERVATORY_PORTAL_TARGET_MAX_HEIGHT,
  OBSERVATORY_PORTAL_TARGET_MAX_WIDTH,
  projectObservatoryPortalLens,
  resizeObservatoryPortal,
  updateObservatoryPortalCamera,
  updateObservatoryPortalComposite
} from "../src/villa-map/observatory-portal.js";

test("finite Portal lens projection rejects the rear hemisphere and unstable extremes", () => {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 200);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateMatrixWorld(true);
  const target = new THREE.Vector2();

  assert.equal(
    projectObservatoryPortalLens(camera, new THREE.Vector3(0, 0, -42), target),
    true
  );
  assert.deepEqual(target.toArray(), [0.5, 0.5]);

  assert.equal(
    projectObservatoryPortalLens(camera, new THREE.Vector3(0, 0, 42), target),
    false,
    "a point behind the camera must not create a mirrored screen-space lens"
  );
  assert.deepEqual(target.toArray(), [0.5, 0.5]);

  assert.equal(
    projectObservatoryPortalLens(camera, new THREE.Vector3(Number.NaN, 0, -1), target),
    false
  );
  assert.ok(target.toArray().every(Number.isFinite));
});

test("portal quality tiers preserve aspect and hard-cap every FBO at 1280x720", () => {
  assert.equal(getObservatoryPortalQuality("unknown").id, OBSERVATORY_PORTAL_DEFAULT_QUALITY);
  assert.deepEqual(
    Object.keys(OBSERVATORY_PORTAL_QUALITY_PRESETS),
    ["high", "medium", "low"]
  );

  const high = calculateObservatoryPortalTargetSize({
    width: 2560,
    height: 1440,
    pixelRatio: 2,
    quality: "HIGH"
  });
  assert.equal(high.width, OBSERVATORY_PORTAL_TARGET_MAX_WIDTH);
  assert.equal(high.height, OBSERVATORY_PORTAL_TARGET_MAX_HEIGHT);
  assert.equal(high.width / high.height, 16 / 9);

  const medium = calculateObservatoryPortalTargetSize({
    width: 1920,
    height: 1080,
    pixelRatio: 1.8,
    quality: "medium"
  });
  assert.equal(medium.width, 960);
  assert.equal(medium.height, 540);

  const portrait = calculateObservatoryPortalTargetSize({
    width: 1080,
    height: 1920,
    pixelRatio: 2,
    quality: "high"
  });
  assert.ok(portrait.width <= OBSERVATORY_PORTAL_TARGET_MAX_WIDTH);
  assert.ok(portrait.height <= OBSERVATORY_PORTAL_TARGET_MAX_HEIGHT);
  assert.ok(Math.abs(portrait.width / portrait.height - 1080 / 1920) < 0.002);
});

test("portal render target has no depth/stencil allocation and disposes once", () => {
  const target = createObservatoryPortalRenderTarget({
    width: 4000,
    height: 2250,
    pixelRatio: 2,
    quality: "high"
  });
  assert.equal(target.width, 1280);
  assert.equal(target.height, 720);
  assert.equal(target.depthBuffer, false);
  assert.equal(target.stencilBuffer, false);
  assert.equal(target.samples, 0);
  assert.equal(target.texture.generateMipmaps, false);
  assert.equal(target.texture.type, THREE.UnsignedByteType);

  let disposals = 0;
  target.addEventListener("dispose", () => {
    disposals += 1;
  });
  assert.equal(disposeObservatoryPortalRenderTarget(target), true);
  assert.equal(disposeObservatoryPortalRenderTarget(target), false);
  assert.equal(disposals, 1);
});

test("portal camera gives near layers scaled parallax and far layers zero parallax", () => {
  const source = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 200);
  source.position.set(10, 5, -4);
  source.rotation.set(-0.2, 0.35, 0, "YXZ");
  source.updateProjectionMatrix();
  source.updateMatrixWorld(true);
  const portalCamera = new THREE.PerspectiveCamera();
  const portalOrigin = new THREE.Vector3(2, 1, -2);
  const cosmosOrigin = new THREE.Vector3(100, 50, 10);

  const rawOffset = calculateObservatoryPortalParallaxOffset(
    source.position,
    portalOrigin,
    0.25
  );
  assert.deepEqual(rawOffset.toArray(), [2, 1, -0.5]);

  updateObservatoryPortalCamera(source, portalCamera, {
    portalOrigin,
    cosmosOrigin,
    parallaxScale: 0.25
  });
  assert.deepEqual(portalCamera.position.toArray(), [102, 51, 9.5]);
  assert.ok(portalCamera.quaternion.angleTo(source.quaternion) < 1e-7);
  assert.deepEqual(
    portalCamera.projectionMatrix.toArray(),
    source.projectionMatrix.toArray()
  );

  const nearLayer = new THREE.Object3D();
  nearLayer.position.set(106, 52, 8);
  const nearVectorBefore = nearLayer.position.clone().sub(portalCamera.position);
  const farField = new THREE.Group();
  const farStar = new THREE.Object3D();
  farStar.position.set(30, 20, -40);
  farField.add(farStar);
  centerObservatoryPortalFarField(farField, portalCamera);
  const farVectorBefore = farStar.getWorldPosition(new THREE.Vector3())
    .sub(portalCamera.position);

  source.position.x += 4;
  updateObservatoryPortalCamera(source, portalCamera, {
    portalOrigin,
    cosmosOrigin,
    parallaxScale: 0.25
  });
  centerObservatoryPortalFarField(farField, portalCamera);

  const nearVectorAfter = nearLayer.position.clone().sub(portalCamera.position);
  const farVectorAfter = farStar.getWorldPosition(new THREE.Vector3())
    .sub(portalCamera.position);
  assert.equal(portalCamera.position.x, 103, "4 room metres map to 1 cosmic metre");
  assert.notDeepEqual(nearVectorAfter.toArray(), nearVectorBefore.toArray());
  assert.deepEqual(farVectorAfter.toArray(), farVectorBefore.toArray());
});

test("fullscreen portal composite reads the existing dome stencil", () => {
  const texture = new THREE.Texture();
  const composite = createObservatoryPortalComposite({ texture, reveal: 0.25 });
  const material = composite.material;

  assert.equal(composite.name, OBSERVATORY_PORTAL_COMPOSITE_NAME);
  assert.equal(composite.geometry.attributes.position.count, 3);
  assert.equal(composite.frustumCulled, false);
  assert.ok(
    composite.renderOrder > -900,
    "the near dust composite must draw after the fixed Gaia/hero-star field"
  );
  assert.equal(material.type, "ShaderMaterial");
  assert.equal(material.uniforms.uPortalTexture.value, texture);
  assert.equal(material.uniforms.uReveal.value, 0.25);
  assert.equal(
    material.uniforms.uEmissionStrength.value,
    OBSERVATORY_PORTAL_DEFAULT_EMISSION_STRENGTH
  );
  assert.equal(
    material.uniforms.uExtinctionStrength.value,
    OBSERVATORY_PORTAL_DEFAULT_EXTINCTION_STRENGTH
  );
  assert.equal(material.uniforms.uLensAmount.value, 0);
  assert.deepEqual(material.uniforms.uLensCenter.value.toArray(), [0.5, 0.5]);
  assert.equal(material.uniforms.uLensRadius.value, OBSERVATORY_PORTAL_DEFAULT_LENS_RADIUS);
  assert.equal(material.transparent, true);
  assert.equal(material.blending, THREE.CustomBlending);
  assert.equal(material.blendSrc, THREE.OneFactor);
  assert.equal(material.blendDst, THREE.OneMinusSrcAlphaFactor);
  assert.equal(material.depthTest, false);
  assert.equal(material.depthWrite, false);
  assert.equal(material.stencilRef, OBSERVATORY_PORTAL_STENCIL_REF);
  assert.equal(material.stencilFunc, THREE.EqualStencilFunc);
  assert.match(material.fragmentShader, /uniform sampler2D uPortalTexture/);
  assert.match(material.fragmentShader, /vec2 portalUv = vUv/);
  assert.match(material.fragmentShader, /if \(uLensAmount > 0\.0\)/);
  assert.match(
    material.fragmentShader,
    /radialDirection = lensMetric \/ max\(rawLensDistance, 0\.00001\)/,
    "the centre pixel must never normalize a zero vector"
  );
  assert.match(material.fragmentShader, /lensDeflection/);
  assert.match(material.fragmentShader, /lensOcclusion/);
  assert.match(material.fragmentShader, /gl_FragColor = vec4\(emission, extinction\)/);
  assert.match(material.fragmentShader, /existingSky \* \(1 - extinction\)/);
  assert.match(material.fragmentShader, /#include <colorspace_fragment>/);

  assert.equal(updateObservatoryPortalComposite(composite, { reveal: 3 }), true);
  assert.equal(material.uniforms.uReveal.value, 1);
  updateObservatoryPortalComposite(composite, {
    emissionStrength: 4,
    extinctionStrength: -1,
    lensAmount: 2,
    lensCenter: [0.2, 0.8],
    lensAspect: 8,
    lensRadius: 0.5
  });
  assert.equal(material.uniforms.uEmissionStrength.value, 2);
  assert.equal(material.uniforms.uExtinctionStrength.value, 0);
  assert.equal(material.uniforms.uLensAmount.value, 1);
  assert.deepEqual(material.uniforms.uLensCenter.value.toArray(), [0.2, 0.8]);
  assert.equal(material.uniforms.uLensAspect.value, 4);
  assert.equal(material.uniforms.uLensRadius.value, 0.3);
  disposeObservatoryPortalComposite(composite);
  texture.dispose();
});

test("aggregate portal resizes within its quality cap and disposes idempotently", () => {
  const source = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  source.position.set(1, 2, 3);
  source.updateMatrixWorld(true);
  const portal = createObservatoryPortal({
    sourceCamera: source,
    width: 640,
    height: 360,
    pixelRatio: 1,
    quality: "medium"
  });
  assert.equal(portal.composite.material.uniforms.uPortalTexture.value, portal.renderTarget.texture);

  const size = resizeObservatoryPortal(portal, {
    width: 8000,
    height: 4500,
    pixelRatio: 2,
    quality: "high"
  });
  assert.deepEqual([size.width, size.height], [1280, 720]);
  assert.equal(portal.quality, "high");
  assert.equal(
    portal.parallaxScale,
    OBSERVATORY_PORTAL_QUALITY_PRESETS.high.parallaxScale,
    "quality changes must update the controlled parallax gain"
  );

  let targetDisposals = 0;
  let geometryDisposals = 0;
  portal.renderTarget.addEventListener("dispose", () => { targetDisposals += 1; });
  portal.composite.geometry.addEventListener("dispose", () => { geometryDisposals += 1; });
  assert.equal(disposeObservatoryPortal(portal), true);
  assert.equal(disposeObservatoryPortal(portal), false);
  assert.equal(targetDisposals, 1);
  assert.equal(geometryDisposals, 1);
});
