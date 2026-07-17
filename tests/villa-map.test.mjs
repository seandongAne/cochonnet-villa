import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import site from "../content/site.json" with { type: "json" };
import { renderSite } from "../src/render-site.js";
import { createMaterials, createMushroomHouse, createPorky, createTieredHotSprings } from "../src/villa-map/assets.js";
import { createExplorerControls } from "../src/villa-map/controls.js";
import { PORKY_MODEL_VARIANTS } from "../src/villa-map/porky-models.js";
import { PORKY_PLACEMENTS } from "../src/villa-map/placements.js";
import { FURNITURE_BASE_SCALE } from "../src/villa-map/furniture-models.js";
import { FURNITURE_PLACEMENTS } from "../src/villa-map/furniture-placements.js";
import { collidesWithWorld, createVillaWorld, findStairZone, findWaterZone, isOnUpperFloor } from "../src/villa-map/world.js";
import { findNearestInteraction } from "../src/villa-map/interaction.js";

test("homepage exposes a dedicated villa map CTA", () => {
  const html = renderSite(site);

  assert.match(html, /href="\/villa-map\/"/);
  assert.match(html, /Explore the Villa Map/);
  assert.match(html, /data-i18n="hero.mapCtaLabel"/);
  assert.match(html, /class="scene-house scene-house-link"/);
  assert.match(html, /aria-label="Explore the Villa Map"/);
});

test("villa map world defines the expanded villa grounds with multi-floor rooms", () => {
  const world = createVillaWorld();

  assert.deepEqual(
    world.rooms.map((room) => room.id),
    [
      "courtyard",
      "main-villa",
      "entry-foyer",
      "great-hall-west",
      "great-hall-east",
      "stair-vestibule",
      "master-bedroom",
      "study-loft",
      "lounge-balcony",
      "hot-springs",
      "mushroom-house",
      "mushroom-hearth",
      "mushroom-den",
      "mushroom-loft",
      "dog-house-view",
      "trees-view"
    ]
  );
  assert.ok(world.colliders.length >= 14);
  assert.ok(world.interactions.some((item) => item.id === "main-villa-entry"));
  assert.ok(world.interactions.some((item) => item.id === "hot-spring-terrace"));
  assert.ok(world.interactions.some((item) => item.id === "mushroom-house"));
  assert.ok(world.interactions.some((item) => item.id === "dog-house-view"));
  assert.ok(world.interactions.some((item) => item.id === "trees-view"));
  // Upstairs interactions exist with elevated Y so the interaction Y-filter
  // can distinguish ground vs. upper floor.
  ["master-bedroom", "study-loft", "lounge-balcony"].forEach((id) => {
    const item = world.interactions.find((entry) => entry.id === id);
    assert.ok(item, `missing upstairs interaction ${id}`);
    assert.ok(item.position.y > 6, `${id} should be at upper-floor height`);
  });
  assert.equal(world.player.start.x, 0);
  assert.equal(world.player.start.z, 18);
  // The perimeter fence is gone — the meadow beyond the old fence line is
  // walkable now; only the (much larger) world bounds stop the player.
  assert.equal(collidesWithWorld({ x: -30, z: 9 }, world), false);
  assert.equal(collidesWithWorld({ x: -45, z: 9 }, world), true);
  assert.equal(collidesWithWorld({ x: 0, z: 41.9 }, world), true);
  assert.equal(collidesWithWorld(world.player.start, world), false);
});

test("ground floor is open plan — the x=±3 foyer partitions are gone, upper-floor walls stay Y-scoped", () => {
  const world = createVillaWorld();
  // The foyer-pocket partition walls at x=±3 were removed for an open entry.
  // The east side (no furniture there) is now walkable where the wall stood.
  assert.equal(collidesWithWorld({ x: 3, y: 1.6, z: -5 }, world), false);
  assert.equal(collidesWithWorld({ x: 3, y: 1.6, z: -6 }, world), false);
  // The interior partitions that remain are upper-floor only and stay Y-scoped:
  // upper-bedroom-corner (x=-3, world z ∈ [-7,-6]) blocks at upper-floor height
  // but the same XZ is clear at ground level.
  assert.equal(collidesWithWorld({ x: -3, y: 8.05, z: -6.5 }, world), true);
  assert.equal(collidesWithWorld({ x: -3, y: 1.6, z: -6.5 }, world), false);
});

test("villa stair zone interpolates camera target Y from ground to upper floor", () => {
  const world = createVillaWorld();
  const stair = world.stairs[0];
  // At south end (entry) the player is at ground level.
  assert.ok(findStairZone({ x: 0, y: 1.6, z: stair.maxZ }, world));
  // At north end (exit) we are inside the upper floor.
  assert.ok(findStairZone({ x: 0, y: 1.6, z: stair.minZ }, world));
  // Outside the zone (way south of the stair) we are not in the zone.
  assert.equal(findStairZone({ x: 0, y: 1.6, z: stair.maxZ + 2 }, world), null);
});

test("upper-floor footprint is reachable and isOnUpperFloor recognizes it", () => {
  const world = createVillaWorld();
  // A point standing on the upper-floor master bedroom (y > 5.6) is on upper.
  assert.equal(isOnUpperFloor({ x: -5.5, y: 8.05, z: -11 }, world), true);
  // The same XZ at ground level (y = 1.6) is NOT considered upstairs.
  assert.equal(isOnUpperFloor({ x: -5.5, y: 1.6, z: -11 }, world), false);
  // Outside the upper-floor slab footprint returns false.
  assert.equal(isOnUpperFloor({ x: 0, y: 8.05, z: -22 }, world), false);
  // The master-bedroom south corner is collidable at upper-floor height —
  // upper-bedroom-corner covers world z range [-7, -6] at x = -3.
  assert.equal(collidesWithWorld({ x: -3, y: 8.05, z: -6.5 }, world), true);
  // The grand bed now fills the north of the bedroom (Phase-3 furniture
  // colliders make solid pieces block), but the foot-of-bed strip stays
  // walkable and the bedroom hotspot is reachable from there.
  assert.equal(collidesWithWorld({ x: -5.5, y: 8.05, z: -8.5 }, world), false);
  // The bed itself is solid — you walk up to it, not through it.
  assert.equal(collidesWithWorld({ x: -5.5, y: 8.05, z: -12 }, world), true);
  // The stair descent corridor (the centre line between the rails) stays open
  // top-to-bottom. Phase-3 furniture flanks the upper-floor plaza — a nightstand
  // to the west, the study reading-chair to the east — but never intrudes on the
  // descent itself.
  assert.equal(collidesWithWorld({ x: 0, y: 8.05, z: -13 }, world), false);
  assert.equal(collidesWithWorld({ x: 0, y: 8.05, z: -10 }, world), false);
});

test("interaction Y-filter keeps upstairs hotspots from triggering on ground floor", () => {
  const world = createVillaWorld();
  // Stand inside the great-hall-west room at ground level (y = 1.6).
  const groundPos = { x: -7, y: 1.6, z: -10 };
  const groundNearest = findNearestInteraction(world.interactions, groundPos);
  assert.equal(groundNearest?.id, "great-hall-west");

  // Stand at the same XZ but at upper-floor height — the ground-floor hall
  // hotspot must NOT fire (filtered by the 2.0 Y tolerance).
  const upperPos = { x: -7, y: 8.05, z: -10 };
  const upperNearest = findNearestInteraction(world.interactions, upperPos);
  assert.notEqual(upperNearest?.id, "great-hall-west");
});

test("dog house interaction uses the requested settlement warning", () => {
  const world = createVillaWorld();
  const dogHouse = world.interactions.find((item) => item.id === "dog-house-view");

  assert.ok(dogHouse);
  assert.equal(dogHouse.body, "不呆不呆猪定居点，禁止猪养猪！");
});

test("villa map world defines tiered hot spring shallow water and step zones", () => {
  const world = createVillaWorld();

  assert.equal(world.hotSprings.pools.length, 3);
  assert.deepEqual(
    world.hotSprings.pools.map((pool) => pool.id),
    ["upper-spring", "middle-spring", "lower-spring"]
  );
  assert.ok(world.hotSprings.pools[0].elevation > world.hotSprings.pools[1].elevation);
  assert.ok(world.hotSprings.pools[1].elevation > world.hotSprings.pools[2].elevation);
  assert.equal(world.hotSprings.steps.some((step) => step.id === "spring-entry-steps"), true);
  assert.equal(world.waterZones.length, 3);
  world.waterZones.forEach((zone) => {
    assert.ok(zone.speedMultiplier < 1);
    assert.ok(zone.cameraY < world.player.start.y);
    assert.equal(findWaterZone(zone.center, world)?.id, zone.id);
  });
});

// Shared scaffolding for the fallback (no pointer lock) control tests: a mock
// document/canvas listener registry plus a camera that records rotations.
function createControlsHarness({ requestPointerLock = () => {} } = {}) {
  const documentListeners = new Map();
  const canvasListeners = new Map();
  const previousDocument = globalThis.document;
  globalThis.document = {
    pointerLockElement: null,
    addEventListener(type, handler) {
      documentListeners.set(type, handler);
    },
    removeEventListener(type) {
      documentListeners.delete(type);
    }
  };

  const camera = {
    position: {
      set() {},
      copy() {
        return this;
      }
    },
    rotation: {
      order: "",
      x: 0,
      y: 0,
      z: 0,
      set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
      }
    }
  };
  const canvas = {
    requestPointerLock,
    addEventListener(type, handler) {
      canvasListeners.set(type, handler);
    },
    removeEventListener(type) {
      canvasListeners.delete(type);
    }
  };
  const controls = createExplorerControls({
    camera,
    canvas,
    world: createVillaWorld()
  });

  return {
    camera,
    controls,
    documentListeners,
    canvasListeners,
    restore() {
      controls.dispose();
      globalThis.document = previousDocument;
    }
  };
}

test("without pointer lock, free mouse movement does NOT rotate the camera", () => {
  // The old fallback rotated on any mousemove, which let the visible OS cursor
  // drift outside the map while the view spun — mis-clicking other UI. Now
  // rotation without pointer lock requires an explicit drag.
  const h = createControlsHarness();

  h.controls.lock();
  h.documentListeners.get("mousemove")({ movementX: 100, movementY: -40 });
  const { x, y } = h.camera.rotation;
  h.restore();

  assert.equal(y, 0);
  assert.equal(x, 0);
});

test("without pointer lock, dragging on the canvas rotates and releasing stops", () => {
  const h = createControlsHarness();

  h.controls.lock();
  h.canvasListeners.get("mousedown")({ button: 0 });
  h.documentListeners.get("mousemove")({ movementX: 100, movementY: -40 });
  const draggedY = h.camera.rotation.y;
  const draggedX = h.camera.rotation.x;

  h.documentListeners.get("mouseup")({});
  h.documentListeners.get("mousemove")({ movementX: 100, movementY: -40 });
  const afterReleaseY = h.camera.rotation.y;
  h.restore();

  assert.notEqual(draggedY, 0);
  assert.notEqual(draggedX, 0);
  assert.equal(afterReleaseY, draggedY);
});

test("drag-look keeps working when pointer lock throws", () => {
  const h = createControlsHarness({
    requestPointerLock() {
      throw new DOMException("blocked", "SecurityError");
    }
  });

  assert.doesNotThrow(() => h.controls.lock());
  h.canvasListeners.get("mousedown")({ button: 0 });
  h.documentListeners.get("mousemove")({ movementX: 80, movementY: 0 });
  const y = h.camera.rotation.y;
  h.restore();

  assert.notEqual(y, 0);
});

test("a canvas press alone starts the exploring session and drag-look", () => {
  const h = createControlsHarness();

  h.canvasListeners.get("mousedown")({ button: 0 });
  h.documentListeners.get("mousemove")({ movementX: 60, movementY: 0 });
  const y = h.camera.rotation.y;
  const exploring = h.controls.isLocked;
  h.restore();

  assert.notEqual(y, 0);
  assert.equal(exploring, true);
});

test("explorer controls lower camera and slow movement in shallow hot spring water", () => {
  const documentListeners = new Map();
  const canvasListeners = new Map();
  const previousDocument = globalThis.document;
  globalThis.document = {
    pointerLockElement: null,
    addEventListener(type, handler) {
      documentListeners.set(type, handler);
    },
    removeEventListener(type) {
      documentListeners.delete(type);
    }
  };

  const world = createVillaWorld();
  const waterZone = world.waterZones[0];
  const camera = {
    position: new THREE.Vector3(),
    rotation: {
      order: "",
      set() {}
    }
  };
  const canvas = {
    requestPointerLock() {},
    addEventListener(type, handler) {
      canvasListeners.set(type, handler);
    },
    removeEventListener(type) {
      canvasListeners.delete(type);
    }
  };
  const controls = createExplorerControls({ camera, canvas, world });

  camera.position.set(waterZone.center.x, world.player.start.y, waterZone.center.z);
  documentListeners.get("keydown")({ code: "KeyD", preventDefault() {} });
  controls.update(0.25);
  const shallowDistance = camera.position.x - waterZone.center.x;
  const shallowHeight = camera.position.y;

  camera.position.set(0, shallowHeight, 18);
  controls.update(0.25);
  const dryDistance = camera.position.x;
  controls.dispose();
  globalThis.document = previousDocument;

  assert.ok(shallowHeight < world.player.start.y);
  assert.ok(camera.position.y > shallowHeight);
  assert.ok(shallowDistance < dryDistance);
});

test("mushroom house windows are thin and flush with the front wall", () => {
  const house = createMushroomHouse(createMaterials());
  const windows = house.children.filter((child) => child.name.startsWith("mushroom-window-"));

  assert.equal(windows.length, 2);
  windows.forEach((window) => {
    assert.ok(window.geometry.parameters.depth <= 0.05);
    assert.ok(window.position.z > -1.5);
    assert.ok(window.position.z < -1.43);
  });
});

test("porky face has prominent eyes, snout, nostrils, and smile", () => {
  const porky = createPorky(createMaterials());
  const eyes = porky.children.filter((child) => child.name.startsWith("porky-eye-sclera-"));
  const irises = porky.children.filter((child) => child.name.startsWith("porky-eye-iris-"));
  const nostrils = porky.children.filter((child) => child.name.startsWith("porky-nostril-"));
  const snout = porky.getObjectByName("porky-snout-pad");
  const smile = porky.getObjectByName("porky-smile");

  assert.equal(eyes.length, 2);
  assert.equal(irises.length, 2);
  assert.equal(nostrils.length, 2);
  assert.ok(snout);
  assert.ok(smile);
  eyes.forEach((eye) => {
    assert.ok(eye.geometry.parameters.radius >= 0.17);
    assert.ok(eye.position.z < -1.12);
  });
  irises.forEach((iris) => {
    assert.ok(iris.position.z < -1.18);
  });
  assert.ok(snout.position.z < -1.18);
});

test("tiered hot springs geometry has raised platform, steps, and lowered water", () => {
  const springs = createTieredHotSprings(createMaterials());
  const waterMeshes = [];
  const visibleWaterMeshes = [];
  const stepMeshes = [];
  const wallMeshes = [];
  const platformMeshes = [];
  const hotSpringBoxes = [];

  springs.traverse((child) => {
    if (child.name.startsWith("hot-spring-water-")) waterMeshes.push(child);
    if (child.name.startsWith("hot-spring-visible-water-")) visibleWaterMeshes.push(child);
    if (child.name.startsWith("hot-spring-step-")) stepMeshes.push(child);
    if (child.name.startsWith("hot-spring-rock-wall-")) wallMeshes.push(child);
    if (child.name.startsWith("hot-spring-stone-terrace-") && child.geometry?.type === "BoxGeometry") {
      platformMeshes.push(child);
    }
    if (child.name.startsWith("hot-spring-") && child.geometry?.type === "BoxGeometry") {
      hotSpringBoxes.push(child);
    }
  });

  assert.equal(waterMeshes.length, 3);
  assert.equal(visibleWaterMeshes.length, 3);
  assert.ok(platformMeshes.length >= 3);
  assert.ok(stepMeshes.length >= 4);
  assert.ok(wallMeshes.length >= 3);
  assert.equal(springs.getObjectByName("hot-spring-stone-terrace"), undefined);
  hotSpringBoxes.forEach((box) => {
    assert.ok(box.geometry.parameters.width <= 4.5 || box.geometry.parameters.depth <= 8);
  });
  waterMeshes.forEach((water) => {
    assert.equal(water.geometry.type, "CircleGeometry");
    assert.equal(water.material.transparent, true);
    assert.ok(water.material.opacity >= 0.9);
    assert.equal(water.material.depthWrite, false);
    assert.ok(water.position.y < Math.max(...platformMeshes.map((platform) => platform.position.y)));
  });
  visibleWaterMeshes.forEach((visibleWater) => {
    const poolId = visibleWater.name.replace("hot-spring-visible-water-", "");
    const baseWater = waterMeshes.find((water) => water.name === `hot-spring-water-${poolId}`);
    assert.ok(baseWater);
    assert.equal(visibleWater.geometry.type, "CircleGeometry");
    assert.ok(visibleWater.position.y >= baseWater.position.y + 0.16);
    assert.ok(visibleWater.material.opacity >= 0.96);
    assert.equal(visibleWater.material.depthTest, true);
  });
  assert.ok(stepMeshes.some((step) => step.position.y > waterMeshes[2].position.y));
  wallMeshes.forEach((wall) => {
    const poolId = wall.name.replace("hot-spring-rock-wall-", "");
    const water = waterMeshes.find((mesh) => mesh.name === `hot-spring-water-${poolId}`);
    assert.ok(water);
    assert.ok(wall.position.y > water.position.y);
  });
});

test("villa map exposes the four commercial GLB porky model variants", () => {
  assert.deepEqual(
    Object.keys(PORKY_MODEL_VARIANTS).sort(),
    ["big-ear-piglet", "daigua", "guadai", "wild-piglet"]
  );

  Object.values(PORKY_MODEL_VARIANTS).forEach((variant) => {
    assert.match(variant.url, /^\/models\/porkies\/.+\.glb$/);
    assert.equal(typeof variant.height, "number");
    assert.ok(variant.height > 0.6);
    assert.ok(variant.height < 2.2);
  });
});

test("villa scene places at least six GLB-backed porkies in the map", () => {
  assert.ok(PORKY_PLACEMENTS.length >= 6);
  // Every placement must reference a real GLB variant so the Scene mounts a
  // commercial model (with procedural fallback), not a bare primitive.
  PORKY_PLACEMENTS.forEach((placement) => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(PORKY_MODEL_VARIANTS, placement.variant),
      `unknown porky variant: ${placement.variant}`
    );
  });
});

test("foreground porkies face the entry path so facial features are visible", () => {
  // The two porkies in the entry plaza must face roughly south (+Z, rotationY
  // ≈ Math.PI) so a player walking in from the gate sees their sculpted faces.
  const facingEntry = (id) => {
    const placement = PORKY_PLACEMENTS.find((entry) => entry.id === id);
    assert.ok(placement, `missing placement: ${id}`);
    assert.ok(
      Math.abs(placement.rotationY - Math.PI) < 0.5,
      `${id} should face the entry (rotationY ≈ π), got ${placement.rotationY}`
    );
  };

  facingEntry("guaguazhu");
  facingEntry("porch");
});

test("furniture placements reference vendored CC0 GLBs within the world bounds", () => {
  const world = createVillaWorld();
  const roomIds = new Set(world.rooms.map((room) => room.id));

  assert.ok(FURNITURE_PLACEMENTS.length >= 1);
  assert.ok(FURNITURE_BASE_SCALE > 1);

  // Every id is unique so React keys / scene mounting stay stable.
  const ids = FURNITURE_PLACEMENTS.map((piece) => piece.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate furniture id");

  FURNITURE_PLACEMENTS.forEach((piece) => {
    assert.ok(roomIds.has(piece.room), `unknown furniture room: ${piece.room}`);
    assert.match(piece.url, /^\/models\/furniture\/.+\.glb$/);

    // The GLB the scene will fetch must actually be vendored in public/.
    const filePath = fileURLToPath(new URL(`../public${piece.url}`, import.meta.url));
    assert.ok(existsSync(filePath), `missing GLB file: ${piece.url}`);

    // Positions live inside the playable world AABB. (The mushroom-house
    // interior levels are a buried pocket, so Y may go as low as its L1 slab.)
    const [x, y, z] = piece.position;
    assert.ok(x > world.bounds.minX && x < world.bounds.maxX, `${piece.id} x out of bounds`);
    assert.ok(z > world.bounds.minZ && z < world.bounds.maxZ, `${piece.id} z out of bounds`);
    assert.ok(y >= -41, `${piece.id} should sit at/above its floor`);

    assert.equal(typeof piece.rotationY, "number");
  });
});

test("the west great hall is furnished with multiple GLB props (Phase 2 room)", () => {
  const westPieces = FURNITURE_PLACEMENTS.filter((piece) => piece.room === "great-hall-west");
  assert.ok(westPieces.length >= 4, "west hall should have a furnished living-room set");
  // The seating group needs at least a sofa and a rug to read as a living room.
  assert.ok(westPieces.some((piece) => /loungeSofa/.test(piece.url)), "missing sofa");
  assert.ok(westPieces.some((piece) => /rug/.test(piece.url)), "missing rug");
});
