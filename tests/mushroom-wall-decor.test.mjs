import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FURNITURE_PLACEMENTS,
  MUSHROOM_WALL_CLEARANCE
} from "../src/villa-map/furniture-placements.js";
import {
  MUSHROOM_INTERIOR_CENTER,
  MUSHROOM_INTERIOR_LOCAL_RADIUS,
  MUSHROOM_INTERIOR_SCALE
} from "../src/villa-map/mushroom-interior-config.js";

const WALL_IDS = [
  "m1-north-picture",
  "m1-north-picture-small",
  "m1-pantry-shelf",
  "m1-spice-shelf",
  "m1-west-picture-a",
  "m1-west-picture-b",
  "m1-west-wall-shelf",
  "m2-east-picture",
  "m2-east-picture-small",
  "m2-east-shelf-large",
  "m2-east-shelf-small",
  "m2-south-picture",
  "m2-south-shelf",
  "m2-west-picture",
  "m2-west-shelf",
  "m3-east-picture",
  "m3-east-picture-small",
  "m3-east-shelf",
  "m3-journal-shelf",
  "m3-south-picture",
  "m3-south-shelf",
  "m3-vanity-mirror"
].sort();

const byId = new Map(FURNITURE_PLACEMENTS.map((piece) => [piece.id, piece]));
const wallRadius = MUSHROOM_INTERIOR_LOCAL_RADIUS * MUSHROOM_INTERIOR_SCALE;

function transformedCorners(piece) {
  const halfX = piece.footprint.x / 2;
  const halfZ = piece.footprint.z / 2;
  const cos = Math.cos(piece.rotationY);
  const sin = Math.sin(piece.rotationY);

  return [-halfX, halfX].flatMap((localX) =>
    [-halfZ, halfZ].map((localZ) => ({
      x: piece.position[0] + localX * cos + localZ * sin,
      z: piece.position[2] - localX * sin + localZ * cos
    }))
  );
}

test("all true wall decor is tagged while tabletop frames stay on furniture", () => {
  const actual = FURNITURE_PLACEMENTS
    .filter((piece) => piece.wallMounted)
    .map((piece) => piece.id)
    .sort();
  assert.deepEqual(actual, WALL_IDS);

  for (const id of [
    "m1-pantry-photo",
    "m2-reading-photo",
    "m2-west-photo",
    "m3-bed-photo"
  ]) {
    assert.notEqual(byId.get(id)?.wallMounted, true, `${id} is a tabletop frame`);
  }
});

test("wall decor hugs the expanded curved shell and turns tangent to it", () => {
  for (const id of WALL_IDS) {
    const piece = byId.get(id);
    const corners = transformedCorners(piece);
    const maxRadius = Math.max(...corners.map(({ x, z }) => Math.hypot(
      x - MUSHROOM_INTERIOR_CENTER.x,
      z - MUSHROOM_INTERIOR_CENTER.z
    )));

    assert.ok(
      Math.abs(maxRadius - (wallRadius - MUSHROOM_WALL_CLEARANCE)) < 1e-6,
      `${id} must sit against, but not through, the curved wall`
    );

    const dx = piece.position[0] - MUSHROOM_INTERIOR_CENTER.x;
    const dz = piece.position[2] - MUSHROOM_INTERIOR_CENTER.z;
    const radius = Math.hypot(dx, dz);
    const outwardX = dx / radius;
    const outwardZ = dz / radius;
    const backX = -Math.sin(piece.rotationY);
    const backZ = -Math.cos(piece.rotationY);
    assert.ok(
      outwardX * backX + outwardZ * backZ > 0.999999,
      `${id} back must follow the wall normal`
    );
  }
});

test("loose books follow their projected wall shelves as one rigid cluster", () => {
  const bindings = [
    ["m1-west-shelf-books", "m1-west-wall-shelf", { x: 0, z: 0.208, y: 0.38 }],
    ["m2-east-shelf-book", "m2-east-shelf-large", { x: 0.208, z: 0.224, y: 0.37 }]
  ];

  for (const [childId, parentId, expected] of bindings) {
    const child = byId.get(childId);
    const parent = byId.get(parentId);
    assert.equal(child?.onWallShelfId, parentId);
    assert.equal(parent?.wallMounted, true);

    const dx = child.position[0] - parent.position[0];
    const dz = child.position[2] - parent.position[2];
    const cos = Math.cos(parent.rotationY);
    const sin = Math.sin(parent.rotationY);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    assert.ok(Math.abs(localX - expected.x) < 1e-6, `${childId} local X drifted`);
    assert.ok(Math.abs(localZ - expected.z) < 1e-6, `${childId} local Z drifted`);
    assert.ok(
      Math.abs((child.position[1] - parent.position[1]) - expected.y) < 1e-6,
      `${childId} height drifted off its shelf`
    );

    const childMaxRadius = Math.max(...transformedCorners(child).map(({ x, z }) =>
      Math.hypot(x - MUSHROOM_INTERIOR_CENTER.x, z - MUSHROOM_INTERIOR_CENTER.z)
    ));
    assert.ok(childMaxRadius < wallRadius, `${childId} penetrates the curved wall`);
  }
});
