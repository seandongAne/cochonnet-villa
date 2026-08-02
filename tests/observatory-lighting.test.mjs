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
  MUSHROOM_OBSERVATORY_WALL_NAME,
  MUSHROOM_STAR_BRIGHTNESS
} from "../src/villa-map/mushroom-interior.js";

test("the loft uses an isolated near-black observatory lining", () => {
  const interior = createMushroomInterior(createMaterials());
  const wall = interior.getObjectByName(MUSHROOM_OBSERVATORY_WALL_NAME);
  const floor = interior.getObjectByName(MUSHROOM_OBSERVATORY_FLOOR_NAME);

  assert.ok(wall, "observatory wall lining missing");
  assert.ok(floor, "observatory floor overlay missing");
  assert.equal(wall.material.side, THREE.BackSide);
  assert.ok(Math.max(...wall.material.color.toArray()) < 0.004);
  assert.ok(Math.max(...floor.material.color.toArray()) < 0.004);
  assert.ok(wall.geometry.parameters.height > 4.3, "lining must reach the dome seam");
  assert.equal(floor.geometry.type, "ShapeGeometry");
  assert.equal(
    floor.geometry.parameters.shapes.holes.length,
    1,
    "the dark overlay must preserve the stairwell opening"
  );
});

test("the loft guide lights are much dimmer than the lower floors", () => {
  const [hearth, den, loft] = MUSHROOM_FLOOR_LIGHTS;
  assert.equal(MUSHROOM_FLOOR_LIGHTS.length, 3);
  assert.ok(loft.primary < hearth.primary * 0.1);
  assert.ok(loft.secondary < den.secondary * 0.1);
  assert.ok(loft.primaryDistance < hearth.primaryDistance);
  assert.match(loft.color, /^#ff[0-9a-f]{4}$/i);

  const interior = createMushroomInterior(createMaterials());
  const warmPendant = interior.getObjectByName("mushroom-interior-pendant-3.1");
  const loftPendant = interior.getObjectByName("mushroom-interior-pendant-10.9");
  const warmBulb = interior
    .getObjectByName("mushroom-interior-fairy-canopy-1")
    .getObjectByName("mushroom-interior-fairy-canopy-1-bulb-1-1");
  const loftBulb = interior
    .getObjectByName("mushroom-interior-fairy-canopy-3")
    .getObjectByName("mushroom-interior-fairy-canopy-3-bulb-1-1");

  assert.ok(loftPendant.material.emissiveIntensity < warmPendant.material.emissiveIntensity * 0.3);
  assert.ok(loftBulb.material.emissiveIntensity < warmBulb.material.emissiveIntensity * 0.2);
});

test("camera exposure darkens the loft without dimming the star material", () => {
  assert.equal(MUSHROOM_OBSERVATORY_EXPOSURE, 0.5);
  assert.ok(MUSHROOM_STAR_BRIGHTNESS > 1);

  const scenePath = fileURLToPath(
    new URL("../src/villa-map/react/Scene.jsx", import.meta.url)
  );
  const source = readFileSync(scenePath, "utf8");
  assert.match(source, /function MushroomObservatoryExposure\(\)/);
  assert.match(source, /gl\.toneMappingExposure = THREE\.MathUtils\.damp/);
  assert.match(source, /THREE\.MathUtils\.smoothstep\(camera\.position\.y/);
  assert.match(source, /material\.color\.setScalar\(MUSHROOM_STAR_BRIGHTNESS\)/);

  const dome = createMushroomInterior(createMaterials()).getObjectByName(
    "mushroom-interior-dome"
  );
  assert.equal(dome.material.toneMapped, false);
  assert.equal(dome.material.fog, false);
});
