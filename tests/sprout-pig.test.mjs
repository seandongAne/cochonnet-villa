import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSproutPigStudy } from '../src/little-universe/sprout-pig.js';
import { disposeMiniature } from '../src/little-universe/miniature.js';

test('sprout-pig study exports a self-contained GLB with the authored full-volume geometry', async () => {
  const bytes = await readFile(new URL('../public/birthday-characters/sprout-pig-study-v1.glb', import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.ok(!json.images?.length, 'no reference image is substituted for geometry');
  assert.ok(json.buffers.every(b => !b.uri), 'no external files are required');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const { scene } = await new GLTFLoader().parseAsync(buffer, '');
  const source = createSproutPigStudy();
  try {
    const sourceBounds = new Box3().setFromObject(source), bounds = new Box3().setFromObject(scene);
    assert.ok(bounds.min.distanceTo(sourceBounds.min) < 1e-6);
    assert.ok(bounds.max.distanceTo(sourceBounds.max) < 1e-6);
    const size = bounds.getSize(new Vector3());
    assert.ok(size.x > .7 && size.y > .9 && size.z > .5, 'full 3D volume is preserved');
    for (const name of ['round-cheek-head', 'snout-with-recessed-nostrils', 'open-smile', 'drooping-ear--1', 'drooping-ear-1', 'sprout-left-leaf', 'sprout-right-leaf', 'curled-tail-proposal']) {
      assert.ok(scene.getObjectByName(name), `${name} survives GLB export`);
    }
    scene.traverse(object => {
      if (!object.isMesh) return;
      for (const attribute of Object.values(object.geometry.attributes)) assert.ok([...attribute.array].every(Number.isFinite));
    });
  } finally { disposeMiniature(source); disposeMiniature(scene); }
});
