# Cochonnet Villa

Static Astro site about 15 pet pigs. Two features:

1. **Landing site** — `src/pages/index.astro` rendered from `content/site.json` via `src/render-site.js`. Admin at `/admin/` edits the JSON through GitHub OAuth (Decap CMS, no backend).
2. **3D Villa Map** (`/villa-map/`) — React Three Fiber (Three.js / WebGL) scene, mounted as a client-only Astro React island.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run preview` — serve the production build (full-speed; dev is slow to first-compile the three/drei bundle)
- `npm test` — Node.js built-in `node:test` runner

## 3D scene (`src/villa-map/`)

Framework-agnostic core — pure logic + Three.js factories, reused verbatim by the React layer **and** the test suite:

| File | Role |
|------|------|
| `world.js` | Geometry data, collision (2D AABB + optional Y range), interaction/stair/water/**floor** zones, `MUSHROOM_INTERIOR` pocket-space data |
| `controls.js` | WASD + pointer-lock factory (drag-look fallback when lock is denied), camera-Y interp through stair/floor/water zones, `teleport()`, E-key `onAction` |
| `assets.js` | Procedural mesh factories for buildings & terrain |
| `mushroom-interior.js` | Procedural three-storey round-tower interior of the mushroom house (Phase 5); node-pure like `assets.js` |
| `porky-models.js` | GLB pig loading (4 variants) with procedural fallback |
| `interaction.js` | `findNearestInteraction` proximity logic; Y-floor filter for multi-floor hotspots |
| `placements.js` | GLB porky placement data (position / rotation / variant) |
| `furniture-models.js` | Generic GLB prop loader — uniform scale, X/Z re-center, floor-sit, placeholder + fallback (Phase 2; mirrors `porky-models.js`). Reused for exterior props too |
| `furniture-placements.js` | GLB furniture placement data, per room. Stamps each record at load with derived `footprint` (world m), `floor`, `solid`, `noShadow` (+ a `FURNITURE_FOOTPRINTS` native-size map) that the shadow + collider layers read |
| `exterior-placements.js` | GLB courtyard/exterior placement data (Phase 3); same stamped shape as furniture, loaded by the same `createFurniturePiece` |
| `architecture-placements.js` | GLB **entrance** accent placement data (Phase 4) — topiaries, porch railings, planters; same stamped shape, same `createFurniturePiece`. Solid pieces sit at x≈±5.9/±6.6 (porch edge) so the open entry x∈[-5,5] stays walkable. No door piece — the front is an open portal |
| `shadows.js` | `createShadowBlobs(placements)` → soft radial-gradient "blob" contact shadows (Phase 3); pure ShaderMaterial, node-safe, skips `noShadow` pieces |
| `furniture-colliders.js` | `deriveFurnitureColliders(placements)` → per-piece rotated-AABB colliders for `solid` props (Phase 3); pure Math, floor-scoped Y range |

React layer (`src/villa-map/react/`, client-only):

| File | Role |
|------|------|
| `VillaMap.jsx` | Island root: `<Canvas>` + overlay / loading / HUD chrome as React state |
| `Scene.jsx` | Lights, fog, IBL (three `RoomEnvironment`); mounts factory meshes via `<primitive>` |
| `PlayerControls.jsx` | Bridges `controls.js` + `interaction.js` into R3F's `useFrame` |

World bounds: x `[-40, 44]`, z `[-40, 42]` (Phase 5 removed the perimeter fence; the oversized meadow plane + fog hide the rim). Main villa is two floors (ground eye-Y ≈ 1.6, upper ≈ 8.05). The mushroom-house interior is a **buried pocket space** under XZ (-6, 18) — slab tops y = -40/-36/-32, floor indices 2/3/4 — reached only by teleport. GLB models in `public/models/porkies/` (pigs), `public/models/furniture/` (Kenney CC0 Furniture Kit), `public/models/exterior/` (Kenney CC0 Nature + Holiday kits) and `public/models/architecture/` (Kenney CC0 Furniture + City-Suburban kits; Phase 4 entrance accents) — each dir has its `LICENSE.txt`. **Gotcha:** some UnityGLTF-exported Kenney GLBs (Holiday-kit `bench`/`lantern`; City-Suburban `railing`/`planter`) reference an external `Textures/colormap.png` by relative URI, so that atlas is vendored **per dir** (`public/models/exterior/Textures/colormap.png` and `public/models/architecture/Textures/colormap.png`) — without it those props render flat white. The Furniture-kit and Nature-kit GLBs are self-contained (embedded or `baseColorFactor`/`KHR_materials_unlit`).

## Key patterns

- ES modules everywhere (`"type": "module"`)
- Procedural geometry at runtime; pre-made GLB assets are pigs (`porky-models.js`) and furniture (`furniture-models.js`). Both load through a raw `GLTFLoader` + per-URL promise cache + bbox auto-fit + procedural placeholder/fallback, and mount in R3F via `<primitive object={…}>` — **not** rewritten as JSX, **not** drei `useGLTF` (keeps the framework-agnostic core node-testable and the loader uniform across pigs/props).
- React island only on `/villa-map/` (`client:only="react"` — Three.js needs `window`); the rest of the site stays vanilla Astro static HTML.
- **Version pins (don't bump blindly):** project is on **Astro 6 / Vite 7**. Keep `@astrojs/react@^5` (the v6 line targets Astro 7 / Vite 8) and `overrides: { vite: "^7" }` in package.json. drei `<SoftShadows>` is incompatible with three r184 (broken PCSS depth shader) — avoid; shadows use `PCFShadowMap`.
- Bilingual; content defaults to Chinese (`zh`), `data-i18n` for hooks
- Tests cover HTML render, world geometry, collisions, interactions, porky / furniture / **exterior** / **architecture** placements (incl. that referenced GLB + the colormap atlas exist in `public/`), **blob shadows**, **furniture colliders**, the **beveled villa shell** (`shell.test.mjs` — node-pure build + palette), a **no-overlap regression** (`overlap.test.mjs` — solid non-chair furniture must not clip > 0.5 m²), the **mushroom interior** (`mushroom-interior.test.mjs` — zones/colliders/teleports/factory), and a **same-model spacing guard** (`spacing.test.mjs` — identical props ≥ 1.8 m apart on a floor; chair-family + railing exempt). `npm test` globs `tests/*.test.mjs` (one file per concern), run via the `node --test` runner.

## Phase 2: richer assets

The boxy look was an *asset* gap, not a framework one. All six interior rooms now use CC0 GLB furniture (Kenney Furniture Kit — 140 cohesive low-poly pieces, CC0; 25 vendored, ~380 KB) instead of primitives — **72 pieces** across `entry-foyer`, `great-hall-west` (living), `great-hall-east` (dining), `master-bedroom`, `study-loft`, `lounge-balcony`. The villa shell, stairs, partitions, railings, hot springs, mushroom house, terrain and pigs are still procedural. A later "猪窝" cozy-clutter pass piled every room with layered rugs, greenery, books, warm lamps and extra seating (mostly **non-solid** decor so it crowds without trapping the player or tripping the overlap guard; only 2 new solid side-table accents, both in empty corners) and corrected the dining-chair facing (the `chair` model's backrest sits on its -Z side at `rotationY` 0, so seats tuck under the table).

**To add/restyle furniture** (rooms or the courtyard/exterior):
1. Copy GLBs from the kit into `public/models/furniture/` (kit is authored ~0.45× metric; `FURNITURE_BASE_SCALE` ≈ 2.2 lifts it into the villa's metre world — a uniform factor preserves inter-piece proportions, per-piece nudge via `placement.scale`). Upstairs rooms sit at y ≈ 6.66, ground at y ≈ 0.11.
2. Append placement records (world coords) to `furniture-placements.js`; it stamps `footprint`/`floor`/`solid`/`noShadow` on each (footprint from the `FURNITURE_FOOTPRINTS` native-size map × `FURNITURE_BASE_SCALE` × `placement.scale`). Set `solid`/`noShadow` per the model-policy table, or override per record.
3. `npm test` + `npm run build`; eyeball in preview.

**Visual furniture editor (dev-only):** open `/villa-map/?edit=1` to tune positions without blind-coding coords. It swaps the walk controls for orbit + a drag gizmo (drei `OrbitControls` + `TransformControls`), adds a height-adjustable global clipping plane ("dollhouse" cut, `[`/`]` keys) since the roof/ceilings occlude interiors, and lets you click any furniture piece to select it — a panel prints the **paste-ready `furniture-placements.js` record** (Copy button) reflecting the live transform. `G`/`R` toggle translate/rotate, `Esc` deselects. The data file stays the source of truth (tests/overlap guard still gate); you paste the numbers back. Gated on `?edit=1` (`VillaMap.jsx`) so ordinary visitors are unaffected; the editor lives in `react/EditControls.jsx` + the `editMode`/`onSelectPiece` hooks in `Scene.jsx`.

The old per-room `createFurnitureSet` boxes were removed from `assets.js` once every room was migrated.

## Phase 3: grounding, solidity, outdoors

Three streams, conflict-free (each owns new files; only `Scene.jsx` + `world.js` are edited to wire them):

- **Contact shadows** (`shadows.js`) — per-piece soft **blob decals** (flat radial-gradient `PlaneGeometry` + a tiny node-safe `ShaderMaterial`, no texture/canvas), sized to the piece's `footprint`, laid at `position.y + 0.02`, rotated by `rotationY` via a wrapper group. Chosen over drei `<ContactShadows>` (one ground plane can't span two floors + async-loaded GLBs). Tunables in `shadows.js`: `SHADOW_OPACITY` 0.45, `SHADOW_PADDING` 1.35, fragment core `smoothstep(0.5, 0.22, d)` — bumped from softer defaults so the shadow reads beyond an object's base. `noShadow` pieces (rugs, tabletop items) get none.
- **Per-piece colliders** (`furniture-colliders.js`) — solid furniture/props now block the player. Rotated-AABB from `footprint`+`rotationY`, **0.85 shrink** (player radius 0.62 is added at test time, so a full box feels sticky), floor-scoped Y range. Spread into `world.colliders`. Solid set: sofas/beds/tables/bookcases/wardrobe/sideboard/lounge chairs; walk-through: rugs/lamps/books/small plants/dining+desk chairs/coat rack. NB grand-scale furniture means a big piece can fill a small room (the master bed fills the bedroom's north — you walk to its foot, not around it).
- **Exterior props** (`exterior-placements.js` + `public/models/exterior/`) — ~19 courtyard props (fountain/statue ring, lampposts lining the path, benches, planters, flowers, bushes, campfire+logs, rock, sign) from Kenney Nature + Holiday kits, placed in the grassy courtyard (z>0), reusing `createFurniturePiece`. Same stamped shape, so shadows + colliders apply uniformly. Exterior footprint is baked = native × 2.2 × scale (the loader's effective scale).

**Still deferred:** AI text-to-3D for a few signature pieces; richer exterior set; (contact shadows + colliders + courtyard props are now done).

## Phase 4: shell polish · entrance accents · de-overlap

Same conflict-free shape as Phase 3 (parallel streams own new/stream-only files; only `Scene.jsx` + `world.js` are edited in a short serial integration). The main villa `createModernVilla` read "hand-built" because of a **finish gap** (flat colours + hard 90° box edges), not geometry — same lesson as Phase 2.

- **Shell polish** (`assets.js`) — a new `addBeveledBox` helper (mirrors `addBox`, uses `RoundedBoxGeometry` from `three/addons`, radius ≈0.04–0.08 clamped, falls back to a plain box for sub-~0.012 slivers) rounds the chunky shell boxes (perimeter/wing walls, lintel, upper walls, roofs, chimney, porch deck/steps, planters, 4 corner posts) — thin glass/mullions stay flat. Refined `createMaterials` (warmer trims + new keys `fascia`/`stoneBase`/`baseboard`) and added finish detail: glass-pane frames, roof **fascia/eave** boards, interior **baseboards**. **`assets.js` stays node-pure** — no `TextureLoader`/`document` (the node suite imports it). Wall centres/extents are UNCHANGED (colliders depend on them); bevels/detail are purely visual.
- **Open-plan front** (`assets.js`, follow-up tweak) — the villa front is an **open portal** (no door leaf — the lone door read as out of place) and a **unified glass curtain wall**: both front wings now use the same `buildGlassCurtainWing` helper (peach base + glass pane + mullions + transom + frame), replacing the old glassy-left / dark-red-right mismatch. The x=±3 ground-floor **foyer-pocket partition walls were removed** for one continuous open hall (the lone west-hall terracotta accent panel they carried is kept inline); the matching `foyer-*-wall-*` colliders were dropped from `world.js`. Stair banisters + upper-floor partitions stay.
- **Entrance accents** (`architecture-placements.js` + `public/models/architecture/`) — 8 CC0 GLB pieces at the villa front: 2 Furniture-kit `pottedPlant` topiaries flanking the open entry, City-Suburban `railing` ×4 (porch edges, solid) + `planter` ×2 (solid). Same stamped shape + `createFurniturePiece`, so shadows + colliders apply uniformly. Placed clear of the Phase-3 courtyard props and the x∈[-5,5] entry path (solids sit at x≈±5.9/±6.6).
- **De-overlap** (`furniture-placements.js` + `world.js` markers) — fixed the 3 audited solid clips: west-sofa scale 2.3→2.05 + coffee-table nudged (→0 m²), and the grand bed scale 2.2→1.9 with both nightstands moved to the headboard corners (→0.28 m² each, under the 0.5 m² bar). Relocated 4 interaction markers off the furniture they were buried in (master-bedroom/study-loft/lounge-balcony moved; blanket-nest kept — only over a flat rug). `tests/overlap.test.mjs` guards it (no solid non-chair pair clips > 0.5 m²; intended overlaps — rugs under furniture, items on tables, tucked chairs — preserved).

**Still deferred:** AI text-to-3D signature pieces; richer exterior set.

## Phase 5: open meadow · enterable mushroom house · input polish

- **Fence removal + expanded bounds** (`world.js` + `Scene.jsx`) — the 5 fence meshes/colliders and the gate marker are gone (`createFence` deleted from `assets.js`); bounds grew to x∈[-40,44], z∈[-40,42]. The meadow plane is oversized (120×116) so the rim stays fogged; the main path extends south. `dog-house-view` / `trees-view` lost `scenicOnly` (now real destinations); the sign/overlay copy no longer mentions a fence.
- **Drag-look fallback** (`controls.js`) — when Pointer Lock is denied (embedded browsers), the old free-look on every mousemove let the visible OS cursor drift out of the map and mis-click other UI. Now fallback rotation happens ONLY while the left button is held (drag), pointer lock is retried on each canvas press, and mouseup/Esc end it. With real pointer lock nothing changed.
- **Enterable mushroom house** (`world.js` + `mushroom-interior.js` + `furniture-placements.js`) — the door interaction carries an `action: { label, teleport }`; pressing **E** (handled in `controls.js` → `PlayerControls` reads the nearest hotspot) teleports into a three-storey round-tower interior **buried at y≈-40 under the house** (invisible from outside; XZ overlaps the courtyard, so every interior zone/collider is Y-banded). Mechanics: generic `floorZones` (XZ rect + Y activation band + eyeY) checked in `getMovementProfile` after stairs; stair zones gained optional `minY`/`maxY`. Two 2.4 m-wide flights (A east L1→L2, B west L2→L3, both ascending northward) with shortened side-rail colliders (flight ends stay enterable — the player radius is added to every collider, a narrower flight seals itself shut), under-stair blocks and rim guards, all Y-banded. Furniture floors 2/3/4 map to the interior levels in `furniture-colliders.js`; a porky naps on L1. The exterior `mushroom-house` collider is Y-scoped to `[0,30]`.
- **Same-model spacing** (`spacing.test.mjs`) — identical kit models must stay ≥ 1.8 m apart per floor across all placement sets (chair-family + `railing` exempt as intentional rows/pairs); the two offending duplicate book piles were relocated.

**Verifying the 3D scene in preview:** the headless preview window is 0×0, which collapses the viewport-unit layout and leaves R3F uninitialized. Work around it by forcing pixel dimensions on `.villa-map-shell` / `.villa-map-root` via `preview_eval` + dispatching a `resize` event. **`requestAnimationFrame` never fires in the headless pane** (frame loop is fully stalled — key-driven walking can't be simulated), so to inspect anything off the start view temporarily expose `window.__villa = { gl, scene, camera }` in `Scene.jsx`'s `StudioEnvironment` effect, then per shot set `camera.position`/`rotation` (order "YXZ") and call `gl.render(scene, camera)` manually, screenshot, repeat. Remove the hook + rebuild before shipping. For a quick furniture framing, temporarily pointing `start` at a room also works (revert it — a world test asserts `start` = `{0,1.6,18}`).
