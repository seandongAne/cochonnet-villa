import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PORKY_MODEL_VARIANTS } from '../src/villa-map/porky-models.js';
import { PORKY_PLACEMENTS } from '../src/villa-map/placements.js';
import { createVillaWorld, collidesWithWorld } from '../src/villa-map/world.js';
import { VILLAGE_SITES } from '../src/villa-map/surroundings.js';
import {
  BIRTHDAY_HAT_FITS, BIRTHDAY_TABLE, createBirthdayHat, fitBirthdayHat,
  createBirthdayDecorations, createVillageBirthdayHats, installBirthdayColliders, disposeParty,
} from '../src/villa-map/birthday-party.js';

test('every resident model and every placed resident has an explicit birthday crown fit', () => {
  assert.deepEqual(Object.keys(BIRTHDAY_HAT_FITS).sort(), Object.keys(PORKY_MODEL_VARIANTS).sort());
  for (const p of PORKY_PLACEMENTS) {
    const fit = BIRTHDAY_HAT_FITS[p.variant];
    assert.ok(Object.values(fit).every(Number.isFinite), p.id);
    assert.ok(fit.size > .4 && fit.size < 1, p.id);
  }
});

test('birthday hat follows the selected head surface, independent of world placement', () => {
  const root = new THREE.Group();
  root.position.set(-7, -40, 18); root.rotation.y = 1.3;
  const model = new THREE.Mesh(new THREE.BoxGeometry(2, .2, 2), new THREE.MeshBasicMaterial());
  model.position.y = .8; root.add(model);
  root.userData.assetState = 'ready';
  const hat = createBirthdayHat(2);
  fitBirthdayHat(hat, root, { variant: 'cozy-checker-piglet' });
  assert.ok(Math.abs(hat.position.y - (.9 - .025 * 1.15)) < 1e-6);
  assert.equal(hat.userData.assetState, 'ready');
  const headY = hat.position.y;
  model.position.y += .25;
  fitBirthdayHat(hat, root, { variant: 'cozy-checker-piglet' });
  assert.ok(Math.abs(hat.position.y - headY - .25) < 1e-6);
  for (const p of PORKY_PLACEMENTS) {
    fitBirthdayHat(hat, root, p, 'fallback');
    assert.ok(hat.position.toArray().every(Number.isFinite), p.id);
    assert.ok(hat.scale.x > 0);
  }
  disposeParty(hat); model.geometry.dispose(); model.material.dispose();
});

test('a crown whose surface ray misses the model rests on its top edge instead of throwing', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const root = new THREE.Group();
  root.position.set(3, -40, -2); root.rotation.y = .7;
  // The mesh sits far from the authored crown anchor, as a replaced GLB might.
  const model = new THREE.Mesh(new THREE.BoxGeometry(.4, .2, .4), new THREE.MeshBasicMaterial());
  model.position.set(4, .8, 0); root.add(model);
  root.userData.assetState = 'ready';
  const hat = createBirthdayHat(1);
  const height = PORKY_MODEL_VARIANTS['cozy-checker-piglet'].height;
  assert.doesNotThrow(() => fitBirthdayHat(hat, root, { variant: 'cozy-checker-piglet' }));
  assert.ok(Math.abs(hat.position.y - (.9 - .025 * height)) < 1e-6, 'rests on the model top in group coordinates');
  assert.ok(hat.position.toArray().every(Number.isFinite) && hat.scale.x > 0);
  assert.equal(hat.userData.fit, 'bounds');
  assert.equal(hat.userData.assetState, 'ready');
  fitBirthdayHat(hat, root, { variant: 'cozy-checker-piglet' });
  assert.equal(warn.mock.callCount(), 1, 'warns once per variant');
  model.position.set(0, .8, 0);
  fitBirthdayHat(hat, root, { variant: 'cozy-checker-piglet' });
  assert.equal(hat.userData.fit, 'surface', 'a hit returns to surface fitting');
  assert.equal(fitBirthdayHat(hat, root, { variant: 'cozy-checker-piglet' }, 'loading').userData.fit, 'fallback');
  disposeParty(hat); model.geometry.dispose(); model.material.dispose();
});

test('birthday table collision is temporary, ground-only, and leaves the arrival route clear', () => {
  const world = createVillaWorld();
  const baseline = [...world.colliders];
  const { x, z } = BIRTHDAY_TABLE;
  assert.equal(collidesWithWorld({ x, y: 1.6, z }, world), false);
  const remove = installBirthdayColliders(world);
  assert.equal(collidesWithWorld({ x, y: 1.6, z }, world), true);
  assert.equal(collidesWithWorld({ x: 2, y: 1.6, z }, world), false);
  assert.equal(collidesWithWorld({ x, y: -38.4, z }, world), collidesWithWorld({ x, y: -38.4, z }, { ...world, colliders: baseline }));
  const unrelated = { id: 'later-collider' }; world.colliders.push(unrelated);
  remove(); remove();
  assert.deepEqual(world.colliders, [...baseline, unrelated]);
});

test('birthday props stay within a small draw and geometry budget and all village pigs get hats', () => {
  const decorations = createBirthdayDecorations();
  assert.equal(decorations.isMesh, true);
  assert.ok(decorations.geometry.attributes.position.count / 3 < 100000);
  const village = createVillageBirthdayHats();
  let hats = 0;
  village.traverse(o => { if (o.name === 'birthday-hat') hats++; });
  assert.equal(hats, VILLAGE_SITES.reduce((n, site) => n + site.pigs.length, 0));
  const hat = createBirthdayHat();
  assert.ok(hat.geometry.attributes.position.count / 3 < 4500);
  for (const root of [decorations, village, hat]) {
    root.traverse(o => {
      if (!o.isMesh) return;
      assert.equal(o.material.transparent, false);
      assert.equal(o.material.map, null);
      o.geometry.computeBoundingBox();
      assert.ok([...o.geometry.boundingBox.min, ...o.geometry.boundingBox.max].every(Number.isFinite));
    });
    disposeParty(root);
  }
});
