// Node-pure gestures: rotate the whole viewing pose around the planet, never
// orbit a tiny cabin pivot or move through the globe while browsing.
import { Quaternion, Vector3 } from 'three';
import { copyPose, PLANET_TILT } from './focus-camera.js';

export const PLANET_MIN_DISTANCE = 4.25;
export const PLANET_MAX_DISTANCE = 19;
export const PLANET_OVERVIEW_DISTANCE = 8.5;
export const DRAG_THRESHOLD = 6;
export const CAMP_VIEW_BOUNDS = Object.freeze({ yaw: .6, minElevation: .16, maxElevation: .75, minDistance: 1.9, exitDistance: 6.5 });

// A campsite is a close-up vignette, not another globe orbit. Keep its own
// ground normal and frontal viewing sector so the fire and seated faces stay
// visible. The reference is the authored camping focus pose.
export function campingViewCoordinates(pose, reference) {
  const up = reference.up.clone().normalize();
  const front = reference.position.clone().sub(reference.target).projectOnPlane(up).normalize();
  const right = up.clone().cross(front).normalize();
  const offset = pose.position.clone().sub(reference.target);
  const distance = offset.length();
  return { up, front, right, distance, yaw: Math.atan2(offset.dot(right), offset.dot(front)), elevation: Math.asin(Math.max(-1, Math.min(1, offset.dot(up) / distance))) };
}

export function moveCampingPose(pose, reference, { dx = 0, dy = 0, height = 720, zoom = 0 } = {}) {
  const view = campingViewCoordinates(pose, reference);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const scale = 1.8 / Math.max(240, height);
  const yaw = clamp(view.yaw - dx * scale, -CAMP_VIEW_BOUNDS.yaw, CAMP_VIEW_BOUNDS.yaw);
  const elevation = clamp(view.elevation + dy * scale, CAMP_VIEW_BOUNDS.minElevation, CAMP_VIEW_BOUNDS.maxElevation);
  const distance = clamp(view.distance * Math.exp(zoom * .0012), CAMP_VIEW_BOUNDS.minDistance, CAMP_VIEW_BOUNDS.exitDistance);
  const offset = view.front.multiplyScalar(Math.cos(yaw) * Math.cos(elevation))
    .addScaledVector(view.right, Math.sin(yaw) * Math.cos(elevation)).addScaledVector(view.up, Math.sin(elevation));
  return { position: reference.target.clone().addScaledVector(offset, distance), target: reference.target.clone(), up: view.up };
}

export function rotatePlanetPose(pose, dx, dy, height) {
  const next = copyPose(pose);
  const forward = pose.target.clone().sub(pose.position).normalize();
  const right = forward.clone().cross(pose.up).normalize();
  const up = right.clone().cross(forward).normalize();
  const scale = Math.PI / Math.max(240, height);
  const rotation = new Quaternion().setFromAxisAngle(up, -dx * scale)
    .multiply(new Quaternion().setFromAxisAngle(right, -dy * scale));
  for (const value of Object.values(next)) value.applyQuaternion(rotation);
  return next;
}

export function zoomPlanetPose(pose, delta) {
  const next = copyPose(pose);
  if (!delta) return next;
  const radius = pose.position.length();
  const distance = Math.max(PLANET_MIN_DISTANCE, Math.min(PLANET_MAX_DISTANCE, radius * Math.exp(delta * .0012)));
  next.position.setLength(distance);
  // Pull the aim gradually toward the centre when zooming out. Zooming in
  // retains the current aim; only an explicit click selects a cabin.
  if (distance > radius) next.target.multiplyScalar(Math.max(0, 1 - (distance - radius) / Math.max(.1, PLANET_OVERVIEW_DISTANCE - radius)));
  return next;
}

export function wheelPixels(event) {
  return Math.max(-160, Math.min(160, event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 600 : 1)));
}

// The highlighted candidate is advisory: it never starts a camera flight.
export function planetCandidate(places, pose) {
  const forward = pose.target.clone().sub(pose.position).normalize();
  const tilt = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), PLANET_TILT);
  let best = null; let score = .94;
  for (const place of places) {
    const normal = new Vector3(...place.direction).normalize().applyQuaternion(tilt);
    const point = normal.clone().multiplyScalar(2.9);
    if (normal.dot(pose.position.clone().sub(point)) <= 0) continue;
    const alignment = point.sub(pose.position).normalize().dot(forward);
    if (alignment > score) { score = alignment; best = place.id; }
  }
  return best;
}

export function createRoomZoom(baseFov = 62) {
  return { fov: baseFov };
}

// Zoom never changes rooms, even after repeated outward gestures at the limit.
export function advanceRoomZoom(state, delta) {
  return { fov: Math.max(38, Math.min(78, state.fov + delta * .045)) };
}

export function createRoomPointer(event) {
  return { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, dragged: false };
}

export function moveRoomPointer(pointer, event) {
  return { ...pointer, x: event.clientX, y: event.clientY,
    dragged: pointer.dragged || Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) >= DRAG_THRESHOLD };
}
