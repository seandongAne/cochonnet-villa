import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Box3, Vector3 } from 'three';
import { createFlowers, disposeMiniature } from '../src/little-universe/planet.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAMP_PROPS, CAMP_PIG_POSITION, CAMP_BAICAI_POSITION, composeCampingProps, disposeCampingProps } from '../src/little-universe/camping.js';

const bytes = fs.readFileSync(new URL('../public/little-universe/camping/camping-props.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const provenance = JSON.parse(fs.readFileSync(new URL('../public/little-universe/camping/sources.json', import.meta.url)));

// Parse original geometry without browser-owned image decoding for spatial tests.
async function geometrySource() {
  const clean = structuredClone(json);
  for (const material of clean.materials) {
    delete material.pbrMetallicRoughness.baseColorTexture;
    delete material.emissiveTexture;
  }
  delete clean.images; delete clean.textures;
  let encoded = Buffer.from(JSON.stringify(clean));
  encoded = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 32)]);
  const binaryChunk = bytes.subarray(20 + jsonLength);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + encoded.length + binaryChunk.length, 8); header.writeUInt32LE(encoded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const glb = Buffer.concat([header, encoded, binaryChunk]);
  return (await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '')).scene;
}

test('camping subset keeps original named props and embedded palette within a 650 KB budget', () => {
  assert.equal(provenance.individualProps, 85); assert.equal(provenance.allPropsNodes, 85);
  assert.equal(provenance.archiveAllPropsIdentical, true);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.outputSha256);
  assert.ok(bytes.length < 650_000);
  // The original pine meshes stay in the source pack; the scene now uses round trees.
  assert.equal(json.nodes.length, new Set([...CAMP_PROPS.map(item => item.asset), 'SM_Pine_Tree_Tall', 'SM_Pine_Tree_Small']).size);
  for (const item of CAMP_PROPS) assert.ok(json.nodes.some(node => node.name === item.asset));
  assert.equal(json.images.length, 1); assert.equal(json.images[0].mimeType, 'image/png');
  assert.ok(json.images[0].bufferView >= 0);
  assert.equal(json.materials[0].pbrMetallicRoughness.baseColorTexture.texCoord, 1);
  assert.equal(json.materials[0].pbrMetallicRoughness.roughnessFactor, .75);
  assert.equal(json.materials[1].name, 'M_Palette_Emissive');
});

test('real camping geometry fits the clearing, shares resources and animates flames separately', async () => {
  const source = await geometrySource(); const camp = composeCampingProps(source);
  const bounds = new Box3().setFromObject(camp);
  assert.ok(bounds.min.x >= -.8 && bounds.max.x <= .8, `X: ${bounds.min.x}, ${bounds.max.x}`);
  assert.ok(bounds.min.z >= -.8 && bounds.max.z <= .8, `Z: ${bounds.min.z}, ${bounds.max.z}`);
  assert.ok(bounds.min.y >= .064 && bounds.max.y < 1.5);
  const flames = camp.getObjectByName('campfire-flames'); assert.ok(flames?.isMesh);
  const fire = camp.getObjectByName('campfire');
  const before = new Box3().setFromObject(fire);
  flames.scale.y = 1.09;
  assert.ok(new Box3().setFromObject(fire).min.distanceTo(before.min) < 1e-8, 'logs and stones do not scale');
  let draws = 0; const materials = new Set();
  camp.traverse(mesh => { if (mesh.isMesh) { draws++; materials.add(mesh.material); } });
  assert.ok(draws < 45); assert.equal(materials.size, 2);
  let sourceDisposed = false;
  source.traverse(mesh => { if (mesh.isMesh) mesh.geometry.addEventListener('dispose', () => { sourceDisposed = true; }); });
  disposeCampingProps(camp); assert.equal(sourceDisposed, false, 'cached source remains reusable');
});


test('the full camper envelopes stay clear of every prop, including foreground grass', async () => {
  const camp = composeCampingProps(await geometrySource());
  for (const [position, size] of [[CAMP_PIG_POSITION, [.24, .3, .23]], [CAMP_BAICAI_POSITION, [.24, .29, .23]]]) {
    // Include breathing and leaf sway, not just the still model's footprint.
    const envelope = new Box3().setFromCenterAndSize(
      new Vector3(position[0], position[1] + size[1] / 2, position[2]),
      new Vector3(size[0] + .01, size[1] + .01, size[2] + .01));
    for (const prop of camp.children) assert.equal(envelope.intersectsBox(new Box3().setFromObject(prop)), false, prop.name);
  }
  disposeCampingProps(camp);
});


test('visited campsite flowers never grow through campers or the firewood stack', async () => {
  const camp = composeCampingProps(await geometrySource());
  const obstacles = [new Box3().setFromObject(camp.getObjectByName('wood-pile'))];
  for (const position of [CAMP_PIG_POSITION, CAMP_BAICAI_POSITION]) {
    obstacles.push(new Box3().setFromCenterAndSize(
      new Vector3(position[0], position[1] + .15, position[2]), new Vector3(.25, .31, .24)));
  }
  const flowers = createFlowers('camping');
  // Check the visited reward throughout its growth, as well as reduced-motion's full size.
  for (const scale of [.001, .25, .5, .75, 1]) {
    flowers.scale.setScalar(scale);
    flowers.updateMatrixWorld(true);
    flowers.traverse(mesh => {
      if (!mesh.isMesh) return;
      const bounds = new Box3().setFromObject(mesh);
      for (const obstacle of obstacles) assert.equal(bounds.intersectsBox(obstacle), false, `flower clearance at scale ${scale}`);
    });
  }
  disposeMiniature(flowers);
  disposeCampingProps(camp);
  const otherFlowers = createFlowers('music');
  assert.equal(new Box3().setFromObject(otherFlowers).isEmpty(), false, 'other destinations retain their reward flowers');
  disposeMiniature(otherFlowers);
});
