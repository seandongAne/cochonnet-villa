import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GALLERY_BOUNDS, GALLERY_SPAWN, GALLERY_SLOTS, GALLERY_OBSTACLES, createGalleryRoom } from '../src/little-universe/gallery-interior.js';
import { moveInRoom } from '../src/little-universe/rooms.js';
import { fitPoster } from '../src/little-universe/movie-night.js';
import { galleryWorks } from '../src/little-universe/gallery.js';
import { disposeMiniature } from '../src/little-universe/miniature.js';

const blocked = (x, z) => GALLERY_OBSTACLES.some(([x0, x1, z0, z1]) => x > x0 - .18 && x < x1 + .18 && z > z0 - .18 && z < z1 + .18);
test('gallery central aisle stays clear from entrance to rear wall and stops at its own bounds', () => {
  for (const x of [-1, 0, 1]) {
    const p = moveInRoom([x, GALLERY_SPAWN[1], GALLERY_SPAWN[2]], 0, -50, 'gallery');
    assert.deepEqual(p, [x, GALLERY_SPAWN[1], GALLERY_BOUNDS.minZ]);
    assert.equal(moveInRoom(p, 0, 50, 'gallery')[2], GALLERY_BOUNDS.maxZ);
  }
  assert.equal(moveInRoom([0, 1.65, 0], 50, 0, 'gallery')[0], GALLERY_BOUNDS.maxX);
  assert.equal(moveInRoom([0, 1.65, 0], -50, 0, 'gallery')[0], GALLERY_BOUNDS.minX);
});

test('gallery furniture and arch feet cannot be crossed, including long moves; visitors can slide past', () => {
  for (const [x0, x1, z0, z1] of GALLERY_OBSTACLES) {
    const x = (x0 + x1) / 2;
    const startZ = Math.min(GALLERY_BOUNDS.maxZ, z1 + .5);
    const stopped = moveInRoom([x, 1.65, startZ], 0, -3, 'gallery');
    assert.ok(stopped[2] >= z1 + .18 - 1e-8, 'padded furniture edge');
  }
  const stopped = moveInRoom([3.8, 1.65, 5.6], 0, -2, 'gallery');
  const slide = moveInRoom(stopped, -2.5, -.3, 'gallery');
  assert.ok(slide[0] < 1.5);
  let p = [...GALLERY_SPAWN];
  for (let i = 0; i < 2000; i++) {
    p = moveInRoom(p, Math.sin(i * .7) * .35, Math.cos(i * .19) * .35, 'gallery');
    assert.ok(!blocked(p[0], p[2]));
    assert.ok(p[0] >= GALLERY_BOUNDS.minX && p[0] <= GALLERY_BOUNDS.maxX);
    assert.ok(p[2] >= GALLERY_BOUNDS.minZ && p[2] <= GALLERY_BOUNDS.maxZ);
  }
});

test('every gallery frame has a reachable, unobstructed approach and all image shapes fit', () => {
  for (const slot of GALLERY_SLOTS) {
    const x = slot.position[0] + Math.sin(slot.rotation) * 1.1;
    const z = slot.position[2] + Math.cos(slot.rotation) * 1.1;
    assert.ok(!blocked(x, z));
    assert.ok(x >= GALLERY_BOUNDS.minX && x <= GALLERY_BOUNDS.maxX && z >= GALLERY_BOUNDS.minZ && z <= GALLERY_BOUNDS.maxZ);
    // Walk along the center, then sideways into the viewing area.
    let p = moveInRoom(GALLERY_SPAWN, 0, z - GALLERY_SPAWN[2], 'gallery');
    p = moveInRoom(p, x, 0, 'gallery');
    assert.ok(Math.abs(p[0] - x) < 1e-8 && Math.abs(p[2] - z) < 1e-8);
    for (const work of galleryWorks) {
      const [w, h] = fitPoster(work.width, work.height, slot.size);
      assert.ok(w <= slot.size[0] && h <= slot.size[1]);
      assert.ok(Math.abs(w / h - work.width / work.height) < 1e-8);
    }
  }
});

test('gallery architecture stays batched and under its desktop geometry budget', () => {
  const room = createGalleryRoom(); let draws = 0, triangles = 0;
  room.traverse(mesh => {
    if (!mesh.isMesh) return;
    draws++;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  });
  assert.ok(draws <= 40, String(draws));
  assert.ok(triangles < 160000, String(triangles));
  disposeMiniature(room);
});
