import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createDogHouse, createMaterials } from '../src/villa-map/assets.js';

test('dog house has an open arched doorway and a sheltered interior', () => {
  const house = createDogHouse(createMaterials());
  house.updateMatrixWorld(true);
  const ray = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, -2), new THREE.Vector3(0, 0, 1));
  for (const [x, y] of [[0, .3], [-.35, .6], [.35, .6], [0, 1.15]]) {
    const hit = ray(x, y).intersectObject(house, true)[0];
    assert.equal(hit.object.name, 'dog-house-back', 'door reveals the inside rear wall');
    assert.ok(hit.point.z > .9, 'no opaque body or decal seals the entrance');
  }
  assert.equal(ray(.85, .8).intersectObject(house, true)[0].object.name, 'dog-house-front');
  const floor = new THREE.Raycaster(new THREE.Vector3(0, .6, 0), new THREE.Vector3(0, -1, 0)).intersectObject(house, true)[0];
  assert.equal(floor.object.name, 'dog-house-floor');
  assert.ok(Math.abs(floor.point.y - .12) < 1e-6);
});

test('dog house roof descends from one ridge and stays within a modest overhang', () => {
  const house = createDogHouse(createMaterials());
  house.updateMatrixWorld(true);
  const roofs = house.children.filter(m => m.name.startsWith('dog-house-roof-'));
  assert.equal(roofs.length, 2);
  const roofParts = [...roofs, house.getObjectByName('dog-house-ridge')];
  for (let x = -1.35; x <= 1.35; x += .05) {
    const hits = new THREE.Raycaster(new THREE.Vector3(x, 4, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(roofParts);
    assert.ok(hits.length, 'continuous roof coverage, including the ridge');
    const expected = 2.18 - Math.abs(x) * .5 + .14 / 2 / Math.cos(Math.atan(.5));
    if (Math.abs(x) > .09) {
      assert.ok(Math.abs(hits[0].point.y - expected) < 1e-5, 'each half follows its own slope without crossing the other');
    } else {
      assert.ok(hits[0].point.y >= 2.18 && hits[0].point.y < 2.3, 'ridge cap closes the meeting edge');
    }
  }
  const bounds = new THREE.Box3().setFromObject(house);
  assert.ok(bounds.min.x > -1.5 && bounds.max.x < 1.5, 'roof no longer spans almost twice the wall width');
  assert.ok(bounds.max.y < 2.4);
  assert.ok(Math.abs(bounds.min.y) < 1e-7, 'kennel sits on the ground');
});
