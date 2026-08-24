// Stale-tab detection for /admin/notes/.
//
// An editor tab left open overnight keeps the `sha` it read when it loaded.
// If anyone publishes meanwhile — another device, or a plain `git push` —
// that sha goes stale, and the next publish fails the GitHub Contents API
// precondition with a 409. No data is lost (the publish is refused, not
// merged), but the author only discovers it after writing a whole entry.
//
// So when the tab comes back to the foreground we spend one cheap request to
// compare shas and say something up front. These helpers hold the decisions —
// when a check is worth making, what its result means, and how to phrase it —
// so they stay node-pure and unit-tested; `notes-admin.js` owns the DOM, the
// timer and the fetch.

// Coming back to a tab is a frequent event (every alt-tab fires it), so
// re-checking is throttled rather than run on each return.
export const REMOTE_CHECK_THROTTLE_MS = 2 * 60 * 1000;

export function shouldCheckRemoteSha({
  now = 0,
  lastCheckedAt = 0,
  remoteKnown = false,
  localSha = "",
  publishing = false,
  checking = false,
  throttleMs = REMOTE_CHECK_THROTTLE_MS
} = {}) {
  // Without a successful read there is no baseline to compare against, and
  // publishing already force-syncs in that case (`state.remoteKnown`).
  if (!remoteKnown || !String(localSha).trim()) {
    return false;
  }

  // Never race the publish request that is rewriting the very sha we'd read.
  if (publishing || checking) {
    return false;
  }

  return now - lastCheckedAt >= throttleMs;
}

// `remote` is a `fetchRemote()` result, or null when the request failed.
export function deriveRemoteFreshness({ localSha = "", remote = null } = {}) {
  const local = String(localSha).trim();

  if (!remote || !local) {
    return "unknown";
  }

  // The file we published against is gone (deleted, renamed, branch reset) —
  // this tab's sha can no longer be honoured, so treat it as stale.
  if (!remote.exists) {
    return "stale";
  }

  const sha = String(remote.sha ?? "").trim();

  if (!sha) {
    return "unknown";
  }

  return sha === local ? "fresh" : "stale";
}

// Syncing is safe either way — `fetchNotes({ discardLocal: false })` merges
// the remote list *underneath* unpublished local edits — but the author
// should know which of the two is about to happen.
export function describeStaleNotice({ dirty = false } = {}) {
  if (dirty) {
    return "网站上的小记在别处更新过。你有还没发布的修改：点「同步最新内容」会把远端的内容并到你的修改下面，两边都不会丢。";
  }

  return "网站上的小记在别处更新过，这个标签页看到的已经不是最新的。点「同步最新内容」拿最新的一份，再接着写。";
}
