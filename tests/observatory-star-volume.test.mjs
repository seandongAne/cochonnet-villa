import test from "node:test";
import assert from "node:assert/strict";

import * as THREE from "three";

import {
  OBSERVATORY_STAR_VOLUME_BLACK_HOLE_DIRECTION,
  OBSERVATORY_STAR_VOLUME_COUNTS,
  OBSERVATORY_STAR_VOLUME_MATERIAL_NAME,
  OBSERVATORY_STAR_VOLUME_NAME,
  OBSERVATORY_STAR_VOLUME_POINTS_NAME,
  OBSERVATORY_STAR_VOLUME_SHELLS,
  OBSERVATORY_STAR_VOLUME_STENCIL_REF,
  createObservatoryStarVolume,
  disposeObservatoryStarVolume,
  getObservatoryStarVolumeCounts,
  prewarmObservatoryStarVolume,
  setObservatoryStarVolumeVisible,
  updateObservatoryStarVolume
} from "../src/villa-map/observatory-star-volume.js";
import {
  MUSHROOM_INTERIOR_CENTER,
  MUSHROOM_INTERIOR_EYE_Y,
  MUSHROOM_INTERIOR_LOCAL_RADIUS,
  MUSHROOM_INTERIOR_SCALE
} from "../src/villa-map/mushroom-interior-config.js";

function arraysEqual(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function countEnabledKinds(geometry, qualityLevel) {
  const kinds = geometry.getAttribute("aKind");
  const ranks = geometry.getAttribute("aQualityRank");
  const counts = { stars: 0, dust: 0, total: 0 };
  for (let index = 0; index < kinds.count; index += 1) {
    if (ranks.getX(index) > qualityLevel) continue;
    if (kinds.getX(index) < 0.5) counts.stars += 1;
    else counts.dust += 1;
    counts.total += 1;
  }
  return counts;
}

function countEnabledShells(geometry, qualityLevel) {
  const shells = geometry.getAttribute("aShell");
  const ranks = geometry.getAttribute("aQualityRank");
  const counts = [0, 0, 0];
  for (let index = 0; index < shells.count; index += 1) {
    if (ranks.getX(index) > qualityLevel) continue;
    counts[shells.getX(index)] += 1;
  }
  return counts;
}

test("star volume is one deterministic, stencil-clipped Points draw", () => {
  const first = createObservatoryStarVolume({ seed: 0x12345678 });
  const second = createObservatoryStarVolume({ seed: 0x12345678 });
  const otherSeed = createObservatoryStarVolume({ seed: 0x12345679 });

  assert.ok(first.isGroup);
  assert.equal(first.name, OBSERVATORY_STAR_VOLUME_NAME);
  assert.deepEqual(first.position.toArray(), [
    MUSHROOM_INTERIOR_CENTER.x,
    MUSHROOM_INTERIOR_EYE_Y[2] - 0.05,
    MUSHROOM_INTERIOR_CENTER.z
  ]);
  assert.equal(first.children.length, 1, "the whole finite field is one draw object");

  const points = first.userData.points;
  assert.ok(points.isPoints);
  assert.equal(points.name, OBSERVATORY_STAR_VOLUME_POINTS_NAME);
  assert.equal(points.material.name, OBSERVATORY_STAR_VOLUME_MATERIAL_NAME);
  assert.equal(points.geometry.getAttribute("position").count, OBSERVATORY_STAR_VOLUME_COUNTS.high.total);
  assert.equal(points.frustumCulled, false);
  assert.equal(points.material.transparent, true);
  assert.equal(points.material.blending, THREE.AdditiveBlending);
  assert.equal(points.material.depthTest, false);
  assert.equal(points.material.depthWrite, false);
  assert.equal(points.material.stencilWrite, true);
  assert.equal(points.material.stencilRef, OBSERVATORY_STAR_VOLUME_STENCIL_REF);
  assert.equal(points.material.stencilFunc, THREE.EqualStencilFunc);
  assert.equal(first.userData.worldAnchored, true);

  const expectedAttributes = [
    "position",
    "aKind",
    "aPhase",
    "aPeriod",
    "aTemperature",
    "aQualityRank",
    "aShell",
    "aDrift",
    "aBrightness"
  ];
  assert.deepEqual(Object.keys(points.geometry.attributes), expectedAttributes);
  assert.equal(
    points.geometry.getAttribute("aSize"),
    undefined,
    "no shader consumes a per-star size: brightness must never upload a dead aSize attribute"
  );

  const firstPositions = Array.from(points.geometry.getAttribute("position").array);
  const secondPositions = Array.from(second.userData.points.geometry.getAttribute("position").array);
  const otherPositions = Array.from(otherSeed.userData.points.geometry.getAttribute("position").array);
  assert.ok(arraysEqual(firstPositions, secondPositions), "same seed must reproduce every point");
  assert.ok(!arraysEqual(firstPositions, otherPositions), "a different seed must change the volume");

  disposeObservatoryStarVolume(first);
  disposeObservatoryStarVolume(second);
  disposeObservatoryStarVolume(otherSeed);
});

test("all quality tiers are deterministic subsets of the same single draw", () => {
  const volume = createObservatoryStarVolume();
  const geometry = volume.userData.points.geometry;
  const levels = { minimum: 0, low: 1, medium: 2, high: 3 };

  assert.deepEqual(OBSERVATORY_STAR_VOLUME_COUNTS, {
    minimum: { stars: 0, dust: 0, total: 0 },
    low: { stars: 800, dust: 120, total: 920 },
    medium: { stars: 2400, dust: 360, total: 2760 },
    high: { stars: 5200, dust: 720, total: 5920 }
  });

  for (const [quality, level] of Object.entries(levels)) {
    assert.deepEqual(countEnabledKinds(geometry, level), OBSERVATORY_STAR_VOLUME_COUNTS[quality]);
    assert.equal(getObservatoryStarVolumeCounts(quality), OBSERVATORY_STAR_VOLUME_COUNTS[quality]);
    const total = OBSERVATORY_STAR_VOLUME_COUNTS[quality].total;
    assert.deepEqual(
      countEnabledShells(geometry, level),
      [total * 0.1, total * 0.25, total * 0.65],
      `${quality} must preserve the 10/25/65 near/middle/far density split`
    );
  }
  assert.equal(getObservatoryStarVolumeCounts("NOT-A-TIER"), OBSERVATORY_STAR_VOLUME_COUNTS.medium);

  const periods = geometry.getAttribute("aPeriod");
  const temperatures = geometry.getAttribute("aTemperature");
  const kinds = geometry.getAttribute("aKind");
  const uniquePeriods = new Set();
  let warmest = 1;
  let coolest = 0;
  let starPeriodMax = 0;
  let dustPeriodMin = Infinity;
  for (let index = 0; index < periods.count; index += 1) {
    const period = periods.getX(index);
    uniquePeriods.add(period.toFixed(3));
    warmest = Math.min(warmest, temperatures.getX(index));
    coolest = Math.max(coolest, temperatures.getX(index));
    if (kinds.getX(index) < 0.5) starPeriodMax = Math.max(starPeriodMax, period);
    else dustPeriodMin = Math.min(dustPeriodMin, period);
  }
  assert.ok(uniquePeriods.size > 1000, "twinkle periods should be independent, not synchronized");
  assert.ok(warmest < 0.2 && coolest > 0.8, "the restrained field still spans warm/cool temperatures");
  assert.ok(starPeriodMax < dustPeriodMin, "microdust evolves more slowly than the stars");
  const vertexShader = volume.userData.points.material.vertexShader;
  const fragmentShader = volume.userData.points.material.fragmentShader;
  assert.match(fragmentShader, /uTime[\s\S]*?vPeriod/);
  assert.match(vertexShader, /uQualityLevel[\s\S]*?aQualityRank/);
  assert.match(vertexShader, /spriteSizeCss\s*=\s*mix\(7\.0,\s*5\.0,\s*aKind\)/);
  assert.match(fragmentShader, /pixelPositionCss/);
  assert.match(fragmentShader, /STAR_SIGMA_CSS\s*=\s*0\.42/);
  assert.match(fragmentShader, /diffractionGate\s*=\s*smoothstep\(3\.35,\s*4\.05,\s*vBrightness\)/);
  assert.match(fragmentShader, /spikeAngle\s*=\s*vPhase/);
  assert.match(fragmentShader, /starSource\s*=\s*colour\s*\*\s*vBrightness\s*\*\s*pulse/);
  assert.doesNotMatch(vertexShader, /gl_PointSize\s*=.*(?:aBrightness|aSize|uTime)/);
  assert.doesNotMatch(fragmentShader, /airyWing|starHalo|vPsfScale/);
  assert.doesNotMatch(vertexShader, /vPsfScale/);
  assert.doesNotMatch(vertexShader, /94\.0\s*\/\s*max/);

  const shellAttenuation = vertexShader.match(
    /shellAttenuation\s*=\s*mix\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*aShell\s*\/\s*2\.0\s*\)/
  );
  assert.ok(shellAttenuation, "shell radiance should use a monotonic near-to-far attenuation");
  assert.ok(
    Number(shellAttenuation[1]) < Number(shellAttenuation[2]),
    "the sparse near shell must be dimmer than the dense far shell"
  );

  const brightnesses = geometry.getAttribute("aBrightness");
  const starBrightnesses = [];
  let faintestDust = Infinity;
  let brightestDust = 0;
  for (let index = 0; index < brightnesses.count; index += 1) {
    const brightness = brightnesses.getX(index);
    if (kinds.getX(index) < 0.5) {
      starBrightnesses.push(brightness);
    } else {
      faintestDust = Math.min(faintestDust, brightness);
      brightestDust = Math.max(brightestDust, brightness);
    }
  }
  starBrightnesses.sort((a, b) => a - b);
  const medianStar = starBrightnesses[Math.floor(starBrightnesses.length / 2)];
  const diffractionTail = starBrightnesses.filter((brightness) => brightness > 3.35);
  assert.ok(
    starBrightnesses[0] < 0.08
      && medianStar < 0.25
      && starBrightnesses.at(-1) > 3,
    "stellar radiance should have a realistic faint-to-white-hot long tail"
  );
  assert.ok(faintestDust >= 0.0179 && brightestDust <= 0.0551,
    "microdust must stay much fainter than unresolved stars");
  assert.ok(
    diffractionTail.length > 0
      && diffractionTail.length / starBrightnesses.length < 0.025,
    "only a tiny deterministic brightest tail may receive diffraction spikes"
  );

  disposeObservatoryStarVolume(volume);
});

test("three finite shells stay outside the room and preserve a dark lens core", () => {
  assert.deepEqual(OBSERVATORY_STAR_VOLUME_SHELLS, [
    { id: "near", minRadius: 72, maxRadius: 96 },
    { id: "middle", minRadius: 112, maxRadius: 145 },
    { id: "far", minRadius: 160, maxRadius: 184 }
  ]);

  const volume = createObservatoryStarVolume();
  const geometry = volume.userData.points.geometry;
  const positions = geometry.getAttribute("position");
  const shells = geometry.getAttribute("aShell");
  const kinds = geometry.getAttribute("aKind");
  const focus = new THREE.Vector3(
    OBSERVATORY_STAR_VOLUME_BLACK_HOLE_DIRECTION.x,
    OBSERVATORY_STAR_VOLUME_BLACK_HOLE_DIRECTION.y,
    OBSERVATORY_STAR_VOLUME_BLACK_HOLE_DIRECTION.z
  ).normalize();
  const shellHits = new Set();
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const roomSafeRadius =
    MUSHROOM_INTERIOR_LOCAL_RADIUS * MUSHROOM_INTERIOR_SCALE + 0.9;

  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    const shellIndex = shells.getX(index);
    const shell = OBSERVATORY_STAR_VOLUME_SHELLS[shellIndex];
    const radius = point.length();
    shellHits.add(shellIndex);
    assert.ok(radius >= shell.minRadius - 1e-5);
    assert.ok(radius <= shell.maxRadius + 1e-5);
    assert.ok(
      Math.hypot(point.x, point.z) >= roomSafeRadius || point.y >= roomSafeRadius,
      `point ${index} entered the mushroom room safety envelope`
    );

    direction.copy(point).normalize();
    const clearance = kinds.getX(index) < 0.5 ? 0.115 : 0.075;
    assert.ok(
      direction.dot(focus) <= Math.cos(clearance) + 1e-6,
      `point ${index} painted over the event-horizon core`
    );
  }
  assert.deepEqual([...shellHits].sort(), [0, 1, 2]);

  disposeObservatoryStarVolume(volume);
});

test("camera translation preserves subtle ordered parallax across all three distant shells", () => {
  const volume = createObservatoryStarVolume();
  const points = volume.userData.points;
  const positions = points.geometry.getAttribute("position");
  const shells = points.geometry.getAttribute("aShell");
  volume.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  camera.position.copy(volume.position);
  camera.lookAt(volume.position.clone().add(new THREE.Vector3(0, 0, -1)));
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const beforeCamera = camera.position.clone();

  const fixedAnchor = volume.position.clone();
  const fixedGeometry = Array.from(positions.array);
  assert.equal(updateObservatoryStarVolume(
    volume,
    camera,
    10,
    1,
    { motionScale: 1, quality: "high", pixelRatio: 1.5 }
  ), true);
  camera.position.x += 1.25;
  camera.updateMatrixWorld(true);
  updateObservatoryStarVolume(volume, camera, 10.25, 1, {
    motionScale: 1,
    quality: "high",
    pixelRatio: 1.5
  });
  const angleTotals = [0, 0, 0];
  const shellCounts = [0, 0, 0];
  const worldPoint = new THREE.Vector3();
  const beforeDirection = new THREE.Vector3();
  const afterDirection = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    worldPoint.fromBufferAttribute(positions, index).applyMatrix4(points.matrixWorld);
    beforeDirection.copy(worldPoint).sub(beforeCamera).normalize();
    afterDirection.copy(worldPoint).sub(camera.position).normalize();
    const shellIndex = shells.getX(index);
    angleTotals[shellIndex] += beforeDirection.angleTo(afterDirection);
    shellCounts[shellIndex] += 1;
  }
  const meanAngularParallax = angleTotals.map((total, shellIndex) => (
    total / shellCounts[shellIndex]
  ));

  assert.ok(
    meanAngularParallax[0] > meanAngularParallax[1]
      && meanAngularParallax[1] > meanAngularParallax[2],
    `mean angular parallax must fall near-to-far: ${meanAngularParallax.join(", ")}`
  );
  assert.ok(
    meanAngularParallax[2] > 0.002,
    "a 1.25 m walk should retain a small but measurable far-shell depth cue"
  );
  assert.ok(
    meanAngularParallax[0] < 0.02,
    "even the near shell must remain distant instead of sweeping past the visitor"
  );
  assert.deepEqual(volume.position.toArray(), fixedAnchor.toArray(), "update must not recenter on camera");
  assert.ok(arraysEqual(Array.from(positions.array), fixedGeometry), "CPU geometry remains fixed in world space");
  assert.deepEqual(volume.userData.lastCameraPosition.toArray(), camera.position.toArray());
  assert.equal(points.material.uniforms.uReveal.value, 1);
  assert.equal(points.material.uniforms.uQualityLevel.value, 3);
  assert.equal(points.material.uniforms.uPixelRatio.value, 1.5);

  disposeObservatoryStarVolume(volume);
});

test("update supports reduced-motion freeze, quality visibility, and a manual visible gate", () => {
  const volume = createObservatoryStarVolume();
  const points = volume.userData.points;
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(volume.position);

  updateObservatoryStarVolume(volume, camera, 2, 0.8, {
    motionScale: 1,
    quality: "medium",
    pixelRatio: 4
  });
  updateObservatoryStarVolume(volume, camera, 2.4, 0.8, {
    motionScale: 1,
    quality: "medium"
  });
  assert.ok(Math.abs(volume.userData.elapsed - 0.4) < 1e-9);
  assert.equal(points.material.uniforms.uPixelRatio.value, 1);

  updateObservatoryStarVolume(volume, camera, 12, 0.8, {
    motionScale: 0,
    quality: "medium"
  });
  assert.ok(Math.abs(volume.userData.elapsed - 0.4) < 1e-9, "reduced motion freezes time");

  // Positional form is kept for a minimal runtime callsite.
  updateObservatoryStarVolume(volume, camera, 12.2, 0.5, 0.5, "low", { pixelRatio: 3 });
  assert.ok(Math.abs(volume.userData.elapsed - 0.5) < 1e-9);
  assert.equal(points.material.uniforms.uQualityLevel.value, 1);
  assert.equal(points.material.uniforms.uPixelRatio.value, 2);
  assert.equal(volume.visible, true);

  assert.equal(setObservatoryStarVolumeVisible(volume, false), false);
  assert.equal(volume.visible, false);
  updateObservatoryStarVolume(volume, camera, 12.3, 1, 1, "high");
  assert.equal(volume.visible, false, "updates respect the explicit visibility gate");
  setObservatoryStarVolumeVisible(volume, true);
  assert.equal(volume.visible, true);

  assert.equal(updateObservatoryStarVolume(volume, camera, 12.4, 1, 1, "minimum"), false);
  assert.equal(volume.visible, false);
  assert.equal(points.visible, false);
  assert.equal(updateObservatoryStarVolume(volume, camera, 12.5, 0, 1, "high"), false);
  assert.equal(volume.visible, false);

  disposeObservatoryStarVolume(volume);
});

test("prewarm restores live state and disposal is complete and idempotent", () => {
  const volume = createObservatoryStarVolume();
  const points = volume.userData.points;
  const material = points.material;
  const geometry = points.geometry;
  let geometryDisposals = 0;
  let materialDisposals = 0;
  let callbackCalls = 0;
  geometry.addEventListener("dispose", () => { geometryDisposals += 1; });
  material.addEventListener("dispose", () => { materialDisposals += 1; });

  assert.equal(prewarmObservatoryStarVolume(
    volume,
    (prewarmVolume, prewarmPoints, prewarmMaterial) => {
      callbackCalls += 1;
      assert.equal(prewarmVolume, volume);
      assert.equal(prewarmPoints, points);
      assert.equal(prewarmMaterial, material);
      assert.equal(volume.visible, true);
      assert.equal(points.visible, true);
      assert.equal(material.uniforms.uReveal.value, 1);
      assert.equal(material.uniforms.uQualityLevel.value, 3);
      assert.equal(material.uniforms.uPixelRatio.value, 2);
    },
    { quality: "high", pixelRatio: 4 }
  ), true);
  assert.equal(callbackCalls, 1);
  assert.equal(volume.userData.prewarmed, true);
  assert.equal(volume.visible, false);
  assert.equal(points.visible, false);
  assert.equal(material.uniforms.uReveal.value, 0);
  assert.equal(material.uniforms.uQualityLevel.value, 2);
  assert.equal(material.uniforms.uPixelRatio.value, 1);

  assert.equal(disposeObservatoryStarVolume(volume), true);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(volume.children.length, 0);
  assert.equal(volume.visible, false);
  assert.equal(disposeObservatoryStarVolume(volume), false);
  assert.equal(updateObservatoryStarVolume(volume, null, 1, 1), false);
  assert.equal(prewarmObservatoryStarVolume(volume), false);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
});
