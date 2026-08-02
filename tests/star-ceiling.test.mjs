import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { createMaterials } from "../src/villa-map/assets.js";
import {
  createMushroomInterior,
  MUSHROOM_STAR_DOME_NAME,
  MUSHROOM_STAR_TEXTURE_URL
} from "../src/villa-map/mushroom-interior.js";

const TEXTURE_URL = new URL(
  `../public${MUSHROOM_STAR_TEXTURE_URL}`,
  import.meta.url
);

test("the local star-ceiling photograph is a 4096 x 1024 WebP", () => {
  const bytes = readFileSync(TEXTURE_URL);

  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "VP8 ");
  assert.deepEqual([...bytes.subarray(23, 26)], [0x9d, 0x01, 0x2a]);
  assert.equal(bytes.readUInt16LE(26) & 0x3fff, 4096);
  assert.equal(bytes.readUInt16LE(28) & 0x3fff, 1024);
});

test("the mushroom factory exposes an inward-facing Node-pure fallback dome", () => {
  assert.equal(
    MUSHROOM_STAR_TEXTURE_URL,
    "/textures/qwantani-night-puresky-dome-4k.webp"
  );

  const interior = createMushroomInterior(createMaterials());
  const dome = interior.getObjectByName(MUSHROOM_STAR_DOME_NAME);

  assert.ok(dome, "named star dome missing");
  assert.equal(dome.name, "mushroom-interior-dome");
  assert.equal(dome.userData.textureUrl, MUSHROOM_STAR_TEXTURE_URL);
  assert.equal(dome.material.type, "MeshBasicMaterial");
  assert.equal(dome.material.name, "mushroom-star-ceiling-fallback");
  assert.equal(dome.material.side, THREE.BackSide);
  assert.equal(dome.material.toneMapped, false);
  assert.equal(dome.material.fog, false);
  assert.equal(dome.material.map, null);
});

test("the soil surround leaves the photographed loft ceiling unobstructed", () => {
  const interior = createMushroomInterior(createMaterials());
  interior.updateMatrixWorld(true);
  const dome = interior.getObjectByName(MUSHROOM_STAR_DOME_NAME);
  const soil = interior.getObjectByName("mushroom-interior-soil");
  assert.equal(soil.geometry.parameters.openEnded, true);

  const ray = new THREE.Raycaster(
    new THREE.Vector3(0, 8 * interior.scale.y + 1.6, 0),
    new THREE.Vector3(0, 1, 0)
  );
  const shellHit = ray
    .intersectObject(interior, true)
    .find((hit) => hit.object === dome || hit.object === soil);
  assert.equal(shellHit?.object, dome, "the soil cap must not hide the star dome");
});

test("the browser scene loads and disposes the sRGB dome texture", () => {
  const scenePath = fileURLToPath(
    new URL("../src/villa-map/react/Scene.jsx", import.meta.url)
  );
  const source = readFileSync(scenePath, "utf8");

  assert.match(source, /new THREE\.TextureLoader\(\)/);
  assert.match(source, /getObjectByName\(MUSHROOM_STAR_DOME_NAME\)/);
  assert.match(source, /loader\.load\(\s*MUSHROOM_STAR_TEXTURE_URL/);
  assert.match(source, /texture\.colorSpace = THREE\.SRGBColorSpace/);
  assert.match(source, /gl\.capabilities\.getMaxAnisotropy\(\)/);
  assert.match(source, /loadedTexture\?\.dispose\(\)/);
  assert.match(source, /deep-blue fallback on load failure/);
});
