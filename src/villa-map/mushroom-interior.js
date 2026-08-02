import * as THREE from "three";
import {
  MUSHROOM_INTERIOR_LOCAL_RADIUS,
  MUSHROOM_INTERIOR_SCALE,
  MUSHROOM_RAIL_HEIGHT,
  MUSHROOM_SLAB_THICKNESS,
  MUSHROOM_STAIR_OPENING_MARGIN,
  MUSHROOM_STAIR_WIDTH
} from "./mushroom-interior-config.js";

// Procedural interior of the mushroom house — a cosy three-storey round tower.
//
// The interior is a "pocket" space buried underground beneath the mushroom
// house (see MUSHROOM_INTERIOR in world.js): Scene.jsx mounts this group at the
// pocket origin and the group applies the shared 2x scale. The authored mesh
// remains LOCAL at +4 per storey and radius ≈4.75; its world-space storeys are
// therefore 8 m apart and the exterior mushroom stays untouched.
//
// Framework-agnostic factory in the assets.js mould: geometries + materials +
// groups only (no TextureLoader, no document), so the node test suite can
// build it. Collision/zone data lives in world.js, NOT here — this is visuals.
//
// Layout contract (must stay in sync with world.js):
//   slab tops   y = 0 (L1), 4 (L2), 8 (L3)
//   stair A     L1→L2, world width 3.2 m centred at local x=2.0
//   stair B     L2→L3, world width 3.2 m centred at local x=-2.0
//   both runs   local z 3.0 (bottom) → -1.4 (top), expanded to 8.8 m
//   door        south wall, local z ≈ +4.5
const RADIUS = MUSHROOM_INTERIOR_LOCAL_RADIUS;
const LEVEL_HEIGHT = 4;
const WALL_HEIGHT = LEVEL_HEIGHT * 3 + 0.4;
const PLAYER_DETAIL_SCALE = 1 / MUSHROOM_INTERIOR_SCALE;
const SLAB_THICKNESS = MUSHROOM_SLAB_THICKNESS * PLAYER_DETAIL_SCALE;

// Keep stair risers at a player-friendly world height while the flight's
// overall run/rise scales 2x: 10 authored steps × scale = 20 steps.
const STAIR_RUN = {
  bottomZ: 3.0,
  topZ: -1.4,
  // Counter-scale the width because the parent group is enlarged 2x.
  width: MUSHROOM_STAIR_WIDTH * PLAYER_DETAIL_SCALE,
  steps: 10 * MUSHROOM_INTERIOR_SCALE
};
const STAIR_OPENING = {
  // Every corner must remain inside the circular slab. A hole that intersects
  // the outer contour triangulates into stray ceiling faces.
  bottomZ: 3.4,
  topZ: -1.7
};
const STAIR_A_X = 2.0; // source-space x=-4, world x=-2 at 2x
const STAIR_B_X = -2.0; // source-space x=-8, world x=-10 at 2x

// The factory stays Node-pure: it only advertises the public asset URL and
// builds a dark fallback material. Scene.jsx owns browser-only TextureLoader
// work and uses this named mesh as the exact aperture for the distant sky.
export const MUSHROOM_STAR_DOME_NAME = "mushroom-interior-dome";
export const MUSHROOM_STAR_TEXTURE_URL =
  "/textures/qwantani-night-puresky-dome-4k.webp";
export const MUSHROOM_OBSERVATORY_EXPOSURE = 0.5;

// L1/L2 stay storybook-warm. L3 deliberately switches to dim, short-range
// red guide lights so visitors keep their night vision and the star dome owns
// the room, like a small observatory after the main lamps have gone out.
export const MUSHROOM_FLOOR_LIGHTS = Object.freeze([
  Object.freeze({ color: "#ffb96f", primary: 52, secondary: 46, primaryDistance: 10, secondaryDistance: 9 }),
  Object.freeze({ color: "#ffab78", primary: 52, secondary: 46, primaryDistance: 10, secondaryDistance: 9 }),
  Object.freeze({ color: "#ff3b2f", primary: 4.5, secondary: 3.2, primaryDistance: 5.5, secondaryDistance: 4.8 })
]);

export const MUSHROOM_OBSERVATORY_WALL_NAME = "mushroom-observatory-wall-lining";
export const MUSHROOM_OBSERVATORY_FLOOR_NAME = "mushroom-observatory-floor-overlay";
export const MUSHROOM_OBSERVATORY_SWITCH_NAME = "mushroom-observatory-light-switch";
export const MUSHROOM_OBSERVATORY_SWITCH_LEVER_NAME =
  "mushroom-observatory-light-switch-lever";
export const MUSHROOM_OBSERVATORY_SWITCH_LED_NAME =
  "mushroom-observatory-light-switch-led";
export const MUSHROOM_OBSERVATORY_SWITCH_INTERACTION_ID =
  "mushroom-observatory-light-switch";
export const MUSHROOM_OBSERVATORY_SWITCH_ACTION_TYPE =
  "toggle-observatory-lights";

export function createMushroomInterior(materials) {
  const group = new THREE.Group();
  group.name = "mushroom-interior";
  group.scale.setScalar(MUSHROOM_INTERIOR_SCALE);

  // Inward-facing clones of the shared materials. DoubleSide so a player who
  // squeezes into the square-collider corners (slightly outside the round
  // wall) still sees the wall instead of x-raying the room.
  const wallMaterial = materials.mushroomStem.clone();
  wallMaterial.side = THREE.DoubleSide;
  const domeMaterial = new THREE.MeshBasicMaterial({
    color: "#07142c",
    side: THREE.BackSide,
    toneMapped: false,
    fog: false
  });
  domeMaterial.name = "mushroom-star-ceiling-fallback";
  const soilMaterial = new THREE.MeshStandardMaterial({
    color: "#4a3628",
    roughness: 1,
    side: THREE.BackSide
  });

  const glowMaterial = new THREE.MeshStandardMaterial({
    color: "#ffe6ad",
    emissive: "#ffce7a",
    emissiveIntensity: 1.1,
    roughness: 0.6
  });
  const fairyBulbMaterials = ["#ffd37a", "#ff9f76", "#fff0b8"].map(
    (color) => new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.8,
      roughness: 0.48
    })
  );
  const observatoryGlowMaterial = new THREE.MeshStandardMaterial({
    color: "#240605",
    emissive: "#ff2418",
    emissiveIntensity: 0.28,
    roughness: 0.9
  });
  const observatoryWallMaterial = new THREE.MeshStandardMaterial({
    color: "#01030a",
    roughness: 0.98,
    metalness: 0.02,
    side: THREE.BackSide
  });
  const observatoryFloorMaterial = new THREE.MeshStandardMaterial({
    color: "#02040b",
    roughness: 1,
    metalness: 0
  });
  const starDomeRimMaterial = new THREE.MeshStandardMaterial({
    color: "#02050c",
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const buntingMaterials = ["#ce6d5b", "#e6a44c", "#7fa38a"].map(
    (color) => new THREE.MeshStandardMaterial({
      color,
      roughness: 0.86,
      side: THREE.DoubleSide
    })
  );

  // ---- Shell: soil surround, base slab, round wall, glowing gill dome ------
  // The walkable square's diagonals overshoot the round wall a little; a dark
  // open-ended earth cylinder means a corner-hugger sees soil, never the void.
  // It must stay open at the top so its back-facing cap cannot eclipse the
  // photographic star dome when a visitor looks straight up from the loft.
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(7.2, 7.2, WALL_HEIGHT + 3, 24, 1, true),
    soilMaterial
  );
  soil.name = "mushroom-interior-soil";
  soil.position.y = (WALL_HEIGHT + 3) / 2 - 0.6;
  group.add(soil);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(7.2, 7.2, 0.4, 32),
    materials.floorPlank
  );
  base.name = "mushroom-interior-base";
  base.position.y = -0.2;
  base.receiveShadow = true;
  group.add(base);

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS, RADIUS, WALL_HEIGHT, 48, 1, true),
    wallMaterial
  );
  wall.name = "mushroom-interior-wall";
  wall.position.y = WALL_HEIGHT / 2;
  wall.receiveShadow = true;
  group.add(wall);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2),
    domeMaterial
  );
  dome.name = MUSHROOM_STAR_DOME_NAME;
  dome.userData.textureUrl = MUSHROOM_STAR_TEXTURE_URL;
  dome.position.y = WALL_HEIGHT;
  group.add(dome);

  // L3 gets its own nearly-black inner skin. It sits just in front of the
  // shared pale wall and over the TOP face of the L3 slab only, so L1/L2 keep
  // their warm palette and the L2 ceiling does not unexpectedly turn black.
  const observatoryWallHeight = WALL_HEIGHT - LEVEL_HEIGHT * 2 - 0.02;
  const observatoryWall = new THREE.Mesh(
    new THREE.CylinderGeometry(
      RADIUS - 0.025,
      RADIUS - 0.025,
      observatoryWallHeight,
      48,
      1,
      true
    ),
    observatoryWallMaterial
  );
  observatoryWall.name = MUSHROOM_OBSERVATORY_WALL_NAME;
  observatoryWall.position.y = LEVEL_HEIGHT * 2 + 0.01 + observatoryWallHeight / 2;
  observatoryWall.receiveShadow = true;
  group.add(observatoryWall);

  // A slim dark collar hides the wall/dome seam without reaching into the
  // sightline. The old radial wooden "gill" ribs projected into the room and
  // read as a ring of unexplained sticks around the stars.
  const domeRim = new THREE.Mesh(
    new THREE.TorusGeometry(RADIUS - 0.08, 0.045, 8, 64),
    starDomeRimMaterial
  );
  domeRim.name = "mushroom-interior-dome-rim";
  domeRim.rotation.x = Math.PI / 2;
  domeRim.position.y = WALL_HEIGHT + 0.015;
  group.add(domeRim);

  // ---- Upper slabs (round, with a stairwell hole each) ---------------------
  group.add(buildSlab("mushroom-interior-slab-l2", LEVEL_HEIGHT, STAIR_A_X, materials));
  group.add(buildSlab("mushroom-interior-slab-l3", LEVEL_HEIGHT * 2, STAIR_B_X, materials));
  group.add(buildFloorOverlay(
    MUSHROOM_OBSERVATORY_FLOOR_NAME,
    LEVEL_HEIGHT * 2,
    STAIR_B_X,
    observatoryFloorMaterial
  ));

  // Warm baseboard ring where each floor meets the curved wall.
  for (const levelY of [0, LEVEL_HEIGHT, LEVEL_HEIGHT * 2]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RADIUS - 0.14, 0.07, 8, 48), materials.wood);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = levelY + 0.1;
    group.add(ring);
  }

  // ---- Stair flights + balustrades ----------------------------------------
  group.add(buildStairFlight("mushroom-interior-stair-a", STAIR_A_X, 0, materials));
  group.add(buildStairFlight("mushroom-interior-stair-b", STAIR_B_X, LEVEL_HEIGHT, materials));
  group.add(buildWellRailing("mushroom-interior-well-a", STAIR_A_X, LEVEL_HEIGHT, materials));
  group.add(buildWellRailing("mushroom-interior-well-b", STAIR_B_X, LEVEL_HEIGHT * 2, materials));

  // A real wall control gives the observatory reveal a physical cause. It is
  // mounted beside the L2→L3 arrival on the north-west curve, at player hand
  // height and clear of the vanity. Its tiny locator LED remains findable when
  // the room goes cinema-dark. Stable child names let the React layer animate
  // the rocker and recolour the LED without owning any of this geometry.
  group.add(buildObservatoryLightSwitch());

  // ---- Round glowing windows (fake light — the pocket is buried) -----------
  // A few per storey; L3 gets a full "star ring" under the dome to match its
  // interaction card.
  const windowSpecs = [
    { y: 2.3, angles: [-2.2, -0.9, 0.9, 2.2] },
    { y: 6.3, angles: [-2.5, -1.2, 1.2, 2.5] },
    { y: 10.3, angles: [-2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7] }
  ];
  windowSpecs.forEach((spec, level) => {
    spec.angles.forEach((angle, index) => {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.42, 20),
        level === 2 ? observatoryGlowMaterial : glowMaterial
      );
      disc.name = `mushroom-interior-window-${level + 1}-${index}`;
      disc.position.set(Math.sin(angle) * (RADIUS - 0.12), spec.y, Math.cos(angle) * (RADIUS - 0.12));
      disc.rotation.y = angle + Math.PI;
      group.add(disc);
      // Wooden porthole trim ring.
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.05, 8, 20), materials.wood);
      trim.name = `mushroom-interior-window-trim-${level + 1}-${index}`;
      trim.position.copy(disc.position);
      trim.rotation.y = angle + Math.PI;
      group.add(trim);
    });
  });

  // ---- South door (the way back out — paired with the exit teleport) -------
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.7, 0.18), materials.wood);
  door.name = "mushroom-interior-door";
  door.position.set(0, 1.35, RADIUS - 0.35);
  group.add(door);
  const doorArch = new THREE.Mesh(
    new THREE.TorusGeometry(0.86, 0.09, 8, 24, Math.PI),
    materials.fascia
  );
  doorArch.name = "mushroom-interior-door-arch";
  doorArch.position.set(0, 2.7, RADIUS - 0.46);
  group.add(doorArch);
  for (const px of [-0.95, 0.95]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.8, 0.24), materials.fascia);
    jamb.position.set(px, 1.4, RADIUS - 0.35);
    group.add(jamb);
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), materials.trim);
  knob.position.set(0.55, 1.3, RADIUS - 0.5);
  group.add(knob);

  // ---- Hanging pendant lamps on the two cosy lower storeys -----------------
  for (const [lampY, cordTop] of [
    [3.1, LEVEL_HEIGHT - SLAB_THICKNESS],
    [7.1, LEVEL_HEIGHT * 2 - SLAB_THICKNESS]
  ]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, cordTop - lampY, 8), materials.fascia);
    cord.position.set(0.6, (cordTop + lampY) / 2, -0.6);
    group.add(cord);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 14, 12),
      glowMaterial
    );
    bulb.name = `mushroom-interior-pendant-${lampY}`;
    bulb.position.set(0.6, lampY, -0.6);
    group.add(bulb);
  }

  // ---- Low fairy-light canopies -------------------------------------------
  // The magical pocket is intentionally larger than the exterior shell, but
  // a low player-scale canopy gives each storey an intimate ceiling. Three
  // gently sagging strands cross the two lower levels with warm bulbs and
  // bunting. The observatory stays completely clear beneath its star dome;
  // geometry is counter-scaled so the lights remain hand-sized regardless of
  // the architectural pocket scale.
  for (const [level, levelY] of [0, LEVEL_HEIGHT].entries()) {
    group.add(buildFairyLightCanopy(
      `mushroom-interior-fairy-canopy-${level + 1}`,
      levelY,
      materials,
      fairyBulbMaterials,
      buntingMaterials
    ));
  }

  // ---- Storybook clutter: baby mushrooms by the door + under stair A -------
  [
    { x: -1.5, z: 3.9, scale: 0.8 },
    { x: 1.4, z: 4.0, scale: 0.6 },
    { x: 2.7, z: -0.6, scale: 0.9 }
  ].forEach(({ x, z, scale }, index) => {
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 * scale, 0.17 * scale, 0.4 * scale, 14),
      materials.mushroomStem
    );
    stem.name = `mushroom-interior-baby-${index}`;
    stem.position.set(x, 0.2 * scale, z);
    group.add(stem);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3 * scale, 14, 10), materials.mushroomCap);
    cap.scale.set(1.1, 0.55, 1.1);
    cap.position.set(x, 0.46 * scale, z);
    group.add(cap);
  });

  return group;
}

function buildObservatoryLightSwitch() {
  const lightSwitch = new THREE.Group();
  lightSwitch.name = MUSHROOM_OBSERVATORY_SWITCH_NAME;
  lightSwitch.userData.interactionId = MUSHROOM_OBSERVATORY_SWITCH_INTERACTION_ID;
  lightSwitch.userData.actionType = MUSHROOM_OBSERVATORY_SWITCH_ACTION_TYPE;

  // These are authored-local offsets from the tower centre. The 2x parent
  // scale places the switch at world XZ (-15.1, 15.5), matching world.js's
  // interaction marker. Its back edge slightly enters the 4.75 m wall skin,
  // so the plate reads as mounted instead of hovering in front of the curve.
  const x = -4.55;
  const z = -1.25;
  lightSwitch.position.set(x, LEVEL_HEIGHT * 2 + 0.7, z);
  const wallAngle = Math.atan2(x, z);
  lightSwitch.rotation.y = wallAngle + Math.PI;

  const plateMaterial = new THREE.MeshStandardMaterial({
    color: "#8b6a43",
    metalness: 0.48,
    roughness: 0.42
  });
  const leverMaterial = new THREE.MeshStandardMaterial({
    color: "#e7deca",
    roughness: 0.58,
    metalness: 0.04
  });
  const locatorMaterial = new THREE.MeshBasicMaterial({
    color: "#ff7043",
    toneMapped: false,
    fog: false
  });

  // Dimensions are counter-authored for the 2x tower root: the visible plate
  // is a human-scale 40 × 60 cm in world space, large enough to read while
  // keeping the rocker itself believable.
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.3, 0.035),
    plateMaterial
  );
  plate.name = `${MUSHROOM_OBSERVATORY_SWITCH_NAME}-plate`;
  lightSwitch.add(plate);

  const lever = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.15, 0.035),
    leverMaterial
  );
  lever.name = MUSHROOM_OBSERVATORY_SWITCH_LEVER_NAME;
  lever.position.z = 0.045;
  lever.rotation.x = -0.22;
  lever.userData.lightsOnRotationX = -0.22;
  lever.userData.lightsOffRotationX = 0.22;
  lightSwitch.add(lever);

  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 12, 8),
    locatorMaterial
  );
  led.name = MUSHROOM_OBSERVATORY_SWITCH_LED_NAME;
  led.position.set(0, -0.105, 0.055);
  led.userData.lightsOnColor = "#ffb36b";
  led.userData.lightsOffColor = "#ff452e";
  lightSwitch.add(led);

  for (const y of [-0.125, 0.125]) {
    const screw = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.012, 10),
      leverMaterial
    );
    screw.name = `${MUSHROOM_OBSERVATORY_SWITCH_NAME}-screw-${y < 0 ? "lower" : "upper"}`;
    screw.rotation.x = Math.PI / 2;
    screw.position.set(0, y, 0.025);
    lightSwitch.add(screw);
  }

  return lightSwitch;
}

function buildFairyLightCanopy(
  name,
  levelY,
  materials,
  bulbMaterials,
  buntingMaterials
) {
  const canopy = new THREE.Group();
  canopy.name = name;

  const edgeHeight = levelY + 3.25 * PLAYER_DETAIL_SCALE;
  const sag = 0.38 * PLAYER_DETAIL_SCALE;
  const zOffsets = [-2.6, 0, 2.6].map((z) => z * PLAYER_DETAIL_SCALE);

  zOffsets.forEach((z, strandIndex) => {
    // Meet the inside of the round wall at this strand's Z coordinate. The
    // previous fixed span stopped several metres short, making the entire
    // canopy look unsupported in the oversized pocket interior.
    const anchorRadius = RADIUS - 0.08;
    const halfSpan = Math.sqrt(anchorRadius ** 2 - z ** 2);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-halfSpan, edgeHeight, z),
      new THREE.Vector3(0, edgeHeight - sag, z),
      new THREE.Vector3(halfSpan, edgeHeight, z)
    ]);
    const cord = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 0.025 * PLAYER_DETAIL_SCALE, 5, false),
      materials.fascia
    );
    cord.name = `${name}-strand-${strandIndex + 1}`;
    canopy.add(cord);

    for (const [sideName, x] of [["west", -halfSpan], ["east", halfSpan]]) {
      const anchor = new THREE.Mesh(
        new THREE.SphereGeometry(0.11 * PLAYER_DETAIL_SCALE, 10, 8),
        materials.trim
      );
      anchor.name = `${name}-anchor-${strandIndex + 1}-${sideName}`;
      anchor.position.set(x, edgeHeight, z);
      canopy.add(anchor);
    }

    for (let bulbIndex = 0; bulbIndex < 9; bulbIndex += 1) {
      const t = (bulbIndex + 0.5) / 9;
      const point = curve.getPoint(t);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.09 * PLAYER_DETAIL_SCALE, 10, 8),
        bulbMaterials[(bulbIndex + strandIndex) % bulbMaterials.length]
      );
      bulb.name = `${name}-bulb-${strandIndex + 1}-${bulbIndex + 1}`;
      bulb.position.copy(point);
      bulb.position.y -= 0.08 * PLAYER_DETAIL_SCALE;
      canopy.add(bulb);

      if (bulbIndex < 8) {
        const pennantHeight = 0.34 * PLAYER_DETAIL_SCALE;
        const pennant = new THREE.Mesh(
          new THREE.ConeGeometry(
            0.15 * PLAYER_DETAIL_SCALE,
            pennantHeight,
            3
          ),
          buntingMaterials[(bulbIndex + strandIndex) % buntingMaterials.length]
        );
        pennant.name = `${name}-pennant-${strandIndex + 1}-${bulbIndex + 1}`;
        pennant.position.copy(curve.getPoint((bulbIndex + 1) / 9));
        // After the triangle is flipped, its broad top edge is +height / 2.
        // Lowering the centre by exactly half its height joins it to the cord.
        pennant.position.y -= pennantHeight / 2;
        pennant.rotation.z = Math.PI;
        canopy.add(pennant);
      }
    }
  });

  return canopy;
}

// Round slab with a rectangular stairwell hole centred on `stairX`. Extruded
// from a 2D shape so the hole is a true cut-out (the camera rides the stairs
// straight through it).
function buildFloorShape(stairX) {
  // Slab rim tucks just inside the wall radius so no gap ring shows.
  const shape = new THREE.Shape();
  shape.absarc(0, 0, RADIUS - 0.03, 0, Math.PI * 2, false);

  // Shape-space v = -z (the mesh is rotated -PI/2 about X). Hole runs from the
  // flight's low end to beyond the top step's rear edge. The extra clearance
  // prevents the L2 ceiling from visually or physically sealing the L2→L3
  // approach at shallow camera angles.
  const hole = new THREE.Path();
  const holeMargin = MUSHROOM_STAIR_OPENING_MARGIN * PLAYER_DETAIL_SCALE;
  const hx0 = stairX - STAIR_RUN.width / 2 - holeMargin;
  const hx1 = stairX + STAIR_RUN.width / 2 + holeMargin;
  hole.moveTo(hx0, -STAIR_OPENING.bottomZ);
  hole.lineTo(hx1, -STAIR_OPENING.bottomZ);
  hole.lineTo(hx1, -STAIR_OPENING.topZ);
  hole.lineTo(hx0, -STAIR_OPENING.topZ);
  hole.closePath();
  shape.holes.push(hole);

  return { shape, hx0, hx1 };
}

function buildFloorOverlay(name, topY, stairX, material) {
  const { shape } = buildFloorShape(stairX);
  const overlay = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), material);
  overlay.name = name;
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.y = topY + 0.008;
  overlay.receiveShadow = true;
  return overlay;
}

function buildSlab(name, topY, stairX, materials) {
  const { shape, hx0, hx1 } = buildFloorShape(stairX);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: SLAB_THICKNESS,
    bevelEnabled: false
  });
  const slab = new THREE.Mesh(geometry, materials.floorPlank);
  slab.name = name;
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = topY - SLAB_THICKNESS;
  slab.receiveShadow = true;
  slab.castShadow = true;

  // Pale reveal boards line the four inner faces. Besides making the cut-out
  // unmistakable from below, their player-scale thickness prevents the dark
  // floor material from reading as a sealed ceiling at a shallow camera angle.
  const revealThickness = 0.08 * PLAYER_DETAIL_SCALE;
  const holeLength = STAIR_OPENING.bottomZ - STAIR_OPENING.topZ;
  const holeWidth = hx1 - hx0;
  const shapeMinY = -STAIR_OPENING.bottomZ;
  const shapeMaxY = -STAIR_OPENING.topZ;
  const shapeCenterY = (shapeMinY + shapeMaxY) / 2;
  const addReveal = (revealName, width, height, depth, x, y) => {
    const reveal = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      materials.ceiling
    );
    reveal.name = `${name}-reveal-${revealName}`;
    // Coordinates are in the slab's pre-rotation shape space: geometry Y
    // becomes world Z and geometry Z becomes world Y after rotation.x=-PI/2.
    reveal.position.set(x, y, SLAB_THICKNESS / 2);
    reveal.castShadow = false;
    reveal.receiveShadow = true;
    slab.add(reveal);
  };
  addReveal("west", revealThickness, holeLength, SLAB_THICKNESS, hx0, shapeCenterY);
  addReveal("east", revealThickness, holeLength, SLAB_THICKNESS, hx1, shapeCenterY);
  addReveal("south", holeWidth, revealThickness, SLAB_THICKNESS, stairX, shapeMinY);
  addReveal("north", holeWidth, revealThickness, SLAB_THICKNESS, stairX, shapeMaxY);
  return slab;
}

// One straight flight ascending northward (z decreases) from `baseY` to
// `baseY + LEVEL_HEIGHT`. Thin treads, one-rise fascia boards and two slim
// stringers keep the underside open instead of forming a floor-to-ceiling
// wedge; sloped handrails guard both freestanding sides.
function buildStairFlight(name, centerX, baseY, materials) {
  const flight = new THREE.Group();
  flight.name = name;

  const run = STAIR_RUN.bottomZ - STAIR_RUN.topZ;
  const tread = run / STAIR_RUN.steps;
  const rise = LEVEL_HEIGHT / STAIR_RUN.steps;
  const treadThickness = 0.18 * PLAYER_DETAIL_SCALE;
  const riserThickness = 0.08 * PLAYER_DETAIL_SCALE;

  for (let i = 0; i < STAIR_RUN.steps; i += 1) {
    const topY = baseY + (i + 1) * rise;
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(
        STAIR_RUN.width,
        treadThickness,
        tread + 0.04 * PLAYER_DETAIL_SCALE
      ),
      materials.wood
    );
    step.name = `${name}-step-${i}`;
    step.position.set(
      centerX,
      topY - treadThickness / 2,
      STAIR_RUN.bottomZ - (i + 0.5) * tread
    );
    step.castShadow = true;
    step.receiveShadow = true;
    flight.add(step);

    const riser = new THREE.Mesh(
      new THREE.BoxGeometry(STAIR_RUN.width, rise, riserThickness),
      materials.fascia
    );
    riser.name = `${name}-riser-${i}`;
    riser.position.set(
      centerX,
      topY - rise / 2,
      STAIR_RUN.bottomZ - (i + 1) * tread
    );
    riser.castShadow = true;
    riser.receiveShadow = true;
    flight.add(riser);
  }

  const slope = Math.atan2(LEVEL_HEIGHT, run);
  const slopeLength = Math.hypot(run, LEVEL_HEIGHT);
  for (const direction of [-1, 1]) {
    const stringer = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.16 * PLAYER_DETAIL_SCALE,
        0.22 * PLAYER_DETAIL_SCALE,
        slopeLength
      ),
      materials.wood
    );
    stringer.name = `${name}-stringer-${direction < 0 ? "west" : "east"}`;
    stringer.position.set(
      centerX + direction * (STAIR_RUN.width / 2 - 0.2 * PLAYER_DETAIL_SCALE),
      baseY + LEVEL_HEIGHT / 2 - 0.2 * PLAYER_DETAIL_SCALE,
      (STAIR_RUN.bottomZ + STAIR_RUN.topZ) / 2
    );
    stringer.rotation.x = slope;
    stringer.castShadow = true;
    flight.add(stringer);
  }

  // Both freestanding sides get a handrail. Cross-sections, heights and post
  // spacing stay at player scale while the rail spans the full 2x flight.
  const worldSlopeLength = Math.hypot(
    run * MUSHROOM_INTERIOR_SCALE,
    LEVEL_HEIGHT * MUSHROOM_INTERIOR_SCALE
  );
  const postCount = Math.max(2, Math.ceil(worldSlopeLength / 1.1) + 1);
  for (const [side, direction] of [["west", -1], ["east", 1]]) {
    const railX = centerX + direction * (
      STAIR_RUN.width / 2 + 0.08 * PLAYER_DETAIL_SCALE
    );
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.08 * PLAYER_DETAIL_SCALE,
        0.12 * PLAYER_DETAIL_SCALE,
        Math.hypot(run, LEVEL_HEIGHT) + 0.4 * PLAYER_DETAIL_SCALE
      ),
      materials.fascia
    );
    rail.name = `${name}-handrail-${side}`;
    rail.position.set(
      railX,
      baseY + LEVEL_HEIGHT / 2 + 0.95 * PLAYER_DETAIL_SCALE,
      (STAIR_RUN.bottomZ + STAIR_RUN.topZ) / 2
    );
    rail.rotation.x = slope;
    flight.add(rail);

    for (let i = 0; i < postCount; i += 1) {
      const t = i / (postCount - 1);
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.07 * PLAYER_DETAIL_SCALE,
          MUSHROOM_RAIL_HEIGHT * PLAYER_DETAIL_SCALE,
          0.07 * PLAYER_DETAIL_SCALE
        ),
        materials.fascia
      );
      post.name = `${name}-post-${side}-${i}`;
      const z = STAIR_RUN.bottomZ - t * run;
      post.position.set(
        railX,
        baseY + t * LEVEL_HEIGHT + MUSHROOM_RAIL_HEIGHT / 2 * PLAYER_DETAIL_SCALE,
        z
      );
      flight.add(post);
    }
  }

  return flight;
}

// Balustrade around the stairwell hole on the slab ABOVE a flight: posts + top
// rail along the hole's open long edge and its south (low) end, matching the
// invisible rim-guard colliders in world.js.
function buildWellRailing(name, stairX, floorY, materials) {
  const railing = new THREE.Group();
  railing.name = name;

  const edgeOffset = STAIR_RUN.width / 2
    + (MUSHROOM_STAIR_OPENING_MARGIN + 0.08) * PLAYER_DETAIL_SCALE;
  const addRail = (railName, x, z, length, alongZ) => {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(
        alongZ ? 0.08 * PLAYER_DETAIL_SCALE : length,
        0.1 * PLAYER_DETAIL_SCALE,
        alongZ ? length : 0.08 * PLAYER_DETAIL_SCALE
      ),
      materials.wood
    );
    rail.name = railName;
    rail.position.set(x, floorY + MUSHROOM_RAIL_HEIGHT * PLAYER_DETAIL_SCALE, z);
    railing.add(rail);
    const postCount = Math.max(
      2,
      Math.ceil(length * MUSHROOM_INTERIOR_SCALE / 1.1) + 1
    );
    for (let i = 0; i < postCount; i += 1) {
      const t = i / (postCount - 1);
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.07 * PLAYER_DETAIL_SCALE,
          MUSHROOM_RAIL_HEIGHT * PLAYER_DETAIL_SCALE,
          0.07 * PLAYER_DETAIL_SCALE
        ),
        materials.wood
      );
      post.name = `${railName}-post-${i}`;
      post.position.set(
        alongZ ? x : x - length / 2 + length * t,
        floorY + MUSHROOM_RAIL_HEIGHT / 2 * PLAYER_DETAIL_SCALE,
        alongZ ? z - length / 2 + length * t : z
      );
      railing.add(post);
    }
  };

  // Both long edges beside the now freestanding narrow stairwell.
  addRail(`${name}-rail-west`, stairX - edgeOffset, 0.95, 4.9, true);
  addRail(`${name}-rail-east`, stairX + edgeOffset, 0.95, 4.9, true);
  // South (low) end of the hole — matches the rim-guard collider.
  addRail(
    `${name}-rail-south`,
    stairX,
    3.5,
    STAIR_RUN.width
      + (MUSHROOM_STAIR_OPENING_MARGIN * 2 + 0.2) * PLAYER_DETAIL_SCALE,
    false
  );

  return railing;
}
