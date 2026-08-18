// Pins the floating editor window used by /admin/notes/: node-pure geometry
// (clamp/resize/maximize/default) plus the page wiring. The module must stay
// importable in Node — initNotesEditorWindow() is the only DOM entry point.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  EDITOR_WINDOW_BASE_SCALE,
  EDITOR_WINDOW_MARGIN,
  EDITOR_WINDOW_MIN,
  EDITOR_WINDOW_MIN_VIEWPORT,
  EDITOR_WINDOW_STORAGE_KEY,
  EDITOR_WINDOW_VERSION,
  clampWindowRect,
  defaultWindowRect,
  maximizedWindowRect,
  parseEditorWindowState,
  resizeWindowRect,
  scaleWindowRect,
  serializeEditorWindowState
} from "../src/notes-window.js";

const VIEWPORT = { width: 1440, height: 900 };

test("clampWindowRect keeps the window inside the viewport margin", () => {
  const clamped = clampWindowRect({ x: -400, y: 2000, width: 600, height: 500 }, VIEWPORT);

  assert.equal(clamped.x, EDITOR_WINDOW_MARGIN);
  assert.equal(clamped.y, VIEWPORT.height - 500 - EDITOR_WINDOW_MARGIN);
  assert.equal(clamped.width, 600);
  assert.equal(clamped.height, 500);
});

test("clampWindowRect shrinks an oversized window and enforces the minimum", () => {
  const oversized = clampWindowRect({ x: 0, y: 0, width: 9000, height: 9000 }, VIEWPORT);
  assert.equal(oversized.width, VIEWPORT.width - EDITOR_WINDOW_MARGIN * 2);
  assert.equal(oversized.height, VIEWPORT.height - EDITOR_WINDOW_MARGIN * 2);

  const tiny = clampWindowRect({ x: 100, y: 100, width: 10, height: 10 }, VIEWPORT);
  assert.equal(tiny.width, EDITOR_WINDOW_MIN.width);
  assert.equal(tiny.height, EDITOR_WINDOW_MIN.height);
});

test("resizeWindowRect grows from the south-east without moving the origin", () => {
  const rect = { x: 200, y: 100, width: 600, height: 500 };
  const resized = resizeWindowRect(rect, "se", 80, 60, VIEWPORT);

  assert.deepEqual(resized, { x: 200, y: 100, width: 680, height: 560 });
});

test("resizeWindowRect anchors the opposite edge when dragging west past the minimum", () => {
  const rect = { x: 200, y: 100, width: 600, height: 500 };
  const rightEdge = rect.x + rect.width;

  // Drag the west edge far to the right — width bottoms out at the minimum
  // and the window's right edge must not move.
  const resized = resizeWindowRect(rect, "w", 5000, 0, VIEWPORT);

  assert.equal(resized.width, EDITOR_WINDOW_MIN.width);
  assert.equal(resized.x + resized.width, rightEdge);
});

test("resizeWindowRect stops a dragged edge at the viewport instead of moving the anchor", () => {
  const rect = { x: 200, y: 100, width: 600, height: 500 };

  // Drag the east edge far past the right margin: the west edge must not move
  // and the east edge stops at the viewport margin.
  const east = resizeWindowRect(rect, "e", 5000, 0, VIEWPORT);
  assert.equal(east.x, rect.x);
  assert.equal(east.x + east.width, VIEWPORT.width - EDITOR_WINDOW_MARGIN);

  // Same for the south edge: the top edge stays anchored.
  const south = resizeWindowRect(rect, "s", 0, 5000, VIEWPORT);
  assert.equal(south.y, rect.y);
  assert.equal(south.y + south.height, VIEWPORT.height - EDITOR_WINDOW_MARGIN);
});

test("resizeWindowRect north drag moves y and keeps the bottom edge anchored", () => {
  const rect = { x: 200, y: 300, width: 600, height: 500 };
  const bottomEdge = rect.y + rect.height;
  const resized = resizeWindowRect(rect, "n", 0, 60, VIEWPORT);

  assert.equal(resized.height, 440);
  assert.equal(resized.y, 360);
  assert.equal(resized.y + resized.height, bottomEdge);
});

test("maximizedWindowRect fills the viewport minus the margin", () => {
  assert.deepEqual(maximizedWindowRect(VIEWPORT), {
    x: EDITOR_WINDOW_MARGIN,
    y: EDITOR_WINDOW_MARGIN,
    width: VIEWPORT.width - EDITOR_WINDOW_MARGIN * 2,
    height: VIEWPORT.height - EDITOR_WINDOW_MARGIN * 2
  });
});

test("defaultWindowRect is centered, comfortable, and within bounds", () => {
  const rect = defaultWindowRect(VIEWPORT);

  assert.ok(rect.width >= EDITOR_WINDOW_MIN.width);
  assert.ok(rect.height >= EDITOR_WINDOW_MIN.height);
  assert.ok(rect.x >= EDITOR_WINDOW_MARGIN);
  assert.ok(rect.y >= EDITOR_WINDOW_MARGIN);
  assert.ok(rect.x + rect.width <= VIEWPORT.width - EDITOR_WINDOW_MARGIN);
  assert.ok(rect.y + rect.height <= VIEWPORT.height - EDITOR_WINDOW_MARGIN);
  assert.ok(Math.abs(rect.x - (VIEWPORT.width - rect.width) / 2) <= 1);
});

test("editor window state survives a serialize/parse round-trip", () => {
  const state = {
    floating: true,
    maximized: false,
    rect: { x: 40, y: 60, width: 720, height: 640 }
  };

  const parsed = parseEditorWindowState(serializeEditorWindowState(state));

  assert.equal(parsed.floating, true);
  assert.equal(parsed.maximized, false);
  assert.deepEqual(parsed.rect, state.rect);
});

test("parseEditorWindowState rejects garbage, wrong versions, and bad rects", () => {
  assert.equal(parseEditorWindowState(null), null);
  assert.equal(parseEditorWindowState("not json"), null);
  assert.equal(parseEditorWindowState(JSON.stringify({ version: 99, floating: true })), null);

  const badRect = parseEditorWindowState(
    JSON.stringify({ version: 1, floating: true, rect: { x: "left", y: 0, width: 100, height: 100 } })
  );
  assert.equal(badRect.floating, true);
  assert.equal(badRect.rect, null, "an invalid rect falls back to the default-size path");
});

test("the studio page wires up the floating window and its handles", async () => {
  const page = await readFile(new URL("../src/pages/admin/notes.astro", import.meta.url), "utf8");

  assert.match(page, /id="editor-window"/, "has the fixed-position window wrapper");
  assert.match(page, /id="editor-card"/, "the editor card is addressable");
  assert.match(page, /id="editor-placeholder"[^>]*hidden/, "keeps a docked placeholder for re-docking");
  assert.match(page, /id="editor-float-button"/, "offers the float toggle");
  assert.match(page, /initNotesEditorWindow\(\)/, "boots the window module");

  for (const edge of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
    assert.ok(
      page.includes(`data-edge="${edge}"`),
      `has the ${edge} resize handle`
    );
  }
});

test("narrow viewports keep the docked layout (breakpoint stays in sync)", async () => {
  const source = await readFile(new URL("../src/notes-window.js", import.meta.url), "utf8");
  assert.equal(EDITOR_WINDOW_MIN_VIEWPORT, 900, "matches the page's single-column breakpoint");
  assert.match(source, /EDITOR_WINDOW_MIN_VIEWPORT/, "the module gates floating on viewport width");
  assert.equal(typeof EDITOR_WINDOW_STORAGE_KEY, "string");
});

test("a rect saved at another root scale is re-expressed in this screen's pixels", () => {
  const laptop = { x: 290, y: 63, width: 860, height: 774 };

  // 1440x900 laptop (16px root) -> 5120x1440 ultra-wide (21.312px root):
  // the window grows with the UI instead of holding laptop pixels while its
  // rem-sized contents inflate around them.
  const ultrawide = scaleWindowRect(laptop, 16, 21.312);
  assert.equal(ultrawide.width, 1146);
  assert.equal(ultrawide.height, 1031);
  assert.ok(
    Math.abs(ultrawide.width / laptop.width - 21.312 / 16) < 0.001,
    "uniform scale, so the author's proportions survive"
  );

  // Same screen, same scale: a size the author dragged here is untouched.
  assert.equal(scaleWindowRect(laptop, 21.312, 21.312), laptop);
  assert.equal(scaleWindowRect(laptop, 16, 16), laptop);

  // Degenerate inputs must never produce NaN geometry.
  for (const [from, to] of [[0, 16], [16, 0], [Number.NaN, 16], [16, Number.NaN]]) {
    assert.equal(scaleWindowRect(laptop, from, to), laptop);
  }
  assert.equal(scaleWindowRect(null, 16, 32), null);
});

test("v1 window records migrate as 16px-scale records", () => {
  const v1 = JSON.stringify({
    version: 1,
    floating: true,
    maximized: false,
    rect: { x: 40, y: 60, width: 860, height: 640 }
  });

  const parsed = parseEditorWindowState(v1);

  assert.equal(parsed.version, EDITOR_WINDOW_VERSION, "migrated forward");
  assert.equal(
    parsed.scale,
    EDITOR_WINDOW_BASE_SCALE,
    "v1 predates the viewport ladder, so it was written at 16px"
  );
  assert.deepEqual(parsed.rect, { x: 40, y: 60, width: 860, height: 640 });

  // A v2 record keeps the scale it was written at.
  const v2 = parseEditorWindowState(
    serializeEditorWindowState({ floating: true, rect: { x: 1, y: 2, width: 3, height: 4 }, scale: 32 })
  );
  assert.equal(v2.scale, 32);

  // A malformed scale falls back rather than poisoning the rect.
  const badScale = parseEditorWindowState(
    JSON.stringify({ version: 2, floating: true, rect: { x: 1, y: 2, width: 3, height: 4 }, scale: "big" })
  );
  assert.equal(badScale.scale, EDITOR_WINDOW_BASE_SCALE);
});

test("a live scale change converts the rect before anything reads or saves it", async () => {
  const source = await readFile(new URL("../src/notes-window.js", import.meta.url), "utf8");
  const boot = source.slice(source.indexOf("const stored = readStoredState();"));
  const onResize = source.slice(source.indexOf('window.addEventListener("resize"'));

  // Restoring: preferredWidth() alone only ever helps a first-time float.
  assert.match(boot, /state\.scale = stored\.scale;/, "the restored rect keeps the scale it was saved in");
  assert.match(boot, /syncScale\(\);/, "…and is converted before use");

  // Living: dragged to another display, or resized across a tier. Without
  // this the window is proportionally wrong until reload — and a later drag
  // would persist the stale rect under the new scale, corrupting the record
  // for every future session.
  assert.ok(
    onResize.indexOf("syncScale();") < onResize.indexOf("clampWindowRect"),
    "resize converts the rect before clamping it"
  );

  // Saving: the tag must be the scale the rect is actually in.
  assert.match(
    source,
    /serializeEditorWindowState\(state\)/,
    "persist saves state.scale, never the live root size"
  );
  assert.doesNotMatch(
    source,
    /serializeEditorWindowState\(\{[^}]*rootFontSize\(\)/,
    "…so a stale rect can never be tagged with a fresh scale"
  );
});
