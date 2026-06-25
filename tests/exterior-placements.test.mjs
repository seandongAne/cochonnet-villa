import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { EXTERIOR_PLACEMENTS } from "../src/villa-map/exterior-placements.js";

// World AABB (matches world.js bounds: x∈[-26,30], z∈[-27,28]). The courtyard
// props live at the scene root in world space, so they must sit inside it.
const BOUNDS = { minX: -26, maxX: 30, minZ: -27, maxZ: 28 };

// Mirrors villa-map.test.mjs "furniture placements reference vendored CC0 GLBs"
// for the exterior courtyard set: every record points at a real vendored GLB,
// lands inside the playable world, and carries the derived fields the shadow +
// collider layers read (footprint, floor).
test("exterior placements reference vendored CC0 GLBs within the world bounds", () => {
  assert.ok(EXTERIOR_PLACEMENTS.length >= 8, "expected at least 8 courtyard props");

  // Every id is unique so React keys / scene mounting stay stable.
  const ids = EXTERIOR_PLACEMENTS.map((piece) => piece.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate exterior placement id");

  EXTERIOR_PLACEMENTS.forEach((piece) => {
    // URL points at the exterior model folder and a .glb file.
    assert.match(piece.url, /^\/models\/exterior\/.+\.glb$/, `${piece.id} bad url`);

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
    assert.equal(piece.floor, 0, `${piece.id} courtyard props are ground floor`);

    assert.equal(typeof piece.rotationY, "number", `${piece.id} rotationY`);
  });
});

test("the courtyard has a fountain centerpiece and lamppost-lined path", () => {
  const court = EXTERIOR_PLACEMENTS.filter((p) => p.room === "courtyard");
  assert.ok(court.length >= 8, "courtyard should be furnished");
  assert.ok(court.some((p) => /statueRing/.test(p.url)), "missing centerpiece");
  assert.ok(
    court.filter((p) => /lantern/.test(p.url)).length >= 2,
    "expected lampposts lining the path"
  );
  assert.ok(court.some((p) => /bench/.test(p.url)), "missing a bench");
});

test("the shared colormap atlas the Holiday-kit props depend on is vendored", () => {
  // bench + lantern (Kenney Holiday Kit, UnityGLTF export) reference a shared
  // `Textures/colormap.png` by relative URI; GLTFLoader resolves it next to the
  // .glb, so the atlas must be vendored at exterior/Textures/colormap.png or
  // those props render untextured (flat white).
  const atlas = fileURLToPath(
    new URL("../public/models/exterior/Textures/colormap.png", import.meta.url)
  );
  assert.ok(existsSync(atlas), "missing exterior colormap atlas (bench/lantern need it)");
});
