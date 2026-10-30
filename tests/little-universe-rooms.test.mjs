import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3 } from 'three';
import { createRoom, moveInRoom, ROOM_IDS, ROOM_SPAWN, ROOM_BOUNDS, ROOM_OBSTACLES, EXTERIOR_DOORS } from '../src/little-universe/rooms.js';
import { disposeMiniature } from '../src/little-universe/miniature.js';

test('enterable rooms contain their requested exhibits within an enclosed, finite room', () => {
  for (const id of ROOM_IDS) {
    const room = createRoom(id);
    const bounds = new Box3().setFromObject(room);
    assert.ok(bounds.min.x >= -3.1 && bounds.max.x <= 3.1);
    assert.ok(bounds.min.z >= -2.6 && bounds.max.z <= 2.6);
    assert.ok(bounds.max.y > 3 && bounds.max.y < 3.4);
    const expected = {
      music: ['spinning-record', 'turntable', 'speaker-left', 'speaker-right', 'vinyl-collection-frames', 'musical-poster-frames'],
      workshop: [],
      museum: [],
      'one-more-episode': ['series-sofa-and-frames'],
      'movie-night': ['cinema-shell', 'cinema-curtains', 'cinema-seats', 'cinema-poster-frames'],
    }[id];
    for (const name of expected) assert.ok(room.getObjectByName(name), name);
    let draws = 0;
    room.traverse((mesh) => {
      if (!mesh.isMesh) return;
      draws++;
      assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));
    });
    assert.ok(draws < 100, `${id} uses ${draws} batched draws`);
    assert.ok(EXTERIOR_DOORS[id].height > .3);
    disposeMiniature(room);
  }
  assert.throws(() => createRoom('camping'), RangeError);
});

test('walking stops at furniture and room walls, including long steps', () => {
  for (const id of ROOM_IDS) {
    const position = moveInRoom(ROOM_SPAWN, 0, -50, id);
    assert.equal(position[1], ROOM_SPAWN[1]);
    assert.ok(position[2] > (id === 'movie-night' ? -1.66 : -1.4), 'the front furniture or stage cannot be crossed');
    const farRight = moveInRoom(ROOM_SPAWN, 50, 0, id);
    assert.equal(farRight[0], ROOM_BOUNDS.maxX);
    const farBack = moveInRoom(ROOM_SPAWN, 0, 50, id);
    assert.equal(farBack[2], ROOM_BOUNDS.maxZ);
    let walk = [...ROOM_SPAWN];
    for (let i = 0; i < 1500; i++) {
      walk = moveInRoom(walk, Math.sin(i * .8) * .24, Math.cos(i * .17) * .24, id);
      assert.ok(walk[0] >= ROOM_BOUNDS.minX && walk[0] <= ROOM_BOUNDS.maxX);
      assert.ok(walk[2] >= ROOM_BOUNDS.minZ && walk[2] <= ROOM_BOUNDS.maxZ);
      for (const [x0, x1, z0, z1] of ROOM_OBSTACLES[id]) assert.ok(!(walk[0] > x0 && walk[0] < x1 && walk[2] > z0 && walk[2] < z1));
    }
  }
});

test('collision allows sliding sideways along the bench instead of trapping the visitor', () => {
  const blocked = moveInRoom(ROOM_SPAWN, 0, -5, 'music');
  const slide = moveInRoom(blocked, 1, -.3, 'music');
  assert.ok(slide[0] > blocked[0] + .9);
  assert.ok(slide[2] >= -1.22, 'sliding may approach the padded edge but never cross it');
});
