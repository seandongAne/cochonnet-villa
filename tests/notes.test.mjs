import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  applyNoteEdit,
  deriveNoteSlug,
  formatNoteDate,
  isValidNoteDate,
  mergeRemoteNotes,
  normalizeNotes,
  noteExcerpt,
  renderNoteBody,
  renderNotePage,
  renderNotesPage,
  renderNotesTeaser,
  sanitizeNoteImage,
  sanitizeNoteSlug
} from "../src/render-notes.js";
import { renderSite } from "../src/render-site.js";
import { buildArtPrompt, pickPendingNotes } from "../scripts/generate-note-art.mjs";

const notesData = JSON.parse(
  await readFile(new URL("../content/notes.json", import.meta.url), "utf8")
);
const siteData = JSON.parse(
  await readFile(new URL("../content/site.json", import.meta.url), "utf8")
);

test("content/notes.json normalizes into at least one valid, uniquely slugged note", () => {
  const notes = normalizeNotes(notesData);

  assert.ok(notes.length >= 1, "the journal ships with at least one note");

  const slugs = notes.map((note) => note.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs must be unique");

  for (const note of notes) {
    assert.match(note.slug, /^[a-z0-9][a-z0-9-]*$/);
    assert.ok(note.title.length > 0);
    assert.ok(note.body.length > 0);
    assert.ok(note.date === "" || isValidNoteDate(note.date));
  }
});

test("normalizeNotes sorts newest first, drops empty entries, and dedupes slugs", () => {
  const notes = normalizeNotes({
    notes: [
      { title: "old", date: "2024-01-01", body: "a" },
      { title: "", date: "2026-01-01", body: "dropped: no title" },
      { title: "dropped: no body", date: "2026-01-01", body: "   " },
      { title: "new", date: "2026-05-05", body: "b" },
      { title: "same day twin", date: "2026-05-05", body: "c" },
      { title: "bad date", date: "yesterday", body: "d" }
    ]
  });

  assert.deepEqual(
    notes.map((note) => note.title),
    ["new", "same day twin", "old", "bad date"]
  );
  assert.deepEqual(
    notes.map((note) => note.slug),
    ["2026-05-05", "2026-05-05-2", "2024-01-01", "note-6"]
  );
  assert.equal(notes.at(-1).date, "", "invalid dates are cleared and sink to the end");
});

test("deriveNoteSlug and sanitizeNoteSlug stay url-safe", () => {
  assert.equal(sanitizeNoteSlug("  Hello World! 猪 "), "hello-world");
  assert.equal(deriveNoteSlug({ date: "2026-08-07" }, new Set(["2026-08-07"])), "2026-08-07-2");
  assert.equal(deriveNoteSlug({ slug: "自定义" , date: "bad" , fallback: "note-3" }), "note-3");
});

test("renderNoteBody escapes HTML before applying markdown-lite", () => {
  const html = renderNoteBody('<script>alert("x")</script>\n\n**bold** and *soft*');

  assert.ok(!html.includes("<script>"), "raw tags must never survive");
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("<strong>bold</strong>"));
  assert.ok(html.includes("<em>soft</em>"));
});

test("renderNoteBody handles paragraphs, headings, lists, and line breaks", () => {
  const html = renderNoteBody("第一段\n第二行\n\n## 小标题\n\n- 一\n- 二\n\n结尾");

  assert.ok(html.includes("<p>第一段<br />第二行</p>"));
  assert.ok(html.includes("<h3>小标题</h3>"));
  assert.ok(html.includes("<ul><li>一</li><li>二</li></ul>"));
  assert.ok(html.includes("<p>结尾</p>"));
});

test("noteExcerpt strips markup and truncates with an ellipsis", () => {
  assert.equal(noteExcerpt("## 标题\n\n- **重点**内容"), "标题 重点内容");

  const long = noteExcerpt("字".repeat(100), 10);
  assert.equal(long.length, 11);
  assert.ok(long.endsWith("…"));
});

test("formatNoteDate renders Chinese dates and rejects invalid input", () => {
  assert.equal(formatNoteDate("2026-08-07"), "2026年8月7日");
  assert.equal(formatNoteDate("not-a-date"), "");
});

test("notes index page links every note and escapes titles", () => {
  const notes = normalizeNotes({
    notes: [{ title: '<b>脏脏猪</b>', date: "2026-08-01", body: "正文" }]
  });
  const html = renderNotesPage(notes);

  assert.ok(html.includes('href="/notes/2026-08-01/"'));
  assert.ok(html.includes("&lt;b&gt;脏脏猪&lt;/b&gt;"));
  assert.ok(!html.includes("<b>脏脏猪</b>"));
});

test("empty journal renders the empty state instead of a list", () => {
  const html = renderNotesPage([]);

  assert.ok(html.includes("notes-empty"));
  assert.ok(!html.includes("notes-list"));
});

test("note detail page renders body and adjacent-note pager", () => {
  const [note] = normalizeNotes({
    notes: [{ title: "标题", date: "2026-08-01", mood: "🐷", body: "## 段落\n\n内容" }]
  });
  const html = renderNotePage(note, {
    previousNote: { slug: "newer", title: "较新" },
    nextNote: { slug: "older", title: "较早" }
  });

  assert.ok(html.includes("<h3>段落</h3>"));
  assert.ok(html.includes('href="/notes/newer/"'));
  assert.ok(html.includes('href="/notes/older/"'));
  assert.ok(html.includes("note-mood"));
});

test("landing teaser shows at most three notes and renders nothing when empty", () => {
  const notes = normalizeNotes({
    notes: [1, 2, 3, 4, 5].map((n) => ({
      title: `note ${n}`,
      date: `2026-01-0${n}`,
      body: "body"
    }))
  });
  const teaser = renderNotesTeaser(notes);

  assert.equal((teaser.match(/class="note-card"/g) || []).length, 3);
  assert.ok(teaser.includes('id="notes"'));
  assert.ok(teaser.includes('href="/notes/"'));

  assert.equal(renderNotesTeaser([]), "");
  assert.equal(renderNotesTeaser(undefined), "");
});

test("renderSite keeps working without notes and embeds the teaser with them", () => {
  const bare = renderSite(siteData);
  assert.ok(!bare.includes('id="notes"'), "no teaser without notes");

  const withNotes = renderSite(siteData, normalizeNotes(notesData));
  assert.ok(withNotes.includes('id="notes"'));
  assert.ok(withNotes.includes('data-i18n="notes.eyebrow"'));
});

test("applyNoteEdit updates an existing slug in place and keeps its art", () => {
  const existing = normalizeNotes({
    notes: [
      { title: "老标题", date: "2026-06-01", body: "旧正文", image: "/notes-art/2026-06-01.webp" },
      { title: "别的", date: "2026-05-01", body: "b" }
    ]
  });

  const { notes, slug } = applyNoteEdit(existing, "2026-06-01", {
    title: "新标题",
    date: "2026-06-01",
    mood: "🐷",
    body: "新正文"
  });

  assert.equal(slug, "2026-06-01");
  assert.equal(notes.length, 2);
  const edited = notes.find((note) => note.slug === "2026-06-01");
  assert.equal(edited.title, "新标题");
  assert.equal(edited.image, "/notes-art/2026-06-01.webp", "art survives an edit");
});

test("applyNoteEdit inserts a restored draft whose slug is absent (never published)", () => {
  // Regression: a draft saved with editingSlug from an unpublished note must
  // land in the list after reload, not silently map over nothing.
  const remoteOnly = normalizeNotes({
    notes: [{ title: "远端", date: "2026-04-01", body: "a" }]
  });

  const { notes, slug } = applyNoteEdit(remoteOnly, "2026-08-07-2", {
    title: "恢复的草稿",
    date: "2026-08-07",
    mood: "",
    body: "找回来了"
  });

  assert.equal(slug, "2026-08-07-2", "the drafted slug is reused when free");
  assert.equal(notes.length, 2);
  assert.equal(notes[0].title, "恢复的草稿", "inserted and sorted newest-first");

  const noSlug = applyNoteEdit(remoteOnly, null, {
    title: "全新",
    date: "2026-04-01",
    mood: "",
    body: "b"
  });
  assert.equal(noSlug.slug, "2026-04-01-2", "new note without a draft slug derives and dedupes");
});

test("mergeRemoteNotes keeps local edits on clashes and appends remote-only notes", () => {
  // Regression: staging a note while the initial fetch is in flight must not
  // be clobbered when the response lands.
  const local = normalizeNotes({
    notes: [{ title: "本地已改", date: "2026-07-01", body: "本地版本" }]
  });
  const remote = normalizeNotes({
    notes: [
      { title: "远端旧版", date: "2026-07-01", body: "远端版本" },
      { title: "远端独有", date: "2026-06-01", body: "b" }
    ]
  });

  const merged = mergeRemoteNotes(local, remote);

  assert.equal(merged.length, 2);
  assert.equal(merged.find((note) => note.slug === "2026-07-01").body, "本地版本", "local wins");
  assert.ok(merged.some((note) => note.title === "远端独有"), "remote-only appended");
});

test("mergeRemoteNotes adopts remote art the workflow stamped meanwhile", () => {
  const local = normalizeNotes({
    notes: [{ title: "本地草稿版", date: "2026-07-01", body: "本地正文" }]
  });
  const remote = normalizeNotes({
    notes: [
      { title: "远端版", date: "2026-07-01", body: "远端正文", image: "/notes-art/2026-07-01.webp" }
    ]
  });

  const [merged] = mergeRemoteNotes(local, remote);

  assert.equal(merged.body, "本地正文", "local content still wins");
  assert.equal(merged.image, "/notes-art/2026-07-01.webp", "remote art is inherited");
});

test("normalizeNotes preserves safe art images and drops unsafe ones", () => {
  const notes = normalizeNotes({
    notes: [
      { title: "with art", date: "2026-03-01", body: "a", image: "/notes-art/x.webp" },
      { title: "unsafe art", date: "2026-02-01", body: "b", image: "javascript:alert(1)" },
      { title: "no art", date: "2026-01-01", body: "c" }
    ]
  });

  assert.equal(notes[0].image, "/notes-art/x.webp");
  assert.ok(!("image" in notes[1]), "unsafe schemes are dropped");
  assert.ok(!("image" in notes[2]), "absent image stays absent");
  assert.equal(sanitizeNoteImage("https://example.com/pig.png"), "https://example.com/pig.png");
  assert.equal(sanitizeNoteImage("data:text/html,x"), "");
});

test("note pages and cards render the art image with an escaped src", () => {
  const [note] = normalizeNotes({
    notes: [{ title: "带图", date: "2026-03-01", body: "正文", image: '/notes-art/a".webp' }]
  });

  const detail = renderNotePage(note, {});
  assert.ok(detail.includes('<figure class="note-art">'));
  assert.ok(detail.includes("/notes-art/a&quot;.webp"));

  const index = renderNotesPage([note]);
  assert.ok(index.includes('class="note-card-art"'));

  const [plain] = normalizeNotes({ notes: [{ title: "无图", date: "2026-03-02", body: "正文" }] });
  assert.ok(!renderNotePage(plain, {}).includes('<figure class="note-art">'));
});

test("art prompt carries the note content and the no-text instruction", () => {
  const prompt = buildArtPrompt({ title: "星空夜", body: "## 今晚\n\n看到了**流星**。" });

  assert.ok(prompt.includes("《星空夜》"));
  assert.ok(prompt.includes("看到了流星"), "body excerpt is plain text, not markdown");
  assert.ok(prompt.includes("不要出现任何文字"));
});

test("pickPendingNotes selects only real notes without art, with page-matching slugs", () => {
  const pending = pickPendingNotes([
    { title: "has art", date: "2026-05-01", body: "a", image: "/notes-art/has-art.webp" },
    { title: "needs art", date: "2026-05-01", body: "b" },
    { title: "", date: "2026-05-02", body: "dropped" },
    { title: "also needs", date: "2026-05-02", body: "c" }
  ]);

  assert.deepEqual(
    pending.map((entry) => entry.slug),
    ["2026-05-01-2", "2026-05-02"],
    "slug derivation matches normalizeNotes (taken set includes noted-with-art)"
  );
});

test("the note-art workflow wires the script to notes.json pushes and the API secret", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/generate-note-art.yml", import.meta.url),
    "utf8"
  );

  assert.ok(workflow.includes("content/notes.json"), "triggers on notes content changes");
  assert.ok(workflow.includes("scripts/generate-note-art.mjs"), "runs the generator");
  assert.ok(workflow.includes("secrets.OPENAI_API_KEY"), "uses the Actions secret");
  assert.match(workflow, /ref:\s*main/, "starts from the latest main branch");
  assert.match(workflow, /fetch-depth:\s*0/, "has enough history to rebase generated art");
  assert.ok(workflow.includes("actions/upload-artifact@v7"), "keeps generated WebP files recoverable");
  assert.ok(workflow.includes("for attempt in 1 2 3"), "bounds stale-main retries");
  assert.ok(workflow.includes("git rebase origin/main"), "integrates main before pushing art");
  assert.doesNotMatch(workflow, /git push[^\n]*--force/, "never force-pushes generated art");
  assert.ok(
    workflow.indexOf("actions/upload-artifact@v7") < workflow.indexOf("git push origin HEAD:main"),
    "uploads the exact generated image before any push can fail"
  );
  assert.ok(workflow.includes("deploy-pages.yml"), "re-dispatches the Pages deploy");
});

test("the notes studio blocks duplicate and no-op Publish requests", async () => {
  const admin = await readFile(new URL("../src/notes-admin.js", import.meta.url), "utf8");
  const publish = admin.slice(
    admin.indexOf("async function publish()"),
    admin.indexOf("async function restoreDraft()")
  );

  assert.ok(admin.includes("publishing: false"), "tracks an in-flight Publish request");
  assert.match(publish, /if \(state\.publishing\)/, "ignores a repeated in-flight click");
  assert.match(publish, /if \(!state\.dirty\)/, "does not publish an unchanged list");
  assert.ok(publish.includes("elements.publishButton.disabled = true"), "disables Publish in flight");
  assert.match(publish, /finally \{/, "restores the Publish control after every outcome");
  assert.ok(
    publish.indexOf("if (state.publishing)") < publish.indexOf('method: "PUT"') &&
      publish.indexOf("if (!state.dirty)") < publish.indexOf('method: "PUT"'),
    "rejects duplicate/no-op requests before calling the Contents API"
  );
});

test("site navigation links to the notes page with a zh i18n key slot", () => {
  const navItem = siteData.navigation.find((item) => item.href === "/notes/");
  assert.ok(navItem, "site.json navigation includes the notes link");

  const html = renderSite(siteData, normalizeNotes(notesData));
  assert.ok(html.includes('data-i18n="nav.notes"'));
  assert.ok(html.includes('"nav.notes": "小记"') || html.includes("nav.notes"));
});
