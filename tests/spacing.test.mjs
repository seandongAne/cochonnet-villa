import assert from "node:assert/strict";
import { test } from "node:test";

import { FURNITURE_PLACEMENTS } from "../src/villa-map/furniture-placements.js";
import { EXTERIOR_PLACEMENTS } from "../src/villa-map/exterior-placements.js";
import { ARCHITECTURE_PLACEMENTS } from "../src/villa-map/architecture-placements.js";

// ── Same-model spacing guard ────────────────────────────────────────────────
// Two copies of the SAME kit model standing close together read as a
// copy-paste accident (two identical book piles on one desk, twin plants in
// one corner). This guard keeps identical props at least MIN_DISTANCE apart
// on the same floor, across ALL placement sets (interior + courtyard +
// entrance accents — the player sees one continuous world).
//
// Intentional groupings are exempt:
//   - chair-family models: dining rows, stools/poufs and paired lounge chairs
//     are MEANT to cluster (same rule the overlap guard uses);
//   - `railing`: the porch railing is one run assembled from repeated panels.
// Deliberate symmetric pairs that remain (nightstands, bed lamps, layered
// doormats, path lanterns) all sit comfortably above the threshold.
const MIN_DISTANCE = 1.8;

const EXEMPT_MODEL = (model) => /chair/i.test(model ?? "") || model === "railing";

const ALL_PLACEMENTS = [
  ...FURNITURE_PLACEMENTS,
  ...EXTERIOR_PLACEMENTS,
  ...ARCHITECTURE_PLACEMENTS
];

// All (i<j) same-model, same-floor pairs closer than `threshold` (XZ metres).
export function findCrowdedTwins(placements, threshold = MIN_DISTANCE) {
  const offenders = [];
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      if (a.model !== b.model) continue;
      if (EXEMPT_MODEL(a.model)) continue;
      if ((a.floor ?? 0) !== (b.floor ?? 0)) continue;
      const distance = Math.hypot(
        a.position[0] - b.position[0],
        a.position[2] - b.position[2]
      );
      if (distance < threshold) {
        offenders.push({ a: a.id, b: b.id, model: a.model, distance });
      }
    }
  }
  return offenders;
}

test("identical props keep their distance (no same-model pair crowds within the threshold)", () => {
  const offenders = findCrowdedTwins(ALL_PLACEMENTS);
  const detail = offenders
    .map((o) => `  ${o.a} ⨯ ${o.b} (${o.model}) = ${o.distance.toFixed(2)} m (< ${MIN_DISTANCE})`)
    .join("\n");
  assert.equal(
    offenders.length,
    0,
    `same-model props are placed too close together:\n${detail}`
  );
});

test("every placement record exposes the model name the spacing guard keys on", () => {
  ALL_PLACEMENTS.forEach((piece) => {
    assert.equal(typeof piece.model, "string", `${piece.id} missing model`);
    assert.ok(piece.model.length > 0, `${piece.id} empty model`);
  });
});

test("the two audited book-pile fixes hold (study desk + west hall)", () => {
  const byId = new Map(FURNITURE_PLACEMENTS.map((p) => [p.id, p]));
  const distance = (aId, bId) => {
    const a = byId.get(aId);
    const b = byId.get(bId);
    assert.ok(a && b, `expected both ${aId} and ${bId} to exist`);
    return Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
  };
  assert.ok(distance("study-books", "study-desk-books") >= MIN_DISTANCE);
  assert.ok(distance("west-books", "west-floor-books") >= MIN_DISTANCE);
});
