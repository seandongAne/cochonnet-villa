// Shared scale and coordinate helpers for the mushroom-house pocket interior.
//
// The exterior mushroom stays at its original courtyard size. Entering it is
// a teleport into this independent space, so the interior is free to use its
// own scale without changing the exterior mesh or collider.

// A 1.6x magical pocket is still noticeably larger than the exterior shell,
// while keeping its furnished floors intimate (about 15 m across instead of
// the former 38 m showroom). Storeys are 6.4 m high.
export const MUSHROOM_INTERIOR_SCALE = 1.6;
export const MUSHROOM_FURNITURE_SCALE = 0.8;
// Player-scale circulation details do not inherit the pocket's architectural
// scale. The flight still spans the enlarged storey, but remains a normal
// 2.4 m wide with one-metre handrails.
export const MUSHROOM_STAIR_WIDTH = 2.4;
export const MUSHROOM_RAIL_HEIGHT = 1;
// Floor construction and clearance also stay at a believable player scale.
// These are WORLD-space values; mushroom-interior.js counter-scales them before
// the entire pocket group receives its architectural transform.
export const MUSHROOM_SLAB_THICKNESS = 0.35;
export const MUSHROOM_STAIR_OPENING_MARGIN = 0.4;

export const MUSHROOM_INTERIOR_CENTER = Object.freeze({ x: -6, z: 18 });

// Burying the origin at -80 keeps the complete compact tower safely below the
// meadow while preserving wide separation from the courtyard collision bands.
export const MUSHROOM_INTERIOR_BASE_Y = -80;
export const MUSHROOM_INTERIOR_LEVEL_HEIGHT = 4 * MUSHROOM_INTERIOR_SCALE;
export const MUSHROOM_INTERIOR_EYE_OFFSET = 1.6;

export const MUSHROOM_INTERIOR_FLOOR_Y = Object.freeze([
  MUSHROOM_INTERIOR_BASE_Y,
  MUSHROOM_INTERIOR_BASE_Y + MUSHROOM_INTERIOR_LEVEL_HEIGHT,
  MUSHROOM_INTERIOR_BASE_Y + MUSHROOM_INTERIOR_LEVEL_HEIGHT * 2
]);

export const MUSHROOM_INTERIOR_EYE_Y = Object.freeze(
  MUSHROOM_INTERIOR_FLOOR_Y.map((floorY) => floorY + MUSHROOM_INTERIOR_EYE_OFFSET)
);

// The hand-off points sit halfway between adjacent eye heights. They keep a
// player attached to the correct floor after leaving a stair zone while all
// colliders remain isolated from the courtyard at y≈1.6.
const L1_L2_HANDOFF = (MUSHROOM_INTERIOR_EYE_Y[0] + MUSHROOM_INTERIOR_EYE_Y[1]) / 2;
const L2_L3_HANDOFF = (MUSHROOM_INTERIOR_EYE_Y[1] + MUSHROOM_INTERIOR_EYE_Y[2]) / 2;

export const MUSHROOM_FLOOR_Y_RANGES = Object.freeze({
  2: Object.freeze({
    minY: MUSHROOM_INTERIOR_BASE_Y - 1.5,
    maxY: L1_L2_HANDOFF
  }),
  3: Object.freeze({
    minY: L1_L2_HANDOFF,
    maxY: L2_L3_HANDOFF
  }),
  4: Object.freeze({
    minY: L2_L3_HANDOFF,
    maxY: MUSHROOM_INTERIOR_FLOOR_Y[2] + MUSHROOM_INTERIOR_LEVEL_HEIGHT + 5
  })
});

export function scaleMushroomInteriorX(x) {
  return MUSHROOM_INTERIOR_CENTER.x
    + (x - MUSHROOM_INTERIOR_CENTER.x) * MUSHROOM_INTERIOR_SCALE;
}

export function scaleMushroomInteriorZ(z) {
  return MUSHROOM_INTERIOR_CENTER.z
    + (z - MUSHROOM_INTERIOR_CENTER.z) * MUSHROOM_INTERIOR_SCALE;
}

export function scaleMushroomInteriorPoint(x, z) {
  return {
    x: scaleMushroomInteriorX(x),
    z: scaleMushroomInteriorZ(z)
  };
}

// Legacy Kenney furniture migrations keep the old composition's normalized
// position and 0.8x model scale. New KayKit records use the world-offset helper
// below and their own metre-scale base factor.
export function mushroomFurniturePosition(x, level, z, yOffset = 0) {
  const point = scaleMushroomInteriorPoint(x, z);
  return [
    point.x,
    MUSHROOM_INTERIOR_FLOOR_Y[level] + 0.05 + yOffset * MUSHROOM_FURNITURE_SCALE,
    point.z
  ];
}

// New furniture authored directly for the pocket uses world-metre vertical
// offsets instead of the legacy 0.8x migration above. X/Z stay in the readable
// plan coordinates, then fan out with the configured room scale.
export function mushroomFurnitureWorldPosition(x, level, z, yOffset = 0) {
  const point = scaleMushroomInteriorPoint(x, z);
  return [
    point.x,
    MUSHROOM_INTERIOR_FLOOR_Y[level] + 0.05 + yOffset,
    point.z
  ];
}

export function mushroomFurnitureScale(scale) {
  return scale * MUSHROOM_FURNITURE_SCALE;
}
