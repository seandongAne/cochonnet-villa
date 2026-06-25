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
| `world.js` | Geometry data, collision (2D AABB + optional Y range), interaction/stair/water zones |
| `controls.js` | WASD + pointer-lock factory, camera-Y interp through stair/water zones |
| `assets.js` | Procedural mesh factories for buildings & terrain |
| `porky-models.js` | GLB pig loading (4 variants) with procedural fallback |
| `interaction.js` | `findNearestInteraction` proximity logic; Y-floor filter for multi-floor hotspots |
| `placements.js` | GLB porky placement data (position / rotation / variant) |
| `furniture-models.js` | Generic GLB prop loader — uniform scale, X/Z re-center, floor-sit, placeholder + fallback (Phase 2; mirrors `porky-models.js`) |
| `furniture-placements.js` | GLB furniture placement data, per room (world coords / rotation / scale) |

React layer (`src/villa-map/react/`, client-only):

| File | Role |
|------|------|
| `VillaMap.jsx` | Island root: `<Canvas>` + overlay / loading / HUD chrome as React state |
| `Scene.jsx` | Lights, fog, IBL (three `RoomEnvironment`); mounts factory meshes via `<primitive>` |
| `PlayerControls.jsx` | Bridges `controls.js` + `interaction.js` into R3F's `useFrame` |

World bounds: x `[-26, 30]`, z `[-27, 28]`. Main villa is two floors (ground eye-Y ≈ 1.6, upper ≈ 8.05). GLB models in `public/models/porkies/` (pigs) and `public/models/furniture/` (Kenney CC0 Furniture Kit, see its `LICENSE.txt`).

## Key patterns

- ES modules everywhere (`"type": "module"`)
- Procedural geometry at runtime; pre-made GLB assets are pigs (`porky-models.js`) and furniture (`furniture-models.js`). Both load through a raw `GLTFLoader` + per-URL promise cache + bbox auto-fit + procedural placeholder/fallback, and mount in R3F via `<primitive object={…}>` — **not** rewritten as JSX, **not** drei `useGLTF` (keeps the framework-agnostic core node-testable and the loader uniform across pigs/props).
- React island only on `/villa-map/` (`client:only="react"` — Three.js needs `window`); the rest of the site stays vanilla Astro static HTML.
- **Version pins (don't bump blindly):** project is on **Astro 6 / Vite 7**. Keep `@astrojs/react@^5` (the v6 line targets Astro 7 / Vite 8) and `overrides: { vite: "^7" }` in package.json. drei `<SoftShadows>` is incompatible with three r184 (broken PCSS depth shader) — avoid; shadows use `PCFShadowMap`.
- Bilingual; content defaults to Chinese (`zh`), `data-i18n` for hooks
- Tests cover HTML render, world geometry, collisions, interactions, porky **and furniture** placements (incl. that referenced GLB files exist in `public/`)

## Phase 2: richer assets

The boxy look was an *asset* gap, not a framework one. All six interior rooms now use CC0 GLB furniture (Kenney Furniture Kit — 140 cohesive low-poly pieces, CC0; 25 vendored, ~380 KB) instead of primitives — **39 pieces** across `entry-foyer`, `great-hall-west` (living), `great-hall-east` (dining), `master-bedroom`, `study-loft`, `lounge-balcony`. The villa shell, stairs, partitions, railings, hot springs, mushroom house, terrain and pigs are still procedural.

**To add/restyle furniture** (rooms or the courtyard/exterior):
1. Copy GLBs from the kit into `public/models/furniture/` (kit is authored ~0.45× metric; `FURNITURE_BASE_SCALE` ≈ 2.2 lifts it into the villa's metre world — a uniform factor preserves inter-piece proportions, per-piece nudge via `placement.scale`). Upstairs rooms sit at y ≈ 6.66, ground at y ≈ 0.11.
2. Append placement records (world coords) to `furniture-placements.js`. Furniture has no colliders — players walk through it, same as the old boxy sets.
3. `npm test` + `npm run build`; eyeball in preview.

The old per-room `createFurnitureSet` boxes were removed from `assets.js` once every room was migrated.

**Still deferred:** contact shadows (a single ground plane is awkward across the open multi-floor interior — evaluate later); exterior/courtyard props; AI text-to-3D for a few signature pieces.

**Verifying the 3D scene in preview:** the headless preview window is 0×0, which collapses the viewport-unit layout and leaves R3F uninitialized. Work around it by forcing pixel dimensions on `.villa-map-shell` / `.villa-map-root` via `preview_eval` + dispatching a `resize` event. The camera renders from `world.player.start` looking −Z with no input, so temporarily pointing `start` at a room gives a deterministic furniture screenshot without fighting the walk-navigation harness (revert the one-line `start` change after — a world test asserts `start` = `{0,1.6,18}`).
