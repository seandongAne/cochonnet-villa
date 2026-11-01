// Shared annual celebration rules. Importable without browser globals.
export const BIRTHDAY_TIME_ZONE = 'America/Toronto';
export const BIRTHDAY_MESSAGE = 'HAPPY BIRTHDAY CABBAGE';
const calendar = new Intl.DateTimeFormat('en-US', {
  timeZone: BIRTHDAY_TIME_ZONE, month: 'numeric', day: 'numeric',
});

export function isCabbageBirthday(now = new Date()) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) return false;
  const parts = calendar.formatToParts(date);
  return parts.find(p => p.type === 'month')?.value === '11'
    && parts.find(p => p.type === 'day')?.value === '1';
}

// A local preview also works with the production build. Public URLs cannot
// force the celebration on or off; no override is persisted.
export function birthdayPreview({ hostname = '', search = '' } = {}) {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return null;
  const value = new URLSearchParams(search).get('birthday');
  return value === 'on' ? true : value === 'off' ? false : null;
}

// Check at minute boundaries, including midnight. Wake immediately after a
// suspended tab resumes. Dependencies are injectable for date/cleanup tests.
export function watchBirthday(onChange, {
  now = Date.now, schedule = setTimeout, cancel = clearTimeout,
  subscribeWake = () => () => {}, preview = null,
} = {}) {
  let timer;
  let stopped = false;
  let previous;
  const check = () => {
    if (stopped) return;
    cancel(timer);
    const time = now();
    const active = preview ?? isCabbageBirthday(time);
    if (active !== previous) { previous = active; onChange(active); }
    timer = schedule(check, 60000 - ((time % 60000 + 60000) % 60000) + 10);
  };
  const unsubscribe = subscribeWake(check);
  check();
  return () => { stopped = true; cancel(timer); unsubscribe(); };
}
