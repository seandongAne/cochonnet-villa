export function createVillaWorld() {
  return {
    player: {
      start: { x: 0, y: 1.6, z: 15 },
      speed: 5.2,
      radius: 0.62
    },
    bounds: {
      minX: -18,
      maxX: 18,
      minZ: -18,
      maxZ: 20
    },
    rooms: [
      {
        id: "courtyard",
        name: "Sunlit Courtyard",
        center: { x: 0, z: 9 },
        size: { x: 34, z: 22 }
      },
      {
        id: "great-hall",
        name: "Cozy Great Hall",
        center: { x: 0, z: -8 },
        size: { x: 18, z: 16 }
      }
    ],
    colliders: [
      boxCollider("courtyard-left-fence", -17.5, 9, 1, 22),
      boxCollider("courtyard-right-fence", 17.5, 9, 1, 22),
      boxCollider("courtyard-back-fence", 0, 19.5, 35, 1),
      boxCollider("hall-back-wall", 0, -16.5, 19, 1),
      boxCollider("hall-left-wall", -9.5, -8, 1, 17),
      boxCollider("hall-right-wall", 9.5, -8, 1, 17),
      boxCollider("hall-front-left-wall", -6.8, 0.5, 5.4, 1),
      boxCollider("hall-front-right-wall", 6.8, 0.5, 5.4, 1),
      boxCollider("blanket-pile", -4.5, -9.5, 2.6, 2.2),
      boxCollider("hay-stack", 5.4, 7.8, 2.5, 2.5)
    ],
    interactions: [
      {
        id: "guaguazhu-stage",
        title: "呱呱猪",
        body: "呱呱猪正在大厅门口练歌，麦克风旁边还有一颗蓝色小惊叹号。",
        position: { x: -3.2, y: 1.2, z: 1.9 },
        radius: 3.2
      },
      {
        id: "villa-sign",
        title: "猪猪山庄",
        body: "这里是 15 只小猪自由散步、午睡和排队吃点心的安全小家。",
        position: { x: 0, y: 1.4, z: 6.4 },
        radius: 3.6
      },
      {
        id: "blanket-nest",
        title: "软乎乎毯子窝",
        body: "大呆猪最喜欢这里。它占的毯子最多，但整个房间也会因此安静下来。",
        position: { x: -4.5, y: 0.9, z: -9.5 },
        radius: 3
      },
      {
        id: "tiny-corner",
        title: "小猪的秘密角落",
        body: "最小的小猪经常藏在这里，只露出一点点粉色耳朵。",
        position: { x: 6.2, y: 0.8, z: -12.4 },
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
