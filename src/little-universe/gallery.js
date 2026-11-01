// Public art collection: independent copies and timestamps only.
import collection from '../../content/gallery.json' with { type: 'json' };
export { createGalleryRoom, GALLERY_FRAME_SIZE, GALLERY_SLOTS, GALLERY_OBSTACLES } from './gallery-interior.js';
export const galleryWorks = [...collection.works].sort((a,b) => b.timestamp.localeCompare(a.timestamp) || b.number - a.number);
export const GALLERY_EXHIBITION_SIZE = 9;
export const GALLERY_TIME_ZONE = 'America/Toronto';
const weeklyCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: GALLERY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

// The local Monday date is the seed, independent of the visitor's time zone.
export function galleryWeekKey(now = new Date()) {
  const parts = Object.fromEntries(weeklyCalendar.formatToParts(new Date(now)).map(p => [p.type, p.value]));
  const monday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return monday.toISOString().slice(0, 10);
}

export function weeklyGalleryWorks(works, week = galleryWeekKey()) {
  // Canonical order makes the draw repeatable even if the manifest is reordered.
  const shuffled = [...works].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  let seed = 2166136261;
  for (const char of week) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let n = seed;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, GALLERY_EXHIBITION_SIZE);
}

// Minute-boundary checks also catch Monday midnight; focus/wake checks run immediately.
export function watchGalleryWeek(onChange, {
  now = Date.now, schedule = setTimeout, cancel = clearTimeout, subscribeWake = () => () => {},
} = {}) {
  let timer, previous, stopped = false;
  const check = () => {
    if (stopped) return;
    cancel(timer);
    const time = now(), week = galleryWeekKey(time);
    if (week !== previous) { previous = week; onChange(week); }
    timer = schedule(check, 60000 - ((time % 60000 + 60000) % 60000) + 10);
  };
  const unsubscribe = subscribeWake(check);
  check();
  return () => { stopped = true; cancel(timer); unsubscribe(); };
}
export function artworkLabel(work) { return '作品 ' + String(work.number).padStart(3, '0'); }
export function formatGalleryTimestamp(work) {
  const text = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23', timeZoneName:'short' }).format(new Date(work.timestamp));
  return text;
}
export function timestampLabel(work) { return ({ generated: '生成时间', archived: '归档时间', imported: '入藏时间' })[work.timestampKind]; }
export { createGalleryMiniature } from './destination-buildings.js';
