// Data-driven GLB furniture placements — the Phase 2 counterpart to
// placements.js (porkies). Each record is consumed by furniture-models.js
// (createFurniturePiece) and mounted in Scene.jsx through <primitive>, exactly
// like the porkies. Keeping this as pure data lets the node test suite assert
// on it (valid rooms, in-bounds positions, vendored files exist) without a DOM.
//
// Coordinates are WORLD-space (the pieces mount at the scene root, NOT inside
// the villa group). For the main villa, world Z = villa-local Z - 13.
//
// `rotationY` faces a piece; values were tuned against the live preview. The
// loader recentres each piece over its own footprint, so rotation pivots in
// place and `position` is the footprint centre.
//
// Phase 3 enriches every record at module load with a world-space `footprint`
// (metres), a `floor` index, and `solid` / `noShadow` flags — see the stamping
// step at the bottom. The shadow-blob and collider layers read ONLY those
// derived fields, so they stay framework-agnostic and never load a GLB or
// parse a URL.
//
// Adding a room = copy its Kenney GLBs into public/models/furniture/, append
// records here, and drop that room's procedural set from createModernVilla.

import { FURNITURE_BASE_SCALE } from "./furniture-models.js";
import {
  mushroomFurniturePosition,
  mushroomFurnitureScale
} from "./mushroom-interior-config.js";

const KIT = (name) => `/models/furniture/${name}.glb`;

// Ground-floor walking surface (great-hall floor box top ≈ 0.11) and the
// upper-floor slab top (≈ 6.65). Pieces sit on these; the loader already
// grounds each model's min-Y to its own origin.
const FLOOR_Y = 0.11;
const UPPER_Y = 6.66;

// Native (unscaled) XZ footprints measured from each vendored GLB
// (`node _measure.mjs`, a throwaway Phase-3 helper). width = local X,
// depth = local Z. Lets the shadow + collider layers size themselves without
// loading a GLB outside the browser (world.js / shadows.js stay node-pure).
export const FURNITURE_FOOTPRINTS = {
  bedDouble: { x: 0.956, z: 1.125 },
  bookcaseClosedDoors: { x: 0.4, z: 0.25 },
  bookcaseClosedWide: { x: 0.8, z: 0.25 },
  bookcaseOpen: { x: 0.4, z: 0.25 },
  books: { x: 0.15, z: 0.095 },
  chair: { x: 0.2, z: 0.2 },
  chairDesk: { x: 0.335, z: 0.314 },
  coatRackStanding: { x: 0.273, z: 0.273 },
  computerScreen: { x: 0.393, z: 0.104 },
  desk: { x: 0.734, z: 0.392 },
  lampRoundFloor: { x: 0.152, z: 0.176 },
  lampRoundTable: { x: 0.152, z: 0.176 },
  loungeChair: { x: 0.49, z: 0.41 },
  loungeChairRelax: { x: 0.49, z: 0.675 },
  loungeSofaLong: { x: 0.98, z: 0.82 },
  plantSmall2: { x: 0.095, z: 0.095 },
  pottedPlant: { x: 0.212, z: 0.241 },
  rugDoormat: { x: 0.429, z: 0.237 },
  rugRectangle: { x: 1.57, z: 0.92 },
  rugRound: { x: 0.92, z: 0.92 },
  rugRounded: { x: 1.57, z: 0.92 },
  sideTable: { x: 0.534, z: 0.22 },
  sideTableDrawers: { x: 0.534, z: 0.222 },
  table: { x: 0.841, z: 0.447 },
  tableCoffee: { x: 0.661, z: 0.4 }
};

// Per-model behaviour policy (agreed Phase-3 defaults):
//   solid    → the piece gets a collider (big grounded furniture).
//   noShadow → skip the blob shadow (rugs are flat; tabletop items float above
//              the floor so a floor blob under them would read wrong).
// Walk-through on purpose: rugs, books, table/floor lamps, small plants, the
// coat rack, and dining / desk chairs (kept frictionless to navigate). Lounge
// chairs ARE solid (substantial armchairs). Any record may override per-piece.
const FURNITURE_POLICY = {
  bedDouble: { solid: true },
  bookcaseClosedDoors: { solid: true },
  bookcaseClosedWide: { solid: true },
  bookcaseOpen: { solid: true },
  books: { noShadow: true },
  chair: {},
  chairDesk: {},
  coatRackStanding: {},
  computerScreen: { noShadow: true },
  desk: { solid: true },
  lampRoundFloor: {},
  lampRoundTable: { noShadow: true },
  loungeChair: { solid: true },
  loungeChairRelax: { solid: true },
  loungeSofaLong: { solid: true },
  plantSmall2: { noShadow: true },
  pottedPlant: {},
  rugDoormat: { noShadow: true },
  rugRectangle: { noShadow: true },
  rugRound: { noShadow: true },
  rugRounded: { noShadow: true },
  sideTable: { solid: true },
  sideTableDrawers: { solid: true },
  table: { solid: true },
  tableCoffee: { solid: true }
};

// Raw per-room placements. `position` is the world-space footprint centre.
const RAW_PLACEMENTS = [
  // ===== 西大厅 / great-hall-west — living room (ground) =====
  // One compact conversation island occupies the back half of the hall. The
  // front half and the east edge stay open for the route from the entrance to
  // the stairs. The procedural blanket nest at (-5, -15) reads as the soft
  // east edge of this group instead of another loose furniture cluster.
  { id: "west-rug", room: "great-hall-west", url: KIT("rugRectangle"), position: [-8.5, FLOOR_Y, -15.1], rotationY: 0, scale: 2.25 },
  { id: "west-sofa", room: "great-hall-west", url: KIT("loungeSofaLong"), position: [-8.5, FLOOR_Y, -17.3], rotationY: 0, scale: 1.8 },
  { id: "west-coffee-table", room: "great-hall-west", url: KIT("tableCoffee"), position: [-8.5, FLOOR_Y, -14.5], rotationY: 0, scale: 1.8 },
  { id: "west-books", room: "great-hall-west", url: KIT("books"), position: [-8.8, FLOOR_Y + 0.43, -14.5], rotationY: 0.45, scale: 1.7 },
  { id: "west-armchair", room: "great-hall-west", url: KIT("loungeChair"), position: [-11.2, FLOOR_Y, -14.3], rotationY: -Math.PI / 2 + 0.18, scale: 1.9 },
  { id: "west-floor-lamp", room: "great-hall-west", url: KIT("lampRoundFloor"), position: [-10.9, FLOOR_Y, -17.9], rotationY: 0, scale: 1.9 },
  { id: "west-plant", room: "great-hall-west", url: KIT("pottedPlant"), position: [-4.7, FLOOR_Y, -18.7], rotationY: 0, scale: 2.2 },
  { id: "west-bookcase", room: "great-hall-west", url: KIT("bookcaseOpen"), position: [-11.9, FLOOR_Y, -20.4], rotationY: Math.PI / 2, scale: 2.1 },

  // ===== 主楼玄关 / entry-foyer — entry vestibule (ground) =====
  // The open-plan entry is an axis, not a furnished room: one lengthwise
  // runner points at the stairs while the console and coat rack sit well out
  // on opposite sides. The middle x∈[-1.5,1.5] remains unobstructed.
  { id: "foyer-mat", room: "entry-foyer", url: KIT("rugDoormat"), position: [0, FLOOR_Y, -4.6], rotationY: Math.PI / 2, scale: 3.2 },
  { id: "foyer-console", room: "entry-foyer", url: KIT("sideTableDrawers"), position: [-4.4, FLOOR_Y, -5.0], rotationY: Math.PI / 2, scale: 1.8 },
  { id: "foyer-console-plant", room: "entry-foyer", url: KIT("plantSmall2"), position: [-4.4, FLOOR_Y + 0.69, -5.0], rotationY: 0, scale: 2.2 },
  { id: "foyer-coat-rack", room: "entry-foyer", url: KIT("coatRackStanding"), position: [4.4, FLOOR_Y, -5.0], rotationY: 0, scale: 2.0 },

  // ===== 东大厅 / great-hall-east — dining hall (ground) =====
  // A single dining island sits in the back half of the east hall. Chairs are
  // evenly spaced rather than packed together; the sideboard is the only
  // secondary furniture mass. Each chair faces
  // INWARD onto the table — the `chair` model's backrest sits on its -Z side at
  // rotationY 0, so the NORTH row (z=-15.55, table to their +Z) stays at 0 and the
  // SOUTH row (z=-12.85, table to their -Z) turns Math.PI. (Earlier these were
  // swapped, which poked the backrests up through the tabletop.)
  { id: "east-dining-rug", room: "great-hall-east", url: KIT("rugRectangle"), position: [8.2, FLOOR_Y, -14.2], rotationY: 0, scale: 2.2 },
  { id: "east-table", room: "great-hall-east", url: KIT("table"), position: [8.2, FLOOR_Y, -14.2], rotationY: 0, scale: 2.6 },
  { id: "east-chair-n1", room: "great-hall-east", url: KIT("chair"), position: [6.5, FLOOR_Y, -15.55], rotationY: 0, scale: 1.9 },
  { id: "east-chair-n2", room: "great-hall-east", url: KIT("chair"), position: [8.2, FLOOR_Y, -15.55], rotationY: 0, scale: 1.9 },
  { id: "east-chair-n3", room: "great-hall-east", url: KIT("chair"), position: [9.9, FLOOR_Y, -15.55], rotationY: 0, scale: 1.9 },
  { id: "east-chair-s1", room: "great-hall-east", url: KIT("chair"), position: [6.5, FLOOR_Y, -12.85], rotationY: Math.PI, scale: 1.9 },
  { id: "east-chair-s2", room: "great-hall-east", url: KIT("chair"), position: [8.2, FLOOR_Y, -12.85], rotationY: Math.PI, scale: 1.9 },
  { id: "east-chair-s3", room: "great-hall-east", url: KIT("chair"), position: [9.9, FLOOR_Y, -12.85], rotationY: Math.PI, scale: 1.9 },
  { id: "east-table-books", room: "great-hall-east", url: KIT("books"), position: [8.25, FLOOR_Y + 0.98, -14.15], rotationY: 0.35, scale: 1.6 },
  { id: "east-sideboard", room: "great-hall-east", url: KIT("bookcaseClosedWide"), position: [11.9, FLOOR_Y, -19.0], rotationY: -Math.PI / 2, scale: 2.0 },
  { id: "east-plant", room: "great-hall-east", url: KIT("pottedPlant"), position: [11.4, FLOOR_Y, -10.0], rotationY: 0, scale: 2.2 },

  // ===== 二楼主卧 / master-bedroom (upper, y≈6.66) =====
  // The narrow 5 m room uses a lengthwise rug and a smaller bed, leaving a
  // clear landing at the foot. Slim rotated nightstands fit beside the
  // headboard without consuming the aisle.
  { id: "bed-rug", room: "master-bedroom", url: KIT("rugRounded"), position: [-5.5, UPPER_Y, -12.6], rotationY: Math.PI / 2, scale: 1.75 },
  { id: "bed-double", room: "master-bedroom", url: KIT("bedDouble"), position: [-5.5, UPPER_Y, -13.35], rotationY: 0, scale: 1.55 },
  { id: "bed-nightstand-l", room: "master-bedroom", url: KIT("sideTable"), position: [-7.55, UPPER_Y, -14.8], rotationY: Math.PI / 2, scale: 1.3 },
  { id: "bed-nightstand-r", room: "master-bedroom", url: KIT("sideTable"), position: [-3.45, UPPER_Y, -14.8], rotationY: Math.PI / 2, scale: 1.3 },
  { id: "bed-lamp-l", room: "master-bedroom", url: KIT("lampRoundTable"), position: [-7.55, UPPER_Y + 0.51, -14.8], rotationY: 0, scale: 1.55 },
  { id: "bed-lamp-r", room: "master-bedroom", url: KIT("lampRoundTable"), position: [-3.45, UPPER_Y + 0.51, -14.8], rotationY: 0, scale: 1.55 },
  { id: "bed-wardrobe", room: "master-bedroom", url: KIT("bookcaseClosedDoors"), position: [-7.45, UPPER_Y, -7.6], rotationY: Math.PI / 2, scale: 1.8 },
  { id: "bed-plant", room: "master-bedroom", url: KIT("pottedPlant"), position: [-3.8, UPPER_Y, -8.2], rotationY: 0, scale: 1.8 },

  // ===== 二楼书房 / study-loft (upper, y≈6.66) =====
  // This 5×5 m room is now a focused work zone. The former second reading nook
  // and rug belonged in the adjacent lounge and made both rooms feel smaller.
  { id: "study-desk", room: "study-loft", url: KIT("desk"), position: [5.2, UPPER_Y, -15.0], rotationY: 0, scale: 1.8 },
  { id: "study-chair", room: "study-loft", url: KIT("chairDesk"), position: [5.2, UPPER_Y, -13.9], rotationY: Math.PI, scale: 1.8 },
  { id: "study-monitor", room: "study-loft", url: KIT("computerScreen"), position: [5.2, UPPER_Y + 0.71, -15.15], rotationY: 0, scale: 1.7 },
  { id: "study-books", room: "study-loft", url: KIT("books"), position: [4.6, UPPER_Y + 0.69, -14.85], rotationY: -0.25, scale: 1.5 },
  { id: "study-bookcase", room: "study-loft", url: KIT("bookcaseOpen"), position: [7.45, UPPER_Y, -14.1], rotationY: -Math.PI / 2, scale: 1.8 },
  { id: "study-plant", room: "study-loft", url: KIT("plantSmall2"), position: [7.35, UPPER_Y, -11.8], rotationY: 0, scale: 2.2 },

  // ===== 二楼阳台休息区 / lounge-balcony (upper, y≈6.66) =====
  // The lounge owns the upstairs reading function: two smaller chairs make a
  // balanced pair facing the glass, with only one rug and one shared table.
  { id: "lounge-rug", room: "lounge-balcony", url: KIT("rugRound"), position: [5.5, UPPER_Y, -8.5], rotationY: 0, scale: 1.6 },
  { id: "lounge-chair-l", room: "lounge-balcony", url: KIT("loungeChairRelax"), position: [4.25, UPPER_Y, -8.8], rotationY: 0.18, scale: 1.45 },
  { id: "lounge-chair-r", room: "lounge-balcony", url: KIT("loungeChairRelax"), position: [6.75, UPPER_Y, -8.8], rotationY: -0.18, scale: 1.45 },
  { id: "lounge-side-table", room: "lounge-balcony", url: KIT("sideTable"), position: [5.5, UPPER_Y, -9.3], rotationY: 0, scale: 1.2 },
  { id: "lounge-side-books", room: "lounge-balcony", url: KIT("books"), position: [5.5, UPPER_Y + 0.45, -9.3], rotationY: 0.35, scale: 1.4 },
  { id: "lounge-floor-lamp", room: "lounge-balcony", url: KIT("lampRoundFloor"), position: [3.5, UPPER_Y, -6.7], rotationY: 0, scale: 1.7 },
  { id: "lounge-plant", room: "lounge-balcony", url: KIT("pottedPlant"), position: [7.4, UPPER_Y, -6.7], rotationY: 0, scale: 1.8 },

  // ============================================================================
  // 蘑菇屋内部 — an independent pocket space whose old normalized layout is
  // expanded 4x around (-6,18). `mushroomFurniturePosition` migrates each old
  // coordinate into that larger room; `mushroomFurnitureScale` makes every
  // model 0.8x of its former size. The exterior mushroom remains unchanged.
  // ============================================================================

  // ----- 一层灶间 / mushroom-hearth — round dining table + tiny kitchen -----
  // Dining stays west of centre, clear of stair A on the east and the straight
  // arrival path from the south door. A counter and cupboard hug the perimeter.
  { id: "m1-rug", room: "mushroom-hearth", url: KIT("rugRound"), position: mushroomFurniturePosition(-7.4, 0, 17.2), rotationY: 0, scale: mushroomFurnitureScale(1.8) },
  { id: "m1-table", room: "mushroom-hearth", url: KIT("table"), position: mushroomFurniturePosition(-7.4, 0, 17.2), rotationY: 0, scale: mushroomFurnitureScale(1.7) },
  { id: "m1-chair-n", room: "mushroom-hearth", url: KIT("chair"), position: mushroomFurniturePosition(-7.4, 0, 16.0), rotationY: 0, scale: mushroomFurnitureScale(1.8) },
  { id: "m1-chair-s", room: "mushroom-hearth", url: KIT("chair"), position: mushroomFurniturePosition(-7.4, 0, 18.4), rotationY: Math.PI, scale: mushroomFurnitureScale(1.8) },
  { id: "m1-counter", room: "mushroom-hearth", url: KIT("sideTableDrawers"), position: mushroomFurniturePosition(-5.7, 0, 14.3), rotationY: 0, scale: mushroomFurnitureScale(1.7) },
  { id: "m1-counter-plant", room: "mushroom-hearth", url: KIT("plantSmall2"), position: mushroomFurniturePosition(-5.7, 0, 14.3, 0.65), rotationY: 0, scale: mushroomFurnitureScale(2.1) },
  { id: "m1-cupboard", room: "mushroom-hearth", url: KIT("bookcaseClosedWide"), position: mushroomFurniturePosition(-9.75, 0, 16.4), rotationY: Math.PI / 2, scale: mushroomFurnitureScale(1.7) },

  // ----- 二层玩乐窝 / mushroom-den — one compact sofa bay -----
  // L2 keeps a single focused lounge composition, spread into the larger room.
  { id: "m2-rug", room: "mushroom-den", url: KIT("rugRound"), position: mushroomFurniturePosition(-6.2, 1, 17.7), rotationY: 0, scale: mushroomFurnitureScale(1.35) },
  { id: "m2-sofa", room: "mushroom-den", url: KIT("loungeSofaLong"), position: mushroomFurniturePosition(-6.0, 1, 15.0), rotationY: 0, scale: mushroomFurnitureScale(1.35) },
  { id: "m2-coffee-table", room: "mushroom-den", url: KIT("tableCoffee"), position: mushroomFurniturePosition(-6.0, 1, 17.4), rotationY: 0, scale: mushroomFurnitureScale(1.45) },
  { id: "m2-table-books", room: "mushroom-den", url: KIT("books"), position: mushroomFurniturePosition(-5.75, 1, 17.4, 0.36), rotationY: -0.35, scale: mushroomFurnitureScale(1.4) },
  { id: "m2-bookcase", room: "mushroom-den", url: KIT("bookcaseOpen"), position: mushroomFurniturePosition(-6.0, 1, 21.75), rotationY: Math.PI, scale: mushroomFurnitureScale(1.8) },
  { id: "m2-floor-lamp", room: "mushroom-den", url: KIT("lampRoundFloor"), position: mushroomFurniturePosition(-7.2, 1, 21.55), rotationY: 0, scale: mushroomFurnitureScale(1.7) },

  // ----- 顶层星光阁楼 / mushroom-loft — bed under the glowing cap -----
  // The normalized layout stays east of stairwell B after both are scaled.
  { id: "m3-rug", room: "mushroom-loft", url: KIT("rugRound"), position: mushroomFurniturePosition(-4.8, 2, 16.2), rotationY: 0, scale: mushroomFurnitureScale(1.5) },
  { id: "m3-bed", room: "mushroom-loft", url: KIT("bedDouble"), position: mushroomFurniturePosition(-4.8, 2, 15.4), rotationY: 0, scale: mushroomFurnitureScale(1.35) },
  { id: "m3-nightstand", room: "mushroom-loft", url: KIT("sideTable"), position: mushroomFurniturePosition(-2.7, 2, 15.2), rotationY: Math.PI / 2, scale: mushroomFurnitureScale(1.2) },
  { id: "m3-night-lamp", room: "mushroom-loft", url: KIT("lampRoundTable"), position: mushroomFurniturePosition(-2.7, 2, 15.2, 0.46), rotationY: 0, scale: mushroomFurnitureScale(1.5) },
  { id: "m3-chair", room: "mushroom-loft", url: KIT("loungeChairRelax"), position: mushroomFurniturePosition(-4.6, 2, 20.7), rotationY: Math.PI, scale: mushroomFurnitureScale(1.35) },
  { id: "m3-wardrobe", room: "mushroom-loft", url: KIT("bookcaseClosedDoors"), position: mushroomFurniturePosition(-2.3, 2, 19.0), rotationY: -Math.PI / 2, scale: mushroomFurnitureScale(1.6) }
];

// basename of a `/models/furniture/<name>.glb` url.
function modelName(url) {
  return url.slice(url.lastIndexOf("/") + 1, -".glb".length);
}

// Floor index from room identity. This avoids coupling furniture stamping to
// the pocket's absolute burial depth, which can change independently again.
function floorIndexForPlacement(placement) {
  if (placement.room === "mushroom-hearth") return 2;
  if (placement.room === "mushroom-den") return 3;
  if (placement.room === "mushroom-loft") return 4;
  return placement.position[1] > 3.5 ? 1 : 0;
}

// Stamp every record once at module load with the derived fields the Phase-3
// shadow + collider layers read. `footprint` is the world-space (metres) XZ
// extent: native size × base scale × the per-piece scale, so consumers never
// re-apply a scale or know the kit's base factor. `floor` is the storey index
// (derived from room identity; only solid pieces — which sit exactly on a
// floor surface — drive colliders). Per-piece `solid` / `noShadow` on a raw record override
// the model policy.
export const FURNITURE_PLACEMENTS = RAW_PLACEMENTS.map((raw) => {
  const name = modelName(raw.url);
  const native = FURNITURE_FOOTPRINTS[name] ?? { x: 0.5, z: 0.5 };
  const s = FURNITURE_BASE_SCALE * (raw.scale ?? 1);
  const policy = FURNITURE_POLICY[name] ?? {};
  return {
    ...raw,
    model: name,
    floor: floorIndexForPlacement(raw),
    footprint: { x: native.x * s, z: native.z * s },
    solid: raw.solid ?? policy.solid ?? false,
    noShadow: raw.noShadow ?? policy.noShadow ?? false
  };
});
