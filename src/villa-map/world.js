import { deriveFurnitureColliders } from "./furniture-colliders.js";
import { FURNITURE_PLACEMENTS } from "./furniture-placements.js";
import { EXTERIOR_PLACEMENTS } from "./exterior-placements.js";
import { ARCHITECTURE_PLACEMENTS } from "./architecture-placements.js";
import {
  MUSHROOM_FLOOR_Y_RANGES,
  MUSHROOM_FURNITURE_SCALE,
  MUSHROOM_INTERIOR_BASE_Y,
  MUSHROOM_INTERIOR_CENTER,
  MUSHROOM_INTERIOR_EYE_Y,
  MUSHROOM_INTERIOR_FLOOR_Y,
  MUSHROOM_INTERIOR_LEVEL_HEIGHT,
  MUSHROOM_INTERIOR_SCALE,
  scaleMushroomInteriorPoint,
  scaleMushroomInteriorX,
  scaleMushroomInteriorZ
} from "./mushroom-interior-config.js";

// Y level constants for the main villa.
// Ground floor walls run from y=0 to y=5.6 (lowerHeight in createModernVilla).
// Upper floor slab sits at y=6.65 (lowerHeight + 1.05). Upper walls cap at y=11.25.
// Player ground-floor eye height = 1.6 (matches player.start.y).
// Player upper-floor eye height = 8.05 (slab 6.65 + 1.4 standing height).
const GROUND_FLOOR_MIN_Y = 0;
const GROUND_FLOOR_MAX_Y = 5.6;
const UPPER_FLOOR_MIN_Y = 6.65;
const UPPER_FLOOR_MAX_Y = 11.25;
const UPPER_FLOOR_EYE_Y = 8.05;

// Upper-floor slab footprint (world coords). Used by isOnUpperFloor for snapping
// camera Y and by interaction filtering.
const UPPER_FLOOR_FOOTPRINT = {
  minX: -8,
  maxX: 8,
  minZ: -16,
  maxZ: -6
};

// Stair zone (world coords). Player enters at maxZ (south, y=1.6), exits at
// minZ (north, y=8.05). Y target lerps with progress along z.
const STAIR_ZONE = {
  id: "main-stairs",
  minX: -1.5,
  maxX: 1.5,
  minZ: -12,
  maxZ: -8,
  floorY: 1.6,
  upperY: UPPER_FLOOR_EYE_Y,
  speedMultiplier: 0.8
};

// ============================================================================
// Mushroom-house interior — an independent three-storey "pocket" space buried
// UNDERGROUND. Entering/leaving happens via teleport actions, so its dimensions
// no longer depend on the exterior mushroom. The visual shell and its layout
// coordinates are uniformly 4x; the player stays human-scale and furniture is
// separately reduced to 0.8x of its former model size.
//
// Levels (slab TOP y): L1 -80, L2 -64, L3 -48. Player eye = slab + 1.6.
// Every interior zone and collider carries a Y activation band so courtyard
// players (y≈1.6) standing over the buried tower never interact with it.
// ============================================================================
const mushroomSpawnXZ = scaleMushroomInteriorPoint(-6, 20.8);
export const MUSHROOM_INTERIOR = {
  scale: MUSHROOM_INTERIOR_SCALE,
  furnitureScale: MUSHROOM_FURNITURE_SCALE,
  center: MUSHROOM_INTERIOR_CENTER,
  baseY: MUSHROOM_INTERIOR_BASE_Y,
  levelHeight: MUSHROOM_INTERIOR_LEVEL_HEIGHT,
  floorY: MUSHROOM_INTERIOR_FLOOR_Y,
  eyeY: MUSHROOM_INTERIOR_EYE_Y,
  // Inner walkable square (the visual shell is a cylinder r≈4.75; corner
  // colliders below knock the square back toward an octagon).
  footprint: {
    minX: scaleMushroomInteriorX(-10.4),
    maxX: scaleMushroomInteriorX(-1.6),
    minZ: scaleMushroomInteriorZ(13.6),
    maxZ: scaleMushroomInteriorZ(22.4)
  },
  spawn: { ...mushroomSpawnXZ, y: MUSHROOM_INTERIOR_EYE_Y[0], yaw: 0 },
  exitSpawn: { x: -6, y: 1.6, z: 24.2, yaw: Math.PI }
};

// Per-level Y activation bands (camera Y while standing on that level is the
// eyeY above; bands tile the whole tower so stair interpolation hands over
// cleanly between levels).
const MUSH_L1_Y = MUSHROOM_FLOOR_Y_RANGES[2];
const MUSH_L2_Y = MUSHROOM_FLOOR_Y_RANGES[3];
const MUSH_L3_Y = MUSHROOM_FLOOR_Y_RANGES[4];
const MUSH_ALL_Y = {
  minY: MUSHROOM_INTERIOR_BASE_Y - 2,
  maxY: MUSH_L3_Y.maxY
};

// Interior stair flights. Both ascend NORTHWARD (enter at maxZ on the lower
// level, exit at minZ on the upper one) exactly like the villa stair, and both
// are Y-scoped so only players already inside the tower are captured.
// Their authored 2.4 m width becomes 9.6 m in the 4x pocket; player radius and
// walking speed remain unchanged so the enlarged stairs feel genuinely roomy.
const MUSHROOM_STAIR_A = {
  id: "mushroom-stairs-a", // L1 → L2, east side
  minX: scaleMushroomInteriorX(-4.5),
  maxX: scaleMushroomInteriorX(-2.1),
  minZ: scaleMushroomInteriorZ(16.6),
  maxZ: scaleMushroomInteriorZ(21),
  floorY: MUSHROOM_INTERIOR.eyeY[0],
  upperY: MUSHROOM_INTERIOR.eyeY[1],
  speedMultiplier: 0.8,
  minY: MUSH_L1_Y.minY,
  maxY: MUSH_L2_Y.maxY
};
const MUSHROOM_STAIR_B = {
  id: "mushroom-stairs-b", // L2 → L3, west side
  minX: scaleMushroomInteriorX(-9.9),
  maxX: scaleMushroomInteriorX(-7.5),
  minZ: scaleMushroomInteriorZ(16.6),
  maxZ: scaleMushroomInteriorZ(21),
  floorY: MUSHROOM_INTERIOR.eyeY[1],
  upperY: MUSHROOM_INTERIOR.eyeY[2],
  speedMultiplier: 0.8,
  minY: MUSH_L2_Y.minY,
  maxY: MUSH_L3_Y.maxY
};

function mushroomFloorZone(level, band) {
  const fp = MUSHROOM_INTERIOR.footprint;
  return {
    id: `mushroom-floor-${level + 1}`,
    minX: fp.minX,
    maxX: fp.maxX,
    minZ: fp.minZ,
    maxZ: fp.maxZ,
    eyeY: MUSHROOM_INTERIOR.eyeY[level],
    minY: band.minY,
    maxY: band.maxY
  };
}

function mushroomInteractionPosition(x, level, z) {
  const point = scaleMushroomInteriorPoint(x, z);
  return {
    ...point,
    y: MUSHROOM_INTERIOR.eyeY[level] - 0.1
  };
}

function mushroomInteriorColliders() {
  const scaledBox = (id, x, z, width, depth, yRange) => {
    const point = scaleMushroomInteriorPoint(x, z);
    return boxCollider(
      id,
      point.x,
      point.z,
      width * MUSHROOM_INTERIOR_SCALE,
      depth * MUSHROOM_INTERIOR_SCALE,
      yRange
    );
  };

  return [
    // Perimeter (inner faces ≈ ±4.4 from the centre). No corner blocks — they
    // would pinch the stair-flight entries shut once the player radius is
    // added; the visual "soil shell" around the tower covers the diagonal
    // overshoot instead.
    scaledBox("mushroom-int-wall-n", -6, 13.3, 9.6, 0.6, MUSH_ALL_Y),
    scaledBox("mushroom-int-wall-s", -6, 22.7, 9.6, 0.6, MUSH_ALL_Y),
    scaledBox("mushroom-int-wall-e", -1.3, 18, 0.6, 9.6, MUSH_ALL_Y),
    scaledBox("mushroom-int-wall-w", -10.7, 18, 0.6, 9.6, MUSH_ALL_Y),
    // Stair side rails. Their normalized spans scale with the flight, while
    // both ends stay open so players can enter and leave cleanly.
    scaledBox("mushroom-stair-a-rail-w", -4.6, 18.7, 0.2, 3.0, { minY: MUSHROOM_STAIR_A.minY, maxY: MUSHROOM_STAIR_A.maxY }),
    scaledBox("mushroom-stair-a-rail-e", -2.0, 18.7, 0.2, 3.0, { minY: MUSHROOM_STAIR_A.minY, maxY: MUSHROOM_STAIR_A.maxY }),
    scaledBox("mushroom-stair-b-rail-w", -10.0, 18.7, 0.2, 3.0, { minY: MUSHROOM_STAIR_B.minY, maxY: MUSHROOM_STAIR_B.maxY }),
    scaledBox("mushroom-stair-b-rail-e", -7.4, 18.7, 0.2, 3.0, { minY: MUSHROOM_STAIR_B.minY, maxY: MUSHROOM_STAIR_B.maxY }),
    // Under-stair blocks: stop the LOWER level's players from wandering into
    // the solid upper half of a flight and getting yanked up by the stair
    // zone. Their Y bands only catch a player still standing on the lower
    // floor, so ascending/descending players never brush them.
    scaledBox("mushroom-stair-a-under", -3.3, 17.05, 2.4, 1.5, {
      minY: MUSH_L1_Y.minY,
      maxY: MUSHROOM_INTERIOR.eyeY[0] + 2
    }),
    scaledBox("mushroom-stair-b-under", -8.7, 17.05, 2.4, 1.5, {
      minY: MUSH_L2_Y.minY,
      maxY: MUSHROOM_INTERIOR.eyeY[1] + 2
    }),
    // Stairwell rim guards on the level ABOVE each flight's low (south) end so
    // nobody strolls off the slab edge into the open well. Ascending players
    // pass beneath the band; the level's own walkers are blocked.
    scaledBox("mushroom-stair-a-rim", -3.3, 21.15, 2.8, 0.4, MUSH_L2_Y),
    scaledBox("mushroom-stair-b-rim", -8.7, 21.15, 2.8, 0.4, MUSH_L3_Y)
  ];
}

export function createVillaWorld() {
  return {
    player: {
      start: { x: 0, y: 1.6, z: 18 },
      speed: 5.2,
      radius: 0.62
    },
    // The old perimeter fence is gone — the whole meadow around the estate is
    // explorable now. Bounds stop the player well before the ground plane ends.
    bounds: {
      minX: -40,
      maxX: 44,
      minZ: -40,
      maxZ: 42
    },
    upperFloorY: UPPER_FLOOR_EYE_Y,
    upperFloorFootprint: UPPER_FLOOR_FOOTPRINT,
    rooms: [
      {
        id: "courtyard",
        name: "山庄庭院",
        center: { x: 0, z: 11 },
        size: { x: 48, z: 30 }
      },
      {
        id: "main-villa",
        name: "主楼外廊",
        center: { x: 0, z: -0.5 },
        size: { x: 26, z: 8 }
      },
      {
        id: "entry-foyer",
        name: "主楼玄关",
        floor: 0,
        center: { x: 0, z: -4.5 },
        size: { x: 6, z: 5 }
      },
      {
        id: "great-hall-west",
        name: "西大厅",
        floor: 0,
        center: { x: -8, z: -13 },
        size: { x: 10, z: 22 }
      },
      {
        id: "great-hall-east",
        name: "东大厅",
        floor: 0,
        center: { x: 8, z: -13 },
        size: { x: 10, z: 22 }
      },
      {
        id: "stair-vestibule",
        name: "楼梯间",
        floor: 0,
        center: { x: 0, z: -10 },
        size: { x: 6, z: 6 }
      },
      {
        id: "master-bedroom",
        name: "二楼主卧",
        floor: 1,
        center: { x: -5.5, z: -11 },
        size: { x: 5, z: 10 }
      },
      {
        id: "study-loft",
        name: "二楼书房",
        floor: 1,
        center: { x: 5.5, z: -13.5 },
        size: { x: 5, z: 5 }
      },
      {
        id: "lounge-balcony",
        name: "二楼阳台休息区",
        floor: 1,
        center: { x: 5.5, z: -8.5 },
        size: { x: 5, z: 5 }
      },
      {
        id: "hot-springs",
        name: "温泉区",
        center: { x: 18.5, z: 4.3 },
        size: { x: 12, z: 30 }
      },
      {
        id: "mushroom-house",
        name: "小猪蘑菇屋",
        center: { x: -3, z: 18 },
        size: { x: 8, z: 7 }
      },
      {
        id: "mushroom-hearth",
        name: "蘑菇屋·一层灶间",
        center: MUSHROOM_INTERIOR.center,
        size: { x: 8 * MUSHROOM_INTERIOR_SCALE, z: 8 * MUSHROOM_INTERIOR_SCALE },
        floorY: MUSHROOM_INTERIOR.floorY[0]
      },
      {
        id: "mushroom-den",
        name: "蘑菇屋·二层玩乐窝",
        center: MUSHROOM_INTERIOR.center,
        size: { x: 8 * MUSHROOM_INTERIOR_SCALE, z: 8 * MUSHROOM_INTERIOR_SCALE },
        floorY: MUSHROOM_INTERIOR.floorY[1]
      },
      {
        id: "mushroom-loft",
        name: "蘑菇屋·顶层星光阁楼",
        center: MUSHROOM_INTERIOR.center,
        size: { x: 8 * MUSHROOM_INTERIOR_SCALE, z: 8 * MUSHROOM_INTERIOR_SCALE },
        floorY: MUSHROOM_INTERIOR.floorY[2]
      },
      {
        id: "dog-house-view",
        name: "林边狗屋",
        center: { x: -19, z: 24 },
        size: { x: 5, z: 5 }
      },
      {
        id: "trees-view",
        name: "西侧树影",
        center: { x: -21, z: 6 },
        size: { x: 6, z: 16 }
      }
    ],
    colliders: [
      // Villa perimeter walls. Villa is 26 wide x 22 deep, centered at world (0, -13).
      // The hall-front colliders leave a door gap at x ∈ [-5, +5]. These outer
      // walls block at any Y (no minY/maxY) so they stop you on both floors.
      boxCollider("hall-back-wall", 0, -23.8, 26, 0.6),
      boxCollider("hall-left-wall", -12.8, -13, 0.6, 22),
      boxCollider("hall-right-wall", 12.8, -13, 0.6, 22),
      boxCollider("hall-front-left-wall", -9, -2.2, 8, 0.6),
      boxCollider("hall-front-right-wall", 9, -2.2, 8, 0.6),

      // ====== Ground floor is open plan ======
      // The old x = ±3 foyer-pocket partition walls were removed (they read as
      // unnatural half-walls beside the stairs). The entry, stair vestibule and
      // both great halls are now one continuous open space, so the only interior
      // colliders left below the upper floor are the stair banisters.

      // ====== Stair banister / hole guard ======
      // Side rails along the long axis of the stairs (x = ±1.5, z ∈ [-12, -8]).
      // Full height so players can't step off the stairs sideways and can't
      // walk into the open stair hole from the upper floor.
      boxCollider("stair-rail-west", -1.5, -10, 0.2, 4, { minY: GROUND_FLOOR_MIN_Y, maxY: UPPER_FLOOR_MAX_Y }),
      boxCollider("stair-rail-east",  1.5, -10, 0.2, 4, { minY: GROUND_FLOOR_MIN_Y, maxY: UPPER_FLOOR_MAX_Y }),
      // Upper-floor south-edge guard at the stair hole. Stops the player from
      // accidentally stepping off the south-center slab strip into the hole.
      // North edge stays open — that's the natural entry from the upper floor.
      boxCollider("upper-stair-rail-south", 0, -8, 3, 0.2, { minY: UPPER_FLOOR_MIN_Y, maxY: UPPER_FLOOR_MAX_Y }),

      // ====== Upper-floor interior partitions (minY=6.65, maxY=11.25) ======
      // Minimal partitions — only the south corner of the master bedroom and
      // the study/lounge divider. The area immediately around the stair hole
      // is fully open so visitors can see the descent from any upstairs room.
      boxCollider("upper-bedroom-corner", -3, -6.5, 0.3, 1, { minY: UPPER_FLOOR_MIN_Y, maxY: UPPER_FLOOR_MAX_Y }),
      // Study (north) / lounge (south) divider at z = -11 with door gap.
      boxCollider("upper-east-divider-back",  3.75, -11, 1.5, 0.3, { minY: UPPER_FLOOR_MIN_Y, maxY: UPPER_FLOOR_MAX_Y }),
      boxCollider("upper-east-divider-front", 6.75, -11, 2.5, 0.3, { minY: UPPER_FLOOR_MIN_Y, maxY: UPPER_FLOOR_MAX_Y }),

      // Hot-spring rim rocks. We block only the OUTER edges (away from the
      // courtyard) — players can freely approach a pool from the courtyard side
      // and wade between pools.
      boxCollider("upper-spring-back-rock", 20, -11.4, 7.0, 0.6),
      boxCollider("upper-spring-east-rock", 23.4, -8, 0.6, 6.4),
      boxCollider("middle-spring-east-rock", 25.8, -2, 0.6, 4.4),
      boxCollider("lower-spring-east-rock", 24.7, 9, 0.6, 6.6),
      boxCollider("lower-spring-back-rock", 21, 5.5, 6.4, 0.6),
      boxCollider("lower-spring-front-rock", 21, 12.5, 6.4, 0.6),
      // Mushroom house exterior. Y-scoped to the ground so players inside the
      // buried interior pocket (y ≈ -80) never hit it from below.
      boxCollider("mushroom-house", -6, 18, 10.0, 10.0, { minY: 0, maxY: 30 }),
      // Decor inside the great hall (ground-floor only).
      boxCollider("blanket-pile", -5, -15, 3.0, 2.4, { minY: GROUND_FLOOR_MIN_Y, maxY: GROUND_FLOOR_MAX_Y }),
      boxCollider("hay-stack", 6, -19, 2.6, 2.6, { minY: GROUND_FLOOR_MIN_Y, maxY: GROUND_FLOOR_MAX_Y }),

      // Mushroom-house interior pocket (walls, stair rails, well guards).
      ...mushroomInteriorColliders(),

      // Phase 3: per-piece colliders for solid GLB furniture (interior +
      // exterior). Rotated-AABB derived from each placement's footprint,
      // floor-scoped by Y so a ground player never bumps upstairs furniture.
      // Rugs, lamps, books, small plants and dining/desk chairs stay walk-through.
      ...deriveFurnitureColliders([
        ...FURNITURE_PLACEMENTS,
        ...EXTERIOR_PLACEMENTS,
        ...ARCHITECTURE_PLACEMENTS
      ])
    ],
    stairs: [STAIR_ZONE, MUSHROOM_STAIR_A, MUSHROOM_STAIR_B],
    floorZones: [
      mushroomFloorZone(0, MUSH_L1_Y),
      mushroomFloorZone(1, MUSH_L2_Y),
      mushroomFloorZone(2, MUSH_L3_Y)
    ],
    hotSprings: {
      pools: [
        {
          id: "upper-spring",
          center: { x: 20, z: -8 },
          radius: { x: 3.0, z: 3.2 },
          elevation: 0.86,
          waterY: 0.62
        },
        {
          id: "middle-spring",
          center: { x: 24, z: -2 },
          radius: { x: 1.3, z: 2.0 },
          elevation: 0.62,
          waterY: 0.38
        },
        {
          id: "lower-spring",
          center: { x: 21, z: 9 },
          radius: { x: 3.4, z: 3.3 },
          elevation: 0.38,
          waterY: 0.14
        }
      ],
      steps: [
        {
          id: "spring-entry-steps",
          center: { x: 17, z: 13 },
          size: { x: 2.8, z: 3.0 }
        },
        {
          id: "spring-lower-middle-steps",
          center: { x: 23, z: 3.5 },
          size: { x: 2.2, z: 2.4 }
        },
        {
          id: "spring-middle-upper-steps",
          center: { x: 22, z: -5 },
          size: { x: 2.2, z: 2.0 }
        }
      ]
    },
    waterZones: [
      {
        id: "upper-spring",
        center: { x: 20, z: -8 },
        radius: { x: 2.5, z: 2.7 },
        speedMultiplier: 0.58,
        cameraY: 1.34
      },
      {
        id: "middle-spring",
        center: { x: 24, z: -2 },
        radius: { x: 1.05, z: 1.65 },
        speedMultiplier: 0.62,
        cameraY: 1.36
      },
      {
        id: "lower-spring",
        center: { x: 21, z: 9 },
        radius: { x: 2.85, z: 2.75 },
        speedMultiplier: 0.55,
        cameraY: 1.3
      }
    ],
    interactions: [
      {
        id: "main-villa-entry",
        title: "主楼玄关",
        body: "推开玻璃门，玄关里铺着柔软的奶白脚垫，鞋柜上摆着一盏小铜灯。",
        position: { x: 0, y: 1.4, z: -4 },
        radius: 3.0
      },
      {
        id: "great-hall-west",
        title: "西厅沙发",
        body: "矮矮的奶白沙发摆在赤陶色背景墙前，毯子窝就藏在沙发脚边。",
        position: { x: -6.2, y: 1.4, z: -12.2 },
        radius: 3.4
      },
      {
        id: "great-hall-east",
        title: "东厅长桌",
        body: "长桌可以坐下十只小猪一起喝下午茶，靠墙的橱柜里整齐摆着小碗。",
        position: { x: 8.2, y: 1.4, z: -10.5 },
        radius: 3.6
      },
      {
        id: "main-stairs",
        title: "通往二楼的木梯",
        body: "踩上木梯会有「咯吱」的轻响，扶手是温润的暖黄色。",
        position: { x: 0, y: 1.4, z: -10 },
        radius: 2.6
      },
      {
        id: "master-bedroom",
        title: "二楼主卧",
        body: "蓬松的奶白被子上摆着藏青色靠枕，床头铜灯把光打得很暖。",
        // Open landing at the foot of the bed.
        position: { x: -5.5, y: 7.8, z: -9.0 },
        radius: 3.4
      },
      {
        id: "study-loft",
        title: "二楼书房",
        body: "靠窗的小书桌可以看到温泉的水汽升起，书架上塞满小猪们的故事书。",
        // Open spot inside the doorway, clear of the desk and bookcase.
        position: { x: 6.0, y: 7.8, z: -11.6 },
        radius: 3.0
      },
      {
        id: "lounge-balcony",
        title: "二楼阳台休息区",
        body: "两座小沙发面向阳台玻璃，黄昏的橘光会顺着扶手洒到地毯上。",
        // Phase 4: moved to the balcony-facing open spot just south of the chairs.
        position: { x: 5.5, y: 7.8, z: -7.0 },
        radius: 3.0
      },
      {
        id: "hot-spring-terrace",
        title: "温泉露台",
        body: "三处温泉顺着右侧石岸排开，大池适合泡汤，小池留给怕水的小猪慢慢试探。",
        position: { x: 18, y: 1.1, z: 13 },
        radius: 5.4
      },
      {
        id: "mushroom-house",
        title: "小猪蘑菇屋",
        body: "红顶蘑菇屋的圆木门虚掩着，门缝里透出暖暖的灯光——里面居然有三层！",
        position: { x: -6, y: 1.1, z: 24 },
        radius: 4.2,
        action: {
          label: "按 E 推门进屋",
          teleport: MUSHROOM_INTERIOR.spawn
        }
      },
      {
        id: "mushroom-exit",
        title: "蘑菇屋木门",
        body: "圆圆的木门通回山庄庭院，门边挂着小猪们的草帽。",
        position: mushroomInteractionPosition(-6, 0, 21.6),
        radius: 2.4,
        action: {
          label: "按 E 回到庭院",
          teleport: MUSHROOM_INTERIOR.exitSpawn
        }
      },
      {
        id: "mushroom-hearth",
        title: "一层灶间",
        body: "圆圆的餐桌正对着小灶台，汤锅里咕嘟咕嘟冒着蘑菇汤的香气。",
        position: mushroomInteractionPosition(-7.5, 0, 16.4),
        radius: 2.8
      },
      {
        id: "mushroom-den",
        title: "二层玩乐窝",
        body: "软沙发、故事书和小地毯挤满了二层——下雨天小猪们全窝在这里打滚。",
        position: mushroomInteractionPosition(-6.2, 1, 17.2),
        radius: 2.8
      },
      {
        id: "mushroom-loft",
        title: "顶层星光阁楼",
        body: "菌盖穹顶下嵌着一圈发光的小圆窗，最小的小猪说那是蘑菇屋自己的星星。",
        position: mushroomInteractionPosition(-6.4, 2, 19.2),
        radius: 2.8
      },
      {
        id: "dog-house-view",
        title: "林边狗屋",
        body: "不呆不呆猪定居点，禁止猪养猪！",
        position: { x: -16, y: 1.2, z: 24 },
        radius: 3.4
      },
      {
        id: "trees-view",
        title: "西侧树影",
        body: "两棵大树替草地撑起一片凉荫，夏天的小风会从树下吹向庭院。",
        position: { x: -16, y: 1.2, z: 4 },
        radius: 3.2
      },
      {
        id: "guaguazhu-stage",
        title: "呱呱猪",
        body: "呱呱猪正在主楼门口练歌，麦克风旁边还摆着一颗蓝色小惊叹号。",
        position: { x: -3.6, y: 1.2, z: 4 },
        radius: 3.4
      },
      {
        id: "villa-sign",
        title: "猪猪山庄",
        body: "这里是 15 只小猪自由散步、午睡和排队吃点心的安全小家。",
        position: { x: 4, y: 1.4, z: 22 },
        radius: 3.6
      },
      {
        id: "blanket-nest",
        title: "软乎乎毯子窝",
        body: "大呆猪最喜欢这里。它占的毯子最多，但整个房间也会因此安静下来。",
        position: { x: -5, y: 0.9, z: -15 },
        radius: 3
      },
      {
        id: "tiny-corner",
        title: "小猪的秘密角落",
        body: "最小的小猪经常藏在这里，只露出一点点粉色耳朵。",
        position: { x: 7, y: 0.8, z: -19 },
        radius: 2.7
      }
    ]
  };
}

export function findWaterZone(position, world) {
  return world.waterZones?.find((zone) => {
    const dx = (position.x - zone.center.x) / zone.radius.x;
    const dz = (position.z - zone.center.z) / zone.radius.z;
    return dx * dx + dz * dz <= 1;
  }) ?? null;
}

// True when the player is inside the upper-floor slab AABB at a Y high enough
// to be considered "upstairs" (camera has cleared the ground-floor ceiling).
export function isOnUpperFloor(position, world) {
  const fp = world.upperFloorFootprint;
  if (!fp) return false;
  if (position.x < fp.minX || position.x > fp.maxX) return false;
  if (position.z < fp.minZ || position.z > fp.maxZ) return false;
  return (position.y ?? world.player.start.y) > 5.6;
}

// Find the stair zone the player is currently inside. XZ containment plus an
// optional Y activation band ([minY, maxY]) so stacked spaces (the buried
// mushroom interior under the courtyard) never capture players on another
// level. Y target interpolation itself happens inside getMovementProfile.
export function findStairZone(position, world) {
  const y = position.y ?? world.player.start.y;
  return world.stairs?.find((s) =>
    position.x >= s.minX &&
    position.x <= s.maxX &&
    position.z >= s.minZ &&
    position.z <= s.maxZ &&
    (s.minY === undefined || y >= s.minY) &&
    (s.maxY === undefined || y <= s.maxY)
  ) ?? null;
}

// Generic elevated/sunken floor zone lookup (mushroom interior levels). A zone
// matches when the player is inside its XZ rect AND its Y activation band.
export function findFloorZone(position, world) {
  const y = position.y ?? world.player.start.y;
  return world.floorZones?.find((zone) =>
    position.x >= zone.minX &&
    position.x <= zone.maxX &&
    position.z >= zone.minZ &&
    position.z <= zone.maxZ &&
    y >= zone.minY &&
    y <= zone.maxY
  ) ?? null;
}

// boxCollider(id, x, z, width, depth) — backwards-compatible 2D AABB.
// Optional opts: { minY, maxY } to constrain the collider to a Y range.
// Colliders without minY/maxY block at any height (current behavior for the
// villa perimeter walls, hot-spring rocks, etc).
export function boxCollider(id, x, z, width, depth, opts) {
  const collider = {
    id,
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2
  };
  if (opts?.minY !== undefined) collider.minY = opts.minY;
  if (opts?.maxY !== undefined) collider.maxY = opts.maxY;
  return collider;
}

export function collidesWithWorld(position, world) {
  const radius = world.player.radius;
  // Default Y to player ground-floor height — keeps tests that pass only
  // {x, z} working.
  const playerY = position.y ?? world.player.start.y;

  const outsideBounds =
    position.x < world.bounds.minX + radius ||
    position.x > world.bounds.maxX - radius ||
    position.z < world.bounds.minZ + radius ||
    position.z > world.bounds.maxZ - radius;

  if (outsideBounds) {
    return true;
  }

  return world.colliders.some((collider) => {
    // Skip colliders that don't span this player's Y range.
    if (collider.minY !== undefined && playerY > collider.maxY) return false;
    if (collider.maxY !== undefined && playerY < collider.minY) return false;
    return (
      position.x > collider.minX - radius &&
      position.x < collider.maxX + radius &&
      position.z > collider.minZ - radius &&
      position.z < collider.maxZ + radius
    );
  });
}
