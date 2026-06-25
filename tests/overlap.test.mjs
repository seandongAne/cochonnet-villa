import assert from "node:assert/strict";
import { test } from "node:test";

import { FURNITURE_PLACEMENTS } from "../src/villa-map/furniture-placements.js";

// ── Phase-4 de-overlap regression guard ────────────────────────────────────
// Solid furniture pieces drive both the blob shadows and the per-piece
// colliders, so two SOLID pieces clipping into each other reads as a visual
// (and navigational) bug — UNLESS one of them is a chair, which is meant to
// tuck under a table / desk or beside a bigger seat. This test pins the
// "distinct standing solids must not clip" invariant so the de-overlap work
// can't silently regress.
//
// It deliberately reads ONLY FURNITURE_PLACEMENTS (the stamped records own the
// `footprint` / `floor` / `solid` / `model` fields). Exterior + architecture
// placements live in sibling modules owned by other streams; the integrator
// can extend this guard to them later by feeding their records through the
// exported helpers below.

// Max tolerated footprint overlap between two distinct standing solids (m²).
// Small tuck-in (a nightstand kissing a bed corner, a desk grazing a bookcase)
// is acceptable; anything past this reads as one piece sunk into another.
const MAX_OVERLAP_M2 = 0.5;

// Chairs are EXPECTED to overlap larger furniture (dining chairs tuck under
// the table, the desk chair under the desk, lounge/reading chairs slide beside
// the sofa or side table). Treat any model whose name contains "chair" as a
// chair: covers `chair`, `chairDesk`, `loungeChair`, `loungeChairRelax`.
export function isChairModel(piece) {
  return /chair/i.test(piece.model ?? "");
}

// World-axis half-extents of a footprint {x:w, z:d} rotated by θ about Y.
// A w×d box turned by θ projects onto the world axes as
//   W = (|w·cosθ| + |d·sinθ|) / 2,  D = (|w·sinθ| + |d·cosθ|) / 2.
export function rotatedAabb(piece) {
  const theta = piece.rotationY ?? 0;
  const cos = Math.abs(Math.cos(theta));
  const sin = Math.abs(Math.sin(theta));
  const w = piece.footprint.x;
  const d = piece.footprint.z;
  const halfW = (w * cos + d * sin) / 2;
  const halfD = (w * sin + d * cos) / 2;
  const x = piece.position[0];
  const z = piece.position[2];
  return { minX: x - halfW, maxX: x + halfW, minZ: z - halfD, maxZ: z + halfD };
}

// Footprint overlap AREA (m²) of two rotated-AABBs. 0 if they don't overlap on
// both axes (an AABB pair overlaps only when it overlaps on x AND z).
export function overlapArea(a, b) {
  const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (ox <= 0 || oz <= 0) return 0;
  return ox * oz;
}

// All (i<j) pairs of solid, non-chair pieces on the SAME floor that overlap
// beyond `threshold`. Pieces on different floors can never collide (their
// colliders are Y-scoped), so they are skipped. Exported so the integrator can
// reuse it against the combined placement sets.
export function findSolidOverlaps(placements, threshold = MAX_OVERLAP_M2) {
  const offenders = [];
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      if (a.solid !== true || b.solid !== true) continue;
      if (isChairModel(a) || isChairModel(b)) continue;
      if (a.floor !== b.floor) continue;
      const area = overlapArea(rotatedAabb(a), rotatedAabb(b));
      if (area > threshold) offenders.push({ a: a.id, b: b.id, area });
    }
  }
  return offenders;
}

test("no two distinct standing solids (non-chair) clip beyond the threshold", () => {
  const offenders = findSolidOverlaps(FURNITURE_PLACEMENTS);
  const detail = offenders
    .map((o) => `  ${o.a} ⨯ ${o.b} = ${o.area.toFixed(3)} m² (> ${MAX_OVERLAP_M2})`)
    .join("\n");
  assert.equal(
    offenders.length,
    0,
    `solid non-chair furniture pieces overlap beyond ${MAX_OVERLAP_M2} m²:\n${detail}`
  );
});

test("the three audited must-fix pairs are resolved to ≤ 0.5 m²", () => {
  const byId = new Map(FURNITURE_PLACEMENTS.map((p) => [p.id, p]));
  const pairs = [
    ["west-sofa", "west-coffee-table"],
    ["bed-double", "bed-nightstand-l"],
    ["bed-double", "bed-nightstand-r"]
  ];
  for (const [aId, bId] of pairs) {
    const a = byId.get(aId);
    const b = byId.get(bId);
    assert.ok(a && b, `expected both ${aId} and ${bId} to exist`);
    const area = overlapArea(rotatedAabb(a), rotatedAabb(b));
    assert.ok(
      area <= MAX_OVERLAP_M2,
      `${aId} ⨯ ${bId} overlap ${area.toFixed(3)} m² should be ≤ ${MAX_OVERLAP_M2}`
    );
  }
});

test("the rotated-AABB helper matches a hand-checked rotation", () => {
  // A 2×1 footprint turned 90° swaps its world axes (W↔D).
  const box = rotatedAabb({
    position: [0, 0, 0],
    rotationY: Math.PI / 2,
    footprint: { x: 2, z: 1 }
  });
  assert.ok(Math.abs(box.maxX - 0.5) < 1e-9, "rotated width half-extent = 0.5");
  assert.ok(Math.abs(box.maxZ - 1.0) < 1e-9, "rotated depth half-extent = 1.0");
});
