import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

import { PORKY_MODEL_VARIANTS } from "../src/villa-map/porky-models.js";

// The Meshy exports originally shipped 2048² texture sets that made single
// pigs 6–10 MB (62 MB for the cast). scripts/optimize-porky-glbs.mjs quantises
// + meshopt-compresses the geometry and re-encodes textures as ≤1024² WebP.
// These budgets keep a future pig from silently reintroducing that download.
const MAX_PIG_BYTES = 2.5 * 1024 * 1024;
const MAX_CAST_BYTES = 16 * 1024 * 1024;
const MAX_TEXTURE_SIZE = 1024;

const porkyDir = fileURLToPath(new URL("../public/models/porkies/", import.meta.url));

function readGlbJson(buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  return {
    json: JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8")),
    bin: buffer.subarray(28 + jsonLength)
  };
}

function webpDimensions(bytes) {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3)
    };
  }
  if (chunk === "VP8L") {
    const b = bytes.subarray(21, 25);
    return {
      width: 1 + (b[0] | ((b[1] & 0x3f) << 8)),
      height: 1 + ((b[1] >> 6) | (b[2] << 8) | ((b[3] & 0x0f) << 16))
    };
  }
  assert.equal(chunk, "VP8 ");
  return {
    width: bytes.readUInt16LE(26) & 0x3fff,
    height: bytes.readUInt16LE(28) & 0x3fff
  };
}

// Node cannot decode images; drop them the way tests/resort.test.mjs does so the
// production loader still round-trips the quantised + meshopt geometry.
function geometryOnly(buffer) {
  const { json, bin } = readGlbJson(buffer);
  json.images = [];
  json.textures = [];
  json.materials = (json.materials ?? []).map((material) => ({ name: material.name }));
  json.extensionsRequired = (json.extensionsRequired ?? []).filter((name) => name !== "EXT_texture_webp");
  const encoded = Buffer.from(JSON.stringify(json));
  const length = Math.ceil(encoded.length / 4) * 4;
  const out = Buffer.alloc(28 + length + bin.length, 32);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(length, 12); out.writeUInt32LE(0x4e4f534a, 16); encoded.copy(out, 20);
  out.writeUInt32LE(bin.length, 20 + length); out.writeUInt32LE(0x004e4942, 24 + length); bin.copy(out, 28 + length);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

test("every pig GLB stays within the optimised download budget", () => {
  let castBytes = 0;
  for (const [variant, { url }] of Object.entries(PORKY_MODEL_VARIANTS)) {
    const file = porkyDir + url.replace("/models/porkies/", "");
    const size = statSync(file).size;
    castBytes += size;
    assert.ok(size <= MAX_PIG_BYTES, `${variant}: ${(size / 1024 / 1024).toFixed(2)} MB exceeds the per-pig budget — run scripts/optimize-porky-glbs.mjs`);

    const { json, bin } = readGlbJson(readFileSync(file));
    const required = new Set(json.extensionsRequired ?? []);
    assert.ok(required.has("EXT_meshopt_compression"), `${variant}: geometry is not meshopt-compressed`);
    assert.ok(required.has("EXT_texture_webp"), `${variant}: textures are not WebP`);
    assert.ok(json.images?.length > 0, `${variant}: textures must stay embedded`);
    for (const image of json.images) {
      assert.equal(image.mimeType, "image/webp");
      const view = json.bufferViews[image.bufferView];
      const { width, height } = webpDimensions(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
      assert.ok(width <= MAX_TEXTURE_SIZE && height <= MAX_TEXTURE_SIZE, `${variant}: ${width}x${height} texture exceeds ${MAX_TEXTURE_SIZE}²`);
    }
  }
  assert.ok(castBytes <= MAX_CAST_BYTES, `pig cast totals ${(castBytes / 1024 / 1024).toFixed(1)} MB`);
});

test("the runtime loader registers three's bundled meshopt decoder for the compressed pigs", async () => {
  const source = readFileSync(fileURLToPath(new URL("../src/villa-map/porky-models.js", import.meta.url)), "utf8");
  assert.match(source, /import \{ MeshoptDecoder \} from "three\/addons\/libs\/meshopt_decoder\.module\.js"/);
  assert.match(source, /loader\.setMeshoptDecoder\(MeshoptDecoder\)/);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const files = readdirSync(porkyDir).filter((name) => name.endsWith(".glb")).sort();
  const { scene } = await loader.parseAsync(geometryOnly(readFileSync(porkyDir + files[0])), "");
  let vertices = 0;
  scene.traverse((object) => {
    if (object.isMesh) vertices += object.geometry.attributes.position.count;
  });
  assert.ok(vertices > 1000, "compressed geometry round-trips through the production loader");
});
