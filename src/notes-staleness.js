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

// Fields whose divergence makes a slug genuinely contested. `image` is
// excluded on purpose: it is stamped by the note-art workflow, and
// `mergeRemoteNotes` already adopts the remote one when the local twin lacks
// it, so a differing image is never a conflict.
const CONTESTED_FIELDS = ["title", "date", "mood", "body"];

// Slugs that exist on both sides with different content. `mergeRemoteNotes`
// resolves these local-wins, so after a sync the next publish would overwrite
// whatever the other device wrote for them — the one case where the author
// really can lose someone's work by syncing, and therefore the one case the
// banner has to name out loud.
//
// Not detected: a note the remote *deleted* that this tab still holds. The
// editor keeps no record of which local entries came from a past read, so a
// remote deletion is indistinguishable from a locally-drafted new note; the
// wording below simply never promises that side is safe.
export function findMergeConflicts(localNotes, remoteNotes) {
  const local = Array.isArray(localNotes) ? localNotes : [];
  const remote = Array.isArray(remoteNotes) ? remoteNotes : [];
  const remoteBySlug = new Map(remote.map((note) => [note?.slug, note]));

  return local
    .filter((note) => {
      const twin = remoteBySlug.get(note?.slug);

      if (!twin) {
        return false;
      }

      return CONTESTED_FIELDS.some(
        (field) => String(note?.[field] ?? "") !== String(twin?.[field] ?? "")
      );
    })
    .map((note) => String(note?.title ?? "").trim() || String(note?.slug ?? ""));
}

// The notice has to survive the author acting on it, so it promises only what
// `fetchNotes({ discardLocal: false })` actually does:
//   - clean tab  → the remote list replaces the local one outright; safe.
//   - dirty, no contested slug → remote additions come in, local edits stay.
//   - dirty, contested slug → local wins those, so the other device's version
//     of exactly those notes is what a later publish will overwrite. Say so,
//     by name, instead of claiming nothing is lost.
export function describeStaleNotice({ dirty = false, conflicts = [] } = {}) {
  const contested = (Array.isArray(conflicts) ? conflicts : []).filter(Boolean);

  if (dirty && contested.length) {
    const names = contested.map((title) => `《${title}》`).join("、");
    return `网站上的小记在别处更新过，其中 ${names} 你这边也改过。点「同步最新内容」会以你的版本为准，别处对这几篇的改动会在你发布时被覆盖——要留着它们，先去网站上看一眼再决定。`;
  }

  if (dirty) {
    return "网站上的小记在别处更新过。你有还没发布的修改：点「同步最新内容」会把远端的新内容并进来，你没发布的修改会原样保留。";
  }

  return "网站上的小记在别处更新过，这个标签页看到的已经不是最新的。点「同步最新内容」拿最新的一份，再接着写。";
}
