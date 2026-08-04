import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import {
  createExplorerControls,
  EXPLORER_HIDDEN_ACTIONS,
  isTypingTarget
} from "../src/villa-map/controls.js";
import { isInteractionTargeted } from "../src/villa-map/interaction.js";
import {
  MUSHROOM_OBSERVATORY_SWITCH_INTERACTION_ID
} from "../src/villa-map/mushroom-interior.js";
import {
  MUSHROOM_INTERIOR,
  createVillaWorld
} from "../src/villa-map/world.js";

function createKeyboardHarness({ onAction, onHiddenAction } = {}) {
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

  const camera = new THREE.PerspectiveCamera();
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
    world: createVillaWorld(),
    onAction,
    onHiddenAction
  });

  return {
    camera,
    controls,
    keydown: documentListeners.get("keydown"),
    keyup: documentListeners.get("keyup"),
    restore() {
      controls.dispose();
      globalThis.document = previousDocument;
    }
  };
}

test("a modal can suspend explorer movement and actions without rebuilding controls", () => {
  const actions = [];
  let eActions = 0;
  const harness = createKeyboardHarness({
    onAction() {
      eActions += 1;
    },
    onHiddenAction(action) {
      actions.push(action);
    }
  });
  harness.controls.lock();
  harness.keydown({ code: "KeyW", preventDefault() {} });
  harness.controls.setEnabled(false);

  const pausedPosition = harness.camera.position.clone();
  harness.controls.update(0.25);
  harness.keydown({ code: "KeyE", repeat: false });
  harness.keydown({ code: "KeyR", repeat: false, preventDefault() {} });

  assert.deepEqual(harness.camera.position.toArray(), pausedPosition.toArray());
  assert.equal(eActions, 0);
  assert.deepEqual(actions, []);

  harness.controls.setEnabled(true);
  harness.keydown({ code: "KeyE", repeat: false });
  harness.keydown({ code: "KeyR", repeat: false, preventDefault() {} });
  harness.restore();

  assert.equal(eActions, 1);
  assert.deepEqual(actions, ["rift"]);
});

test("R/F emit semantic hidden actions only during an active exploration session", () => {
  const actions = [];
  const harness = createKeyboardHarness({
    onHiddenAction(action) {
      actions.push(action);
    }
  });

  harness.keydown({ code: "KeyR", repeat: false });
  assert.deepEqual(actions, [], "inactive controls must ignore the hidden shortcut");

  harness.controls.lock();
  harness.keydown({ code: "KeyR", repeat: false, preventDefault() {} });
  harness.keydown({ code: "KeyF", repeat: false, preventDefault() {} });
  harness.keydown({ code: "KeyR", repeat: true, preventDefault() {} });
  harness.keydown({ code: "KeyR", repeat: false, ctrlKey: true, preventDefault() {} });
  harness.keydown({ code: "KeyF", repeat: false, metaKey: true, preventDefault() {} });
  harness.keydown({ code: "KeyF", repeat: false, altKey: true, preventDefault() {} });
  harness.restore();

  assert.deepEqual(EXPLORER_HIDDEN_ACTIONS, { KeyR: "rift", KeyF: "lens" });
  assert.deepEqual(actions, ["rift", "lens"]);
});

test("hidden shortcuts leave typing targets alone while preserving E behavior", () => {
  const hiddenActions = [];
  let eActions = 0;
  const harness = createKeyboardHarness({
    onAction() {
      eActions += 1;
    },
    onHiddenAction(action) {
      hiddenActions.push(action);
    }
  });
  harness.controls.lock();

  const input = { tagName: "INPUT" };
  const textarea = { tagName: "textarea" };
  const editable = { tagName: "DIV", isContentEditable: true };
  const textbox = { tagName: "DIV", getAttribute: (name) => name === "role" ? "textbox" : null };
  for (const target of [input, textarea, editable, textbox]) {
    harness.keydown({ code: "KeyR", repeat: false, target, preventDefault() {} });
    harness.keydown({ code: "KeyF", repeat: false, target, preventDefault() {} });
  }

  // E deliberately retains its existing action semantics.
  harness.keydown({ code: "KeyE", repeat: false, target: input });
  harness.keydown({ code: "KeyE", repeat: true, target: input });
  harness.restore();

  assert.equal(isTypingTarget(input), true);
  assert.equal(isTypingTarget({ tagName: "CANVAS" }), false);
  assert.deepEqual(hiddenActions, []);
  assert.equal(eActions, 1);
});

test("physical targeting requires range, the correct floor, and a ray through the switch", () => {
  const switchTarget = {
    position: { x: 0, y: 1.5, z: -2 },
    radius: 2.6
  };
  const camera = { x: 0, y: 1.6, z: 0 };

  assert.equal(
    isInteractionTargeted(switchTarget, camera, { x: 0, y: -0.05, z: -1 }),
    true,
    "the camera ray should hit the centre of the physical target"
  );
  assert.equal(
    isInteractionTargeted(
      { ...switchTarget, position: { x: 0.33, y: 1.5, z: -2 } },
      camera,
      { x: 0, y: -0.05, z: -1 }
    ),
    false,
    "a look ray missing the 0.32 m switch target must not activate it"
  );
  assert.equal(
    isInteractionTargeted(
      { ...switchTarget, position: { x: 0, y: 1.5, z: -3 } },
      camera,
      { x: 0, y: -0.05, z: -1 }
    ),
    false,
    "the broad view ray must not bypass the interaction radius"
  );
  assert.equal(
    isInteractionTargeted(
      { ...switchTarget, position: { x: 0, y: 5, z: -2 } },
      camera,
      { x: 0, y: 0, z: -1 }
    ),
    false,
    "a switch on another floor must not activate"
  );
  assert.equal(
    isInteractionTargeted(switchTarget, camera, { x: 0, y: 0, z: 1 }),
    false,
    "the target must be in front of the camera"
  );
});

test("the real L3 switch is targetable from its walkable approach but never from L2", () => {
  const world = createVillaWorld();
  const lightSwitch = world.interactions.find(
    (interaction) => interaction.id === MUSHROOM_OBSERVATORY_SWITCH_INTERACTION_ID
  );
  const towardCentre = new THREE.Vector3(
    MUSHROOM_INTERIOR.center.x - lightSwitch.position.x,
    0,
    MUSHROOM_INTERIOR.center.z - lightSwitch.position.z
  ).normalize();
  const l3Camera = new THREE.Vector3(
    lightSwitch.position.x + towardCentre.x * 2,
    MUSHROOM_INTERIOR.eyeY[2],
    lightSwitch.position.z + towardCentre.z * 2
  );
  const lookAtSwitch = new THREE.Vector3(
    lightSwitch.position.x - l3Camera.x,
    lightSwitch.position.y - l3Camera.y,
    lightSwitch.position.z - l3Camera.z
  ).normalize();

  assert.equal(
    isInteractionTargeted(lightSwitch, l3Camera, lookAtSwitch),
    true
  );
  assert.equal(
    isInteractionTargeted(
      lightSwitch,
      { ...l3Camera, y: MUSHROOM_INTERIOR.eyeY[1] },
      lookAtSwitch
    ),
    false
  );
});

test("PlayerControls gates R/F on the L3 physical switch before exposing one callback", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/villa-map/react/PlayerControls.jsx", import.meta.url)),
    "utf8"
  );

  assert.match(source, /onObservatoryHiddenAction/);
  assert.match(source, /MUSHROOM_FLOOR_Y_RANGES\[4\]/);
  assert.match(source, /MUSHROOM_OBSERVATORY_SWITCH_INTERACTION_ID/);
  assert.match(source, /camera\.getWorldDirection\(aimDirectionRef\.current\)/);
  assert.match(source, /isInteractionTargeted\(/);
  // The hidden action reaches React through the ref bridge: the controls
  // factory must never be recreated (and the camera never reset) just
  // because a callback identity changed.
  assert.match(source, /onObservatoryHiddenActionRef\.current\?\.\(action\)/);
  assert.match(
    source,
    /\}, \[camera, gl, world, lockRef, wantLockRef\]\);/,
    "the controls-creation effect must depend only on stable inputs — a re-run teleports the player to the world start"
  );
});
