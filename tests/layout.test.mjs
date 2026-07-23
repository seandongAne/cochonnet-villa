import assert from "node:assert/strict";
import { test } from "node:test";

import { ARCHITECTURE_PLACEMENTS } from "../src/villa-map/architecture-placements.js";
import { EXTERIOR_PLACEMENTS } from "../src/villa-map/exterior-placements.js";
import { FURNITURE_PLACEMENTS } from "../src/villa-map/furniture-placements.js";

// The main villa keeps its restrained one-group-per-room budgets. The 4x
// mushroom pocket is intentionally different: each giant level needs several
// close clusters to read as a warm home rather than a mostly empty hall.
const ROOM_PIECE_BUDGETS = {
  "entry-foyer": 4,
  "great-hall-west": 8,
  "great-hall-east": 11,
  "master-bedroom": 8,
  "study-loft": 6,
  "lounge-balcony": 7
};

const MUSHROOM_DENSITY_BANDS = {
  "mushroom-hearth": { min: 36, max: 45 },
  "mushroom-den": { min: 36, max: 45 },
  "mushroom-loft": { min: 36, max: 45 }
};

function rotatedAabb(piece) {
  const theta = piece.rotationY ?? 0;
  const cos = Math.abs(Math.cos(theta));
  const sin = Math.abs(Math.sin(theta));
  const halfX = (piece.footprint.x * cos + piece.footprint.z * sin) / 2;
  const halfZ = (piece.footprint.x * sin + piece.footprint.z * cos) / 2;
  const [x, , z] = piece.position;
  return { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ };
}

function overlapsRect(piece, rect) {
  const box = rotatedAabb(piece);
  return (
    box.maxX > rect.minX &&
    box.minX < rect.maxX &&
    box.maxZ > rect.minZ &&
    box.minZ < rect.maxZ
  );
}

test("each interior room stays within its curated visual-density budget", () => {
  const byRoom = Map.groupBy(FURNITURE_PLACEMENTS, (piece) => piece.room);

  for (const [room, budget] of Object.entries(ROOM_PIECE_BUDGETS)) {
    const pieces = byRoom.get(room) ?? [];
    assert.ok(pieces.length > 0, `${room} should remain furnished`);
    assert.ok(
      pieces.length <= budget,
      `${room} has ${pieces.length} pieces; visual-density budget is ${budget}`
    );
  }
});

test("each expanded mushroom level keeps several dense furniture clusters", () => {
  const byRoom = Map.groupBy(FURNITURE_PLACEMENTS, (piece) => piece.room);

  for (const [room, band] of Object.entries(MUSHROOM_DENSITY_BANDS)) {
    const pieces = byRoom.get(room) ?? [];
    assert.ok(
      pieces.length >= band.min && pieces.length <= band.max,
      `${room} has ${pieces.length} pieces; expected ${band.min}-${band.max}`
    );
    assert.ok(
      new Set(pieces.map((piece) => piece.model)).size >= 14,
      `${room} should use a varied mix of Kenney furniture`
    );
  }
});

test("rooms use at most one grounding rug per intentional furniture cluster", () => {
  const byRoom = Map.groupBy(FURNITURE_PLACEMENTS, (piece) => piece.room);

  for (const [room, pieces] of byRoom) {
    const rugs = pieces.filter((piece) => /^rug/.test(piece.model));
    const maxRugs = room.startsWith("mushroom-") ? 4 : 1;
    assert.ok(
      rugs.length <= maxRugs,
      `${room} layers ${rugs.length} rugs; expected at most ${maxRugs}`
    );
  }
});

test("solid props keep the main arrival and interior circulation axes open", () => {
  const groundFurniture = FURNITURE_PLACEMENTS.filter(
    (piece) => piece.floor === 0 && piece.solid
  );
  const courtyardSolids = [
    ...EXTERIOR_PLACEMENTS,
    ...ARCHITECTURE_PLACEMENTS
  ].filter((piece) => piece.solid);

  const lanes = [
    {
      name: "foyer centreline",
      pieces: groundFurniture,
      rect: { minX: -1.5, maxX: 1.5, minZ: -7.2, maxZ: -2.0 }
    },
    {
      name: "west-hall inner aisle",
      pieces: groundFurniture,
      rect: { minX: -4.35, maxX: -3.0, minZ: -22.0, maxZ: -7.0 }
    },
    {
      name: "east-hall inner aisle",
      pieces: groundFurniture,
      rect: { minX: 3.0, maxX: 4.35, minZ: -22.0, maxZ: -7.0 }
    },
    {
      name: "courtyard path",
      pieces: courtyardSolids,
      rect: { minX: -0.7, maxX: 4.7, minZ: 5.5, maxZ: 16.5 }
    }
  ];

  for (const lane of lanes) {
    const blockers = lane.pieces.filter((piece) => overlapsRect(piece, lane.rect));
    assert.deepEqual(
      blockers.map((piece) => piece.id),
      [],
      `${lane.name} blocked by ${blockers.map((piece) => piece.id).join(", ")}`
    );
  }
});
