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
// Adding a room = copy its Kenney GLBs into public/models/furniture/, append
// records here, and drop that room's procedural set from createModernVilla.

const KIT = (name) => `/models/furniture/${name}.glb`;

// Ground-floor walking surface (great-hall floor box top ≈ 0.11) and the
// upper-floor slab top (≈ 6.65). Pieces sit on these; the loader already
// grounds each model's min-Y to its own origin.
const FLOOR_Y = 0.11;
const UPPER_Y = 6.66;

export const FURNITURE_PLACEMENTS = [
  // ===== 西大厅 / great-hall-west — living room (ground) =====
  // Seating group centred on world (-8, -14). Sofa backs north, faces the
  // door (+Z); coffee table and armchair complete the conversation pit.
  { id: "west-rug", room: "great-hall-west", url: KIT("rugRectangle"), position: [-8, FLOOR_Y, -14], rotationY: 0, scale: 2.7 },
  { id: "west-sofa", room: "great-hall-west", url: KIT("loungeSofaLong"), position: [-8, FLOOR_Y, -16.1], rotationY: 0, scale: 2.3 },
  { id: "west-coffee-table", room: "great-hall-west", url: KIT("tableCoffee"), position: [-8, FLOOR_Y, -13.6], rotationY: 0, scale: 2.2 },
  { id: "west-books", room: "great-hall-west", url: KIT("books"), position: [-8.4, FLOOR_Y + 0.5, -13.6], rotationY: 0.5, scale: 2.0 },
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
  // a wide sideboard against the east wall, and a corner plant.
  { id: "east-table", room: "great-hall-east", url: KIT("table"), position: [8, FLOOR_Y, -13], rotationY: 0, scale: 2.9 },
  { id: "east-chair-n1", room: "great-hall-east", url: KIT("chair"), position: [6.9, FLOOR_Y, -14.3], rotationY: Math.PI, scale: 2.2 },
  { id: "east-chair-n2", room: "great-hall-east", url: KIT("chair"), position: [8, FLOOR_Y, -14.3], rotationY: Math.PI, scale: 2.2 },
  { id: "east-chair-n3", room: "great-hall-east", url: KIT("chair"), position: [9.1, FLOOR_Y, -14.3], rotationY: Math.PI, scale: 2.2 },
  { id: "east-chair-s1", room: "great-hall-east", url: KIT("chair"), position: [6.9, FLOOR_Y, -11.7], rotationY: 0, scale: 2.2 },
  { id: "east-chair-s2", room: "great-hall-east", url: KIT("chair"), position: [8, FLOOR_Y, -11.7], rotationY: 0, scale: 2.2 },
  { id: "east-chair-s3", room: "great-hall-east", url: KIT("chair"), position: [9.1, FLOOR_Y, -11.7], rotationY: 0, scale: 2.2 },
  { id: "east-sideboard", room: "great-hall-east", url: KIT("bookcaseClosedWide"), position: [12.2, FLOOR_Y, -16], rotationY: -Math.PI / 2, scale: 2.2 },
  { id: "east-plant", room: "great-hall-east", url: KIT("pottedPlant"), position: [11.8, FLOOR_Y, -8], rotationY: 0, scale: 2.4 },

  // ===== 二楼主卧 / master-bedroom (upper, y≈6.66) =====
  // Bed centred world (-5.5, -12.5) with headboard north; nightstands + lamps
  // flank it, wardrobe by the west wall, rug underneath.
  { id: "bed-rug", room: "master-bedroom", url: KIT("rugRounded"), position: [-5.5, UPPER_Y, -12], rotationY: 0, scale: 2.0 },
  { id: "bed-double", room: "master-bedroom", url: KIT("bedDouble"), position: [-5.5, UPPER_Y, -12.4], rotationY: 0, scale: 2.2 },
  { id: "bed-nightstand-l", room: "master-bedroom", url: KIT("sideTable"), position: [-7.7, UPPER_Y, -13.7], rotationY: 0, scale: 1.9 },
  { id: "bed-nightstand-r", room: "master-bedroom", url: KIT("sideTable"), position: [-3.5, UPPER_Y, -13.7], rotationY: 0, scale: 1.9 },
  { id: "bed-lamp-l", room: "master-bedroom", url: KIT("lampRoundTable"), position: [-7.7, UPPER_Y + 0.72, -13.7], rotationY: 0, scale: 2.0 },
  { id: "bed-lamp-r", room: "master-bedroom", url: KIT("lampRoundTable"), position: [-3.5, UPPER_Y + 0.72, -13.7], rotationY: 0, scale: 2.0 },
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
  { id: "lounge-plant", room: "lounge-balcony", url: KIT("pottedPlant"), position: [7.4, UPPER_Y, -6.9], rotationY: 0, scale: 2.2 }
];
