import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { SHOWCASE_MODEL, SHOWCASE_SIZE, prepareShowcaseModel, showcasePose } from '../src/little-universe/hangar-showcase.js';

test('showcase fits and grounds the exhibit without changing shared geometry or original PBR maps', () => {
  const source = new THREE.Group();
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture, normalMap: texture, roughnessMap: texture, metalnessMap: texture });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 1), material);
  mesh.position.set(4, 1, -2); source.add(mesh);
  const prepared = prepareShowcaseModel(source);
  const fittedMesh = prepared.root.children[0].children[0];
  const bounds = new THREE.Box3().setFromObject(prepared.root);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(bounds.min.y) < 1e-8);
  assert.ok(Math.abs(bounds.getCenter(new THREE.Vector3()).x) < 1e-8);
  size.toArray().forEach((v, i) => assert.ok(v <= SHOWCASE_SIZE[i] + 1e-8));
  assert.equal(fittedMesh.geometry, mesh.geometry);
  assert.notEqual(fittedMesh.material, material);
  assert.equal(fittedMesh.material.map, texture);
  assert.equal(fittedMesh.material.normalMap, texture);
  assert.equal(fittedMesh.material.roughnessMap, texture);
  assert.equal(fittedMesh.material.metalnessMap, texture);
  assert.deepEqual(mesh.position.toArray(), [4, 1, -2]);
  let materialsDisposed = 0, textureDisposed = 0, geometryDisposed = 0;
  fittedMesh.material.addEventListener('dispose', () => materialsDisposed++);
  texture.addEventListener('dispose', () => textureDisposed++);
  mesh.geometry.addEventListener('dispose', () => geometryDisposed++);
  prepared.dispose(); prepared.dispose();
  assert.equal(materialsDisposed, 1); assert.equal(textureDisposed, 0); assert.equal(geometryDisposed, 0);
});

test('portrait camera pulls back while keeping each preset target and direction', () => {
  for (const view of ['hero', 'front', 'detail']) {
    const desktop = showcasePose(view, 16 / 9), mobile = showcasePose(view, 390 / 844);
    assert.deepEqual(mobile.target.toArray(), desktop.target.toArray());
    assert.ok(mobile.position.distanceTo(mobile.target) > desktop.position.distanceTo(desktop.target));
    assert.ok(mobile.position.clone().sub(mobile.target).normalize().distanceTo(desktop.position.clone().sub(desktop.target).normalize()) < 1e-8);
  }
});

test('the one-exhibit source is the existing local optimized GLB with all three PBR textures', () => {
  assert.equal(SHOWCASE_MODEL, 'reborns-gundam');
  const bytes = readFileSync(new URL(`../public/little-universe/models/${SHOWCASE_MODEL}.glb`, import.meta.url));
  assert.ok(bytes.length < 1024 * 1024);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.ok(gltf.materials[0].pbrMetallicRoughness.baseColorTexture);
  assert.ok(gltf.materials[0].pbrMetallicRoughness.metallicRoughnessTexture);
  assert.ok(gltf.materials[0].normalTexture);
});
