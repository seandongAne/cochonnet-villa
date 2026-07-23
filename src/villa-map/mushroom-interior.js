import * as THREE from "three";
import { MUSHROOM_INTERIOR_SCALE } from "./mushroom-interior-config.js";

// Procedural interior of the mushroom house — a cosy three-storey round tower.
//
// The interior is a "pocket" space buried underground beneath the mushroom
// house (see MUSHROOM_INTERIOR in world.js): Scene.jsx mounts this group at the
// pocket origin and the group applies the shared 4x scale. The authored mesh
// remains LOCAL at +4 per storey and radius ≈4.75; its world-space storeys are
// therefore 16 m apart and the exterior mushroom stays untouched.
//
// Framework-agnostic factory in the assets.js mould: geometries + materials +
// groups only (no TextureLoader, no document), so the node test suite can
// build it. Collision/zone data lives in world.js, NOT here — this is visuals.
//
// Layout contract (must stay in sync with world.js):
//   slab tops   y = 0 (L1), 4 (L2), 8 (L3)
//   stair A     L1→L2, local x∈[-3.9,-2.7]+6 = [2.1,3.3], z 3.0 (bottom) → -1.4 (top)
//   stair B     L2→L3, local x∈[-3.3,-2.1]   = [-3.3,-2.1], same z run
//   door        south wall, local z ≈ +4.5
const RADIUS = 4.75;
const LEVEL_HEIGHT = 4;
const WALL_HEIGHT = LEVEL_HEIGHT * 3 + 0.4;
const SLAB_THICKNESS = 0.35;

// Keep stair risers near the original player-friendly world height while the
// flight's overall run/rise scales 4x: 10 authored steps × scale = 40 steps.
const STAIR_RUN = {
  bottomZ: 3.0,
  topZ: -1.4,
  width: 2.4,
  steps: 10 * MUSHROOM_INTERIOR_SCALE
};
const STAIR_A_X = 2.7; // world -3.3
const STAIR_B_X = -2.7; // world -8.7

export function createMushroomInterior(materials) {
  const group = new THREE.Group();
  group.name = "mushroom-interior";
  group.scale.setScalar(MUSHROOM_INTERIOR_SCALE);

  // Inward-facing clones of the shared materials. DoubleSide so a player who
  // squeezes into the square-collider corners (slightly outside the round
  // wall) still sees the wall instead of x-raying the room.
  const wallMaterial = materials.mushroomStem.clone();
  wallMaterial.side = THREE.DoubleSide;
  const domeMaterial = materials.mushroomSpot.clone();
  domeMaterial.side = THREE.DoubleSide;
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

  // ---- Shell: soil surround, base slab, round wall, glowing gill dome ------
  // The walkable square's diagonals overshoot the round wall a little; a dark
  // earth cylinder + lid means a corner-hugger sees soil, never the void.
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(7.2, 7.2, WALL_HEIGHT + 3, 24, 1, false),
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
  dome.name = "mushroom-interior-dome";
  dome.position.y = WALL_HEIGHT;
  group.add(dome);

  // Radial "gill" ribs under the dome rim — echoes the cap underside outside.
  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const gill = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.9), materials.wood);
    gill.position.set(Math.cos(angle) * (RADIUS - 0.55), WALL_HEIGHT + 0.12, Math.sin(angle) * (RADIUS - 0.55));
    gill.rotation.y = -angle + Math.PI / 2;
    group.add(gill);
  }

  // ---- Upper slabs (round, with a stairwell hole each) ---------------------
  group.add(buildSlab("mushroom-interior-slab-l2", LEVEL_HEIGHT, STAIR_A_X, materials));
  group.add(buildSlab("mushroom-interior-slab-l3", LEVEL_HEIGHT * 2, STAIR_B_X, materials));

  // Warm baseboard ring where each floor meets the curved wall.
  for (const levelY of [0, LEVEL_HEIGHT, LEVEL_HEIGHT * 2]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RADIUS - 0.14, 0.07, 8, 48), materials.wood);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = levelY + 0.1;
    group.add(ring);
  }

  // ---- Stair flights + balustrades ----------------------------------------
  group.add(buildStairFlight("mushroom-interior-stair-a", STAIR_A_X, 0, "west", materials));
  group.add(buildStairFlight("mushroom-interior-stair-b", STAIR_B_X, LEVEL_HEIGHT, "east", materials));
  group.add(buildWellRailing("mushroom-interior-well-a", STAIR_A_X, LEVEL_HEIGHT, "west", materials));
  group.add(buildWellRailing("mushroom-interior-well-b", STAIR_B_X, LEVEL_HEIGHT * 2, "east", materials));

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
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), glowMaterial);
      disc.name = `mushroom-interior-window-${level + 1}-${index}`;
      disc.position.set(Math.sin(angle) * (RADIUS - 0.12), spec.y, Math.cos(angle) * (RADIUS - 0.12));
      disc.rotation.y = angle + Math.PI;
      group.add(disc);
      // Wooden porthole trim ring.
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.05, 8, 20), materials.wood);
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
    new THREE.CylinderGeometry(0.85, 0.85, 0.18, 24, 1, false, 0, Math.PI),
    materials.wood
  );
  doorArch.rotation.x = Math.PI / 2;
  doorArch.rotation.z = Math.PI;
  doorArch.position.set(0, 2.7, RADIUS - 0.35);
  group.add(doorArch);
  for (const px of [-0.95, 0.95]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.8, 0.24), materials.fascia);
    jamb.position.set(px, 1.4, RADIUS - 0.35);
    group.add(jamb);
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), materials.trim);
  knob.position.set(0.55, 1.3, RADIUS - 0.5);
  group.add(knob);

  // ---- Hanging pendant lamps, one per storey -------------------------------
  for (const [lampY, cordTop] of [
    [3.1, LEVEL_HEIGHT - SLAB_THICKNESS],
    [7.1, LEVEL_HEIGHT * 2 - SLAB_THICKNESS],
    [10.9, WALL_HEIGHT + 0.6]
  ]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, cordTop - lampY, 8), materials.fascia);
    cord.position.set(0.6, (cordTop + lampY) / 2, -0.6);
    group.add(cord);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), glowMaterial);
    bulb.name = `mushroom-interior-pendant-${lampY}`;
    bulb.position.set(0.6, lampY, -0.6);
    group.add(bulb);
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

// Round slab with a rectangular stairwell hole centred on `stairX`. Extruded
// from a 2D shape so the hole is a true cut-out (the camera rides the stairs
// straight through it).
function buildSlab(name, topY, stairX, materials) {
  // Slab rim tucks just inside the wall radius so no gap ring shows.
  const shape = new THREE.Shape();
  shape.absarc(0, 0, RADIUS - 0.03, 0, Math.PI * 2, false);

  // Shape-space v = -z (the mesh is rotated -PI/2 about X). Hole runs from the
  // flight's low end (z 3.4, just past the bottom step) to the top step's rear
  // edge (z -1.5) so the landing is solid the moment you step off the flight.
  const hole = new THREE.Path();
  const hx0 = stairX - STAIR_RUN.width / 2 - 0.2;
  const hx1 = stairX + STAIR_RUN.width / 2 + 0.2;
  hole.moveTo(hx0, -3.4);
  hole.lineTo(hx1, -3.4);
  hole.lineTo(hx1, 1.5);
  hole.lineTo(hx0, 1.5);
  hole.closePath();
  shape.holes.push(hole);

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
  return slab;
}

// One straight flight ascending northward (z decreases) from `baseY` to
// `baseY + LEVEL_HEIGHT`. Solid full-height risers so the flight reads chunky
// from every angle; a sloped handrail guards the open side.
function buildStairFlight(name, centerX, baseY, openSide, materials) {
  const flight = new THREE.Group();
  flight.name = name;

  const run = STAIR_RUN.bottomZ - STAIR_RUN.topZ;
  const tread = run / STAIR_RUN.steps;
  const rise = LEVEL_HEIGHT / STAIR_RUN.steps;

  for (let i = 0; i < STAIR_RUN.steps; i += 1) {
    const height = (i + 1) * rise;
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(STAIR_RUN.width, height, tread),
      materials.wood
    );
    step.name = `${name}-step-${i}`;
    step.position.set(
      centerX,
      baseY + height / 2,
      STAIR_RUN.bottomZ - (i + 0.5) * tread
    );
    step.castShadow = true;
    step.receiveShadow = true;
    flight.add(step);
  }

  // Sloped handrail on the open side (the other side hugs the wall).
  const railX = openSide === "west" ? centerX - STAIR_RUN.width / 2 - 0.08 : centerX + STAIR_RUN.width / 2 + 0.08;
  const slope = Math.atan2(LEVEL_HEIGHT, run);
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, Math.hypot(run, LEVEL_HEIGHT) + 0.4),
    materials.fascia
  );
  rail.position.set(railX, baseY + LEVEL_HEIGHT / 2 + 0.95, (STAIR_RUN.bottomZ + STAIR_RUN.topZ) / 2);
  rail.rotation.x = slope;
  flight.add(rail);
  for (const t of [0.15, 0.5, 0.85]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), materials.fascia);
    const z = STAIR_RUN.bottomZ - t * run;
    post.position.set(railX, baseY + t * LEVEL_HEIGHT + 0.5, z);
    flight.add(post);
  }

  return flight;
}

// Balustrade around the stairwell hole on the slab ABOVE a flight: posts + top
// rail along the hole's open long edge and its south (low) end, matching the
// invisible rim-guard colliders in world.js.
function buildWellRailing(name, stairX, floorY, openSide, materials) {
  const railing = new THREE.Group();
  railing.name = name;

  const edgeX = openSide === "west" ? stairX - STAIR_RUN.width / 2 - 0.28 : stairX + STAIR_RUN.width / 2 + 0.28;
  const addRail = (x, z, length, alongZ) => {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(alongZ ? 0.08 : length, 0.1, alongZ ? length : 0.08),
      materials.wood
    );
    rail.position.set(x, floorY + 1.0, z);
    railing.add(rail);
    const postCount = Math.max(2, Math.round(length / 1.1));
    for (let i = 0; i < postCount; i += 1) {
      const t = postCount === 1 ? 0.5 : i / (postCount - 1);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), materials.wood);
      post.position.set(
        alongZ ? x : x - length / 2 + length * t,
        floorY + 0.5,
        alongZ ? z - length / 2 + length * t : z
      );
      railing.add(post);
    }
  };

  // Long edge beside the hole.
  addRail(edgeX, 0.95, 4.9, true);
  // South (low) end of the hole — matches the rim-guard collider.
  addRail(stairX, 3.5, STAIR_RUN.width + 0.7, false);

  return railing;
}
