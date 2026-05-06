import assert from "node:assert/strict";
import { test } from "node:test";

import site from "../content/site.json" with { type: "json" };
import { renderSite } from "../src/render-site.js";
import { createVillaWorld } from "../src/villa-map/world.js";

test("homepage exposes a dedicated villa map CTA", () => {
  const html = renderSite(site);

  assert.match(html, /href="\/villa-map\/"/);
  assert.match(html, /Explore the Villa Map/);
  assert.match(html, /data-i18n="hero.mapCtaLabel"/);
  assert.match(html, /class="scene-house scene-house-link"/);
  assert.match(html, /aria-label="Explore the Villa Map"/);
});

test("villa map world defines the v1 yard and hall exploration spaces", () => {
  const world = createVillaWorld();

  assert.deepEqual(
    world.rooms.map((room) => room.id),
    ["courtyard", "great-hall"]
  );
  assert.ok(world.colliders.length >= 6);
  assert.ok(world.interactions.some((item) => item.title === "呱呱猪"));
  assert.equal(world.player.start.x, 0);
  assert.equal(world.player.start.z, 15);
});
