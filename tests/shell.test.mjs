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
