import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";

import {
  createObservatoryBlackHole,
  disposeObservatoryBlackHole,
  getObservatoryBlackHoleQualityPreset,
  normalizeObservatoryBlackHoleQuality,
  OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR,
  OBSERVATORY_BLACK_HOLE_DEBRIS_NAME,
  OBSERVATORY_BLACK_HOLE_DISK_ROOT_NAME,
  OBSERVATORY_BLACK_HOLE_FLOW_PERIODS,
  OBSERVATORY_BLACK_HOLE_HORIZON_NAME,
  OBSERVATORY_BLACK_HOLE_MOON_NAME,
  OBSERVATORY_BLACK_HOLE_NAME,
  OBSERVATORY_BLACK_HOLE_PHOTON_RING_NAME,
  OBSERVATORY_BLACK_HOLE_QUALITY_PRESETS,
  OBSERVATORY_BLACK_HOLE_WORLD_DISTANCE,
  prewarmObservatoryBlackHole,
  setObservatoryBlackHoleVisible,
  updateObservatoryBlackHole
} from "../src/villa-map/observatory-black-hole.js";
import {
  MUSHROOM_INTERIOR_CENTER,
  MUSHROOM_INTERIOR_EYE_Y
} from "../src/villa-map/mushroom-interior-config.js";

function createLoftCamera() {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
  camera.position.set(
    MUSHROOM_INTERIOR_CENTER.x,
    MUSHROOM_INTERIOR_EYE_Y[2],
    MUSHROOM_INTERIOR_CENTER.z
  );
  camera.updateMatrixWorld(true);
  return camera;
}

test("black-hole core is a finite 42 m world object with a tilted 14.4 m thick disc", () => {
  const blackHole = createObservatoryBlackHole();
  assert.equal(blackHole.name, OBSERVATORY_BLACK_HOLE_NAME);
  assert.deepEqual(blackHole.position.toArray(), [
    OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR.x,
    OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR.y,
    OBSERVATORY_BLACK_HOLE_DEFAULT_ANCHOR.z
  ]);

  const loftOrigin = new THREE.Vector3(
    MUSHROOM_INTERIOR_CENTER.x,
    MUSHROOM_INTERIOR_EYE_Y[2],
    MUSHROOM_INTERIOR_CENTER.z
  );
  assert.ok(
    Math.abs(blackHole.position.distanceTo(loftOrigin)
      - OBSERVATORY_BLACK_HOLE_WORLD_DISTANCE) < 1e-9
  );

  const resources = blackHole.userData.resources;
  const diskRoot = blackHole.getObjectByName(OBSERVATORY_BLACK_HOLE_DISK_ROOT_NAME);
  assert.equal(diskRoot, resources.diskRoot);
  assert.ok(
    Math.abs(diskRoot.rotation.x) > 0.5
      && Math.abs(diskRoot.rotation.z) > 0.1,
    "the disc must be visibly tilted instead of a camera-facing flat ring"
  );
  assert.equal(resources.diskLayers.length, 3);
  assert.equal(
    resources.diskLayers.at(-1).geometry.userData.outerRadius * 2,
    14.4
  );

  for (const layer of resources.diskLayers) {
    const { geometry, occluder, glow } = layer;
    assert.equal(geometry, occluder.geometry);
    assert.equal(geometry, glow.geometry);
    assert.ok(geometry.attributes.aRadius);
    assert.ok(geometry.attributes.aAzimuth);
    assert.ok(geometry.attributes.aSurface);
    const surfaces = new Set(Array.from(geometry.attributes.aSurface.array));
    assert.deepEqual(surfaces, new Set([-1, 0, 1]));
    const thickness = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
    assert.ok(thickness >= 0.27, "the annulus must have visible edge thickness");

    assert.equal(occluder.material.colorWrite, false);
    assert.equal(occluder.material.depthTest, true);
    assert.equal(occluder.material.depthWrite, true);
    assert.equal(glow.material.transparent, true);
    assert.equal(glow.material.depthTest, true);
    assert.equal(glow.material.depthWrite, false);
    assert.equal(glow.material.depthFunc, THREE.LessEqualDepth);
    assert.ok(occluder.renderOrder < glow.renderOrder);
  }
});

test("horizon, spherical photon shell, and offset crescent moon provide layered scale cues", () => {
  const blackHole = createObservatoryBlackHole();
  const resources = blackHole.userData.resources;
  const horizon = blackHole.getObjectByName(OBSERVATORY_BLACK_HOLE_HORIZON_NAME);
  assert.equal(horizon, resources.horizon);
  assert.equal(horizon.material.transparent, false);
  assert.equal(horizon.material.depthTest, true);
  assert.equal(horizon.material.depthWrite, true);
  assert.match(horizon.material.fragmentShader, /screenDither/);

  assert.equal(resources.photonRings.length, 2);
  for (const [index, ring] of resources.photonRings.entries()) {
    assert.equal(
      ring.name,
      `${OBSERVATORY_BLACK_HOLE_PHOTON_RING_NAME}-${index + 1}`
    );
    assert.equal(ring.material.transparent, true);
    assert.equal(ring.material.blending, THREE.AdditiveBlending);
    assert.equal(ring.material.depthTest, true);
    assert.equal(ring.material.depthWrite, false);
    assert.match(ring.material.fragmentShader, /vWorldNormal/);
  }

  const moon = blackHole.getObjectByName(OBSERVATORY_BLACK_HOLE_MOON_NAME);
  assert.equal(moon, resources.moon);
  assert.equal(moon.userData.role, "finite-scale-reference");
  assert.ok(moon.position.length() > 6, "the dark moon must be visibly offset");
  assert.ok(moon.userData.radius > 0.7 && moon.userData.radius < 0.9);
  assert.equal(moon.material.transparent, false);
  assert.equal(moon.material.depthTest, true);
  assert.equal(moon.material.depthWrite, true);
  assert.match(moon.material.fragmentShader, /crescent/);
  assert.match(moon.material.fragmentShader, /limb/);
  assert.match(moon.material.fragmentShader, /screenDither/);
  assert.match(moon.material.fragmentShader, /if \(screenDither\(gl_FragCoord\.xy\) > coverage\) discard/);
});

test("the singularity uses a locally compressed solar black-and-gold palette", () => {
  const blackHole = createObservatoryBlackHole();
  const resources = blackHole.userData.resources;
  const diskPalette = resources.diskLayers.map((layer) => ({
    approach: `#${layer.material.uniforms.uApproachColour.value.getHexString()}`,
    recede: `#${layer.material.uniforms.uRecedeColour.value.getHexString()}`,
    brightness: layer.material.uniforms.uBrightness.value
  }));

  assert.deepEqual(diskPalette, [
    { approach: "#ffd45a", recede: "#5e1700", brightness: 2.55 },
    { approach: "#ff9d0a", recede: "#210700", brightness: 1.42 },
    { approach: "#9a4300", recede: "#080200", brightness: 0.64 }
  ]);
  assert.deepEqual(
    resources.photonRings.map((ring) => (
      `#${ring.material.uniforms.uColour.value.getHexString()}`
    )),
    ["#ffd76a", "#ff7812"]
  );
  assert.match(resources.diskLayers[0].material.fragmentShader, /innerHeat/);
  assert.match(resources.diskLayers[0].material.fragmentShader, /3\.72 - vRadius/);
  assert.match(resources.diskLayers[0].material.fragmentShader, /mappedRadiance/);
  assert.match(resources.diskLayers[0].material.fragmentShader, /emissiveBoost/);
  assert.match(resources.diskLayers[0].material.fragmentShader, /exp\(-radiance \* 0\.54\)/);
  assert.doesNotMatch(resources.diskLayers[0].material.fragmentShader, /71d7ff|8cbcff/i);

  disposeObservatoryBlackHole(blackHole);
});

test("enhanced gas lanes keep unit mean energy while adding long-stream contrast", () => {
  assert.deepEqual(OBSERVATORY_BLACK_HOLE_FLOW_PERIODS, {
    inner: 10,
    middle: 15,
    outer: 25
  });

  const hotspotMean = 0.196380615234375;
  const samples = 32_768;
  const values = [];
  const flowStructureAt = (phase, radius) => {
    const longStream = Math.sin(phase * 2 - radius * 1.42);
    const filamentStream = Math.sin(phase * 5 - radius * 2.85);
    const hotspotShape = Math.pow(
      0.5 + 0.5 * Math.sin(phase * 3 - radius * 1.16),
      8
    );
    return 1
      + longStream * 0.30
      + filamentStream * 0.14
      + (hotspotShape - hotspotMean) * 0.58;
  };
  const twoSecondAdvance = 2 * Math.PI * 2
    / OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.middle;
  let twoSecondDifference = 0;
  for (let index = 0; index < samples; index += 1) {
    const phase = index / samples * Math.PI * 2;
    const radius = 4.82;
    const value = flowStructureAt(phase, radius);
    values.push(value);
    twoSecondDifference += Math.abs(
      flowStructureAt(phase + twoSecondAdvance, radius) - value
    );
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / samples;
  assert.ok(Math.abs(mean - 1) < 1e-12, "contrast must redistribute energy");
  assert.ok(
    Math.max(...values) - Math.min(...values) > 0.9,
    "long lanes and sparse knots must remain visibly non-uniform"
  );
  assert.ok(
    twoSecondDifference / samples > 0.2,
    "the 15-second middle flow must read within a two-second observation"
  );

  const blackHole = createObservatoryBlackHole();
  const shader = blackHole.userData.resources.diskLayers[0].material.fragmentShader;
  assert.match(shader, /const float HOTSPOT_MEAN = 0\.196380615234375/);
  assert.match(shader, /float longStream = sin\(vFlowPhase \* 2\.0/);
  assert.match(shader, /float hotspotShape = pow/);
  assert.match(shader, /\(hotspotShape - HOTSPOT_MEAN\) \* 0\.58/);
  assert.match(shader, /float filament = 0\.69 \* flowStructure/);
  disposeObservatoryBlackHole(blackHole);
});

test("quality tiers retain the core while reducing disc, photon, and debris work", () => {
  assert.deepEqual(
    Object.keys(OBSERVATORY_BLACK_HOLE_QUALITY_PRESETS).sort(),
    ["high", "low", "medium", "minimum"]
  );
  assert.equal(normalizeObservatoryBlackHoleQuality("HIGH"), "high");
  assert.equal(normalizeObservatoryBlackHoleQuality("unknown"), "medium");
  assert.equal(getObservatoryBlackHoleQualityPreset("low").debrisCount, 16);

  const blackHole = createObservatoryBlackHole({ visible: true });
  const camera = createLoftCamera();
  const resources = blackHole.userData.resources;
  const cases = [
    ["high", 3, 2, 72],
    ["medium", 3, 2, 40],
    ["low", 1, 1, 16],
    ["minimum", 0, 1, 0]
  ];
  for (const [quality, layerCount, photonCount, debrisCount] of cases) {
    assert.equal(
      updateObservatoryBlackHole(blackHole, camera, 2.5, 1, quality),
      true
    );
    assert.equal(
      resources.diskLayers.filter((layer) => layer.glow.visible).length,
      layerCount
    );
    assert.equal(
      resources.photonRings.filter((ring) => ring.visible).length,
      photonCount
    );
    assert.equal(resources.debris.count, debrisCount);
    assert.equal(resources.debris.visible, debrisCount > 0);
    assert.equal(resources.horizon.visible, true);
    assert.equal(resources.moon.visible, true);
  }

  updateObservatoryBlackHole(blackHole, camera, 3, 1, "not-a-tier");
  assert.equal(blackHole.userData.quality, "medium");
  assert.equal(resources.diskLayers.filter((layer) => layer.glow.visible).length, 3);
});

test("update preserves the anchor and animates differential flow and multi-radius orbits", () => {
  const blackHole = createObservatoryBlackHole({ visible: true });
  const camera = createLoftCamera();
  const anchor = blackHole.position.clone();
  const resources = blackHole.userData.resources;

  assert.equal(updateObservatoryBlackHole(blackHole, camera, 0, 1, "high"), true);
  assert.deepEqual(blackHole.position.toArray(), anchor.toArray());
  assert.ok(Math.abs(blackHole.userData.cameraDistance - 42) < 1e-9);
  assert.ok(blackHole.userData.angularRadius > 0.16);

  const flowSpeeds = resources.diskLayers.map((layer) => (
    layer.material.uniforms.uFlowSpeed.value
  ));
  assert.ok(flowSpeeds[0] > flowSpeeds[1] && flowSpeeds[1] > flowSpeeds[2]);
  const flowPeriods = flowSpeeds.map((speed) => Math.PI * 2 / speed);
  assert.ok(Math.abs(flowPeriods[0] - 10) < 1e-12);
  assert.ok(Math.abs(flowPeriods[1] - 15) < 1e-12);
  assert.ok(Math.abs(flowPeriods[2] - 25) < 1e-12);
  assert.deepEqual(
    resources.diskLayers.map((layer) => (
      layer.material.uniforms.uReferenceRadius.value
    )),
    [3.54, 4.82, 6.14]
  );
  assert.match(resources.diskLayers[0].material.vertexShader, /differentialSpeed/);
  assert.match(resources.diskLayers[0].material.vertexShader, /uReferenceRadius/);
  assert.match(resources.diskLayers[0].material.vertexShader, /0\.35/);
  assert.match(resources.diskLayers[0].material.vertexShader, /vDoppler/);
  assert.match(resources.diskLayers[0].material.fragmentShader, /relativisticBeaming/);
  assert.notEqual(
    resources.diskLayers[0].material.uniforms.uApproachColour.value.getHex(),
    resources.diskLayers[0].material.uniforms.uRecedeColour.value.getHex()
  );

  const radii = resources.debris.userData.radii;
  assert.ok(Math.max(...radii) - Math.min(...radii) > 2.6);
  const before = new THREE.Matrix4();
  const after = new THREE.Matrix4();
  const diskRotation = resources.diskRoot.quaternion.clone();
  resources.debris.getMatrixAt(0, before);
  updateObservatoryBlackHole(blackHole, camera, 8, 1, "high");
  resources.debris.getMatrixAt(0, after);
  assert.notDeepEqual(after.toArray(), before.toArray());
  assert.deepEqual(blackHole.position.toArray(), anchor.toArray());
  assert.ok(
    resources.diskRoot.quaternion.equals(diskRotation),
    "gas must flow inside a fixed disc orientation"
  );

  const nearAngularRadius = blackHole.userData.angularRadius;
  camera.position.copy(blackHole.position).add(new THREE.Vector3(0, 0, 100));
  camera.updateMatrixWorld(true);
  updateObservatoryBlackHole(blackHole, camera, 9, 1, "high");
  assert.ok(blackHole.userData.angularRadius < nearAngularRadius);

  const hiddenOrbit = new THREE.Matrix4();
  resources.debris.getMatrixAt(0, hiddenOrbit);
  assert.equal(setObservatoryBlackHoleVisible(blackHole, false), true);
  assert.equal(updateObservatoryBlackHole(blackHole, camera, 10, 1, "high"), false);
  assert.equal(blackHole.visible, false);
  resources.debris.getMatrixAt(0, after);
  assert.deepEqual(
    after.toArray(),
    hiddenOrbit.toArray(),
    "the exact hidden path must not spend CPU rebuilding orbital matrices"
  );
  assert.equal(setObservatoryBlackHoleVisible(blackHole, true), true);
  assert.equal(updateObservatoryBlackHole(blackHole, camera, 10, 0, "high"), false);
  assert.equal(blackHole.visible, false);
});

test("prewarm exposes a requested tier and restores every production state", () => {
  const blackHole = createObservatoryBlackHole({ quality: "low", visible: false });
  const resources = blackHole.userData.resources;
  const beforeReveal = resources.horizon.material.uniforms.uReveal.value;
  const beforeDebrisCount = resources.debris.count;
  const restore = prewarmObservatoryBlackHole(blackHole, "high");

  assert.equal(typeof restore, "function");
  assert.equal(blackHole.userData.prewarming, true);
  assert.equal(blackHole.visible, true);
  assert.equal(resources.horizon.visible, true);
  assert.equal(resources.moon.visible, true);
  assert.equal(resources.diskLayers.filter((layer) => layer.glow.visible).length, 3);
  assert.equal(resources.diskLayers.every((layer) => layer.occluder.visible), true);
  assert.equal(resources.debris.count, 72);
  assert.ok(resources.horizon.material.uniforms.uReveal.value > 0);

  assert.equal(restore(), true);
  assert.equal(restore(), false);
  assert.equal(blackHole.userData.prewarming, false);
  assert.equal(blackHole.visible, false);
  assert.equal(resources.horizon.visible, false);
  assert.equal(resources.moon.visible, false);
  assert.equal(resources.diskLayers.every((layer) => !layer.glow.visible), true);
  assert.equal(resources.debris.count, beforeDebrisCount);
  assert.equal(resources.horizon.material.uniforms.uReveal.value, beforeReveal);
});

test("black-hole resource disposal is unique and idempotent", () => {
  const blackHole = createObservatoryBlackHole();
  const resources = blackHole.userData.resources;
  let sharedGeometryDisposals = 0;
  let materialDisposals = 0;
  resources.diskLayers[0].geometry.addEventListener("dispose", () => {
    sharedGeometryDisposals += 1;
  });
  resources.diskLayers[0].material.addEventListener("dispose", () => {
    materialDisposals += 1;
  });

  assert.equal(disposeObservatoryBlackHole(blackHole), true);
  assert.equal(disposeObservatoryBlackHole(blackHole), false);
  assert.equal(sharedGeometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(blackHole.children.length, 0);
  assert.equal(blackHole.userData.disposed, true);
  assert.equal(setObservatoryBlackHoleVisible(blackHole, true), false);
  assert.equal(
    updateObservatoryBlackHole(blackHole, createLoftCamera(), 1, 1, "high"),
    false
  );
  assert.equal(prewarmObservatoryBlackHole(blackHole), false);
});
