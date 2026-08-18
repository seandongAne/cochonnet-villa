import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

import {
  applyNoteEdit,
  canonicalizeNoteMarkdown,
  canonicalizeNotesMarkdown,
  deriveNoteSlug,
  findNoteMarkdownIssues,
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
import { assertValidWebp } from "../scripts/note-art-runtime.mjs";

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

test("renderNoteBody uses safe Markdown with raw HTML and unsafe links disabled", () => {
  const html = renderNoteBody(
    '<script>alert("x")</script>\n\n**bold** and *soft*\n\n[unsafe](javascript:alert(1))'
  );

  assert.ok(!html.includes("<script>"), "raw tags must never survive");
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("<strong>bold</strong>"));
  assert.ok(html.includes("<em>soft</em>"));
  assert.ok(!html.includes('href="javascript:'), "unsafe protocols must never become links");
});

test("renderNoteBody supports standard Markdown blocks and inline syntax", () => {
  const html = renderNoteBody(
    "第一段\n第二行\n\n## 小标题\n\n### 次级标题\n\n- 一\n- 二\n\n1. 甲\n2. 乙\n\n> 引用\n\n`代码`与[链接](https://example.com)"
  );

  assert.match(html, /<p>第一段<br \/>\s*第二行<\/p>/);
  assert.ok(html.includes("<h2>小标题</h2>"));
  assert.ok(html.includes("<h3>次级标题</h3>"));
  assert.match(html, /<ul>[\s\S]*<li>一<\/li>[\s\S]*<li>二<\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<ol>[\s\S]*<li>甲<\/li>[\s\S]*<li>乙<\/li>[\s\S]*<\/ol>/);
  assert.ok(html.includes("<blockquote>"));
  assert.ok(html.includes("<code>代码</code>"));
  assert.ok(html.includes('<a href="https://example.com">链接</a>'));
});

test("renderNoteBody keeps headings as Markdown blocks without blank lines", () => {
  const html = renderNoteBody("开头\n## 一\n正文一\n## 二\n正文二");

  assert.equal(
    html,
    "<p>开头</p>\n<h2>一</h2>\n<p>正文一</p>\n<h2>二</h2>\n<p>正文二</p>"
  );
  assert.doesNotMatch(html, /(?:^|<br \/>)## /);
});

test("compact legacy headings are diagnosed and canonicalized before Markdown parsing", () => {
  const compact = "##紧凑标题\n正文\n###次级标题";
  const issues = findNoteMarkdownIssues(compact);

  assert.deepEqual(
    issues.map(({ code, line }) => ({ code, line })),
    [
      { code: "compact-heading", line: 1 },
      { code: "compact-heading", line: 3 }
    ]
  );
  assert.match(renderNoteBody(compact), /<p>##紧凑标题/);

  const canonical = canonicalizeNoteMarkdown(compact);
  assert.equal(canonical, "## 紧凑标题\n正文\n### 次级标题");
  assert.equal(findNoteMarkdownIssues(canonical).length, 0);
  assert.match(renderNoteBody(canonical), /<h2>紧凑标题<\/h2>/);
  assert.match(renderNoteBody(canonical), /<h3>次级标题<\/h3>/);
});

test("Markdown canonicalization never rewrites fenced code or single-hash tags", () => {
  const source = "#话题\n\n```md\n##代码示例\n```\n\n##正文标题";

  assert.equal(
    canonicalizeNoteMarkdown(source),
    "#话题\n\n```md\n##代码示例\n```\n\n## 正文标题"
  );
  assert.deepEqual(findNoteMarkdownIssues(source).map((issue) => issue.line), [7]);
});

test("every stored note is canonical Markdown and all headings render", () => {
  for (const note of normalizeNotes(notesData)) {
    const sourceHeadingCount = note.body.match(/^ {0,3}#{1,6}[ \t]+\S.*$/gm)?.length ?? 0;
    const renderedHeadingCount = renderNoteBody(note.body).match(/<h[1-6]>/g)?.length ?? 0;

    assert.deepEqual(findNoteMarkdownIssues(note.body), [], note.slug);
    assert.equal(canonicalizeNoteMarkdown(note.body), note.body, note.slug);
    assert.equal(renderedHeadingCount, sourceHeadingCount, note.slug);
  }
});

test("noteExcerpt strips markup and truncates with an ellipsis", () => {
  assert.equal(
    noteExcerpt("## 标题\n\n- **重点**内容\n\n[链接](https://example.com)与`代码`"),
    "标题 重点内容 链接与代码"
  );

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

  assert.ok(html.includes("<h2>段落</h2>"));
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
    body: "##新小标题\n新正文"
  });

  assert.equal(slug, "2026-06-01");
  assert.equal(notes.length, 2);
  const edited = notes.find((note) => note.slug === "2026-06-01");
  assert.equal(edited.title, "新标题");
  assert.equal(edited.body, "## 新小标题\n新正文", "editor saves canonical Markdown");
  assert.equal(edited.image, "/notes-art/2026-06-01.webp", "art survives an edit");
});

test("canonicalizeNotesMarkdown upgrades legacy staged drafts before publish", () => {
  const notes = canonicalizeNotesMarkdown([
    {
      slug: "legacy-draft",
      title: "旧草稿",
      date: "2026-06-02",
      body: "##旧标题\n正文",
      image: "/notes-art/legacy-draft.webp"
    }
  ]);

  assert.equal(notes[0].body, "## 旧标题\n正文");
  assert.equal(notes[0].image, "/notes-art/legacy-draft.webp");
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

test("every configured local note image exists, is valid WebP, and has no orphan peer", async () => {
  const artDirectory = new URL("../public/notes-art/", import.meta.url);
  const notes = normalizeNotes(notesData);
  const expected = notes
    .map(({ image }) => image)
    .filter((image) => image?.startsWith("/notes-art/"))
    .map((image) => image.slice("/notes-art/".length))
    .sort();
  const actual = (await readdir(artDirectory)).filter((name) => name.endsWith(".webp")).sort();

  assert.deepEqual(actual, expected);
  for (const note of notes.filter(({ image }) => image?.startsWith("/notes-art/"))) {
    assert.equal(note.image, `/notes-art/${note.slug}.webp`);
  }
  for (const filename of actual) {
    const bytes = await readFile(new URL(filename, artDirectory));
    assert.doesNotThrow(() => assertValidWebp(bytes));
  }
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
  const workflow = (
    await readFile(
      new URL("../.github/workflows/generate-note-art.yml", import.meta.url),
      "utf8"
    )
  ).replace(/\r\n?/g, "\n");
  const installIndex = workflow.indexOf(
    "run: npm ci --ignore-scripts --no-audit --no-fund"
  );
  const generatorIndex = workflow.indexOf("run: node scripts/generate-note-art.mjs");

  const pushTrigger = workflow.match(/on:\n([\s\S]*?)\n  workflow_dispatch:/)?.[1] ?? "";
  const commitStep = workflow.match(
    /- name: Commit art and redeploy\n([\s\S]*?)\n      - name: Surface generation failures/
  )?.[1] ?? "";
  const failureStep = workflow.match(/- name: Surface generation failures\n([\s\S]*)$/)?.[1] ?? "";

  assert.ok(pushTrigger.includes('"content/notes.json"'), "triggers on notes content changes");
  assert.ok(pushTrigger.includes('"public/notes-art/**"'), "repairs direct local-art changes");
  assert.ok(generatorIndex >= 0, "runs the generator in an executable step");
  assert.ok(installIndex >= 0, "installs locked runtime dependencies on the clean runner");
  assert.ok(installIndex < generatorIndex, "installs dependencies before importing the generator");
  assert.ok(workflow.includes("secrets.OPENAI_API_KEY"), "uses the Actions secret");
  assert.match(
    workflow,
    /uses: actions\/checkout@v6[\s\S]*?with:\n\s+ref: main/,
    "starts from the latest main branch"
  );
  assert.match(workflow, /concurrency:\n\s+group: note-art\n\s+queue: max/, "queues every run");
  assert.match(
    workflow,
    /name: Generate missing note art\n\s+id: generate\n\s+continue-on-error: true/,
    "keeps the job alive long enough to preserve partial output"
  );
  assert.ok(workflow.includes("actions/upload-artifact@v7"), "keeps generated WebP files recoverable");
  assert.match(
    workflow,
    /name: Collect generated art for recovery\n\s+id: recovery\n\s+if: \$\{\{ !cancelled\(\) \}\}/,
    "collects recovery files after generator failure"
  );
  const baseIndex = commitStep.indexOf('base_sha="$(git rev-parse HEAD)"');
  const fetchIndex = commitStep.indexOf("git fetch origin main");
  const freshnessIndex = commitStep.indexOf('"$(git rev-parse FETCH_HEAD)" != "$base_sha"');
  const commitIndex = commitStep.indexOf('git commit -m "小记配图: auto-generate note art"');
  const pushIndex = commitStep.indexOf("git push origin HEAD:main");
  assert.ok(baseIndex >= 0, "records the exact checked-out main revision");
  assert.ok(
    baseIndex < fetchIndex && fetchIndex < freshnessIndex && freshnessIndex < commitIndex,
    "stops before committing when main advanced during generation"
  );
  assert.ok(commitIndex < pushIndex, "pushes only after the coarse main revision gate passes");
  assert.match(
    commitStep,
    /main changed while art was being generated[\s\S]*?exit 1/,
    "fails visibly instead of rebasing potentially stale art"
  );
  assert.doesNotMatch(workflow, /git rebase|source-manifest|NOTE_ART_SOURCE_MANIFEST/);
  assert.doesNotMatch(workflow, /git push[^\n]*--force/, "never force-pushes generated art");
  assert.ok(
    workflow.indexOf("actions/upload-artifact@v7") < workflow.indexOf("git push origin HEAD:main"),
    "uploads the exact generated image before any push can fail"
  );
  assert.ok(workflow.includes("deploy-pages.yml"), "re-dispatches the Pages deploy");
  assert.match(
    commitStep,
    /if: \$\{\{ success\(\) && steps\.generate\.outputs\.has_changes == 'true' \}\}/,
    "commits recoverable changes even when generation only partially succeeded"
  );
  assert.match(
    commitStep,
    /if \[\[ "\$\{\{ steps\.generate\.outputs\.needs_followup \}\}" == "true" \]\]; then\n\s+gh workflow run generate-note-art\.yml --ref main/,
    "explicitly queues the next capped or partial batch"
  );
  assert.match(
    failureStep,
    /if: \$\{\{ !cancelled\(\) && steps\.generate\.outcome == 'failure' \}\}[\s\S]*?exit 1/,
    "surfaces partial generation failures after preserving successful output"
  );
});

test("the notes studio blocks duplicate and no-op Publish requests", async () => {
  const admin = await readFile(new URL("../src/notes-admin.js", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/pages/admin/notes.astro", import.meta.url), "utf8");
  const publish = admin.slice(
    admin.indexOf("async function publish()"),
    admin.indexOf("async function restoreDraft()")
  );

  assert.ok(admin.includes("publishing: false"), "tracks an in-flight Publish request");
  assert.match(publish, /if \(state\.publishing\)/, "ignores a repeated in-flight click");
  assert.match(publish, /if \(!state\.dirty\)/, "does not publish an unchanged list");
  assert.ok(publish.includes("elements.publishButton.disabled = true"), "disables Publish in flight");
  assert.ok(publish.includes('setAttribute("aria-busy", "true")'), "announces Publish as busy");
  assert.ok(publish.includes('removeAttribute("aria-busy")'), "clears the busy state afterward");
  assert.match(publish, /finally \{/, "restores the Publish control after every outcome");
  assert.ok(
    publish.indexOf("if (state.publishing)") < publish.indexOf('method: "PUT"') &&
      publish.indexOf("if (!state.dirty)") < publish.indexOf('method: "PUT"'),
    "rejects duplicate/no-op requests before calling the Contents API"
  );
  assert.match(
    page,
    /id="publish-status" role="status" aria-live="polite" aria-atomic="true"/,
    "announces publish status changes to assistive technology"
  );
  assert.match(
    page,
    /<dialog[\s\S]*?id="publish-success-dialog"[\s\S]*?aria-labelledby="publish-success-title"[\s\S]*?aria-describedby="publish-success-description"/,
    "provides an accessible native success dialog"
  );
  assert.match(page, /method="dialog"[\s\S]*?>继续编辑</, "offers an obvious modal close action");
  assert.ok(admin.includes("dialog.showModal();"), "opens the success dialog modally");
  assert.ok(
    publish.indexOf("state.dirty = false") < publish.indexOf("clearDraft();") &&
      publish.indexOf("clearDraft();") < publish.indexOf("showPublishSuccess();"),
    "shows success only after GitHub accepted the publish and drafts were cleared"
  );

  // An open form that was never 收进列表 must not be silently excluded from a
  // publish (confirm first), and must survive the post-publish draft clearing.
  assert.ok(
    publish.indexOf("formIsUnstaged()") < publish.indexOf('method: "PUT"'),
    "asks about an unstaged open form before calling the Contents API"
  );
  assert.match(publish, /window\.confirm/, "publishing past an unstaged form needs explicit consent");
  assert.ok(
    publish.indexOf("clearDraft();") < publish.indexOf("saveDraft();") &&
      publish.indexOf("saveDraft();") < publish.indexOf("showPublishSuccess();"),
    "re-saves the unstaged form as a draft after the publish cleared both tiers"
  );
});

test("site navigation links to the notes page with a zh i18n key slot", () => {
  const navItem = siteData.navigation.find((item) => item.href === "/notes/");
  assert.ok(navItem, "site.json navigation includes the notes link");

  const html = renderSite(siteData, normalizeNotes(notesData));
  assert.ok(html.includes('data-i18n="nav.notes"'));
  assert.ok(html.includes('"nav.notes": "小记"') || html.includes("nav.notes"));
});
