// Convenience password gate for trusted visitors, not a security boundary.
// Static HTML, public GitHub data and artwork remain accessible outside this UI.
const PASSWORD_SHA256 = '33f849de3622f07a54fd0011c664a29264a30f2bf9a70fad7857b7ffa5f15e95';
const STORAGE_KEY = 'cochonnetvilla_notes_access_v1';
const SESSION_MS = 8 * 60 * 60 * 1000;
export function isNotesSessionActive(value, now = Date.now()) {
  const expiresAt = Number(value);
  return Number.isFinite(expiresAt) && expiresAt > now && expiresAt <= now + SESSION_MS;
}
export async function matchesNotesPassword(password) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('') === PASSWORD_SHA256;
}
export function initNotesAccess() {
  const gate = document.querySelector('[data-notes-gate]');
  const content = document.querySelector('[data-notes-content]');
  const form = gate.querySelector('form');
  const input = gate.querySelector('input');
  const status = gate.querySelector('[role="status"]');
  const submit = form.querySelector('button[type="submit"]');
  const lockButton = document.querySelector('[data-notes-lock]');
  let expiry = 0;
  let timer;
  function readExpiry() {
    try { return Number(sessionStorage.getItem(STORAGE_KEY)); } catch { return expiry; }
  }
  function showLocked() {
    content.hidden = true;
    gate.hidden = false;
    input.value = '';
    document.title = '猪猪小记 · 请输入密码';
  }
  function lock() {
    expiry = 0;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* In-memory lock still works. */ }
    clearTimeout(timer);
    showLocked();
    // Reinitializes the studio only after the next unlock; existing drafts persist.
    location.reload();
  }
  function showUnlocked(until) {
    expiry = until;
    gate.hidden = true;
    content.hidden = false;
    document.title = document.body.dataset.notesTitle || '猪猪小记 | Cochonnet Villa';
    clearTimeout(timer);
    timer = setTimeout(lock, Math.max(0, until - Date.now()));
  }
  lockButton.addEventListener('click', lock);
  window.addEventListener('pageshow', event => {
    if (event.persisted && !isNotesSessionActive(readExpiry())) lock();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && expiry && !isNotesSessionActive(readExpiry())) lock();
  });
  return new Promise(resolve => {
    const stored = readExpiry();
    if (isNotesSessionActive(stored)) { showUnlocked(stored); resolve(); }
    else showLocked();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      submit.disabled = true;
      status.textContent = '';
      try {
        if (!await matchesNotesPassword(input.value)) {
          status.textContent = '密码不正确，再试一次吧。';
          input.value = ''; input.focus(); return;
        }
        const until = Date.now() + SESSION_MS;
        try { sessionStorage.setItem(STORAGE_KEY, String(until)); } catch { /* Unlock the current page if storage is blocked. */ }
        input.value = '';
        showUnlocked(until);
        content.tabIndex = -1;
        content.focus({ preventScroll: true });
        resolve();
      } catch {
        status.textContent = '暂时无法解锁，请刷新页面后重试。';
      } finally { submit.disabled = false; }
    });
  });
}

