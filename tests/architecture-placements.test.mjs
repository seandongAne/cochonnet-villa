import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ARCHITECTURE_PLACEMENTS } from "../src/villa-map/architecture-placements.js";

// World AABB (matches world.js bounds: x∈[-26,30], z∈[-27,28]). The entrance
// accents live at the scene root in world space, so they must sit inside it.
const BOUNDS = { minX: -26, maxX: 30, minZ: -27, maxZ: 28 };

// Mirrors exterior-placements.test.mjs for the Phase-4 front-entrance accent
// set: every record points at a real vendored GLB, lands inside the playable
// world, and carries the derived fields the shadow + collider layers read
// (footprint, floor, solid).
test("architecture placements reference vendored CC0 GLBs within the world bounds", () => {
  assert.ok(
    ARCHITECTURE_PLACEMENTS.length >= 5,
    "expected at least 5 entrance accents"
  );

  // Every id is unique so React keys / scene mounting stay stable.
  const ids = ARCHITECTURE_PLACEMENTS.map((piece) => piece.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate architecture placement id");

  ARCHITECTURE_PLACEMENTS.forEach((piece) => {
    // URL points at the architecture model folder and a .glb file.
    assert.match(
      piece.url,
      /^\/models\/architecture\/.+\.glb$/,
      `${piece.id} bad url`
    );

    // The GLB the scene will fetch must actually be vendored in public/.
    const filePath = fileURLToPath(new URL(`../public${piece.url}`, import.meta.url));
    assert.ok(existsSync(filePath), `missing GLB file: ${piece.url}`);

    // Positions live inside the playable world AABB.
    const [x, , z] = piece.position;
    assert.ok(x > BOUNDS.minX && x < BOUNDS.maxX, `${piece.id} x out of bounds`);
    assert.ok(z > BOUNDS.minZ && z < BOUNDS.maxZ, `${piece.id} z out of bounds`);

    // Derived fields the shadow + collider layers depend on.
    assert.ok(piece.footprint, `${piece.id} missing footprint`);
    assert.ok(piece.footprint.x > 0, `${piece.id} footprint.x must be positive`);
    assert.ok(piece.footprint.z > 0, `${piece.id} footprint.z must be positive`);
    assert.equal(piece.floor, 0, `${piece.id} entrance accents are ground floor`);

    assert.equal(typeof piece.rotationY, "number", `${piece.id} rotationY`);
    assert.equal(typeof piece.solid, "boolean", `${piece.id} solid flag`);
    assert.equal(typeof piece.noShadow, "boolean", `${piece.id} noShadow flag`);
  });
});

test("the entrance is dressed with accents and keeps the open entry passable", () => {
  const ent = ARCHITECTURE_PLACEMENTS.filter((p) => p.room === "entrance");
  assert.ok(ent.length >= 5, "entrance should be dressed");

  // The villa front is an OPEN portal — there must be no door piece sealing it.
  assert.ok(
    !ent.some((p) => /door/i.test(p.url) || /door/i.test(p.id)),
    "the entrance must stay an open portal (no door piece)"
  );

  // Any SOLID accent must keep its collider clear of the x∈[-5,5] entry path.
  // A piece at world x with LOCAL footprint f and rotationY r spans, in X,
  // half-extent = (|cos r|·fx + |sin r|·fz)/2 (rotated-AABB). The collider layer
  // applies a 0.85 shrink and the player radius (0.62) is added at test time —
  // we use the un-shrunk half-extent + radius as a conservative bound here.
  const PLAYER_R = 0.62;
  ent
    .filter((p) => p.solid)
    .forEach((p) => {
      const [x] = p.position;
      const half =
        (Math.abs(Math.cos(p.rotationY)) * p.footprint.x +
          Math.abs(Math.sin(p.rotationY)) * p.footprint.z) /
        2;
      const inner = Math.abs(x) - half - PLAYER_R;
      assert.ok(
        inner > 5,
        `${p.id} solid collider intrudes into the x∈[-5,5] doorway (reaches x≈${(Math.abs(x) - half).toFixed(2)})`
      );
    });
});

test("the shared colormap atlas the City-Suburban accents depend on is vendored", () => {
  // railing (fence) + planter (Kenney City Suburban Kit, UnityGLTF export)
  // reference a shared `Textures/colormap.png` by relative URI; GLTFLoader
  // resolves it next to the .glb, so the atlas must be vendored at
  // architecture/Textures/colormap.png or those props render untextured.
  const usesAtlas = ARCHITECTURE_PLACEMENTS.some((p) =>
    /(railing|planter)/.test(p.url)
  );
  if (!usesAtlas) return; // only assert if we actually placed an atlas-dependent piece

  const atlas = fileURLToPath(
    new URL("../public/models/architecture/Textures/colormap.png", import.meta.url)
  );
  assert.ok(
    existsSync(atlas),
    "missing architecture colormap atlas (railing/planter need it)"
  );
});
