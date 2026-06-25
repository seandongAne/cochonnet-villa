import { deriveFurnitureColliders } from "./furniture-colliders.js";
import { FURNITURE_PLACEMENTS } from "./furniture-placements.js";
import { EXTERIOR_PLACEMENTS } from "./exterior-placements.js";
import { ARCHITECTURE_PLACEMENTS } from "./architecture-placements.js";

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

export function createVillaWorld() {
  return {
    player: {
      start: { x: 0, y: 1.6, z: 18 },
      speed: 5.2,
      radius: 0.62
    },
    bounds: {
      minX: -26,
      maxX: 30,
      minZ: -27,
      maxZ: 28
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
        id: "dog-house-view",
        name: "围栏外狗屋",
        center: { x: -19, z: 24 },
        size: { x: 5, z: 5 },
        scenicOnly: true
      },
      {
        id: "trees-view",
        name: "围栏外树影",
        center: { x: -21, z: 6 },
        size: { x: 6, z: 16 },
        scenicOnly: true
      }
    ],
    colliders: [
      // Outer fence — lot expanded to accommodate the magnificent villa.
      boxCollider("left-fence", -25, 0.5, 1, 55),
      boxCollider("right-fence", 29, 0.5, 1, 55),
      boxCollider("back-fence", 2, -26, 56, 1),
      boxCollider("front-fence-left", -11, 27.5, 28, 1),
      boxCollider("front-fence-right", 17, 27.5, 24, 1),
      // Villa perimeter walls. Villa is 26 wide x 22 deep, centered at world (0, -13).
      // The hall-front colliders leave a door gap at x ∈ [-5, +5]. These outer
      // walls block at any Y (no minY/maxY) so they stop you on both floors.
      boxCollider("hall-back-wall", 0, -23.8, 26, 0.6),
      boxCollider("hall-left-wall", -12.8, -13, 0.6, 22),
      boxCollider("hall-right-wall", 12.8, -13, 0.6, 22),
      boxCollider("hall-front-left-wall", -9, -2.2, 8, 0.6),
      boxCollider("hall-front-right-wall", 9, -2.2, 8, 0.6),

      // ====== Ground-floor interior partitions ======
      // Foyer-pocket walls only — define a small entry vestibule just inside
      // the front door. Everything north of z = -7 (the great hall, stair
      // vestibule, and back of the villa) is one open space, so the stair
      // sits at the heart of the hall with clear sightlines from every side.
      boxCollider("foyer-west-wall-a", -3, -2.5, 0.3, 1, { minY: GROUND_FLOOR_MIN_Y, maxY: GROUND_FLOOR_MAX_Y }),
      boxCollider("foyer-west-wall-b", -3, -6,   0.3, 2, { minY: GROUND_FLOOR_MIN_Y, maxY: GROUND_FLOOR_MAX_Y }),
      boxCollider("foyer-east-wall-a",  3, -2.5, 0.3, 1, { minY: GROUND_FLOOR_MIN_Y, maxY: GROUND_FLOOR_MAX_Y }),
      boxCollider("foyer-east-wall-b",  3, -6,   0.3, 2, { minY: GROUND_FLOOR_MIN_Y, maxY: GROUND_FLOOR_MAX_Y }),

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
      // Mushroom house — see the doubled-stem comment in the previous commit.
      boxCollider("mushroom-house", -6, 18, 10.0, 10.0),
      // Decor inside the great hall (ground-floor only).
      boxCollider("blanket-pile", -5, -15, 3.0, 2.4, { minY: GROUND_FLOOR_MIN_Y, maxY: GROUND_FLOOR_MAX_Y }),
      boxCollider("hay-stack", 6, -19, 2.6, 2.6, { minY: GROUND_FLOOR_MIN_Y, maxY: GROUND_FLOOR_MAX_Y }),

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
    stairs: [STAIR_ZONE],
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
        position: { x: -7, y: 1.4, z: -10 },
        radius: 3.2
      },
      {
        id: "great-hall-east",
        title: "东厅长桌",
        body: "长桌可以坐下十只小猪一起喝下午茶，靠墙的橱柜里整齐摆着小碗。",
        position: { x: 7, y: 1.4, z: -10 },
        radius: 3.2
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
        // Phase 4: moved off the (now smaller) bed to the open floor at its foot.
        position: { x: -5.5, y: 7.8, z: -8.5 },
        radius: 3.4
      },
      {
        id: "study-loft",
        title: "二楼书房",
        body: "靠窗的小书桌可以看到温泉的水汽升起，书架上塞满小猪们的故事书。",
        // Phase 4: nudged to the open SE corner, clear of the desk + reading chair.
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
        body: "红顶蘑菇屋是小猪们的午睡点，圆门很矮，进去前大家都会先把脚上的草屑蹭干净。",
        position: { x: -6, y: 1.1, z: 24 },
        radius: 4.2
      },
      {
        id: "dog-house-view",
        title: "围栏外狗屋",
        body: "不呆不呆猪定居点，禁止猪养猪！",
        position: { x: -16, y: 1.2, z: 24 },
        radius: 3.4
      },
      {
        id: "trees-view",
        title: "围栏外树影",
        body: "两棵树在围栏外投下阴影，夏天的小风会从那里吹进庭院。",
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

// Find the stair zone the player is currently inside (XZ only). Y is handled
// by the lerp inside getMovementProfile.
export function findStairZone(position, world) {
  return world.stairs?.find((s) =>
    position.x >= s.minX &&
    position.x <= s.maxX &&
    position.z >= s.minZ &&
    position.z <= s.maxZ
  ) ?? null;
}

// boxCollider(id, x, z, width, depth) — backwards-compatible 2D AABB.
// Optional opts: { minY, maxY } to constrain the collider to a Y range.
// Colliders without minY/maxY block at any height (current behavior for the
// outer fence, perimeter walls, mushroom house, hot-spring rocks, etc).
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
