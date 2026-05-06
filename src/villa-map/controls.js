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

  camera.position.set(world.player.start.x, world.player.start.y, world.player.start.z);
  camera.rotation.order = "YXZ";
  camera.rotation.set(pitch, yaw, 0);

  function lock() {
    canvas.requestPointerLock?.();
  }

  function handlePointerLockChange() {
    isLocked = document.pointerLockElement === canvas;
    onLockChange?.(isLocked);
  }

  function handleMouseMove(event) {
    if (!isLocked) {
      return;
    }

    yaw -= event.movementX * 0.0022;
    pitch -= event.movementY * 0.0022;
    pitch = Math.max(-HALF_PI + 0.12, Math.min(HALF_PI - 0.12, pitch));
    camera.rotation.set(pitch, yaw, 0);
  }

  function handleKeyDown(event) {
    if (isMovementKey(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    }
  }

  function handleKeyUp(event) {
    keys.delete(event.code);
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
  }

  document.addEventListener("pointerlockchange", handlePointerLockChange);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);

  return {
    lock,
    update,
    dispose,
    get isLocked() {
      return isLocked;
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
