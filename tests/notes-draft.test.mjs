import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NOTES_DRAFT_VERSION,
  buildDraftPayload,
  parseDraftPayload,
  draftHasContent,
  chooseDraftSource,
  draftContentKey
} from "../src/notes-draft.js";

test("buildDraftPayload canonicalizes the editor state", () => {
  const payload = buildDraftPayload({
    editingSlug: "2026-08-07",
    form: { title: "标题", date: "2026-08-07", mood: "🐷", body: "正文" },
    stagedDirty: true,
    stagedNotes: [{ title: "标题", date: "2026-08-07", body: "正文" }],
    savedAt: 1234
  });

  assert.equal(payload.version, NOTES_DRAFT_VERSION);
  assert.equal(payload.savedAt, 1234);
  assert.equal(payload.editingSlug, "2026-08-07");
  assert.equal(payload.stagedNotes.length, 1);
  assert.equal(payload.stagedNotes[0].slug, "2026-08-07");
});

test("a clean staged list is not persisted into the draft", () => {
  const payload = buildDraftPayload({
    form: { title: "只有表单", body: "正文" },
    stagedDirty: false,
    stagedNotes: [{ title: "远端笔记", date: "2026-01-01", body: "b" }],
    savedAt: 1
  });

  assert.equal(payload.stagedDirty, false);
  assert.deepEqual(payload.stagedNotes, [], "clean lists are re-fetched, not restored");
});

test("parseDraftPayload round-trips v2 and migrates legacy v1 drafts", () => {
  const v2 = buildDraftPayload({
    editingSlug: null,
    form: { title: "a", date: "2026-08-07", mood: "", body: "b" },
    stagedDirty: true,
    stagedNotes: [{ title: "a", date: "2026-08-07", body: "b" }],
    savedAt: 99
  });

  assert.deepEqual(parseDraftPayload(JSON.stringify(v2)), v2);

  const legacy = parseDraftPayload(
    JSON.stringify({ editingSlug: "2026-08-06", title: "旧草稿", date: "2026-08-06", mood: "🌙", body: "旧正文" })
  );

  assert.equal(legacy.form.title, "旧草稿");
  assert.equal(legacy.form.body, "旧正文");
  assert.equal(legacy.editingSlug, "2026-08-06");
  assert.equal(legacy.savedAt, 0, "legacy drafts carry no timestamp");

  assert.equal(parseDraftPayload("not json"), null);
  assert.equal(parseDraftPayload(null), null);
  assert.equal(parseDraftPayload("42"), null);
});

test("draftHasContent requires form text or a dirty staged list", () => {
  assert.equal(draftHasContent(null), false);
  assert.equal(draftHasContent(buildDraftPayload({ form: { title: "  ", body: "" } })), false);
  assert.equal(draftHasContent(buildDraftPayload({ form: { title: "x", body: "" } })), true);
  assert.equal(
    draftHasContent(
      buildDraftPayload({
        form: {},
        stagedDirty: true,
        stagedNotes: [{ title: "t", date: "2026-01-01", body: "b" }]
      })
    ),
    true
  );
});

test("chooseDraftSource picks the newer copy and beats legacy timestamps", () => {
  const older = buildDraftPayload({ form: { title: "旧", body: "x" }, savedAt: 100 });
  const newer = buildDraftPayload({ form: { title: "新", body: "y" }, savedAt: 200 });
  const empty = buildDraftPayload({ form: {}, savedAt: 300 });

  assert.equal(chooseDraftSource(older, newer), "cloud");
  assert.equal(chooseDraftSource(newer, older), "local");
  assert.equal(chooseDraftSource(newer, newer), "local", "ties go to the keystroke-fresh local copy");
  assert.equal(chooseDraftSource(older, empty), "local", "empty cloud never wins");
  assert.equal(chooseDraftSource(null, newer), "cloud");
  assert.equal(chooseDraftSource(empty, null), null);

  const legacyLocal = parseDraftPayload(JSON.stringify({ title: "旧本地", body: "b" }));
  assert.equal(chooseDraftSource(legacyLocal, newer), "cloud", "timestamped cloud beats legacy savedAt 0");
});

test("draftContentKey ignores savedAt so unchanged drafts skip cloud commits", () => {
  const a = buildDraftPayload({ form: { title: "同", body: "内容" }, savedAt: 1 });
  const b = buildDraftPayload({ form: { title: "同", body: "内容" }, savedAt: 2 });
  const c = buildDraftPayload({ form: { title: "不同", body: "内容" }, savedAt: 2 });

  assert.equal(draftContentKey(a), draftContentKey(b));
  assert.notEqual(draftContentKey(b), draftContentKey(c));
  assert.equal(draftContentKey(null), "");
});
