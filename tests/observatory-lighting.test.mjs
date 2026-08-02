import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { createMaterials } from "../src/villa-map/assets.js";
import {
  createMushroomInterior,
  MUSHROOM_FLOOR_LIGHTS,
  MUSHROOM_OBSERVATORY_EXPOSURE,
  MUSHROOM_OBSERVATORY_FLOOR_NAME,
  MUSHROOM_OBSERVATORY_SWITCH_ACTION_TYPE,
  MUSHROOM_OBSERVATORY_SWITCH_INTERACTION_ID,
  MUSHROOM_OBSERVATORY_SWITCH_LED_NAME,
  MUSHROOM_OBSERVATORY_SWITCH_LEVER_NAME,
  MUSHROOM_OBSERVATORY_SWITCH_NAME,
  MUSHROOM_OBSERVATORY_WALL_NAME
} from "../src/villa-map/mushroom-interior.js";
import { MUSHROOM_SKY_IMAGE_BRIGHTNESS } from "../src/villa-map/mushroom-sky.js";
import {
  MUSHROOM_INTERIOR_LOCAL_RADIUS,
  MUSHROOM_INTERIOR_SCALE
} from "../src/villa-map/mushroom-interior-config.js";
import {
  MUSHROOM_INTERIOR,
  collidesWithWorld,
  createVillaWorld
} from "../src/villa-map/world.js";
import { findNearestInteraction } from "../src/villa-map/interaction.js";

const nearlyEqual = (actual, expected, epsilon = 1e-9) =>
  Math.abs(actual - expected) <= epsilon;

test("the loft lining carries warm house-light and near-black stargazing palettes", () => {
  const materials = createMaterials();
  const interior = createMushroomInterior(materials);
  const wall = interior.getObjectByName(MUSHROOM_OBSERVATORY_WALL_NAME);
  const floor = interior.getObjectByName(MUSHROOM_OBSERVATORY_FLOOR_NAME);

  assert.ok(wall, "observatory wall lining missing");
  assert.ok(floor, "observatory floor overlay missing");
  assert.equal(wall.material.side, THREE.BackSide);
  assert.equal(wall.material.color.getHex(), materials.mushroomStem.color.getHex());
  assert.equal(floor.material.color.getHex(), materials.floorPlank.color.getHex());
  assert.equal(wall.material.userData.lightsOnColor, "#f2d4aa");
  assert.equal(wall.material.userData.lightsOffColor, "#01030a");
  assert.equal(floor.material.userData.lightsOnColor, "#a87148");
  assert.equal(floor.material.userData.lightsOffColor, "#02040b");
  assert.ok(wall.geometry.parameters.height > 4.3, "lining must reach the dome seam");
  assert.equal(floor.geometry.type, "ShapeGeometry");
  assert.equal(
    floor.geometry.parameters.shapes.holes.length,
    1,
    "the palette overlay must preserve the stairwell opening"
  );
});

test("the loft keeps only dim guide lights and no hanging decorations", () => {
  const [hearth, den, loft] = MUSHROOM_FLOOR_LIGHTS;
  assert.equal(MUSHROOM_FLOOR_LIGHTS.length, 3);
  assert.ok(loft.primary < hearth.primary * 0.1);
  assert.ok(loft.secondary < den.secondary * 0.1);
  assert.ok(loft.primaryDistance < hearth.primaryDistance);
  assert.match(loft.color, /^#ff[0-9a-f]{4}$/i);

  const interior = createMushroomInterior(createMaterials());
  const warmPendant = interior.getObjectByName("mushroom-interior-pendant-3.1");
  const denPendant = interior.getObjectByName("mushroom-interior-pendant-7.1");
  const loftPendant = interior.getObjectByName("mushroom-interior-pendant-10.9");
  const warmBulb = interior
    .getObjectByName("mushroom-interior-fairy-canopy-1")
    .getObjectByName("mushroom-interior-fairy-canopy-1-bulb-1-1");

  assert.ok(warmPendant && denPendant && warmBulb, "lower-storey lighting missing");
  assert.equal(loftPendant, undefined, "the loft must not have a hanging pendant");
  assert.equal(
    interior.getObjectByName("mushroom-interior-fairy-canopy-3"),
    undefined,
    "the loft must stay clear of fairy lights and bunting"
  );
});

test("the loft light switch is a player-scale control mounted tangent to the curved wall", () => {
  const interior = createMushroomInterior(createMaterials());
  const lightSwitch = interior.getObjectByName(MUSHROOM_OBSERVATORY_SWITCH_NAME);
  const lever = interior.getObjectByName(MUSHROOM_OBSERVATORY_SWITCH_LEVER_NAME);
  const led = interior.getObjectByName(MUSHROOM_OBSERVATORY_SWITCH_LED_NAME);
  const plate = interior.getObjectByName(`${MUSHROOM_OBSERVATORY_SWITCH_NAME}-plate`);

  assert.ok(lightSwitch && lever && led && plate, "complete wall switch geometry missing");
  assert.equal(lightSwitch.userData.interactionId, MUSHROOM_OBSERVATORY_SWITCH_INTERACTION_ID);
  assert.equal(lightSwitch.userData.actionType, MUSHROOM_OBSERVATORY_SWITCH_ACTION_TYPE);

  const radialDistance = Math.hypot(lightSwitch.position.x, lightSwitch.position.z);
  assert.ok(
    MUSHROOM_INTERIOR_LOCAL_RADIUS - radialDistance < 0.04,
    "switch plate floats away from the curved wall"
  );
  assert.ok(radialDistance < MUSHROOM_INTERIOR_LOCAL_RADIUS, "switch is buried outside the room");

  // The control's local +Z face points inward toward the room centre, making
  // its plate tangent to the cylinder instead of axis-aligned through it.
  const inward = new THREE.Vector3(
    -lightSwitch.position.x,
    0,
    -lightSwitch.position.z
  ).normalize();
  const faceNormal = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(lightSwitch.quaternion)
    .normalize();
  assert.ok(faceNormal.dot(inward) > 0.999, "switch does not face into the room");

  assert.ok(nearlyEqual(plate.geometry.parameters.width * MUSHROOM_INTERIOR_SCALE, 0.4));
  assert.ok(nearlyEqual(plate.geometry.parameters.height * MUSHROOM_INTERIOR_SCALE, 0.6));
  assert.ok(lever.userData.lightsOnRotationX < lever.userData.lightsOffRotationX);
  assert.equal(led.material.toneMapped, false, "locator LED must stay readable in darkness");
  assert.equal(led.material.fog, false);
});

test("the wall switch interaction is reachable from the L3 stair arrival and identifies the toggle", () => {
  const world = createVillaWorld();
  const interaction = world.interactions.find(
    (item) => item.id === MUSHROOM_OBSERVATORY_SWITCH_INTERACTION_ID
  );
  assert.ok(interaction, "observatory light-switch interaction missing");
  assert.equal(interaction.radius, 2.6);
  assert.equal(interaction.action?.type, MUSHROOM_OBSERVATORY_SWITCH_ACTION_TYPE);
  assert.equal(interaction.action?.label, "按 E 关闭灯光，仰望星空");
  assert.match(interaction.title, /灯光开关/);
  assert.match(interaction.body, /把灯关掉/);

  // The marker and the visible plate share the exact same XZ after the
  // factory's local transform is translated into the buried pocket.
  const interior = createMushroomInterior(createMaterials());
  interior.updateMatrixWorld(true);
  const visual = interior.getObjectByName(MUSHROOM_OBSERVATORY_SWITCH_NAME);
  const visualOffset = visual.getWorldPosition(new THREE.Vector3());
  assert.ok(nearlyEqual(interaction.position.x, MUSHROOM_INTERIOR.center.x + visualOffset.x));
  assert.ok(nearlyEqual(interaction.position.z, MUSHROOM_INTERIOR.center.z + visualOffset.z));
  assert.ok(
    Math.abs(interaction.position.y - (MUSHROOM_INTERIOR.baseY + visualOffset.y)) < 0.2,
    "interaction marker drifts vertically away from the visible switch"
  );

  // Stand just inside the player-radius-aware round wall. This exact usable
  // spot is collision-free and selects the switch rather than the room card.
  const markerDx = interaction.position.x - MUSHROOM_INTERIOR.center.x;
  const markerDz = interaction.position.z - MUSHROOM_INTERIOR.center.z;
  const markerRadius = Math.hypot(markerDx, markerDz);
  const approachRadius =
    MUSHROOM_INTERIOR_LOCAL_RADIUS * MUSHROOM_INTERIOR_SCALE
    - world.player.radius
    - 0.05;
  const approach = {
    x: MUSHROOM_INTERIOR.center.x + markerDx / markerRadius * approachRadius,
    y: MUSHROOM_INTERIOR.eyeY[2],
    z: MUSHROOM_INTERIOR.center.z + markerDz / markerRadius * approachRadius
  };
  assert.equal(collidesWithWorld(approach, world), false, "switch approach is blocked");
  assert.equal(
    findNearestInteraction(world.interactions, approach)?.id,
    MUSHROOM_OBSERVATORY_SWITCH_INTERACTION_ID
  );

  const stair = world.stairs.find((item) => item.id === "mushroom-stairs-b");
  const stairArrival = {
    x: (stair.minX + stair.maxX) / 2,
    z: stair.minZ
  };
  assert.ok(
    Math.hypot(
      interaction.position.x - stairArrival.x,
      interaction.position.z - stairArrival.z
    ) < 5.5,
    "switch is too far from the L3 stair arrival"
  );
});

test("camera exposure darkens the loft without dimming the star material", () => {
  assert.equal(MUSHROOM_OBSERVATORY_EXPOSURE, 0.5);
  assert.ok(MUSHROOM_SKY_IMAGE_BRIGHTNESS < 1);

  const scenePath = fileURLToPath(
    new URL("../src/villa-map/react/Scene.jsx", import.meta.url)
  );
  const source = readFileSync(scenePath, "utf8");
  const runtimeSource = readFileSync(fileURLToPath(
    new URL("../src/villa-map/react/MushroomObservatoryRuntime.jsx", import.meta.url)
  ), "utf8");
  assert.match(source, /function MushroomObservatoryExposure\(\{ adaptationRef \}\)/);
  assert.match(source, /function MushroomObservatoryPalette\(\{ interior, adaptationRef \}\)/);
  assert.match(source, /gl\.toneMappingExposure = targetExposure/);
  assert.match(source, /THREE\.MathUtils\.smoothstep\(camera\.position\.y/);
  assert.match(source, /MUSHROOM_OBSERVATORY_EXPOSURE \* 0\.34/);
  assert.match(
    runtimeSource,
    /backdropMaterial\.uniforms\.uBrightness\.value = MUSHROOM_SKY_IMAGE_BRIGHTNESS/
  );

  const dome = createMushroomInterior(createMaterials()).getObjectByName(
    "mushroom-interior-dome"
  );
  assert.equal(dome.material.toneMapped, false);
  assert.equal(dome.material.fog, false);
});
