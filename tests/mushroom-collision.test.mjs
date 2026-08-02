import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MUSHROOM_INTERIOR,
  collidesWithWorld,
  createVillaWorld,
  findFloorZone
} from "../src/villa-map/world.js";
import {
  MUSHROOM_INTERIOR_LOCAL_RADIUS,
  MUSHROOM_INTERIOR_SCALE
} from "../src/villa-map/mushroom-interior-config.js";

const pointAtRadius = (radius, angle, y) => ({
  x: MUSHROOM_INTERIOR.center.x + Math.cos(angle) * radius,
  y,
  z: MUSHROOM_INTERIOR.center.z + Math.sin(angle) * radius
});

test("the round mushroom wall contains every storey and both stair transitions", () => {
  const world = createVillaWorld();
  const boundary = world.colliders.find(
    (collider) => collider.id === "mushroom-int-round-wall"
  );
  assert.ok(boundary, "round mushroom-wall boundary missing");
  assert.equal(boundary.kind, "circle-boundary");
  assert.equal(
    boundary.radius,
    MUSHROOM_INTERIOR_LOCAL_RADIUS * MUSHROOM_INTERIOR_SCALE,
    "collision radius must match the visible cylindrical wall"
  );

  // Isolate the perimeter so furniture cannot turn a wall-clearance probe into
  // a false positive. The player centre may approach until their own radius
  // touches the shell, but may not cross it at cardinal or diagonal angles.
  const boundaryOnlyWorld = { ...world, colliders: [boundary] };
  const insideRadius = boundary.radius - world.player.radius - 0.01;
  const outsideRadius = boundary.radius - world.player.radius + 0.01;
  const [l1, l2, l3] = MUSHROOM_INTERIOR.eyeY;
  const interiorHeights = [l1, (l1 + l2) / 2, l2, (l2 + l3) / 2, l3];
  const angles = Array.from({ length: 16 }, (_, index) => index * Math.PI / 8);

  for (const y of interiorHeights) {
    for (const angle of angles) {
      assert.equal(
        collidesWithWorld(pointAtRadius(insideRadius, angle, y), boundaryOnlyWorld),
        false,
        `walkable side of round wall blocked at y=${y}, angle=${angle}`
      );
      assert.equal(
        collidesWithWorld(pointAtRadius(outsideRadius, angle, y), boundaryOnlyWorld),
        true,
        `round wall leaked at y=${y}, angle=${angle}`
      );
    }
  }

  // The old four-box approximation leaked specifically at diagonal corners.
  const diagonalLeak = pointAtRadius(outsideRadius, Math.PI / 4, l1);
  assert.equal(collidesWithWorld(diagonalLeak, world), true);
});

test("round-wall collision stays buried and floor height remains active to its edge", () => {
  const world = createVillaWorld();
  const boundary = world.colliders.find(
    (collider) => collider.id === "mushroom-int-round-wall"
  );
  const boundaryOnlyWorld = { ...world, colliders: [boundary] };
  const safeRadius = boundary.radius - world.player.radius - 0.01;

  MUSHROOM_INTERIOR.eyeY.forEach((y, level) => {
    const nearCardinalWall = pointAtRadius(safeRadius, 0, y);
    assert.equal(
      findFloorZone(nearCardinalWall, world)?.id,
      `mushroom-floor-${level + 1}`,
      "camera-height floor zone must reach the curved wall"
    );
  });

  // A matching XZ point in the courtyard is above the pocket's Y band, so the
  // buried boundary must not create an invisible outdoor wall.
  assert.equal(
    collidesWithWorld(pointAtRadius(boundary.radius + 1, Math.PI / 4, 1.6), boundaryOnlyWorld),
    false
  );
});
