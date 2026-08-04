// 天象图鉴 — persistence for which rare celestial events the player has
// witnessed. Node-pure and storage-failure safe, following the same versioned
// localStorage discipline as observatory-quality-preference.js: privacy-mode
// or opaque-origin storages that throw simply behave like an empty journal.

import { OBSERVATORY_RARE_EVENT_IDS } from "./observatory-events.js";

export const OBSERVATORY_EVENT_JOURNAL_ACTION_TYPE =
  "observatory-event-journal";
export const OBSERVATORY_EVENT_JOURNAL_STORAGE_KEY =
  "cochonnet-observatory-event-journal";
export const OBSERVATORY_EVENT_JOURNAL_VERSION = 1;

function emptyJournal() {
  return { version: OBSERVATORY_EVENT_JOURNAL_VERSION, sightings: {} };
}

function sanitizeJournal(parsed) {
  if (
    !parsed
    || typeof parsed !== "object"
    || parsed.version !== OBSERVATORY_EVENT_JOURNAL_VERSION
    || typeof parsed.sightings !== "object"
    || parsed.sightings === null
  ) {
    return emptyJournal();
  }
  const journal = emptyJournal();
  for (const id of OBSERVATORY_RARE_EVENT_IDS) {
    const entry = parsed.sightings[id];
    if (!entry || typeof entry !== "object") continue;
    const count = Number.isFinite(entry.count)
      ? Math.max(1, Math.floor(entry.count))
      : 1;
    const firstSeenAt = Number.isFinite(entry.firstSeenAt)
      ? entry.firstSeenAt
      : null;
    journal.sightings[id] = { count, firstSeenAt };
  }
  return journal;
}

/** Read the journal; any failure or version mismatch yields an empty one. */
export function readObservatoryEventJournal(storage) {
  try {
    const raw = storage?.getItem?.(OBSERVATORY_EVENT_JOURNAL_STORAGE_KEY);
    if (!raw) return emptyJournal();
    return sanitizeJournal(JSON.parse(raw));
  } catch {
    return emptyJournal();
  }
}

/**
 * Record one sighting and persist. Unknown event ids are ignored. Returns the
 * updated journal either way; a failing storage still returns the in-memory
 * update so the session's own panel stays truthful.
 */
export function recordObservatoryEventSighting(storage, eventId, timestamp) {
  const journal = readObservatoryEventJournal(storage);
  if (!OBSERVATORY_RARE_EVENT_IDS.includes(eventId)) return journal;
  const existing = journal.sightings[eventId];
  journal.sightings[eventId] = {
    count: (existing?.count ?? 0) + 1,
    firstSeenAt: existing?.firstSeenAt
      ?? (Number.isFinite(timestamp) ? timestamp : null)
  };
  try {
    storage?.setItem?.(
      OBSERVATORY_EVENT_JOURNAL_STORAGE_KEY,
      JSON.stringify(journal)
    );
  } catch {
    // Storage rejection (quota, privacy mode) is non-fatal by design.
  }
  return journal;
}

/** How many distinct events have been witnessed. */
export function countObservatoryEventSightings(journal) {
  return Object.keys(journal?.sightings ?? {}).length;
}
