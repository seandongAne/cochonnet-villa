// 猪猪小记 draft payload semantics — node-pure so the restore/backup policy
// (what survives a crash, which copy wins) stays unit-tested. Consumed by the
// /admin/notes/ editor for both tiers: the per-keystroke localStorage draft
// and the 5-minute-idle cloud backup on the `notes-drafts` branch.

import { normalizeNotes } from "./render-notes.js";

export const NOTES_DRAFT_VERSION = 2;

export function buildDraftPayload({ editingSlug, form, stagedDirty, stagedNotes, savedAt } = {}) {
  const dirty = Boolean(stagedDirty);

  return {
    version: NOTES_DRAFT_VERSION,
    savedAt: Number.isFinite(savedAt) ? savedAt : 0,
    editingSlug: typeof editingSlug === "string" && editingSlug ? editingSlug : null,
    form: {
      title: String(form?.title ?? ""),
      date: String(form?.date ?? ""),
      mood: String(form?.mood ?? ""),
      body: String(form?.body ?? "")
    },
    // The staged list is only meaningful while it differs from GitHub; a
    // clean list is re-fetched instead of restored.
    stagedDirty: dirty,
    stagedNotes: dirty ? normalizeNotes({ notes: Array.isArray(stagedNotes) ? stagedNotes : [] }) : []
  };
}

// Accepts a JSON string or object; returns a canonical payload or null.
// Legacy v1 drafts kept the form fields at the top level — still restored.
export function parseDraftPayload(raw) {
  let value = raw;

  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const form = value.form && typeof value.form === "object" ? value.form : value;

  return buildDraftPayload({
    editingSlug: typeof value.editingSlug === "string" ? value.editingSlug : null,
    form,
    stagedDirty: Boolean(value.stagedDirty) && Array.isArray(value.stagedNotes),
    stagedNotes: Array.isArray(value.stagedNotes) ? value.stagedNotes : [],
    savedAt: Number(value.savedAt) || 0
  });
}

export function draftHasContent(draft) {
  if (!draft) {
    return false;
  }

  return Boolean(
    draft.form.title.trim() ||
      draft.form.body.trim() ||
      (draft.stagedDirty && draft.stagedNotes.length)
  );
}

// Restore policy: the newer copy wins when both exist (multi-device safety);
// local wins ties, since on the active device it is keystroke-fresh while the
// cloud copy trails by up to the idle interval. Legacy drafts carry
// savedAt 0, so a timestamped copy from the other tier beats them.
export function chooseDraftSource(localDraft, cloudDraft) {
  const localOk = draftHasContent(localDraft);
  const cloudOk = draftHasContent(cloudDraft);

  if (localOk && cloudOk) {
    return cloudDraft.savedAt > localDraft.savedAt ? "cloud" : "local";
  }

  if (localOk) {
    return "local";
  }

  if (cloudOk) {
    return "cloud";
  }

  return null;
}

// Stable identity for change detection (skip cloud commits when nothing
// but the timestamp moved).
export function draftContentKey(draft) {
  if (!draft) {
    return "";
  }

  const { savedAt, ...rest } = draft;
  return JSON.stringify(rest);
}
