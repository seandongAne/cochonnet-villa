import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";

import {
  createObservatoryRiftVisual,
  disposeObservatoryRiftVisual,
  OBSERVATORY_RIFT_APERTURE_NAME,
  OBSERVATORY_RIFT_FRAGMENTS_NAME,
  OBSERVATORY_RIFT_SHARDS_NAME,
  OBSERVATORY_RIFT_STENCIL_REF,
  OBSERVATORY_RIFT_VISUAL_NAME,
  updateObservatoryRiftVisual
} from "../src/villa-map/observatory-rift-visual.js";
import {
  MUSHROOM_INTERIOR_CENTER,
  MUSHROOM_INTERIOR_EYE_Y
} from "../src/villa-map/mushroom-interior-config.js";

const OPEN_CHANNELS = Object.freeze({
  apertureExpansion: 1,
  wallDissolve: 1,
  foregroundDepth: 1,
  foregroundParallax: 1,
  ringFadeProgress: 0,
  ringIntensity: 0.4,
  backdropSuppression: 1,
  spatialMotionScale: 1
});

test("the rift builds a room-scale stencil aperture and three finite depth bands", () => {
  const visual = createObservatoryRiftVisual();
  assert.equal(visual.name, OBSERVATORY_RIFT_VISUAL_NAME);
  assert.deepEqual(
    visual.position.toArray(),
    [MUSHROOM_INTERIOR_CENTER.x, MUSHROOM_INTERIOR_EYE_Y[2] - 0.08, MUSHROOM_INTERIOR_CENTER.z]
  );

  const aperture = visual.getObjectByName(OBSERVATORY_RIFT_APERTURE_NAME);
  assert.ok(aperture?.isMesh);
  assert.equal(aperture.material.colorWrite, false);
  assert.equal(aperture.material.depthTest, true);
  assert.equal(aperture.material.stencilRef, OBSERVATORY_RIFT_STENCIL_REF);
  assert.equal(aperture.material.stencilFunc, THREE.AlwaysStencilFunc);
  assert.equal(aperture.material.stencilZPass, THREE.ReplaceStencilOp);

  const fragments = visual.getObjectByName(OBSERVATORY_RIFT_FRAGMENTS_NAME);
  assert.ok(fragments?.isPoints);
  assert.equal(fragments.geometry.attributes.position.count, 240);
  assert.equal(fragments.material.stencilFunc, THREE.EqualStencilFunc);
  assert.equal(fragments.material.depthTest, true);
  assert.equal(fragments.material.depthWrite, false);
  assert.match(
    fragments.material.vertexShader,
    /gl_PointSize\s*=\s*clamp\([\s\S]*?,\s*1\.0,\s*4\.5\s*\)/,
    "settled Rift fragments must remain sub-star-sized instead of becoming nearby bulbs"
  );

  const positions = fragments.geometry.attributes.position;
  const radii = Array.from({ length: positions.count }, (_, index) => (
    Math.hypot(positions.getX(index), positions.getY(index), positions.getZ(index))
  ));
  assert.ok(Math.max(...radii) - Math.min(...radii) > 3.5, "depth bands must be spatially separated");
  assert.equal(visual.userData.rings.length, 3);
  const shards = visual.getObjectByName(OBSERVATORY_RIFT_SHARDS_NAME);
  assert.ok(shards?.isInstancedMesh);
  assert.equal(shards.count, 24);
  assert.equal(shards.material.stencilFunc, THREE.EqualStencilFunc);
  assert.equal(shards.material.depthTest, true);
});

test("the rift reveal animates spatial layers and reduced motion freezes travel", () => {
  const visual = createObservatoryRiftVisual();
  assert.equal(updateObservatoryRiftVisual(visual, {
    ...OPEN_CHANNELS,
    apertureExpansion: 0.68
  }, 0.1, { pixelRatio: 2 }), true);
  const openingFragmentDepth = visual.userData.fragments.material.uniforms.uDepth.value;
  const openingShardOpacity = visual.userData.shards.material.opacity;

  assert.equal(updateObservatoryRiftVisual(visual, OPEN_CHANNELS, 0.5, { pixelRatio: 2 }), true);
  assert.equal(visual.visible, true);
  assert.equal(visual.userData.aperture.material.uniforms.uExpansion.value, 1);
  assert.ok(Math.abs(visual.userData.settledFragmentFactor - 0.12) < 1e-6);
  assert.ok(
    Math.abs(visual.userData.fragments.material.uniforms.uDepth.value - 0.12) < 1e-6,
    "fully unfolded near fragments should settle to 12% prominence"
  );
  assert.ok(
    visual.userData.fragments.material.uniforms.uDepth.value < openingFragmentDepth,
    "near fragments must decay after explaining the initial dome expansion"
  );
  assert.equal(visual.userData.fragments.material.uniforms.uPixelRatio.value, 1.8);
  assert.ok(visual.userData.rings.every((ring) => ring.visible && ring.material.opacity > 0));
  assert.equal(visual.userData.shards.visible, true);
  assert.ok(
    Math.abs(visual.userData.shards.material.opacity - 0.08) < 1e-6,
    "the stable shard layer must fade to a restrained 8% opacity"
  );
  assert.ok(
    visual.userData.shards.material.opacity < openingShardOpacity,
    "large room-scale shards must also decay once the Rift has settled"
  );

  const elapsed = visual.userData.elapsed;
  updateObservatoryRiftVisual(visual, {
    ...OPEN_CHANNELS,
    spatialMotionScale: 0,
    foregroundParallax: 0
  }, 0.1);
  assert.equal(visual.userData.elapsed, elapsed);

  assert.equal(updateObservatoryRiftVisual(visual, {}, 0.1), false);
  assert.equal(visual.visible, false);
  assert.equal(visual.userData.elapsed, 0, "a fully closed event starts fresh next time");
});

test("settled ring channels hide the seams and stop their rotation only", () => {
  const visual = createObservatoryRiftVisual();
  updateObservatoryRiftVisual(visual, OPEN_CHANNELS, 0.5);
  const rotationsBeforeFade = visual.userData.rings.map((ring) => ring.rotation.y);

  const settledChannels = {
    ...OPEN_CHANNELS,
    ringFadeProgress: 1,
    ringIntensity: 0
  };
  assert.equal(updateObservatoryRiftVisual(visual, settledChannels, 0.5), true);
  assert.equal(visual.userData.aperture.visible, true);
  assert.equal(visual.userData.fragments.visible, true);
  assert.equal(visual.userData.shards.visible, true);
  assert.ok(visual.userData.rings.every((ring) => (
    !ring.visible && ring.material.opacity === 0
  )));
  assert.deepEqual(
    visual.userData.rings.map((ring) => ring.rotation.y),
    rotationsBeforeFade
  );

  updateObservatoryRiftVisual(visual, settledChannels, 0.5);
  assert.deepEqual(
    visual.userData.rings.map((ring) => ring.rotation.y),
    rotationsBeforeFade,
    "invisible rings must not keep rotating behind the settled dome"
  );
});

test("rift visual disposal is idempotent", () => {
  const visual = createObservatoryRiftVisual();
  let disposals = 0;
  visual.userData.fragments.geometry.addEventListener("dispose", () => {
    disposals += 1;
  });
  assert.equal(disposeObservatoryRiftVisual(visual), true);
  assert.equal(disposeObservatoryRiftVisual(visual), false);
  assert.equal(disposals, 1);
  assert.equal(visual.children.length, 0);
});
