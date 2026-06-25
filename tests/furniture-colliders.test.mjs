import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveFurnitureColliders } from "../src/villa-map/furniture-colliders.js";
import { FURNITURE_PLACEMENTS } from "../src/villa-map/furniture-placements.js";
import { collidesWithWorld, createVillaWorld } from "../src/villa-map/world.js";

const GROUND_Y = { minY: 0, maxY: 5.6 };
const UPPER_Y = { minY: 6.65, maxY: 11.25 };

test("derives one well-formed collider per solid furniture piece", () => {
  const solid = FURNITURE_PLACEMENTS.filter((piece) => piece.solid === true);
  const colliders = deriveFurnitureColliders(FURNITURE_PLACEMENTS);

  assert.ok(solid.length >= 1, "expected at least one solid piece");
  assert.equal(colliders.length, solid.length, "one collider per solid piece");

  const byId = new Map(colliders.map((c) => [c.id, c]));
  solid.forEach((piece) => {
    const collider = byId.get(`furniture-${piece.id}`);
    assert.ok(collider, `missing collider for solid piece ${piece.id}`);

    assert.ok(collider.id.startsWith("furniture-"), "id is namespaced");
    ["minX", "maxX", "minZ", "maxZ", "minY", "maxY"].forEach((key) => {
      assert.equal(typeof collider[key], "number", `${collider.id}.${key} numeric`);
    });
    assert.ok(collider.minX < collider.maxX, `${collider.id} minX<maxX`);
    assert.ok(collider.minZ < collider.maxZ, `${collider.id} minZ<maxZ`);

    const expected = piece.floor === 1 ? UPPER_Y : GROUND_Y;
    assert.equal(collider.minY, expected.minY, `${collider.id} minY by floor`);
    assert.equal(collider.maxY, expected.maxY, `${collider.id} maxY by floor`);
  });
});

test("non-solid pieces produce no collider", () => {
  const rug = FURNITURE_PLACEMENTS.find((piece) => piece.id === "west-rug");
  assert.ok(rug, "west-rug fixture missing");
  assert.equal(rug.solid, false, "west-rug should be non-solid");

  const colliders = deriveFurnitureColliders(FURNITURE_PLACEMENTS);
  assert.equal(
    colliders.some((c) => c.id === "furniture-west-rug"),
    false,
    "non-solid west-rug must not yield a collider"
  );
});

test("a ground-floor solid piece blocks the player at its centre", () => {
  const world = createVillaWorld();
  world.colliders.push(...deriveFurnitureColliders(FURNITURE_PLACEMENTS));

  const sofa = FURNITURE_PLACEMENTS.find((piece) => piece.id === "west-sofa");
  assert.ok(sofa, "west-sofa fixture missing");
  assert.equal(sofa.solid, true);

  assert.equal(
    collidesWithWorld({ x: sofa.position[0], y: 1.6, z: sofa.position[2] }, world),
    true,
    "ground player at the sofa centre should collide"
  );
});

test("upper-floor solid piece is Y-scoped above the ground floor", () => {
  const bed = FURNITURE_PLACEMENTS.find((piece) => piece.id === "bed-double");
  assert.ok(bed, "bed-double fixture missing");
  assert.equal(bed.floor, 1, "bed-double should be on the upper floor");
  assert.equal(bed.solid, true);

  const colliders = deriveFurnitureColliders(FURNITURE_PLACEMENTS);
  const bedCollider = colliders.find((c) => c.id === "furniture-bed-double");
  assert.ok(bedCollider, "bed-double collider missing");
  assert.equal(bedCollider.minY, 6.65, "upper collider sits above ground floor");

  const world = createVillaWorld();
  world.colliders.push(...colliders);

  // An upper-floor player at the bed centre collides...
  assert.equal(
    collidesWithWorld({ x: bed.position[0], y: 8.05, z: bed.position[2] }, world),
    true,
    "upper player at the bed centre should collide"
  );
  // ...while a ground-floor player below minY (6.65) skips it: y 1.6 < 6.65.
  assert.equal(
    collidesWithWorld({ x: bed.position[0], y: 1.6, z: bed.position[2] }, world),
    false,
    "ground player should not collide with the upstairs bed"
  );
});
