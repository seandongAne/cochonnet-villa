import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { series, landmarks } from '../src/little-universe/content.js';
import { SERIES_FRAME_SIZE, SERIES_SLOTS } from '../src/little-universe/one-more-episode.js';
import { createRoom, moveInRoom, ROOM_SPAWN } from '../src/little-universe/rooms.js';
import { disposeMiniature } from '../src/little-universe/miniature.js';
import { fitPoster } from '../src/little-universe/movie-night.js';

test('the television room keeps all eight shared series, a central favorite and the current watch', async () => {
  assert.deepEqual(series.map((s) => s.id), ['downton-abbey', 'youre-the-worst', 'the-good-place', 'the-good-wife', 'the-good-fight', 'game-of-thrones', 'shrinking', 'the-man-in-the-high-castle']);
  assert.equal(series[0].note, 'Cabbage’s favorite');
  assert.equal(series.find((show) => show.id === 'shrinking').status, 'Watching together');
  assert.equal(SERIES_SLOTS[0].position[0], 0);
  assert.deepEqual(SERIES_SLOTS.map((s) => s.id), series.map((s) => s.id));
  const sources = JSON.parse(await fs.readFile(new URL('../public/little-universe/one-more-episode/sources.json', import.meta.url)));
  let bytes = 0;
  for (const show of series) {
    const buffer = await fs.readFile(new URL(`../public${show.poster}`, import.meta.url)); bytes += buffer.length;
    const meta = await sharp(buffer).metadata();
    assert.equal(meta.format, 'webp'); assert.ok(meta.width >= 250 && meta.height >= 60);
    const size = fitPoster(meta.width, meta.height, SERIES_FRAME_SIZE);
    assert.ok(Math.abs(size[0] / size[1] - meta.width / meta.height) < 1e-10);
    assert.ok(sources.artwork.some((s) => s.id === show.id && s.local === show.poster && s.original.startsWith('https://')));
  }
  assert.ok(bytes < 500_000);
  assert.equal(landmarks.length, 6);
  assert.deepEqual(landmarks.slice(1).map((p) => p.name), ['The Encore', 'Hangar', 'The Iron & Rose', 'The Midnight Matinee', 'One More Episode']);
});

test('the television sofa blocks walking while both side routes reach the collection', () => {
  const stopped = moveInRoom(ROOM_SPAWN, 0, -10, 'one-more-episode');
  assert.ok(stopped[2] >= .43);
  for (const side of [-1, 1]) {
    const aisle = moveInRoom(ROOM_SPAWN, side * 2.2, 0, 'one-more-episode');
    const front = moveInRoom(aisle, 0, -10, 'one-more-episode');
    assert.ok(front[2] < -1.3 && front[2] > -1.48);
  }
});
