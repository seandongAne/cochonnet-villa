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

  // ===== Architecture overview =====
  // The villa is a magnificent two-storey modern building. Its footprint
  // matches the great-hall colliders in world.js (26 wide x 22 deep, centered
  // at world (0, -13) when scene.js places the group at (0, 0, -13)).
  // Front (south) face is at local z = +halfDepth (world z = -2).
  // The cartoon facade lives on the south face; the back and side walls form
  // the perimeter of the explorable hall.
  //
  // Coordinates here are LOCAL to the villa group.

  const buildingWidth = 26;
  const buildingDepth = 22;
  const halfWidth = buildingWidth / 2;
  const halfDepth = buildingDepth / 2;
  const lowerHeight = 5.6;
  const lowerY = lowerHeight / 2;

  // ---- Perimeter walls (back + sides) -------------------------------------
  // These are the structural exterior walls — they line up with hall colliders.
  // We build the BACK wall as a single peach panel, plus side panels with subtle
  // window slits to break up the long blank surface from outside.
  addBox(group, buildingWidth, lowerHeight, 0.4, materials.villaWall, 0, lowerY, -halfDepth + 0.2);
  addBox(group, 0.4, lowerHeight, buildingDepth, materials.villaWall, -halfWidth + 0.2, lowerY, 0);
  addBox(group, 0.4, lowerHeight, buildingDepth, materials.villaWall, halfWidth - 0.2, lowerY, 0);

  // Subtle vertical window slits on side walls — more of them, since side walls
  // are now longer.
  for (const z of [-8, -5, -2, 1, 4, 7]) {
    addBox(group, 0.06, 2.0, 0.5, materials.glass, -halfWidth + 0.18, 2.8, z);
    addBox(group, 0.06, 2.0, 0.5, materials.glass, halfWidth - 0.18, 2.8, z);
  }

  // ---- Front (south) facade: cartoon-style modern front -------------------
  // Door gap matches the world.js hall-front-* colliders: x ∈ [-5, +5].
  // Wings flank the gap on either side.
  const frontZ = halfDepth - 0.2;
  const doorHalfWidth = 5; // door gap radius

  // Front-LEFT wing: peach base + floor-to-ceiling glass curtain. Reference
  // shows the brightest, glassiest section on this side. Spans x ∈ [-13, -5].
  const leftWingWidth = halfWidth - doorHalfWidth;
  const leftWingCenter = -(doorHalfWidth + leftWingWidth / 2);
  addBox(group, leftWingWidth, lowerHeight, 0.4, materials.villaWall, leftWingCenter, lowerY, frontZ);
  // Glass curtain pane in front of the peach wall.
  addBox(group, leftWingWidth - 0.6, lowerHeight - 0.7, 0.12, materials.glass,
    leftWingCenter, lowerY, frontZ + 0.22);
  // Wood mullions slicing the glass curtain.
  const leftMullionCount = 5;
  for (let i = 0; i < leftMullionCount; i += 1) {
    const t = i / (leftMullionCount - 1);
    const x = leftWingCenter - leftWingWidth / 2 + 0.4 + (leftWingWidth - 0.8) * t;
    addBox(group, 0.16, lowerHeight - 0.5, 0.18, materials.wood, x, lowerY, frontZ + 0.28);
  }
  // Horizontal wood band splitting the lower glass from a transom strip up top.
  addBox(group, leftWingWidth - 0.3, 0.16, 0.18, materials.wood,
    leftWingCenter, lowerHeight - 1.0, frontZ + 0.28);

  // Front-RIGHT wing: dark red panel + thin window strip + wood beams.
  // Spans x ∈ [+5, +13].
  const rightWingWidth = halfWidth - doorHalfWidth;
  const rightWingCenter = doorHalfWidth + rightWingWidth / 2;
  addBox(group, rightWingWidth, lowerHeight, 0.4, materials.villaDark, rightWingCenter, lowerY, frontZ);
  // Two thin horizontal window strips on the dark panel — upper and middle.
  addBox(group, rightWingWidth - 0.8, 0.5, 0.06, materials.glass,
    rightWingCenter, lowerHeight - 0.7, frontZ + 0.22);
  addBox(group, rightWingWidth - 0.8, 0.4, 0.06, materials.glass,
    rightWingCenter, lowerHeight - 2.4, frontZ + 0.22);
  // Vertical wood beams down the dark wing.
  const rightBeamCount = 6;
  for (let i = 0; i < rightBeamCount; i += 1) {
    const t = i / (rightBeamCount - 1);
    const x = rightWingCenter - rightWingWidth / 2 + 0.5 + (rightWingWidth - 1.0) * t;
    addBox(group, 0.18, lowerHeight - 0.6, 0.12, materials.wood, x, lowerY - 0.2, frontZ + 0.24);
  }

  // ---- Central entry zone (door gap, x ∈ [-5, +5]) ------------------------
  // Door gap stays open at ground level. A grand peach lintel above carries
  // the second floor.
  addBox(group, doorHalfWidth * 2 + 0.6, 0.8, 0.6, materials.villaWall,
    0, lowerHeight - 0.4, frontZ);
  // Slim vertical wood door-frame posts at the gap edges.
  addBox(group, 0.22, lowerHeight - 0.4, 0.22, materials.wood, -doorHalfWidth + 0.2, lowerY - 0.1, frontZ + 0.3);
  addBox(group, 0.22, lowerHeight - 0.4, 0.22, materials.wood, doorHalfWidth - 0.2, lowerY - 0.1, frontZ + 0.3);
  // Horizontal accent beam above the door (the "sun visor" detail from the ref).
  addBox(group, doorHalfWidth * 2 + 0.4, 0.16, 0.16, materials.trim,
    0, lowerHeight - 0.2, frontZ + 0.55);
  // A pair of low planters flanking the entry, one warm peach.
  addBox(group, 0.6, 0.6, 0.6, materials.trim, -doorHalfWidth + 0.6, 0.3, frontZ + 1.0);
  addBox(group, 0.6, 0.6, 0.6, materials.trim, doorHalfWidth - 0.6, 0.3, frontZ + 1.0);

  // ---- Lower roof: large sloped overhang (shed-style) ---------------------
  // Slopes upward toward the back so the front edge hangs lower over the porch
  // and the back rises higher into the upper-level base.
  const lowerRoofThickness = 0.36;
  const lowerRoofY = lowerHeight + 0.6;
  const lowerRoof = addBox(
    group, buildingWidth + 1.6, lowerRoofThickness, buildingDepth + 1.4,
    materials.roof, 0, lowerRoofY, 0
  );
  lowerRoof.rotation.x = -0.05;
  lowerRoof.name = "villa-lower-roof";

  // Painted underside trim, just under the roof.
  const roofUnderside = addBox(
    group, buildingWidth + 1.4, 0.06, buildingDepth + 1.2,
    materials.trim, 0, lowerRoofY - 0.22, 0
  );
  roofUnderside.rotation.x = -0.05;

  // ---- Upper level (smaller, set back from front edge) --------------------
  const upperHeight = 4.6;
  const upperBaseY = lowerHeight + 1.05;
  const upperY = upperBaseY + upperHeight / 2;
  const upperWidth = 16;
  const upperDepth = 10;
  const upperFrontZ = halfDepth - 4.0; // pushed back so the lower roof reads as a balcony platform
  const upperZ = upperFrontZ - upperDepth / 2;

  // Floor slab between the two storeys (sits on top of the lower roof).
  addBox(group, upperWidth + 0.6, 0.2, upperDepth + 0.6, materials.trim,
    0, upperBaseY - 0.1, upperZ);

  // Upper level back wall.
  addBox(group, upperWidth, upperHeight, 0.32, materials.villaWall,
    0, upperY, upperZ - upperDepth / 2 + 0.16);
  // Upper side walls.
  addBox(group, 0.32, upperHeight, upperDepth, materials.villaWall,
    -upperWidth / 2 + 0.16, upperY, upperZ);
  addBox(group, 0.32, upperHeight, upperDepth, materials.villaWall,
    upperWidth / 2 - 0.16, upperY, upperZ);

  // Upper FRONT face: dramatic floor-to-ceiling window wall, split into two
  // bands by a wood band, with a small peach lip top and bottom.
  addBox(group, upperWidth, 0.4, 0.32, materials.villaWall,
    0, upperBaseY + 0.2, upperFrontZ);
  addBox(group, upperWidth - 0.4, upperHeight - 0.85, 0.14, materials.glass,
    0, upperY + 0.05, upperFrontZ + 0.1);
  addBox(group, upperWidth, 0.45, 0.32, materials.villaWall,
    0, upperBaseY + upperHeight - 0.22, upperFrontZ);
  // Horizontal wood band splitting upper window into two tiers.
  addBox(group, upperWidth - 0.2, 0.16, 0.22, materials.wood,
    0, upperY - 0.6, upperFrontZ + 0.18);
  // Vertical wood mullions on the upper window.
  const upperMullionCount = 7;
  for (let i = 0; i < upperMullionCount; i += 1) {
    const t = i / (upperMullionCount - 1);
    const x = -upperWidth / 2 + 0.5 + (upperWidth - 1.0) * t;
    addBox(group, 0.16, upperHeight - 0.9, 0.2, materials.wood,
      x, upperY + 0.05, upperFrontZ + 0.2);
  }

  // ---- Balcony railings on the lower roof in front of the upper window ----
  // Sit on the lower roof, between upper-level front face and lower roof front edge.
  const balconyZ = (upperFrontZ + halfDepth) / 2;
  // Glass balustrade panel.
  addBox(group, upperWidth - 0.4, 0.9, 0.08, materials.glass,
    0, lowerHeight + 1.5, balconyZ);
  // Wood handrail on top of the glass.
  addBox(group, upperWidth, 0.12, 0.18, materials.wood,
    0, lowerHeight + 2.0, balconyZ);
  // Vertical posts at intervals.
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    const x = -upperWidth / 2 + upperWidth * t;
    addBox(group, 0.16, 1.0, 0.16, materials.wood, x, lowerHeight + 1.5, balconyZ);
  }

  // ---- Upper roof: gentle slope, big front overhang -----------------------
  const upperRoofY = upperBaseY + upperHeight + 0.28;
  const upperRoof = addBox(
    group, upperWidth + 1.6, 0.32, upperDepth + 1.6,
    materials.roof, 0, upperRoofY, upperZ + 0.2
  );
  upperRoof.rotation.x = -0.06;
  upperRoof.name = "villa-upper-roof";

  // Crown trim along the front edge of the upper roof.
  const crown = addBox(
    group, upperWidth + 1.6, 0.14, 0.26,
    materials.trim, 0, upperRoofY - 0.06, upperFrontZ + 0.92
  );
  crown.rotation.x = -0.06;

  // ---- Decorative chimney/stack on the upper roof -------------------------
  addBox(group, 1.1, 1.4, 1.1, materials.villaDark,
    -upperWidth / 2 + 2.5, upperRoofY + 0.85, upperZ + 1.0);
  addBox(group, 1.3, 0.18, 1.3, materials.trim,
    -upperWidth / 2 + 2.5, upperRoofY + 1.65, upperZ + 1.0);

  // ---- Front porch deck + grand entry steps -------------------------------
  // Wide stone porch in front of the door gap.
  addBox(group, 12.0, 0.22, 2.4, materials.trim, 0, 0.22, frontZ + 1.2);
  // Three step risers stretching across the porch front.
  for (let i = 0; i < 3; i += 1) {
    const stepWidth = 11.0 - i * 0.6;
    addBox(group, stepWidth, 0.16, 0.6, materials.trim, 0, 0.12 - i * 0.06, frontZ + 2.4 + i * 0.6);
  }

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

  // Three slate terraces, each one cradling a pool. Heights step down so water
  // visibly cascades along the channels between them. Centers match world.js
  // pool centers; sizes are slightly larger than the rims so the slabs read as
  // platforms rather than discs.
  addTerraceSlab(group, materials, "hot-spring-stone-terrace-upper", 8.0, 7.8, 20, 0.66, -8);
  addTerraceSlab(group, materials, "hot-spring-stone-terrace-middle", 4.4, 6.0, 24, 0.42, -2);
  addTerraceSlab(group, materials, "hot-spring-stone-terrace-lower", 8.6, 7.8, 21, 0.18, 9);
  addTerraceSlab(group, materials, "hot-spring-stone-terrace-entry", 4.0, 4.0, 17, 0.04, 13);

  // Stair flights connecting tiers, each rendered as a stack of stone treads.
  // Entry steps: courtyard up to the lower terrace, west of the front rim so
  // the player walks past the rim into the terrace deck.
  addStairFlight(group, materials, "hot-spring-step-entry", {
    startX: 15.0,
    startZ: 14.5,
    endX: 15.5,
    endZ: 11.5,
    startY: 0.04,
    endY: 0.22,
    treads: 4,
    width: 2.6,
    depth: 0.9
  });
  // Lower → middle terrace stairs (between lower pool back rim and middle pool front rim).
  addStairFlight(group, materials, "hot-spring-step-lower-middle", {
    startX: 22.5,
    startZ: 4.4,
    endX: 23.5,
    endZ: 2.0,
    startY: 0.22,
    endY: 0.46,
    treads: 4,
    width: 2.2,
    depth: 0.85
  });
  // Middle → upper terrace stairs.
  addStairFlight(group, materials, "hot-spring-step-middle-upper", {
    startX: 22.4,
    startZ: -4.4,
    endX: 21.0,
    endZ: -6.0,
    startY: 0.46,
    endY: 0.7,
    treads: 4,
    width: 2.2,
    depth: 0.85
  });

  // Water channels carrying flow between tiers — slightly inset so they don't z-fight
  // with the terrace slabs above.
  addWaterChannel(group, materials, 22.6, 0.16, 3.6, 1.05, 6.4, -0.42, "lower-middle");
  addWaterChannel(group, materials, 21.8, 0.4, -4.8, 1.0, 5.6, 0.6, "middle-upper");

  addTieredPool(group, materials, {
    id: "upper-spring",
    x: 20,
    z: -8,
    width: 6.0,
    depth: 6.4,
    waterY: 0.62,
    wallY: 0.86,
    shape: "oval"
  });
  addTieredPool(group, materials, {
    id: "middle-spring",
    x: 24,
    z: -2,
    width: 2.6,
    depth: 4.0,
    waterY: 0.38,
    wallY: 0.62,
    shape: "oval"
  });
  addTieredPool(group, materials, {
    id: "lower-spring",
    x: 21,
    z: 9,
    width: 6.8,
    depth: 6.6,
    waterY: 0.14,
    wallY: 0.38,
    shape: "circle"
  });

  return group;
}

export function createMushroomHouse(materials) {
  const group = new THREE.Group();

  // ---- Stem (the peach cylinder body) -------------------------------------
  // Slight pinch-and-flare so the mushroom reads as organic, not industrial.
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 2.4, 3.4, 40),
    materials.mushroomStem
  );
  stem.position.y = 1.7;
  stem.castShadow = true;
  stem.receiveShadow = true;
  group.add(stem);

  // ---- Front facade plate -------------------------------------------------
  // Curved peach panel mounted to the front of the stem so the door and windows
  // can sit flush in a *flat* surface instead of floating in front of a curve.
  // Geometry: a low BoxGeometry pushed slightly into the stem; it gives the
  // door and windows a true wall to live in. Test requires window depth <= 0.05
  // and z ∈ (-1.5, -1.43), which both fit naturally now.
  const facade = addBox(group, 3.6, 2.6, 0.4, materials.mushroomStem,
    0, 1.4, -1.65);
  facade.castShadow = true;
  facade.receiveShadow = true;

  // ---- Door (with rounded arch-top trim) ----------------------------------
  const door = addBox(group, 1.0, 1.6, 0.16, materials.wood, 0, 0.95, -1.46);
  door.rotation.y = 0.0;
  // Rounded arch above the door.
  const archTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.16, 24, 1, false, 0, Math.PI),
    materials.wood
  );
  archTop.rotation.x = Math.PI / 2;
  archTop.position.set(0, 1.74, -1.46);
  group.add(archTop);
  // Door frame trim around the arch.
  addBox(group, 1.2, 0.12, 0.18, materials.trim, 0, 1.78, -1.46);
  // Door knob.
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), materials.trim);
  knob.position.set(0.34, 0.95, -1.36);
  group.add(knob);

  // ---- Windows (flush with the facade, pale arched glass) ----------------
  // Tests assert: depth <= 0.05 and -1.5 < z < -1.43. We meet both.
  const leftWindow = addBox(group, 0.46, 0.6, 0.04, materials.glass, -1.2, 1.45, -1.47);
  const rightWindow = addBox(group, 0.46, 0.6, 0.04, materials.glass, 1.2, 1.45, -1.47);
  leftWindow.name = "mushroom-window-left";
  rightWindow.name = "mushroom-window-right";
  leftWindow.castShadow = false;
  rightWindow.castShadow = false;
  // Window frames around each pane.
  for (const x of [-1.2, 1.2]) {
    addBox(group, 0.56, 0.7, 0.06, materials.wood, x, 1.45, -1.43);
    // Cross mullions (wooden +) inside the frame.
    addBox(group, 0.46, 0.06, 0.04, materials.wood, x, 1.45, -1.46);
    addBox(group, 0.06, 0.6, 0.04, materials.wood, x, 1.45, -1.46);
  }

  // ---- Cap (the red dome with white spots) -------------------------------
  // Wider, rounder cap with a thicker brim — closer to the storybook reference.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(3.1, 36, 18), materials.mushroomCap);
  cap.scale.set(1.18, 0.5, 1.08);
  cap.position.y = 3.85;
  cap.castShadow = true;
  group.add(cap);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 2.7, 0.42, 36), materials.mushroomCap);
  brim.position.y = 2.85;
  brim.castShadow = true;
  group.add(brim);

  // Underside of the cap (white gills).
  const gills = new THREE.Mesh(
    new THREE.CylinderGeometry(2.65, 2.05, 0.18, 36),
    materials.mushroomSpot
  );
  gills.position.y = 2.7;
  group.add(gills);

  // ---- White polka-dot spots on the cap -----------------------------------
  [
    [-1.6, 4.2, -1.85],
    [0, 4.55, -1.95],
    [1.5, 4.1, -1.7],
    [-0.6, 3.6, -2.65],
    [2.0, 3.7, -0.2],
    [-2.1, 3.65, 0.4],
    [0.7, 3.85, 2.4],
    [-1.1, 3.9, 2.1]
  ].forEach(([x, y, z]) => {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 12), materials.mushroomSpot);
    spot.scale.y = 0.32;
    spot.position.set(x, y, z);
    group.add(spot);
  });

  // ---- Base details: doorstep, grass tufts, two tiny mushroom buddies -----
  // Stone doorstep just south of the door.
  addBox(group, 1.4, 0.16, 0.5, materials.stone, 0, 0.08, -2.05);

  // Soft grass tufts hugging the base of the stem.
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2 + 0.2;
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), materials.leaf);
    tuft.scale.set(1.0, 0.5, 1.0);
    tuft.position.set(Math.cos(angle) * 2.4, 0.16, Math.sin(angle) * 2.4);
    tuft.castShadow = true;
    group.add(tuft);
  }

  // Two tiny baby mushrooms beside the door for storybook charm.
  for (const offset of [-1.7, 1.7]) {
    const babyStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.18, 0.4, 18),
      materials.mushroomStem
    );
    babyStem.position.set(offset, 0.2, -2.3);
    group.add(babyStem);
    const babyCap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 12), materials.mushroomCap);
    babyCap.scale.set(1.1, 0.5, 1.1);
    babyCap.position.set(offset, 0.5, -2.3);
    group.add(babyCap);
    // One spot on the baby cap.
    const babySpot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), materials.mushroomSpot);
    babySpot.position.set(offset, 0.62, -2.3);
    group.add(babySpot);
  }

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

  // ---- Body: chubbier, rounder, sits a touch lower ------------------------
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.78, 32, 22), materials.pig);
  body.scale.set(1.18, 0.95, 1.28);
  body.position.y = 0.74;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Soft belly highlight (slightly lighter pink underbelly).
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.62, 28, 18), materials.snout);
  belly.scale.set(1.0, 0.7, 1.0);
  belly.position.set(0, 0.42, 0.05);
  group.add(belly);

  // ---- Head: bigger relative to body, more "babyish" proportion ----------
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.66, 32, 22), materials.pig);
  head.position.set(0, 1.32, -0.55);
  head.scale.set(1.12, 1.08, 1.02);
  head.castShadow = true;
  group.add(head);

  // ---- Snout (rounder, cuter) --------------------------------------------
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.26, 22, 16), materials.snout);
  snout.position.set(0, 1.22, -1.08);
  snout.scale.set(1.4, 0.85, 0.7);
  snout.castShadow = true;
  group.add(snout);
  // A flat snout disc tip so the nostrils sit on a clear "pad".
  const snoutTip = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 22), materials.snout);
  snoutTip.rotation.x = Math.PI / 2;
  snoutTip.position.set(0, 1.22, -1.18);
  group.add(snoutTip);

  // Nostril dimples — small dark ovals on the snout tip.
  [-0.085, 0.085].forEach((x) => {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), materials.pigDark);
    nostril.scale.set(0.9, 1.3, 0.6);
    nostril.position.set(x, 1.22, -1.21);
    group.add(nostril);
  });

  // ---- Eyes: white sclera + dark pupil + tiny shine spot -----------------
  [-0.27, 0.27].forEach((x) => {
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), materials.mushroomSpot);
    sclera.position.set(x, 1.45, -1.0);
    sclera.scale.set(0.9, 1.1, 0.7);
    group.add(sclera);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), materials.pigDark);
    pupil.position.set(x * 0.92, 1.45, -1.08);
    pupil.scale.set(0.85, 1.1, 0.6);
    group.add(pupil);

    // Tiny white shine spot on the pupil — the universal "cute eye" trick.
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), materials.mushroomSpot);
    shine.position.set(x * 0.86 + 0.025, 1.5, -1.12);
    group.add(shine);
  });

  // ---- Cheek blush: small soft pink discs below the eyes ------------------
  const blushMat = materials.snout;
  [-0.32, 0.32].forEach((x) => {
    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), blushMat);
    blush.scale.set(1.1, 0.6, 0.4);
    blush.position.set(x, 1.28, -1.04);
    group.add(blush);
  });

  // ---- Mouth: small dark smile arc (a thin flattened torus) ---------------
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 16, Math.PI), materials.pigDark);
  mouth.rotation.x = Math.PI / 2;
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, 1.13, -1.18);
  group.add(mouth);

  // ---- Ears: floppy, curve forward (rotated and scaled cones) -------------
  [-0.32, 0.32].forEach((x) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 16), materials.pig);
    ear.position.set(x * 1.4, 1.78, -0.55);
    // Tilt forward and outward for a floppy look.
    ear.rotation.set(0.55, 0, x > 0 ? -0.85 : 0.85);
    ear.scale.set(1.0, 1.0, 0.6);
    ear.castShadow = true;
    group.add(ear);

    // Inner ear (slightly darker pink) — gives the ear depth.
    const innerEar = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 14), materials.snout);
    innerEar.position.set(x * 1.36, 1.74, -0.5);
    innerEar.rotation.set(0.55, 0, x > 0 ? -0.85 : 0.85);
    innerEar.scale.set(1.0, 1.0, 0.5);
    group.add(innerEar);
  });

  // ---- Four little legs --------------------------------------------------
  const legPositions = [
    [-0.42, 0.2, -0.45],
    [0.42, 0.2, -0.45],
    [-0.42, 0.2, 0.5],
    [0.42, 0.2, 0.5]
  ];
  legPositions.forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.4, 14), materials.pig);
    leg.position.set(x, y, z);
    leg.castShadow = true;
    group.add(leg);
    // Hoof — a small darker disc at the bottom.
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.06, 14), materials.pigDark);
    hoof.position.set(x, 0.03, z);
    group.add(hoof);
  });

  // ---- Curly tail (a small torus in profile) ------------------------------
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 10, 20), materials.pig);
  tail.position.set(0, 0.92, 0.95);
  tail.rotation.set(0, Math.PI / 2, 0.4);
  tail.castShadow = true;
  group.add(tail);

  // ---- Optional microphone (idol mode) -----------------------------------
  if (options.mic) {
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 14), materials.pigDark);
    mic.position.set(-0.62, 0.75, -1.05);
    mic.rotation.z = -0.2;
    group.add(mic);

    const micHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), materials.pigDark);
    micHead.position.set(-0.74, 1.36, -1.12);
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
  // Outer rim radii (where the rock wall sits) and inner radii (where the water lives).
  // The wall has real thickness (rim - inner) so you can no longer see *through* it
  // from a low camera angle.
  const rimX = pool.width / 2;
  const rimZ = pool.depth / 2;
  const rimThickness = 0.55;
  const innerX = Math.max(0.4, rimX - rimThickness);
  const innerZ = Math.max(0.4, rimZ - rimThickness);
  const wallHeight = Math.max(0.32, pool.wallY - (pool.waterY - 0.4));

  // Solid sunken basin: cup the water from underneath so the underside isn't visible
  // through the transparent water disk. Sits well below water level to remove z-fighting.
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.85, 0.6, 48), materials.stone);
  basin.name = `hot-spring-basin-${pool.id}`;
  basin.position.set(pool.x, pool.waterY - 0.34, pool.z);
  basin.scale.set(innerX, 1, innerZ);
  basin.castShadow = false;
  basin.receiveShadow = true;
  group.add(basin);

  // Stone rim built from a ring of overlapping stone blocks — gives real thickness and
  // avoids the see-through gap of a thin TorusGeometry. Each block tapers slightly to
  // read as natural rock rather than a perfect bevel.
  const rimSegments = pool.shape === "circle" ? 28 : 22;
  for (let index = 0; index < rimSegments; index += 1) {
    const angle = (index / rimSegments) * Math.PI * 2;
    const cx = Math.cos(angle);
    const sz = Math.sin(angle);
    const midX = ((rimX + innerX) / 2) * cx;
    const midZ = ((rimZ + innerZ) / 2) * sz;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(rimThickness * 0.95, wallHeight, 0.65),
      materials.stone
    );
    block.name = `hot-spring-rock-wall-${pool.id}`;
    block.position.set(pool.x + midX, pool.waterY + wallHeight / 2 - 0.08, pool.z + midZ);
    // Rotate each block to face outward from pool center, then jitter for natural feel.
    block.rotation.y = Math.atan2(-cx * rimZ, sz * rimX) + Math.PI / 2;
    block.rotation.z = (index % 2 === 0 ? 1 : -1) * 0.04;
    block.scale.y = 0.92 + ((index * 13) % 7) * 0.02;
    block.castShadow = true;
    block.receiveShadow = true;
    group.add(block);
  }

  // Water disk sits clearly below the rim top. polygonOffset + renderOrder keep it from
  // fighting the basin and channel surfaces.
  const waterMaterial = materials.water.clone();
  waterMaterial.opacity = 0.92;
  waterMaterial.depthWrite = false;
  waterMaterial.polygonOffset = true;
  waterMaterial.polygonOffsetFactor = -1;
  waterMaterial.polygonOffsetUnits = -1;
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 80), waterMaterial);
  water.name = `hot-spring-water-${pool.id}`;
  water.rotation.x = -Math.PI / 2;
  water.position.set(pool.x, pool.waterY, pool.z);
  water.scale.set(innerX - 0.05, innerZ - 0.05, 1);
  water.renderOrder = 4;
  water.receiveShadow = true;
  group.add(water);

  // Inner soft ripple highlight — an even lighter water disk slightly above main water.
  const rippleMaterial = waterMaterial.clone();
  rippleMaterial.opacity = 0.45;
  rippleMaterial.color = new THREE.Color("#a3e2f5");
  const ripple = new THREE.Mesh(new THREE.CircleGeometry(1, 64), rippleMaterial);
  ripple.name = `hot-spring-ripple-${pool.id}`;
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.set(pool.x, pool.waterY + 0.005, pool.z);
  ripple.scale.set((innerX - 0.05) * 0.55, (innerZ - 0.05) * 0.55, 1);
  ripple.renderOrder = 5;
  group.add(ripple);

  // Scattered cap rocks dotted along the rim — bigger and more irregular than before.
  const capRockCount = pool.shape === "circle" ? 18 : 12;
  for (let index = 0; index < capRockCount; index += 1) {
    const angle = (index / capRockCount) * Math.PI * 2 + (index % 3) * 0.08;
    const r = 0.22 + ((index * 7) % 5) * 0.05;
    const rock = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), materials.stone);
    rock.name = `hot-spring-edge-rock-${pool.id}`;
    rock.position.set(
      pool.x + Math.cos(angle) * (rimX - 0.05),
      pool.waterY + wallHeight - 0.05 + (index % 3) * 0.04,
      pool.z + Math.sin(angle) * (rimZ - 0.05)
    );
    rock.scale.y = 0.6 + ((index * 5) % 4) * 0.05;
    rock.scale.x = 0.85 + ((index * 11) % 5) * 0.05;
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }

  // Steam puffs centered over the pool, plus one off-center for variety.
  addSteam(group, materials, pool.x - rimX * 0.25, pool.z + rimZ * 0.1);
  addSteam(group, materials, pool.x + rimX * 0.18, pool.z - rimZ * 0.22);
  addSteam(group, materials, pool.x, pool.z);
}

function addWaterChannel(group, materials, x, y, z, width, depth, rotationY, id) {
  const channelMaterial = materials.water.clone();
  channelMaterial.opacity = 0.88;
  channelMaterial.depthWrite = false;
  channelMaterial.polygonOffset = true;
  channelMaterial.polygonOffsetFactor = -1;
  channelMaterial.polygonOffsetUnits = -1;
  const channel = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, depth), channelMaterial);
  channel.name = `hot-spring-channel-water-${id}`;
  channel.position.set(x, y, z);
  channel.rotation.y = rotationY;
  channel.renderOrder = 4;
  channel.receiveShadow = true;
  group.add(channel);

  const leftBank = addBox(group, 0.32, 0.4, depth, materials.stone, x - width / 2, y + 0.18, z, { y: rotationY });
  const rightBank = addBox(group, 0.32, 0.4, depth, materials.stone, x + width / 2, y + 0.18, z, { y: rotationY });
  leftBank.name = `hot-spring-channel-bank-${id}`;
  rightBank.name = `hot-spring-channel-bank-${id}`;
}

function addStairFlight(group, materials, namePrefix, options) {
  const { startX, startZ, endX, endZ, startY, endY, treads, width, depth } = options;
  const dx = (endX - startX) / Math.max(1, treads - 1);
  const dz = (endZ - startZ) / Math.max(1, treads - 1);
  const dy = (endY - startY) / Math.max(1, treads - 1);
  const angle = Math.atan2(endX - startX, endZ - startZ);
  for (let index = 0; index < treads; index += 1) {
    const tread = addBox(group, width, 0.18, depth, materials.stone,
      startX + dx * index,
      startY + dy * index,
      startZ + dz * index
    );
    tread.rotation.y = angle;
    tread.name = `${namePrefix}-${index + 1}`;
  }
}

function addTerraceSlab(group, materials, name, width, depth, x, y, z) {
  const slab = addBox(group, width, 0.2, depth, materials.stone, x, y, z);
  slab.name = name;
  // Decorative edge rocks. Skip rocks on the sides facing other terraces (the side
  // closest to the next pool) so stairs and channels can rest cleanly against the slab.
  const rocksPerSide = Math.max(4, Math.round(Math.max(width, depth) / 1.4));
  for (let index = 0; index < rocksPerSide; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const t = (index + 0.5) / rocksPerSide;
    const rock = new THREE.Mesh(new THREE.SphereGeometry(0.18 + ((index * 5) % 3) * 0.04, 10, 8), materials.stone);
    rock.name = `${name}-edge-rock`;
    rock.position.set(x + side * width * 0.52, y + 0.14, z - depth / 2 + depth * t);
    rock.scale.y = 0.5;
    rock.scale.x = 0.85 + ((index * 7) % 3) * 0.06;
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }
  return slab;
}

function addSteam(group, materials, x, z) {
  for (let index = 0; index < 4; index += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.32 + index * 0.1, 14, 10), materials.steam);
    puff.position.set(
      x + Math.sin(index * 1.7) * 0.35,
      1.1 + index * 0.55,
      z + Math.cos(index * 1.7) * 0.35
    );
    puff.scale.set(1, 1.2 + index * 0.15, 1);
    puff.renderOrder = 6;
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
