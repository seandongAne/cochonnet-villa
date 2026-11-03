// One shared calendar drives this welcome and the portrait decorations.
const calendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function entryVisitKey(now = new Date(), preview = false) {
  return `villa-entry:${preview ? 'preview:' : ''}${calendar.format(now)}`;
}

export function claimEntryVisit(storage, key) {
  try {
    if (storage?.getItem(key) === 'seen') return false;
    storage?.setItem(key, 'seen');
  } catch { /* A blocked storage API must not prevent the welcome or navigation. */ }
  return true;
}

const bursts = [
  [.15, .24, 0, '#f7d88b'], [.84, .27, .9, '#f3b0ca'],
  [.12, .72, 1.8, '#b9ddca'], [.88, .74, 2.7, '#e5c3fa'],
  [.5, .14, 3.6, '#f7d88b'], [.25, .43, 4.1, '#f3b0ca'], [.76, .48, 4.7, '#b9ddca'],
];

export function startEntrySparkles(canvas, { window, document }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, frame = 0, elapsed = 0, previous = null, stopped = false;
  function draw() {
    ctx.clearRect(0, 0, width, height);
    const radius = Math.min(width * .23, height * .2, 200);
    for (const [bx, by, delay, color] of bursts) {
      const age = motion.matches ? 1.5 : elapsed - delay;
      if (age < 0 || age > 3.6) continue;
      const t = age / 3.6;
      const spread = (1 - Math.exp(-4 * t)) * radius;
      const fall = t * t * radius * .35;
      ctx.fillStyle = ctx.strokeStyle = color;
      ctx.globalAlpha = motion.matches ? .32 : Math.min(1, t * 14) * (1 - t) ** 1.4;
      for (let i = 0; i < 48; i++) {
        const angle = i * Math.PI / 24;
        const length = i % 3 === 0 ? .65 : 1;
        const dx = Math.cos(angle) * spread * length, dy = Math.sin(angle) * spread * length;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(width * bx + dx * .82, height * by + dy * .82 + fall);
        ctx.lineTo(width * bx + dx, height * by + dy + fall); ctx.stroke();
        ctx.beginPath(); ctx.arc(width * bx + dx, height * by + dy + fall, 1.7, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function tick(time) {
    if (stopped) return;
    if (previous !== null) elapsed += Math.min((time - previous) / 1000, .05);
    previous = time; draw();
    if (elapsed < 8.4) frame = window.requestAnimationFrame(tick);
  }
  function resume() {
    window.cancelAnimationFrame(frame); previous = null;
    if (stopped) return;
    draw();
    if (!document.hidden && !motion.matches && elapsed < 8.4) frame = window.requestAnimationFrame(tick);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  const observer = new window.ResizeObserver(resize);
  observer.observe(canvas); resize(); resume();
  motion.addEventListener('change', resume);
  document.addEventListener('visibilitychange', resume);
  return () => {
    stopped = true; window.cancelAnimationFrame(frame); observer.disconnect();
    motion.removeEventListener('change', resume);
    document.removeEventListener('visibilitychange', resume);
  };
}

export function createEntryGreeting({ window, document, location, now = () => new Date() }) {
  let dialog = null, stopSparkles = () => {}, lastFocus = null, active = false;
  const seen = new Set();
  const preview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    && new URLSearchParams(location.search).get('decor') === 'on';
  function close() {
    if (!dialog) return;
    stopSparkles();
    dialog.close(); dialog.remove(); dialog = null;
    document.documentElement.classList.remove('entry-greeting-open');
    if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  }
  function setActive(value) {
    active = value;
    if (!active) { close(); return; }
    if (document.hidden || dialog) return;
    const key = entryVisitKey(now(), preview);
    let storage;
    try { storage = window.sessionStorage; } catch { /* In-memory fallback below. */ }
    if (seen.has(key) || !claimEntryVisit(storage, key)) return;
    seen.add(key);
    lastFocus = document.activeElement;
    dialog = document.createElement('dialog');
    // Browsers without dialog modals (Safari before 15.4) skip the welcome
    // rather than leaving a scroll-locked overlay that Escape cannot close.
    if (typeof dialog.showModal !== 'function') { dialog = null; return; }
    dialog.className = 'entry-greeting';
    dialog.lang = 'zh-Hans';
    dialog.setAttribute('aria-labelledby', 'entry-greeting-title');
    dialog.setAttribute('aria-describedby', 'entry-greeting-message');
    dialog.innerHTML = `<canvas class="entry-sparkles" aria-hidden="true"></canvas>
      <div class="entry-greeting-card">
        <p class="entry-greeting-eyebrow">WITH LOVE, FROM ALL FIFTEEN OF US</p>
        <div class="entry-greeting-stars" aria-hidden="true">✦ <span>✧</span> ✦</div>
        <p class="entry-greeting-english">Happy birthday, Cabbage.</p>
        <h1 id="entry-greeting-title">生日快乐，<br><em>白白菜。</em></h1>
        <p id="entry-greeting-message">十五只小猪都戴好帽子，<br>一起祝你新的一岁，快乐、被爱、闪闪发光。</p>
        <form method="dialog"><button class="entry-greeting-enter" autofocus>收下祝福，进来看看 <span aria-hidden="true">↗</span></button></form>
        <p class="entry-greeting-signature">Cochonnet Villa · 小猪们的家</p>
      </div>`;
    document.body.append(dialog);
    document.documentElement.classList.add('entry-greeting-open');
    dialog.addEventListener('close', close, { once: true });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.showModal();
    stopSparkles = startEntrySparkles(dialog.querySelector('canvas'), { window, document });
  }
  const wake = () => { if (!document.hidden) setActive(active); };
  document.addEventListener('visibilitychange', wake);
  return { setActive, destroy() { active = false; close(); document.removeEventListener('visibilitychange', wake); } };
}
