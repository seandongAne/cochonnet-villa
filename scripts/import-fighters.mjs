// Usage: node scripts/import-fighters.mjs <export-dir> <source.blend> <textures.rar>
// Meshopt compression with floating-point positions/UVs; no simplification.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [directory, source, archive] = process.argv.slice(2);
if (!directory || !source || !archive) throw new Error('Provide export directory, blend and archive.');
const report = JSON.parse(fs.readFileSync(path.join(directory, 'export-report.json')));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceSha256 = hash(source), materialSourceSha256 = hash(archive);
const manifestPath = 'public/little-universe/models/sources.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath));
for (const aircraft of report.aircraft) {
  const output = `public/little-universe/models/${aircraft.id}.glb`;
  const exported = fs.readFileSync(path.join(directory, `${aircraft.id}.glb`));
  const jsonLength = exported.readUInt32LE(12);
  const json = JSON.parse(exported.subarray(20, 20 + jsonLength));
  // Opaque paint can reuse the glass material's RGBA atlas: OPAQUE ignores alpha.
  // This avoids uploading the same 4K livery twice after the face split.
  for (const material of json.materials) {
    if (!material.name.endsWith('-opaque-paint')) continue;
    const original = json.materials.find(m => m.name === material.name.replace(/-opaque-paint$/, ''));
    if (original) material.pbrMetallicRoughness.baseColorTexture = original.pbrMetallicRoughness.baseColorTexture;
  }
  const refs = json.materials.flatMap(m => [m.pbrMetallicRoughness?.baseColorTexture,
    m.pbrMetallicRoughness?.metallicRoughnessTexture, m.normalTexture, m.occlusionTexture, m.emissiveTexture].filter(Boolean));
  const usedTextures = [...new Set(refs.map(ref => ref.index))];
  for (const ref of new Set(refs)) ref.index = usedTextures.indexOf(ref.index);
  json.textures = usedTextures.map(index => json.textures[index]);
  const usedImages = [...new Set(json.textures.map(t => t.extensions?.EXT_texture_webp?.source ?? t.source))];
  for (const texture of json.textures) {
    if (texture.extensions?.EXT_texture_webp) texture.extensions.EXT_texture_webp.source = usedImages.indexOf(texture.extensions.EXT_texture_webp.source);
    else texture.source = usedImages.indexOf(texture.source);
  }
  json.images = usedImages.map(index => json.images[index]);
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Math.ceil(encoded.length / 4) * 4;
  const binary = exported.subarray(20 + jsonLength);
  const repacked = Buffer.alloc(20 + padded + binary.length, 32);
  exported.copy(repacked, 0, 0, 20); repacked.writeUInt32LE(repacked.length, 8);
  repacked.writeUInt32LE(padded, 12); encoded.copy(repacked, 20); binary.copy(repacked, 20 + padded);
  const prepared = path.join(directory, `${aircraft.id}-prepared.glb`);
  fs.writeFileSync(prepared, repacked);
  execFileSync(process.execPath, ['node_modules/gltfpack/cli.js',
    '-i', prepared, '-o', output,
    '-cc', '-vpf', '-vtf', '-kn', '-km'], { stdio: 'inherit' });
  const record = {
    ...aircraft, source: path.basename(source), sourceBytes: fs.statSync(source).size, sourceSha256,
    materialSource: path.basename(archive), materialSourceSha256,
    runtimeBytes: fs.statSync(output).size, sha256: hash(output), simplificationRatio: 1,
    conversion: 'bpy 4.5.9; scripts disabled; one active collection per GLB; all visible mesh parts retained; original render-active UV coordinates normalized to one layer before static material batching; meshopt compression without decimation (degenerate triangles may be removed).',
    materials: 'Original 4K livery/alpha and cockpit maps; normals at most 2K, scalar PBR maps at most 1K; embedded WebP quality 92. F18-main missing Base Color node restored. Source cross-aircraft cockpit textures retained. Opaque paint faces separated from alpha glass and share the original RGBA atlas.',
    license: 'User-supplied model and texture archive; original rights remain with their holders. No public-domain claim or third-party upload.'
  };
  manifest.models = manifest.models.filter(m => m.id !== record.id);
  manifest.models.push(record);
  console.log(record.id, record.runtimeBytes, 'bytes', record.triangles, 'source triangles');
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync('public/little-universe/models/fighters-textures.json', JSON.stringify(report.restoredTextures, null, 2) + '\n');
