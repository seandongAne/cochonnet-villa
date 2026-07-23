import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MUSHROOM_INTERIOR,
  collidesWithWorld,
  createVillaWorld,
  findFloorZone,
  findStairZone
} from "../src/villa-map/world.js";
import { createMaterials } from "../src/villa-map/assets.js";
import { createMushroomInterior } from "../src/villa-map/mushroom-interior.js";
import {
  MUSHROOM_FURNITURE_SCALE,
  MUSHROOM_INTERIOR_SCALE,
  MUSHROOM_RAIL_HEIGHT,
  MUSHROOM_SLAB_THICKNESS,
  MUSHROOM_STAIR_OPENING_MARGIN,
  MUSHROOM_STAIR_WIDTH,
  scaleMushroomInteriorPoint
} from "../src/villa-map/mushroom-interior-config.js";
import {
  FURNITURE_PLACEMENTS,
  MUSHROOM_LOFT_BED_POSITION,
  MUSHROOM_LOFT_BED_TOP_Y
} from "../src/villa-map/furniture-placements.js";
import { PORKY_PLACEMENTS } from "../src/villa-map/placements.js";

// A few signature anchors pin the normalized-to-world migration without
// mirroring the full intentionally-dense placement inventory in the test.
const MUSHROOM_SIGNATURE_BASELINE = {
  "m1-table": [-7.4, 0, 17.2, 1.9],
  "m1-entry-mat": [-6.0, 0, 22.1, 2.0],
  "m2-sofa": [-6.0, 1, 14.75, 1.55],
  "m2-study-desk": [-1.9, 1, 18.0, 1.65],
  "m3-bed": [-4.8, 2, 15.4, 1.55],
  "m3-vanity": [-2.45, 2, 20.1, 1.55]
};

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

test("the pocket interior is 4x while the exterior mushroom stays unchanged", () => {
  const world = createVillaWorld();
  assert.equal(MUSHROOM_INTERIOR.scale, MUSHROOM_INTERIOR_SCALE);
  assert.equal(MUSHROOM_INTERIOR.scale, 4);
  assert.equal(MUSHROOM_INTERIOR.furnitureScale, MUSHROOM_FURNITURE_SCALE);
  assert.equal(MUSHROOM_INTERIOR.furnitureScale, 0.8);

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
  const fp = MUSHROOM_INTERIOR.footprint;

  // The centre stays open; probes just inside each scaled inner face hit a
  // perimeter wall.
  assert.equal(collidesWithWorld({ ...MUSHROOM_INTERIOR.center, y: l1 }, world), false);
  assert.equal(collidesWithWorld({ x: fp.minX + 0.2, y: l1, z: MUSHROOM_INTERIOR.center.z }, world), true);
  assert.equal(collidesWithWorld({ x: fp.maxX - 0.2, y: l1, z: MUSHROOM_INTERIOR.center.z }, world), true);
  assert.equal(collidesWithWorld({ x: MUSHROOM_INTERIOR.center.x, y: l1, z: fp.minZ + 0.2 }, world), true);
  assert.equal(collidesWithWorld({ x: MUSHROOM_INTERIOR.center.x, y: l1, z: fp.maxZ - 0.2 }, world), true);

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
    assert.deepEqual(roomsById.get(id)?.size, { x: 32, z: 32 });
  }
});

// ── Interior furniture data ────────────────────────────────────────────────

test("all three interior levels are furnished from the vendored Kenney kit", () => {
  const byRoom = (room) => FURNITURE_PLACEMENTS.filter((p) => p.room === room);

  const hearth = byRoom("mushroom-hearth");
  const den = byRoom("mushroom-den");
  const loft = byRoom("mushroom-loft");
  assert.ok(hearth.length >= 36, "hearth under-furnished");
  assert.ok(den.length >= 36, "den under-furnished");
  assert.ok(loft.length >= 36, "loft under-furnished");

  // Floor indices drive Y-scoped colliders: 2/3/4 bottom-up.
  hearth.forEach((p) => assert.equal(p.floor, 2, `${p.id} floor`));
  den.forEach((p) => assert.equal(p.floor, 3, `${p.id} floor`));
  loft.forEach((p) => assert.equal(p.floor, 4, `${p.id} floor`));

  // Signature pieces per storey: dining table, sofa, bed.
  assert.ok(hearth.some((p) => p.model === "table"), "hearth needs its table");
  assert.ok(den.some((p) => p.model === "loungeSofaLong"), "den needs its sofa");
  assert.ok(loft.some((p) => p.model === "bedDouble"), "loft needs its bed");

  // Every piece sits inside the expanded tower footprint, clear of its own
  // level's scaled stairwell hole.
  const fp = MUSHROOM_INTERIOR.footprint;
  const stairA = createVillaWorld().stairs.find((stair) => stair.id === "mushroom-stairs-a");
  const stairB = createVillaWorld().stairs.find((stair) => stair.id === "mushroom-stairs-b");
  const stairwell = (stair) => ({
    minX: stair.minX - MUSHROOM_STAIR_OPENING_MARGIN,
    maxX: stair.maxX + MUSHROOM_STAIR_OPENING_MARGIN,
    minZ: scaleMushroomInteriorPoint(0, 16.5).z,
    maxZ: scaleMushroomInteriorPoint(0, 21.4).z
  });
  const holes = { 3: stairwell(stairA), 4: stairwell(stairB) };
  [...hearth, ...den, ...loft].forEach((p) => {
    const [x, , z] = p.position;
    assert.ok(x > fp.minX && x < fp.maxX, `${p.id} x inside tower`);
    assert.ok(z > fp.minZ && z < fp.maxZ, `${p.id} z inside tower`);
    const hole = holes[p.floor];
    if (hole) {
      const half = Math.max(p.footprint.x, p.footprint.z) / 2;
      const overlaps =
        x + half > hole.minX &&
        x - half < hole.maxX &&
        z + half > hole.minZ &&
        z - half < hole.maxZ;
      assert.equal(overlaps, false, `${p.id} overlaps its level's stairwell hole`);
    }
  });
});

test("signature mushroom furniture anchors expand 4x and scale to 0.8x", () => {
  const byId = new Map(FURNITURE_PLACEMENTS.map((piece) => [piece.id, piece]));

  for (const [id, baseline] of Object.entries(MUSHROOM_SIGNATURE_BASELINE)) {
    const piece = byId.get(id);
    assert.ok(piece, `missing signature piece ${id}`);
    const [oldX, level, oldZ, oldScale, oldYOffset = 0] = baseline;
    const expectedXZ = scaleMushroomInteriorPoint(oldX, oldZ);

    assert.ok(nearlyEqual(piece.position[0], expectedXZ.x), `${piece.id} x migrates 4x`);
    assert.ok(nearlyEqual(piece.position[2], expectedXZ.z), `${piece.id} z migrates 4x`);
    assert.ok(
      nearlyEqual(
        piece.position[1],
        MUSHROOM_INTERIOR.floorY[level] + 0.05 + oldYOffset * MUSHROOM_FURNITURE_SCALE
      ),
      `${piece.id} y follows its new floor`
    );
    assert.ok(
      nearlyEqual(piece.scale, oldScale * MUSHROOM_FURNITURE_SCALE),
      `${piece.id} scale becomes 0.8x`
    );
  }
});

test("the sleepy loft pig rests on the measured top of the Kenney bed", () => {
  const bed = FURNITURE_PLACEMENTS.find((piece) => piece.id === "m3-bed");
  const sleeper = PORKY_PLACEMENTS.find((piece) => piece.id === "meshy-sleepy-loft");
  assert.ok(bed && sleeper);
  assert.equal(sleeper.onFurnitureId, bed.id);
  assert.deepEqual(bed.position, MUSHROOM_LOFT_BED_POSITION);
  assert.equal(sleeper.position[0], bed.position[0]);
  assert.equal(sleeper.position[2], bed.position[2]);
  assert.ok(nearlyEqual(sleeper.position[1], MUSHROOM_LOFT_BED_TOP_Y + 0.02));
  const supportHeight = sleeper.position[1] - MUSHROOM_INTERIOR.floorY[2];
  assert.ok(supportHeight > 0.7 && supportHeight < 0.85);
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
  assert.ok(byName("mushroom-interior-soil"), "soil surround missing");

  // Both slabs keep their authored local coordinates while the parent scale
  // moves their effective tops to world-relative 16 m and 32 m.
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
    "L2 slab top is 16 m above L1 after scaling"
  );
  assert.ok(
    nearlyEqual(
      (l3.position.y + localSlabThickness) * interior.scale.y,
      MUSHROOM_INTERIOR.levelHeight * 2
    ),
    "L3 slab top is 32 m above L1 after scaling"
  );
  assert.ok(
    nearlyEqual(
      l2.geometry.parameters.options.depth * interior.scale.y,
      MUSHROOM_SLAB_THICKNESS
    ),
    "slab stays 35 cm thick instead of inheriting the 4x room scale"
  );
  // Each upper slab is cut by exactly one stairwell hole.
  assert.equal(l2.geometry.parameters.shapes.holes.length, 1);
  assert.equal(l3.geometry.parameters.shapes.holes.length, 1);
  const openingPoints = l2.geometry.parameters.shapes.holes[0].getPoints();
  const openingXs = openingPoints.map((point) => point.x);
  assert.ok(
    nearlyEqual(
      (Math.max(...openingXs) - Math.min(...openingXs)) * interior.scale.x,
      MUSHROOM_STAIR_WIDTH + MUSHROOM_STAIR_OPENING_MARGIN * 2
    ),
    "stair opening keeps comfortable clearance around the normal-width flight"
  );
  for (const side of ["west", "east", "south", "north"]) {
    assert.ok(byName(`mushroom-interior-slab-l2-reveal-${side}`), `${side} reveal missing`);
  }

  // The enlarged flights use 40 smaller risers each, keeping each world-space
  // step near the original player-friendly height while spanning 16 m.
  const steps = [];
  interior.traverse((child) => {
    if (/mushroom-interior-stair-[ab]-step-/.test(child.name)) steps.push(child);
  });
  const stepsPerFlight = 10 * MUSHROOM_INTERIOR_SCALE;
  assert.equal(steps.length, stepsPerFlight * 2);
  const aFirst = byName("mushroom-interior-stair-a-step-0");
  assert.ok(aFirst);
  assert.ok(
    nearlyEqual(aFirst.geometry.parameters.width * interior.scale.x, MUSHROOM_STAIR_WIDTH),
    "stair width stays at 2.4 m instead of inheriting the 4x room scale"
  );
  assert.ok(
    nearlyEqual(
      aFirst.geometry.parameters.depth * interior.scale.z,
      4.4 / stepsPerFlight * MUSHROOM_INTERIOR_SCALE
    ),
    "each tread stays pig/player scale"
  );
  assert.ok(
    nearlyEqual(aFirst.geometry.parameters.height * interior.scale.y, 0.4),
    "each riser stays 0.4 m high"
  );
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
  interior.traverse((child) => {
    if (child.name.startsWith("mushroom-interior-window-")) windows.push(child);
  });
  assert.ok(windows.length >= 12, "expected portholes on all storeys");
});
