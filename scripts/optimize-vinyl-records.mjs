// Rebuild runtime images from preserved lossless WebPs, never from an already
// lossy output. Keep original provenance and record the new byte hashes.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const manifestUrl = new URL('public/little-universe/vinyl-records/sources.json', root);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const outputs = [];
for (const record of manifest.records) {
  const source = await readFile(new URL(record.losslessSource.file, root));
  if (hash(source) !== record.losslessSource.sha256) throw new Error(`Source checksum mismatch: ${record.id}`);
  const { data, info } = await sharp(source).webp({ quality: 85, effort: 6 }).toBuffer({ resolveWithObject: true });
  if (data.length > 512 * 1024) throw new Error(`Runtime image exceeds 512 KiB: ${record.id}`);
  outputs.push({ url: new URL(`public/little-universe/vinyl-records/${record.file}`, root), data });
  Object.assign(record, { width: info.width, height: info.height, bytes: data.length, sha256: hash(data) });
}
if (outputs.reduce((sum, item) => sum + item.data.length, 0) > 1.5 * 1024 * 1024) throw new Error('Vinyl collection exceeds 1.5 MiB');
for (const { url, data } of outputs) await writeFile(url, data);
manifest.processing = { format: 'WebP', quality: 85, effort: 6, resize: false, rebuild: 'node scripts/optimize-vinyl-records.mjs' };
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Four runtime covers: ${outputs.reduce((sum, item) => sum + item.data.length, 0)} bytes`);
