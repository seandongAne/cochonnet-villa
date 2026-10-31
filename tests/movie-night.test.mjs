import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { Texture } from 'three';
import { createPosterHologram } from '../src/little-universe/poster-hologram.js';
import { movies, landmarks, visitLandmark } from '../src/little-universe/content.js';
import { MOVIE_POSTER_SLOTS, MOVIE_POSTER_SIZE, fitPoster } from '../src/little-universe/movie-night.js';
import { moveInRoom, ROOM_SPAWN } from '../src/little-universe/rooms.js';

test('Movie Night displays all eight selected films with local, decodable poster assets and recorded sources', async () => {
  const ids = ['notting-hill', 'ford-v-ferrari', 'f1', 'tenet', 'knives-out', 'finch', 'top-gun', 'rocketman'];
  assert.deepEqual(movies.map((movie) => movie.id), ids);
  assert.deepEqual(MOVIE_POSTER_SLOTS.map((slot) => slot.id), ids);
  assert.equal(landmarks.find((place) => place.id === 'movie-night').number, undefined);
  assert.deepEqual(visitLandmark([], 'movie-night'), ['movie-night']);
  const sources = JSON.parse(await fs.readFile(new URL('../public/little-universe/movie-night/sources.json', import.meta.url)));
  let bytes = 0;
  for (const movie of movies) {
    assert.ok(movie.poster.startsWith('/little-universe/movie-night/'));
    const file = new URL(`../public${movie.poster}`, import.meta.url);
    const buffer = await fs.readFile(file); bytes += buffer.length;
    const meta = await sharp(buffer).metadata();
    assert.equal(meta.format, 'webp');
    assert.ok(meta.width >= 200 && meta.height >= 300);
    assert.ok(sources.posters.some((source) => source.id === movie.id && source.local === movie.poster && source.filePage.startsWith('https://en.wikipedia.org/')));
    const [w, h] = fitPoster(meta.width, meta.height);
    assert.ok(Math.abs(w / h - meta.width / meta.height) < 1e-10, 'the full poster keeps its original aspect ratio');
    assert.ok(w <= MOVIE_POSTER_SIZE[0] + 1e-10 && h <= MOVIE_POSTER_SIZE[1]);
  }
  assert.ok(bytes < 500_000, 'the collection stays small enough for mobile');
  assert.equal(MOVIE_POSTER_SLOTS[0].position[0], 0, 'Notting Hill is the central feature');
  assert.equal(movies[0].note, 'Cabbage’s favorite');
});

test('cinema visitors can walk down the central aisle but cannot cross either seat or the stage', () => {
  const front = moveInRoom(ROOM_SPAWN, 0, -10, 'movie-night');
  assert.ok(front[2] < -1.5 && front[2] > -1.66);
  for (const side of [-1, 1]) {
    const behindSeat = moveInRoom(ROOM_SPAWN, side * 1.25, 0, 'movie-night');
    const stopped = moveInRoom(behindSeat, 0, -10, 'movie-night');
    assert.ok(stopped[2] >= .93, 'seat collision includes the visitor radius');
    const aroundSeat = moveInRoom(stopped, side * 1.35, 0, 'movie-night');
    assert.ok(moveInRoom(aroundSeat, 0, -2.6, 'movie-night')[2] < -1.5, 'side galleries remain reachable');
  }
});

test('holograms preserve artwork, freeze reduced motion, and release only owned resources once', () => {
  const texture = new Texture();
  let textureDisposals = 0;
  texture.addEventListener('dispose', () => textureDisposals++);
  const projection = createPosterHologram(texture, fitPoster(240, 360));
  const image = projection.root.getObjectByName('hologram-artwork');
  assert.equal(image.material.map, texture);
  assert.equal(image.material.depthWrite, false);
  assert.ok(Math.abs(image.geometry.parameters.width / image.geometry.parameters.height - 2 / 3) < 1e-10);
  projection.update(2);
  assert.notEqual(image.parent.position.y, 0);
  projection.update(3, true);
  assert.equal(image.parent.position.y, 0);
  projection.update(20, true);
  assert.equal(image.parent.position.y, 0);
  const disposals = [];
  projection.root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (const resource of [mesh.geometry, mesh.material]) {
      const record = { count: 0 }; disposals.push(record);
      resource.addEventListener('dispose', () => record.count++);
    }
  });
  projection.dispose(); projection.dispose();
  assert.ok(disposals.every(({ count }) => count === 1));
  assert.equal(textureDisposals, 0, 'the texture remains owned by the React loader');
  texture.dispose();
});
