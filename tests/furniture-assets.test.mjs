import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SHARED_ATLAS_PACKS } from "../src/villa-map/furniture-models.js";

function embeddedImageHashes(buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
  const bin = buffer.subarray(28 + jsonLength);
  return (json.images ?? []).map((image) => {
    assert.ok(Number.isInteger(image.bufferView), "atlas must be embedded");
    const view = json.bufferViews[image.bufferView];
    return createHash("sha256")
      .update(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength))
      .digest("hex");
  });
}

// furniture-models.js re-points every model of a shared-atlas pack at the first
// decoded copy of the kit's colour map and releases the duplicates. That is only
// safe while every GLB in the pack embeds exactly the same image bytes.
test("every GLB in a shared-atlas pack embeds one byte-identical colour atlas", () => {
  assert.deepEqual([...SHARED_ATLAS_PACKS], ["/models/mushroom-furniture/"]);
  for (const pack of SHARED_ATLAS_PACKS) {
    const dir = fileURLToPath(new URL(`../public${pack}`, import.meta.url));
    const files = readdirSync(dir).filter((name) => name.endsWith(".glb")).sort();
    assert.ok(files.length > 10, `${pack} has a kit's worth of models`);
    const hashes = new Set();
    for (const file of files) {
      const imageHashes = embeddedImageHashes(readFileSync(dir + file));
      assert.equal(imageHashes.length, 1, `${pack}${file} must embed exactly one atlas`);
      hashes.add(imageHashes[0]);
    }
    assert.equal(hashes.size, 1, `${pack}: all models must share one atlas, found ${hashes.size}`);
  }
});

test("furniture loader adopts the shared atlas on the cached source before any clone", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/villa-map/furniture-models.js", import.meta.url)), "utf8");
  assert.match(source, /resolve\(adoptSharedAtlas\(gltf\.scene, url\)\)/);
  assert.match(source, /map\.image\?\.close\?\.\(\)/, "redundant decoded bitmaps are released");
});
