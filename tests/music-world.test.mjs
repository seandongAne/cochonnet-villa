import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { musicals } from '../src/little-universe/content.js';
import { MUSICAL_POSTER_SIZE, MUSICAL_POSTER_SLOTS } from '../src/little-universe/music-world.js';
import { fitPoster } from '../src/little-universe/movie-night.js';

test('the five shared musicals have local, decodable artwork that fits its frame without cropping', async () => {
  assert.deepEqual(musicals.map((item) => item.id), ['hamilton', 'rent', 'phantom', 'les-miserables', 'six']);
  const sources = JSON.parse(await fs.readFile(new URL('../public/little-universe/music-world/sources.json', import.meta.url)));
  let bytes = 0;
  for (const musical of musicals) {
    assert.ok(musical.poster.startsWith('/little-universe/music-world/'));
    const buffer = await fs.readFile(new URL(`../public${musical.poster}`, import.meta.url));
    bytes += buffer.length;
    const meta = await sharp(buffer).metadata();
    assert.equal(meta.format, 'webp');
    assert.ok(meta.width >= 200 && meta.height >= 250);
    const [w, h] = fitPoster(meta.width, meta.height, MUSICAL_POSTER_SIZE);
    assert.ok(Math.abs(w / h - meta.width / meta.height) < 1e-10);
    assert.ok(w <= MUSICAL_POSTER_SIZE[0] + 1e-10 && h <= MUSICAL_POSTER_SIZE[1]);
    assert.ok(sources.posters.some((source) => source.id === musical.id && source.local === musical.poster && source.original.startsWith('https://upload.wikimedia.org/')));
    assert.equal(MUSICAL_POSTER_SLOTS.filter((slot) => slot.id === musical.id).length, 1);
  }
  assert.ok(bytes < 300_000, 'the full collection remains light enough for mobile');
  assert.equal(musicals[0].note, 'Sean’s favorite');
  assert.equal(MUSICAL_POSTER_SLOTS.find((slot) => slot.id === 'hamilton').position[0], 0);
  for (const [i, a] of MUSICAL_POSTER_SLOTS.entries()) {
    assert.ok(Math.abs(a.position[0]) + .47 < 3, 'frames remain inside the front wall');
    assert.ok(a.position[1] - .59 > 1.7 && a.position[1] + .59 < 3.1, 'frames clear the bench and ceiling');
    for (const b of MUSICAL_POSTER_SLOTS.slice(i + 1)) assert.ok(Math.abs(a.position[0] - b.position[0]) > .94, 'frames do not overlap');
  }
});
