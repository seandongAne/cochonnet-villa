import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Generic GLB furniture-prop loader — the Phase 2 counterpart to
// porky-models.js. Both share the same shape (GLTFLoader + per-URL promise
// cache + bounding-box fit + procedural placeholder), but furniture pieces are
// pre-made CC0 assets (Kenney Furniture Kit) that ship with their own baked
// materials, so we never recolour them — we only scale, recentre and ground.
//
// Reused verbatim by the React layer (mounted through <primitive>) and the
// node test suite (the placement DATA is asserted in furniture-placements.js).

// The Kenney Furniture Kit is authored at roughly 0.45x metric scale (a sofa is
// ~0.98 units wide). This factor lifts the whole kit into the villa's metre
// world — player eye height is 1.6, rooms are ~10 wide — while preserving the
// kit's internal proportions, so a uniform scale keeps a sofa and a lamp in
// correct relative size. Per-piece nudges go through placement.scale.
export const FURNITURE_BASE_SCALE = 2.2;

const loader = new GLTFLoader();
const modelCache = new Map();

// Build one placeable furniture group from a placement record. The group is
// returned synchronously with a low-profile placeholder; the real GLB swaps in
// once it streams. Rotation is intentionally NOT applied here — the caller sets
// it on the wrapping <primitive>, which rotates the (recentred) piece about its
// own footprint centre.
export function createFurniturePiece(placement) {
  const group = new THREE.Group();
  const scale = FURNITURE_BASE_SCALE * (placement.scale ?? 1);

  const placeholder = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.3, 0.6),
    new THREE.MeshStandardMaterial({ color: "#c9a98b", roughness: 0.92 })
  );
  placeholder.position.y = 0.15;
  placeholder.name = "furniture-placeholder";
  group.add(placeholder);

  loadModel(placement.url)
    .then((source) => {
      const model = source.clone(true);
      prepareFurniture(model, scale);
      group.clear();
      group.add(model);
    })
    .catch(() => {
      group.userData.modelLoadFailed = true;
    });

  return group;
}

function loadModel(url) {
  if (!modelCache.has(url)) {
    modelCache.set(
      url,
      new Promise((resolve, reject) => {
        loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
      })
    );
  }

  return modelCache.get(url);
}

// Uniform-scale the kit piece, drop it onto the floor (min-Y → 0) and centre its
// footprint over the group origin so placement positions read as the piece's
// centre and rotations pivot cleanly.
function prepareFurniture(model, scale) {
  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);

  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material?.map) {
        child.material.map.colorSpace = THREE.SRGBColorSpace;
      }
    }
  });
}
