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
import { FURNITURE_PLACEMENTS } from "../src/villa-map/furniture-placements.js";

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

  // Mid-flight XZ of stair A. Captured at interior depth, ignored outdoors.
  const stairAt = (y) => findStairZone({ x: -3.3, y, z: 19.5 }, world);
  assert.equal(stairAt(MUSHROOM_INTERIOR.eyeY[0])?.id, "mushroom-stairs-a");
  assert.equal(stairAt(1.6), null);

  const stairBt = (y) => findStairZone({ x: -8.7, y, z: 19.5 }, world);
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

  const stairB = world.stairs.find((s) => s.id === "mushroom-stairs-b");
  assert.ok(stairB);
  assert.equal(stairB.floorY, MUSHROOM_INTERIOR.eyeY[1]);
  assert.equal(stairB.upperY, MUSHROOM_INTERIOR.eyeY[2]);
});

test("interior walls contain the player; the courtyard above stays unaffected", () => {
  const world = createVillaWorld();
  const l1 = MUSHROOM_INTERIOR.eyeY[0];

  // Open floor south-west of the dining table is free at L1; pushing into a
  // perimeter wall blocks.
  assert.equal(collidesWithWorld({ x: -5.6, y: l1, z: 19.6 }, world), false);
  assert.equal(collidesWithWorld({ x: -10.2, y: l1, z: 18 }, world), true);
  assert.equal(collidesWithWorld({ x: -6, y: l1, z: 13.4 }, world), true);
  assert.equal(collidesWithWorld({ x: -6, y: l1, z: 22.3 }, world), true);

  // The mushroom house's GROUND collider still blocks the courtyard walker…
  assert.equal(collidesWithWorld({ x: -6, y: 1.6, z: 18 }, world), true);
  // …and the interior walls never leak up to the courtyard (a spot inside the
  // old fence-free meadow west of the house is walkable).
  assert.equal(collidesWithWorld({ x: -13, y: 1.6, z: 18 }, world), false);
});

test("stair flights stay enterable and guarded (rails, under-stair, rims)", () => {
  const world = createVillaWorld();
  const [l1, l2, l3] = MUSHROOM_INTERIOR.eyeY;

  // Bottom entry of flight A (south end) is open to an L1 player…
  assert.equal(collidesWithWorld({ x: -3.3, y: l1, z: 21.2 }, world), false);
  // …the corridor mid-flight is open on the centre line…
  assert.equal(collidesWithWorld({ x: -3.3, y: (l1 + l2) / 2, z: 18.8 }, world), false);
  // …but the sides are railed off mid-flight.
  assert.equal(collidesWithWorld({ x: -4.4, y: l1, z: 18.8 }, world), true);
  assert.equal(collidesWithWorld({ x: -2.2, y: l1, z: 18.8 }, world), true);
  // L1 players cannot wander under the solid top half of flight A.
  assert.equal(collidesWithWorld({ x: -3.3, y: l1, z: 17.0 }, world), true);
  // The L2 rim guard stops walking into the open stairwell from the south.
  assert.equal(collidesWithWorld({ x: -3.3, y: l2, z: 21.1 }, world), true);

  // Flight B mirrors the same rules one storey up.
  assert.equal(collidesWithWorld({ x: -8.7, y: l2, z: 21.2 }, world), false);
  assert.equal(collidesWithWorld({ x: -8.7, y: l2, z: 17.0 }, world), true);
  assert.equal(collidesWithWorld({ x: -8.7, y: l3, z: 21.1 }, world), true);
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

  assert.equal(roomsById.get("mushroom-hearth")?.floorY, -40);
  assert.equal(roomsById.get("mushroom-den")?.floorY, -36);
  assert.equal(roomsById.get("mushroom-loft")?.floorY, -32);
});

// ── Interior furniture data ────────────────────────────────────────────────

test("all three interior levels are furnished from the vendored Kenney kit", () => {
  const byRoom = (room) => FURNITURE_PLACEMENTS.filter((p) => p.room === room);

  const hearth = byRoom("mushroom-hearth");
  const den = byRoom("mushroom-den");
  const loft = byRoom("mushroom-loft");
  assert.ok(hearth.length >= 6, "hearth under-furnished");
  assert.ok(den.length >= 6, "den under-furnished");
  assert.ok(loft.length >= 6, "loft under-furnished");

  // Floor indices drive Y-scoped colliders: 2/3/4 bottom-up.
  hearth.forEach((p) => assert.equal(p.floor, 2, `${p.id} floor`));
  den.forEach((p) => assert.equal(p.floor, 3, `${p.id} floor`));
  loft.forEach((p) => assert.equal(p.floor, 4, `${p.id} floor`));

  // Signature pieces per storey: dining table, sofa, bed.
  assert.ok(hearth.some((p) => p.model === "table"), "hearth needs its table");
  assert.ok(den.some((p) => p.model === "loungeSofaLong"), "den needs its sofa");
  assert.ok(loft.some((p) => p.model === "bedDouble"), "loft needs its bed");

  // Every piece sits inside the tower footprint, clear of its stairwell hole.
  const fp = MUSHROOM_INTERIOR.footprint;
  const holes = { 3: { minX: -4.7, maxX: -1.9 }, 4: { minX: -10.1, maxX: -7.3 } };
  [...hearth, ...den, ...loft].forEach((p) => {
    const [x, , z] = p.position;
    assert.ok(x > fp.minX && x < fp.maxX, `${p.id} x inside tower`);
    assert.ok(z > fp.minZ && z < fp.maxZ, `${p.id} z inside tower`);
    const hole = holes[p.floor];
    if (hole && z > 16.5) {
      const half = Math.max(p.footprint.x, p.footprint.z) / 2;
      assert.ok(
        x + half < hole.minX || x - half > hole.maxX || z + half < 16.5,
        `${p.id} overlaps its level's stairwell hole`
      );
    }
  });
});

// ── Procedural factory (node-pure) ─────────────────────────────────────────

test("mushroom interior factory builds three storeys with stairs, dome and door", () => {
  const interior = createMushroomInterior(createMaterials());

  const byName = (name) => interior.getObjectByName(name);
  assert.ok(byName("mushroom-interior-wall"), "round wall missing");
  assert.ok(byName("mushroom-interior-dome"), "cap dome missing");
  assert.ok(byName("mushroom-interior-door"), "exit door missing");
  assert.ok(byName("mushroom-interior-soil"), "soil surround missing");

  // Both slabs exist and their TOPS land exactly on the storey heights the
  // world data assumes (local 4 and 8).
  const l2 = byName("mushroom-interior-slab-l2");
  const l3 = byName("mushroom-interior-slab-l3");
  assert.ok(l2 && l3, "upper slabs missing");
  assert.ok(Math.abs(l2.position.y + 0.35 - 4) < 1e-9, "L2 slab top at local 4");
  assert.ok(Math.abs(l3.position.y + 0.35 - 8) < 1e-9, "L3 slab top at local 8");
  // Each upper slab is cut by exactly one stairwell hole.
  assert.equal(l2.geometry.parameters.shapes.holes.length, 1);
  assert.equal(l3.geometry.parameters.shapes.holes.length, 1);

  // Two flights of 10 steps; flight A tops out flush with the L2 slab.
  const steps = [];
  interior.traverse((child) => {
    if (/mushroom-interior-stair-[ab]-step-/.test(child.name)) steps.push(child);
  });
  assert.equal(steps.length, 20);
  const aTop = byName("mushroom-interior-stair-a-step-9");
  assert.ok(aTop);
  const aTopSurface = aTop.position.y + aTop.geometry.parameters.height / 2;
  assert.ok(Math.abs(aTopSurface - 4) < 1e-9, "flight A top step flush with L2");
  const bTop = byName("mushroom-interior-stair-b-step-9");
  const bTopSurface = bTop.position.y + bTop.geometry.parameters.height / 2;
  assert.ok(Math.abs(bTopSurface - 8) < 1e-9, "flight B top step flush with L3");

  // Glowing portholes on every storey (the loft's "star ring" included).
  const windows = [];
  interior.traverse((child) => {
    if (child.name.startsWith("mushroom-interior-window-")) windows.push(child);
  });
  assert.ok(windows.length >= 12, "expected portholes on all storeys");
});
