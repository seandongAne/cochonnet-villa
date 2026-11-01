// Copy artwork into an independent append-only public collection.
// Only image data and truthful timestamps cross this boundary; no article metadata.
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { writeFileAtomically } from './note-art-runtime.mjs';

const ROOT = resolve(import.meta.dirname, '..');
export function historicalTimestamp(root, imagePath, now) {
  try {
    const value = execFileSync('git', ['log', '-1', '--format=%cI', '--', 'public' + imagePath], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (value && Number.isFinite(Date.parse(value))) return { timestamp: new Date(value).toISOString(), timestampKind: 'archived' };
  } catch { /* A shallow checkout may not contain an older artwork commit. */ }
  return { timestamp: now(), timestampKind: 'imported' };
}
export async function syncNoteGallery({ root = ROOT, notes, now = () => new Date().toISOString(), history = historicalTimestamp } = {}) {
  const manifestPath = join(root, 'content/gallery.json');
  let collection;
  try { collection = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; collection = { version: 1, works: [] }; }
  if (collection.version !== 1 || !Array.isArray(collection.works)) throw new Error('Invalid gallery manifest; refusing to replace it');
  const allowed = ['id', 'number', 'image', 'thumbnail', 'timestamp', 'timestampKind', 'width', 'height'];
  for (const work of collection.works) {
    if (Object.keys(work).some(key => !allowed.includes(key)) || !/^art-[a-f0-9]{64}$/.test(work.id) ||
        !Number.isFinite(Date.parse(work.timestamp)) || !['generated','archived','imported'].includes(work.timestampKind)) throw new Error('Invalid gallery work');
  }
  const seen = new Set(collection.works.map(work => work.id));
  const additions = [];
  for (const note of notes || []) {
    const imagePath = note.image;
    if (!/^\/notes-art\/[a-z0-9-]+\.webp$/.test(imagePath || '')) continue;
    let bytes;
    try { bytes = await readFile(join(root, 'public', imagePath.slice(1))); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const hash = createHash('sha256').update(bytes).digest('hex');
    const id = 'art-' + hash;
    if (seen.has(id)) continue;
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'webp' || !metadata.width || !metadata.height) throw new Error('Invalid gallery image');
    const stamp = note.imageSha256 === hash && Number.isFinite(Date.parse(note.imageGeneratedAt))
      ? { timestamp: new Date(note.imageGeneratedAt).toISOString(), timestampKind: 'generated' }
      : history(root, imagePath, now);
    const directory = join(root, 'public/little-universe/gallery/art');
    await mkdir(directory, { recursive: true });
    // Originals remain byte-identical; thumbnail strips source metadata.
    await writeFileAtomically(join(directory, hash + '.webp'), bytes);
    await writeFileAtomically(join(directory, hash + '-thumb.webp'), await sharp(bytes).resize({ width: 720, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer());
    additions.push({ id, image: '/little-universe/gallery/art/' + hash + '.webp',
      thumbnail: '/little-universe/gallery/art/' + hash + '-thumb.webp',
      ...stamp, width: metadata.width, height: metadata.height });
    seen.add(id);
  }
  additions.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
  let number = Math.max(0, ...collection.works.map(work => work.number));
  for (const work of additions) collection.works.push({ ...work, number: ++number });
  if (additions.length) await writeFileAtomically(manifestPath, JSON.stringify(collection, null, 2) + '\n');
  return { added: additions.length, total: collection.works.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { notes } = JSON.parse(await readFile(join(ROOT, 'content/notes.json'), 'utf8'));
  const result = await syncNoteGallery({ notes });
  console.log('Independent gallery: ' + result.added + ' added, ' + result.total + ' total.');
}
