import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";

import {
  MUSHROOM_INTERIOR,
  collidesWithWorld,
  createVillaWorld,
  findFloorZone,
  findStairZone
} from "../src/villa-map/world.js";
import { createMaterials } from "../src/villa-map/assets.js";
import { KAYKIT_FURNITURE_BASE_SCALE } from "../src/villa-map/furniture-models.js";
import {
  createMushroomInterior,
  MUSHROOM_OBSERVATORY_DOME_RIM_NAME,
  MUSHROOM_OBSERVATORY_OUTER_WALL_NAME,
  MUSHROOM_OBSERVATORY_UPPER_SOIL_NAME,
  MUSHROOM_OBSERVATORY_WALL_NAME
} from "../src/villa-map/mushroom-interior.js";
import {
  MUSHROOM_FURNITURE_SCALE,
  MUSHROOM_INTERIOR_LOCAL_RADIUS,
  MUSHROOM_INTERIOR_SCALE,
  MUSHROOM_RAIL_HEIGHT,
  MUSHROOM_SLAB_THICKNESS,
  MUSHROOM_STAIR_OPENING_MARGIN,
  MUSHROOM_STAIR_WIDTH,
  scaleMushroomInteriorPoint
} from "../src/villa-map/mushroom-interior-config.js";
import {
  FURNITURE_FOOTPRINTS,
  FURNITURE_PLACEMENTS,
  MUSHROOM_LOFT_BED_POSITION,
  MUSHROOM_LOFT_BED_TOP_Y
} from "../src/villa-map/furniture-placements.js";
import { PORKY_PLACEMENTS } from "../src/villa-map/placements.js";

const nearlyEqual = (actual, expected, epsilon = 1e-9) =>
  Math.abs(actual - expected) <= epsilon;

// ── World data: the buried three-storey pocket space ───────────────────────

test("mushroom interior exposes spawn/exit teleports wired to the door interactions", () => {
  const world = createVillaWorld();

  const entry = world.interactions.find((item) => item.id === "mushroom-house");
  assert.ok(entry, "outdoor mushroom-house interaction missing");
  assert.deepEqual(entry.action?.teleport, MUSHROOM_INTERIOR.spawn);

  const exit = world.interactions.find((item) => item.id === "mushroom-exit");
  assert.ok(exit, "interior exit interaction missing");
  assert.deepEqual(exit.action?.teleport, MUSHROOM_INTERIOR.exitSpawn);

  // The exit spawn must be OUTSIDE the mushroom house's ground collider and
  // walkable; the interior spawn must be free-standing too.
  assert.equal(collidesWithWorld(MUSHROOM_INTERIOR.exitSpawn, world), false);
  assert.equal(collidesWithWorld(MUSHROOM_INTERIOR.spawn, world), false);
});

test("the pocket interior is 2x while the exterior mushroom stays unchanged", () => {
  const world = createVillaWorld();
  assert.equal(MUSHROOM_INTERIOR.scale, MUSHROOM_INTERIOR_SCALE);
  assert.equal(MUSHROOM_INTERIOR.scale, 2);
  assert.equal(MUSHROOM_INTERIOR.furnitureScale, MUSHROOM_FURNITURE_SCALE);
  assert.equal(MUSHROOM_INTERIOR.furnitureScale, 1);

  assert.ok(
    nearlyEqual(
      MUSHROOM_INTERIOR.footprint.maxX - MUSHROOM_INTERIOR.footprint.minX,
      8.8 * MUSHROOM_INTERIOR_SCALE
    )
  );
  assert.equal(MUSHROOM_INTERIOR.levelHeight, 4 * MUSHROOM_INTERIOR_SCALE);

  const exterior = world.colliders.find((collider) => collider.id === "mushroom-house");
  assert.ok(exterior, "exterior mushroom collider missing");
  assert.equal(exterior.maxX - exterior.minX, 10, "exterior width must not scale");
  assert.equal(exterior.maxZ - exterior.minZ, 10, "exterior depth must not scale");
});

test("each interior level has a Y-scoped floor zone with its own eye height", () => {
  const world = createVillaWorld();
  const { x, z } = MUSHROOM_INTERIOR.center;

  const [l1, l2, l3] = MUSHROOM_INTERIOR.eyeY;
  assert.equal(findFloorZone({ x, y: l1, z }, world)?.id, "mushroom-floor-1");
  assert.equal(findFloorZone({ x, y: l2, z }, world)?.id, "mushroom-floor-2");
  assert.equal(findFloorZone({ x, y: l3, z }, world)?.id, "mushroom-floor-3");
  assert.equal(findFloorZone({ x, y: l1, z }, world)?.eyeY, l1);

  // A courtyard player standing over the buried tower is NOT captured.
  assert.equal(findFloorZone({ x, y: 1.6, z }, world), null);
});

test("interior stair zones are Y-scoped so the courtyard above ignores them", () => {
  const world = createVillaWorld();
  const stairA = world.stairs.find((stair) => stair.id === "mushroom-stairs-a");
  const stairB = world.stairs.find((stair) => stair.id === "mushroom-stairs-b");
  assert.ok(stairA && stairB);

  // Mid-flight XZ of stair A. Captured at interior depth, ignored outdoors.
  const stairAt = (y) => findStairZone({
    x: (stairA.minX + stairA.maxX) / 2,
    y,
    z: (stairA.minZ + stairA.maxZ) / 2
  }, world);
  assert.equal(stairAt(MUSHROOM_INTERIOR.eyeY[0])?.id, "mushroom-stairs-a");
  assert.equal(stairAt(1.6), null);

  const stairBt = (y) => findStairZone({
    x: (stairB.minX + stairB.maxX) / 2,
    y,
    z: (stairB.minZ + stairB.maxZ) / 2
  }, world);
  assert.equal(stairBt(MUSHROOM_INTERIOR.eyeY[1])?.id, "mushroom-stairs-b");
  assert.equal(stairBt(1.6), null);

  // The villa's main stair still matches without any Y hint (legacy calls).
  assert.equal(findStairZone({ x: 0, y: 1.6, z: -10 }, world)?.id, "main-stairs");
});

test("stair interpolation carries the player between interior levels", () => {
  const world = createVillaWorld();
  const stairA = world.stairs.find((s) => s.id === "mushroom-stairs-a");
  assert.ok(stairA);
  assert.equal(stairA.floorY, MUSHROOM_INTERIOR.eyeY[0]);
  assert.equal(stairA.upperY, MUSHROOM_INTERIOR.eyeY[1]);
  assert.ok(nearlyEqual(stairA.maxX - stairA.minX, MUSHROOM_STAIR_WIDTH));
  assert.ok(nearlyEqual(stairA.maxZ - stairA.minZ, 4.4 * MUSHROOM_INTERIOR_SCALE));

  const stairB = world.stairs.find((s) => s.id === "mushroom-stairs-b");
  assert.ok(stairB);
  assert.equal(stairB.floorY, MUSHROOM_INTERIOR.eyeY[1]);
  assert.equal(stairB.upperY, MUSHROOM_INTERIOR.eyeY[2]);
  assert.ok(nearlyEqual(stairB.maxX - stairB.minX, MUSHROOM_STAIR_WIDTH));
});

test("interior walls contain the player; the courtyard above stays unaffected", () => {
  const world = createVillaWorld();
  const l1 = MUSHROOM_INTERIOR.eyeY[0];
  const wallRadius = MUSHROOM_INTERIOR_LOCAL_RADIUS * MUSHROOM_INTERIOR_SCALE;
  const openRadius = wallRadius - world.player.radius - 0.01;
  const blockedRadius = wallRadius - world.player.radius + 0.01;

  // The centre stays open. At every cardinal face the player's full radius can
  // approach the visible cylinder, but their centre cannot cross its edge.
  assert.equal(collidesWithWorld({ ...MUSHROOM_INTERIOR.center, y: l1 }, world), false);
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    assert.equal(collidesWithWorld({
      x: MUSHROOM_INTERIOR.center.x + dx * openRadius,
      y: l1,
      z: MUSHROOM_INTERIOR.center.z + dz * openRadius
    }, world), false);
    assert.equal(collidesWithWorld({
      x: MUSHROOM_INTERIOR.center.x + dx * blockedRadius,
      y: l1,
      z: MUSHROOM_INTERIOR.center.z + dz * blockedRadius
    }, world), true);
  }

  // The mushroom house's GROUND collider still blocks the courtyard walker…
  assert.equal(collidesWithWorld({ x: -6, y: 1.6, z: 18 }, world), true);
  // …and the interior walls never leak up to the courtyard (a spot inside the
  // old fence-free meadow west of the house is walkable).
  assert.equal(collidesWithWorld({ x: -13, y: 1.6, z: 18 }, world), false);
});

test("stair flights stay enterable and guarded (rails, under-stair, rims)", () => {
  const world = createVillaWorld();
  const [l1, l2, l3] = MUSHROOM_INTERIOR.eyeY;
  const stairA = world.stairs.find((stair) => stair.id === "mushroom-stairs-a");
  const stairB = world.stairs.find((stair) => stair.id === "mushroom-stairs-b");
  const byCollider = (id) => world.colliders.find((collider) => collider.id === id);
  const centerOf = (collider) => ({
    x: (collider.minX + collider.maxX) / 2,
    z: (collider.minZ + collider.maxZ) / 2
  });
  const stairCenter = (stair) => ({
    x: (stair.minX + stair.maxX) / 2,
    z: (stair.minZ + stair.maxZ) / 2
  });
  assert.ok(stairA && stairB);

  const aWestRail = byCollider("mushroom-stair-a-rail-w");
  const aUnder = byCollider("mushroom-stair-a-under");
  const aRim = byCollider("mushroom-stair-a-rim");
  assert.ok(aWestRail && aUnder && aRim);
  assert.ok(
    nearlyEqual(aWestRail.maxX - aWestRail.minX, 0.2),
    "rail collider stays 20 cm thick"
  );
  assert.ok(
    nearlyEqual(aUnder.maxX - aUnder.minX, MUSHROOM_STAIR_WIDTH),
    "under-stair block stays normal width"
  );
  assert.ok(
    nearlyEqual(
      aRim.maxX - aRim.minX,
      MUSHROOM_STAIR_WIDTH + MUSHROOM_STAIR_OPENING_MARGIN * 2
    ),
    "rim guard follows the narrow stairwell"
  );

  // Collision must begin at the visible south rail, not nearly a metre in
  // front of it as an invisible wall. Compare both stacked well guards against
  // the factory meshes after the interior's 2x root scale is applied.
  const interior = createMushroomInterior(createMaterials());
  interior.updateMatrixWorld(true);
  for (const [rimId, railName] of [
    ["mushroom-stair-a-rim", "mushroom-interior-well-a-rail-south"],
    ["mushroom-stair-b-rim", "mushroom-interior-well-b-rail-south"]
  ]) {
    const rim = byCollider(rimId);
    const visibleRail = interior.getObjectByName(railName);
    assert.ok(rim && visibleRail, `${rimId} must match a visible south rail`);

    const visibleBox = new THREE.Box3().setFromObject(visibleRail);
    const visibleCenterZ = MUSHROOM_INTERIOR.center.z
      + (visibleBox.min.z + visibleBox.max.z) / 2;
    const colliderCenterZ = (rim.minZ + rim.maxZ) / 2;
    assert.ok(
      nearlyEqual(colliderCenterZ, visibleCenterZ, 1e-6),
      `${rimId} centre drifts away from its visible rail`
    );
    assert.ok(
      nearlyEqual(rim.maxZ - rim.minZ, visibleBox.max.z - visibleBox.min.z, 1e-6),
      `${rimId} is thicker than its visible rail`
    );
  }

  // Bottom entry of flight A (south end) is open to an L1 player…
  assert.equal(collidesWithWorld({
    x: stairCenter(stairA).x,
    y: l1,
    z: stairA.maxZ + 0.8
  }, world), false);
  // …the corridor mid-flight is open on the centre line…
  assert.equal(collidesWithWorld({ ...stairCenter(stairA), y: (l1 + l2) / 2 }, world), false);
  // …but the sides are railed off mid-flight.
  assert.equal(collidesWithWorld({ ...centerOf(byCollider("mushroom-stair-a-rail-w")), y: l1 }, world), true);
  assert.equal(collidesWithWorld({ ...centerOf(byCollider("mushroom-stair-a-rail-e")), y: l1 }, world), true);
  // L1 players cannot wander under the solid top half of flight A.
  assert.equal(collidesWithWorld({ ...centerOf(byCollider("mushroom-stair-a-under")), y: l1 }, world), true);
  // The L2 rim guard stops walking into the open stairwell from the south.
  assert.equal(collidesWithWorld({ ...centerOf(byCollider("mushroom-stair-a-rim")), y: l2 }, world), true);

  // Flight B mirrors the same rules one storey up.
  assert.equal(collidesWithWorld({
    x: stairCenter(stairB).x,
    y: l2,
    z: stairB.maxZ + 0.8
  }, world), false);
  assert.equal(collidesWithWorld({ ...centerOf(byCollider("mushroom-stair-b-under")), y: l2 }, world), true);
  assert.equal(collidesWithWorld({ ...centerOf(byCollider("mushroom-stair-b-rim")), y: l3 }, world), true);
});

test("furnished floors preserve a player-width route through all three levels", () => {
  const world = createVillaWorld();
  const stairA = world.stairs.find((stair) => stair.id === "mushroom-stairs-a");
  const stairB = world.stairs.find((stair) => stair.id === "mushroom-stairs-b");
  const stairX = (stair) => (stair.minX + stair.maxX) / 2;
  const routes = [
    {
      name: "entry to stair A",
      y: MUSHROOM_INTERIOR.eyeY[0],
      start: MUSHROOM_INTERIOR.spawn,
      goal: { x: stairX(stairA), z: stairA.maxZ + 0.8 }
    },
    {
      name: "stair A landing to den centre",
      y: MUSHROOM_INTERIOR.eyeY[1],
      start: { x: stairX(stairA), z: stairA.minZ - 0.8 },
      goal: MUSHROOM_INTERIOR.center,
      bounds: { minX: -8, maxX: -0.4, minZ: 9.2, maxZ: 19.5 }
    },
    {
      name: "den centre to stair B",
      y: MUSHROOM_INTERIOR.eyeY[1],
      start: MUSHROOM_INTERIOR.center,
      goal: { x: stairX(stairB), z: stairB.maxZ + 0.8 },
      bounds: { minX: -12, maxX: -4, minZ: 17, maxZ: 26.2 }
    },
    {
      name: "stair B landing to loft centre",
      y: MUSHROOM_INTERIOR.eyeY[2],
      start: { x: stairX(stairB), z: stairB.minZ - 0.8 },
      goal: MUSHROOM_INTERIOR.center
    }
  ];

  const step = 0.35;
  const fp = MUSHROOM_INTERIOR.footprint;
  const snap = (point) => ({
    x: Math.round(point.x / step) * step,
    z: Math.round(point.z / step) * step
  });
  const key = (point) => `${Math.round(point.x / step)},${Math.round(point.z / step)}`;

  for (const route of routes) {
    const routeBounds = route.bounds ?? fp;
    const start = snap(route.start);
    const goal = snap(route.goal);
    const queue = [start];
    const seen = new Set([key(start)]);
    let cursor = 0;
    let reached = false;

    while (cursor < queue.length && !reached) {
      const current = queue[cursor++];
      if (Math.hypot(current.x - goal.x, current.z - goal.z) <= step * 1.5) {
        reached = true;
        break;
      }
      for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const next = { x: current.x + dx, z: current.z + dz };
        if (
          next.x < routeBounds.minX ||
          next.x > routeBounds.maxX ||
          next.z < routeBounds.minZ ||
          next.z > routeBounds.maxZ
        ) continue;
        const nextKey = key(next);
        if (seen.has(nextKey)) continue;
        if (collidesWithWorld({ ...next, y: route.y }, world)) continue;
        seen.add(nextKey);
        queue.push(next);
      }
    }

    assert.equal(reached, true, `${route.name} is blocked by the dense furnishing`);
  }
});

test("interior interactions exist on all three levels plus the exit door", () => {
  const world = createVillaWorld();
  const byId = new Map(world.interactions.map((item) => [item.id, item]));

  const expectations = [
    ["mushroom-exit", MUSHROOM_INTERIOR.eyeY[0]],
    ["mushroom-hearth", MUSHROOM_INTERIOR.eyeY[0]],
    ["mushroom-den", MUSHROOM_INTERIOR.eyeY[1]],
    ["mushroom-loft", MUSHROOM_INTERIOR.eyeY[2]]
  ];
  for (const [id, eyeY] of expectations) {
    const item = byId.get(id);
    assert.ok(item, `missing interior interaction ${id}`);
    // Markers sit within the interaction Y-filter tolerance (2.0) of the eye.
    assert.ok(
      Math.abs(item.position.y - eyeY) < 2.0,
      `${id} marker Y ${item.position.y} too far from eye ${eyeY}`
    );
  }
});

test("interior rooms are registered with their sunken floor heights", () => {
  const world = createVillaWorld();
  const roomsById = new Map(world.rooms.map((room) => [room.id, room]));

  assert.equal(roomsById.get("mushroom-hearth")?.floorY, MUSHROOM_INTERIOR.floorY[0]);
  assert.equal(roomsById.get("mushroom-den")?.floorY, MUSHROOM_INTERIOR.floorY[1]);
  assert.equal(roomsById.get("mushroom-loft")?.floorY, MUSHROOM_INTERIOR.floorY[2]);
  for (const id of ["mushroom-hearth", "mushroom-den", "mushroom-loft"]) {
    assert.deepEqual(roomsById.get(id)?.size, {
      x: 8 * MUSHROOM_INTERIOR_SCALE,
      z: 8 * MUSHROOM_INTERIOR_SCALE
    });
  }
});

// ── Interior furniture data ────────────────────────────────────────────────

test("all three interior levels are densely furnished from the vendored KayKit pack", () => {
  const byRoom = (room) => FURNITURE_PLACEMENTS.filter((p) => p.room === room);

  const hearth = byRoom("mushroom-hearth");
  const den = byRoom("mushroom-den");
  const loft = byRoom("mushroom-loft");
  assert.ok(hearth.length >= 30, "hearth should feel crowded");
  assert.ok(den.length >= 30, "den should feel crowded");
  assert.ok(loft.length >= 30, "loft should feel crowded");

  // Floor indices drive Y-scoped colliders: 2/3/4 bottom-up.
  hearth.forEach((p) => assert.equal(p.floor, 2, `${p.id} floor`));
  den.forEach((p) => assert.equal(p.floor, 3, `${p.id} floor`));
  loft.forEach((p) => assert.equal(p.floor, 4, `${p.id} floor`));

  // Signature pieces per storey: family table, pillow sofa, double bed.
  assert.ok(hearth.some((p) => p.model === "table_medium_long"), "hearth needs its table");
  assert.ok(den.some((p) => p.model === "couch_pillows"), "den needs its sofa");
  assert.ok(loft.some((p) => p.model === "bed_double_B"), "loft needs its bed");

  [...hearth, ...den, ...loft].forEach((piece) => {
    assert.match(piece.url, /^\/models\/mushroom-furniture\/.+\.glb$/);
    assert.equal(piece.baseScale, KAYKIT_FURNITURE_BASE_SCALE, `${piece.id} KayKit scale`);
  });

  // Check every rotated footprint corner against the real circular wall. A
  // centre-only or square-bounds check lets wide shelves, rugs and pictures
  // disappear into the curved shell even though their anchors look valid.
  const safeRadius = MUSHROOM_INTERIOR_LOCAL_RADIUS * MUSHROOM_INTERIOR_SCALE - 0.15;
  const rotatedAabb = (piece) => {
    const theta = piece.rotationY ?? 0;
    const cos = Math.abs(Math.cos(theta));
    const sin = Math.abs(Math.sin(theta));
    const halfX = (piece.footprint.x * cos + piece.footprint.z * sin) / 2;
    const halfZ = (piece.footprint.x * sin + piece.footprint.z * cos) / 2;
    const [x, , z] = piece.position;
    return { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ };
  };
  const overlaps = (box, rect) =>
    box.maxX > rect.minX &&
    box.minX < rect.maxX &&
    box.maxZ > rect.minZ &&
    box.minZ < rect.maxZ;

  const allPieces = [...hearth, ...den, ...loft];
  allPieces.forEach((piece) => {
    // Curved-wall decor follows a dedicated exact-corner regression: its back
    // corners intentionally sit 4 cm from the shell, while grounded furniture
    // keeps this roomier 15 cm circulation buffer.
    if (piece.wallMounted || piece.onWallShelfId) return;
    const box = rotatedAabb(piece);
    for (const x of [box.minX, box.maxX]) {
      for (const z of [box.minZ, box.maxZ]) {
        const radius = Math.hypot(
          x - MUSHROOM_INTERIOR.center.x,
          z - MUSHROOM_INTERIOR.center.z
        );
        assert.ok(radius <= safeRadius, `${piece.id} reaches ${radius.toFixed(2)} m into the wall`);
      }
    }
  });

  // Lower floors clear the physical flights; upper floors clear the exact
  // enlarged holes cut into their slabs.
  const world = createVillaWorld();
  const stairA = world.stairs.find((stair) => stair.id === "mushroom-stairs-a");
  const stairB = world.stairs.find((stair) => stair.id === "mushroom-stairs-b");
  const flightRect = (stair) => ({
    minX: stair.minX - 0.25,
    maxX: stair.maxX + 0.25,
    minZ: stair.minZ - 0.25,
    maxZ: stair.maxZ + 0.5
  });
  const interior = createMushroomInterior(createMaterials());
  const holeRect = (slabName) => {
    const slab = interior.getObjectByName(slabName);
    const points = slab.geometry.parameters.shapes.holes[0].getPoints();
    const xs = points.map((point) => MUSHROOM_INTERIOR.center.x + point.x * MUSHROOM_INTERIOR_SCALE);
    const zs = points.map((point) => MUSHROOM_INTERIOR.center.z - point.y * MUSHROOM_INTERIOR_SCALE);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs)
    };
  };
  const forbiddenByFloor = {
    2: [flightRect(stairA)],
    3: [holeRect("mushroom-interior-slab-l2"), flightRect(stairB)],
    4: [holeRect("mushroom-interior-slab-l3")]
  };
  allPieces.forEach((piece) => {
    const floorY = MUSHROOM_INTERIOR.floorY[piece.floor - 2];
    const isElevatedDecor = !piece.solid && piece.position[1] > floorY + 0.4;
    if (isElevatedDecor) return;
    const box = rotatedAabb(piece);
    for (const forbidden of forbiddenByFloor[piece.floor]) {
      assert.equal(overlaps(box, forbidden), false, `${piece.id} overlaps a stair or ceiling opening`);
    }
  });
});

test("mushroom furniture uses metre-scale footprints and layered vertical clutter", () => {
  const pieces = FURNITURE_PLACEMENTS.filter((piece) => piece.room.startsWith("mushroom-"));
  assert.equal(pieces.length, 94);

  const models = new Set(pieces.map((piece) => piece.model));
  assert.ok(models.size >= 28, `expected broad pack variety, got ${models.size} models`);
  for (const piece of pieces) {
    const native = FURNITURE_FOOTPRINTS[piece.model];
    assert.ok(native, `${piece.id} needs a measured native footprint`);
    const scale = KAYKIT_FURNITURE_BASE_SCALE * piece.scale;
    assert.ok(
      nearlyEqual(piece.footprint.x, native.x * scale),
      `${piece.id} footprint.x uses the KayKit base scale`
    );
    assert.ok(
      nearlyEqual(piece.footprint.z, native.z * scale),
      `${piece.id} footprint.z uses the KayKit base scale`
    );
  }

  // Shelves, pictures, books, lamps and cushions should visibly climb above
  // the floor rather than concentrating all 94 pieces in one flat layer.
  for (const [level, floorY] of MUSHROOM_INTERIOR.floorY.entries()) {
    const floor = level + 2;
    const elevated = pieces.filter(
      (piece) => piece.floor === floor && piece.position[1] > floorY + 0.4
    );
    assert.ok(elevated.length >= 9, `mushroom floor ${floor} lacks vertical clutter`);
  }
});

test("the sleepy loft pig rests on the measured top of the KayKit bed", () => {
  const bed = FURNITURE_PLACEMENTS.find((piece) => piece.id === "m3-bed");
  const sleeper = PORKY_PLACEMENTS.find((piece) => piece.id === "meshy-sleepy-loft");
  assert.ok(bed && sleeper);
  assert.equal(sleeper.onFurnitureId, bed.id);
  assert.deepEqual(bed.position, MUSHROOM_LOFT_BED_POSITION);
  assert.equal(sleeper.position[0], bed.position[0]);
  assert.equal(sleeper.position[2], bed.position[2]);
  assert.ok(nearlyEqual(sleeper.position[1], MUSHROOM_LOFT_BED_TOP_Y + 0.02));
  const supportHeight = sleeper.position[1] - MUSHROOM_INTERIOR.floorY[2];
  assert.ok(supportHeight > 0.6 && supportHeight < 0.7);
});

// ── Procedural factory (node-pure) ─────────────────────────────────────────

test("mushroom interior factory builds three storeys with stairs, dome and door", () => {
  const interior = createMushroomInterior(createMaterials());
  assert.equal(interior.scale.x, MUSHROOM_INTERIOR_SCALE);
  assert.equal(interior.scale.y, MUSHROOM_INTERIOR_SCALE);
  assert.equal(interior.scale.z, MUSHROOM_INTERIOR_SCALE);

  const byName = (name) => interior.getObjectByName(name);
  assert.ok(byName("mushroom-interior-wall"), "round wall missing");
  assert.ok(byName("mushroom-interior-dome"), "cap dome missing");
  assert.ok(byName("mushroom-interior-door"), "exit door missing");
  assert.equal(
    byName("mushroom-interior-door-arch")?.geometry.type,
    "TorusGeometry",
    "door arch must be open trim, not a filled half-cylinder"
  );
  assert.ok(byName("mushroom-interior-soil"), "soil surround missing");
  for (const name of [
    MUSHROOM_OBSERVATORY_WALL_NAME,
    MUSHROOM_OBSERVATORY_OUTER_WALL_NAME,
    MUSHROOM_OBSERVATORY_UPPER_SOIL_NAME,
    MUSHROOM_OBSERVATORY_DOME_RIM_NAME
  ]) {
    const surface = byName(name);
    assert.ok(surface, `${name} rift surface missing`);
    assert.equal(surface.material.transparent, true, `${name} must fade`);
    assert.equal(surface.material.depthWrite, false, `${name} must reveal the sky`);
  }

  // Both slabs keep their authored local coordinates while the parent scale
  // moves their effective tops to the two configured world storey heights.
  const l2 = byName("mushroom-interior-slab-l2");
  const l3 = byName("mushroom-interior-slab-l3");
  assert.ok(l2 && l3, "upper slabs missing");
  const localSlabThickness = MUSHROOM_SLAB_THICKNESS / MUSHROOM_INTERIOR_SCALE;
  assert.ok(
    Math.abs(l2.position.y + localSlabThickness - 4) < 1e-9,
    "L2 slab top at local 4"
  );
  assert.ok(
    Math.abs(l3.position.y + localSlabThickness - 8) < 1e-9,
    "L3 slab top at local 8"
  );
  assert.ok(
    nearlyEqual(
      (l2.position.y + localSlabThickness) * interior.scale.y,
      MUSHROOM_INTERIOR.levelHeight
    ),
    "L2 slab top follows the configured level height"
  );
  assert.ok(
    nearlyEqual(
      (l3.position.y + localSlabThickness) * interior.scale.y,
      MUSHROOM_INTERIOR.levelHeight * 2
    ),
    "L3 slab top follows twice the configured level height"
  );
  assert.ok(
    nearlyEqual(
      l2.geometry.parameters.options.depth * interior.scale.y,
      MUSHROOM_SLAB_THICKNESS
    ),
    "slab stays 30 cm thick instead of inheriting the room scale"
  );
  // Each upper slab is cut by exactly one stairwell hole.
  assert.equal(l2.geometry.parameters.shapes.holes.length, 1);
  assert.equal(l3.geometry.parameters.shapes.holes.length, 1);
  const openingPoints = l2.geometry.parameters.shapes.holes[0].getPoints();
  const openingXs = openingPoints.map((point) => point.x);
  const openingYs = openingPoints.map((point) => point.y);
  assert.ok(
    nearlyEqual(
      (Math.max(...openingXs) - Math.min(...openingXs)) * interior.scale.x,
      MUSHROOM_STAIR_WIDTH + MUSHROOM_STAIR_OPENING_MARGIN * 2
    ),
    "stair opening keeps comfortable clearance around the normal-width flight"
  );
  assert.ok(
    (Math.max(...openingYs) - Math.min(...openingYs)) * interior.scale.z
      >= 4.4 * MUSHROOM_INTERIOR_SCALE + 1.35,
    "stair opening extends beyond both ends of the flight for headroom"
  );
  const assertNoCeilingAcrossOpening = (slab) => {
    const position = slab.geometry.attributes.position;
    const points = slab.geometry.parameters.shapes.holes[0].getPoints();
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const depth = slab.geometry.parameters.options.depth;
    for (let index = 0; index < position.count; index += 3) {
      const zs = [0, 1, 2].map((offset) => position.getZ(index + offset));
      const isCap =
        zs.every((z) => nearlyEqual(z, 0)) ||
        zs.every((z) => nearlyEqual(z, depth));
      if (!isCap) continue;
      const x = [0, 1, 2]
        .map((offset) => position.getX(index + offset))
        .reduce((sum, value) => sum + value, 0) / 3;
      const y = [0, 1, 2]
        .map((offset) => position.getY(index + offset))
        .reduce((sum, value) => sum + value, 0) / 3;
      assert.equal(
        x > minX && x < maxX && y > minY && y < maxY,
        false,
        `${slab.name} has a ceiling triangle across its stair opening`
      );
    }
  };
  assertNoCeilingAcrossOpening(l2);
  assertNoCeilingAcrossOpening(l3);
  for (const side of ["west", "east", "south", "north"]) {
    assert.ok(byName(`mushroom-interior-slab-l2-reveal-${side}`), `${side} reveal missing`);
  }

  // Step count follows the room scale, keeping every world-space riser at the
  // same height while the flight spans the compact magical storey.
  const steps = [];
  const risers = [];
  interior.traverse((child) => {
    if (/mushroom-interior-stair-[ab]-step-/.test(child.name)) steps.push(child);
    if (/mushroom-interior-stair-[ab]-riser-/.test(child.name)) risers.push(child);
  });
  const stepsPerFlight = 10 * MUSHROOM_INTERIOR_SCALE;
  assert.equal(steps.length, stepsPerFlight * 2);
  assert.equal(risers.length, stepsPerFlight * 2);
  const aFirst = byName("mushroom-interior-stair-a-step-0");
  assert.ok(aFirst);
  assert.ok(
    nearlyEqual(aFirst.geometry.parameters.width * interior.scale.x, MUSHROOM_STAIR_WIDTH),
    "stair width stays at 3.2 m instead of inheriting the room scale"
  );
  assert.ok(
    nearlyEqual(
      aFirst.geometry.parameters.depth * interior.scale.z,
      4.4 / stepsPerFlight * MUSHROOM_INTERIOR_SCALE + 0.04
    ),
    "each tread stays pig/player scale"
  );
  assert.ok(
    nearlyEqual(aFirst.geometry.parameters.height * interior.scale.y, 0.18),
    "each tread stays 18 cm thick instead of becoming a full-height block"
  );
  const aFirstRiser = byName("mushroom-interior-stair-a-riser-0");
  assert.ok(aFirstRiser);
  assert.ok(
    nearlyEqual(aFirstRiser.geometry.parameters.height * interior.scale.y, 0.4),
    "each independent riser stays 40 cm high"
  );
  assert.ok(byName("mushroom-interior-stair-a-stringer-west"));
  assert.ok(byName("mushroom-interior-stair-a-stringer-east"));
  const aTop = byName(`mushroom-interior-stair-a-step-${stepsPerFlight - 1}`);
  assert.ok(aTop);
  const aTopSurface = aTop.position.y + aTop.geometry.parameters.height / 2;
  assert.ok(
    nearlyEqual(aTopSurface * interior.scale.y, MUSHROOM_INTERIOR.levelHeight),
    "flight A top step flush with scaled L2"
  );
  const bTop = byName(`mushroom-interior-stair-b-step-${stepsPerFlight - 1}`);
  const bTopSurface = bTop.position.y + bTop.geometry.parameters.height / 2;
  assert.ok(
    nearlyEqual(bTopSurface * interior.scale.y, MUSHROOM_INTERIOR.levelHeight * 2),
    "flight B top step flush with scaled L3"
  );

  const handrail = byName("mushroom-interior-stair-a-handrail-west");
  const handrailPost = byName("mushroom-interior-stair-a-post-west-0");
  const oppositeHandrail = byName("mushroom-interior-stair-a-handrail-east");
  const wellRail = byName("mushroom-interior-well-a-rail-west");
  const wellPost = byName("mushroom-interior-well-a-rail-west-post-0");
  assert.ok(handrail && oppositeHandrail && handrailPost && wellRail && wellPost);
  assert.ok(
    nearlyEqual(handrail.geometry.parameters.width * interior.scale.x, 0.08),
    "handrail stays 8 cm thick"
  );
  assert.ok(
    nearlyEqual(handrailPost.geometry.parameters.height * interior.scale.y, MUSHROOM_RAIL_HEIGHT),
    "stair posts stay one metre high"
  );
  assert.ok(
    nearlyEqual(wellRail.geometry.parameters.height * interior.scale.y, 0.1),
    "well rail stays 10 cm tall"
  );
  assert.ok(
    nearlyEqual(wellPost.geometry.parameters.height * interior.scale.y, MUSHROOM_RAIL_HEIGHT),
    "well posts stay one metre high"
  );

  // Glowing portholes on every storey (the loft's "star ring" included).
  const windows = [];
  const windowTrims = [];
  interior.traverse((child) => {
    if (/^mushroom-interior-window-\d+-\d+$/.test(child.name)) windows.push(child);
    if (child.name.startsWith("mushroom-interior-window-trim-")) windowTrims.push(child);
  });
  assert.equal(windows.length, 15, "expected portholes on all storeys");
  assert.equal(windowTrims.length, windows.length, "each porthole needs visible trim");
  [...windows, ...windowTrims].forEach((decor) => {
    assert.ok(
      Math.hypot(decor.position.x, decor.position.z) <= MUSHROOM_INTERIOR_LOCAL_RADIUS - 0.1,
      `${decor.name} is buried in the curved wall`
    );
  });
  assert.ok(windows.length >= 12, "expected portholes on all storeys");

  // The two cosy lower levels get wall-anchored, player-scale canopies: 3
  // cords, 6 anchor studs, 27 bulbs and 24 pennants. L3 stays completely clear
  // so nothing interrupts the observatory's star-dome sightline.
  for (let level = 1; level <= 2; level += 1) {
    const prefix = `mushroom-interior-fairy-canopy-${level}`;
    const canopy = byName(prefix);
    assert.ok(canopy, `${prefix} missing`);
    const names = [];
    canopy.traverse((child) => names.push(child.name));
    assert.equal(names.filter((name) => name.includes("-strand-")).length, 3);
    assert.equal(names.filter((name) => name.includes("-anchor-")).length, 6);
    assert.equal(names.filter((name) => name.includes("-bulb-")).length, 27);
    assert.equal(names.filter((name) => name.includes("-pennant-")).length, 24);

    for (let strand = 1; strand <= 3; strand += 1) {
      const cord = canopy.getObjectByName(`${prefix}-strand-${strand}`);
      const west = canopy.getObjectByName(`${prefix}-anchor-${strand}-west`);
      const east = canopy.getObjectByName(`${prefix}-anchor-${strand}-east`);
      const points = cord.geometry.parameters.path.points;

      assert.ok(west && east, `strand ${strand} is missing a wall anchor`);
      assert.ok(
        nearlyEqual(Math.hypot(west.position.x, west.position.z), MUSHROOM_INTERIOR_LOCAL_RADIUS - 0.08),
        `${west.name} does not meet the curved wall`
      );
      assert.ok(
        nearlyEqual(Math.hypot(east.position.x, east.position.z), MUSHROOM_INTERIOR_LOCAL_RADIUS - 0.08),
        `${east.name} does not meet the curved wall`
      );
      assert.ok(west.position.distanceTo(points[0]) < 1e-9);
      assert.ok(east.position.distanceTo(points.at(-1)) < 1e-9);
    }

    const firstCord = canopy.getObjectByName(`${prefix}-strand-1`);
    const firstPennant = canopy.getObjectByName(`${prefix}-pennant-1-1`);
    const joinPoint = firstCord.geometry.parameters.path.getPoint(1 / 9);
    assert.ok(
      nearlyEqual(
        firstPennant.position.y + firstPennant.geometry.parameters.height / 2,
        joinPoint.y
      ),
      "pennant must meet its cord without a floating gap"
    );
  }
  assert.equal(byName("mushroom-interior-fairy-canopy-3"), undefined);
});
