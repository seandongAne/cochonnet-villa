import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createMaterials, createPorky } from "../src/villa-map/assets.js";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import {
  MEADOW_TREE_COUNT,
  SCENERY_MIN_CLEARANCE,
  SKY_DOME_RADIUS,
  SKY_TIME_WRAP_SECONDS,
  SUN_POSITION,
  SURROUNDINGS_CAMERA_FAR,
  SURROUNDINGS_FOG,
  TERRAIN_FLAT_MARGIN,
  TERRAIN_FLAT_Y,
  TERRAIN_RADIUS,
  VILLAGE_SITES,
  createDaySky,
  createHorizonTerrain,
  createMeadowTrees,
  createVillage,
  distanceOutsideRect,
  terrainHeightAt
} from "../src/villa-map/surroundings.js";
import { createVillaWorld } from "../src/villa-map/world.js";

const bounds = createVillaWorld().bounds;

function readSource(relative) {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

function clearance(x, z) {
  return distanceOutsideRect(x, z, bounds);
}

test("terrain is perfectly flat across the walkable bounds plus margin and only rises beyond it", () => {
  for (let x = bounds.minX - TERRAIN_FLAT_MARGIN; x <= bounds.maxX + TERRAIN_FLAT_MARGIN; x += 1.5) {
    for (let z = bounds.minZ - TERRAIN_FLAT_MARGIN; z <= bounds.maxZ + TERRAIN_FLAT_MARGIN; z += 1.5) {
      assert.equal(terrainHeightAt(x, z), TERRAIN_FLAT_Y, `(${x}, ${z}) must stay on the walkable plane`);
    }
  }
  const far = [];
  for (let angle = 0; angle < 360; angle += 10) {
    const rad = (angle * Math.PI) / 180;
    far.push(terrainHeightAt(Math.cos(rad) * 200, Math.sin(rad) * 200));
  }
  assert.ok(Math.max(...far) > 20, "a mountain rim closes the horizon");
  assert.ok(Math.min(...far) >= TERRAIN_FLAT_Y, "terrain never dips below the meadow");
  assert.equal(terrainHeightAt(120, 120), terrainHeightAt(120, 120), "deterministic");
});

test("horizon terrain is one vertex-coloured disc that keeps the play area level", () => {
  const terrain = createHorizonTerrain();
  assert.equal(terrain.castShadow, false, "scenery must not enter the cached sun shadow");
  assert.equal(terrain.receiveShadow, true);
  assert.equal(terrain.material.vertexColors, true);
  const positions = terrain.geometry.attributes.position;
  assert.ok(terrain.geometry.attributes.color, "meadow shading is baked per vertex");
  let radius = 0;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    if (distanceOutsideRect(x, z, bounds) <= TERRAIN_FLAT_MARGIN) {
      assert.ok(Math.abs(y - TERRAIN_FLAT_Y) < 1e-6, `vertex (${x}, ${z}) must stay on the walkable plane`);
    }
    radius = Math.max(radius, Math.hypot(x - 2, z - 1));
  }
  assert.ok(Math.abs(radius - TERRAIN_RADIUS) < 0.01, "the disc reaches the declared radius");
  assert.ok(positions.count < 12000, "terrain stays a light single draw");
});

test("day sky is a camera-riding, fog-free backdrop drawn before the observatory aperture", () => {
  const sky = createDaySky();
  assert.equal(sky.material.side, THREE.BackSide);
  assert.equal(sky.material.depthWrite, false);
  assert.equal(sky.material.fog, false);
  assert.equal(sky.frustumCulled, false);
  assert.ok(sky.renderOrder < 900, "must draw before the mushroom sky's stencil aperture (900)");
  assert.ok(SKY_DOME_RADIUS < SURROUNDINGS_CAMERA_FAR, "the dome must fit inside the far plane");
  assert.ok(SURROUNDINGS_FOG.far <= SURROUNDINGS_CAMERA_FAR);
  assert.ok(SURROUNDINGS_FOG.far > 150, "the far hills must still be visible as hazy silhouettes");
  const sun = sky.material.uniforms.uSunDirection.value;
  const expected = new THREE.Vector3(SUN_POSITION.x, SUN_POSITION.y, SUN_POSITION.z).normalize();
  assert.ok(sun.distanceTo(expected) < 1e-6, "sun disc matches the directional light");
  sky.userData.update(SKY_TIME_WRAP_SECONDS + 12.5, new THREE.Vector3(30, 1.6, -20));
  assert.deepEqual(sky.position.toArray(), [30, 1.6, -20]);
  assert.ok(Math.abs(sky.material.uniforms.uTime.value - 12.5) < 1e-9, "shader time wraps for precision");
  for (const reserved of ["filter", "input", "output", "active", "noise("]) {
    assert.doesNotMatch(sky.material.fragmentShader, new RegExp(`\\b${reserved.replace("(", "\\(")}`));
  }
});

test("villagers' hamlet and farms sit on the terrain, well outside the walkable bounds, in two draws", () => {
  const village = createVillage();
  assert.deepEqual(village.children.map((child) => child.name), ["village-buildings", "village-pigs"]);
  for (const mesh of village.children) {
    assert.equal(mesh.castShadow, false);
    assert.equal(mesh.material.vertexColors, true);
    assert.equal(mesh.geometry.index, null, "merged non-indexed geometry");
  }
  for (const site of VILLAGE_SITES) {
    assert.ok(Math.hypot(site.x, site.z) < SURROUNDINGS_FOG.far - 40, `${site.id} must be visible through the fog`);
  }
  const anchors = village.userData.anchors;
  assert.ok(anchors.length > 20);
  village.updateMatrixWorld(true);
  const buildings = village.getObjectByName("village-buildings");
  const pigs = village.getObjectByName("village-pigs");
  const down = new THREE.Vector3(0, -1, 0);
  for (const anchor of anchors) {
    assert.ok(
      clearance(anchor.x, anchor.z) >= SCENERY_MIN_CLEARANCE,
      `${anchor.kind} at (${anchor.x}, ${anchor.z}) is inside the scenery clearance`
    );
    const ground = terrainHeightAt(anchor.x, anchor.z);
    const target = anchor.kind === "pig" ? pigs : buildings;
    const ray = new THREE.Raycaster(new THREE.Vector3(anchor.x, ground + 60, anchor.z), down);
    const hit = ray.intersectObject(target, false)[0];
    assert.ok(hit, `${anchor.kind} at (${anchor.x}, ${anchor.z}) has geometry`);
    const above = hit.point.y - ground;
    const limit = anchor.kind === "cottage" ? [2.5, 8] : anchor.kind === "pig" ? [0.5, 1.6] : [0.2, 2.5];
    assert.ok(above >= limit[0] && above <= limit[1], `${anchor.kind} top sits ${above.toFixed(2)} m above the ground`);
  }
});

test("tree line is deterministic, instanced, and keeps clear of the meadow, lane and village", () => {
  const trees = createMeadowTrees();
  const again = createMeadowTrees();
  assert.deepEqual(trees.userData.trees, again.userData.trees, "same seed, same forest");
  assert.equal(trees.userData.trees.length, MEADOW_TREE_COUNT);
  assert.deepEqual(trees.children.map((child) => child.isInstancedMesh), [true, true]);
  for (const mesh of trees.children) {
    assert.equal(mesh.count, MEADOW_TREE_COUNT);
    assert.equal(mesh.castShadow, false);
    assert.ok(mesh.boundingSphere, "instanced bounds computed for frustum culling");
  }
  for (const tree of trees.userData.trees) {
    assert.ok(clearance(tree.x, tree.z) >= SCENERY_MIN_CLEARANCE);
    assert.ok(Math.abs(tree.y - terrainHeightAt(tree.x, tree.z)) < 1e-9, "trees are seated on the terrain");
    for (const site of VILLAGE_SITES) {
      assert.ok(Math.hypot(tree.x - site.x, tree.z - site.z) >= site.clearance, "no trees through the hamlet");
    }
  }
});

test("Scene and Canvas consume the surroundings contract", () => {
  const scene = readSource("src/villa-map/react/Scene.jsx");
  assert.match(scene, /<color attach="background" args=\{\[SURROUNDINGS_FOG\.color\]\} \/>/);
  assert.match(scene, /args=\{\[SURROUNDINGS_FOG\.color, SURROUNDINGS_FOG\.near, SURROUNDINGS_FOG\.far\]\}/);
  assert.match(scene, /position=\{\[SUN_POSITION\.x, SUN_POSITION\.y, SUN_POSITION\.z\]\}/);
  for (const name of ["terrain", "village", "meadowTrees"]) {
    assert.match(scene, new RegExp(`<primitive object=\\{built\\.${name}\\} />`));
  }
  assert.match(scene, /<DaySky sky=\{built\.daySky\} \/>/);
  assert.doesNotMatch(scene, /materials\.outsideGrass|materials\.grass\)/, "the old two-tone grass slabs are gone");
  const map = readSource("src/villa-map/react/VillaMap.jsx");
  assert.match(map, /far: SURROUNDINGS_CAMERA_FAR,/);
});


test("village instancing retains every original pig vertex, normal, color and pose", () => {
  const village = createVillage();
  const pigs = village.getObjectByName("village-pigs");
  assert.equal(pigs.isInstancedMesh, true);
  assert.equal(pigs.count, 13);
  assert.ok(pigs.boundingSphere && pigs.boundingBox, "all instances participate in culling");
  assert.equal(pigs.material.roughness, 0.82);
  const bytes = Object.values(pigs.geometry.attributes).reduce((sum, attr) => sum + attr.array.byteLength, 0)
    + pigs.instanceMatrix.array.byteLength;
  assert.ok(bytes < 1_000_000, "one full-detail pig plus poses replaces 12.8 MB of duplicate buffers");
  const original = createPorky(createMaterials(), { scale: 0.58 });
  original.updateMatrixWorld(true);
  const expected = [];
  original.traverse(child => {
    if (!child.isMesh) return;
    const geometry = child.geometry.clone().applyMatrix4(child.matrixWorld);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    expected.push({ geometry: flat, color: child.material.color });
  });
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), actual = new THREE.Vector3();
  const normal = new THREE.Vector3(), actualNormal = new THREE.Vector3();
  let instance = 0;
  for (const site of VILLAGE_SITES) for (const pig of site.pigs) {
    pigs.getMatrixAt(instance++, matrix);
    const x = site.x + pig.x, z = site.z + pig.z;
    const pose = new THREE.Matrix4().makeTranslation(x, terrainHeightAt(x, z) - 0.02, z)
      .multiply(new THREE.Matrix4().makeRotationY(pig.yaw));
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(pose);
    const actualNormalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    let index = 0;
    for (const part of expected) for (let i = 0; i < part.geometry.attributes.position.count; i++, index++) {
      position.fromBufferAttribute(part.geometry.attributes.position, i).applyMatrix4(pose);
      actual.fromBufferAttribute(pigs.geometry.attributes.position, index).applyMatrix4(matrix);
      assert.ok(position.distanceTo(actual) < 0.00001, "world positions stay within 0.01 mm");
      normal.fromBufferAttribute(part.geometry.attributes.normal, i).applyNormalMatrix(normalMatrix);
      actualNormal.fromBufferAttribute(pigs.geometry.attributes.normal, index).applyNormalMatrix(actualNormalMatrix);
      assert.ok(normal.distanceTo(actualNormal) < 0.000001);
      for (const [channel, value] of [[0, part.color.r], [1, part.color.g], [2, part.color.b]]) {
        assert.ok(Math.abs(pigs.geometry.attributes.color.array[index * 3 + channel] - value) < 0.000001);
      }
    }
    assert.equal(index, pigs.geometry.attributes.position.count);
  }
});

test("village buildings keep the pre-optimization geometry and palette byte for byte", () => {
  const geometry = createVillage().getObjectByName("village-buildings").geometry;
  const hashes = {
    position: "895686ec58e301261e5f657a69477ea33157ed5cda19503003602511fee8dce3",
    normal: "8c779b1289b403d208edc044fe365e485b3bf51a2bfffc23c08d2b389a24d73b",
    color: "e862eda80919c88ec7ee7e646ec119a3067b438730f029d0862ed9beb8cb4de0"
  };
  for (const [name, hash] of Object.entries(hashes)) {
    assert.equal(createHash("sha256").update(new Uint8Array(geometry.attributes[name].array.buffer)).digest("hex"), hash);
  }
});
