import * as THREE from "three";

const textureCache = new Map();

export function createMaterials() {
  return {
    grass: new THREE.MeshStandardMaterial({ color: "#89b06a", roughness: 0.96 }),
    outsideGrass: new THREE.MeshStandardMaterial({ color: "#78995d", roughness: 0.98 }),
    path: new THREE.MeshStandardMaterial({ color: "#d7b16f", roughness: 0.92 }),
    floor: new THREE.MeshStandardMaterial({ color: "#d9a06a", roughness: 0.86 }),
    wall: new THREE.MeshStandardMaterial({ color: "#f1c6a3", roughness: 0.82 }),
    villaWall: new THREE.MeshStandardMaterial({ color: "#e7a06f", roughness: 0.78 }),
    villaDark: new THREE.MeshStandardMaterial({ color: "#6f2f35", roughness: 0.72 }),
    trim: new THREE.MeshStandardMaterial({ color: "#b85b53", roughness: 0.84 }),
    roof: new THREE.MeshStandardMaterial({ color: "#ad3f38", roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: "#8a5738", roughness: 0.72 }),
    stone: new THREE.MeshStandardMaterial({ color: "#8f8a7d", roughness: 0.92 }),
    water: new THREE.MeshStandardMaterial({
      color: "#22b9e6",
      roughness: 0.12,
      metalness: 0.02,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    glass: new THREE.MeshStandardMaterial({
      color: "#84d8e5",
      roughness: 0.08,
      metalness: 0.05,
      transparent: true,
      opacity: 0.52
    }),
    steam: new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.34,
      depthWrite: false
    }),
    hay: new THREE.MeshStandardMaterial({ color: "#e8bd5d", roughness: 0.98 }),
    blanket: new THREE.MeshStandardMaterial({ color: "#f7a8be", roughness: 0.78 }),
    pig: new THREE.MeshStandardMaterial({ color: "#ffa8bd", roughness: 0.82 }),
    pigDark: new THREE.MeshStandardMaterial({ color: "#4f2f33", roughness: 0.7 }),
    snout: new THREE.MeshStandardMaterial({ color: "#ff7f98", roughness: 0.78 }),
    blue: new THREE.MeshStandardMaterial({ color: "#81a7e8", roughness: 0.76 }),
    mushroomStem: new THREE.MeshStandardMaterial({ color: "#f2d4aa", roughness: 0.86 }),
    mushroomCap: new THREE.MeshStandardMaterial({ color: "#c93335", roughness: 0.72 }),
    mushroomSpot: new THREE.MeshStandardMaterial({ color: "#fff5df", roughness: 0.8 }),
    leaf: new THREE.MeshStandardMaterial({ color: "#2f9a51", roughness: 0.95 }),
    trunk: new THREE.MeshStandardMaterial({ color: "#79513b", roughness: 0.9 }),
    dogHouse: new THREE.MeshStandardMaterial({ color: "#f7d84f", roughness: 0.82 })
  };
}

export function createGround(width, depth, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.2, depth), material);
  mesh.receiveShadow = true;
  return mesh;
}

export function createWall(width, height, depth, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = height / 2;
  return mesh;
}

export function createFence(width, depth, material) {
  const group = new THREE.Group();
  const rail = createWall(width, 0.5, depth, material);
  rail.position.y = 0.7;
  group.add(rail);

  const posts = Math.max(2, Math.floor((width > depth ? width : depth) / 4));
  for (let index = 0; index < posts; index += 1) {
    const post = createWall(0.35, 1.6, 0.35, material);
    const t = posts === 1 ? 0.5 : index / (posts - 1);
    post.position.x = width > depth ? -width / 2 + width * t : 0;
    post.position.z = depth >= width ? -depth / 2 + depth * t : 0;
    group.add(post);
  }

  return group;
}

export function createModernVilla(materials) {
  const group = new THREE.Group();

  addBox(group, 12, 4.8, 5.2, materials.villaWall, 0, 2.4, 0);
  addBox(group, 8.8, 3.8, 4.4, materials.villaWall, -0.2, 6.4, 0.35);
  addBox(group, 5.2, 3.8, 4.2, materials.glass, -8.2, 2.1, 0.7);
  addBox(group, 5.6, 3.7, 4.4, materials.villaDark, 8.4, 2.1, -0.1);
  addBox(group, 13.2, 0.45, 6.2, materials.roof, 0, 4.95, -0.1, { z: -0.06 });
  addBox(group, 9.8, 0.42, 5.4, materials.roof, -0.2, 8.45, 0.25, { z: -0.08 });
  addBox(group, 6.2, 0.38, 5.2, materials.roof, -8.1, 4.1, 0.55, { z: 0.35 });
  addBox(group, 6.2, 0.38, 5.2, materials.roof, 8.5, 4.05, -0.15, { z: -0.14 });

  addBox(group, 3.4, 3.4, 0.18, materials.glass, 2.7, 4.05, 2.72);
  addBox(group, 4.6, 1.1, 0.18, materials.glass, -3.8, 3.1, 2.72);
  addBox(group, 4.8, 2.7, 0.18, materials.glass, -8.2, 2.35, 2.86);
  addBox(group, 3.4, 3.2, 0.22, materials.villaDark, 0, 1.75, 2.8);
  addBox(group, 2.8, 3.1, 0.25, materials.wood, 8.4, 1.75, 2.34);
  addBox(group, 0.18, 4.1, 0.18, materials.wood, -1.8, 2.05, 3.2);
  addBox(group, 0.18, 4.1, 0.18, materials.wood, 1.8, 2.05, 3.2);

  const sunPanel = addBox(group, 5.6, 0.12, 0.12, materials.trim, 0, 5.2, 3);
  sunPanel.rotation.y = 0.04;

  return group;
}

export function createHotSpringPool(materials, width = 5, depth = 6) {
  const group = new THREE.Group();
  const stoneRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 10, 64), materials.stone);
  stoneRing.rotation.x = -Math.PI / 2;
  stoneRing.scale.set(width / 2, depth / 2, 1);
  stoneRing.position.y = 0.16;
  stoneRing.castShadow = true;
  stoneRing.receiveShadow = true;
  group.add(stoneRing);

  const water = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.08, 64), materials.water);
  water.scale.set(width / 2 - 0.35, 1, depth / 2 - 0.35);
  water.position.y = 0.13;
  water.receiveShadow = true;
  group.add(water);

  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.SphereGeometry(0.22 + (index % 3) * 0.05, 12, 8), materials.stone);
    rock.position.set(Math.cos(angle) * width * 0.54, 0.22, Math.sin(angle) * depth * 0.54);
    rock.scale.y = 0.45;
    rock.castShadow = true;
    group.add(rock);
  }

  addSteam(group, materials, -0.8, 0);
  addSteam(group, materials, 0.7, -0.55);
  return group;
}

export function createTieredHotSprings(materials) {
  const group = new THREE.Group();
  addTerraceSlab(group, materials, "hot-spring-stone-terrace-entry", 3.8, 4.8, 11.6, 0.24, 11.1);
  addTerraceSlab(group, materials, "hot-spring-stone-terrace-lower", 2.8, 7.4, 12.05, 0.18, 7.25);
  addTerraceSlab(group, materials, "hot-spring-stone-terrace-middle", 2.6, 6.2, 18.15, 0.42, 1.65);
  addTerraceSlab(group, materials, "hot-spring-stone-terrace-upper", 3.1, 6.8, 12.05, 0.66, -5.6);

  addBox(group, 3.4, 0.18, 1.1, materials.stone, 11.2, 0.18, 13.1).name = "hot-spring-step-entry-1";
  addBox(group, 3.4, 0.18, 1.1, materials.stone, 11.7, 0.3, 12.05).name = "hot-spring-step-entry-2";
  addBox(group, 3.4, 0.18, 1.1, materials.stone, 12.2, 0.42, 11).name = "hot-spring-step-entry-3";
  addBox(group, 2.8, 0.18, 1, materials.stone, 18.4, 0.48, 3.6).name = "hot-spring-step-middle-1";
  addBox(group, 2.3, 0.18, 1, materials.stone, 18.9, 0.62, 2.6).name = "hot-spring-step-middle-2";

  addWaterChannel(group, materials, 18.45, 0.08, 3.25, 1.15, 6.2, -0.45, "lower-middle");
  addWaterChannel(group, materials, 18.3, 0.26, -4.2, 1.05, 5.6, 0.62, "middle-upper");

  addTieredPool(group, materials, {
    id: "upper-spring",
    x: 15.4,
    z: -6.6,
    width: 5.8,
    depth: 6.4,
    waterY: 0.42,
    wallY: 0.9
  });
  addTieredPool(group, materials, {
    id: "middle-spring",
    x: 20.1,
    z: -1.7,
    width: 3.1,
    depth: 4.8,
    waterY: 0.18,
    wallY: 0.7
  });
  addTieredPool(group, materials, {
    id: "lower-spring",
    x: 16.1,
    z: 8.5,
    width: 7.4,
    depth: 6.8,
    waterY: -0.08,
    wallY: 0.5
  });

  return group;
}

export function createMushroomHouse(materials) {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.1, 3.1, 32), materials.mushroomStem);
  stem.position.y = 1.55;
  stem.castShadow = true;
  stem.receiveShadow = true;
  group.add(stem);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(2.75, 32, 16), materials.mushroomCap);
  cap.scale.set(1.12, 0.42, 1.02);
  cap.position.y = 3.35;
  cap.castShadow = true;
  group.add(cap);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.45, 0.34, 32), materials.mushroomCap);
  brim.position.y = 2.55;
  brim.castShadow = true;
  group.add(brim);

  const door = addBox(group, 0.9, 1.55, 0.16, materials.wood, 0, 0.88, -2.05);
  door.rotation.y = 0.02;
  addBox(group, 0.9, 0.12, 0.18, materials.trim, 0, 1.65, -2.13);
  const leftWindow = addBox(group, 0.5, 0.62, 0.045, materials.glass, -1.25, 1.45, -1.47, { y: -0.32 });
  const rightWindow = addBox(group, 0.5, 0.62, 0.045, materials.glass, 1.25, 1.45, -1.47, { y: 0.32 });
  leftWindow.name = "mushroom-window-left";
  rightWindow.name = "mushroom-window-right";
  leftWindow.castShadow = false;
  rightWindow.castShadow = false;

  [
    [-1.4, 3.65, -1.6],
    [0, 4.05, -1.7],
    [1.25, 3.55, -1.45],
    [-0.55, 3.2, -2.25],
    [1.8, 3.2, -0.1]
  ].forEach(([x, y, z]) => {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10), materials.mushroomSpot);
    spot.scale.y = 0.28;
    spot.position.set(x, y, z);
    group.add(spot);
  });

  return group;
}

export function createDogHouse(materials) {
  const group = new THREE.Group();
  addBox(group, 2.4, 1.5, 2.2, materials.dogHouse, 0, 0.75, 0);
  addBox(group, 2.9, 0.35, 2.55, materials.roof, -0.55, 1.78, 0, { z: 0.55 });
  addBox(group, 2.9, 0.35, 2.55, materials.roof, 0.55, 1.78, 0, { z: -0.55 });
  addBox(group, 0.95, 1.05, 0.12, materials.pigDark, 0, 0.55, -1.15);
  addBox(group, 2.6, 0.18, 0.14, materials.wood, 0, 1.55, -1.18);
  return group;
}

export function createTree(materials, height = 4.8) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, height * 0.48, 14), materials.trunk);
  trunk.position.y = height * 0.24;
  trunk.castShadow = true;
  group.add(trunk);

  [
    [0, 0, 0, 1.35],
    [-0.75, 0.1, 0.15, 1.05],
    [0.78, 0.18, 0.05, 1.05],
    [0.08, 0.72, -0.35, 1.1]
  ].forEach(([x, y, z, scale]) => {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(scale, 20, 14), materials.leaf);
    leaf.position.set(x, height * 0.52 + y, z);
    leaf.castShadow = true;
    group.add(leaf);
  });

  return group;
}

export function createHayBale(material) {
  const group = new THREE.Group();
  for (let index = 0; index < 3; index += 1) {
    const bale = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.8, 1.1), material);
    bale.position.set((index - 1) * 0.85, index === 1 ? 0.9 : 0.4, 0);
    bale.rotation.z = index === 1 ? 0.08 : -0.04;
    bale.castShadow = true;
    bale.receiveShadow = true;
    group.add(bale);
  }
  return group;
}

export function createBlanketPile(material) {
  const group = new THREE.Group();
  const shapes = [
    { x: 0, z: 0, sx: 2.8, sz: 2.1, color: material },
    { x: -0.65, z: 0.45, sx: 1.5, sz: 1.1, color: material },
    { x: 0.7, z: -0.35, sx: 1.4, sz: 1, color: material }
  ];

  shapes.forEach((shape, index) => {
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(shape.sx, 0.28, shape.sz), shape.color);
    blanket.position.set(shape.x, 0.14 + index * 0.08, shape.z);
    blanket.rotation.y = index * 0.22;
    blanket.castShadow = true;
    blanket.receiveShadow = true;
    group.add(blanket);
  });

  return group;
}

export function createPorky(materials, options = {}) {
  const group = new THREE.Group();
  const scale = options.scale ?? 1;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.74, 28, 20), materials.pig);
  body.scale.set(1.1, 0.82, 1.25);
  body.position.y = 0.72;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.56, 28, 20), materials.pig);
  head.position.set(0, 1.18, -0.52);
  head.scale.set(1.06, 0.96, 0.94);
  head.castShadow = true;
  group.add(head);

  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.23, 20, 14), materials.snout);
  snout.position.set(0, 1.13, -0.98);
  snout.scale.set(1.35, 0.75, 0.6);
  snout.castShadow = true;
  group.add(snout);

  [-0.18, 0.18].forEach((x) => {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), materials.pigDark);
    nostril.position.set(x, 1.13, -1.13);
    group.add(nostril);
  });

  [-0.23, 0.23].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), materials.pigDark);
    eye.position.set(x, 1.32, -0.95);
    group.add(eye);

    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 4), materials.pig);
    ear.position.set(x * 1.55, 1.63, -0.52);
    ear.rotation.set(0.45, 0, x > 0 ? -0.72 : 0.72);
    ear.castShadow = true;
    group.add(ear);
  });

  if (options.mic) {
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 14), materials.pigDark);
    mic.position.set(-0.58, 0.75, -1.02);
    mic.rotation.z = -0.2;
    group.add(mic);

    const micHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), materials.pigDark);
    micHead.position.set(-0.7, 1.34, -1.08);
    group.add(micHead);
  }

  group.scale.setScalar(scale);
  return group;
}

export function createTextBoard(title, body, width = 512, height = 256) {
  const key = `${title}|${body}|${width}|${height}`;
  if (!textureCache.has(key)) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff8ef";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#d86b8d";
    context.beginPath();
    context.arc(52, 52, 24, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#4e2f33";
    context.font = "700 46px Georgia, 'Microsoft YaHei', sans-serif";
    context.fillText(title, 92, 68);
    context.font = "500 27px 'Microsoft YaHei', sans-serif";
    wrapText(context, body, 52, 126, width - 104, 38);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(key, texture);
  }

  return new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), new THREE.MeshBasicMaterial({ map: textureCache.get(key) }));
}

function addBox(group, width, height, depth, material, x, y, z, rotation = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addTieredPool(group, materials, pool) {
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.24, 56), materials.stone);
  basin.name = `hot-spring-basin-${pool.id}`;
  basin.position.set(pool.x, pool.waterY - 0.16, pool.z);
  basin.scale.set(pool.width / 2, 1, pool.depth / 2);
  basin.castShadow = true;
  basin.receiveShadow = true;
  group.add(basin);

  const waterMaterial = materials.water.clone();
  waterMaterial.opacity = 0.92;
  waterMaterial.depthWrite = false;
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 72), waterMaterial);
  water.name = `hot-spring-water-${pool.id}`;
  water.rotation.x = -Math.PI / 2;
  water.position.set(pool.x, pool.waterY + 0.08, pool.z);
  water.scale.set(pool.width / 2 - 0.45, pool.depth / 2 - 0.45, 1);
  water.renderOrder = 4;
  water.receiveShadow = true;
  group.add(water);

  const ripple = new THREE.Mesh(new THREE.TorusGeometry(1, 0.018, 8, 64), waterMaterial);
  ripple.name = `hot-spring-ripple-${pool.id}`;
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.set(pool.x, pool.waterY + 0.095, pool.z);
  ripple.scale.set(pool.width / 2 - 0.9, pool.depth / 2 - 0.9, 1);
  ripple.renderOrder = 5;
  group.add(ripple);

  const wall = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 12, 72), materials.stone);
  wall.name = `hot-spring-rock-wall-${pool.id}`;
  wall.rotation.x = -Math.PI / 2;
  wall.position.set(pool.x, pool.wallY, pool.z);
  wall.scale.set(pool.width / 2, pool.depth / 2, 1);
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.SphereGeometry(0.18 + (index % 4) * 0.05, 12, 8), materials.stone);
    rock.name = `hot-spring-edge-rock-${pool.id}`;
    rock.position.set(
      pool.x + Math.cos(angle) * pool.width * 0.54,
      pool.wallY + 0.05 * (index % 2),
      pool.z + Math.sin(angle) * pool.depth * 0.54
    );
    rock.scale.y = 0.55;
    rock.castShadow = true;
    group.add(rock);
  }

  addSteam(group, materials, pool.x - pool.width * 0.15, pool.z);
  addSteam(group, materials, pool.x + pool.width * 0.12, pool.z - pool.depth * 0.16);
}

function addWaterChannel(group, materials, x, y, z, width, depth, rotationY, id) {
  const channel = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, depth), materials.water);
  channel.name = `hot-spring-channel-water-${id}`;
  channel.position.set(x, y, z);
  channel.rotation.y = rotationY;
  channel.receiveShadow = true;
  group.add(channel);

  const leftBank = addBox(group, 0.28, 0.34, depth, materials.stone, x - width / 2, y + 0.16, z, { y: rotationY });
  const rightBank = addBox(group, 0.28, 0.34, depth, materials.stone, x + width / 2, y + 0.16, z, { y: rotationY });
  leftBank.name = `hot-spring-channel-bank-${id}`;
  rightBank.name = `hot-spring-channel-bank-${id}`;
}

function addTerraceSlab(group, materials, name, width, depth, x, y, z) {
  const slab = addBox(group, width, 0.2, depth, materials.stone, x, y, z);
  slab.name = name;
  for (let index = 0; index < 6; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const t = (index + 0.5) / 6;
    const rock = new THREE.Mesh(new THREE.SphereGeometry(0.16 + (index % 3) * 0.035, 10, 8), materials.stone);
    rock.name = `${name}-edge-rock`;
    rock.position.set(x + side * width * 0.55, y + 0.14, z - depth / 2 + depth * t);
    rock.scale.y = 0.45;
    rock.castShadow = true;
    group.add(rock);
  }
  return slab;
}

function addSteam(group, materials, x, z) {
  for (let index = 0; index < 3; index += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.24 + index * 0.08, 12, 8), materials.steam);
    puff.position.set(x + index * 0.18, 0.75 + index * 0.42, z - index * 0.12);
    puff.scale.y = 1.55;
    group.add(puff);
  }
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split("");
  let line = "";
  let currentY = y;

  words.forEach((word) => {
    const testLine = line + word;
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
      return;
    }

    line = testLine;
  });

  context.fillText(line, x, currentY);
}
