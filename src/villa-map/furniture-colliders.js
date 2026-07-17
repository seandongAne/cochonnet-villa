// Phase-3 collider layer for solid GLB furniture. Pure logic — no `three`,
// only `Math` — so it stays node-testable alongside the rest of the
// framework-agnostic core. The integrator wires the output into world.js:
//
//   import { deriveFurnitureColliders } from "./furniture-colliders.js";
//   ...colliders: [ ..., ...deriveFurnitureColliders([...FURNITURE_PLACEMENTS, ...EXTERIOR_PLACEMENTS]) ]
//
// Each emitted collider matches the boxCollider shape consumed by
// `collidesWithWorld`: { id, minX, maxX, minZ, maxZ, minY, maxY }. The Y range
// scopes the collider to a single floor (collidesWithWorld skips a collider
// when playerY is outside [minY, maxY]), so a ground player never bumps into
// upstairs furniture and vice-versa.

// Floor Y ranges — must match the constants in world.js exactly.
// Ground floor walls span y∈[0, 5.6]; the upper slab/walls span y∈[6.65, 11.25].
// Floors 2–4 are the buried mushroom-house interior levels (slab tops -40/-36/
// -32, player eye slab+1.6); their bands mirror the world.js MUSH_L*_Y bands.
const FLOOR_Y_RANGES = {
  0: { minY: 0, maxY: 5.6 },
  1: { minY: 6.65, maxY: 11.25 },
  2: { minY: -41.5, maxY: -36.6 },
  3: { minY: -36.6, maxY: -32.6 },
  4: { minY: -32.6, maxY: -27 }
};

// collidesWithWorld already ADDS the player radius (0.62) as margin at test
// time, so an un-shrunk box reads as larger than the visible piece and feels
// sticky. Shrinking the world-axis extents by this factor lets the player
// stand right next to a piece without clipping into it.
const FOOTPRINT_SHRINK = 0.85;

// Derive one AABB collider per `solid` placement. Non-solid pieces (rugs,
// books, lamps, small plants, dining/desk chairs, …) are walk-through and
// produce nothing. Pure function: only Math, safe to call in node.
export function deriveFurnitureColliders(placements) {
  const colliders = [];

  for (const placement of placements) {
    if (placement.solid !== true) continue;

    const theta = placement.rotationY ?? 0;
    const w = placement.footprint.x;
    const d = placement.footprint.z;

    // Rotated-AABB: world-axis extents of a w×d box turned by θ.
    const cos = Math.abs(Math.cos(theta));
    const sin = Math.abs(Math.sin(theta));
    const worldW = w * cos + d * sin;
    const worldD = w * sin + d * cos;

    const hw = (worldW * FOOTPRINT_SHRINK) / 2;
    const hd = (worldD * FOOTPRINT_SHRINK) / 2;

    const x = placement.position[0];
    const z = placement.position[2];
    const yRange = FLOOR_Y_RANGES[placement.floor] ?? FLOOR_Y_RANGES[0];

    colliders.push({
      id: `furniture-${placement.id}`,
      minX: x - hw,
      maxX: x + hw,
      minZ: z - hd,
      maxZ: z + hd,
      minY: yRange.minY,
      maxY: yRange.maxY
    });
  }

  return colliders;
}
