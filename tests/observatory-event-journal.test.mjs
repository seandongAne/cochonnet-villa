import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  countObservatoryEventSightings,
  OBSERVATORY_EVENT_JOURNAL_ACTION_TYPE,
  OBSERVATORY_EVENT_JOURNAL_STORAGE_KEY,
  readObservatoryEventJournal,
  recordObservatoryEventSighting
} from "../src/villa-map/observatory-event-journal.js";
import {
  OBSERVATORY_RARE_EVENT_IDS
} from "../src/villa-map/observatory-events.js";
import { createVillaWorld } from "../src/villa-map/world.js";
import {
  FURNITURE_PLACEMENTS
} from "../src/villa-map/furniture-placements.js";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    map
  };
}

test("an empty or absent storage reads as an empty journal", () => {
  assert.deepEqual(readObservatoryEventJournal(null).sightings, {});
  assert.deepEqual(readObservatoryEventJournal(memoryStorage()).sightings, {});
  const throwing = {
    getItem: () => {
      throw new Error("privacy mode");
    }
  };
  assert.deepEqual(readObservatoryEventJournal(throwing).sightings, {});
});

test("sightings accumulate counts and pin the first-seen timestamp", () => {
  const storage = memoryStorage();
  let journal = recordObservatoryEventSighting(storage, "comet", 1000);
  journal = recordObservatoryEventSighting(storage, "comet", 2000);
  journal = recordObservatoryEventSighting(storage, "aurora", 3000);
  assert.equal(journal.sightings.comet.count, 2);
  assert.equal(journal.sightings.comet.firstSeenAt, 1000);
  assert.equal(journal.sightings.aurora.count, 1);
  assert.equal(countObservatoryEventSightings(journal), 2);

  // Round-trips through the persisted string.
  const reread = readObservatoryEventJournal(storage);
  assert.deepEqual(reread, journal);
});

test("unknown ids, corrupt payloads and failing writes are all non-fatal", () => {
  const storage = memoryStorage();
  const journal = recordObservatoryEventSighting(storage, "not-an-event", 1);
  assert.deepEqual(journal.sightings, {});

  storage.map.set(OBSERVATORY_EVENT_JOURNAL_STORAGE_KEY, "{not json");
  assert.deepEqual(readObservatoryEventJournal(storage).sightings, {});
  storage.map.set(
    OBSERVATORY_EVENT_JOURNAL_STORAGE_KEY,
    JSON.stringify({ version: 99, sightings: { comet: { count: 5 } } })
  );
  assert.deepEqual(
    readObservatoryEventJournal(storage).sightings,
    {},
    "version mismatch resets rather than misreading"
  );

  const readOnly = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    }
  };
  const inMemory = recordObservatoryEventSighting(readOnly, "ufo", 42);
  assert.equal(inMemory.sightings.ufo.count, 1, "in-memory update survives");
});

test("every rare event id is journalable", () => {
  const storage = memoryStorage();
  let journal = null;
  for (const id of OBSERVATORY_RARE_EVENT_IDS) {
    journal = recordObservatoryEventSighting(storage, id, 7);
  }
  assert.equal(
    countObservatoryEventSightings(journal),
    OBSERVATORY_RARE_EVENT_IDS.length
  );
});

test("the wall book exists: L3 interaction zone + physical shelf and book", () => {
  const world = createVillaWorld();
  const interaction = world.interactions.find(
    (entry) => entry.action?.type === OBSERVATORY_EVENT_JOURNAL_ACTION_TYPE
  );
  assert.ok(interaction, "the journal interaction zone must exist");
  assert.match(interaction.action.label, /图鉴/);

  const shelf = FURNITURE_PLACEMENTS.find(
    (piece) => piece.id === "m3-journal-shelf"
  );
  const book = FURNITURE_PLACEMENTS.find(
    (piece) => piece.id === "m3-journal-book"
  );
  assert.ok(shelf?.wallMounted, "journal shelf must be wall-mounted on L3");
  assert.equal(book?.onWallShelfId, "m3-journal-shelf");
  assert.equal(shelf.floor, 4, "the journal lives on the mushroom loft");

  // The interaction point sits within arm's reach of the physical book.
  const dx = interaction.position.x - book.position[0];
  const dz = interaction.position.z - book.position[2];
  assert.ok(
    Math.hypot(dx, dz) < 2.5,
    "interaction zone must anchor at the shelf"
  );
});

function readVillaMapSource(file) {
  return readFileSync(
    fileURLToPath(new URL(`../src/villa-map/${file}`, import.meta.url)),
    "utf8"
  );
}

test("one E press opens the book without instantly closing it or teleporting the player", () => {
  const controls = readVillaMapSource("controls.js");
  const playerControls = readVillaMapSource("react/PlayerControls.jsx");
  const villaMap = readVillaMapSource("react/VillaMap.jsx");

  // The keydown travels with the action: controls.js listens on `document`,
  // the book's close listener on `window`, and React registers the latter in
  // a microtask between the two targets of the same in-flight event. The
  // opening handler must therefore be able to consume the keystroke.
  assert.match(controls, /onAction\?\.\(event\)/);
  assert.match(playerControls, /onOpenObservatoryJournalRef\.current\?\.\(event\)/);
  assert.match(villaMap, /const openObservatoryJournal = useCallback\(\(event\) => \{/);
  assert.match(villaMap, /event\?\.stopPropagation\?\.\(\);/);

  // Identity-stable opener: it must not churn with `exploring`, because any
  // consumer keyed on it (historically the controls-creation effect, which
  // resets the camera to the world start) would re-run mid-session.
  assert.match(villaMap, /observatoryJournalResumeRef\.current = exploringRef\.current/);

  // While the book is open the fullscreen start overlay stays away and the
  // movement bridge is suspended; closing resumes the prior session.
  assert.match(villaMap, /&& !observatoryJournalOpen && \(\s*<section className="villa-map-overlay"/);
  assert.match(villaMap, /suspended=\{qualityPanelOpen \|\| observatoryJournalOpen\}/);
  assert.match(villaMap, /const closeObservatoryJournal = useCallback\(\(\) => \{/);
  assert.match(villaMap, /if \(shouldResume\) controls\?\.lock\(\);/);
});
