import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { vinylRecords } from '../src/little-universe/vinyl-records.js';

test('vinyl runtime covers preserve dimensions and provenance within download budgets', async () => {
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('public/little-universe/vinyl-records/sources.json', root)));
  assert.deepEqual(manifest.records.map(r => `vinyl-${r.id}`), vinylRecords.map(r => r.id));
  let total = 0;
  for (const record of manifest.records) {
    const bytes = await readFile(new URL(`public/little-universe/vinyl-records/${record.file}`, root));
    const source = await readFile(new URL(record.losslessSource.file, root));
    for (const [data, expected] of [[bytes, record], [source, record.losslessSource]]) {
      assert.equal(data.length, expected.bytes);
      assert.equal(createHash('sha256').update(data).digest('hex'), expected.sha256);
    }
    const metadata = await sharp(bytes).metadata(), original = await sharp(source).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, original.width);
    assert.equal(metadata.height, original.height);
    assert.equal(metadata.width, record.width);
    assert.equal(metadata.height, record.height);
    assert.ok(bytes.length <= 512 * 1024, `${record.id} exceeds 512 KiB`);
    total += bytes.length;
  }
  assert.ok(total <= 1.5 * 1024 * 1024, 'four covers exceed 1.5 MiB');
});
