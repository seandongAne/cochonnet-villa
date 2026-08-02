import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";

import {
  createMushroomNebula,
  createMushroomNebulaMaterial,
  disposeMushroomNebula,
  getMushroomNebulaQuality,
  MUSHROOM_NEBULA_DEFAULT_QUALITY,
  MUSHROOM_NEBULA_FRAGMENT_SHADER,
  MUSHROOM_NEBULA_MAX_STEPS,
  MUSHROOM_NEBULA_NAME,
  MUSHROOM_NEBULA_QUALITY_PRESETS,
  setMushroomNebulaQuality,
  updateMushroomNebula
} from "../src/villa-map/mushroom-nebula.js";

test("nebula exposes bounded high, medium and low ray-march quality tiers", () => {
  assert.deepEqual(
    Object.keys(MUSHROOM_NEBULA_QUALITY_PRESETS),
    ["high", "medium", "low"]
  );
  assert.equal(getMushroomNebulaQuality("HIGH").steps, MUSHROOM_NEBULA_MAX_STEPS);
  assert.equal(getMushroomNebulaQuality("medium").steps, 30);
  assert.equal(getMushroomNebulaQuality("low").steps, 20);
  assert.equal(
    getMushroomNebulaQuality("not-a-tier").id,
    MUSHROOM_NEBULA_DEFAULT_QUALITY
  );
  for (const preset of Object.values(MUSHROOM_NEBULA_QUALITY_PRESETS)) {
    assert.ok(preset.steps > 0);
    assert.ok(preset.steps <= MUSHROOM_NEBULA_MAX_STEPS);
  }
});

test("nebula shader has a compile-time march ceiling and bridge uniforms", () => {
  const material = createMushroomNebulaMaterial({
    quality: "high",
    reveal: 0.4,
    parallax: [1, 2, 3],
    resolution: [960, 540]
  });

  assert.equal(material.type, "ShaderMaterial");
  assert.equal(material.depthTest, false);
  assert.equal(material.depthWrite, false);
  assert.equal(material.transparent, false);
  assert.equal(material.toneMapped, false);
  assert.equal(material.uniforms.uTime.value, 0);
  assert.equal(material.uniforms.uReveal.value, 0.4);
  assert.deepEqual(material.uniforms.uParallax.value.toArray(), [1, 2, 3]);
  assert.deepEqual(material.uniforms.uResolution.value.toArray(), [960, 540]);
  assert.equal(material.uniforms.uStepCount.value, MUSHROOM_NEBULA_MAX_STEPS);

  assert.match(
    MUSHROOM_NEBULA_FRAGMENT_SHADER,
    new RegExp(`#define MUSHROOM_NEBULA_MAX_STEPS ${MUSHROOM_NEBULA_MAX_STEPS}`)
  );
  assert.match(
    material.fragmentShader,
    /for \(int stepIndex = 0; stepIndex < MUSHROOM_NEBULA_MAX_STEPS; stepIndex\+\+\)/
  );
  assert.match(material.fragmentShader, /if \(stepIndex >= uStepCount\) break/);
  for (const uniform of ["uTime", "uReveal", "uParallax"]) {
    assert.match(material.fragmentShader, new RegExp(`uniform \\w+ ${uniform}`));
  }
  assert.doesNotMatch(
    material.fragmentShader,
    /colorspace_fragment/,
    "the FBO pass must keep its radiance linear for the final composite"
  );
  assert.doesNotMatch(material.fragmentShader, /gl_FragCoord\.xy[\s\S]*uTime\)/);
  material.dispose();
});

test("nebula update advances normally and freezes time for reduced motion", () => {
  const material = createMushroomNebulaMaterial({ quality: "medium" });
  const camera = new THREE.PerspectiveCamera(63, 16 / 9, 0.1, 100);
  camera.position.set(9, 4, -3);
  camera.rotation.y = 0.4;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  assert.equal(updateMushroomNebula(material, 0.05, {
    reveal: 0.65,
    parallax: new THREE.Vector3(0.4, -0.2, 0.1),
    resolution: { x: 1280, y: 720 },
    camera
  }), true);
  assert.equal(material.uniforms.uTime.value, 0.05);
  assert.equal(material.uniforms.uReveal.value, 0.65);
  assert.deepEqual(material.uniforms.uParallax.value.toArray(), [0.4, -0.2, 0.1]);
  assert.deepEqual(material.uniforms.uResolution.value.toArray(), [1280, 720]);
  assert.deepEqual(
    material.uniforms.uCameraMatrixWorld.value.toArray(),
    camera.matrixWorld.toArray()
  );

  updateMushroomNebula(material, 0.1, {
    reveal: 4,
    parallax: [1, 1, 1],
    reducedMotion: true
  });
  assert.equal(material.uniforms.uTime.value, 0.05, "reduced motion freezes drift");
  assert.equal(material.uniforms.uReveal.value, 1, "other state still updates");
  assert.deepEqual(material.uniforms.uParallax.value.toArray(), [1, 1, 1]);
  assert.equal(material.userData.reducedMotion, true);

  const low = setMushroomNebulaQuality(material, "low");
  assert.equal(low.id, "low");
  assert.equal(material.uniforms.uStepCount.value, 20);
  material.dispose();
});

test("fullscreen nebula mesh is Node-safe and disposes only once", () => {
  const nebula = createMushroomNebula({ quality: "low" });
  assert.equal(nebula.name, MUSHROOM_NEBULA_NAME);
  assert.equal(nebula.geometry.attributes.position.count, 3);
  assert.equal(nebula.frustumCulled, false);

  let geometryDisposals = 0;
  let materialDisposals = 0;
  nebula.geometry.addEventListener("dispose", () => { geometryDisposals += 1; });
  nebula.material.addEventListener("dispose", () => { materialDisposals += 1; });
  assert.equal(disposeMushroomNebula(nebula), true);
  assert.equal(disposeMushroomNebula(nebula), false);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
});
