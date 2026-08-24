import test from "node:test";
import assert from "node:assert/strict";

import {
  REMOTE_CHECK_THROTTLE_MS,
  shouldCheckRemoteSha,
  deriveRemoteFreshness,
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
  assert.match(dirty, /都不会丢/);
  assert.match(clean, /不是最新/);
});
