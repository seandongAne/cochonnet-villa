// Transparent artwork on scene-owned planes. Y is the local planet normal.
import * as THREE from 'three';

export const CAMP_CHARACTER_ART = {
  'little-pig': '/birthday-characters/sprout-pig-cutout-v1.webp',
  'bai-baicai': '/birthday-characters/little-cabbage-cutout-v1.webp',
};
export function createCampStandee(kind) {
  const root = new THREE.Group(); root.name = kind;
  const height = kind === 'little-pig' ? .44 : .46;
  const material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: .08, side: THREE.DoubleSide, toneMapped: false });
  const art = new THREE.Mesh(new THREE.PlaneGeometry(height, height), material);
  art.name = `${kind}-art`; art.position.y = height / 2; art.visible = false;
  const pivot = new THREE.Group(); pivot.name = `${kind}-standee`; pivot.position.set(0, .175, .045);
  pivot.add(art); root.add(pivot);
  return root;
}

// Face the visitor while preserving a fixed foot position on the folding chair.
export function faceCampStandee(pivot, cameraInParent) {
  const delta = cameraInParent.clone().sub(pivot.position);
  pivot.rotation.set(-Math.min(.5, Math.max(-.2, Math.atan2(delta.y, Math.hypot(delta.x, delta.z)))), Math.atan2(delta.x, delta.z), 0, 'YXZ');
}
