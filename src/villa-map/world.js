export function createVillaWorld() {
  return {
    player: {
      start: { x: 0, y: 1.6, z: 18 },
      speed: 5.2,
      radius: 0.62
    },
    bounds: {
      minX: -19,
      maxX: 23,
      minZ: -21,
      maxZ: 24
    },
    rooms: [
      {
        id: "courtyard",
        name: "山庄庭院",
        center: { x: 0, z: 9 },
        size: { x: 37, z: 26 }
      },
      {
        id: "main-villa",
        name: "主楼外廊",
        center: { x: 0, z: -1.5 },
        size: { x: 23, z: 8 }
      },
      {
        id: "great-hall",
        name: "主楼大厅",
        center: { x: 0, z: -11 },
        size: { x: 18, z: 18 }
      },
      {
        id: "hot-springs",
        name: "温泉区",
        center: { x: 15.8, z: 4.3 },
        size: { x: 10, z: 26 }
      },
      {
        id: "mushroom-house",
        name: "小猪蘑菇屋",
        center: { x: -8.5, z: 16 },
        size: { x: 8, z: 7 }
      },
      {
        id: "dog-house-view",
        name: "围栏外狗屋",
        center: { x: -23, z: 16 },
        size: { x: 5, z: 5 },
        scenicOnly: true
      },
      {
        id: "trees-view",
        name: "围栏外树影",
        center: { x: -24, z: 1 },
        size: { x: 6, z: 13 },
        scenicOnly: true
      }
    ],
    colliders: [
      boxCollider("left-fence", -18.5, 1.5, 1, 42),
      boxCollider("right-fence", 22.5, 1.5, 1, 42),
      boxCollider("back-fence", 2, -20.5, 42, 1),
      boxCollider("front-fence-left", -9.5, 23.5, 18, 1),
      boxCollider("front-fence-right", 13.5, 23.5, 18, 1),
      boxCollider("hall-back-wall", 0, -19.5, 19, 1),
      boxCollider("hall-left-wall", -9.5, -11, 1, 18),
      boxCollider("hall-right-wall", 9.5, -11, 1, 18),
      boxCollider("hall-front-left-wall", -6.9, -1.8, 5.2, 1),
      boxCollider("hall-front-right-wall", 6.9, -1.8, 5.2, 1),
      boxCollider("villa-left-wing", -11.8, -5.7, 4.2, 8.5),
      boxCollider("villa-right-wing", 11.8, -6.2, 4.2, 7.5),
      boxCollider("upper-hot-spring", 15.4, -6.6, 5.6, 6.4),
      boxCollider("small-hot-spring", 20.4, -1.7, 2.5, 4.4),
      boxCollider("lower-hot-spring", 16.1, 8.5, 7.2, 6.8),
      boxCollider("mushroom-house", -8.5, 16, 5.6, 4.8),
      boxCollider("blanket-pile", -4.6, -12.7, 2.6, 2.2),
      boxCollider("hay-stack", 4.7, 11.5, 2.5, 2.5)
    ],
    interactions: [
      {
        id: "main-villa-entry",
        title: "主楼入口",
        body: "现代山庄主楼保留了宽敞大厅，玻璃外墙在下午会把庭院和温泉的光都映进来。",
        position: { x: 0, y: 1.4, z: 0.8 },
        radius: 3.6
      },
      {
        id: "hot-spring-terrace",
        title: "温泉露台",
        body: "三处温泉顺着右侧石岸排开，大池适合泡汤，小池留给怕水的小猪慢慢试探。",
        position: { x: 15.8, y: 1.1, z: 2.2 },
        radius: 5.2
      },
      {
        id: "mushroom-house",
        title: "小猪蘑菇屋",
        body: "红顶蘑菇屋是小猪们的午睡点，圆门很矮，进去前大家都会先把脚上的草屑蹭干净。",
        position: { x: -8.5, y: 1.1, z: 12.5 },
        radius: 3.8
      },
      {
        id: "dog-house-view",
        title: "围栏外狗屋",
        body: "狗屋在围栏外守着入口。它不属于可探索区域，但一直像门卫一样看着山庄。",
        position: { x: -17.6, y: 1.2, z: 16.2 },
        radius: 3.2
      },
      {
        id: "trees-view",
        title: "围栏外树影",
        body: "两棵树在围栏外投下阴影，夏天的小风会从那里吹进庭院。",
        position: { x: -17.4, y: 1.2, z: 1.2 },
        radius: 3
      },
      {
        id: "guaguazhu-stage",
        title: "呱呱猪",
        body: "呱呱猪正在主楼门口练歌，麦克风旁边还摆着一颗蓝色小惊叹号。",
        position: { x: -3.2, y: 1.2, z: 2.6 },
        radius: 3.2
      },
      {
        id: "villa-sign",
        title: "猪猪山庄",
        body: "这里是 15 只小猪自由散步、午睡和排队吃点心的安全小家。",
        position: { x: 0, y: 1.4, z: 8.2 },
        radius: 3.6
      },
      {
        id: "blanket-nest",
        title: "软乎乎毯子窝",
        body: "大呆猪最喜欢这里。它占的毯子最多，但整个房间也会因此安静下来。",
        position: { x: -4.6, y: 0.9, z: -12.7 },
        radius: 3
      },
      {
        id: "tiny-corner",
        title: "小猪的秘密角落",
        body: "最小的小猪经常藏在这里，只露出一点点粉色耳朵。",
        position: { x: 6.2, y: 0.8, z: -14.8 },
        radius: 2.7
      }
    ]
  };
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
