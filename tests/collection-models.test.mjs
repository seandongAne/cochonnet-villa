import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { collectionModels, fitCollectionModel } from '../src/little-universe/collection-models.js';
import { moveInRoom, ROOM_SPAWN } from '../src/little-universe/rooms.js';
import { fighterExhibits, FIGHTER_GALLERY_OBSTACLE } from '../src/little-universe/fighter-exhibits.js';

test('collection placement keeps three Gundams and six aircraft in Hangar and the centered SU-100 with three guns and a rose', () => {
  assert.deepEqual(collectionModels.filter(m => m.room === 'workshop').map(m => m.id), [...fighterExhibits.map(m => m.id), 'sd-gundam', 'reborns-gundam', 'zz-gundam-verka', 'cessna-172', 'diamond-da20-c1']);
  assert.deepEqual(collectionModels.filter(m => m.room === 'museum').map(m => m.id), ['cz-bren-2', 'm1887-short', 'm590', 'rose', 'ru-winter-su100']);
  assert.equal(collectionModels.find(m => m.id === 'ru-winter-su100').position[0], 0);
  assert.ok(moveInRoom(ROOM_SPAWN, 0, -20, 'museum')[2] >= 1.08, 'central plinth stops walking');
  assert.ok(moveInRoom([0, 1.8, 2.1], 0, -20, 'workshop')[2] >= .93, 'aircraft table stops walking');
  for (const x of [-1.65, 1.35]) {
    const aisle = moveInRoom([0, 1.8, 2.1], x, 0, 'workshop');
    assert.ok(moveInRoom(aisle, 0, -2.2, 'workshop')[2] < 0, 'aircraft side aisles remain accessible');
  }
  const side = moveInRoom(ROOM_SPAWN, 1.4, 0, 'museum');
  assert.ok(moveInRoom(side, 0, -1.5, 'museum')[2] < .5, 'both side aisles stay usable');
});

test('fitting handles rotated, offset assets without changing shared originals', () => {
  const source = new Group(); const mesh = new Mesh(new BoxGeometry(8, 2, 3), new MeshBasicMaterial()); mesh.position.set(13, -4, 8); source.add(mesh);
  const original = new Box3().setFromObject(source);
  const fitted = fitCollectionModel(source, [2, 1, .5], [0, Math.PI / 2, 0]);
  const box = new Box3().setFromObject(fitted); const size = box.getSize(new Vector3());
  assert.ok(size.x <= 2.00001 && size.y <= 1.00001 && size.z <= .50001);
  assert.ok(Math.abs(box.min.y) < 1e-6);
  assert.ok(Math.abs(box.getCenter(new Vector3()).x) < 1e-6);
  assert.deepEqual(new Box3().setFromObject(source), original);
  assert.throws(() => fitCollectionModel(new Group(), [1, 1, 1]), RangeError);
  mesh.geometry.dispose(); mesh.material.dispose();
});

test('all sixteen shipped assets have local embedded resources, pinned provenance and decodable geometry', async () => {
  const base = new URL('../public/little-universe/models/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('sources.json', base)));
  const fighterIds = fighterExhibits.map(m => m.id);
  assert.equal(manifest.models.length, 16);
  assert.ok(manifest.models.filter(m => m.id !== 'diamond-da20-c1' && !fighterIds.includes(m.id)).reduce((sum, m) => sum + m.runtimeBytes, 0) < 24 * 1024 * 1024);
  assert.ok(manifest.models.filter(m => fighterIds.includes(m.id)).reduce((sum, m) => sum + m.runtimeBytes, 0) < 12 * 1024 * 1024);
  assert.ok(manifest.models.reduce((sum, m) => sum + m.runtimeBytes, 0) < 44 * 1024 * 1024);
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  for (const record of manifest.models) {
    const bytes = fs.readFileSync(new URL(`${record.id}.glb`, base));
    assert.equal(bytes.length, record.runtimeBytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
    const length = bytes.readUInt32LE(12); const json = JSON.parse(bytes.subarray(20, 20 + length));
    for (const resource of [...(json.images || []), ...(json.buffers || [])]) assert.equal(resource.uri, undefined);
    if (fighterIds.includes(record.id)) {
      assert.equal(record.source, '4th+fighter.blend');
      assert.equal(record.materialSource, '4th-generation.rar');
      assert.equal(record.simplificationRatio, 1);
      assert.ok(bytes.length < 5 * 1024 * 1024);
      assert.equal(json.scenes.length, 1, 'only the requested aircraft scene is exported');
      assert.equal(json.meshes.length, 1, 'static parts are batched by original material');
      assert.ok(json.nodes.some(n => n.name === record.id));
      assert.ok(json.materials.some(m => m.alphaMode === 'BLEND'), 'original canopy alpha survives');
      assert.ok(json.materials.some(m => m.name.endsWith('-opaque-paint') && !m.alphaMode), 'paint writes depth separately from glass');
      for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
        if (json.materials[primitive.material].pbrMetallicRoughness.baseColorTexture) {
          assert.ok(primitive.attributes.TEXCOORD_0 !== undefined, 'original render UVs are present on textured parts');
        }
        assert.equal(primitive.attributes.TEXCOORD_1, undefined, 'parts share one normalized render UV layer');
      }
      for (const m of json.materials.filter(m => m.name !== 'Material.002')) {
        assert.ok(m.pbrMetallicRoughness.baseColorTexture, `${m.name} has its original paint`);
        assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture && m.normalTexture);
      }
      const triangles = json.meshes.reduce((sum, m) => sum + m.primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0), 0);
      assert.ok(triangles >= record.triangles * .99 && triangles <= record.triangles, 'no simplification; only degenerate triangles may be dropped');
      for (const image of json.images) {
        const view = json.bufferViews[image.bufferView];
        const offset = 28 + length + (view.byteOffset || 0);
        const metadata = await sharp(bytes.subarray(offset, offset + view.byteLength)).metadata();
        assert.ok(metadata.width <= 4096 && metadata.height <= 4096);
      }
      const body = json.materials.find(m => m.alphaMode === 'BLEND');
      const texture = json.textures[body.pbrMetallicRoughness.baseColorTexture.index];
      const atlas = json.images[texture.extensions.EXT_texture_webp.source];
      const view = json.bufferViews[atlas.bufferView];
      const offset = 28 + length + (view.byteOffset || 0);
      const metadata = await sharp(bytes.subarray(offset, offset + view.byteLength)).metadata();
      assert.equal(metadata.width, 4096, 'original 4K livery detail is retained');
      assert.equal(metadata.hasAlpha, true, 'source glass opacity is embedded in the livery atlas');
    }
    if (record.id === 'cessna-172') {
      assert.ok(bytes.length < 1024 * 1024, 'aircraft remains below 1 MiB');
      assert.ok(!json.nodes.some(n => n.name === 'CESSNA172-BASE_LOD1'));
      assert.ok(json.nodes.some(n => n.name === 'cessna-propeller'));
      assert.ok(json.materials.some(m => m.alphaMode === 'BLEND'), 'source glass remains transparent');
      for (const m of json.materials) {
        assert.ok(m.pbrMetallicRoughness.baseColorTexture);
        assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture);
        assert.ok(m.normalTexture && m.occlusionTexture);
      }
      for (const image of json.images) {
        const view = json.bufferViews[image.bufferView];
        const offset = 28 + length + (view.byteOffset || 0);
        const metadata = await sharp(bytes.subarray(offset, offset + view.byteLength)).metadata();
        assert.ok(metadata.width <= 2048 && metadata.height <= 2048);
      }
    }
    if (record.id === 'diamond-da20-c1') {
      assert.ok(bytes.length < 8 * 1024 * 1024, 'detailed DA20 remains below 8 MiB');
      assert.equal(record.source, 'Diamond+DA20C1.blend');
      assert.match(record.sourceSha256, /^[a-f0-9]{64}$/);
      assert.equal(json.skins?.length || 0, 0);
      assert.equal(json.animations?.length || 0, 0);
      assert.ok(json.materials.some(m => m.name === 'Window' && m.alphaMode === 'BLEND'));
      const body = json.materials.find(m => m.name === 'Plane Body');
      assert.ok(body.pbrMetallicRoughness.baseColorTexture && body.pbrMetallicRoughness.metallicRoughnessTexture && body.normalTexture);
      for (const image of json.images) {
        const view = json.bufferViews[image.bufferView];
        const offset = 28 + length + (view.byteOffset || 0);
        const metadata = await sharp(bytes.subarray(offset, offset + view.byteLength)).metadata();
        assert.ok(metadata.width <= 2048 && metadata.height <= 2048);
      }
    }
    if (record.id === 'm590') {
      assert.ok(json.images.length >= 6, 'both supplied PBR texture sets remain embedded');
      assert.ok(bytes.length < 2 * 1024 * 1024, 'textured M590 remains below 2 MiB');
      assert.equal(json.materials.length, 2);
      for (const material of json.materials) {
        assert.ok(material.pbrMetallicRoughness.baseColorTexture);
        assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture);
        assert.ok(material.normalTexture && material.occlusionTexture);
      }
      for (const image of json.images) {
        const view = json.bufferViews[image.bufferView];
        const offset = 28 + length + (view.byteOffset || 0);
        const metadata = await sharp(bytes.subarray(offset, offset + view.byteLength)).metadata();
        assert.ok(metadata.width <= 1024 && metadata.height <= 1024);
      }
      for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
        assert.ok(primitive.attributes.TEXCOORD_0 !== undefined, 'source UVs survive export');
      }
      assert.equal(record.materialSource, 'materials.rar');
      assert.match(record.materialSourceSha256, /^[a-f0-9]{64}$/);
      assert.equal(json.skins?.length || 0, 0, 'display derivative needs no skeleton');
      assert.equal(json.animations?.length || 0, 0);
      assert.ok(json.nodes.some(n => n.name === 'm590_stock'));
      assert.ok(!json.nodes.some(n => ['knoxx_stock_grip', '12gauge'].includes(n.name)));
      assert.equal(record.source, 'FINAL_M590_3.6.blend');
      assert.match(record.sourceSha256, /^[a-f0-9]{64}$/);
    }
    if (record.id === 'rose') assert.equal(json.images.length, 6, 'petal and stem PBR maps are retained');
    // Decode shipped geometry in Node; browsers separately validate image uploads.
    delete json.images; delete json.textures; delete json.materials;
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
    const encoded = Buffer.from(JSON.stringify(json)); const padded = Math.ceil(encoded.length / 4) * 4;
    const binary = bytes.subarray(20 + length); const out = Buffer.alloc(20 + padded + binary.length, 32);
    bytes.copy(out, 0, 0, 20); out.writeUInt32LE(out.length, 8); out.writeUInt32LE(padded, 12); encoded.copy(out, 20); binary.copy(out, 20 + padded);
    const gltf = await loader.parseAsync(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength), '');
    const fit = fitCollectionModel(gltf.scene, [2, 2, 2]); const box = new Box3().setFromObject(fit);
    assert.ok(!box.isEmpty() && box.min.y > -1e-5, record.id);
    if (fighterIds.includes(record.id)) {
      const item = fighterExhibits.find(m => m.id === record.id);
      const display = fitCollectionModel(gltf.scene, item.size, item.rotation);
      display.position.set(...item.position);
      const bounds = new Box3().setFromObject(display);
      const [x0, x1, z0, z1] = FIGHTER_GALLERY_OBSTACLE;
      assert.ok(bounds.min.x >= x0 && bounds.max.x <= x1 && bounds.min.z >= z0 && bounds.max.z <= z1);
      assert.ok(Math.abs(bounds.min.y - item.position[1]) < 1e-5, 'landing gear rests on its shelf');
      assert.ok(bounds.max.y < item.position[1] + .44, 'tiers cannot overlap');
      assert.ok(moveInRoom([-1.65, 1.8, .2], -2, 0, 'workshop')[0] >= x1 + .17, 'gallery stops walking through the aircraft');
    }
    if (record.id === 'diamond-da20-c1') {
      const item = collectionModels.find(m => m.id === record.id);
      const display = fitCollectionModel(gltf.scene, item.size, item.rotation);
      display.position.set(...item.position);
      const bounds = new Box3().setFromObject(display);
      assert.ok(Math.abs(bounds.min.y - .83) < 1e-5, 'wheels meet the apron');
      assert.ok(bounds.min.x > 1.65 && bounds.max.x < 2.79);
      assert.ok(bounds.min.z > -.85 && bounds.max.z < 1.05);
      assert.ok(bounds.max.y < 1.4, 'plane stays below the wall sketch');
      assert.equal(item.aircraft, true, 'detail view uses aircraft framing');
      assert.ok(moveInRoom([1.35, 1.8, .1], 2, 0, 'workshop')[0] < 1.48, 'side display blocks walking through the model');
    }
    if (['m590', 'rose'].includes(record.id)) {
      const item = collectionModels.find(m => m.id === record.id);
      const display = fitCollectionModel(gltf.scene, item.size, item.rotation);
      display.position.set(...item.position);
      const bounds = new Box3().setFromObject(display);
      assert.ok(bounds.min.z > -2.25 && bounds.max.z < -1.5, 'exhibit stays in the rear display zone');
      if (record.id === 'm590') {
        assert.ok(bounds.min.x > -.1 && bounds.max.x < 1.9);
        assert.ok(bounds.max.y < 1.84, 'lower rail stays below M1887');
      } else {
        assert.ok(bounds.min.x > 1.85 && bounds.max.x < 2.5);
        assert.ok(bounds.max.y < 1.95, 'rose fits below the canopy');
      }
    }
    if (record.id === 'cessna-172') {
      const item = collectionModels.find(m => m.id === record.id);
      const display = fitCollectionModel(gltf.scene, item.size, item.rotation);
      display.position.set(...item.position);
      const bounds = new Box3().setFromObject(display);
      assert.ok(Math.abs(bounds.min.y - .67) < 1e-5, 'landing gear sits on the display surface');
      assert.ok(bounds.min.x > -1.35 && bounds.max.x < .95 && bounds.min.z > -1.05 && bounds.max.z < .75, 'wings and tail fit inside the collidable table');
      const propeller = display.getObjectByName('cessna-propeller');
      const sourcePropeller = gltf.scene.getObjectByName('cessna-propeller');
      const originalRotation = sourcePropeller.rotation.z;
      propeller.rotation.z += 1;
      assert.equal(sourcePropeller.rotation.z, originalRotation, 'detail animation never rotates the shared room asset');
      const sourceBounds = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
      assert.ok(Math.abs(sourceBounds.x / sourceBounds.z - 1.3306) < .01, 'source wingspan-to-length proportions survive conversion');
    }
    gltf.scene.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.dispose(); mesh.material.dispose(); } });
  }
});
