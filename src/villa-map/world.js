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
        id: "great-hall",
        name: "主楼大厅",
        center: { x: 0, z: -13 },
        size: { x: 24, z: 20 }
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
      // The hall-front colliders leave a door gap at x ∈ [-5, +5].
      boxCollider("hall-back-wall", 0, -23.8, 26, 0.6),
      boxCollider("hall-left-wall", -12.8, -13, 0.6, 22),
      boxCollider("hall-right-wall", 12.8, -13, 0.6, 22),
      boxCollider("hall-front-left-wall", -9, -2.2, 8, 0.6),
      boxCollider("hall-front-right-wall", 9, -2.2, 8, 0.6),
      // Hot-spring rim rocks. We block only the OUTER edges (away from the
      // courtyard) — players can freely approach a pool from the courtyard side
      // and wade between pools. The water zones slow movement so wading reads
      // as deliberate. Keeping the inside edges open avoids "stuck on stair"
      // collisions when terraces stack against each other.
      boxCollider("upper-spring-back-rock", 20, -11.4, 7.0, 0.6),
      boxCollider("upper-spring-east-rock", 23.4, -8, 0.6, 6.4),
      boxCollider("middle-spring-east-rock", 25.8, -2, 0.6, 4.4),
      boxCollider("lower-spring-east-rock", 24.7, 9, 0.6, 6.6),
      boxCollider("lower-spring-back-rock", 21, 5.5, 6.4, 0.6),
      boxCollider("lower-spring-front-rock", 21, 12.5, 6.4, 0.6),
      // Mushroom house at bottom-center inside fence (per reference).
      boxCollider("mushroom-house", -6, 18, 6.2, 5.0),
      // Decor inside the great hall.
      boxCollider("blanket-pile", -5, -15, 3.0, 2.4),
      boxCollider("hay-stack", 6, 14, 2.6, 2.6)
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
        title: "主楼入口",
        body: "现代山庄主楼保留了宽敞大厅，玻璃外墙在下午会把庭院和温泉的光都映进来。",
        position: { x: 0, y: 1.4, z: 1.4 },
        radius: 3.8
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
        position: { x: -6, y: 1.1, z: 14 },
        radius: 4.0
      },
      {
        id: "dog-house-view",
        title: "围栏外狗屋",
        body: "狗屋在围栏外守着入口。它不属于可探索区域，但一直像门卫一样看着山庄。",
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
        position: { x: 7, y: 0.8, z: -17 },
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

export function boxCollider(id, x, z, width, depth) {
  return {
    id,
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2
  };
}

export function collidesWithWorld(position, world) {
  const radius = world.player.radius;
  const outsideBounds =
    position.x < world.bounds.minX + radius ||
    position.x > world.bounds.maxX - radius ||
    position.z < world.bounds.minZ + radius ||
    position.z > world.bounds.maxZ - radius;

  if (outsideBounds) {
    return true;
  }

  return world.colliders.some((collider) => {
    return (
      position.x > collider.minX - radius &&
      position.x < collider.maxX + radius &&
      position.z > collider.minZ - radius &&
      position.z < collider.maxZ + radius
    );
  });
}
