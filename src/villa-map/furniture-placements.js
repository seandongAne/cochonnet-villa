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
// Adding a room = vendor its licensed GLBs, append records here with the
// source pack's baseScale, and drop that room's procedural set if it had one.

import {
  KAYKIT_FURNITURE_BASE_SCALE,
  furnitureScaleForPlacement
} from "./furniture-models.js";
import {
  MUSHROOM_INTERIOR_CENTER,
  MUSHROOM_INTERIOR_LOCAL_RADIUS,
  MUSHROOM_INTERIOR_SCALE,
  mushroomFurnitureWorldPosition
} from "./mushroom-interior-config.js";

const KIT = (name) => `/models/furniture/${name}.glb`;
const MUSHROOM_KIT = (name) => `/models/mushroom-furniture/${name}.glb`;

// KayKit records keep their readable, pre-expansion X/Z plan coordinates and
// opt into the pack's metre-scale base factor. This is deliberately separate
// from the 2.2x Kenney base scale used by the main villa.
const MUSHROOM_ROOM_FOR_LEVEL = ["mushroom-hearth", "mushroom-den", "mushroom-loft"];
export const MUSHROOM_WALL_CLEARANCE = 0.04;
const mushroomWallTransforms = new Map();

// Expansion deliberately leaves ordinary furniture on the roomier 1.6x plan,
// but a picture or shelf must follow the actual 2x curved wall. Project the
// whole footprint (not just its centre) onto the cylinder so its outer corners
// sit just inside the plaster, then turn the model tangent to the curve.
function mushroomWallTransform(model, x, z, scale, authoredRotationY) {
  const native = FURNITURE_FOOTPRINTS[model];
  if (!native) throw new Error(`Missing footprint for wall-mounted ${model}`);

  const dx = x - MUSHROOM_INTERIOR_CENTER.x;
  const dz = z - MUSHROOM_INTERIOR_CENTER.z;
  const sourceRadius = Math.hypot(dx, dz);
  if (sourceRadius === 0) throw new Error(`${model} needs a wall direction`);

  const pieceScale = KAYKIT_FURNITURE_BASE_SCALE * scale;
  const halfWidth = native.x * pieceScale / 2;
  const halfDepth = native.z * pieceScale / 2;
  const wallRadius = MUSHROOM_INTERIOR_LOCAL_RADIUS * MUSHROOM_INTERIOR_SCALE;
  const cornerRadius = wallRadius - MUSHROOM_WALL_CLEARANCE;
  const centerRadius = Math.sqrt(cornerRadius ** 2 - halfWidth ** 2) - halfDepth;
  const nx = dx / sourceRadius;
  const nz = dz / sourceRadius;

  return {
    x: MUSHROOM_INTERIOR_CENTER.x + nx * centerRadius,
    z: MUSHROOM_INTERIOR_CENTER.z + nz * centerRadius,
    // At this yaw the model's local -Z (its back) points into the wall.
    rotationY: Math.atan2(-nx, -nz),
    authoredRotationY
  };
}

const mushroomPiece = (model, {
  id,
  level,
  x,
  z,
  y = 0,
  rotationY = 0,
  scale = 1,
  wallMounted = false,
  onWallShelfId,
  ...overrides
}) => {
  const authoredPosition = mushroomFurnitureWorldPosition(x, level, z, y);
  let position = authoredPosition;
  let finalRotationY = rotationY;

  if (wallMounted) {
    const transform = mushroomWallTransform(model, x, z, scale, rotationY);
    position = [transform.x, authoredPosition[1], transform.z];
    finalRotationY = transform.rotationY;
    mushroomWallTransforms.set(id, {
      authoredPosition,
      position,
      authoredRotationY: rotationY,
      rotationY: finalRotationY
    });
  } else if (onWallShelfId) {
    const parent = mushroomWallTransforms.get(onWallShelfId);
    if (!parent) throw new Error(`${id} references unknown wall shelf ${onWallShelfId}`);

    const delta = parent.rotationY - parent.authoredRotationY;
    const dx = authoredPosition[0] - parent.authoredPosition[0];
    const dz = authoredPosition[2] - parent.authoredPosition[2];
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    position = [
      parent.position[0] + dx * cos + dz * sin,
      authoredPosition[1],
      parent.position[2] - dx * sin + dz * cos
    ];
    finalRotationY = rotationY + delta;
  }

  return {
    id,
    room: MUSHROOM_ROOM_FOR_LEVEL[level],
    url: MUSHROOM_KIT(model),
    position,
    rotationY: finalRotationY,
    scale,
    baseScale: KAYKIT_FURNITURE_BASE_SCALE,
    ...(wallMounted && { wallMounted: true }),
    ...(onWallShelfId && { onWallShelfId }),
    ...overrides
  };
};

// Ground-floor walking surface (great-hall floor box top ≈ 0.11) and the
// upper-floor slab top (≈ 6.65). Pieces sit on these; the loader already
// grounds each model's min-Y to its own origin.
const FLOOR_Y = 0.11;
const UPPER_Y = 6.66;

// Shared KayKit loft-bed geometry for the Meshy sleeping pig. A vertical ray
// through the GLB's cover lands at 0.55 source metres; keeping that measured
// support height beside the anchor prevents the pig from floating when the
// composition is retuned.
const MUSHROOM_LOFT_BED_ANCHOR = Object.freeze({
  level: 2,
  x: -4.2,
  z: 14.2,
  scale: 1.02
});
const BED_DOUBLE_B_MATTRESS_TOP = 0.55;
export const MUSHROOM_LOFT_BED_POSITION = mushroomFurnitureWorldPosition(
  MUSHROOM_LOFT_BED_ANCHOR.x,
  MUSHROOM_LOFT_BED_ANCHOR.level,
  MUSHROOM_LOFT_BED_ANCHOR.z
);
export const MUSHROOM_LOFT_BED_SCALE = MUSHROOM_LOFT_BED_ANCHOR.scale;
export const MUSHROOM_LOFT_BED_TOP_Y =
  MUSHROOM_LOFT_BED_POSITION[1]
  + BED_DOUBLE_B_MATTRESS_TOP
    * KAYKIT_FURNITURE_BASE_SCALE
    * MUSHROOM_LOFT_BED_SCALE;

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
  tableCoffee: { x: 0.661, z: 0.4 },

  // KayKit Furniture Bits 1.0 (source units are already close to metres).
  armchair: { x: 1.8, z: 1.6 },
  armchair_pillows: { x: 1.8, z: 1.6 },
  bed_double_A: { x: 3.1, z: 3 },
  bed_double_B: { x: 3.1, z: 3 },
  bed_single_A: { x: 1.6, z: 3 },
  bed_single_B: { x: 1.6, z: 3 },
  book_set: { x: 0.78, z: 0.365 },
  book_single: { x: 0.26, z: 0.365 },
  cabinet_medium: { x: 2, z: 1.002 },
  cabinet_medium_decorated: { x: 2.042, z: 1.002 },
  cabinet_small: { x: 1, z: 1.002 },
  cabinet_small_decorated: { x: 1.048, z: 1.104 },
  cactus_medium_A: { x: 0.88, z: 0.837 },
  cactus_medium_B: { x: 0.88, z: 0.837 },
  cactus_small_A: { x: 0.5, z: 0.5 },
  cactus_small_B: { x: 0.5, z: 0.5 },
  chair_A: { x: 0.75, z: 0.845 },
  chair_A_wood: { x: 0.75, z: 0.845 },
  chair_B: { x: 0.75, z: 0.845 },
  chair_B_wood: { x: 0.75, z: 0.845 },
  chair_C: { x: 0.75, z: 0.936 },
  chair_stool: { x: 0.75, z: 0.75 },
  chair_stool_wood: { x: 0.75, z: 0.75 },
  couch: { x: 3, z: 1.6 },
  couch_pillows: { x: 3, z: 1.6 },
  lamp_standing: { x: 1, z: 1 },
  lamp_table: { x: 1, z: 1 },
  pictureframe_large_A: { x: 1.01, z: 0.2 },
  pictureframe_large_B: { x: 2, z: 0.2 },
  pictureframe_medium: { x: 0.7, z: 0.2 },
  pictureframe_small_A: { x: 0.5, z: 0.2 },
  pictureframe_small_B: { x: 0.7, z: 0.2 },
  pictureframe_small_C: { x: 0.5, z: 0.2 },
  pictureframe_standing_A: { x: 0.5, z: 0.379 },
  pictureframe_standing_B: { x: 0.7, z: 0.357 },
  pillow_A: { x: 0.65, z: 0.5 },
  pillow_B: { x: 0.65, z: 0.5 },
  rug_oval_A: { x: 3, z: 2 },
  rug_oval_B: { x: 3, z: 2 },
  rug_rectangle_A: { x: 3, z: 2 },
  rug_rectangle_B: { x: 3, z: 2 },
  rug_rectangle_stripes_A: { x: 3, z: 2 },
  rug_rectangle_stripes_B: { x: 3, z: 2 },
  shelf_A_big: { x: 2, z: 0.5 },
  shelf_A_small: { x: 1, z: 0.5 },
  shelf_B_large: { x: 2, z: 0.5 },
  shelf_B_large_decorated: { x: 2, z: 0.5 },
  shelf_B_small: { x: 1, z: 0.5 },
  shelf_B_small_decorated: { x: 1, z: 0.571 },
  table_low: { x: 2.4, z: 1.5 },
  table_medium: { x: 2, z: 2 },
  table_medium_long: { x: 3, z: 2 },
  table_small: { x: 1, z: 1 }
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
  tableCoffee: { solid: true },

  armchair: { solid: true },
  armchair_pillows: { solid: true },
  bed_double_A: { solid: true },
  bed_double_B: { solid: true },
  bed_single_A: { solid: true },
  bed_single_B: { solid: true },
  book_set: { noShadow: true },
  book_single: { noShadow: true },
  cabinet_medium: { solid: true },
  cabinet_medium_decorated: { solid: true },
  cabinet_small: { solid: true },
  cabinet_small_decorated: { solid: true },
  cactus_medium_A: { noShadow: true },
  cactus_medium_B: { noShadow: true },
  cactus_small_A: { noShadow: true },
  cactus_small_B: { noShadow: true },
  chair_A: {},
  chair_A_wood: {},
  chair_B: {},
  chair_B_wood: {},
  chair_C: {},
  chair_stool: {},
  chair_stool_wood: {},
  couch: { solid: true },
  couch_pillows: { solid: true },
  lamp_standing: {},
  lamp_table: { noShadow: true },
  pictureframe_large_A: { noShadow: true },
  pictureframe_large_B: { noShadow: true },
  pictureframe_medium: { noShadow: true },
  pictureframe_small_A: { noShadow: true },
  pictureframe_small_B: { noShadow: true },
  pictureframe_small_C: { noShadow: true },
  pictureframe_standing_A: { noShadow: true },
  pictureframe_standing_B: { noShadow: true },
  pillow_A: { noShadow: true },
  pillow_B: { noShadow: true },
  rug_oval_A: { noShadow: true },
  rug_oval_B: { noShadow: true },
  rug_rectangle_A: { noShadow: true },
  rug_rectangle_B: { noShadow: true },
  rug_rectangle_stripes_A: { noShadow: true },
  rug_rectangle_stripes_B: { noShadow: true },
  shelf_A_big: { noShadow: true },
  shelf_A_small: { noShadow: true },
  shelf_B_large: { noShadow: true },
  shelf_B_large_decorated: { noShadow: true },
  shelf_B_small: { noShadow: true },
  shelf_B_small_decorated: { noShadow: true },
  table_low: { solid: true },
  table_medium: { solid: true },
  table_medium_long: { solid: true },
  table_small: { solid: true }
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
  // 蘑菇屋内部 — KayKit Furniture Bits turns the magical pocket tower into three
  // layered, lived-in rooms. Furniture forms several close clusters per floor;
  // elevated shelves, pictures, books and cushions fill the vertical field
  // without adding collision. Coordinates stay in the readable source plan.
  // ============================================================================

  // ----- 一层灶间 / mushroom-hearth — pantry + crowded family table -----
  // The centre/south arrival lane and east stair remain open. The north wall is
  // a full pantry, the west half a six-seat table, and the south-west corner a
  // tiny tea chair layered with a second rug, lamp, cushions and wall shelves.
  mushroomPiece("rug_rectangle_stripes_A", { id: "m1-dining-rug", level: 0, x: -8.05, z: 17.05, scale: 1.55 }),
  mushroomPiece("table_medium_long", { id: "m1-dining-table", level: 0, x: -8.05, z: 17.05, scale: 1.08 }),
  mushroomPiece("chair_A_wood", { id: "m1-chair-nw", level: 0, x: -8.55, z: 16.55, rotationY: 0 }),
  mushroomPiece("chair_B_wood", { id: "m1-chair-ne", level: 0, x: -7.55, z: 16.55, rotationY: 0 }),
  mushroomPiece("chair_A", { id: "m1-chair-sw", level: 0, x: -8.55, z: 17.55, rotationY: Math.PI }),
  mushroomPiece("chair_B", { id: "m1-chair-se", level: 0, x: -7.55, z: 17.55, rotationY: Math.PI }),
  mushroomPiece("chair_C", { id: "m1-chair-west", level: 0, x: -8.72, z: 17.05, rotationY: -Math.PI / 2 }),
  mushroomPiece("book_set", { id: "m1-table-books", level: 0, x: -8.22, z: 17.05, y: 0.97, rotationY: 0.28 }),
  mushroomPiece("cactus_small_A", { id: "m1-table-cactus", level: 0, x: -7.78, z: 17.05, y: 0.97, scale: 0.88 }),

  mushroomPiece("cabinet_medium_decorated", { id: "m1-pantry-wide", level: 0, x: -7.15, z: 14.12, rotationY: 0, scale: 1.05 }),
  mushroomPiece("cabinet_small_decorated", { id: "m1-pantry-small", level: 0, x: -5.95, z: 14.08, rotationY: 0, scale: 1.05 }),
  mushroomPiece("cabinet_medium", { id: "m1-pantry-sideboard", level: 0, x: -4.65, z: 14.08, rotationY: 0, scale: 1.05 }),
  mushroomPiece("shelf_B_large_decorated", { id: "m1-pantry-shelf", level: 0, x: -7.15, z: 13.92, y: 2.1, rotationY: 0, scale: 1.1, wallMounted: true }),
  mushroomPiece("shelf_B_small_decorated", { id: "m1-spice-shelf", level: 0, x: -5.72, z: 13.92, y: 2.25, rotationY: 0, wallMounted: true }),
  mushroomPiece("book_single", { id: "m1-pantry-book", level: 0, x: -4.85, z: 14.1, y: 0.94, rotationY: -0.18 }),
  mushroomPiece("cactus_small_B", { id: "m1-pantry-cactus", level: 0, x: -4.45, z: 14.1, y: 0.94, scale: 0.9 }),
  mushroomPiece("pictureframe_standing_A", { id: "m1-pantry-photo", level: 0, x: -6.88, z: 14.08, y: 1.68, rotationY: 0.12 }),
  mushroomPiece("chair_stool_wood", { id: "m1-kitchen-stool-a", level: 0, x: -6.05, z: 15.05, rotationY: Math.PI }),
  mushroomPiece("chair_stool", { id: "m1-kitchen-stool-b", level: 0, x: -5.35, z: 15.05, rotationY: Math.PI }),

  mushroomPiece("rug_oval_B", { id: "m1-tea-rug", level: 0, x: -9.05, z: 20.25, rotationY: 0.28, scale: 1.22 }),
  mushroomPiece("armchair_pillows", { id: "m1-tea-chair", level: 0, x: -9.12, z: 20.18, rotationY: 0.42, scale: 0.94 }),
  mushroomPiece("table_small", { id: "m1-tea-table", level: 0, x: -8.28, z: 20.35, rotationY: 0.22, scale: 0.9 }),
  mushroomPiece("lamp_table", { id: "m1-tea-lamp", level: 0, x: -8.28, z: 20.35, y: 0.82, scale: 0.72 }),
  mushroomPiece("lamp_standing", { id: "m1-floor-lamp", level: 0, x: -9.72, z: 21.05, scale: 0.88 }),
  mushroomPiece("pillow_A", { id: "m1-floor-cushion", level: 0, x: -8.52, z: 20.92, y: 0.08, rotationY: -0.35, scale: 1.05 }),
  mushroomPiece("cabinet_small", { id: "m1-tea-cabinet", level: 0, x: -8.18, z: 21.65, rotationY: Math.PI, scale: 0.92 }),
  mushroomPiece("cactus_medium_A", { id: "m1-tea-cactus", level: 0, x: -8.18, z: 21.65, y: 0.84, scale: 0.78 }),

  mushroomPiece("pictureframe_large_B", { id: "m1-north-picture", level: 0, x: -8.75, z: 13.76, y: 2.3, rotationY: 0, scale: 1.15, wallMounted: true }),
  mushroomPiece("pictureframe_medium", { id: "m1-north-picture-small", level: 0, x: -3.72, z: 13.74, y: 2.55, rotationY: 0, scale: 1.05, wallMounted: true }),
  mushroomPiece("pictureframe_small_A", { id: "m1-west-picture-a", level: 0, x: -10.18, z: 18.45, y: 2.2, rotationY: Math.PI / 2, scale: 1.2, wallMounted: true }),
  mushroomPiece("pictureframe_small_B", { id: "m1-west-picture-b", level: 0, x: -10.18, z: 19.12, y: 3.15, rotationY: Math.PI / 2, scale: 1.15, wallMounted: true }),
  mushroomPiece("shelf_A_big", { id: "m1-west-wall-shelf", level: 0, x: -10.15, z: 17.25, y: 2.0, rotationY: Math.PI / 2, scale: 1.05, wallMounted: true }),
  mushroomPiece("book_set", { id: "m1-west-shelf-books", level: 0, x: -10.02, z: 17.25, y: 2.38, rotationY: Math.PI / 2, scale: 0.9, onWallShelfId: "m1-west-wall-shelf" }),

  // ----- 二层玩乐窝 / mushroom-den — pillow fort + little library -----
  // Both seating groups now live along the north wall. The full-width aisle
  // immediately south of them feeds a broad centre lane between stair A and
  // stair B, so the two stair mouths are joined without threading through a
  // collider cluster. Wall-mounted pieces stay at the perimeter.
  mushroomPiece("rug_rectangle_A", { id: "m2-lounge-rug", level: 1, x: -6.0, z: 13.8, scale: 1.55 }),
  mushroomPiece("couch_pillows", { id: "m2-couch", level: 1, x: -6.0, z: 13.45, rotationY: 0, scale: 1.05 }),
  mushroomPiece("chair_C", { id: "m2-chair-west", level: 1, x: -7.08, z: 14.35, rotationY: -0.45, scale: 1.05 }),
  mushroomPiece("chair_A", { id: "m2-chair-east", level: 1, x: -4.92, z: 14.35, rotationY: 0.45, scale: 1.05 }),
  mushroomPiece("table_low", { id: "m2-coffee-table", level: 1, x: -6.0, z: 14.33, scale: 1.0 }),
  mushroomPiece("book_set", { id: "m2-coffee-books", level: 1, x: -6.22, z: 14.33, y: 0.47, rotationY: -0.25, scale: 0.92 }),
  mushroomPiece("cactus_small_A", { id: "m2-coffee-cactus", level: 1, x: -5.75, z: 14.33, y: 0.47, scale: 0.82 }),
  mushroomPiece("lamp_table", { id: "m2-coffee-lamp", level: 1, x: -6.0, z: 14.16, y: 0.47, scale: 0.62 }),
  mushroomPiece("pillow_A", { id: "m2-couch-pillow-a", level: 1, x: -6.35, z: 13.55, y: 0.55, rotationY: -0.2 }),
  mushroomPiece("pillow_B", { id: "m2-couch-pillow-b", level: 1, x: -5.7, z: 13.55, y: 0.55, rotationY: 0.22 }),
  mushroomPiece("lamp_standing", { id: "m2-lounge-lamp", level: 1, x: -7.72, z: 13.4, scale: 0.9 }),

  mushroomPiece("cabinet_medium_decorated", { id: "m2-east-cabinet", level: 1, x: -1.5, z: 17.15, rotationY: -Math.PI / 2, scale: 1.02 }),
  mushroomPiece("shelf_B_large_decorated", { id: "m2-east-shelf-large", level: 1, x: -1.76, z: 17.15, y: 1.9, rotationY: -Math.PI / 2, scale: 1.12, wallMounted: true }),
  mushroomPiece("shelf_B_small_decorated", { id: "m2-east-shelf-small", level: 1, x: -1.76, z: 18.1, y: 3.0, rotationY: -Math.PI / 2, scale: 1.05, wallMounted: true }),
  mushroomPiece("book_single", { id: "m2-east-shelf-book", level: 1, x: -1.9, z: 17.28, y: 2.27, rotationY: -Math.PI / 2, onWallShelfId: "m2-east-shelf-large" }),
  mushroomPiece("pictureframe_large_A", { id: "m2-east-picture", level: 1, x: -1.72, z: 19.25, y: 2.25, rotationY: -Math.PI / 2, scale: 1.2, wallMounted: true }),
  mushroomPiece("pictureframe_small_C", { id: "m2-east-picture-small", level: 1, x: -1.7, z: 20.15, y: 3.15, rotationY: -Math.PI / 2, scale: 1.25, wallMounted: true }),
  mushroomPiece("cactus_medium_B", { id: "m2-east-cactus", level: 1, x: -1.75, z: 21.45, scale: 0.9 }),

  mushroomPiece("cabinet_medium", { id: "m2-west-cabinet", level: 1, x: -10.02, z: 14.72, rotationY: Math.PI / 2, scale: 0.98 }),
  mushroomPiece("pictureframe_medium", { id: "m2-west-picture", level: 1, x: -10.22, z: 15.95, y: 2.2, rotationY: Math.PI / 2, scale: 1.2, wallMounted: true }),
  mushroomPiece("shelf_A_small", { id: "m2-west-shelf", level: 1, x: -9.75, z: 14.45, y: 2.05, rotationY: Math.PI / 2, scale: 1.2, wallMounted: true }),
  mushroomPiece("pictureframe_standing_B", { id: "m2-west-photo", level: 1, x: -9.95, z: 14.72, y: 0.92, rotationY: Math.PI / 2 }),

  mushroomPiece("rug_oval_A", { id: "m2-reading-rug", level: 1, x: -3.35, z: 14.55, rotationY: -0.12, scale: 1.0 }),
  mushroomPiece("armchair_pillows", { id: "m2-reading-chair", level: 1, x: -3.1, z: 14.05, rotationY: -0.35, scale: 0.96 }),
  mushroomPiece("table_small", { id: "m2-reading-table", level: 1, x: -2.65, z: 14.4, rotationY: 0.08, scale: 0.92 }),
  mushroomPiece("pictureframe_standing_A", { id: "m2-reading-photo", level: 1, x: -2.77, z: 14.4, y: 0.84, rotationY: 0.15 }),
  mushroomPiece("book_single", { id: "m2-reading-book", level: 1, x: -2.5, z: 14.4, y: 0.84, rotationY: -0.35 }),
  mushroomPiece("lamp_standing", { id: "m2-reading-lamp", level: 1, x: -2.5, z: 14.15, scale: 0.88 }),
  mushroomPiece("pillow_B", { id: "m2-floor-cushion", level: 1, x: -1.9, z: 14.8, y: 0.08, rotationY: 0.45, scale: 1.08 }),
  mushroomPiece("pictureframe_large_B", { id: "m2-south-picture", level: 1, x: -4.2, z: 22.18, y: 2.35, rotationY: Math.PI, scale: 1.05, wallMounted: true }),
  mushroomPiece("shelf_B_small", { id: "m2-south-shelf", level: 1, x: -6.05, z: 22.2, y: 2.0, rotationY: Math.PI, scale: 1.15, wallMounted: true }),

  // ----- 顶层星光阁楼 / mushroom-loft — bed canopy + dressing corners -----
  // The bed is tucked into the north-east quadrant and the reading island into
  // the south-east corner. This keeps an open ring from stair B around the
  // centre of the loft while the east dresser and north-west vanity retain the
  // same starlit-bedroom theme.
  mushroomPiece("rug_rectangle_B", { id: "m3-bed-rug", level: 2, x: -4.2, z: 14.35, scale: 1.55 }),
  mushroomPiece("bed_double_B", { id: "m3-bed", ...MUSHROOM_LOFT_BED_ANCHOR }),
  mushroomPiece("cabinet_small_decorated", { id: "m3-nightstand-west", level: 2, x: -5.35, z: 13.95, scale: 0.88 }),
  mushroomPiece("table_small", { id: "m3-nightstand-east", level: 2, x: -3.08, z: 13.95, scale: 0.86 }),
  mushroomPiece("lamp_table", { id: "m3-bed-lamp-west", level: 2, x: -5.35, z: 13.95, y: 1.24, scale: 0.68 }),
  mushroomPiece("lamp_table", { id: "m3-bed-lamp-east", level: 2, x: -3.08, z: 13.95, y: 0.78, scale: 0.68 }),
  mushroomPiece("pillow_A", { id: "m3-bed-pillow-a", level: 2, x: -4.53, z: 13.65, y: 0.72, rotationY: 0.08, scale: 1.05 }),
  mushroomPiece("pillow_B", { id: "m3-bed-pillow-b", level: 2, x: -3.87, z: 13.65, y: 0.72, rotationY: -0.08, scale: 1.05 }),
  mushroomPiece("pictureframe_standing_B", { id: "m3-bed-photo", level: 2, x: -5.35, z: 13.95, y: 1.24, rotationY: 0.12 }),
  mushroomPiece("book_single", { id: "m3-bed-book", level: 2, x: -3.08, z: 13.95, y: 0.78, rotationY: -0.25 }),

  mushroomPiece("cabinet_medium_decorated", { id: "m3-east-dresser", level: 2, x: -1.92, z: 17.15, rotationY: -Math.PI / 2, scale: 1.08 }),
  mushroomPiece("cabinet_medium", { id: "m3-east-storage", level: 2, x: -1.92, z: 19.0, rotationY: -Math.PI / 2, scale: 1.0 }),
  mushroomPiece("cactus_medium_A", { id: "m3-dresser-cactus", level: 2, x: -1.92, z: 17.02, y: 1.68, scale: 0.78 }),
  mushroomPiece("shelf_B_large_decorated", { id: "m3-east-shelf", level: 2, x: -1.73, z: 20.35, y: 2.0, rotationY: -Math.PI / 2, scale: 1.12, wallMounted: true }),
  mushroomPiece("pictureframe_large_A", { id: "m3-east-picture", level: 2, x: -1.7, z: 15.75, y: 2.35, rotationY: -Math.PI / 2, scale: 1.2, wallMounted: true }),
  mushroomPiece("pictureframe_small_C", { id: "m3-east-picture-small", level: 2, x: -1.7, z: 21.45, y: 3.1, rotationY: -Math.PI / 2, scale: 1.25, wallMounted: true }),

  mushroomPiece("rug_oval_A", { id: "m3-reading-rug", level: 2, x: -3.45, z: 20.95, rotationY: -0.16, scale: 1.32 }),
  mushroomPiece("armchair_pillows", { id: "m3-reading-chair", level: 2, x: -2.45, z: 21.2, rotationY: -0.45, scale: 0.98 }),
  mushroomPiece("chair_C", { id: "m3-reading-chair-small", level: 2, x: -4.15, z: 21.35, rotationY: 0.55, scale: 1.02 }),
  mushroomPiece("table_low", { id: "m3-reading-table", level: 2, x: -3.35, z: 20.55, rotationY: -0.12, scale: 0.92 }),
  mushroomPiece("book_set", { id: "m3-reading-books", level: 2, x: -3.53, z: 20.55, y: 0.44, rotationY: 0.25, scale: 0.9 }),
  mushroomPiece("cactus_small_B", { id: "m3-reading-cactus", level: 2, x: -3.08, z: 20.55, y: 0.44, scale: 0.82 }),
  mushroomPiece("lamp_standing", { id: "m3-reading-lamp", level: 2, x: -1.75, z: 21.35, scale: 0.9 }),
  mushroomPiece("pillow_A", { id: "m3-floor-cushion", level: 2, x: -2.05, z: 21.7, y: 0.08, rotationY: -0.4, scale: 1.08 }),

  mushroomPiece("cabinet_small", { id: "m3-west-vanity", level: 2, x: -10.0, z: 14.75, rotationY: Math.PI / 2, scale: 0.95 }),
  mushroomPiece("chair_stool_wood", { id: "m3-vanity-stool", level: 2, x: -9.25, z: 14.75, rotationY: -Math.PI / 2, scale: 0.95 }),
  mushroomPiece("pictureframe_large_B", { id: "m3-vanity-mirror", level: 2, x: -10.2, z: 15.72, y: 1.8, rotationY: Math.PI / 2, scale: 1.0, wallMounted: true }),
  mushroomPiece("cactus_medium_B", { id: "m3-vanity-cactus", level: 2, x: -10.0, z: 14.75, y: 0.84, scale: 0.72 }),
  mushroomPiece("shelf_A_big", { id: "m3-south-shelf", level: 2, x: -8.0, z: 22.18, y: 2.05, rotationY: Math.PI, scale: 1.08, wallMounted: true }),
  mushroomPiece("pictureframe_medium", { id: "m3-south-picture", level: 2, x: -3.25, z: 22.2, y: 2.4, rotationY: Math.PI, scale: 1.2, wallMounted: true }),

  // 天象图鉴 — the observatory's sighting journal lives on its own small wall
  // shelf between the vanity and the light switch, so the E-interaction that
  // opens the catalogue points at a real physical book.
  mushroomPiece("shelf_B_small", { id: "m3-journal-shelf", level: 2, x: -10.15, z: 18.35, y: 1.5, rotationY: Math.PI / 2, wallMounted: true }),
  mushroomPiece("book_set", { id: "m3-journal-book", level: 2, x: -10.0, z: 18.35, y: 1.58, rotationY: Math.PI / 2, scale: 1.0, onWallShelfId: "m3-journal-shelf" })
];

// Basename shared by both vendored furniture directories.
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
  const s = furnitureScaleForPlacement(raw);
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
