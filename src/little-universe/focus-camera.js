// Node-pure camera choreography shared by the scene and behavior tests.
import { Quaternion, Vector3 } from 'three';
import { surfaceFrame } from './planet.js';

export const PLANET_TILT = -0.08;
const tilt = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), PLANET_TILT);

export function focusPose(place, aspect = 1) {
  const frame = surfaceFrame(place.direction);
  const orientation = tilt.clone().multiply(frame.quaternion);
  const up = new Vector3(0, 1, 0).applyQuaternion(orientation);
  const front = new Vector3(0, 0, 1).applyQuaternion(orientation);
  const right = new Vector3(1, 0, 0).applyQuaternion(orientation);
  const target = frame.position.applyQuaternion(tilt).addScaledVector(up, 0.4);
  const distance = aspect < 0.8 ? (place.id === 'camping' ? 4.6 : 3.9) : 3.1;
  return {
    // Lower the campsite approach to show the characters' faces. The rose
    // cabin uses the opposite three-quarter approach to show its entrance.
    position: target.clone().addScaledVector(front, distance * 0.87)
      .addScaledVector(up, place.id === 'camping' ? Math.min(distance, 3.9) * .32 : distance * .62)
      .addScaledVector(right, distance * (place.id === 'museum' ? 0.48 : place.id === 'camping' ? -0.28 : 0)),
    target,
    up,
  };
}

export function copyPose(pose) {
  return { position: pose.position.clone(), target: pose.target.clone(), up: pose.up.clone() };
}

// Travel around the sphere instead of cutting through it when a landmark is
// selected from the far side. The same path works in reverse and on interruption.
export function cameraFlight(from, to) {
  const direction = from.position.clone().normalize();
  const arc = new Quaternion().setFromUnitVectors(direction, to.position.clone().normalize());
  const upArc = new Quaternion().setFromUnitVectors(from.up.clone().normalize(), to.up.clone().normalize());
  return (progress) => {
    const x = Math.max(0, Math.min(1, progress));
    const t = x * x * x * (x * (x * 6 - 15) + 10);
    return {
      position: direction.clone().applyQuaternion(new Quaternion().slerp(arc, t))
        .multiplyScalar(from.position.length() * (1 - t) + to.position.length() * t),
      target: from.target.clone().lerp(to.target, t),
      up: from.up.clone().applyQuaternion(new Quaternion().slerp(upArc, t)).normalize(),
    };
  };
}
