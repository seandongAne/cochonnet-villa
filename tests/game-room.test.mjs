import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3 } from 'three';
import { GAME_CONSOLES, createGameRoom } from '../src/little-universe/game-room.js';
import { moveInRoom, ROOM_SPAWN } from '../src/little-universe/rooms.js';
import { disposeMiniature } from '../src/little-universe/miniature.js';

test('the three selected consoles sit separately on the cabinet with two controllers on the table', () => {
  assert.deepEqual(GAME_CONSOLES.map(item => item.id), ['switch', 'ps5', 'xbox']);
  const room = createGameRoom();
  try {
    const bounds = GAME_CONSOLES.map(item => new Box3().setFromObject(room.getObjectByName(`console-${item.id}`)));
    for (const box of bounds) { assert.ok(box.min.y >= .83); assert.ok(box.max.z < -1.52); }
    for (let i = 1; i < bounds.length; i++) assert.ok(bounds[i].min.x - bounds[i - 1].max.x > .5);
    for (const id of ['ps5', 'xbox']) {
      const box = new Box3().setFromObject(room.getObjectByName(`controller-${id}`));
      assert.ok(box.min.y >= .47 && box.max.y < .65);
      assert.ok(box.min.x > -.75 && box.max.x < .75);
    }
  } finally { disposeMiniature(room); }
});

test('the coffee table blocks forward walking while the right aisle reaches every console and the exit', () => {
  const stopped = moveInRoom(ROOM_SPAWN, 0, -10, 'game-room');
  assert.ok(stopped[2] >= .33);
  let walk = moveInRoom(ROOM_SPAWN, 1.2, 0, 'game-room');
  walk = moveInRoom(walk, 0, -2.55, 'game-room');
  assert.ok(walk[2] < -1);
  for (const item of GAME_CONSOLES) {
    walk = moveInRoom(walk, item.position[0] - walk[0], 0, 'game-room');
    assert.ok(Math.abs(walk[0] - item.position[0]) < .01);
  }
  walk = moveInRoom(walk, 1.2 - walk[0], 0, 'game-room');
  walk = moveInRoom(walk, 0, 2.55, 'game-room');
  walk = moveInRoom(walk, -1.2, 0, 'game-room');
  assert.ok(Math.hypot(walk[0] - ROOM_SPAWN[0], walk[2] - ROOM_SPAWN[2]) < .01);
});

import { games, findGame, GAME_COVER_SLOTS, GAME_FRAME_SIZE } from '../src/little-universe/games.js';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { fitPoster } from '../src/little-universe/movie-night.js';

test('all seventeen requested games stay visible in the original selection order', () => {
  assert.deepEqual(games.map(game => game.id), ['resident-evil-2', 'resident-evil-4', 'resident-evil-9', 'astro-bot', 'ac-odyssey', 'ac-unity', 'dead-cells', 'balatro', 'zelda-botw', 'zelda-totk', 'overcooked', 'dont-starve', 'split-fiction', 'baldurs-gate-3', 'war-thunder', 'tarkov', 'duckov']);
  assert.equal(GAME_COVER_SLOTS.length, games.length);
  assert.equal(new Set(games.map(game => game.id)).size, games.length);
  assert.equal(findGame('ac-unity').zh, '刺客信条：大革命');
  assert.equal(findGame('split-fiction').zh, '双影奇境');
  assert.equal(findGame('unknown'), games[0]);
});

test('every game has local promotional art with provenance and an undistorted wall fit', async () => {
  const sources = JSON.parse(await readFile(new URL('../public/little-universe/game-room/sources.json', import.meta.url)));
  let total = 0;
  for (const game of games) {
    const bytes = await readFile(new URL('../public' + game.poster, import.meta.url));
    total += bytes.length;
    const image = await sharp(bytes).metadata();
    assert.equal(image.format, 'webp'); assert.ok(image.width >= 450 && image.height >= 200);
    const source = sources.find(item => item.id === game.id);
    assert.ok(source?.source.startsWith('https://')); assert.ok(source?.imageUrl.startsWith('https://'));
    assert.equal(source.width, image.width); assert.equal(source.height, image.height);
    const [w, h] = fitPoster(image.width, image.height, GAME_FRAME_SIZE);
    assert.ok(w <= GAME_FRAME_SIZE[0] && h <= GAME_FRAME_SIZE[1]);
    assert.ok(Math.abs(w / h - image.width / image.height) < 1e-9);
  }
  assert.ok(total < 2_000_000, 'the complete collection stays below 2 MB');
});

test('game wall frames stay separated, inside the room, and above the sofa', () => {
  for (let i = 0; i < GAME_COVER_SLOTS.length; i++) {
    const slot = GAME_COVER_SLOTS[i]; const [x, y, z] = slot.position;
    assert.ok(Math.abs(x) === 2.9); assert.ok(y - .305 > 0 && y + .305 < 3.2);
    assert.ok(z - .53 > -2.45 && z + .53 < 2.45);
    if (x < 0) assert.ok(y - .305 > 1.3, 'left wall pictures clear the sofa back');
    for (const other of GAME_COVER_SLOTS.slice(i + 1)) {
      if (other.position[0] !== x) continue;
      assert.ok(Math.abs(other.position[1] - y) >= .7 || Math.abs(other.position[2] - z) >= 1.1);
    }
  }
  const room = createGameRoom();
  assert.ok(room.getObjectByName('game-collection-frames'));
  disposeMiniature(room);
});
