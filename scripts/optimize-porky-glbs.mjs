#!/usr/bin/env node
// Shrink Meshy-exported pig GLBs for the villa map.
//
//   node scripts/optimize-porky-glbs.mjs                 # every public/models/porkies/*.glb
//   node scripts/optimize-porky-glbs.mjs path/to/pig.glb # one file (in place)
//
// Two passes, both lossless for the runtime contract (bbox auto-fit + a single
// PBR material per pig):
//   1. gltfpack (devDependency, WebAssembly build) quantises attributes and
//      applies EXT_meshopt_compression. The runtime loader in porky-models.js
//      registers three's bundled MeshoptDecoder, so no CDN fetch is involved.
//   2. Embedded textures are re-encoded as WebP with sharp (ships with Astro):
//      base colour / normal maps capped at 1024², roughness / emissive maps at
//      512². Textures are declared through EXT_texture_webp, which three's
//      GLTFLoader supports out of the box.
//
// Meshy exports 2048² JPEG/PNG sets that made single pigs 6–10 MB; after this
// script a pig is well under 2.5 MB (pinned by tests/porky-assets.test.mjs).
// Re-run it after dropping a new pig into public/models/porkies/.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_DIR = path.join(ROOT, "public", "models", "porkies");
const GLTFPACK = path.join(ROOT, "node_modules", "gltfpack", "cli.js");

const MAX_SIZE = { baseColor: 1024, normal: 1024, metallicRoughness: 512, emissive: 512, occlusion: 512, other: 1024 };
const QUALITY = { baseColor: 84, normal: 88, metallicRoughness: 78, emissive: 78, occlusion: 78, other: 82 };

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function readGlb(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error("not a GLB");
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== CHUNK_JSON) throw new Error("first chunk is not JSON");
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
  const binOffset = 20 + jsonLength;
  let bin = Buffer.alloc(0);
  if (binOffset < buffer.length) {
    const binLength = buffer.readUInt32LE(binOffset);
    if (buffer.readUInt32LE(binOffset + 4) !== CHUNK_BIN) throw new Error("second chunk is not BIN");
    bin = buffer.subarray(binOffset + 8, binOffset + 8 + binLength);
  }
  return { json, bin };
}

function writeGlb(json, bin) {
  const encoded = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPadded = Math.ceil(encoded.length / 4) * 4;
  const binPadded = Math.ceil(bin.length / 4) * 4;
  const out = Buffer.alloc(12 + 8 + jsonPadded + 8 + binPadded);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonPadded, 12);
  out.writeUInt32LE(CHUNK_JSON, 16);
  encoded.copy(out, 20);
  out.fill(0x20, 20 + encoded.length, 20 + jsonPadded);
  out.writeUInt32LE(binPadded, 20 + jsonPadded);
  out.writeUInt32LE(CHUNK_BIN, 24 + jsonPadded);
  bin.copy(out, 28 + jsonPadded);
  return out;
}

// Which material slot references each image decides its size/quality budget.
function imageRoles(json) {
  const roles = new Map();
  const textureImage = (index) => {
    const texture = json.textures?.[index];
    if (!texture) return undefined;
    return texture.extensions?.EXT_texture_webp?.source ?? texture.source;
  };
  for (const material of json.materials ?? []) {
    const slots = [
      ["baseColor", material.pbrMetallicRoughness?.baseColorTexture],
      ["metallicRoughness", material.pbrMetallicRoughness?.metallicRoughnessTexture],
      ["normal", material.normalTexture],
      ["emissive", material.emissiveTexture],
      ["occlusion", material.occlusionTexture]
    ];
    for (const [role, ref] of slots) {
      if (!ref) continue;
      const image = textureImage(ref.index);
      if (image === undefined) continue;
      const existing = roles.get(image);
      // Base colour wins if a packed image is reused across slots.
      if (!existing || role === "baseColor") roles.set(image, role);
    }
  }
  return roles;
}

async function encodeImage(bytes, role) {
  const source = sharp(bytes);
  const meta = await source.metadata();
  const maxSize = MAX_SIZE[role] ?? MAX_SIZE.other;
  const quality = QUALITY[role] ?? QUALITY.other;
  let pipeline = source;
  if ((meta.width ?? 0) > maxSize || (meta.height ?? 0) > maxSize) {
    pipeline = pipeline.resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true });
  }
  let keepAlpha = false;
  if (meta.hasAlpha) {
    const stats = await sharp(bytes).stats();
    const alpha = stats.channels[stats.channels.length - 1];
    keepAlpha = alpha.min < 250;
  }
  if (!keepAlpha) pipeline = pipeline.flatten({ background: "#000000" });
  const webp = await pipeline.webp({ quality, alphaQuality: 90, effort: 5 }).toBuffer();
  return { webp, from: `${meta.format} ${meta.width}x${meta.height}` };
}

// Re-encode embedded images and repack the BIN chunk. Every bufferView keeps
// its index; only offsets/lengths move, so accessors stay valid. Meshopt
// bufferViews reference the compressed region through their extension, which
// is relocated the same way.
async function convertTextures(json, bin, label) {
  const roles = imageRoles(json);
  const replacements = new Map();
  for (const [index, image] of (json.images ?? []).entries()) {
    if (image.bufferView === undefined) continue;
    if (image.mimeType === "image/webp") continue;
    const view = json.bufferViews[image.bufferView];
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const role = roles.get(index) ?? "other";
    const { webp, from } = await encodeImage(bytes, role);
    replacements.set(image.bufferView, webp);
    console.log(`  ${label} image ${index} (${role}): ${from} ${(bytes.length / 1024).toFixed(0)}K -> webp ${(webp.length / 1024).toFixed(0)}K`);
    image.mimeType = "image/webp";
  }
  if (replacements.size === 0) return { json, bin };

  const regions = [];
  for (const [index, view] of json.bufferViews.entries()) {
    const compressed = view.extensions?.EXT_meshopt_compression;
    if (compressed) {
      regions.push({ target: compressed, bytes: bin.subarray(compressed.byteOffset ?? 0, (compressed.byteOffset ?? 0) + compressed.byteLength) });
      // The fallback bufferView carries no bytes of its own when the fallback
      // buffer is declared; leave its (unused) offset in place.
      if (view.buffer !== 0) continue;
    }
    const bytes = replacements.get(index) ?? bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    regions.push({ target: view, bytes });
  }
  const chunks = [];
  let cursor = 0;
  for (const region of regions) {
    region.target.byteOffset = cursor;
    region.target.byteLength = region.bytes.length;
    chunks.push(region.bytes);
    const padded = Math.ceil(region.bytes.length / 4) * 4;
    if (padded > region.bytes.length) chunks.push(Buffer.alloc(padded - region.bytes.length));
    cursor += padded;
  }
  const packed = Buffer.concat(chunks);
  json.buffers[0].byteLength = packed.length;

  for (const texture of json.textures ?? []) {
    const source = texture.extensions?.EXT_texture_webp?.source ?? texture.source;
    if (source === undefined || json.images[source].mimeType !== "image/webp") continue;
    texture.extensions = { ...(texture.extensions ?? {}), EXT_texture_webp: { source } };
    delete texture.source;
  }
  const used = new Set(json.extensionsUsed ?? []);
  const required = new Set(json.extensionsRequired ?? []);
  used.add("EXT_texture_webp");
  required.add("EXT_texture_webp");
  json.extensionsUsed = [...used];
  json.extensionsRequired = [...required];
  return { json, bin: packed };
}

function runGltfpack(input, output) {
  execFileSync(process.execPath, [GLTFPACK, "-i", input, "-o", output, "-cc", "-kn", "-km"], { stdio: "inherit" });
}

async function optimizeFile(file) {
  const before = fs.statSync(file).size;
  const label = path.basename(file);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "porky-glb-"));
  try {
    const packed = path.join(tmpDir, "packed.glb");
    runGltfpack(file, packed);
    const { json, bin } = readGlb(fs.readFileSync(packed));
    const converted = await convertTextures(json, bin, label);
    const out = writeGlb(converted.json, converted.bin);
    fs.writeFileSync(file, out);
    console.log(`${label}: ${(before / 1024 / 1024).toFixed(2)} MB -> ${(out.length / 1024 / 1024).toFixed(2)} MB`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2).map((file) => path.resolve(file))
  : fs.readdirSync(DEFAULT_DIR).filter((file) => file.endsWith(".glb")).sort().map((file) => path.join(DEFAULT_DIR, file));

for (const file of targets) {
  await optimizeFile(file);
}
