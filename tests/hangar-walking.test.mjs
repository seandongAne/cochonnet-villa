import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HANGAR_SPAWN, HANGAR_BOUNDS, HANGAR_RADIUS, HANGAR_PLINTH_RADIUS, HANGAR_OBSTACLES, hangarRoomFov, HANGAR_DISPLAYS, HANGAR_CABINETS, createHangarAtelier, isHangarWalkable } from '../src/little-universe/hangar-atelier.js';
import { moveInRoom, ROOM_IDS } from '../src/little-universe/rooms.js';
import { collectionModels } from '../src/little-universe/collection-models.js';
import { seanExhibits } from '../src/little-universe/sean-exhibits.js';

const move = (p, dx, dz) => moveInRoom(p, dx, dz, 'workshop');
test('Hangar spawn is outside the pedestal, and long moves stop at its round edge and the exit wall', () => {
  assert.ok(isHangarWalkable(HANGAR_SPAWN[0], HANGAR_SPAWN[2]));
  const front = move(HANGAR_SPAWN, 0, -100);
  assert.ok(front[2] >= HANGAR_PLINTH_RADIUS + HANGAR_RADIUS);
  assert.ok(front[2] < 3.6);
  assert.equal(front[1], HANGAR_SPAWN[1]);
  assert.equal(move(HANGAR_SPAWN, 0, 100)[2], HANGAR_BOUNDS.maxZ);
});

test('visitors can walk a complete lap around Sean’s collection and reach both display aisles and the exit', () => {
  let p = [...HANGAR_SPAWN];
  for (const [x, z] of [[5, 10.2], [5, -5], [-5, -5], [-5, 5], [-9, 5], [-9, -6.2], [-9, 5], [9, 5], [9, -6.2], [9, 5], [0, 5], [0, 11.6]]) {
    p = move(p, x - p[0], 0); p = move(p, 0, z - p[2]);
    assert.ok(Math.abs(p[0] - x) < .09 && Math.abs(p[2] - z) < .09, `reachable aisle ${x}, ${z}: ${p}`);
    assert.ok(isHangarWalkable(p[0], p[2]));
  }
});

test('side counters, portal feet and curved rear shell cannot be crossed', () => {
  for (const sign of [-1, 1]) {
    const counter = move([sign * 9, 1.8, -1.3], sign * 5, 0);
    assert.ok(Math.abs(counter[0]) < 9.4);
    const pillar = move([sign * 6.5, 1.8, 2.1], sign * 4, 0);
    assert.ok(Math.abs(pillar[0]) < 7.34);
    const wall = move([sign * 11.8, 1.8, 4], 0, -30);
    assert.ok(isHangarWalkable(wall[0], wall[2]));
    assert.ok(Math.hypot(wall[0], wall[2] - 2) <= 12.65);
  }
  let p = [...HANGAR_SPAWN];
  for (let i = 0; i < 4000; i++) {
    p = move(p, Math.sin(i * .71) * 2, Math.cos(i * .13) * 2);
    assert.ok(isHangarWalkable(p[0], p[2]));
    for (const [x0, x1, z0, z1] of HANGAR_OBSTACLES) assert.ok(!(p[0] > x0 && p[0] < x1 && p[2] > z0 && p[2] < z1));
  }
});

test('the same Hangar destination retains every original model and replaces the standalone showcase link', () => {
  assert.equal(ROOM_IDS.filter(id => id === 'workshop').length, 1);
  assert.equal(HANGAR_DISPLAYS.length, 9, 'all nine collection models have side-cabinet placements');
  assert.deepEqual(new Set(['reborns-gundam', ...HANGAR_DISPLAYS.map(m => m.id), ...seanExhibits.map(m => m.id)]), new Set(collectionModels.filter(m => m.room === 'workshop').map(m => m.id)));
  const ui = readFileSync(new URL('../src/little-universe/LittleUniverse.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /Reborns Gundam · Showcase/);
  const redirect = readFileSync(new URL('../src/pages/little-universe/hangar.astro', import.meta.url), 'utf8');
  assert.match(redirect, /Astro.redirect\('\/little-universe\/\?room=workshop'\)/);
});

// Check the cabinets themselves, not just the fitted assets: the former rear
// counter corners and their first two models extended through the curved shell.
test('every layered cabinet clears the curved shell and has a matching protected footprint', () => {
  for (const c of HANGAR_CABINETS) {
    for (const x of [c.x - c.depth / 2, c.x + c.depth / 2]) for (const z of [c.z - c.width / 2, c.z + c.width / 2]) {
      if (z < 2) assert.ok(Math.hypot(x, z - 2) < 12.85, `${c.id}: cabinet corner clears the wall`);
    }
    assert.equal(isHangarWalkable(c.x, c.z), false);
    assert.ok(isHangarWalkable(Math.sign(c.x) * 9, c.z), `${c.id}: viewing aisle is reachable`);
  }
  assert.ok(HANGAR_DISPLAYS.find(m => m.id === 'f14-tomcat').position[2] > -3);
  assert.ok(HANGAR_DISPLAYS.find(m => m.id === 'sd-gundam').position[2] > -3);
});

test('Sean originals fill three larger central tiers and share the cabinet architecture', () => {
  assert.equal(new Set(seanExhibits.map(m => m.position[1])).size, 3);
  for (const item of seanExhibits) {
    assert.ok(Math.abs(item.position[0]) <= 1.5 && item.position[2] === 0);
    assert.ok(item.size[0] >= 1.5 && item.size[2] >= 1.8);
  }
  const room = createHangarAtelier();
  assert.ok(room.getObjectByName('hangar-sean-displays'));
  assert.ok(room.getObjectByName('hangar-side-displays'));
  const geometries = new Set(), materials = new Set();
  room.traverse(m => { if (m.isMesh) { geometries.add(m.geometry); materials.add(m.material); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
});

test('portrait room framing retains the full central cabinet without moving the visitor', () => {
  assert.equal(hangarRoomFov(16 / 9), 58);
  const aspect = 390 / 844, distance = HANGAR_SPAWN[2] - 1.16;
  const visibleWidth = 2 * distance * Math.tan(hangarRoomFov(aspect) * Math.PI / 360) * aspect;
  assert.ok(visibleWidth > 6.5, 'the 6.1m cabinet and heading fit with margin');
  const ui = readFileSync(new URL('../src/little-universe/RoomInterior.jsx', import.meta.url), 'utf8');
  assert.match(ui, /camera.fov = hangarRoomFov/);
});
