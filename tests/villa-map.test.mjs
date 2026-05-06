import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";

import site from "../content/site.json" with { type: "json" };
import { renderSite } from "../src/render-site.js";
import { createMaterials, createMushroomHouse, createTieredHotSprings } from "../src/villa-map/assets.js";
import { createExplorerControls } from "../src/villa-map/controls.js";
import { collidesWithWorld, createVillaWorld, findWaterZone } from "../src/villa-map/world.js";

test("homepage exposes a dedicated villa map CTA", () => {
  const html = renderSite(site);

  assert.match(html, /href="\/villa-map\/"/);
  assert.match(html, /Explore the Villa Map/);
  assert.match(html, /data-i18n="hero.mapCtaLabel"/);
  assert.match(html, /class="scene-house scene-house-link"/);
  assert.match(html, /aria-label="Explore the Villa Map"/);
});

test("villa map world defines the expanded villa grounds", () => {
  const world = createVillaWorld();

  assert.deepEqual(
    world.rooms.map((room) => room.id),
    [
      "courtyard",
      "main-villa",
      "great-hall",
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
  assert.equal(world.player.start.x, 0);
  assert.equal(world.player.start.z, 18);
  assert.equal(collidesWithWorld({ x: -30, z: 9 }, world), true);
  assert.equal(collidesWithWorld(world.player.start, world), false);
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

test("tiered hot springs geometry has raised platform, steps, and lowered water", () => {
  const springs = createTieredHotSprings(createMaterials());
  const waterMeshes = [];
  const stepMeshes = [];
  const wallMeshes = [];
  const platformMeshes = [];
  const hotSpringBoxes = [];

  springs.traverse((child) => {
    if (child.name.startsWith("hot-spring-water-")) waterMeshes.push(child);
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
  assert.ok(stepMeshes.some((step) => step.position.y > waterMeshes[2].position.y));
  wallMeshes.forEach((wall) => {
    const poolId = wall.name.replace("hot-spring-rock-wall-", "");
    const water = waterMeshes.find((mesh) => mesh.name === `hot-spring-water-${poolId}`);
    assert.ok(water);
    assert.ok(wall.position.y > water.position.y);
  });
});
