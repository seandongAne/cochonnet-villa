import {
  MAIN_VILLA_UPPER_EYE_Y, MAIN_VILLA_UPPER_RECTANGLES,
  MAIN_VILLA_STAIRS, MAIN_VILLA_FLOOR_ZONES,
  createMainVillaColliders, collidesWithMainVillaShape, adaptMainVillaRooms,
  isActiveInteriorPlacement, isActiveArchitecturePlacement
} from "./main-villa.js";
import { deriveFurnitureColliders } from "./furniture-colliders.js";
import { FURNITURE_PLACEMENTS } from "./furniture-placements.js";
import { EXTERIOR_PLACEMENTS } from "./exterior-placements.js";
import { ARCHITECTURE_PLACEMENTS } from "./architecture-placements.js";
import { VILLA_BOUNDS, createFenceColliders } from "./perimeter-fence.js";
import {
  MUSHROOM_OBSERVATORY_SWITCH_ACTION_TYPE,
  MUSHROOM_OBSERVATORY_SWITCH_INTERACTION_ID
} from "./mushroom-interior.js";
import {
  OBSERVATORY_EVENT_JOURNAL_ACTION_TYPE
} from "./observatory-event-journal.js";
import {
  MUSHROOM_FLOOR_Y_RANGES,
  MUSHROOM_FURNITURE_SCALE,
  MUSHROOM_INTERIOR_BASE_Y,
  MUSHROOM_INTERIOR_CENTER,
  MUSHROOM_INTERIOR_EYE_Y,
  MUSHROOM_INTERIOR_FLOOR_Y,
  MUSHROOM_INTERIOR_LEVEL_HEIGHT,
  MUSHROOM_INTERIOR_LOCAL_RADIUS,
  MUSHROOM_INTERIOR_SCALE,
  MUSHROOM_STAIR_OPENING_MARGIN,
  MUSHROOM_STAIR_WIDTH,
  scaleMushroomInteriorPoint,
  scaleMushroomInteriorX,
  scaleMushroomInteriorZ
} from "./mushroom-interior-config.js";

// ============================================================================
// Mushroom-house interior — an independent three-storey "pocket" space buried
// UNDERGROUND. Entering/leaving happens via teleport actions, so its dimensions
// no longer depend on the exterior mushroom. The visual shell and its layout
// coordinates are uniformly 2x; the player stays human-scale and furniture
// keeps its original curated model size.
//
// Levels (slab TOP y): L1 -48, L2 -40, L3 -32. Player eye = slab + 1.6.
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
// The run and rise follow the enlarged room, but width stays player-scale at
// 3.2 m so the stairs and handrails remain comfortable for visitors and pigs.
const MUSHROOM_STAIR_A_CENTER_X = scaleMushroomInteriorX(-4);
const MUSHROOM_STAIR_B_CENTER_X = scaleMushroomInteriorX(-8);
const MUSHROOM_STAIR_MIN_Z = scaleMushroomInteriorZ(16.6);
const MUSHROOM_STAIR_MAX_Z = scaleMushroomInteriorZ(21);
const MUSHROOM_STAIR_A = {
  id: "mushroom-stairs-a", // L1 → L2, east side
  minX: MUSHROOM_STAIR_A_CENTER_X - MUSHROOM_STAIR_WIDTH / 2,
  maxX: MUSHROOM_STAIR_A_CENTER_X + MUSHROOM_STAIR_WIDTH / 2,
  minZ: MUSHROOM_STAIR_MIN_Z,
  maxZ: MUSHROOM_STAIR_MAX_Z,
  floorY: MUSHROOM_INTERIOR.eyeY[0],
  upperY: MUSHROOM_INTERIOR.eyeY[1],
  speedMultiplier: 0.8,
  minY: MUSH_L1_Y.minY,
  maxY: MUSH_L2_Y.maxY
};
const MUSHROOM_STAIR_B = {
  id: "mushroom-stairs-b", // L2 → L3, west side
  minX: MUSHROOM_STAIR_B_CENTER_X - MUSHROOM_STAIR_WIDTH / 2,
  maxX: MUSHROOM_STAIR_B_CENTER_X + MUSHROOM_STAIR_WIDTH / 2,
  minZ: MUSHROOM_STAIR_MIN_Z,
  maxZ: MUSHROOM_STAIR_MAX_Z,
  floorY: MUSHROOM_INTERIOR.eyeY[1],
  upperY: MUSHROOM_INTERIOR.eyeY[2],
  speedMultiplier: 0.8,
  minY: MUSH_L2_Y.minY,
  maxY: MUSH_L3_Y.maxY
};

function mushroomFloorZone(level, band) {
  // Use the round shell's full AABB here, rather than the smaller navigation
  // square exposed on MUSHROOM_INTERIOR.footprint. The radial wall collider
  // below owns the actual playable outline; keeping its cardinal edge inside
  // the floor zone prevents camera height from snapping toward ground level
  // during the final few centimetres of a walk toward the curved wall.
  const radius = MUSHROOM_INTERIOR_LOCAL_RADIUS * MUSHROOM_INTERIOR_SCALE;
  const { x, z } = MUSHROOM_INTERIOR.center;
  return {
    id: `mushroom-floor-${level + 1}`,
    minX: x - radius,
    maxX: x + radius,
    minZ: z - radius,
    maxZ: z + radius,
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
  const stairCenterZ = (MUSHROOM_STAIR_MIN_Z + MUSHROOM_STAIR_MAX_Z) / 2;
  const stairDepth = MUSHROOM_STAIR_MAX_Z - MUSHROOM_STAIR_MIN_Z;
  const railWidth = 0.2;
  const railOffset = MUSHROOM_STAIR_WIDTH / 2 + railWidth / 2;
  const stairRail = (id, centerX, side, stair) => boxCollider(
    id,
    centerX + side * railOffset,
    stairCenterZ,
    railWidth,
    stairDepth,
    { minY: stair.minY, maxY: stair.maxY }
  );
  const normalWidthScaledZBox = (
    id,
    centerX,
    sourceZ,
    width,
    sourceDepth,
    yRange
  ) => boxCollider(
    id,
    centerX,
    scaleMushroomInteriorZ(sourceZ),
    width,
    sourceDepth * MUSHROOM_INTERIOR_SCALE,
    yRange
  );
  const normalBoxAtScaledZ = (
    id,
    centerX,
    sourceZ,
    width,
    depth,
    yRange
  ) => boxCollider(
    id,
    centerX,
    scaleMushroomInteriorZ(sourceZ),
    width,
    depth,
    yRange
  );

  return [
    // Match the visible cylindrical shell. The former four-box approximation
    // left open diagonal corners where a player could step through the round
    // wall and into the surrounding soil. One inward-facing radial boundary
    // closes the full circumference without pinching either stair entrance.
    circleBoundaryCollider(
      "mushroom-int-round-wall",
      MUSHROOM_INTERIOR.center.x,
      MUSHROOM_INTERIOR.center.z,
      MUSHROOM_INTERIOR_LOCAL_RADIUS * MUSHROOM_INTERIOR_SCALE,
      MUSH_ALL_Y
    ),
    // Normal-width side rails follow the full enlarged run. The centre aisle
    // stays open while both sides match the visible one-metre handrails.
    stairRail(
      "mushroom-stair-a-rail-w",
      MUSHROOM_STAIR_A_CENTER_X,
      -1,
      MUSHROOM_STAIR_A
    ),
    stairRail(
      "mushroom-stair-a-rail-e",
      MUSHROOM_STAIR_A_CENTER_X,
      1,
      MUSHROOM_STAIR_A
    ),
    stairRail(
      "mushroom-stair-b-rail-w",
      MUSHROOM_STAIR_B_CENTER_X,
      -1,
      MUSHROOM_STAIR_B
    ),
    stairRail(
      "mushroom-stair-b-rail-e",
      MUSHROOM_STAIR_B_CENTER_X,
      1,
      MUSHROOM_STAIR_B
    ),
    // Under-stair blocks: stop the LOWER level's players from wandering into
    // the solid upper half of a flight and getting yanked up by the stair
    // zone. Their Y bands only catch a player still standing on the lower
    // floor, so ascending/descending players never brush them.
    normalWidthScaledZBox(
      "mushroom-stair-a-under",
      MUSHROOM_STAIR_A_CENTER_X,
      17.05,
      MUSHROOM_STAIR_WIDTH,
      1.5,
      {
        minY: MUSH_L1_Y.minY,
        maxY: MUSHROOM_INTERIOR.eyeY[0] + 2
      }
    ),
    normalWidthScaledZBox(
      "mushroom-stair-b-under",
      MUSHROOM_STAIR_B_CENTER_X,
      17.05,
      MUSHROOM_STAIR_WIDTH,
      1.5,
      {
        minY: MUSH_L2_Y.minY,
        maxY: MUSHROOM_INTERIOR.eyeY[1] + 2
      }
    ),
    // Stairwell rim guards on the level ABOVE each flight's low (south) end so
    // nobody strolls off the slab edge into the open well. Ascending players
    // pass beneath the band; the level's own walkers are blocked.
    normalBoxAtScaledZ(
      "mushroom-stair-a-rim",
      MUSHROOM_STAIR_A_CENTER_X,
      21.5,
      MUSHROOM_STAIR_WIDTH + MUSHROOM_STAIR_OPENING_MARGIN * 2,
      0.08,
      MUSH_L2_Y
    ),
    normalBoxAtScaledZ(
      "mushroom-stair-b-rim",
      MUSHROOM_STAIR_B_CENTER_X,
      21.5,
      MUSHROOM_STAIR_WIDTH + MUSHROOM_STAIR_OPENING_MARGIN * 2,
      0.08,
      MUSH_L3_Y
    )
  ];
}

export function createVillaWorld() {
  const world = {
    player: {
      start: { x: 0, y: 1.6, z: 18 },
      speed: 5.2,
      radius: 0.62
    },
    // The authored fence follows the exploration bounds; the open welcome gate
    // remains a visual entrance, with the same world limit across its opening.
    bounds: { ...VILLA_BOUNDS },
    upperFloorY: MAIN_VILLA_UPPER_EYE_Y,
    upperFloorFootprints: MAIN_VILLA_UPPER_RECTANGLES,
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
        id: "stair-vestibule",
        name: "折返大楼梯",
        floor: 0,
        center: { x: 0, z: -14 },
        size: { x: 6, z: 10 }
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
      ...createFenceColliders(),
      ...createMainVillaColliders(),

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
      // Mushroom-house interior pocket (walls, stair rails, well guards).
      ...mushroomInteriorColliders(),

      // Phase 3: per-piece colliders for solid GLB furniture (interior +
      // exterior). Rotated-AABB derived from each placement's footprint,
      // floor-scoped by Y so a ground player never bumps upstairs furniture.
      // Rugs, lamps, books, small plants and dining/desk chairs stay walk-through.
      ...deriveFurnitureColliders([
        ...FURNITURE_PLACEMENTS.filter(isActiveInteriorPlacement),
        ...EXTERIOR_PLACEMENTS,
        ...ARCHITECTURE_PLACEMENTS.filter(isActiveArchitecturePlacement)
      ])
    ],
    stairs: [MAIN_VILLA_STAIRS[0], MUSHROOM_STAIR_A, MUSHROOM_STAIR_B, ...MAIN_VILLA_STAIRS.slice(1)],
    floorZones: [
      ...MAIN_VILLA_FLOOR_ZONES,
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
        body: "储物柜、长餐桌和茶角挤在暖灯串下面，蘑菇汤的香气绕着一整圈书架打转。",
        position: mushroomInteractionPosition(-7.5, 0, 16.4),
        radius: 2.8
      },
      {
        id: "mushroom-den",
        title: "二层玩乐窝",
        body: "抱枕沙发、故事书、照片和两块小地毯挤满了二层——下雨天小猪们全窝在彩旗下面打滚。",
        position: mushroomInteractionPosition(-6.2, 1, 17.2),
        radius: 2.8
      },
      {
        id: "mushroom-loft",
        title: "顶层星光阁楼",
        body: "床、梳妆角和阅读窝贴着菌盖排开；暗红圆窗沿墙发出柔和引路光，头顶是一整片没有遮挡的银河穹顶。",
        position: mushroomInteractionPosition(-6.4, 2, 19.2),
        radius: 2.8
      },
      {
        id: MUSHROOM_OBSERVATORY_SWITCH_INTERACTION_ID,
        title: "三楼灯光开关",
        body: "墙上的黄铜开关控制整层灯光。把灯关掉，等眼睛适应黑暗，看看穹顶会发生什么……",
        // Matches the physical switch's local offset (-4.55, -1.25) after the
        // pocket's 2x transform. It is beside the top of stair B and can be
        // reached without walking through the vanity or the curved wall.
        position: mushroomInteractionPosition(-10.55, 2, 16.75),
        radius: 2.6,
        action: {
          type: MUSHROOM_OBSERVATORY_SWITCH_ACTION_TYPE,
          label: "按 E 关闭灯光，仰望星空"
        }
      },
      {
        id: "mushroom-observatory-event-journal",
        title: "天象图鉴",
        body: "架子上放着一本厚厚的手绘图鉴，记录着这座观星台见过的每一种特殊天象。关灯观星时，每一秒都有小概率遇上一场。",
        // On the west wall between the vanity and the light switch, matching
        // the m3-journal-shelf/book placement.
        position: mushroomInteractionPosition(-10.1, 2, 18.35),
        radius: 2.4,
        action: {
          type: OBSERVATORY_EVENT_JOURNAL_ACTION_TYPE,
          label: "按 E 翻开天象图鉴"
        }
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

    ]
  };
  return adaptMainVillaRooms(world);
}

export function findWaterZone(position, world) {
  return world.waterZones?.find((zone) => {
    const dx = (position.x - zone.center.x) / zone.radius.x;
    const dz = (position.z - zone.center.z) / zone.radius.z;
    return dx * dx + dz * dz <= 1;
  }) ?? null;
}

// Test each physical slab independently so the atrium and stairwell stay void.
export function isOnUpperFloor(position, world) {
  const y = position.y ?? world.player.start.y;
  return Math.abs(y - world.upperFloorY) < 1
    && (world.upperFloorFootprints ?? []).some(fp =>
      position.x >= fp.minX && position.x <= fp.maxX
      && position.z >= fp.minZ && position.z <= fp.maxZ);
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
    (s.maxY === undefined || y <= s.maxY) &&
    (s.maxDeltaY === undefined || Math.abs(y - s.eyeYAt(position.z)) <= s.maxDeltaY)
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
// Colliders without minY/maxY block at any height (e.g. hot-spring rocks).
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

// An inward-facing circular boundary: positions remain walkable only while
// the player's full radius fits inside `radius`. This is distinct from a solid
// circular obstacle, where the blocked area would be the circle's interior.
function circleBoundaryCollider(id, x, z, radius, opts) {
  const collider = {
    id,
    kind: "circle-boundary",
    centerX: x,
    centerZ: z,
    radius
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
    if (["box", "segment", "ellipse", "stair-volume"].includes(collider.kind)) {
      return collidesWithMainVillaShape({ ...position, y: playerY }, collider, radius);
    }
    if (collider.kind === "circle-boundary") {
      const dx = position.x - collider.centerX;
      const dz = position.z - collider.centerZ;
      const maxCenterRadius = Math.max(0, collider.radius - radius);
      return dx * dx + dz * dz > maxCenterRadius * maxCenterRadius;
    }
    return (
      position.x > collider.minX - radius &&
      position.x < collider.maxX + radius &&
      position.z > collider.minZ - radius &&
      position.z < collider.maxZ + radius
    );
  });
}
