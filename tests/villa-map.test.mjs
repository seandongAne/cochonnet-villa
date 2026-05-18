import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";

import site from "../content/site.json" with { type: "json" };
import { renderSite } from "../src/render-site.js";
import { createMaterials, createMushroomHouse, createPorky, createTieredHotSprings } from "../src/villa-map/assets.js";
import { createExplorerControls } from "../src/villa-map/controls.js";
import { PORKY_MODEL_VARIANTS } from "../src/villa-map/porky-models.js";
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
  assert.equal(collidesWithWorld({ x: -30, z: 9 }, world), true);
  assert.equal(collidesWithWorld(world.player.start, world), false);
});

test("villa interior partitions block ground-floor only — upper floor stays open above them", () => {
  const world = createVillaWorld();
  // World (-3, -5) is the foyer-west-wall-b partition (minY=0, maxY=5.6). At
  // ground level (y=1.6) it collides; at upper-floor height (y=8) it does NOT
  // because z=-5 is south of the only upper-floor wall at x=-3 (the bedroom
  // corner covers z ∈ [-7, -6]).
  assert.equal(collidesWithWorld({ x: -3, y: 1.6, z: -5 }, world), true);
  assert.equal(collidesWithWorld({ x: -3, y: 8, z: -5 }, world), false);
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
  // But a point well inside the master bedroom is free.
  assert.equal(collidesWithWorld({ x: -5.5, y: 8.05, z: -11 }, world), false);
  // And the area around the stair hole is open on the upper floor — no
  // walls blocking the descent from any direction.
  assert.equal(collidesWithWorld({ x: -2.5, y: 8.05, z: -13 }, world), false);
  assert.equal(collidesWithWorld({ x: 2.5, y: 8.05, z: -13 }, world), false);
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

test("explorer controls rotate with mouse after start when pointer lock is unavailable", () => {
  const listeners = new Map();
  const previousDocument = globalThis.document;
  globalThis.document = {
    pointerLockElement: null,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
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
  const canvas = { requestPointerLock() {} };
  const controls = createExplorerControls({
    camera,
    canvas,
    world: createVillaWorld()
  });

  controls.lock();
  listeners.get("mousemove")({ movementX: 100, movementY: -40 });
  controls.dispose();
  globalThis.document = previousDocument;

  assert.notEqual(camera.rotation.y, 0);
  assert.notEqual(camera.rotation.x, 0);
});

test("explorer controls keep mouse fallback when pointer lock throws", () => {
  const listeners = new Map();
  const previousDocument = globalThis.document;
  globalThis.document = {
    pointerLockElement: null,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
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
      y: 0,
      set(_x, y) {
        this.y = y;
      }
    }
  };
  const canvas = {
    requestPointerLock() {
      throw new DOMException("blocked", "SecurityError");
    }
  };
  const controls = createExplorerControls({
    camera,
    canvas,
    world: createVillaWorld()
  });

  assert.doesNotThrow(() => controls.lock());
  listeners.get("mousemove")({ movementX: 80, movementY: 0 });
  controls.dispose();
  globalThis.document = previousDocument;

  assert.notEqual(camera.rotation.y, 0);
});

test("explorer controls can start mouse fallback from canvas press", () => {
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
      y: 0,
      set(_x, y) {
        this.y = y;
      }
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
  const controls = createExplorerControls({
    camera,
    canvas,
    world: createVillaWorld()
  });

  canvasListeners.get("mousedown")({ button: 0 });
  documentListeners.get("mousemove")({ movementX: 60, movementY: 0 });
  controls.dispose();
  globalThis.document = previousDocument;

  assert.notEqual(camera.rotation.y, 0);
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
  const sceneSource = readFileSync(new URL("../src/villa-map/scene.js", import.meta.url), "utf8");
  const porkyPlacements = sceneSource.match(/createPorkyModel\(materials/g) ?? [];

  assert.ok(porkyPlacements.length >= 6);
});

test("foreground porkies face the entry path so facial features are visible", () => {
  const sceneSource = readFileSync(new URL("../src/villa-map/scene.js", import.meta.url), "utf8");

  assert.match(sceneSource, /guagua\.rotation\.y = Math\.PI/);
  assert.match(sceneSource, /porchPiglet\.rotation\.y = Math\.PI/);
});
