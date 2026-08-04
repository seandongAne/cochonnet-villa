# Cochonnet Villa

Static Astro site about 15 pet pigs. Two features:

1. **Landing site** — `src/pages/index.astro` rendered from `content/site.json` via `src/render-site.js`. Admin at `/admin/` edits the JSON through GitHub OAuth (Decap CMS, no backend).
2. **3D Villa Map** (`/villa-map/`) — React Three Fiber (Three.js / WebGL) scene, mounted as a client-only Astro React island.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run preview` — serve the production build (full-speed; dev is slow to first-compile the three/drei bundle)
- `npm test` — Node.js built-in `node:test` runner (globs `tests/*.test.mjs`, one file per concern)

## 3D scene (`src/villa-map/`)

Framework-agnostic core — pure logic + Three.js factories, reused verbatim by the React layer **and** the node test suite (so: no `window`/`document`/`TextureLoader` at import time):

| File | Role |
|------|------|
| `world.js` | Geometry data, collision (2D AABB + optional Y range + the mushroom interior's circular boundary), interaction/stair/water/floor zones, `MUSHROOM_INTERIOR` pocket-space data |
| `controls.js` | WASD + pointer-lock factory (drag-look fallback when lock is denied), camera-Y interp through stair/floor/water zones, `teleport()`, E-key `onAction`, modifier-safe hidden R/F semantic actions |
| `assets.js` | Procedural mesh factories for buildings & terrain (beveled villa shell, open glass-curtain front, hot springs, meadow) |
| `mushroom-interior.js` | Procedural three-storey round-tower interior, fairy-light/bunting canopies on L1/L2, the physical L3 light switch, node-pure fallback dome for the real-sky texture |
| `mushroom-sky.js` | 80 m camera-centred observatory sky: filtered Milky Way backdrop, deterministic GPU stars, point-mass lensing/event horizon, switch-driven reveal, L3 gating, stencil aperture, disposal |
| `mushroom-nebula.js` | Volumetric ray-march nebula ShaderMaterial; bounded High/Medium/Low presets, camera bridge, reduced-motion pause |
| `gaia-stars.js` | Gaia DR3 v1 binary decoder, ICRS star geometry, G-magnitude/BP-RP rendering, one `THREE.Points` draw with LOD + GPU lensing |
| `observatory-adaptation.js` | Node-pure switch/dark-adaptation director; single source for house-light, room-darkness, portal, bright/faint-star, nebula and motion channels |
| `observatory-portal.js` | Portal/FBO factories: capped target sizing, near-layer parallax camera, stencil-ref-7 emission/extinction composite, safe lens projection, resize, idempotent disposal |
| `observatory-rift.js` / `observatory-rift-visual.js` | Hidden non-Euclidean Rift: reversible transition director + expanding stencil dome, finite star/shard bands, unfolding rings |
| `observatory-black-hole.js` / `observatory-black-hole-pass.js` | Finite-distance 3D black hole (42 m anchor, tilted accretion disc, event horizon, photon shell, debris) + its depth-buffered FBO pass and HDR composite |
| `observatory-relativistic-lens.js` | Schwarzschild lensing via Bruneton BSD-3 precomputed LUTs (`public/data/observatory-black-hole-*.bin`); analytic fallback |
| `observatory-kerr-lens.js` | Offline Kerr transfer-atlas lensing (a*=0.94, i=60°; `public/data/observatory-kerr-*.bin`); High/Medium primary path, falls back to Schwarzschild |
| `observatory-gaia-source-map.js` | Renders Gaia/hero stars into an equirect source atlas so the Kerr/Schwarzschild passes lens stars and photo sky through one light path |
| `observatory-star-volume.js` | Three finite-distance star shells (72–184 m) for parallax depth in Rift/lens modes; single deterministic Points draw |
| `observatory-quality.js` | High/Medium/Low/Minimum capability caps + rolling-p95 auto-tier controller with dwell/cooldown hysteresis |
| `observatory-quality-preference.js` | Versioned localStorage persistence for the player's `Q` quality panel (SSR/storage-failure safe) |
| `observatory-audio.js` | Procedural spatial-audio graph math (no audio files); consumed by the React audio bridge |
| `observatory-diagnostics.js` | Stable observatory camera bookmarks, frame-time summaries, render-target memory estimates for browser QA |
| `interaction.js` | `findNearestInteraction` proximity logic, Y-floor filtering, fixed-radius camera-ray targeting for the hidden physical controls |
| `porky-models.js` | GLB pig loading (15 variants) with procedural fallback |
| `placements.js` | Porky placement data (position / rotation / variant) |
| `furniture-models.js` | Generic GLB prop loader — per-pack base scale, X/Z re-center, floor-sit, placeholder + fallback; reused for exterior/architecture props |
| `furniture-placements.js` | Furniture placement data per room (Kenney villa + KayKit mushroom tower). Stamps `footprint`/`floor`/`solid`/`noShadow` on each record; mushroom `wallMounted` decor projects tangent to the round wall, `onWallShelfId` clutter follows its shelf |
| `exterior-placements.js` / `architecture-placements.js` | Courtyard props and villa-entrance accents; same stamped shape, same loader |
| `shadows.js` | `createShadowBlobs(placements)` — soft radial-gradient blob contact shadows; skips `noShadow` |
| `furniture-colliders.js` | `deriveFurnitureColliders(placements)` — rotated-AABB colliders for `solid` props, 0.85 shrink, floor-scoped Y |

React layer (`src/villa-map/react/`, client-only):

| File | Role |
|------|------|
| `VillaMap.jsx` | Island root: `<Canvas>` (with `stencil: true`) + overlay/loading/HUD state; owns E light state, hidden R/F state, the `Q` quality panel and the query-only QA panel |
| `Scene.jsx` | Lights, fog, IBL; mounts factory meshes/Rift and shares one observatory `adaptationRef` across lighting, palette, exposure, markers and sky runtime |
| `PlayerControls.jsx` | Bridges controls/interaction into R3F at priority `-2`; R/F reach React only while the L3 camera ray hits the physical wall switch |
| `MushroomObservatoryRuntime.jsx` | Sole browser owner of 4K/8K/Gaia/LUT/atlas lazy loading + prewarm, FBO render choreography (priority `-1`), hidden Rift/Lens channels, classified fail-close, context-loss recovery, diagnostics |
| `MushroomObservatoryAudio.jsx` | Web Audio bridge: gesture-gated context, HRTF-panned switch/dome/rift/black-hole layers driven by the same per-frame adaptation state; `M` mutes |
| `ObservatoryDiagnostics.jsx` / `ObservatoryQualityPanel.jsx` | Query-only fixed-camera test/perf harness; player-facing quality panel |
| `EditControls.jsx` | `?edit=1` furniture editor (orbit + drag gizmo + clipping plane; prints paste-ready placement records) |

## World facts

- Bounds x `[-40, 44]`, z `[-40, 42]`; no perimeter fence (oversized meadow + fog hide the rim). Main villa is two floors (ground eye-Y ≈ 1.6, upper ≈ 8.05).
- The mushroom-house interior is a **buried pocket space** under XZ (-6, 18), scaled 2× (~19 m across; slab tops y = -48/-40/-32, floor indices 2/3/4), reached only by E-key teleport at the door. Every interior zone/collider is Y-banded; the exterior `mushroom-house` collider is Y-scoped `[0,30]`. A world test asserts the normal start is `{0,1.6,18}`.
- GLB dirs (each with its own `LICENSE.txt`): `public/models/porkies/` (pigs), `furniture/` (Kenney CC0 Furniture Kit, base scale 2.2), `mushroom-furniture/` (53-model KayKit Furniture Bits CC0, base scale 1), `exterior/` (Kenney Nature + Holiday), `architecture/` (Kenney Furniture + City-Suburban). **Gotcha:** UnityGLTF-exported Kenney GLBs (Holiday `bench`/`lantern`; City-Suburban `railing`/`planter`) reference `Textures/colormap.png` by relative URI — the atlas is vendored per dir or those props render flat white.
- Observatory data/textures: `public/textures/qwantani-night-puresky-dome-{4k,8k}.webp` (Poly Haven CC0 night sky), `public/data/gaia-bright-stars-v1.bin` (+meta, ESA/Gaia/DPAC), Schwarzschild LUTs (Bruneton BSD-3) and self-generated Kerr atlas (CC0) — regeneration scripts in `scripts/`, provenance/SHA-256 in the sibling `.meta.json`/LICENSE files. Keep filenames' `-v1` and metadata in sync when regenerating; the shipped bins are byte-pinned by tests.

## Key patterns

- ES modules everywhere (`"type": "module"`).
- Procedural geometry at runtime; pre-made GLBs (pigs/furniture/props) load through a raw `GLTFLoader` + per-URL promise cache + bbox auto-fit + procedural fallback, mounted via `<primitive object={…}>` — **not** drei `useGLTF`, keeping the core node-testable and the loader uniform.
- React island only on `/villa-map/` (`client:only="react"`); the rest of the site is vanilla Astro static HTML. Bilingual; content defaults to Chinese (`zh`), `data-i18n` for hooks.
- **Version pins (don't bump blindly):** Astro 6 / Vite 7; keep `@astrojs/react@^5` and `overrides: { vite: "^7" }`. drei `<SoftShadows>` is broken with three r184 — shadows use `PCFShadowMap`.
- Tests are node-pure and behavior-pinning: world/collision/interaction geometry, placement + asset-existence guards (GLBs, colormap atlas, binary observatory data incl. SHA-256), overlap (`overlap.test.mjs`, solid non-chair clip ≤ 0.5 m²) and same-model spacing (`spacing.test.mjs`, ≥ 1.8 m; chair-family + railing exempt) regressions, villa shell palette, mushroom interior/collision/wall-decor, and the full `observatory-*`/`mushroom-sky`/`star-ceiling` suite (adaptation, portal, nebula, Gaia contract, quality hysteresis, hidden R/F, rift, black hole, Kerr/relativistic lenses, audio, React runtime contracts).

## Impossible Observatory (mushroom L3)

Detailed record: `docs/IMPOSSIBLE_OBSERVATORY_PLAN.md`. The L3 loft is a dark-adaptation observatory: pressing E at the physical wall switch drops the warm room to near-black, then reveals a layered cosmos — photo Milky Way backdrop (0.36 brightness), 360 procedural hero stars, real Gaia stars revealed bright→faint by magnitude, and a half-res volumetric nebula Portal with controlled parallax — all clipped to the dome by stencil ref 7. Hidden Lab: aiming at the switch, `R` toggles a non-Euclidean Rift, `F` a finite-distance black hole/gravitational lens (Kerr atlas → Schwarzschild LUT → analytic point-mass fallback ladder). `E`/lights-on and leaving L3 reset everything; production HUD never advertises R/F.

Architecture rules that must hold:

- `MushroomObservatoryRuntime` is the **sole browser owner** of observatory assets/FBOs; `observatory-adaptation.js` is the **only** timing source (components consume one shared `adaptationRef` — never reintroduce per-component timers).
- Lights-on steady state = **zero sustained cosmos draw calls**; heavy assets lazy-load only near the L2 approach; failures are classified fail-soft (Portal→drop volumetrics, Gaia→keep photo+hero stars, native sky→physical dome; Kerr→Schwarzschild) and every dispose is idempotent (StrictMode-safe).
- Quality tiers: High 80k Gaia / 0.68-scale Portal / 48 nebula steps · Medium 35k / 0.55 / 30 · Low 8k, **no volumetric FBO** · Minimum 360 procedural stars only. Auto-tier via rolling p95 with dwell/cooldown; player `Q` panel overrides (persisted); QA query overrides win over both.

**QA harness (query-only; ordinary visits always start lights-on and ignore these):**
`/villa-map/?observatory=test&view=loft-center&lights=off&quality=medium&motion=full&sky=impossible` (deterministic `frameloop="never"`, panel-driven 0.5/2/10 s steps) and `/villa-map/?observatory=perf&…` (real loop + walkable `PlayerControls`). Views: `l2-stair`, `loft-center`, `loft-edge`, `loft-room`, `black-hole-edge`. Baseline/acceptance screenshots: `docs/observatory-baseline/`, `docs/observatory-final/`. Remaining acceptance gap is human/target-GPU (Iris Xe/M1, UHD 620) validation, not code.

## Furniture workflow

1. Copy kit GLBs into the right `public/models/` dir (Kenney ≈0.45× metric → base scale 2.2; KayKit metre-authored → base scale 1). Villa upstairs y ≈ 6.66, ground y ≈ 0.11; mushroom floors per `MUSHROOM_INTERIOR.floorY`.
2. Append placement records to the matching `*-placements.js`; stamping derives `footprint`/`floor`/`solid`/`noShadow` (override per record when needed). Solid = substantial grounded pieces only; elevated clutter stays walk-through.
3. `npm test` + `npm run build`; eyeball in preview. The overlap/spacing tests gate regressions.

**Visual editor:** `/villa-map/?edit=1` swaps walk controls for orbit + drag gizmo with a dollhouse clipping plane (`[`/`]`), click a piece → panel prints the paste-ready placement record (`G`/`R` translate/rotate, `Esc` deselect). Data files stay the source of truth.

## Verifying the 3D scene in preview

Prefer the query-only observatory harness above — no temporary source hooks, production start position untouched. `observatory=test` gives deterministic fixed-camera screenshots; `observatory=perf` gives a real frame loop. If a headless preview pane opens at 0×0, force pixel dimensions on `.villa-map-shell` / `.villa-map-root` and dispatch `resize` first. Don't infer production FPS from a stalled headless pane, and don't ship `window.__villa*` debug hooks.
