import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { Box3, Group, Texture, Vector3 } from 'three';
import { createPosterHologram, HOLOGRAM_DEPTH } from '../src/little-universe/poster-hologram.js';
import { movies, landmarks, visitLandmark } from '../src/little-universe/content.js';
import { MOVIE_POSTER_SLOTS, MOVIE_POSTER_SIZE, fitPoster } from '../src/little-universe/movie-night.js';
import { moveInRoom, ROOM_BOUNDS, ROOM_CAMERA_NEAR, ROOM_SPAWN } from '../src/little-universe/rooms.js';

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

test('no reachable visitor position puts a hologram plane inside the camera near plane, including the side aisles', () => {
  // Flood-fill every position the real movement function can reach from spawn.
  const step = .04, key = ([x, , z]) => `${Math.round(x / step)},${Math.round(z / step)}`;
  const reached = new Map([[key(ROOM_SPAWN), ROOM_SPAWN]]);
  const queue = [ROOM_SPAWN];
  while (queue.length) {
    const from = queue.pop();
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const to = moveInRoom(from, dx, dz, 'movie-night');
      if (!reached.has(key(to))) { reached.set(key(to), to); queue.push(to); }
    }
  }
  const positions = [...reached.values()];
  assert.ok(positions.length > 2000, `reachable samples: ${positions.length}`);
  assert.ok(positions.some(([x]) => x === ROOM_BOUNDS.maxX) && positions.some(([x]) => x === ROOM_BOUNDS.minX), 'both side aisles reach the wall bound');
  assert.ok(HOLOGRAM_DEPTH < Math.abs(MOVIE_POSTER_SLOTS[3].position[0]) - ROOM_BOUNDS.maxX - ROOM_CAMERA_NEAR);

  const texture = new Texture();
  const projection = createPosterHologram(texture, MOVIE_POSTER_SIZE);
  const eye = ROOM_SPAWN[1];
  for (const slot of MOVIE_POSTER_SLOTS) {
    const holder = new Group(); holder.position.set(...slot.position); holder.rotation.y = slot.rotation;
    holder.add(projection.root); holder.updateMatrixWorld(true);
    let checked = 0;
    projection.root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const box = new Box3().setFromObject(mesh, true);
      if (box.min.y > eye + .05 || box.max.y < eye - .05) return; // the beam and emitter stay below the camera
      checked++;
      let nearest = Infinity;
      for (const [x, , z] of positions) nearest = Math.min(nearest, box.distanceToPoint(new Vector3(x, eye, z)));
      assert.ok(nearest > ROOM_CAMERA_NEAR + .02, `${slot.id} ${mesh.name}: nearest visitor ${nearest.toFixed(3)} m from the plane`);
    });
    assert.ok(checked >= 2, `${slot.id} artwork and rim were checked`);
    holder.remove(projection.root);
  }
  projection.dispose(); texture.dispose();
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
