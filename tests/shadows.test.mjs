import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";

import { createShadowBlobs, SHADOW_BLOB_PADDING, SHADOW_BLOB_LIFT } from "../src/villa-map/shadows.js";
import { FURNITURE_PLACEMENTS } from "../src/villa-map/furniture-placements.js";

// Resolve the world position of a flat plane mesh, accounting for any parent
// wrapper-group offsets/rotations (the plane sits inside a rotated wrapper).
// updateMatrixWorld does not walk upward, so update from the scene-graph root.
function worldPosition(root, object) {
  root.updateMatrixWorld(true);
  return new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
}

// Find the leaf plane mesh whose name matches a given placement id.
function findBlobMesh(group, id) {
  let found = null;
  group.traverse((child) => {
    if (child.isMesh && child.name === `shadow-${id}`) found = child;
  });
  return found;
}

test("shadow group is named and holds one blob per non-noShadow placement", () => {
  const group = createShadowBlobs(FURNITURE_PLACEMENTS);

  assert.equal(group.name, "furniture-shadows");

  const expected = FURNITURE_PLACEMENTS.filter((piece) => !piece.noShadow).length;
  assert.ok(expected > 0, "fixture should have at least one shadowed piece");
  assert.equal(group.children.length, expected);

  // Every wrapper child should contain exactly one flat plane mesh.
  let meshCount = 0;
  group.traverse((child) => {
    if (child.isMesh) meshCount += 1;
  });
  assert.equal(meshCount, expected);
});

test("a noShadow rug (west-rug) gets no blob at its XZ", () => {
  const rug = FURNITURE_PLACEMENTS.find((piece) => piece.id === "west-rug");
  assert.ok(rug, "fixture should include west-rug");
  assert.equal(rug.noShadow, true, "west-rug should be flagged noShadow");

  const group = createShadowBlobs(FURNITURE_PLACEMENTS);
  assert.equal(findBlobMesh(group, "west-rug"), null);

  // And no blob mesh sits at the rug's exact XZ.
  let hitAtRugXZ = false;
  group.traverse((child) => {
    if (!child.isMesh) return;
    const p = worldPosition(group, child);
    if (Math.abs(p.x - rug.position[0]) < 1e-6 && Math.abs(p.z - rug.position[2]) < 1e-6) {
      hitAtRugXZ = true;
    }
  });
  assert.equal(hitAtRugXZ, false);
});

test("a solid piece (west-sofa) has a blob at its world position, lifted off the floor", () => {
  const sofa = FURNITURE_PLACEMENTS.find((piece) => piece.id === "west-sofa");
  assert.ok(sofa, "fixture should include west-sofa");
  assert.equal(sofa.noShadow, false, "west-sofa should NOT be noShadow");

  const group = createShadowBlobs(FURNITURE_PLACEMENTS);
  const blob = findBlobMesh(group, "west-sofa");
  assert.ok(blob, "west-sofa should have a blob mesh");

  const p = worldPosition(group, blob);
  assert.ok(Math.abs(p.x - sofa.position[0]) < 1e-3, `blob x ${p.x} ~ ${sofa.position[0]}`);
  assert.ok(Math.abs(p.z - sofa.position[2]) < 1e-3, `blob z ${p.z} ~ ${sofa.position[2]}`);
  assert.ok(
    Math.abs(p.y - (sofa.position[1] + SHADOW_BLOB_LIFT)) < 1e-3,
    `blob y ${p.y} ~ ${sofa.position[1] + SHADOW_BLOB_LIFT}`
  );
});

test("blob size reflects the placement footprint times the padding", () => {
  const sofa = FURNITURE_PLACEMENTS.find((piece) => piece.id === "west-sofa");
  const group = createShadowBlobs(FURNITURE_PLACEMENTS);
  const blob = findBlobMesh(group, "west-sofa");
  assert.ok(blob);

  // Effective plane extent = base PlaneGeometry params × the mesh scale.
  const params = blob.geometry.parameters;
  const effectiveWidth = params.width * blob.scale.x;
  const effectiveDepth = params.height * blob.scale.y;

  const expectedWidth = sofa.footprint.x * SHADOW_BLOB_PADDING;
  const expectedDepth = sofa.footprint.z * SHADOW_BLOB_PADDING;

  assert.ok(
    Math.abs(effectiveWidth - expectedWidth) < 1e-6,
    `width ${effectiveWidth} ~ ${expectedWidth}`
  );
  assert.ok(
    Math.abs(effectiveDepth - expectedDepth) < 1e-6,
    `depth ${effectiveDepth} ~ ${expectedDepth}`
  );
});

test("the plane lies flat and the wrapper carries the rotationY", () => {
  // west-armchair has a non-zero rotationY; verify the tilt/rotation split.
  const chair = FURNITURE_PLACEMENTS.find((piece) => piece.id === "west-armchair");
  assert.ok(chair && !chair.noShadow);

  const group = createShadowBlobs(FURNITURE_PLACEMENTS);
  const blob = findBlobMesh(group, "west-armchair");
  assert.ok(blob);

  // The plane itself is tilted -PI/2 about X to lie flat...
  assert.ok(Math.abs(blob.rotation.x - -Math.PI / 2) < 1e-9);
  // ...and its parent wrapper carries the world-Y rotation.
  assert.ok(Math.abs(blob.parent.rotation.y - chair.rotationY) < 1e-9);
});
