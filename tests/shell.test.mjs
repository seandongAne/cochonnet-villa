// Villa shell (Stream A polish) smoke tests.
// Keep node-pure: assets.js must not touch `document`/TextureLoader at import
// or in createMaterials()/createModernVilla(), since this runs under `node
// --test` with no DOM. These assertions guard that purity plus the basic shape
// of the beveled shell.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createMaterials, createModernVilla } from "../src/villa-map/assets.js";

test("createMaterials() is node-pure and exposes the shell finish palette", () => {
  const materials = createMaterials();
  assert.ok(materials, "createMaterials returned a value");
  // Materials added by the Stream A finish pass.
  for (const key of ["fascia", "doorWood", "stoneBase", "baseboard"]) {
    assert.ok(materials[key], `material key ${key} exists`);
    assert.ok(materials[key].isMaterial, `material ${key} is a THREE material`);
  }
});

test("createModernVilla() builds a Group with children, node-pure", () => {
  const villa = createModernVilla(createMaterials());
  assert.ok(villa instanceof THREE.Group, "villa is a THREE.Group");
  assert.ok(villa.children.length > 0, "villa has children");
});

test("villa shell bevels its chunky boxes via RoundedBoxGeometry", () => {
  const villa = createModernVilla(createMaterials());
  let rounded = 0;
  villa.traverse((obj) => {
    if (obj.geometry && obj.geometry.type === "RoundedBoxGeometry") rounded += 1;
  });
  // The shell panels / wings / roofs / chimney / porch / corner posts are
  // beveled; thin slivers (glass, mullions) intentionally stay plain boxes.
  assert.ok(rounded >= 10, `expected several beveled boxes, found ${rounded}`);
});

test("the final villa shell leaves the main stairwell open through every ceiling layer", () => {
  const villa = createModernVilla(createMaterials());
  villa.updateMatrixWorld(true);

  // Probe only the storey boundary: the staircase below and upper roof above
  // are intentional, but no ceiling/floor surface may occupy this vertical
  // slice through the centre of the 3 x 4 m stair opening.
  const ray = new THREE.Raycaster(
    new THREE.Vector3(0, 6.8, 3),
    new THREE.Vector3(0, -1, 0),
    0,
    1
  );
  const hits = ray.intersectObject(villa, true);
  assert.equal(
    hits.length,
    0,
    `stairwell blocked by ${hits.map((hit) => hit.object.name || hit.object.geometry?.type).join(", ")}`
  );

  const lowerRoof = villa.getObjectByName("villa-lower-roof");
  const underside = villa.getObjectByName("villa-lower-roof-underside");
  assert.ok(lowerRoof && underside, "cut-out roof layers missing");
  assert.equal(lowerRoof.children.length, 4);
  assert.equal(underside.children.length, 4);
});
