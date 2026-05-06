import * as THREE from "three";

const textureCache = new Map();

export function createMaterials() {
  return {
    grass: new THREE.MeshStandardMaterial({ color: "#9fca83", roughness: 0.96 }),
    path: new THREE.MeshStandardMaterial({ color: "#f1c983", roughness: 0.92 }),
    floor: new THREE.MeshStandardMaterial({ color: "#e2ad74", roughness: 0.86 }),
    wall: new THREE.MeshStandardMaterial({ color: "#ffe5cc", roughness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: "#cf6c66", roughness: 0.84 }),
    wood: new THREE.MeshStandardMaterial({ color: "#9b5e3a", roughness: 0.72 }),
    hay: new THREE.MeshStandardMaterial({ color: "#e8bd5d", roughness: 0.98 }),
    blanket: new THREE.MeshStandardMaterial({ color: "#f7a8be", roughness: 0.78 }),
    pig: new THREE.MeshStandardMaterial({ color: "#ffa8bd", roughness: 0.82 }),
    pigDark: new THREE.MeshStandardMaterial({ color: "#4f2f33", roughness: 0.7 }),
    snout: new THREE.MeshStandardMaterial({ color: "#ff7f98", roughness: 0.78 }),
    blue: new THREE.MeshStandardMaterial({ color: "#81a7e8", roughness: 0.76 })
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
    context.fillStyle = "#f8a6ba";
    context.beginPath();
    context.arc(52, 52, 24, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#4e2f33";
    context.font = "700 48px Georgia, serif";
    context.fillText(title, 92, 68);
    context.font = "500 28px sans-serif";
    wrapText(context, body, 52, 126, width - 104, 38);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(key, texture);
  }

  const material = new THREE.MeshBasicMaterial({ map: textureCache.get(key) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), material);
  return mesh;
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
