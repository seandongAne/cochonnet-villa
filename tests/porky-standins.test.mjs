import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createMaterials, createPorky } from "../src/villa-map/assets.js";
import { createPorkyStandIn, createPorkyModel } from "../src/villa-map/porky-models.js";

test("stand-ins share geometry while preserving independent placement and the original shape", () => {
  const materials = createMaterials();
  const first = createPorkyStandIn(materials, { scale: 0.58 });
  const second = createPorkyStandIn(materials, { scale: 0.72 });
  const original = createPorky(materials, { scale: 0.58 });
  assert.deepEqual(new THREE.Box3().setFromObject(first), new THREE.Box3().setFromObject(original));
  assert.equal(first.children.length, original.children.length);
  first.children.forEach((mesh, i) => {
    assert.notEqual(mesh, second.children[i]);
    assert.equal(mesh.geometry, second.children[i].geometry);
    assert.equal(mesh.material, second.children[i].material);
    assert.deepEqual(mesh.geometry.attributes.position.array, original.children[i].geometry.attributes.position.array);
    assert.deepEqual(mesh.position, original.children[i].position);
    assert.deepEqual(mesh.quaternion.toArray(), original.children[i].quaternion.toArray());
    assert.deepEqual(mesh.scale, original.children[i].scale);
  });
  first.position.x = 9;
  first.children[0].position.y = 99;
  first.clear();
  assert.equal(second.position.x, 0);
  assert.equal(second.scale.x, 0.72);
  assert.equal(second.children[0].position.y, 0.74);
  assert.equal(createPorkyStandIn(materials).children[0].position.y, 0.74);
});

test("microphones and material palettes cannot leak between stand-in templates", () => {
  const materials = createMaterials();
  const normal = createPorkyStandIn(materials);
  const mic = createPorkyStandIn(materials, { mic: true });
  const micAgain = createPorkyStandIn(materials, { mic: true, scale: 0.5 });
  const otherPalette = createMaterials();
  otherPalette.pig.color.set("#00ff00");
  const other = createPorkyStandIn(otherPalette);
  assert.equal(mic.children.length, normal.children.length + 2);
  assert.equal(mic.children.at(-1).geometry, micAgain.children.at(-1).geometry);
  assert.notEqual(normal.children[0].material, other.children[0].material);
  assert.equal(normal.children[0].material.color.getHexString(), "ffa8bd");
  assert.equal(other.children[0].material.color.getHexString(), "00ff00");
});

test("deferred streamed residents retain their original scale and usable stand-in before loading", () => {
  const starts = [], materials = createMaterials();
  const hooks = { defer: start => starts.push(start) };
  const first = createPorkyModel(materials, { variant: "daigua", fallbackScale: 0.42 }, hooks);
  const second = createPorkyModel(materials, { variant: "daigua" }, hooks);
  assert.equal(starts.length, 2);
  assert.equal(first.userData.assetState, "loading");
  assert.equal(first.children[0].name, "porky-procedural-fallback");
  assert.equal(first.children[0].scale.x, 0.42);
  assert.equal(second.children[0].scale.x, 0.72);
  first.clear();
  assert.equal(second.children[0].children.length, createPorkyStandIn(materials).children.length);
});
