import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { styleMushroomFurnitureMaterial, addMushroomBotanicalPrint } from './mushroom-finishes.js';
import { trackAssetLoad } from './asset-loading.js';

// Generic GLB furniture-prop loader — the Phase 2 counterpart to
// porky-models.js. Both share the same shape (GLTFLoader + per-URL promise
// cache + bounding-box fit + procedural placeholder), but furniture pieces are
// pre-made CC0 assets (Kenney Furniture Kit + KayKit Furniture Bits) that ship
// with their own baked materials. Mushroom-room instances receive cloned matte
// finishes and a muted upholstery palette; the source cache stays unchanged.
//
// Reused verbatim by the React layer (mounted through <primitive>) and the
// node test suite (the placement DATA is asserted in furniture-placements.js).

// The Kenney Furniture Kit is authored at roughly 0.45x metric scale (a sofa is
// ~0.98 units wide). This factor lifts the whole kit into the villa's metre
// world — player eye height is 1.6, rooms are ~10 wide — while preserving the
// kit's internal proportions, so a uniform scale keeps a sofa and a lamp in
// correct relative size. Per-piece nudges go through placement.scale.
export const FURNITURE_BASE_SCALE = 2.2;

// KayKit Furniture Bits is authored close to real-world metres (its couch is
// three source units wide), unlike the smaller Kenney kit. Placement records
// from that pack opt into this base scale so both kits meet at player scale.
export const KAYKIT_FURNITURE_BASE_SCALE = 1;

export function furnitureScaleForPlacement(placement) {
  return (placement.baseScale ?? FURNITURE_BASE_SCALE) * (placement.scale ?? 1);
}

const loader = new GLTFLoader();
const modelCache = new Map();

// Every GLB in these packs embeds a byte-identical copy of the kit's colour
// atlas (pinned by tests/furniture-assets.test.mjs). Without sharing, each
// model would upload its own copy on the first frame it is drawn — for the
// mushroom tower that meant dozens of redundant 1024² uploads the moment the
// player teleported in. The first decoded copy becomes the pack's atlas and
// every later source adopts it; the redundant bitmaps are released.
export const SHARED_ATLAS_PACKS = Object.freeze(["/models/mushroom-furniture/"]);
const sharedAtlases = new Map();

function adoptSharedAtlas(source, url) {
  const pack = SHARED_ATLAS_PACKS.find((prefix) => url.startsWith(prefix));
  if (!pack) return source;
  source.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      const map = material?.map;
      if (!map) continue;
      const shared = sharedAtlases.get(pack);
      if (!shared) {
        sharedAtlases.set(pack, map);
      } else if (map !== shared) {
        material.map = shared;
        map.dispose();
        map.image?.close?.();
      }
    }
  });
  return source;
}

// Build one placeable furniture group from a placement record. The group is
// returned synchronously with a low-profile placeholder; the real GLB swaps in
// once it streams. Rotation is intentionally NOT applied here — the caller sets
// it on the wrapping <primitive>, which rotates the (recentred) piece about its
// own footprint centre.
//
// `hooks.prepare(model)` (browser-only, optional) uploads textures and compiles
// shaders before the swap; the chain is reported to the progress registry.
export function createFurniturePiece(placement, hooks = {}) {
  const group = new THREE.Group();
  const scale = furnitureScaleForPlacement(placement);

  const placeholder = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.3, 0.6),
    new THREE.MeshStandardMaterial({ color: "#c9a98b", roughness: 0.92 })
  );
  placeholder.position.y = 0.15;
  placeholder.name = "furniture-placeholder";
  group.add(placeholder);

  group.userData.assetState = "loading";
  trackAssetLoad(loadModel(placement.url)
    .then(async (source) => {
      const model = source.clone(true);
      if(placement.room?.startsWith('mushroom-')){
        const styled=new Map();
        model.traverse(child=>{
          if(!child.isMesh)return;
          const convert=original=>{
            if(!styled.has(original))styled.set(original,styleMushroomFurnitureMaterial(original));
            return styled.get(original);
          };
          child.material=Array.isArray(child.material)?child.material.map(convert):convert(child.material);
        });
        if(placement.wallMounted && /pictureframe/.test(placement.url) && !/mirror/.test(placement.id)){
          addMushroomBotanicalPrint(model,placement.id);
        }
      }
      prepareFurniture(model, scale);
      await hooks.prepare?.(model);
      group.clear();
      group.add(model);
      group.userData.assetState = "ready";
    }))
    // Outside trackAssetLoad so a failed swap counts as failed, not settled-OK.
    .catch((error) => {
      group.userData.modelLoadFailed = true;
      group.userData.modelLoadError = error?.message ?? String(error);
      group.userData.assetState = "fallback";
    });

  return group;
}

function loadModel(url) {
  if (!modelCache.has(url)) {
    modelCache.set(
      url,
      new Promise((resolve, reject) => {
        loader.load(url, (gltf) => resolve(adoptSharedAtlas(gltf.scene, url)), undefined, reject);
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
