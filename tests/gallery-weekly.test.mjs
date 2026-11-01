import assert from 'node:assert/strict';
import { test } from 'node:test';
import { galleryWeekKey, weeklyGalleryWorks, watchGalleryWeek, galleryWorks, GALLERY_EXHIBITION_SIZE } from '../src/little-universe/gallery.js';
import { GALLERY_SLOTS } from '../src/little-universe/gallery-interior.js';

test('weekly exhibition follows Toronto Monday midnight across DST and year boundaries', () => {
  assert.equal(galleryWeekKey('2026-11-02T04:59:59Z'), '2026-10-26');
  assert.equal(galleryWeekKey('2026-11-02T05:00:00Z'), '2026-11-02');
  assert.equal(galleryWeekKey('2026-07-06T03:59:59Z'), '2026-06-29');
  assert.equal(galleryWeekKey('2026-07-06T04:00:00Z'), '2026-07-06');
  assert.equal(galleryWeekKey('2027-01-01T17:00:00Z'), '2026-12-28');
  assert.equal(galleryWeekKey('2027-01-04T05:00:00Z'), '2027-01-04');
});

test('nine unique works repeat within a week regardless of input order, without mutating the collection', () => {
  const before = [...galleryWorks];
  const monday = galleryWeekKey('2026-10-26T04:00:00Z');
  const sunday = galleryWeekKey('2026-11-02T04:59:59Z');
  const selected = weeklyGalleryWorks(galleryWorks, monday);
  assert.equal(selected.length, 9);
  assert.equal(GALLERY_EXHIBITION_SIZE, GALLERY_SLOTS.length);
  assert.equal(new Set(selected.map(work => work.id)).size, 9);
  assert.deepEqual(weeklyGalleryWorks([...galleryWorks].reverse(), sunday), selected);
  assert.deepEqual(galleryWorks, before);
  assert.ok(selected.every(work => galleryWorks.includes(work)));
  assert.notDeepEqual(weeklyGalleryWorks(galleryWorks, '2026-11-02').map(w => w.id).sort(), selected.map(w => w.id).sort());
  assert.deepEqual(weeklyGalleryWorks([], monday), []);
  const small = galleryWorks.slice(0, 4);
  assert.deepEqual(new Set(weeklyGalleryWorks(small, monday)), new Set(small));
});

test('an open or resumed gallery updates on week changes only and cleans up its clock', () => {
  let time = Date.parse('2026-11-02T04:59:59Z'), serial = 0, wake, unsubscribed = false;
  const jobs = new Map(), weeks = [];
  const stop = watchGalleryWeek(week => weeks.push(week), {
    now: () => time,
    schedule: (fn, delay) => { jobs.set(++serial, { fn, delay }); return serial; },
    cancel: id => jobs.delete(id),
    subscribeWake: fn => { wake = fn; return () => { unsubscribed = true; }; },
  });
  assert.deepEqual(weeks, ['2026-10-26']);
  assert.equal([...jobs.values()][0].delay, 1010);
  time = Date.parse('2026-11-02T05:00:00.010Z');
  [...jobs.values()][0].fn();
  assert.deepEqual(weeks, ['2026-10-26', '2026-11-02']);
  wake(); assert.equal(weeks.length, 2); assert.equal(jobs.size, 1);
  time = Date.parse('2026-11-09T13:00:00Z');
  wake(); assert.deepEqual(weeks, ['2026-10-26', '2026-11-02', '2026-11-09']);
  stop(); assert.equal(jobs.size, 0); assert.equal(unsubscribed, true);
  time += 7 * 86400000; wake(); assert.equal(weeks.length, 3);
});
