import * as THREE from "three";
import { collidesWithWorld } from "./world.js";

const HALF_PI = Math.PI / 2;

export function createExplorerControls({ camera, canvas, world, onLockChange }) {
  const keys = new Set();
  const velocity = new THREE.Vector3();
  const candidate = new THREE.Vector3();
  let yaw = 0;
  let pitch = 0;
  let isLocked = false;
  let isFallbackLooking = false;

  camera.position.set(world.player.start.x, world.player.start.y, world.player.start.z);
  camera.rotation.order = "YXZ";
  camera.rotation.set(pitch, yaw, 0);

  function startFallbackLook() {
    isFallbackLooking = true;
    onLockChange?.(true);
  }

  function lock() {
    startFallbackLook();

    try {
      canvas.requestPointerLock?.();
    } catch {
      // Some embedded browser surfaces reject Pointer Lock; keep mouse-look fallback active.
    }
  }

  function handlePointerLockChange() {
    isLocked = document.pointerLockElement === canvas;
    if (isLocked) {
      isFallbackLooking = false;
    }
    onLockChange?.(isLocked || isFallbackLooking);
  }

  function handleMouseMove(event) {
    if (!isLocked && !isFallbackLooking) {
      return;
    }

    yaw -= event.movementX * 0.0022;
    pitch -= event.movementY * 0.0022;
    pitch = Math.max(-HALF_PI + 0.12, Math.min(HALF_PI - 0.12, pitch));
    camera.rotation.set(pitch, yaw, 0);
  }

  function handleKeyDown(event) {
    if (event.code === "Escape" && isFallbackLooking && !isLocked) {
      isFallbackLooking = false;
      onLockChange?.(false);
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

    startFallbackLook();
  }

  function update(delta) {
    velocity.set(0, 0, 0);

    if (keys.has("KeyW") || keys.has("ArrowUp")) velocity.z -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) velocity.z += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) velocity.x -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) velocity.x += 1;

    if (velocity.lengthSq() === 0) {
      return;
    }

    velocity.normalize().multiplyScalar(world.player.speed * delta);
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
  }

  function dispose() {
    document.removeEventListener("pointerlockchange", handlePointerLockChange);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("keyup", handleKeyUp);
    canvas.removeEventListener?.("mousedown", handleCanvasMouseDown);
  }

  document.addEventListener("pointerlockchange", handlePointerLockChange);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  canvas.addEventListener?.("mousedown", handleCanvasMouseDown);

  return {
    lock,
    update,
    dispose,
    get isLocked() {
      return isLocked || isFallbackLooking;
    }
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
