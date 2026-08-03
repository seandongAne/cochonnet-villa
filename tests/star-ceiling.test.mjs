import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { createMaterials } from "../src/villa-map/assets.js";
import {
  createMushroomInterior,
  MUSHROOM_STAR_DOME_NAME,
  MUSHROOM_STAR_TEXTURE_HIGH_URL,
  MUSHROOM_STAR_TEXTURE_URL
} from "../src/villa-map/mushroom-interior.js";
import { MUSHROOM_INTERIOR_LOCAL_RADIUS } from "../src/villa-map/mushroom-interior-config.js";

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
  assert.equal(
    MUSHROOM_STAR_TEXTURE_HIGH_URL,
    "/textures/qwantani-night-puresky-dome-8k.webp"
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

test("the star dome has a flush dark rim instead of protruding wooden ribs", () => {
  const interior = createMushroomInterior(createMaterials());
  const dome = interior.getObjectByName(MUSHROOM_STAR_DOME_NAME);
  const rim = interior.getObjectByName("mushroom-interior-dome-rim");

  assert.ok(rim, "star-dome seam trim missing");
  assert.equal(rim.geometry.type, "TorusGeometry");
  assert.equal(rim.material.side, THREE.DoubleSide);
  assert.ok(
    rim.geometry.parameters.radius - rim.geometry.parameters.tube >
      MUSHROOM_INTERIOR_LOCAL_RADIUS - 0.15,
    "star-dome trim must hug the wall instead of projecting into the room"
  );
  assert.equal(
    interior.children.some(
      (child) => child.geometry?.type === "BoxGeometry" && child.position.y >= dome.position.y
    ),
    false,
    "no radial wooden ribs may obstruct the dome edge"
  );
});

test("the browser runtime loads and disposes the sRGB dome texture", () => {
  const scenePath = fileURLToPath(
    new URL("../src/villa-map/react/MushroomObservatoryRuntime.jsx", import.meta.url)
  );
  const source = readFileSync(scenePath, "utf8");

  assert.match(source, /new THREE\.TextureLoader\(\)/);
  assert.match(source, /getObjectByName\(MUSHROOM_STAR_DOME_NAME\)/);
  assert.match(source, /loader\.load\(\s*MUSHROOM_STAR_TEXTURE_URL/);
  assert.match(source, /loader\.load\(\s*MUSHROOM_STAR_TEXTURE_HIGH_URL/);
  assert.match(source, /gl\.capabilities\.maxTextureSize < 8192/);
  assert.match(source, /qualityRef\.current\?\.quality === "high"/);
  assert.match(source, /activateSkyTexture\(loadedHighTexture, "8k"\)/);
  assert.match(source, /activateSkyTexture\(loadedTexture, "4k"\)/);
  assert.match(source, /resources\.textureReady = true;\s*sky\.userData\.textureReady = true;/);
  assert.match(source, /texture\.colorSpace = THREE\.SRGBColorSpace/);
  assert.match(source, /texture\.generateMipmaps = true/);
  assert.match(source, /texture\.minFilter = THREE\.LinearMipmapLinearFilter/);
  assert.match(source, /gl\.capabilities\.getMaxAnisotropy\(\)/);
  assert.match(source, /loadedTexture\?\.dispose\(\)/);
  assert.match(source, /loadedHighTexture\?\.dispose\(\)/);
  assert.match(source, /resources\.textureError = true/);
  assert.match(
    source,
    /if \(!mounted \|\| sky\.userData\.lifecycleToken !== lifecycleToken\) return;/
  );
  assert.match(
    source,
    /scheduleTexturePreupload\(\s*backdropMaterial\?\.uniforms\?\.uSkyTexture\?\.value \?\? fallbackTexture/
  );
});
