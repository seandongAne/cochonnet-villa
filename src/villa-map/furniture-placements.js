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
  // Seating group centred on world (-8, -14). Sofa backs north, faces the
  // door (+Z); coffee table and armchair complete the conversation pit.
  { id: "west-rug", room: "great-hall-west", url: KIT("rugRectangle"), position: [-8, FLOOR_Y, -14], rotationY: 0, scale: 2.7 },
  { id: "west-sofa", room: "great-hall-west", url: KIT("loungeSofaLong"), position: [-8, FLOOR_Y, -16.1], rotationY: 0, scale: 2.05 },
  { id: "west-coffee-table", room: "great-hall-west", url: KIT("tableCoffee"), position: [-8, FLOOR_Y, -13.2], rotationY: 0, scale: 2.2 },
  { id: "west-books", room: "great-hall-west", url: KIT("books"), position: [-8.4, FLOOR_Y + 0.5, -13.2], rotationY: 0.5, scale: 2.0 },
  { id: "west-armchair", room: "great-hall-west", url: KIT("loungeChair"), position: [-10.8, FLOOR_Y, -13.4], rotationY: Math.PI / 2 + 0.35, scale: 2.2 },
  { id: "west-floor-lamp", room: "great-hall-west", url: KIT("lampRoundFloor"), position: [-11.9, FLOOR_Y, -16], rotationY: 0, scale: 2.2 },
  { id: "west-plant", room: "great-hall-west", url: KIT("pottedPlant"), position: [-12, FLOOR_Y, -11.4], rotationY: 0, scale: 2.4 },
  { id: "west-bookcase", room: "great-hall-west", url: KIT("bookcaseOpen"), position: [-12.3, FLOOR_Y, -19], rotationY: Math.PI / 2, scale: 2.3 },

  // ===== 主楼玄关 / entry-foyer — entry vestibule (ground) =====
  // Tight room (x∈[-3,3]); door mat just inside, console + coat rack on the
  // side walls. Room centre world (0, -4.5).
  { id: "foyer-mat", room: "entry-foyer", url: KIT("rugDoormat"), position: [0, FLOOR_Y, -3.2], rotationY: 0, scale: 2.8 },
  { id: "foyer-console", room: "entry-foyer", url: KIT("sideTableDrawers"), position: [-2.5, FLOOR_Y, -4.6], rotationY: Math.PI / 2, scale: 2.2 },
  { id: "foyer-console-plant", room: "entry-foyer", url: KIT("plantSmall2"), position: [-2.5, FLOOR_Y + 0.84, -4.6], rotationY: 0, scale: 2.6 },
  { id: "foyer-coat-rack", room: "entry-foyer", url: KIT("coatRackStanding"), position: [2.4, FLOOR_Y, -5.4], rotationY: 0, scale: 2.2 },

  // ===== 东大厅 / great-hall-east — dining hall (ground) =====
  // Long dining table centred world (8, -13) with chairs on both long sides,
  // a wide sideboard against the east wall, and a corner plant. Each chair faces
  // INWARD onto the table — the `chair` model's backrest sits on its -Z side at
  // rotationY 0, so the NORTH row (z=-14.3, table to their +Z) stays at 0 and the
  // SOUTH row (z=-11.7, table to their -Z) turns Math.PI. (Earlier these were
  // swapped, which poked the backrests up through the tabletop.)
  { id: "east-table", room: "great-hall-east", url: KIT("table"), position: [8, FLOOR_Y, -13], rotationY: 0, scale: 2.9 },
  { id: "east-chair-n1", room: "great-hall-east", url: KIT("chair"), position: [6.9, FLOOR_Y, -14.3], rotationY: 0, scale: 2.2 },
  { id: "east-chair-n2", room: "great-hall-east", url: KIT("chair"), position: [8, FLOOR_Y, -14.3], rotationY: 0, scale: 2.2 },
  { id: "east-chair-n3", room: "great-hall-east", url: KIT("chair"), position: [9.1, FLOOR_Y, -14.3], rotationY: 0, scale: 2.2 },
  { id: "east-chair-s1", room: "great-hall-east", url: KIT("chair"), position: [6.9, FLOOR_Y, -11.7], rotationY: Math.PI, scale: 2.2 },
  { id: "east-chair-s2", room: "great-hall-east", url: KIT("chair"), position: [8, FLOOR_Y, -11.7], rotationY: Math.PI, scale: 2.2 },
  { id: "east-chair-s3", room: "great-hall-east", url: KIT("chair"), position: [9.1, FLOOR_Y, -11.7], rotationY: Math.PI, scale: 2.2 },
  { id: "east-sideboard", room: "great-hall-east", url: KIT("bookcaseClosedWide"), position: [12.2, FLOOR_Y, -16], rotationY: -Math.PI / 2, scale: 2.2 },
  { id: "east-plant", room: "great-hall-east", url: KIT("pottedPlant"), position: [11.8, FLOOR_Y, -8], rotationY: 0, scale: 2.4 },

  // ===== 二楼主卧 / master-bedroom (upper, y≈6.66) =====
  // Bed centred world (-5.5, -12.5) with headboard north; nightstands + lamps
  // flank it, wardrobe by the west wall, rug underneath.
  { id: "bed-rug", room: "master-bedroom", url: KIT("rugRounded"), position: [-5.5, UPPER_Y, -12], rotationY: 0, scale: 2.0 },
  { id: "bed-double", room: "master-bedroom", url: KIT("bedDouble"), position: [-5.5, UPPER_Y, -12.4], rotationY: 0, scale: 1.9 },
  { id: "bed-nightstand-l", room: "master-bedroom", url: KIT("sideTable"), position: [-6.88, UPPER_Y, -15.05], rotationY: 0, scale: 1.9 },
  { id: "bed-nightstand-r", room: "master-bedroom", url: KIT("sideTable"), position: [-4.12, UPPER_Y, -15.05], rotationY: 0, scale: 1.9 },
  { id: "bed-lamp-l", room: "master-bedroom", url: KIT("lampRoundTable"), position: [-6.88, UPPER_Y + 0.72, -15.05], rotationY: 0, scale: 2.0 },
  { id: "bed-lamp-r", room: "master-bedroom", url: KIT("lampRoundTable"), position: [-4.12, UPPER_Y + 0.72, -15.05], rotationY: 0, scale: 2.0 },
  { id: "bed-wardrobe", room: "master-bedroom", url: KIT("bookcaseClosedDoors"), position: [-7.6, UPPER_Y, -8], rotationY: Math.PI / 2, scale: 2.1 },

  // ===== 二楼书房 / study-loft (upper, y≈6.66) =====
  // Desk against the north wall facing the chair; bookcase on the east wall;
  // a reading chair in the corner. Room centre world (5.5, -13.5).
  { id: "study-desk", room: "study-loft", url: KIT("desk"), position: [5.5, UPPER_Y, -14.8], rotationY: 0, scale: 2.2 },
  { id: "study-chair", room: "study-loft", url: KIT("chairDesk"), position: [5.5, UPPER_Y, -13.9], rotationY: Math.PI, scale: 2.2 },
  { id: "study-monitor", room: "study-loft", url: KIT("computerScreen"), position: [5.5, UPPER_Y + 0.84, -15], rotationY: 0, scale: 2.0 },
  { id: "study-bookcase", room: "study-loft", url: KIT("bookcaseOpen"), position: [7.6, UPPER_Y, -14], rotationY: -Math.PI / 2, scale: 2.3 },
  { id: "study-books", room: "study-loft", url: KIT("books"), position: [4.9, UPPER_Y + 0.84, -15], rotationY: -0.3, scale: 1.9 },
  { id: "study-reading-chair", room: "study-loft", url: KIT("loungeChair"), position: [4.2, UPPER_Y, -12.3], rotationY: -0.7, scale: 2.1 },

  // ===== 二楼阳台休息区 / lounge-balcony (upper, y≈6.66) =====
  // Two relax chairs facing the balcony glass (+Z), a shared side table, a
  // round rug, and a corner plant. Room centre world (5.5, -8.5).
  { id: "lounge-rug", room: "lounge-balcony", url: KIT("rugRound"), position: [5.5, UPPER_Y, -8.6], rotationY: 0, scale: 2.3 },
  { id: "lounge-chair-l", room: "lounge-balcony", url: KIT("loungeChairRelax"), position: [4.5, UPPER_Y, -9], rotationY: 0, scale: 1.9 },
  { id: "lounge-chair-r", room: "lounge-balcony", url: KIT("loungeChairRelax"), position: [6.5, UPPER_Y, -9], rotationY: 0, scale: 1.9 },
  { id: "lounge-side-table", room: "lounge-balcony", url: KIT("sideTable"), position: [5.5, UPPER_Y, -9.4], rotationY: 0, scale: 1.7 },
  { id: "lounge-plant", room: "lounge-balcony", url: KIT("pottedPlant"), position: [7.4, UPPER_Y, -6.9], rotationY: 0, scale: 2.2 },

  // ============================================================================
  // 「猪窝」cozy-clutter pass — pile every room with layered rugs, greenery,
  // books, warm lamps and extra seating so the villa reads lived-in and snug,
  // not show-home empty. Almost all of these are NON-SOLID decor (plants / books
  // / lamps / rugs / stools) so they crowd together without trapping the player
  // or tripping the solid-overlap guard; the only solid accents are two side
  // tables tucked into genuinely empty corners. Reuses already-vendored kit
  // models only — no new GLBs.
  // ============================================================================

  // ----- 西大厅 / great-hall-west (living) — reading nook + extra seats + green -----
  { id: "west-nook-rug", room: "great-hall-west", url: KIT("rugRound"), position: [-11.2, FLOOR_Y, -10.2], rotationY: 0, scale: 1.7 },
  { id: "west-accent-table", room: "great-hall-west", url: KIT("sideTable"), position: [-12.0, FLOOR_Y, -10.0], rotationY: 0, scale: 1.4 },
  { id: "west-accent-lamp", room: "great-hall-west", url: KIT("lampRoundTable"), position: [-12.0, FLOOR_Y + 0.53, -10.0], rotationY: 0, scale: 1.9 },
  { id: "west-accent-books", room: "great-hall-west", url: KIT("books"), position: [-11.6, FLOOR_Y + 0.53, -9.7], rotationY: -0.4, scale: 1.7 },
  { id: "west-stool", room: "great-hall-west", url: KIT("chair"), position: [-6.0, FLOOR_Y, -11.6], rotationY: -1.1, scale: 2.0 },
  { id: "west-ottoman", room: "great-hall-west", url: KIT("chair"), position: [-8.0, FLOOR_Y, -11.3], rotationY: 0, scale: 2.0 },
  { id: "west-corner-plant", room: "great-hall-west", url: KIT("pottedPlant"), position: [-4.6, FLOOR_Y, -4.4], rotationY: 0, scale: 2.5 },
  { id: "west-sofa-plant", room: "great-hall-west", url: KIT("plantSmall2"), position: [-5.6, FLOOR_Y, -16.4], rotationY: 0, scale: 2.8 },
  { id: "west-shelf-books", room: "great-hall-west", url: KIT("books"), position: [-12.2, FLOOR_Y + 1.05, -18.6], rotationY: 0.25, scale: 1.9 },
  { id: "west-floor-books", room: "great-hall-west", url: KIT("books"), position: [-9.9, FLOOR_Y, -12.4], rotationY: 0.8, scale: 1.8 },

  // ----- 东大厅 / great-hall-east (dining) — rug under the table, serving cart, green -----
  { id: "east-dining-rug", room: "great-hall-east", url: KIT("rugRectangle"), position: [8, FLOOR_Y, -13], rotationY: 0, scale: 2.7 },
  { id: "east-bar-cart", room: "great-hall-east", url: KIT("sideTable"), position: [11.9, FLOOR_Y, -11.5], rotationY: -Math.PI / 2, scale: 1.5 },
  { id: "east-cart-plant", room: "great-hall-east", url: KIT("plantSmall2"), position: [11.9, FLOOR_Y + 0.6, -11.5], rotationY: 0, scale: 2.6 },
  { id: "east-sideboard-books", room: "great-hall-east", url: KIT("books"), position: [12.1, FLOOR_Y + 1.05, -16.4], rotationY: -1.3, scale: 1.9 },
  { id: "east-table-books", room: "great-hall-east", url: KIT("books"), position: [8.4, FLOOR_Y + 1.1, -12.7], rotationY: 0.4, scale: 1.7 },
  { id: "east-corner-plant", room: "great-hall-east", url: KIT("pottedPlant"), position: [4.6, FLOOR_Y, -4.4], rotationY: 0, scale: 2.5 },
  { id: "east-corner-lamp", room: "great-hall-east", url: KIT("lampRoundFloor"), position: [3.8, FLOOR_Y, -20.4], rotationY: 0, scale: 2.2 },

  // ----- 主楼玄关 / entry-foyer — layered runner + a little greenery -----
  { id: "foyer-runner", room: "entry-foyer", url: KIT("rugDoormat"), position: [0, FLOOR_Y, -5.4], rotationY: 0, scale: 3.0 },
  { id: "foyer-corner-plant", room: "entry-foyer", url: KIT("pottedPlant"), position: [2.5, FLOOR_Y, -3.4], rotationY: 0, scale: 2.0 },
  { id: "foyer-console-books", room: "entry-foyer", url: KIT("books"), position: [-2.7, FLOOR_Y + 0.84, -4.2], rotationY: 0.3, scale: 1.6 },

  // ----- 二楼主卧 / master-bedroom — reading chair + plants + throw rug + books -----
  { id: "bed-armchair", room: "master-bedroom", url: KIT("loungeChair"), position: [-3.6, UPPER_Y, -8.8], rotationY: 2.4, scale: 1.8 },
  { id: "bed-armchair-rug", room: "master-bedroom", url: KIT("rugRound"), position: [-3.8, UPPER_Y, -8.8], rotationY: 0, scale: 1.4 },
  { id: "bed-corner-plant", room: "master-bedroom", url: KIT("pottedPlant"), position: [-7.5, UPPER_Y, -15.2], rotationY: 0, scale: 2.1 },
  { id: "bed-floor-lamp", room: "master-bedroom", url: KIT("lampRoundFloor"), position: [-3.5, UPPER_Y, -11.0], rotationY: 0, scale: 1.9 },
  { id: "bed-stack-books", room: "master-bedroom", url: KIT("books"), position: [-4.3, UPPER_Y + 0.72, -14.8], rotationY: -0.5, scale: 1.6 },

  // ----- 二楼书房 / study-loft — reading lamp, rug, plant, more books -----
  { id: "study-reading-lamp", room: "study-loft", url: KIT("lampRoundFloor"), position: [3.5, UPPER_Y, -11.6], rotationY: 0, scale: 1.9 },
  { id: "study-rug", room: "study-loft", url: KIT("rugRound"), position: [4.3, UPPER_Y, -12.4], rotationY: 0, scale: 1.4 },
  { id: "study-corner-plant", room: "study-loft", url: KIT("plantSmall2"), position: [7.5, UPPER_Y, -11.6], rotationY: 0, scale: 2.6 },
  { id: "study-desk-books", room: "study-loft", url: KIT("books"), position: [6.0, UPPER_Y + 0.84, -14.6], rotationY: 0.3, scale: 1.7 },

  // ----- 二楼阳台休息区 / lounge-balcony — pouf, plant, lamp, books -----
  { id: "lounge-pouf", room: "lounge-balcony", url: KIT("chair"), position: [5.5, UPPER_Y, -7.3], rotationY: Math.PI, scale: 2.0 },
  { id: "lounge-floor-lamp", room: "lounge-balcony", url: KIT("lampRoundFloor"), position: [3.6, UPPER_Y, -6.6], rotationY: 0, scale: 1.9 },
  { id: "lounge-corner-plant", room: "lounge-balcony", url: KIT("plantSmall2"), position: [3.6, UPPER_Y, -9.9], rotationY: 0, scale: 2.6 },
  { id: "lounge-side-books", room: "lounge-balcony", url: KIT("books"), position: [5.5, UPPER_Y + 0.64, -9.4], rotationY: 0.4, scale: 1.5 }
];

// basename of a `/models/furniture/<name>.glb` url.
function modelName(url) {
  return url.slice(url.lastIndexOf("/") + 1, -".glb".length);
}

// Stamp every record once at module load with the derived fields the Phase-3
// shadow + collider layers read. `footprint` is the world-space (metres) XZ
// extent: native size × base scale × the per-piece scale, so consumers never
// re-apply a scale or know the kit's base factor. `floor` is 0 for ground
// pieces, 1 for the upper storey (split on Y; only solid pieces — which sit
// exactly on a floor surface — drive colliders). Per-piece `solid` / `noShadow`
// on a raw record override the model policy.
export const FURNITURE_PLACEMENTS = RAW_PLACEMENTS.map((raw) => {
  const name = modelName(raw.url);
  const native = FURNITURE_FOOTPRINTS[name] ?? { x: 0.5, z: 0.5 };
  const s = FURNITURE_BASE_SCALE * (raw.scale ?? 1);
  const policy = FURNITURE_POLICY[name] ?? {};
  return {
    ...raw,
    model: name,
    floor: raw.position[1] > 3.5 ? 1 : 0,
    footprint: { x: native.x * s, z: native.z * s },
    solid: raw.solid ?? policy.solid ?? false,
    noShadow: raw.noShadow ?? policy.noShadow ?? false
  };
});
