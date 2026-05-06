import assert from "node:assert/strict";
import { test } from "node:test";

import site from "../content/site.json" with { type: "json" };
import { renderSite } from "../src/render-site.js";
import { createMaterials, createMushroomHouse } from "../src/villa-map/assets.js";
import { createExplorerControls } from "../src/villa-map/controls.js";
import { collidesWithWorld, createVillaWorld } from "../src/villa-map/world.js";

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
  assert.equal(collidesWithWorld({ x: -23, z: 9 }, world), true);
  assert.equal(collidesWithWorld(world.player.start, world), false);
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
