// 猪猪小记 (Piggy Notes) — node-pure content pipeline shared by the Astro
// build, the landing-page teaser, the /admin/notes/ browser editor, and the
// node test suite. No window/document access at import time.

const NOTE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const NOTES_INDEX_URL = "/notes/";
const NOTES_EDITOR_URL = "/admin/notes/";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

export function sanitizeNoteSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidNoteDate(value) {
  return NOTE_DATE_PATTERN.test(String(value ?? "").trim());
}

export function deriveNoteSlug({ slug, date, fallback = "note" } = {}, takenSlugs = new Set()) {
  const base =
    sanitizeNoteSlug(slug) ||
    (isValidNoteDate(date) ? String(date).trim() : "") ||
    sanitizeNoteSlug(fallback) ||
    "note";

  let candidate = base;
  let suffix = 2;

  while (takenSlugs.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function normalizeNotes(data) {
  const rawList = Array.isArray(data) ? data : Array.isArray(data?.notes) ? data.notes : [];
  const taken = new Set();
  const notes = [];

  rawList.forEach((raw, index) => {
    const title = String(raw?.title ?? "").trim();
    const body = String(raw?.body ?? "").replace(/\r\n?/g, "\n").trim();

    if (!title || !body) {
      return;
    }

    const date = isValidNoteDate(raw?.date) ? String(raw.date).trim() : "";
    const slug = deriveNoteSlug({ slug: raw?.slug, date, fallback: `note-${index + 1}` }, taken);
    taken.add(slug);

    notes.push({
      slug,
      title,
      date,
      mood: String(raw?.mood ?? "").trim().slice(0, 8),
      body
    });
  });

  // Newest first; undated entries sink to the end. Array.prototype.sort is
  // stable, so same-day notes keep their stored order.
  return notes.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export function formatNoteDate(date) {
  if (!isValidNoteDate(date)) {
    return "";
  }

  const [year, month, day] = String(date).trim().split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function renderInline(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

// Markdown-lite: blank lines split blocks; "## " headings, "- " lists,
// **bold**, *italic*. Everything is HTML-escaped before markup is applied,
// so raw note text can never inject tags.
export function renderNoteBody(body) {
  const blocks = String(body ?? "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const html = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      continue;
    }

    if (lines.every((line) => line.startsWith("- "))) {
      html.push(`<ul>${lines.map((line) => `<li>${renderInline(line.slice(2))}</li>`).join("")}</ul>`);
      continue;
    }

    let rest = lines;

    if (lines[0].startsWith("## ")) {
      html.push(`<h3>${renderInline(lines[0].slice(3))}</h3>`);
      rest = lines.slice(1);
    }

    if (rest.length) {
      html.push(`<p>${rest.map((line) => renderInline(line)).join("<br />")}</p>`);
    }
  }

  return html.join("\n");
}

export function noteExcerpt(body, maxLength = 72) {
  const plain = String(body ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/^##\s+/gm, "")
    .replace(/^-\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= maxLength) {
    return plain;
  }

  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

function renderNoteMeta(note) {
  const date = note.date
    ? `<time datetime="${escapeHtml(note.date)}">${escapeHtml(formatNoteDate(note.date))}</time>`
    : "";
  const mood = note.mood ? `<span class="note-mood">${escapeHtml(note.mood)}</span>` : "";

  if (!date && !mood) {
    return "";
  }

  return `<div class="note-meta">${date}${mood}</div>`;
}

// The landing teaser participates in the homepage's EN/zh toggle (data-i18n +
// English default); the /notes/ pages are Chinese-first with no toggle script.
function renderNoteCard(note, { bilingual = false } = {}) {
  const readMore = bilingual
    ? '<span class="note-more" data-i18n="notes.readMore">Read the note</span>'
    : '<span class="note-more">读全文</span>';

  return `
    <a class="note-card" href="${NOTES_INDEX_URL}${escapeHtml(note.slug)}/">
      ${renderNoteMeta(note)}
      <h3>${escapeHtml(note.title)}</h3>
      <p>${escapeHtml(noteExcerpt(note.body))}</p>
      ${readMore}
    </a>
  `;
}

// Landing-page section. Renders nothing when there are no notes so the
// homepage degrades cleanly (and renderSite(site) without notes stays valid).
export function renderNotesTeaser(notes, { limit = 3 } = {}) {
  const list = Array.isArray(notes) ? notes : [];

  if (!list.length) {
    return "";
  }

  return `
    <section class="notes-teaser" id="notes">
      <div class="section-heading">
        <p class="eyebrow" data-i18n="notes.eyebrow">Piggy Notes</p>
        <h2 data-i18n="notes.title">Little notes from around the villa.</h2>
        <p data-i18n="notes.text">
          Everyday moments, porky news, and small thoughts — kept in one cozy journal.
        </p>
      </div>
      <div class="notes-grid">
        ${list.slice(0, limit).map((note) => renderNoteCard(note, { bilingual: true })).join("")}
      </div>
      <div class="notes-actions">
        <a class="button button-secondary" href="${NOTES_INDEX_URL}">
          <span data-i18n="notes.viewAll">Read all notes</span>
        </a>
      </div>
    </section>
  `;
}

function renderNotesHeader() {
  return `
    <header class="site-header">
      <a class="brand" href="/">猪猪山庄</a>
      <div class="header-actions">
        <nav class="site-nav" aria-label="猪猪小记">
          <a href="/">首页</a>
          <a href="/villa-map/">山庄地图</a>
          <a href="${NOTES_EDITOR_URL}">写小记</a>
        </nav>
      </div>
    </header>
  `;
}

function renderNotesFooter() {
  return `
    <footer class="site-footer">
      <p>猪猪山庄的小本子，随手记下山庄里的日常。</p>
      <div class="footer-links">
        <a href="${NOTES_EDITOR_URL}">写一篇</a>
        <a href="/">返回首页</a>
      </div>
    </footer>
  `;
}

// /notes/ index page body fragment (the journal is Chinese-first by design —
// the notes themselves are personal essays, unlike the bilingual landing page).
export function renderNotesPage(notes) {
  const list = Array.isArray(notes) ? notes : [];

  const items = list.length
    ? `
      <ol class="notes-list">
        ${list.map((note) => `<li>${renderNoteCard(note)}</li>`).join("")}
      </ol>
    `
    : `
      <div class="notes-empty">
        <p>小本子还空着。去<a href="${NOTES_EDITOR_URL}">写下第一篇小记</a>吧。</p>
      </div>
    `;

  return `
    <div class="page-shell notes-shell">
      ${renderNotesHeader()}
      <main class="notes-main">
        <section class="section-heading">
          <p class="eyebrow">猪猪小记</p>
          <h1>山庄随笔</h1>
          <p>猪猪山庄的日常、小猪们的新鲜事，和一些突然想说的话。</p>
        </section>
        ${items}
      </main>
      ${renderNotesFooter()}
    </div>
  `;
}

function renderAdjacentLink(note, className, label) {
  if (!note) {
    return "";
  }

  return `
    <a class="note-adjacent ${className}" href="${NOTES_INDEX_URL}${escapeHtml(note.slug)}/">
      <span class="note-adjacent-label">${label}</span>
      <span class="note-adjacent-title">${escapeHtml(note.title)}</span>
    </a>
  `;
}

// /notes/<slug>/ detail page body fragment. previousNote = the newer note,
// nextNote = the older one (list order is newest first).
export function renderNotePage(note, { previousNote = null, nextNote = null } = {}) {
  const pager =
    previousNote || nextNote
      ? `
        <nav class="note-pager" aria-label="相邻小记">
          ${renderAdjacentLink(previousNote, "is-previous", "较新一篇")}
          ${renderAdjacentLink(nextNote, "is-next", "较早一篇")}
        </nav>
      `
      : "";

  return `
    <div class="page-shell notes-shell">
      ${renderNotesHeader()}
      <main class="notes-main">
        <article class="note-article">
          <header class="note-article-header">
            ${renderNoteMeta(note)}
            <h1>${escapeHtml(note.title)}</h1>
          </header>
          <div class="note-body">
            ${renderNoteBody(note.body)}
          </div>
        </article>
        ${pager}
        <p class="note-back"><a href="${NOTES_INDEX_URL}">← 回到全部小记</a></p>
      </main>
      ${renderNotesFooter()}
    </div>
  `;
}
