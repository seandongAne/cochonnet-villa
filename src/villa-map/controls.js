import * as THREE from "three";
import { collidesWithWorld, findFloorZone, findStairZone, findWaterZone, isOnUpperFloor } from "./world.js";

const HALF_PI = Math.PI / 2;

export function createExplorerControls({ camera, canvas, world, onLockChange, onAction }) {
  const keys = new Set();
  const velocity = new THREE.Vector3();
  const candidate = new THREE.Vector3();
  let yaw = 0;
  let pitch = 0;
  let isLocked = false;
  // Fallback session for surfaces that reject Pointer Lock (embedded browsers,
  // some previews). While started-but-unlocked, the camera only rotates during
  // an explicit left-button DRAG on the canvas — never on free mouse movement —
  // so the visible OS cursor can't wander out of the map and mis-click other UI.
  let hasStarted = false;
  let isDragging = false;

  camera.position.set(world.player.start.x, world.player.start.y, world.player.start.z);
  camera.rotation.order = "YXZ";
  camera.rotation.set(pitch, yaw, 0);

  function lock() {
    hasStarted = true;
    onLockChange?.(true);

    try {
      canvas.requestPointerLock?.();
    } catch {
      // Pointer Lock rejected; the drag-look fallback stays active.
    }
  }

  function handlePointerLockChange() {
    isLocked = document.pointerLockElement === canvas;
    if (isLocked) {
      isDragging = false;
      hasStarted = true;
    } else {
      // Native pointer-lock exit (Esc) ends the whole exploring session.
      hasStarted = false;
      isDragging = false;
    }
    onLockChange?.(isLocked || hasStarted);
  }

  function handleMouseMove(event) {
    if (!isLocked && !(hasStarted && isDragging)) {
      return;
    }

    yaw -= event.movementX * 0.0022;
    pitch -= event.movementY * 0.0022;
    pitch = Math.max(-HALF_PI + 0.12, Math.min(HALF_PI - 0.12, pitch));
    camera.rotation.set(pitch, yaw, 0);
  }

  function handleKeyDown(event) {
    if (event.code === "Escape" && hasStarted && !isLocked) {
      hasStarted = false;
      isDragging = false;
      onLockChange?.(false);
      return;
    }

    if (event.code === "KeyE" && !event.repeat && (isLocked || hasStarted)) {
      onAction?.();
      return;
    }

    if (isMovementKey(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    }
  }

  function handleKeyUp(event) {
    keys.delete(event.code);
  }

  function handleCanvasMouseDown(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    if (isLocked) {
      return;
    }

    // Pressing the canvas both (re)starts the session and begins a look-drag.
    if (!hasStarted) {
      hasStarted = true;
      onLockChange?.(true);
    }
    isDragging = true;

    // A click is a user gesture — retry the real pointer lock while we drag.
    try {
      canvas.requestPointerLock?.();
    } catch {
      // Keep drag-look.
    }
  }

  function handleMouseUp() {
    isDragging = false;
  }

  // Instantly relocate the player (door/teleport transitions). Yaw is reset so
  // the arrival view faces where the destination intends.
  function teleport(position, yawAngle = 0) {
    camera.position.set(position.x, position.y, position.z);
    yaw = yawAngle;
    pitch = 0;
    camera.rotation.set(pitch, yaw, 0);
  }

  function update(delta) {
    const movementProfile = getMovementProfile(camera.position, world);
    applyCameraHeight(delta, movementProfile.cameraY);
    velocity.set(0, 0, 0);

    if (keys.has("KeyW") || keys.has("ArrowUp")) velocity.z -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) velocity.z += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) velocity.x -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) velocity.x += 1;

    if (velocity.lengthSq() === 0) {
      return;
    }

    velocity.normalize().multiplyScalar(world.player.speed * movementProfile.speedMultiplier * delta);
    velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    candidate.copy(camera.position);
    candidate.x += velocity.x;
    if (!collidesWithWorld(candidate, world)) {
      camera.position.x = candidate.x;
    }

    candidate.copy(camera.position);
    candidate.z += velocity.z;
    if (!collidesWithWorld(candidate, world)) {
      camera.position.z = candidate.z;
    }

    applyCameraHeight(delta, getMovementProfile(camera.position, world).cameraY);
  }

  function applyCameraHeight(delta, targetY) {
    const blend = Math.min(1, delta * 8);
    camera.position.y += (targetY - camera.position.y) * blend;
  }

  function dispose() {
    document.removeEventListener("pointerlockchange", handlePointerLockChange);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("keyup", handleKeyUp);
    canvas.removeEventListener?.("mousedown", handleCanvasMouseDown);
  }

  document.addEventListener("pointerlockchange", handlePointerLockChange);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  canvas.addEventListener?.("mousedown", handleCanvasMouseDown);

  return {
    lock,
    teleport,
    update,
    dispose,
    get isLocked() {
      return isLocked || hasStarted;
    }
  };
}

function getMovementProfile(position, world) {
  // Stair zone takes priority — the player is physically on the stairs and
  // their target Y is an interpolation between ground and upper floor.
  const stair = findStairZone(position, world);
  if (stair) {
    // t = 0 at maxZ (south, ground level) → t = 1 at minZ (north, upper).
    const span = stair.maxZ - stair.minZ;
    const t = Math.max(0, Math.min(1, (stair.maxZ - position.z) / span));
    return {
      speedMultiplier: stair.speedMultiplier,
      cameraY: stair.floorY + (stair.upperY - stair.floorY) * t
    };
  }

  // Generic elevated/sunken floor zones (mushroom-house interior levels).
  // Each zone is XZ + a Y activation band, so a courtyard player standing over
  // the buried interior never gets captured by it.
  const floorZone = findFloorZone(position, world);
  if (floorZone) {
    return {
      speedMultiplier: 1,
      cameraY: floorZone.eyeY
    };
  }

  // Once north of the stair top and inside the upper-floor footprint, snap
  // the target to upper-floor eye level.
  if (isOnUpperFloor(position, world)) {
    return {
      speedMultiplier: 1,
      cameraY: world.upperFloorY ?? world.player.start.y
    };
  }

  const waterZone = findWaterZone(position, world);
  if (waterZone) {
    return {
      speedMultiplier: waterZone.speedMultiplier,
      cameraY: waterZone.cameraY
    };
  }

  return {
    speedMultiplier: 1,
    cameraY: world.player.start.y
  };
}

function isMovementKey(code) {
  return [
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowLeft",
    "ArrowDown",
    "ArrowRight"
  ].includes(code);
}
