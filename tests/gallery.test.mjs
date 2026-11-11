import { generateNoteArtBatch } from '../scripts/generate-note-art.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { syncNoteGallery } from '../scripts/sync-note-gallery.mjs';
import { galleryWorks, artworkLabel, formatGalleryTimestamp, GALLERY_FRAME_SIZE } from '../src/little-universe/gallery.js';
import { normalizeNotes, mergeRemoteNotes } from '../src/render-notes.js';
import { fitPoster } from '../src/little-universe/movie-night.js';

const stamp = '2026-10-31T12:34:56.000Z';
const fixture = color => sharp({ create: { width: 96, height: 64, channels: 3, background: color } }).webp().toBuffer();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function sandbox(t) {
  const root = await mkdtemp(join(tmpdir(), 'cochonnet-gallery-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 3 }));
  await mkdir(join(root, 'public/notes-art'), { recursive: true });
  return root;
}
const manifest = async root => JSON.parse(await readFile(join(root, 'content/gallery.json'), 'utf8'));
const history = () => ({ timestamp: stamp, timestampKind: 'archived' });

test('gallery copies are independent, append-only, content-deduplicated and contain no note metadata', async t => {
  const root = await sandbox(t);
  const source = join(root, 'public/notes-art/private-slug.webp');
  const bytes = await fixture('#aabbcc');
  await writeFile(source, bytes);
  const note = { slug: 'private-slug', title: 'Secret title', body: 'Secret body', image: '/notes-art/private-slug.webp' };
  assert.deepEqual(await syncNoteGallery({ root, notes: [note, note], history }), { added: 1, total: 1 });
  const first = await manifest(root);
  const work = first.works[0];
  assert.equal(work.number, 1); assert.equal(work.timestampKind, 'archived');
  assert.ok(!JSON.stringify(first).match(/Secret|private-slug|notes-art/));
  assert.deepEqual((await readFile(join(root, 'public', work.image.slice(1)))), bytes);
  assert.equal((await sharp(await readFile(join(root, 'public', work.thumbnail.slice(1)))).metadata()).width, 96);
  assert.deepEqual(await syncNoteGallery({ root, notes: [note], history }), { added: 0, total: 1 });
  assert.deepEqual(await manifest(root), first);
  await writeFile(source, await fixture('#ff9988'));
  assert.deepEqual(await syncNoteGallery({ root, notes: [note], history }), { added: 1, total: 2 });
  const second = await manifest(root); assert.equal(second.works[1].number, 2);
  assert.deepEqual(second.works[0], work);
  await rm(source);
  await syncNoteGallery({ root, notes: [note], history });
  await syncNoteGallery({ root, notes: [], history });
  assert.deepEqual(await manifest(root), second);
  assert.deepEqual(await readFile(join(root, 'public', work.image.slice(1))), bytes);
});

test('generation timestamps belong to the exact image bytes; absent or stale stamps use an honest fallback', async t => {
  const root = await sandbox(t); const bytes = await fixture('#997766');
  await writeFile(join(root, 'public/notes-art/a.webp'), bytes);
  const note = { image: '/notes-art/a.webp', imageGeneratedAt: stamp, imageSha256: digest(bytes) };
  await syncNoteGallery({ root, notes: [note], history: () => { throw new Error('Must use generation stamp'); } });
  assert.equal((await manifest(root)).works[0].timestampKind, 'generated');
  const replacement = await fixture('#112233');
  await writeFile(join(root, 'public/notes-art/a.webp'), replacement);
  await syncNoteGallery({ root, notes: [note], history });
  assert.equal((await manifest(root)).works[1].timestampKind, 'archived');
  await writeFile(join(root, 'public/notes-art/b.webp'), await fixture('#ffffff'));
  await syncNoteGallery({ root, notes: [{ image: '/notes-art/b.webp' }], now: () => stamp });
  assert.equal((await manifest(root)).works[2].timestampKind, 'imported');
});

test('invalid manifests fail closed and unsafe or missing source paths do not publish records', async t => {
  const root = await sandbox(t);
  assert.deepEqual(await syncNoteGallery({ root, notes: [{ image: '/notes-art/missing.webp' }, { image: '/notes-art/../secret.webp' }, { image: 'https://example.com/a.webp' }] }), { added: 0, total: 0 });
  await mkdir(join(root, 'content'));
  await writeFile(join(root, 'content/gallery.json'), '{bad json');
  await assert.rejects(syncNoteGallery({ root, notes: [] }), SyntaxError);
  assert.equal(await readFile(join(root, 'content/gallery.json'), 'utf8'), '{bad json');
});

test('public collection assets have opaque names, stable numbering, valid timestamps and landscape dimensions', async () => {
  const allowed = ['id','number','image','thumbnail','timestamp','timestampKind','width','height'].sort();
  const numbers = new Set();
  for (const work of galleryWorks) {
    assert.deepEqual(Object.keys(work).sort(), allowed);
    assert.match(work.id, /^art-[a-f0-9]{64}$/); assert.ok(!numbers.has(work.number)); numbers.add(work.number);
    assert.ok(Number.isFinite(Date.parse(work.timestamp)));
    assert.match(work.image, /^\/little-universe\/gallery\/art\/[a-f0-9]{64}\.webp$/);
    assert.match(work.thumbnail, /^\/little-universe\/gallery\/art\/[a-f0-9]{64}-thumb\.webp$/);
    const bytes = await readFile(resolve('public', work.image.slice(1)));
    assert.equal('art-' + digest(bytes), work.id);
    const meta = await sharp(bytes).metadata(); assert.equal(meta.width, work.width); assert.equal(meta.height, work.height);
    const thumb = await sharp(resolve('public', work.thumbnail.slice(1))).metadata();
    assert.ok(thumb.width <= 720); assert.equal(thumb.width / thumb.height, work.width / work.height);
    const [w, h] = fitPoster(work.width, work.height, GALLERY_FRAME_SIZE);
    assert.ok(w <= GALLERY_FRAME_SIZE[0] && h <= GALLERY_FRAME_SIZE[1]);
    assert.ok(Math.abs(w / h - work.width / work.height) < 1e-9);
    assert.match(artworkLabel(work), /^作品 \d+$/); assert.match(formatGalleryTimestamp(work), /\d{4}/);
  }

});

test('editor normalization and remote art adoption preserve valid generation stamps', () => {
  const note = { slug: 'a', title: 'A', body: 'B', date: '2026-10-31', image: '/notes-art/a.webp', imageGeneratedAt: stamp, imageSha256: 'a'.repeat(64) };
  const [normalized] = normalizeNotes({ notes: [note] });
  assert.equal(normalized.imageGeneratedAt, stamp); assert.equal(normalized.imageSha256, note.imageSha256);
  const [merged] = mergeRemoteNotes([{ ...normalized, image: undefined, imageGeneratedAt: undefined, imageSha256: undefined }], [normalized]);
  assert.equal(merged.imageGeneratedAt, stamp); assert.equal(merged.imageSha256, note.imageSha256);
  assert.equal(normalizeNotes({ notes: [{ ...note, imageSha256: 'bad' }] })[0].imageGeneratedAt, undefined);
});


test('successful generation automatically supplies the timestamp and bytes needed by gallery sync', async t => {
  const root = await sandbox(t);
  const bytes = await fixture('#bbaa88');
  const note = { slug: 'fresh', title: 'Private heading', body: 'Private text' };
  const generated = await generateNoteArtBatch([{ slug: 'fresh', note }], 'test-key', {
    artDirectory: join(root, 'public/notes-art'), size: '96x64', now: () => stamp,
    requestScene: async ({ input }) => ({ moment: 'A piglet at home.', sourceExcerpt: input.body, cast: [], fullHerd: false }),
    requestImage: async () => bytes, logger: { log() {}, error() {} }, warning() {},
  });
  assert.deepEqual(generated.generated, ['fresh']);
  assert.deepEqual(generated.failures, []);
  assert.deepEqual(await syncNoteGallery({ root, notes: [note] }), { added: 1, total: 1 });
  const work = (await manifest(root)).works[0];
  assert.equal(work.timestamp, stamp); assert.equal(work.timestampKind, 'generated');
  assert.equal(work.id, 'art-' + digest(bytes));
});
