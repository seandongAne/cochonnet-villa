import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createVillaWorld } from '../src/villa-map/world.js';
import {
  COURTYARD_PATHS, createCourtyardPaths, createGarden, createLawnMap,
  gardenPlanting, isGardenPointClear
} from '../src/villa-map/garden-finishes.js';

const world = createVillaWorld();

test('garden stays clear of paths, residents, solid props and the mushroom portal', () => {
  const plants = gardenPlanting(world);
  assert.deepEqual(plants, gardenPlanting(world), 'stable planting on every visit');
  assert.ok(plants.length > 200 && plants.length < 650, 'bounded near-field detail');
  for (const p of plants) {
    assert.equal(isGardenPointClear(p.x, p.z, world), true);
    for (const path of COURTYARD_PATHS) {
      assert.ok(Math.abs(p.x - path.x) >= path.width / 2 + .35
        || Math.abs(p.z - path.z) >= path.depth / 2 + .35, 'leaves stay off the stone path');
    }
  }
  for (const [x, z] of [[2, 18], [0, 0], [-6, 24.2], [-6, 28], [-8.5, 8.5], [5.5, 6]]) {
    assert.equal(isGardenPointClear(x, z, world), false, `protected approach/prop at ${x},${z}`);
  }
  const garden = createGarden(world);
  assert.equal(garden.children.length, 3, 'all plants use three instanced draws');
  let triangles = 0;
  for (const mesh of garden.children) {
    assert.equal(mesh.isInstancedMesh, true);
    assert.equal(mesh.castShadow, false);
    assert.ok(mesh.boundingSphere && Number.isFinite(mesh.boundingSphere.radius));
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * mesh.count;
  }
  assert.ok(triangles < 100000, 'no high-poly flower field');
  garden.updateMatrixWorld(true);
  assert.ok(new THREE.Box3().setFromObject(garden).max.y < .8, 'planting stays below the view and interaction markers');
});

test('paving preserves the old path envelope, height and continuous world-scale UVs', () => {
  const paths = createCourtyardPaths();
  paths.updateMatrixWorld(true);
  for (let i = 0; i < COURTYARD_PATHS.length; i++) {
    const mesh = paths.children[i], p = COURTYARD_PATHS[i];
    const bounds = new THREE.Box3().setFromObject(mesh);
    assert.ok(Math.abs(bounds.max.x - (p.x + p.width / 2)) < 1e-6);
    assert.ok(Math.abs(bounds.max.z - (p.z + p.depth / 2)) < 1e-6);
    assert.ok(Math.abs(bounds.max.y - (p.y + .1)) < 1e-6);
    const vertices = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
    for (let v = 0; v < vertices.count; v++) {
      assert.ok(Math.abs(uv.getX(v) - (vertices.getX(v) + p.x) / 2.8) < 1e-6);
      assert.ok(Math.abs(uv.getY(v) - (vertices.getZ(v) + p.z) / 2.8) < 1e-6);
    }
    assert.equal(mesh.material.map.colorSpace, THREE.SRGBColorSpace);
    assert.equal(mesh.material.bumpMap.colorSpace, THREE.NoColorSpace);
  }
  assert.equal(paths.children[0].material, paths.children[1].material, 'junction shares the exact same finish');
  const edging = paths.getObjectByName('courtyard-path-edging');
  assert.equal(edging.isInstancedMesh, true);
  assert.ok(new THREE.Box3().setFromObject(edging).max.y < .15, 'no new impassable kerb');
});

test('surface textures are deterministic, bounded and mipmapped for distant views', () => {
  const lawn = createLawnMap();
  assert.deepEqual(lawn.image.data, createLawnMap().image.data);
  assert.equal(lawn.image.width, 256);
  assert.equal(lawn.generateMipmaps, true);
  assert.equal(lawn.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(lawn.wrapS, THREE.RepeatWrapping);
  assert.equal(lawn.wrapT, THREE.RepeatWrapping);
});
