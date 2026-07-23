// Placement data for the GLB-backed porkies scattered across the villa map.
// Pulled out of the old scene.js so both the React Scene component and the
// test suite consume the same source of truth (data, not source-string regex).
//
// Each entry feeds createPorkyModel(materials, entry): `variant`, `mic`,
// `modelScale`, and `fallbackScale` are read by the factory; `position` and
// `rotationY` are applied to the mounted group by the Scene component.
//
// rotationY ≈ Math.PI means the piglet faces south (+Z), toward the entry path,
// so its sculpted face is visible to a player walking in from the gate.
import {
  MUSHROOM_INTERIOR_FLOOR_Y,
  scaleMushroomInteriorPoint
} from "./mushroom-interior-config.js";
import {
  MUSHROOM_LOFT_BED_POSITION,
  MUSHROOM_LOFT_BED_TOP_Y
} from "./furniture-placements.js";

const mushroomSleeperXZ = scaleMushroomInteriorPoint(-7.2, 19.6);
const MAIN_FLOOR_Y = 0.12;
const UPPER_FLOOR_Y = 6.7;
const OUTDOOR_Y = 0.03;

function mushroomPorkyPosition(x, level, z) {
  const point = scaleMushroomInteriorPoint(x, z);
  return [
    point.x,
    MUSHROOM_INTERIOR_FLOOR_Y[level] + 0.06,
    point.z
  ];
}

export const PORKY_PLACEMENTS = [
  {
    id: "guaguazhu",
    variant: "daigua",
    mic: true,
    modelScale: 1.02,
    fallbackScale: 1.0,
    position: [-3.6, 0, 4],
    rotationY: Math.PI - 0.35
  },
  {
    id: "great-hall-giant",
    variant: "big-ear-piglet",
    modelScale: 1.2,
    fallbackScale: 1.4,
    position: [-5, MAIN_FLOOR_Y, -13],
    rotationY: -0.35
  },
  {
    id: "tiny-corner",
    variant: "wild-piglet",
    modelScale: 0.62,
    fallbackScale: 0.55,
    position: [7, MAIN_FLOOR_Y, -18.6],
    rotationY: -1.2
  },
  {
    id: "master-bedroom",
    variant: "guadai",
    modelScale: 0.78,
    fallbackScale: 0.7,
    position: [-4.0, 6.7, -9.5],
    rotationY: 1.2
  },
  {
    id: "study-loft",
    variant: "wild-piglet",
    modelScale: 0.66,
    fallbackScale: 0.6,
    position: [4.0, 6.72, -12.8],
    rotationY: 0.4
  },
  {
    id: "lounge-balcony",
    variant: "daigua",
    modelScale: 0.7,
    fallbackScale: 0.62,
    position: [6.4, 6.72, -8],
    rotationY: -0.7
  },
  {
    id: "porch",
    variant: "guadai",
    modelScale: 0.76,
    fallbackScale: 0.68,
    position: [2.6, 0.02, 3.2],
    rotationY: Math.PI + 0.25
  },
  {
    id: "mushroom",
    variant: "wild-piglet",
    modelScale: 0.72,
    fallbackScale: 0.62,
    position: [-12.5, 0.03, 14.2],
    rotationY: 0.95
  },
  {
    id: "hot-spring",
    variant: "daigua",
    area: "outdoor",
    floor: 0,
    clearanceRadius: 0.55,
    modelScale: 0.68,
    fallbackScale: 0.58,
    // Moved west onto its own grass patch: the old spot brushed the raised
    // hot-spring entry terrace and read as if the pig were clipping through
    // the fountain edge from the courtyard approach.
    position: [12.5, OUTDOOR_Y, 13.5],
    rotationY: -1.65
  },
  {
    // Napping on the rug edge inside the mushroom-house pocket interior
    // (its normalized XZ migrates with the 4x room; the pig stays pig-sized).
    id: "mushroom-sleeper",
    variant: "guadai",
    modelScale: 0.68,
    fallbackScale: 0.6,
    position: [
      mushroomSleeperXZ.x,
      MUSHROOM_INTERIOR_FLOOR_Y[0] + 0.05,
      mushroomSleeperXZ.z
    ],
    rotationY: 0.9
  },

  // ===== New Meshy residents: main villa (5) =============================
  // Ground-floor figures occupy the open front edges of each hall, keeping
  // the central entry/stair route and all furniture footprints clear.
  {
    id: "meshy-cleaning-foyer",
    variant: "cleaning-day-piglet",
    source: "meshy",
    area: "main-villa",
    room: "entry-foyer",
    floor: 0,
    clearanceRadius: 0.75,
    position: [4.2, MAIN_FLOOR_Y, -7.4],
    rotationY: 0
  },
  {
    id: "meshy-pop-star-west-hall",
    variant: "pop-star-pig",
    source: "meshy",
    area: "main-villa",
    room: "great-hall-west",
    floor: 0,
    clearanceRadius: 0.6,
    position: [-4.6, MAIN_FLOOR_Y, -8.0],
    rotationY: 0
  },
  {
    id: "meshy-muscle-east-hall",
    variant: "muscle-pig",
    source: "meshy",
    area: "main-villa",
    room: "great-hall-east",
    floor: 0,
    clearanceRadius: 0.65,
    position: [10.2, MAIN_FLOOR_Y, -8.2],
    rotationY: -0.55
  },
  {
    id: "meshy-smoky-west-hall",
    variant: "smoky-city-swine",
    source: "meshy",
    area: "main-villa",
    room: "great-hall-west",
    floor: 0,
    clearanceRadius: 0.55,
    position: [-10.3, MAIN_FLOOR_Y, -8.4],
    rotationY: 0.45
  },
  {
    id: "meshy-gaming-bedroom",
    variant: "gaming-piglet",
    source: "meshy",
    area: "main-villa",
    room: "master-bedroom",
    floor: 1,
    clearanceRadius: 0.7,
    position: [-7.15, UPPER_FLOOR_Y, -10.0],
    rotationY: 1.03
  },

  // ===== New Meshy residents: mushroom-house pocket interior (5) =========
  // The pocket room is scaled 4x while the pigs remain life-sized. Positions
  // use the original normalized tower coordinates so they stay on the correct
  // side of both stairwells even if the pocket scale changes later.
  {
    id: "meshy-watermelon-hearth",
    variant: "watermelon-hat-pig",
    source: "meshy",
    area: "mushroom-house",
    room: "mushroom-hearth",
    floor: 2,
    clearanceRadius: 0.55,
    position: mushroomPorkyPosition(-3.8, 0, 15.5),
    rotationY: -0.72
  },
  {
    id: "meshy-cozy-den",
    variant: "cozy-checker-piglet",
    source: "meshy",
    area: "mushroom-house",
    room: "mushroom-den",
    floor: 3,
    clearanceRadius: 0.65,
    position: mushroomPorkyPosition(-8.8, 1, 15.4),
    rotationY: 0.82
  },
  {
    id: "meshy-librarian-den",
    variant: "enchanted-librarian-pig",
    source: "meshy",
    area: "mushroom-house",
    room: "mushroom-den",
    floor: 3,
    clearanceRadius: 0.7,
    position: mushroomPorkyPosition(-5.4, 1, 21.4),
    rotationY: -2.95
  },
  {
    id: "meshy-sleepy-loft",
    variant: "sleepy-piglet",
    source: "meshy",
    area: "mushroom-house",
    room: "mushroom-loft",
    floor: 4,
    clearanceRadius: 0.75,
    // The sleeping model is grounded by its loader, so its Y anchor belongs
    // on the measured top of the Kenney bed rather than on the room floor.
    position: [
      MUSHROOM_LOFT_BED_POSITION[0],
      MUSHROOM_LOFT_BED_TOP_Y + 0.02,
      MUSHROOM_LOFT_BED_POSITION[2]
    ],
    rotationY: 0,
    onFurnitureId: "m3-bed"
  },
  {
    id: "meshy-pampered-loft",
    variant: "pampered-piglet",
    source: "meshy",
    area: "mushroom-house",
    room: "mushroom-loft",
    floor: 4,
    clearanceRadius: 1.05,
    position: mushroomPorkyPosition(-3.8, 2, 20.2),
    rotationY: -2.35
  },

  // ===== New Meshy residents: courtyard / meadow (4) =====================
  // These form separate little destinations rather than one outdoor cluster:
  // fountain garden, campfire picnic, dog-house meadow, and east driveway.
  {
    id: "meshy-muddy-fountain-garden",
    variant: "muddy-piglet",
    source: "meshy",
    area: "outdoor",
    room: "courtyard",
    floor: 0,
    clearanceRadius: 0.75,
    position: [-12.8, OUTDOOR_Y, 6.0],
    rotationY: 1.04
  },
  {
    id: "meshy-bbq-campfire",
    variant: "bbq-feast-pig",
    source: "meshy",
    area: "outdoor",
    room: "courtyard",
    floor: 0,
    clearanceRadius: 0.72,
    position: [-18.0, OUTDOOR_Y, 14.5],
    rotationY: Math.PI / 2
  },
  {
    id: "meshy-pilot-dog-meadow",
    variant: "four-legged-piglet",
    source: "meshy",
    area: "outdoor",
    room: "dog-house-view",
    floor: 0,
    clearanceRadius: 0.9,
    position: [-17.2, OUTDOOR_Y, 20.5],
    rotationY: -0.47
  },
  {
    id: "meshy-car-east-drive",
    variant: "car-piglet",
    source: "meshy",
    area: "outdoor",
    room: "courtyard",
    floor: 0,
    clearanceRadius: 0.75,
    position: [9.5, OUTDOOR_Y, 16.5],
    rotationY: 0
  }
];
