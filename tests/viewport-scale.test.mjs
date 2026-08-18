import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BASE_VERTICAL_FOV,
  HOR_FOV_MAX,
  horizontalFov,
  verticalFovForAspect
} from "../src/villa-map/camera-framing.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// Real screens the ladder is tuned for. `scale` is the root font size the CSS
// resolves to — the design viewport is (width/scale) x (height/scale).
const SCREENS = [
  { name: "laptop 16:10", width: 1440, height: 900, scale: 16, engaged: false },
  { name: "1080p 16:9", width: 1920, height: 1080, scale: 16, engaged: false },
  { name: "1600p 16:10", width: 2560, height: 1600, scale: 16, engaged: false },
  { name: "21:9", width: 3440, height: 1440, scale: 21.312, engaged: true },
  { name: "32:9 dual-4K", width: 7680, height: 2160, scale: 32, engaged: true },
  { name: "32:9 G9", width: 5120, height: 1440, scale: 21.312, engaged: true }
];

test("the viewport ladder only engages on big/wide screens, and only to zoom+widen", async () => {
  const css = await read("../src/viewport-scale.css");

  // The baseline every laptop keeps.
  assert.match(css, /--shell-max:\s*73\.75rem/, "1180px stays the base content band");
  assert.match(css, /:root \{[\s\S]*?--shell-gutter:\s*2rem/);

  const tiers = [...css.matchAll(/@media ([^{]+)\{([\s\S]*?)\n\}/g)].map(([, query, body]) => ({
    query: query.trim(),
    body
  }));

  assert.equal(tiers.length, 3, "21:9, 32:9 and a zoom-only tier for very large 16:9/16:10");

  for (const tier of tiers) {
    assert.match(tier.query, /min-width:\s*\d+px/, `${tier.query} gates on width too`);
    assert.match(
      tier.body,
      /font-size:\s*clamp\(1rem,/,
      "zoom never drops below the reader's own default font size"
    );
    // Zoom + widen only: a tier that re-columned the page would defeat the
    // point (a 32:9 desktop should show the laptop layout, larger).
    assert.doesNotMatch(tier.body, /grid-template|flex-direction|order:|display:/);
  }

  const [wide, ultra, largeStandard] = tiers;
  assert.match(wide.query, /min-aspect-ratio:\s*2\/1/);
  assert.match(ultra.query, /min-aspect-ratio:\s*3\/1/);
  assert.match(largeStandard.query, /max-aspect-ratio:\s*2\/1/, "4K 16:9 zooms but keeps its width");
  assert.doesNotMatch(largeStandard.body, /--shell-max/, "…so it must not widen the band");

  assert.match(ultra.body, /--shell-max:\s*120rem/);
  assert.match(wide.body, /--shell-max:\s*92rem/);
});

test("every page ships the ladder, and no shell hard-codes its own width", async () => {
  for (const page of [
    "../src/pages/index.astro",
    "../src/pages/notes/index.astro",
    "../src/pages/notes/[slug].astro",
    "../src/pages/villa-map.astro",
    "../src/pages/admin/notes.astro"
  ]) {
    assert.match(await read(page), /viewport-scale\.css/, `${page} imports the ladder`);
  }

  // /admin/ is a standalone raw document, so the ladder is inlined into it
  // from the same single source rather than forked.
  const adminPage = await read("../src/pages/admin/index.astro");
  assert.match(adminPage, /viewport-scale\.css\?raw/);
  assert.match(adminPage, /<\/head>/, "injects the inlined ladder into the raw document's head");

  for (const [file, pattern] of [
    ["../src/styles.css", /width: min\(var\(--shell-max, 73\.75rem\), calc\(100% - var\(--shell-gutter, 2rem\)\)\);/],
    ["../src/pages/admin/notes.astro", /width: min\(var\(--shell-max, 73\.75rem\), calc\(100% - var\(--shell-gutter-tight/],
    ["../admin/index.html", /width: min\(var\(--shell-max-narrow, 70rem\), calc\(100% - var\(--shell-gutter-tight/],
    // The map card is the shell that decides the R3F canvas aspect: pinned at
    // 1180px it would keep the canvas near 16:10 on any screen, which silently
    // makes the ultra-wide FOV clamp unreachable in production.
    ["../src/villa-map/styles.css", /\.villa-map-root \{[\s\S]*?width: min\(var\(--shell-max, 73\.75rem\), 100%\);/],
    ["../src/villa-map/styles.css", /\.villa-map-header \{[\s\S]*?width: min\(var\(--shell-max, 73\.75rem\), 100%\);/]
  ]) {
    assert.match(await read(file), pattern, `${file} follows the ladder`);
  }

  // A px width in any of these would pin that box at laptop size while
  // everything around it zoomed.
  for (const file of ["../src/styles.css", "../src/villa-map/styles.css"]) {
    const css = await read(file);
    assert.doesNotMatch(css, /1180px/, `${file}: no leftover hard-coded content band`);
    assert.doesNotMatch(css, /minmax\(\d+px/, `${file}: grid minimums scale with the root font size`);
    // Line-anchored so `min-width: 320px` (a small-screen floor, not a cap)
    // is not mistaken for a width that must zoom.
    assert.doesNotMatch(
      css,
      /^\s*(width|min-height|max-height):[^;]*\b[3-9]\d{2,}px/m,
      `${file}: sizing boxes are rem/var so they zoom`
    );
  }
});

test("the design viewport stays laptop-shaped on every target screen", () => {
  for (const screen of SCREENS) {
    if (!screen.engaged) {
      // Laptops and ordinary desktops must render byte-identically to before.
      assert.equal(screen.scale, 16, `${screen.name} is below the ladder`);
      continue;
    }

    const designHeight = (screen.height / screen.scale) * 16;
    assert.ok(
      designHeight >= 880 && designHeight <= 1120,
      `${screen.name}: ${Math.round(designHeight)} design px tall is laptop-like`
    );
  }

  // Both 32:9 targets must land on the SAME design-space layout — the 7680
  // panel just draws it twice as large.
  const [g9] = SCREENS.filter((screen) => screen.name === "32:9 G9");
  const [dual4k] = SCREENS.filter((screen) => screen.name === "32:9 dual-4K");
  assert.ok(
    Math.abs(g9.width / g9.scale - dual4k.width / dual4k.scale) < 5,
    "5120x1440 and 7680x2160 resolve to the same design width"
  );
});

test("ultra-wide framing tames the horizontal FOV without touching 16:9/16:10/21:9", () => {
  for (const aspect of [1.6, 16 / 9, 3440 / 1440]) {
    assert.equal(
      verticalFovForAspect(aspect),
      BASE_VERTICAL_FOV,
      `aspect ${aspect.toFixed(2)} keeps the authored vertical FOV`
    );
    assert.ok(horizontalFov(BASE_VERTICAL_FOV, aspect) <= HOR_FOV_MAX);
  }

  const ultra = 5120 / 1440;
  assert.ok(horizontalFov(BASE_VERTICAL_FOV, ultra) > 135, "32:9 would smear at the stock fov");
  assert.ok(Math.abs(horizontalFov(verticalFovForAspect(ultra), ultra) - HOR_FOV_MAX) < 0.01);
  assert.ok(verticalFovForAspect(ultra) < BASE_VERTICAL_FOV);

  // Degenerate sizes (a 0-height canvas during layout) must not poison fov.
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(verticalFovForAspect(bad), BASE_VERTICAL_FOV);
  }
});

test("the canvas mounts the framing bridge instead of a hard-coded fov", async () => {
  const villaMap = await read("../src/villa-map/react/VillaMap.jsx");

  assert.match(villaMap, /fov: BASE_VERTICAL_FOV/, "the authored fov comes from the shared module");
  assert.match(villaMap, /<UltraWideFraming baseFov=\{BASE_VERTICAL_FOV\} \/>/);

  const bridge = await read("../src/villa-map/react/UltraWideFraming.jsx");
  assert.match(bridge, /useThree\(\(state\) => state\.size\.width\)/, "reacts to canvas resizes");
  assert.match(bridge, /camera\.updateProjectionMatrix\(\)/);
});
