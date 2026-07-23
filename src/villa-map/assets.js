import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const textureCache = new Map();

export function createMaterials() {
  return {
    grass: new THREE.MeshStandardMaterial({ color: "#89b06a", roughness: 0.96 }),
    outsideGrass: new THREE.MeshStandardMaterial({ color: "#78995d", roughness: 0.98 }),
    path: new THREE.MeshStandardMaterial({ color: "#d7b16f", roughness: 0.92 }),
    floor: new THREE.MeshStandardMaterial({ color: "#d9a06a", roughness: 0.86 }),
    wall: new THREE.MeshStandardMaterial({ color: "#f1c6a3", roughness: 0.82 }),
    // Villa shell palette — warmer, richer stucco/plaster with a touch of
    // colour variation so the big peach panels don't read as one flat slab.
    villaWall: new THREE.MeshStandardMaterial({ color: "#e8a472", roughness: 0.86 }),
    villaDark: new THREE.MeshStandardMaterial({ color: "#6f2f35", roughness: 0.7 }),
    trim: new THREE.MeshStandardMaterial({ color: "#bd5f55", roughness: 0.82 }),
    roof: new THREE.MeshStandardMaterial({ color: "#ad3f38", roughness: 0.78 }),
    wood: new THREE.MeshStandardMaterial({ color: "#8a5738", roughness: 0.72 }),
    // ---- Villa shell finish accents (additive, used by createModernVilla) ----
    // A deeper walnut for fascia/eave boards + door slabs (richer than `wood`).
    fascia: new THREE.MeshStandardMaterial({ color: "#5e3a26", roughness: 0.66 }),
    // Warm stained door leaves, a shade lighter than the fascia.
    doorWood: new THREE.MeshStandardMaterial({ color: "#6e4327", roughness: 0.6 }),
    // Pale cast-stone for the porch base / plinth, cooler than the peach stucco.
    stoneBase: new THREE.MeshStandardMaterial({ color: "#cdbfa6", roughness: 0.9 }),
    // Soft terracotta baseboard skirt where the perimeter walls meet the floor.
    baseboard: new THREE.MeshStandardMaterial({ color: "#a85a4d", roughness: 0.8 }),
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
    dogHouse: new THREE.MeshStandardMaterial({ color: "#f7d84f", roughness: 0.82 }),
    // ---- Villa interior palette (modern minimalist) ----------------------
    wallInterior: new THREE.MeshStandardMaterial({ color: "#f4dcc6", roughness: 0.88 }),
    wallAccent: new THREE.MeshStandardMaterial({ color: "#b66c5b", roughness: 0.84 }),
    ceiling: new THREE.MeshStandardMaterial({ color: "#fbf3e8", roughness: 0.93 }),
    floorPlank: new THREE.MeshStandardMaterial({ color: "#a87148", roughness: 0.72 }),
    fabricCream: new THREE.MeshStandardMaterial({ color: "#efe2cf", roughness: 0.86 }),
    fabricNavy: new THREE.MeshStandardMaterial({ color: "#3a4c66", roughness: 0.82 }),
    metalBrass: new THREE.MeshStandardMaterial({ color: "#caa15a", roughness: 0.42, metalness: 0.5 }),
    rugCharcoal: new THREE.MeshStandardMaterial({ color: "#3e3a36", roughness: 0.95 })
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
  addBeveledBox(group, buildingWidth, lowerHeight, 0.4, materials.villaWall, 0, lowerY, -halfDepth + 0.2);
  addBeveledBox(group, 0.4, lowerHeight, buildingDepth, materials.villaWall, -halfWidth + 0.2, lowerY, 0);
  addBeveledBox(group, 0.4, lowerHeight, buildingDepth, materials.villaWall, halfWidth - 0.2, lowerY, 0);

  // Subtle vertical window slits on side walls — more of them, since side walls
  // are now longer.
  for (const z of [-8, -5, -2, 1, 4, 7]) {
    addBox(group, 0.06, 2.0, 0.5, materials.glass, -halfWidth + 0.18, 2.8, z);
    addBox(group, 0.06, 2.0, 0.5, materials.glass, halfWidth - 0.18, 2.8, z);
  }

  // Interior baseboard skirt where the perimeter walls meet the floor, so the
  // open great hall reads as one trimmed-out room. A thin terracotta band hugs
  // the inner wall faces; it's purely decorative and sits inside the existing
  // collider lines.
  const skirtY = 0.12;       // half-height above floor
  const skirtT = 0.1;        // protrudes this far off the wall face
  // Back wall (inner face at local z = -halfDepth + 0.4).
  addBox(group, buildingWidth - 0.4, 0.24, skirtT, materials.baseboard,
    0, skirtY, -halfDepth + 0.4 + skirtT / 2);
  // Side walls (inner faces at x = ∓(halfWidth - 0.4)).
  addBox(group, skirtT, 0.24, buildingDepth - 0.8, materials.baseboard,
    -halfWidth + 0.4 - skirtT / 2, skirtY, 0);
  addBox(group, skirtT, 0.24, buildingDepth - 0.8, materials.baseboard,
    halfWidth - 0.4 + skirtT / 2, skirtY, 0);

  // Slim wood corner posts at the four lower-shell vertical corners — they
  // crisp up the silhouette where the beveled wall panels meet, reading as
  // exposed structural columns. Beveled so they match the softened panels.
  for (const cx of [-halfWidth + 0.18, halfWidth - 0.18]) {
    for (const cz of [-halfDepth + 0.18, halfDepth - 0.18]) {
      addBeveledBox(group, 0.34, lowerHeight + 0.2, 0.34, materials.fascia,
        cx, (lowerHeight + 0.2) / 2, cz, {}, 0.06);
    }
  }

  // ---- Front (south) facade: cartoon-style modern front -------------------
  // Door gap matches the world.js hall-front-* colliders: x ∈ [-5, +5].
  // Wings flank the gap on either side.
  const frontZ = halfDepth - 0.2;
  const doorHalfWidth = 5; // door gap radius

  // Front wings: TWO matching floor-to-ceiling glass curtain walls flanking the
  // open entry, so the whole facade reads as one unified glass front (instead of
  // the old glassy-left / dark-red-right mismatch). Spans x ∈ [-13,-5] & [+5,+13].
  const wingWidth = halfWidth - doorHalfWidth;
  const wingOffset = doorHalfWidth + wingWidth / 2;
  buildGlassCurtainWing(group, materials, -wingOffset, wingWidth, lowerHeight, frontZ);
  buildGlassCurtainWing(group, materials, wingOffset, wingWidth, lowerHeight, frontZ);

  // ---- Central entry zone (door gap, x ∈ [-5, +5]) ------------------------
  // Door gap stays open at ground level. A grand peach lintel above carries
  // the second floor.
  addBeveledBox(group, doorHalfWidth * 2 + 0.6, 0.8, 0.6, materials.villaWall,
    0, lowerHeight - 0.4, frontZ);
  // Slim vertical wood door-frame posts at the gap edges.
  addBox(group, 0.22, lowerHeight - 0.4, 0.22, materials.wood, -doorHalfWidth + 0.2, lowerY - 0.1, frontZ + 0.3);
  addBox(group, 0.22, lowerHeight - 0.4, 0.22, materials.wood, doorHalfWidth - 0.2, lowerY - 0.1, frontZ + 0.3);
  // Horizontal accent beam above the door (the "sun visor" detail from the ref).
  addBox(group, doorHalfWidth * 2 + 0.4, 0.16, 0.16, materials.trim,
    0, lowerHeight - 0.2, frontZ + 0.55);

  // No door leaf — the entry stays a fully open portal (open-plan design); the
  // lintel + frame posts + visor beam above just frame the opening.

  // A pair of low planters flanking the entry, one warm peach.
  addBeveledBox(group, 0.6, 0.6, 0.6, materials.trim, -doorHalfWidth + 0.6, 0.3, frontZ + 1.0, {}, 0.05);
  addBeveledBox(group, 0.6, 0.6, 0.6, materials.trim, doorHalfWidth - 0.6, 0.3, frontZ + 1.0, {}, 0.05);

  // ---- Lower roof: sloped overhang with a real stairwell opening -----------
  // Slopes upward toward the back so the front edge hangs lower over the porch
  // and the back rises higher into the upper-level base. This used to be one
  // solid box (plus a solid underside) beneath the cut-out upper floor, which
  // visually sealed the staircase despite the floor itself having a hole.
  const lowerRoofThickness = 0.36;
  const lowerRoofY = lowerHeight + 0.6;
  const lowerRoofSlope = -0.05;
  // Slightly oversize the roof cut-out relative to the 3 x 4 m upper-floor
  // hole so the sloped roof edges never peek into the vertical opening.
  const stairRoofOpening = {
    minX: -1.62,
    maxX: 1.62,
    minZ: 0.88,
    maxZ: 5.12
  };
  addCutoutBoxLayer(group, {
    name: "villa-lower-roof",
    width: buildingWidth + 1.6,
    height: lowerRoofThickness,
    depth: buildingDepth + 1.4,
    material: materials.roof,
    y: lowerRoofY,
    rotationX: lowerRoofSlope,
    opening: stairRoofOpening
  });

  // Painted underside trim follows the exact same opening.
  addCutoutBoxLayer(group, {
    name: "villa-lower-roof-underside",
    width: buildingWidth + 1.4,
    height: 0.06,
    depth: buildingDepth + 1.2,
    material: materials.trim,
    y: lowerRoofY - 0.22,
    rotationX: lowerRoofSlope,
    opening: stairRoofOpening
  });

  // Fascia / eave board hanging off the lower-roof front lip — a thin walnut
  // band that follows the front edge, the detail that turns a bare slab into a
  // built roof. Front edge of the roof is at local z = +(buildingDepth/2 + 0.7).
  const lowerRoofFrontZ = halfDepth + 0.7;
  addBox(group, buildingWidth + 1.6, 0.34, 0.12, materials.fascia,
    0, lowerRoofY - 0.16, lowerRoofFrontZ, { x: lowerRoofSlope });

  // ---- Upper level (smaller, set back from front edge) --------------------
  const upperHeight = 4.6;
  const upperBaseY = lowerHeight + 1.05;
  const upperY = upperBaseY + upperHeight / 2;
  const upperWidth = 16;
  const upperDepth = 10;
  const upperFrontZ = halfDepth - 4.0; // pushed back so the lower roof reads as a balcony platform
  const upperZ = upperFrontZ - upperDepth / 2;

  // Floor slab between the two storeys, with a 3 × 4 cutout above the stair
  // hole at local x ∈ [-1.5, +1.5], z ∈ [+1, +5]. Built as 4 boxes around the
  // hole so players walking up the stairs see daylight through the opening
  // and so upper-floor visitors don't walk on air over the hole.
  // Upper-floor footprint: local x ∈ [-8.3, +8.3], z ∈ [-3.3, +7.3].
  // West slab portion: local x ∈ [-8.3, -1.5], z ∈ [-3.3, +7]
  addBox(group, 6.8, 0.2, 10.3, materials.floorPlank,
    -4.9, upperBaseY - 0.1, 1.85);
  // East slab portion: local x ∈ [+1.5, +8.3], z ∈ [-3.3, +7]
  addBox(group, 6.8, 0.2, 10.3, materials.floorPlank,
    4.9, upperBaseY - 0.1, 1.85);
  // North-center slab strip north of the stair hole: local z ∈ [-3.3, +1]
  addBox(group, 3, 0.2, 4.3, materials.floorPlank,
    0, upperBaseY - 0.1, -1.15);
  // South-center slab strip south of the stair hole: local z ∈ [+5, +7]
  addBox(group, 3, 0.2, 2, materials.floorPlank,
    0, upperBaseY - 0.1, 6);
  // Peach trim ringing the stair-hole edge so the cutout reads as intentional
  // (visible from both the ground hall looking up and the upper landing).
  addBox(group, 3.2, 0.06, 0.18, materials.trim, 0, upperBaseY - 0.02, 1);   // north edge of hole
  addBox(group, 3.2, 0.06, 0.18, materials.trim, 0, upperBaseY - 0.02, 5);   // south edge of hole
  addBox(group, 0.18, 0.06, 4.2, materials.trim, -1.5, upperBaseY - 0.02, 3); // west edge of hole
  addBox(group, 0.18, 0.06, 4.2, materials.trim, 1.5, upperBaseY - 0.02, 3);  // east edge of hole

  // Upper level back wall.
  addBeveledBox(group, upperWidth, upperHeight, 0.32, materials.villaWall,
    0, upperY, upperZ - upperDepth / 2 + 0.16);
  // Upper side walls.
  addBeveledBox(group, 0.32, upperHeight, upperDepth, materials.villaWall,
    -upperWidth / 2 + 0.16, upperY, upperZ);
  addBeveledBox(group, 0.32, upperHeight, upperDepth, materials.villaWall,
    upperWidth / 2 - 0.16, upperY, upperZ);

  // Upper FRONT face: dramatic floor-to-ceiling window wall, split into two
  // bands by a wood band, with a small peach lip top and bottom.
  addBox(group, upperWidth, 0.4, 0.32, materials.villaWall,
    0, upperBaseY + 0.2, upperFrontZ);
  addBox(group, upperWidth - 0.4, upperHeight - 0.85, 0.14, materials.glass,
    0, upperY + 0.05, upperFrontZ + 0.1);
  addBox(group, upperWidth, 0.45, 0.32, materials.villaWall,
    0, upperBaseY + upperHeight - 0.22, upperFrontZ);
  // Slim wood frame down the two outer edges of the upper window wall so the
  // big glazed band reads as a framed curtain, not a hole. (Top/bottom already
  // have the peach lips above; these are the left/right jambs.)
  const upGlassH = upperHeight - 0.85;
  for (const fx of [-(upperWidth - 0.4) / 2, (upperWidth - 0.4) / 2]) {
    addBox(group, 0.16, upGlassH, 0.22, materials.wood,
      fx, upperY + 0.05, upperFrontZ + 0.18);
  }
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
  const upperRoofSlope = -0.06;
  const upperRoof = addBeveledBox(
    group, upperWidth + 1.6, 0.32, upperDepth + 1.6,
    materials.roof, 0, upperRoofY, upperZ + 0.2, { x: upperRoofSlope }, 0.05
  );
  upperRoof.name = "villa-upper-roof";

  // Crown trim along the front edge of the upper roof.
  const crown = addBox(
    group, upperWidth + 1.6, 0.14, 0.26,
    materials.trim, 0, upperRoofY - 0.06, upperFrontZ + 0.92, { x: upperRoofSlope }
  );

  // Fascia / eave board under the upper-roof front lip — same walnut band as
  // the lower roof, tying the two eaves together.
  addBox(group, upperWidth + 1.6, 0.3, 0.12, materials.fascia,
    0, upperRoofY - 0.18, upperFrontZ + 0.92, { x: upperRoofSlope });

  // ---- Decorative chimney/stack on the upper roof -------------------------
  addBeveledBox(group, 1.1, 1.4, 1.1, materials.villaDark,
    -upperWidth / 2 + 2.5, upperRoofY + 0.85, upperZ + 1.0, {}, 0.05);
  addBeveledBox(group, 1.3, 0.18, 1.3, materials.trim,
    -upperWidth / 2 + 2.5, upperRoofY + 1.65, upperZ + 1.0, {}, 0.05);

  // ---- Front porch deck + grand entry steps -------------------------------
  // Wide cast-stone porch slab in front of the door gap (cooler stone tone +
  // softened edge sets it apart from the warm peach shell above).
  addBeveledBox(group, 12.0, 0.22, 2.4, materials.stoneBase, 0, 0.22, frontZ + 1.2, {}, 0.05);
  // Three step risers stretching across the porch front.
  for (let i = 0; i < 3; i += 1) {
    const stepWidth = 11.0 - i * 0.6;
    addBeveledBox(group, stepWidth, 0.16, 0.6, materials.stoneBase, 0, 0.12 - i * 0.06, frontZ + 2.4 + i * 0.6, {}, 0.04);
  }

  // ============================================================
  // INTERIOR — partitions, staircase, upper-floor walls, furniture
  // ============================================================
  // All coords below are LOCAL to the villa group (world = local + (0, 0, -13)).
  // World→Local Z mapping: local z = world z + 13.

  // ---- Open ground floor ------------------------------------------------
  // The old x = ±3 foyer-pocket partition walls were removed (they read as
  // unnatural half-walls beside the stairs) — the entry, stair vestibule and
  // both great halls are now one continuous open space. Only the west hall's
  // terracotta accent panel they used to carry survives, as the room's focal
  // backdrop behind the sofa (referenced by the great-hall-west hotspot text).
  addBox(group, 0.05, 2.4, 4.0, materials.wallAccent, -12.6, 1.5, -6);

  // ---- Stair banister / glass guard at x = ±1.5 ------------------------
  // Visual is a low handrail + glass infill; collision is full-height in
  // world.js so players can't step off the stairs sideways.
  for (const sx of [-1.5, +1.5]) {
    // Glass infill panel.
    addBox(group, 0.06, 0.92, 4.2, materials.glass, sx, 0.62, 3);
    // Wood handrail along the top.
    addBox(group, 0.12, 0.14, 4.2, materials.wood, sx, 1.18, 3);
    // Three vertical posts at the ends and middle.
    for (const pz of [0.95, 3, 5.05]) {
      addBox(group, 0.12, 1.18, 0.12, materials.wood, sx, 0.59, pz);
    }
  }

  // ---- Staircase ------------------------------------------------------
  const stair = createStaircase(materials, {
    width: 2.6,
    treads: 12,
    runPerTread: 0.4,
    risePerTread: 0.554,
    bottomLocalZ: 5,
    startY: 0.1
  });
  group.add(stair);

  // ---- Upper-floor interior partitions (Y ∈ [6.65, 11.25]) -------------
  // Minimal partitions only — area around the stair hole is fully open so
  // the descent is visible from every upstairs room.
  const upperWallY = upperBaseY + upperHeight / 2;
  const upperWallHeight = upperHeight - 0.2;
  // Small master-bedroom south corner (defines the bedroom's south-east edge
  // without enclosing the room).
  addBox(group, 0.3, upperWallHeight, 1, materials.wallInterior,
    -3, upperWallY, 6.5);
  // Study/lounge divider at local z = +2 (world z = -11). Door gap at local
  // x ∈ [+4.5, +5.5].
  addBox(group, 1.5, upperWallHeight, 0.3, materials.wallInterior,
    3.75, upperWallY, 2);
  addBox(group, 2.5, upperWallHeight, 0.3, materials.wallInterior,
    6.75, upperWallY, 2);

  // ---- Stair-hole guard rails (visible from above) ---------------------
  // Low glass + brass handrail tracing 3 edges of the stair hole on the
  // upper floor. The north edge stays open — that's the entry/exit from
  // the upper floor to the stairs. Collision for the south edge is set in
  // world.js (upper-stair-rail-south); east/west are covered by the
  // full-height stair-rail-west/east already in place.
  const railY = upperBaseY + 0.06;   // sits just above the slab top
  const railTopY = upperBaseY + 0.62; // waist-high handrail
  const glassH = 0.6;
  // South edge rail at local z = +5 (world z = -8).
  addBox(group, 3, glassH, 0.04, materials.glass, 0, railY + glassH / 2, 5);
  addBox(group, 3.1, 0.08, 0.1, materials.metalBrass, 0, railTopY, 5);
  // West and east side rails along z ∈ [+1, +5] local.
  for (const sx of [-1.5, 1.5]) {
    addBox(group, 0.04, glassH, 4, materials.glass, sx, railY + glassH / 2, 3);
    addBox(group, 0.1, 0.08, 4.1, materials.metalBrass, sx, railTopY, 3);
    // Two small posts per side.
    for (const pz of [1.05, 4.95]) {
      addBox(group, 0.08, 0.62, 0.08, materials.metalBrass, sx, railY + 0.31, pz);
    }
  }
  // Two posts along the south rail.
  for (const px of [-1.45, 1.45]) {
    addBox(group, 0.08, 0.62, 0.08, materials.metalBrass, px, railY + 0.31, 5);
  }

  // ---- Per-room furniture ----------------------------------------------
  // All interior rooms are now furnished with Kenney CC0 GLB props (Phase 2),
  // defined in furniture-placements.js and mounted at the scene root — so no
  // procedural furniture is built here anymore. (The villa shell, stairs,
  // partitions and railings above are still procedural.)

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

  // Subtle horizontal "growth ring" bands wrapped around the stem.
  for (const ringY of [0.85, 1.55, 2.4]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.18, 0.06, 8, 36),
      materials.wood
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = ringY;
    group.add(ring);
  }

  // Organic knot bumps on the back/sides of the stem.
  [
    { x: 1.7, y: 1.1, z: 0.9 },
    { x: -1.5, y: 1.9, z: 1.3 },
    { x: 0.4, y: 2.2, z: 1.9 }
  ].forEach(({ x, y, z }) => {
    const knot = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 14, 12),
      materials.mushroomStem
    );
    knot.scale.set(1.0, 0.7, 0.5);
    knot.position.set(x, y, z);
    knot.castShadow = true;
    group.add(knot);
  });

  // Root flare — chunky moss-covered roots radiating out from the base.
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.4;
    const root = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 10),
      materials.mushroomStem
    );
    root.scale.set(1.6, 0.42, 0.7);
    root.position.set(Math.cos(angle) * 2.55, 0.18, Math.sin(angle) * 2.55);
    root.rotation.y = -angle;
    root.castShadow = true;
    group.add(root);
    // Green moss capping the root.
    const moss = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 12, 10),
      materials.leaf
    );
    moss.scale.set(1.5, 0.3, 0.65);
    moss.position.set(Math.cos(angle) * 2.55, 0.34, Math.sin(angle) * 2.55);
    moss.rotation.y = -angle;
    group.add(moss);
  }

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

  // ---- Porch frame ------------------------------------------------------
  // The flat facade plate's sides and corners protrude past the stem's curve
  // (the stem is round, the facade is rectangular). We frame those exposed
  // edges with chunky wooden cornerposts + a header + a sill + a small red
  // eave so the slab reads as a built-in porch entrance, not an exposed wall.

  // Four vertical cornerposts at the facade's front & back corners. The
  // back posts hide the facade *side* faces from oblique angles; the front
  // posts frame the south view.
  for (const px of [-1.8, 1.8]) {
    for (const pz of [-1.87, -1.43]) {
      const post = addBox(group, 0.18, 2.65, 0.18, materials.wood, px, 1.35, pz);
      post.castShadow = true;
    }
  }

  // Header beam wrapping the top of the facade (front-to-back depth caps
  // the gap between the front and back cornerposts).
  addBox(group, 3.96, 0.22, 0.6, materials.wood, 0, 2.6, -1.65);

  // Sill beam at the base of the facade.
  addBox(group, 3.96, 0.16, 0.6, materials.wood, 0, 0.13, -1.65);

  // Small red roof eave overhanging the header — echoes the cap colour.
  addBox(group, 4.4, 0.12, 0.78, materials.roof, 0, 2.78, -1.6);
  // Wooden soffit board under the eave's leading edge.
  addBox(group, 4.4, 0.08, 0.18, materials.wood, 0, 2.72, -2.05);

  // Angled knee-brace brackets at the top corners (post-to-header junction).
  for (const px of [-1.8, 1.8]) {
    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.08, 0.16),
      materials.wood
    );
    bracket.position.set(px, 2.42, -1.87);
    bracket.rotation.z = px > 0 ? -0.55 : 0.55;
    bracket.castShadow = true;
    group.add(bracket);
  }

  // Slim vertical batten between each window and the door — visually breaks
  // up the facade and frames the door bay.
  for (const bx of [-0.65, 0.65]) {
    addBox(group, 0.08, 1.5, 0.04, materials.wood, bx, 1.35, -1.86);
  }

  // ---- Door (planked, with arched trim, hinges and a doorknob) -----------
  const door = addBox(group, 1.0, 1.6, 0.16, materials.wood, 0, 0.95, -1.46);
  door.rotation.y = 0.0;
  // Vertical plank seams on the door.
  for (const px of [-0.3, 0, 0.3]) {
    addBox(group, 0.03, 1.5, 0.02, materials.villaDark, px, 0.95, -1.38);
  }
  // Iron strap hinges.
  for (const hy of [0.4, 1.4]) {
    addBox(group, 0.22, 0.08, 0.04, materials.stone, -0.39, hy, -1.36);
  }
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

  // Wall-mounted lantern beside the door — warm bulb (off-white sphere)
  // inside a translucent glass box on a small wooden bracket.
  addBox(group, 0.05, 0.5, 0.05, materials.wood, 0.85, 1.35, -1.52);
  const lanternBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.26, 0.18),
    materials.glass
  );
  lanternBody.position.set(0.85, 1.1, -1.55);
  group.add(lanternBody);
  addBox(group, 0.24, 0.05, 0.24, materials.trim, 0.85, 1.26, -1.55);
  addBox(group, 0.22, 0.05, 0.22, materials.trim, 0.85, 0.95, -1.55);
  const lanternFlame = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    materials.mushroomSpot
  );
  lanternFlame.position.set(0.85, 1.1, -1.55);
  group.add(lanternFlame);

  // ---- Windows (flush with the facade, pale arched glass) ----------------
  // Tests assert: depth <= 0.05 and -1.5 < z < -1.43. We meet both.
  const leftWindow = addBox(group, 0.46, 0.6, 0.04, materials.glass, -1.2, 1.45, -1.47);
  const rightWindow = addBox(group, 0.46, 0.6, 0.04, materials.glass, 1.2, 1.45, -1.47);
  leftWindow.name = "mushroom-window-left";
  rightWindow.name = "mushroom-window-right";
  leftWindow.castShadow = false;
  rightWindow.castShadow = false;
  // Window frames, cross mullions, arched crown, and a planter box per side.
  for (const x of [-1.2, 1.2]) {
    addBox(group, 0.56, 0.7, 0.06, materials.wood, x, 1.45, -1.43);
    addBox(group, 0.46, 0.06, 0.04, materials.wood, x, 1.45, -1.46);
    addBox(group, 0.06, 0.6, 0.04, materials.wood, x, 1.45, -1.46);
    // Arched window crown.
    const winArch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.06, 18, 1, false, 0, Math.PI),
      materials.wood
    );
    winArch.rotation.x = Math.PI / 2;
    winArch.position.set(x, 1.82, -1.46);
    group.add(winArch);
    // Window-box planter with three little red flowers.
    addBox(group, 0.62, 0.12, 0.16, materials.wood, x, 1.04, -1.52);
    for (const flowerX of [-0.18, 0, 0.18]) {
      addBox(group, 0.02, 0.18, 0.02, materials.leaf, x + flowerX, 1.21, -1.52);
      const petal = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 10, 8),
        materials.mushroomCap
      );
      petal.position.set(x + flowerX, 1.33, -1.52);
      group.add(petal);
    }
  }

  // ---- Cap (the red dome with white spots) -------------------------------
  // Wider, rounder cap with a thicker brim — closer to the storybook reference.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(3.1, 40, 22), materials.mushroomCap);
  cap.scale.set(1.18, 0.5, 1.08);
  cap.position.y = 3.85;
  cap.castShadow = true;
  group.add(cap);

  // Inner darker dome layered on top — gives the cap a "cap-on-cap" silhouette
  // with visible depth from low angles instead of one flat blob.
  const innerCap = new THREE.Mesh(new THREE.SphereGeometry(2.55, 32, 18), materials.trim);
  innerCap.scale.set(1.0, 0.36, 1.0);
  innerCap.position.y = 4.18;
  innerCap.castShadow = true;
  group.add(innerCap);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 2.7, 0.42, 40), materials.mushroomCap);
  brim.position.y = 2.85;
  brim.castShadow = true;
  group.add(brim);

  // Mossy tufts dotted around the cap's rim.
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 + 0.15;
    const moss = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 12, 10),
      materials.leaf
    );
    moss.scale.set(1.4, 0.4, 0.9);
    moss.position.set(Math.cos(angle) * 2.95, 3.06, Math.sin(angle) * 2.95);
    moss.rotation.y = -angle;
    group.add(moss);
  }

  // Underside of the cap (white gill disk + radial gill ribs for depth).
  const gillBase = new THREE.Mesh(
    new THREE.CylinderGeometry(2.65, 2.05, 0.18, 40),
    materials.mushroomSpot
  );
  gillBase.position.y = 2.7;
  group.add(gillBase);
  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI * 2;
    const gill = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.08, 0.55),
      materials.wood
    );
    gill.position.set(Math.cos(angle) * 2.3, 2.72, Math.sin(angle) * 2.3);
    gill.rotation.y = -angle;
    group.add(gill);
  }

  // ---- White polka-dot spots on the cap -----------------------------------
  // Varied radii give the cap a less mechanical, more painted look.
  [
    [-1.6, 4.2, -1.85, 0.42],
    [0.0, 4.55, -1.95, 0.5],
    [1.5, 4.1, -1.7, 0.36],
    [-0.6, 3.6, -2.65, 0.3],
    [2.0, 3.7, -0.2, 0.34],
    [-2.1, 3.65, 0.4, 0.4],
    [0.7, 3.85, 2.4, 0.32],
    [-1.1, 3.9, 2.1, 0.38],
    [1.7, 4.05, 1.3, 0.28],
    [-1.85, 4.15, -0.8, 0.26]
  ].forEach(([x, y, z, r]) => {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), materials.mushroomSpot);
    spot.scale.y = 0.32;
    spot.position.set(x, y, z);
    group.add(spot);
  });

  // ---- Chimney + curl of smoke on the cap (storybook touch) ---------------
  addBox(group, 0.42, 0.7, 0.42, materials.stone, 1.3, 4.55, 0.6);
  addBox(group, 0.55, 0.08, 0.55, materials.trim, 1.3, 4.92, 0.6);
  for (let i = 0; i < 3; i += 1) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.18 + i * 0.05, 12, 10),
      materials.mushroomSpot
    );
    puff.position.set(1.3 + i * 0.12, 5.18 + i * 0.26, 0.6 - i * 0.05);
    group.add(puff);
  }

  // ---- Hanging vines drooping from the cap brim ---------------------------
  for (let i = 0; i < 3; i += 1) {
    const vine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.7 + i * 0.18, 8),
      materials.leaf
    );
    vine.position.set(-2.85 + i * 0.45, 2.4 - i * 0.08, -0.4 + i * 0.22);
    group.add(vine);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), materials.leaf);
    tip.scale.set(0.6, 0.4, 1.2);
    tip.position.set(-2.85 + i * 0.45, 2.05 - i * 0.18, -0.4 + i * 0.22);
    group.add(tip);
  }

  // ---- Base details: doorstep, stepping stones, grass, baby mushrooms ----
  // Stone doorstep just south of the door.
  addBox(group, 1.4, 0.16, 0.5, materials.stone, 0, 0.08, -2.05);
  // Stepping-stone path leading away from the door.
  for (let i = 0; i < 3; i += 1) {
    const slab = addBox(group, 0.55, 0.08, 0.42, materials.stone,
      (i % 2 === 0 ? -0.2 : 0.2),
      0.04, -2.55 - i * 0.6);
    slab.rotation.y = i % 2 === 0 ? 0.1 : -0.1;
  }

  // Soft, varied grass tufts hugging the base of the stem.
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2 + 0.15;
    const radius = 2.55 + (i % 3) * 0.22;
    const scale = 0.85 + (i % 4) * 0.12;
    const tuft = new THREE.Mesh(
      new THREE.SphereGeometry(0.3 * scale, 12, 10),
      materials.leaf
    );
    tuft.scale.set(1.0, 0.5, 1.0);
    tuft.position.set(Math.cos(angle) * radius, 0.16, Math.sin(angle) * radius);
    tuft.castShadow = true;
    group.add(tuft);
  }

  // Three baby mushrooms of varied size beside the door.
  [
    { x: -1.8, z: -2.3, scale: 1.0 },
    { x: 1.85, z: -2.3, scale: 0.85 },
    { x: 2.3, z: -1.45, scale: 0.6 }
  ].forEach(({ x, z, scale }) => {
    const babyStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13 * scale, 0.18 * scale, 0.4 * scale, 18),
      materials.mushroomStem
    );
    babyStem.position.set(x, 0.2 * scale, z);
    group.add(babyStem);
    const babyCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.34 * scale, 18, 12),
      materials.mushroomCap
    );
    babyCap.scale.set(1.1, 0.5, 1.1);
    babyCap.position.set(x, 0.5 * scale, z);
    group.add(babyCap);
    // A trio of spots on each baby cap.
    for (const off of [-0.13, 0.04, 0.14]) {
      const babySpot = new THREE.Mesh(
        new THREE.SphereGeometry(0.06 * scale, 10, 8),
        materials.mushroomSpot
      );
      babySpot.position.set(
        x + off * scale,
        0.6 * scale,
        z + (off > 0 ? -0.07 : 0.06) * scale
      );
      group.add(babySpot);
    }
  });

  // ---- Double the visual footprint --------------------------------------
  // Scaling at the parent group doubles the *world* size without touching any
  // child's local position or geometry — so the window-flushness test (which
  // reads window.geometry.parameters.depth and window.position.z in local
  // space) still passes unchanged.
  group.scale.set(2, 2, 2);

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
  const eyeWhite = new THREE.MeshBasicMaterial({ color: "#fff7f4", side: THREE.DoubleSide });
  const eyeIris = new THREE.MeshBasicMaterial({ color: "#7a3f2d", side: THREE.DoubleSide });
  const eyePupil = new THREE.MeshBasicMaterial({ color: "#1d1516", side: THREE.DoubleSide });
  const eyeShine = new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide });
  const smileMaterial = new THREE.MeshBasicMaterial({ color: "#8f2b36", side: THREE.DoubleSide });

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
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.31, 26, 18), materials.snout);
  snout.name = "porky-snout-pad";
  snout.position.set(0, 1.22, -1.2);
  snout.scale.set(1.55, 0.92, 0.72);
  snout.castShadow = true;
  group.add(snout);
  // A flat snout disc tip so the nostrils sit on a clear "pad".
  const snoutTip = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 28), materials.snout);
  snoutTip.name = "porky-snout-tip";
  snoutTip.rotation.x = Math.PI / 2;
  snoutTip.position.set(0, 1.22, -1.26);
  snoutTip.scale.x = 1.3;
  group.add(snoutTip);

  // Nostril dimples — small dark ovals on the snout tip.
  [-0.11, 0.11].forEach((x, index) => {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), materials.pigDark);
    nostril.name = `porky-nostril-${index + 1}`;
    nostril.scale.set(0.85, 1.3, 0.5);
    nostril.position.set(x, 1.24, -1.31);
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

  [-0.31, 0.31].forEach((x, index) => {
    const side = x < 0 ? "left" : "right";
    const sclera = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), eyeWhite);
    sclera.name = `porky-eye-sclera-${side}`;
    sclera.position.set(x, 1.48, -1.16);
    sclera.scale.set(0.85, 1.12, 1);
    group.add(sclera);

    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.13, 28), eyeIris);
    iris.name = `porky-eye-iris-${side}`;
    iris.position.set(x, 1.46, -1.19);
    iris.scale.set(0.82, 1.05, 1);
    group.add(iris);

    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.075, 22), eyePupil);
    pupil.name = `porky-eye-pupil-${side}`;
    pupil.position.set(x + (index === 0 ? 0.02 : -0.02), 1.46, -1.205);
    pupil.scale.set(0.85, 1.08, 1);
    group.add(pupil);

    const shine = new THREE.Mesh(new THREE.CircleGeometry(0.032, 16), eyeShine);
    shine.name = `porky-eye-shine-${side}`;
    shine.position.set(x + 0.045, 1.52, -1.22);
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
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 8, 24, Math.PI), smileMaterial);
  mouth.name = "porky-smile";
  mouth.rotation.x = Math.PI / 2;
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, 1.1, -1.27);
  mouth.scale.x = 1.6;
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

// Builds a rectangular layer from four non-overlapping boxes around an open
// centre rectangle. A shared rotated parent keeps every piece on the same
// sloped plane; rotating each box around its own centre would create steps at
// the seams and could partially close the opening again.
function addCutoutBoxLayer(group, {
  name,
  width,
  height,
  depth,
  material,
  y,
  rotationX,
  opening
}) {
  const layer = new THREE.Group();
  layer.name = name;
  layer.position.y = y;
  layer.rotation.x = rotationX;
  group.add(layer);

  const minX = -width / 2;
  const maxX = width / 2;
  const minZ = -depth / 2;
  const maxZ = depth / 2;
  const pieces = [
    { id: "west", minX, maxX: opening.minX, minZ, maxZ },
    { id: "east", minX: opening.maxX, maxX, minZ, maxZ },
    {
      id: "north",
      minX: opening.minX,
      maxX: opening.maxX,
      minZ,
      maxZ: opening.minZ
    },
    {
      id: "south",
      minX: opening.minX,
      maxX: opening.maxX,
      minZ: opening.maxZ,
      maxZ
    }
  ];

  for (const piece of pieces) {
    const pieceWidth = piece.maxX - piece.minX;
    const pieceDepth = piece.maxZ - piece.minZ;
    if (pieceWidth <= 0 || pieceDepth <= 0) continue;
    const mesh = addBox(
      layer,
      pieceWidth,
      height,
      pieceDepth,
      material,
      (piece.minX + piece.maxX) / 2,
      0,
      (piece.minZ + piece.maxZ) / 2
    );
    mesh.name = `${name}-${piece.id}`;
  }

  return layer;
}

// Same contract as addBox but builds a RoundedBoxGeometry so the chunky shell
// boxes read as softened, "designed" edges instead of hard CAD corners. The
// radius is clamped to a fraction of the smallest dimension so a thin panel can
// never self-intersect; below a floor the box just falls back to a plain box.
// `radius` defaults to a subtle 0.06 m bevel (the villa works in metres).
function addBeveledBox(group, width, height, depth, material, x, y, z, rotation = {}, radius = 0.06) {
  const minDim = Math.min(width, height, depth);
  // Cap the bevel at 40% of the thinnest side; skip rounding entirely on slivers.
  const r = Math.min(radius, minDim * 0.4);
  const geometry = r > 0.012
    ? new RoundedBoxGeometry(width, height, depth, 2, r)
    : new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// ============================================================
// Villa interior helpers
// ============================================================

// Builds one floor-to-ceiling glass curtain wall wing of the villa front:
// a peach base wall, a glass pane in front of it, vertical wood mullions, a
// horizontal transom band and a slim outer frame so the pane reads as a real
// window unit. Called once per side so both wings match (unified glass facade).
function buildGlassCurtainWing(group, materials, center, width, height, frontZ) {
  const y = height / 2;
  // Peach base wall behind the glass (beveled, matches the shell edges).
  addBeveledBox(group, width, height, 0.4, materials.villaWall, center, y, frontZ);
  // Glass curtain pane in front of the wall.
  const glassW = width - 0.6;
  const glassH = height - 0.7;
  addBox(group, glassW, glassH, 0.12, materials.glass, center, y, frontZ + 0.22);
  // Vertical wood mullions slicing the glass.
  const mullionCount = 5;
  for (let i = 0; i < mullionCount; i += 1) {
    const t = i / (mullionCount - 1);
    const x = center - width / 2 + 0.4 + (width - 0.8) * t;
    addBox(group, 0.16, height - 0.5, 0.18, materials.wood, x, y, frontZ + 0.28);
  }
  // Horizontal transom band splitting the lower glass from a strip up top.
  addBox(group, width - 0.3, 0.16, 0.18, materials.wood, center, height - 1.0, frontZ + 0.28);
  // Slim outer frame ringing the pane (4 thin border bars).
  const fz = frontZ + 0.24;
  addBox(group, glassW + 0.18, 0.14, 0.2, materials.wood, center, y + glassH / 2, fz); // top
  addBox(group, glassW + 0.18, 0.14, 0.2, materials.wood, center, y - glassH / 2, fz); // bottom
  addBox(group, 0.14, glassH + 0.18, 0.2, materials.wood, center - glassW / 2, y, fz);  // left
  addBox(group, 0.14, glassH + 0.18, 0.2, materials.wood, center + glassW / 2, y, fz);  // right
}

// Build a staircase as a stack of treads + open risers + side stringers +
// arrival landing patch. Treads run from south (bottomLocalZ, lowest) north
// (lowest z, highest). Aligned with the world.js stair zone at world z ∈
// [-12, -8] (local z ∈ [+1, +5]).
function createStaircase(materials, opts) {
  const { width, treads, runPerTread, risePerTread, bottomLocalZ, startY } = opts;
  const group = new THREE.Group();
  // Treads.
  for (let i = 0; i < treads; i += 1) {
    const z = bottomLocalZ - i * runPerTread;
    const y = startY + i * risePerTread;
    // Tread plank.
    addBox(group, width, 0.16, runPerTread + 0.04, materials.wood, 0, y, z);
    // Riser (vertical face).
    addBox(group, width, risePerTread, 0.05, materials.wallInterior, 0, y - risePerTread / 2 + 0.08, z + runPerTread / 2);
  }
  // Side stringers (tilted boxes flanking the treads).
  const totalRun = treads * runPerTread;
  const totalRise = treads * risePerTread;
  const stringerLen = Math.hypot(totalRun, totalRise);
  const stringerAngle = Math.atan2(totalRise, totalRun);
  const stringerCenterZ = bottomLocalZ - totalRun / 2;
  const stringerCenterY = startY + totalRise / 2;
  for (const sx of [-width / 2 - 0.06, width / 2 + 0.06]) {
    const stringer = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.36, stringerLen),
      materials.wood
    );
    stringer.position.set(sx, stringerCenterY - 0.2, stringerCenterZ);
    stringer.rotation.x = stringerAngle;
    stringer.castShadow = true;
    stringer.receiveShadow = true;
    group.add(stringer);
  }
  // Arrival landing patch on the upper floor — small wood platform just past
  // the top tread so the stair top meets the slab cleanly.
  const topY = startY + totalRise;
  addBox(group, width + 0.4, 0.18, 0.8, materials.floorPlank,
    0, topY + 0.04, bottomLocalZ - totalRun - 0.4);
  return group;
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

  const visibleWaterMaterial = new THREE.MeshBasicMaterial({
    color: "#39d2ff",
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });
  const visibleWater = new THREE.Mesh(new THREE.CircleGeometry(1, 80), visibleWaterMaterial);
  visibleWater.name = `hot-spring-visible-water-${pool.id}`;
  visibleWater.rotation.x = -Math.PI / 2;
  visibleWater.position.set(pool.x, pool.waterY + 0.18, pool.z);
  visibleWater.scale.set(innerX - 0.18, innerZ - 0.18, 1);
  visibleWater.renderOrder = 12;
  group.add(visibleWater);

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
