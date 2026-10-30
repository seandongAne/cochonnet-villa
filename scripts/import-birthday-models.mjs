// Local birthday asset import; source files are never modified.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GLTFPACK = path.join(ROOT, "node_modules", "gltfpack", "cli.js");

const MAX_SIZE = { baseColor: 1024, normal: 512, metallicRoughness: 512, emissive: 512, occlusion: 512, other: 1024 };
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


// Shrink textures before geometry packing to bound WASM memory for large sources.
// Usage: node scripts/import-birthday-models.mjs <source directory> [model-id] [original blend for m590] [materials.rar for m590]
const sourceDir = process.argv[2];
if (!sourceDir) throw new Error('Pass the directory containing the source GLBs.');
if (process.argv[3] === 'm590' && (!process.argv[4] || !fs.existsSync(process.argv[4]))) throw new Error('M590 requires the original blend path as the fourth argument.');
if (process.argv[3] === 'm590' && (!process.argv[5] || !fs.existsSync(process.argv[5]))) throw new Error('M590 requires the supplied materials archive as the fifth argument.');
const outputDir = path.join(ROOT, 'public/little-universe/models');
fs.mkdirSync(outputDir, { recursive: true });
const sources = [
 ['little-pig', 'Meshy_AI_Punky_Piglet_1030154555_texture.glb', .08],
 ['bai-baicai', 'Meshy_AI_Cheerful_Cabbage_Masc_1030164219_texture.glb', .08],
 ['sd-gundam', 'Meshy_AI_SD_Gundam__1030153405_texture.glb', .08],
 ['reborns-gundam', 'Meshy_AI_Reborns_Gundam_Metal__1030163302_texture (1).glb', 1],
 ['zz-gundam-verka', 'Meshy_AI_ZZ_Gundam_VerKa_1030183144_image-to-3d-texture.glb', .15],
 ['cz-bren-2', 'czbren2.glb', 1],
 ['m1887-short', 'Short.glb', 1],
 ['rose', 'Rose.glb', 1],
 ['m590', 'm590.glb', 1],
 ['ru-winter-su100', 'RU_Winter_SU100.glb', .15],
];
const selectedId = process.argv[3];
if (selectedId && !sources.some(([id]) => id === selectedId)) throw new Error(`Unknown model: ${selectedId}`);
const manifestPath = path.join(outputDir, 'sources.json');
const records = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).models : [];
for (const [id, filename, ratio] of sources) {
 // Blender conversion has its own source directory and must be requested explicitly.
 if (id === 'm590' && !selectedId) continue;
 if (selectedId && id !== selectedId) continue;
 const input = path.join(sourceDir, filename);
 const output = path.join(outputDir, id + '.glb');
 const temp = path.join(ROOT, '.git', id + '-textures.glb');
 const { json, bin } = readGlb(fs.readFileSync(input));
 const converted = await convertTextures(json, bin, id);
 fs.writeFileSync(temp, writeGlb(converted.json, converted.bin));
 execFileSync(process.execPath, [GLTFPACK, '-i', temp, '-o', output, '-cc', '-si', String(ratio), '-se', '0.002', '-kn', '-km'], { stdio: 'inherit' });
 fs.unlinkSync(temp);
 const crypto = await import('node:crypto');
 const record = { id, source: filename, sourceBytes: fs.statSync(input).size, runtimeBytes: fs.statSync(output).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'), simplificationRatio: ratio };
 if (id === 'm590') {
  const blend = process.argv[4];
  Object.assign(record, { source: path.basename(blend), sourceBytes: fs.statSync(blend).size,
   sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(blend)).digest('hex'),
   conversion: 'scripts/export-m590.py with bpy 4.5.9; static rest-pose geometry, conventional stock; alternate Knoxx grip and loose cartridge omitted.',
   materials: 'Supplied materials.rar: black receiver and plastic furniture; original UVs, base color, OpenGL normal, metallic, roughness and ambient occlusion maps.',
   materialSource: path.basename(process.argv[5]),
   materialSourceBytes: fs.statSync(process.argv[5]).size,
   materialSourceSha256: crypto.createHash('sha256').update(fs.readFileSync(process.argv[5])).digest('hex') });
 }
 const existing = records.findIndex(item => item.id === id);
 if (existing < 0) records.push(record); else records[existing] = record;
 console.log(JSON.stringify(record));
 fs.writeFileSync(path.join(outputDir, 'sources.json'), JSON.stringify({ source: 'Files supplied by the author on 2026-10-30; originals remain in Downloads. No third-party upload.', processing: 'Embedded WebP textures; meshopt geometry; bounded-error simplification. No external resource URIs.', models: records }, null, 2) + '\n');
}
