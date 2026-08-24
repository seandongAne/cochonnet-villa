import test from "node:test";
import assert from "node:assert/strict";

import {
  REMOTE_CHECK_THROTTLE_MS,
  shouldCheckRemoteSha,
  deriveRemoteFreshness,
  findMergeConflicts,
  describeStaleNotice
} from "../src/notes-staleness.js";

const baseline = {
  now: REMOTE_CHECK_THROTTLE_MS * 10,
  lastCheckedAt: 0,
  remoteKnown: true,
  localSha: "abc123",
  publishing: false,
  checking: false
};

test("a settled tab with a known baseline is worth re-checking", () => {
  assert.equal(shouldCheckRemoteSha(baseline), true);
});

test("no baseline means no check: publishing force-syncs that case anyway", () => {
  assert.equal(shouldCheckRemoteSha({ ...baseline, remoteKnown: false }), false);
  assert.equal(shouldCheckRemoteSha({ ...baseline, localSha: "" }), false);
  assert.equal(shouldCheckRemoteSha({ ...baseline, localSha: "   " }), false);
});

test("never race an in-flight publish or another check", () => {
  assert.equal(shouldCheckRemoteSha({ ...baseline, publishing: true }), false);
  assert.equal(shouldCheckRemoteSha({ ...baseline, checking: true }), false);
});

test("alt-tabbing repeatedly is throttled, and the throttle eventually opens", () => {
  const now = 5_000_000;

  assert.equal(
    shouldCheckRemoteSha({ ...baseline, now, lastCheckedAt: now - 1_000 }),
    false,
    "a check seconds ago should not be repeated"
  );
  assert.equal(
    shouldCheckRemoteSha({
      ...baseline,
      now,
      lastCheckedAt: now - REMOTE_CHECK_THROTTLE_MS + 1
    }),
    false,
    "just inside the window still holds"
  );
  assert.equal(
    shouldCheckRemoteSha({
      ...baseline,
      now,
      lastCheckedAt: now - REMOTE_CHECK_THROTTLE_MS
    }),
    true,
    "the boundary itself is allowed through"
  );
});

test("a matching sha is fresh; a different one is stale", () => {
  assert.equal(
    deriveRemoteFreshness({ localSha: "abc123", remote: { exists: true, sha: "abc123" } }),
    "fresh"
  );
  assert.equal(
    deriveRemoteFreshness({ localSha: "abc123", remote: { exists: true, sha: "def456" } }),
    "stale"
  );
});

test("a failed request never reports staleness — the notice must not cry wolf", () => {
  assert.equal(deriveRemoteFreshness({ localSha: "abc123", remote: null }), "unknown");
  assert.equal(
    deriveRemoteFreshness({ localSha: "abc123", remote: { exists: true, sha: "" } }),
    "unknown"
  );
  assert.equal(
    deriveRemoteFreshness({ localSha: "", remote: { exists: true, sha: "abc123" } }),
    "unknown"
  );
});

test("a vanished remote file is stale: this tab's sha can no longer be honoured", () => {
  assert.equal(
    deriveRemoteFreshness({ localSha: "abc123", remote: { exists: false, sha: "", notes: [] } }),
    "stale"
  );
});

test("the notice tells the author which of merge or replace is coming", () => {
  const dirty = describeStaleNotice({ dirty: true });
  const clean = describeStaleNotice({ dirty: false });

  assert.notEqual(dirty, clean);
  // A dirty tab must be promised its unpublished edits survive the sync,
  // because `fetchNotes({ discardLocal: false })` merges rather than replaces.
  assert.match(dirty, /还没发布的修改/);
  assert.match(dirty, /原样保留/);
  assert.match(clean, /不是最新/);
});

// mergeRemoteNotes resolves same-slug clashes local-wins, so a contested slug
// means the other device's version is what a later publish overwrites. The
// banner must not paper over that.
test("a slug both sides edited is reported as contested, by title", () => {
  const local = [{ slug: "2026-08-23", title: "周末", date: "2026-08-23", mood: "", body: "我改的" }];
  const remote = [{ slug: "2026-08-23", title: "周末", date: "2026-08-23", mood: "", body: "别处改的" }];

  assert.deepEqual(findMergeConflicts(local, remote), ["周末"]);
});

test("untouched twins, local-only drafts and remote-only notes are not conflicts", () => {
  const shared = { slug: "2026-08-21", title: "唱歌记", date: "2026-08-21", mood: "笑", body: "一样的正文" };

  assert.deepEqual(
    findMergeConflicts([{ ...shared }], [{ ...shared }]),
    [],
    "identical twins are not contested"
  );
  assert.deepEqual(
    findMergeConflicts([{ slug: "2026-08-24", title: "新写的", body: "草稿" }], [{ ...shared }]),
    [],
    "a local-only draft has nothing to contest"
  );
  assert.deepEqual(
    findMergeConflicts([], [{ ...shared }]),
    [],
    "a remote-only note is merely appended"
  );
});

test("a differing image alone is never a conflict — the art workflow stamps it", () => {
  const local = [{ slug: "2026-08-23", title: "周末", date: "2026-08-23", mood: "", body: "同样的正文" }];
  const remote = [
    { slug: "2026-08-23", title: "周末", date: "2026-08-23", mood: "", body: "同样的正文", image: "/notes-art/2026-08-23.webp" }
  ];

  assert.deepEqual(findMergeConflicts(local, remote), []);
});

test("contested slugs are named in the notice instead of promising nothing is lost", () => {
  const notice = describeStaleNotice({ dirty: true, conflicts: ["周末", "唱歌记"] });

  assert.match(notice, /《周末》/);
  assert.match(notice, /《唱歌记》/);
  assert.match(notice, /被覆盖/);
  // The reassuring wording must not survive alongside a real conflict.
  assert.doesNotMatch(notice, /原样保留/);
});

test("conflicts are ignored for a clean tab, which is replaced outright", () => {
  assert.equal(
    describeStaleNotice({ dirty: false, conflicts: ["周末"] }),
    describeStaleNotice({ dirty: false })
  );
});
