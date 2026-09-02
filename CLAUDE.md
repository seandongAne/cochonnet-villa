# Cochonnet Villa

## 协作约定 · Workflow rules

**语言** — 日常交流、汇报、方案说明、评审结论一律用中文。代码、标识符、文件路径、命令、库名，以及硬翻会失真的技术术语（node-pure、stencil、fail-soft、FBO、pointer lock、LUT…）保留英文原文，不要生造中文译名；引用仓库或界面里的原文（提交信息、UI 文案）照抄原样。仓库里的文档与代码注释继续用英文，这条只约束我们的对话。

**评审** — **不要手动 @codex review。** 它会无限挖边际问题，并把场景推到不真实的使用假设上，我们已经踩过坑。需要复查时跑 `npm test` + 本地 preview，或者直接让我做针对性 review。

**`CLAUDE.md` 是主本，`AGENTS.md` 是它的副本**（同一份文档，两个文件名，因为不同 agent 找不同的文件）。有出入时以 `CLAUDE.md` 为准；改完它再 `cp CLAUDE.md AGENTS.md`。这一步是手动的、也只在文档定稿后做一次 —— 不要为它加自动校验，工作进行到一半时被文档不一致打断，比分叉本身更耽误事。（它们曾经分叉三周，AGENTS.md 漏掉了整个小记功能，还把 `/admin/` 的鉴权写成早就不用的 Decap OAuth。）

## What this is

Static Astro site about 15 pet pigs, built to GitHub Pages. Three features:

| Feature | Route | Rendered by | Source of truth | Editor |
|---|---|---|---|---|
| Landing site | `/` | `src/pages/index.astro` + `src/render-site.js` | `content/site.json` | `/admin/` |
| 猪猪小记 blog | `/notes/` | `src/render-notes.js` (node-pure, build time) | `content/notes.json` | `/admin/notes/` |
| 3D Villa Map | `/villa-map/` | React Three Fiber island (`src/villa-map/`) | code + GLBs in `public/models/` | `/villa-map/?edit=1` |

Both editors are backend-free: they commit through the GitHub Contents API with a fine-grained token kept in localStorage (`cochonnetvilla_github_token`) — no OAuth, no server. Publishing pushes `content/*.json`; Pages redeploys in ~1–2 min.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run preview` — serve the build (full speed; dev is slow to first-compile the three/drei bundle)
- `npm test` — `node:test` over `tests/*.test.mjs`, one file per concern

## Conventions

- ES modules everywhere (`"type": "module"`).
- **Node-pure core.** Anything the tests import (all of `src/villa-map/*.js`, `render-*.js`, `notes-draft.js`, `seo.js`) must not touch `window` / `document` / `TextureLoader` at import time. The React layer is the only browser owner.
- React island only on `/villa-map/` (`client:only="react"`); every other page is vanilla Astro static HTML. Bilingual, content defaults to `zh`, `data-i18n` hooks.
- Procedural geometry at runtime; pre-made GLBs (pigs / furniture / props) load through a raw `GLTFLoader` + per-URL promise cache + bbox auto-fit + procedural fallback, mounted via `<primitive object={…}>` — **not** drei `useGLTF`. Keeps the core node-testable and the loader uniform.
- **Version pins (don't bump blindly):** Astro 6 / Vite 7, `@astrojs/react@^5`, `overrides: { vite: "^7" }`. drei `<SoftShadows>` is broken with three r184 → shadows use `PCFShadowMap`.
- Tests are behavior-pinning, not smoke tests: world/collision/interaction geometry, asset existence (GLBs, colormap atlas, observatory bins incl. SHA-256), overlap (`overlap.test.mjs`: solid non-chair clip ≤ 0.5 m²), same-model spacing (`spacing.test.mjs`: ≥ 1.8 m, chair family + railing exempt), villa shell palette, viewport scaling, and the full `observatory-*` / `mushroom-*` / `star-ceiling` suite.

## 猪猪小记 blog

**Rendering** — `src/render-notes.js` escapes HTML first, then applies markdown-lite: blank-line paragraphs, `## `, `- `, `**bold**`, `*italic*`. Emits `/notes/`, `/notes/<slug>/` (`getStaticPaths`) and the latest-3 landing teaser (`id="notes"`, i18n keys `nav.notes` / `notes.*`). Teaser is bilingual; the `/notes/` pages are Chinese-first.

**Editor** — `/admin/notes/` = `src/pages/admin/notes.astro` + `src/notes-admin.js`, Astro-bundled so the live preview runs the real renderer. List collapses to the newest 3 (`visibleNoteList` always keeps the 编辑中 entry visible; expanded state persisted, expanded list scrolls inside the card). Pop-out editor window is painted opaque (`--shell-solid`).

**Publish guard (non-negotiable)** — publish requires known remote state (a successful read *or* a definite 404) and merges remote-only slugs first. A failed initial read must never clobber published notes. A tab that already read successfully keeps its `sha`, so a publish from a stale tab is refused by GitHub with a 409 rather than merged — the guard, not the banner below, is what protects the data.

**Stale-tab banner** (`src/notes-staleness.js`, node-pure) — a tab left open holds the `sha` it last read; if anyone publishes meanwhile (another device, or a plain `git push`) that sha goes stale. On `visibilitychange` back to the foreground the editor spends one throttled GET (2 min) to compare shas and, on a mismatch, shows a banner offering 「同步最新内容」 → `fetchNotes({ discardLocal: false })`, which merges the remote list *underneath* unpublished local edits (unlike 「重新读取」, which discards them). Courtesy only: it is fail-soft (a failed request never raises a false alarm) and gates nothing — the 409 above is the real protection.

**The banner must not over-promise.** `mergeRemoteNotes` resolves same-slug clashes *local-wins*, so syncing a slug both sides edited means the next publish overwrites the other device's version. `findMergeConflicts` compares `title`/`date`/`mood`/`body` (never `image` — the art workflow stamps that) and the notice names the contested entries instead of claiming nothing is lost; conflicts are recomputed on every render, since staging a further edit can newly contest a slug. A remote *deletion* is deliberately not detected — the editor keeps no record of which local entries came from a past read, so it is indistinguishable from a local draft; the wording just never promises that side is safe.

**One snapshot, judged and merged (non-negotiable).** The banner is drawn against the snapshot a *past* check read, so 「同步最新内容」 must fetch first and re-judge the snapshot it is **about to merge** (`applyRemote`, split out of `fetchNotes` for exactly this). If that turns up a conflict the notice never named (`findUnacknowledgedConflicts`, keyed by slug — titles repeat), it redraws and refuses to merge, because merging would both overwrite an unannounced edit *and* adopt the new `sha`, removing the 409 that would otherwise have stopped the publish. Only a conflict the author has actually been shown may pass silently. Likewise `checkRemoteFreshness` captures the sha it is asking about and drops its own answer if `state.sha` moved meanwhile — otherwise a check that raced a successful publish reports the pre-publish file as "someone else changed it".

**`normalizeNotes`** — sorts newest-first, drops empty entries, dedupes slugs (date-based, `-2` suffixes), and **preserves the sanitized `image` field** so the editor never strips generated art.

**Two-tier drafts** (`src/notes-draft.js`, node-pure; payload v2 + legacy v1 migration) — every keystroke persists the full editor state (form **and** staged list while dirty) to localStorage. 5-min idle / tab hidden / manual「备份草稿」commits it to `content/notes-draft.json` on the **`notes-drafts` branch** (never deploys, auto-creates the branch, skips no-change commits via `draftContentKey`). Restore picks the newer of local/cloud (`chooseDraftSource`; ties → local); a restored staged list re-enters the dirty+merge path, and `mergeRemoteNotes` adopts the remote `image` when the local twin lacks one. Publish clears both tiers. Pinned by `tests/notes.test.mjs` + `tests/notes-draft.test.mjs`.

**Auto note-art** — `.github/workflows/generate-note-art.yml` fires on `content/notes.json` pushes to main → `scripts/generate-note-art.mjs` calls the OpenAI Image API (`gpt-image-2`, 1536×1024 webp, medium quality, ≤ 4 per run) for notes without `image`, writes `public/notes-art/<slug>.webp`, stamps `image`, commits, then explicitly dispatches `deploy-pages.yml`. Needs the Actions secret `OPENAI_API_KEY`; without it the run is a logged no-op. Prompts are **text-only** — character identity comes from `PORKY_CAST` (15 pigs; 小猪 = tiny, brown bob + black sleeveless top) plus `GUEST_CAST` (白白菜, mirroring `public/characters/baibaicai/manifest.json`). The author-only inline marker `[[character name]]` renders everywhere as the plain name and explicitly injects that identity; ambiguous bare `小猪` never selects the named character. Reference images (`public/porkies/*.png`, `public/characters/`) are never uploaded to the API.

## 3D scene (`src/villa-map/`)

Framework-agnostic core — pure logic + Three.js factories, reused verbatim by the React layer **and** the node test suite.

| File | Role |
|------|------|
| `world.js` | Geometry data, collision (2D AABB + optional Y range + the mushroom interior's circular boundary), interaction/stair/water/floor zones, `MUSHROOM_INTERIOR` pocket-space data |
| `controls.js` | WASD + pointer-lock factory (drag-look fallback when lock is denied), camera-Y interp through stair/floor/water zones, `teleport()`, E-key `onAction`, modifier-safe hidden R/F actions |
| `interaction.js` | `findNearestInteraction` proximity + Y-floor filtering; fixed-radius camera-ray targeting for the hidden physical controls |
| `assets.js` · `mushroom-interior.js` (+`-config`) | Procedural meshes: beveled villa shell, open glass-curtain front, hot springs, meadow / three-storey round tower, L1–L2 fairy-light & bunting canopies, the physical L3 light switch, node-pure fallback sky dome |
| `porky-models.js` · `furniture-models.js` | GLB loaders: 15 pig variants with procedural fallback / generic prop loader (per-pack base scale, X/Z re-center, floor-sit, placeholder + fallback), reused for exterior & architecture props |
| `placements.js` · `furniture-placements.js` · `exterior-placements.js` · `architecture-placements.js` | Placement data (position / rotation / variant) per room or area; stamping derives `footprint` / `floor` / `solid` / `noShadow`. Mushroom `wallMounted` decor projects tangent to the round wall; `onWallShelfId` clutter follows its shelf |
| `shadows.js` · `furniture-colliders.js` | `createShadowBlobs()` soft radial-gradient contact shadows (skips `noShadow`) / `deriveFurnitureColliders()` rotated-AABB colliders for `solid` props (0.85 shrink, floor-scoped Y) |
| `camera-framing.js` | Ultra-wide FOV math (see *Viewport*) |

Observatory core — 20 further node-pure modules (`mushroom-sky`, `mushroom-nebula`, `gaia-stars`, `observatory-*`): module map in [`docs/OBSERVATORY_RUNTIME.md`](docs/OBSERVATORY_RUNTIME.md).

React layer (`src/villa-map/react/`, client-only):

| File | Role |
|------|------|
| `VillaMap.jsx` | Island root: `<Canvas>` (`stencil: true`) + overlay/loading/HUD state; owns E light state, hidden R/F state, the `Q` quality panel and the query-only QA panel |
| `Scene.jsx` | Lights, fog, IBL; mounts factory meshes/Rift (the rare-event layer rides inside the sky group) and shares one `adaptationRef` across lighting, palette, exposure, markers and sky runtime |
| `PlayerControls.jsx` | Bridges controls/interaction into R3F at priority `-2`; R/F reach React only while the L3 camera ray hits the physical wall switch |
| `MushroomObservatoryRuntime.jsx` | Sole browser owner of 4K/8K/Gaia/LUT/atlas lazy loading + prewarm, FBO render choreography (priority `-1`), hidden Rift/Lens channels, classified fail-close, context-loss recovery, diagnostics |
| `MushroomObservatoryAudio.jsx` | Web Audio bridge: gesture-gated context, HRTF-panned switch/dome/rift/black-hole layers off the same per-frame adaptation state; `M` mutes |
| `ObservatoryEventJournal.jsx` | 天象图鉴 modal (unseen events stay ？？？ silhouettes); follows the Q panel's pointer-lock release/suspend discipline |
| `ObservatoryDiagnostics.jsx` · `ObservatoryQualityPanel.jsx` | Query-only fixed-camera test/perf harness / player-facing quality panel |
| `UltraWideFraming.jsx` · `EditControls.jsx` | Ultra-wide FOV bridge / `?edit=1` furniture editor (orbit + drag gizmo + clipping plane; prints paste-ready placement records) |

### World facts

- Bounds x `[-40, 44]`, z `[-40, 42]`; no perimeter fence (oversized meadow + fog hide the rim). Main villa is two floors (ground eye-Y ≈ 1.6, upper ≈ 8.05). A world test asserts the normal start is `{0, 1.6, 18}`.
- The mushroom-house interior is a **buried pocket space** under XZ (-6, 18), scaled 2× (~19 m across; slab tops y = -48/-40/-32, floor indices 2/3/4), reached only by E-key teleport at the door. Every interior zone/collider is Y-banded; the exterior `mushroom-house` collider is Y-scoped `[0, 30]`.
- GLB dirs (each with its own `LICENSE.txt`): `public/models/porkies/` (pigs), `furniture/` (Kenney CC0 Furniture Kit, base scale 2.2), `mushroom-furniture/` (53-model KayKit Furniture Bits CC0, base scale 1), `exterior/` (Kenney Nature + Holiday), `architecture/` (Kenney Furniture + City-Suburban).
- Observatory data/textures: `public/textures/qwantani-night-puresky-dome-{4k,8k}.webp` (Poly Haven CC0), `public/data/gaia-bright-stars-v1.bin` (+meta, ESA/Gaia/DPAC), Schwarzschild LUTs (Bruneton BSD-3), self-generated Kerr atlas (CC0). Regeneration scripts in `scripts/`; provenance/SHA-256 in the sibling `.meta.json` / LICENSE files. Keep the `-v1` filenames and metadata in sync when regenerating — the shipped bins are byte-pinned by tests.

## Impossible Observatory (mushroom L3)

The L3 loft is a dark-adaptation observatory: press E at the physical wall switch and the warm room drops to near-black, then a layered cosmos is revealed — photo Milky Way backdrop, procedural hero stars, real Gaia stars bright→faint, volumetric nebula Portal — all clipped to the dome by stencil ref 7. While genuinely stargazing, a 3%/s hazard starts one of 13 **特殊天象** (~18–55 s each, 40 s cooldown), recorded into the **天象图鉴** you open from a physical book on an L3 shelf. **Hidden Lab:** aiming at the switch, `R` toggles the non-Euclidean Rift and `F` the finite-distance black hole / gravitational lens; the production HUD never advertises them. `E`/lights-on and leaving L3 reset everything.

**Read before touching observatory code:** [`docs/OBSERVATORY_RUNTIME.md`](docs/OBSERVATORY_RUNTIME.md) (module map, event mechanics, journal, quality tiers, QA harness) and `docs/IMPOSSIBLE_OBSERVATORY_PLAN.md` (design record).

Invariants that must hold:

- `MushroomObservatoryRuntime` is the **sole browser owner** of observatory assets/FBOs; `observatory-adaptation.js` is the **only** timing source — components consume one shared `adaptationRef`, never per-component timers.
- Lights-on steady state = **zero sustained cosmos draw calls**; heavy assets lazy-load only near the L2 approach.
- Failures are classified fail-soft (Portal → drop volumetrics; Gaia → keep photo + hero stars; native sky → physical dome; Kerr → Schwarzschild → analytic) and every dispose is idempotent (StrictMode-safe).
- Quality tiers High/Medium/Low/Minimum auto-select via rolling p95 with hysteresis; the player `Q` panel overrides (persisted), QA query params override both.
- Verify with the query-only harness (`/villa-map/?observatory=test|perf&…`) — never with temporary source hooks; ordinary visits must keep starting lights-on.

## Viewport & aspect ratio

`src/viewport-scale.css` is the single source for screen-shape adaptation, imported by every Astro page. Laptops and ordinary 16:9/16:10 desktops sit below every tier and render exactly as before.

Ultra-wide **zooms and widens the same layout — it never re-columns it**, so a 32:9 desktop shows the laptop layout, larger. Root font size tracks viewport *height* (`clamp(1rem, 1.48vh, 2rem)`), keeping the design viewport ~1080 design px tall; `--shell-max` / `--shell-max-narrow` / `--shell-gutter(-tight)` widen the content band from ~31% to ~50% of the screen. 5120×1440 and 7680×2160 therefore resolve to the *same* 3840×1080 design layout (root 21.3px / 32px). `tests/viewport-scale.test.mjs` guards this and the no-reflow rule.

3D: `camera-framing.js` + `react/UltraWideFraming.jsx` hold horizontal FOV at ≤ 120° past ~21:9 by narrowing the vertical one. 16:9/16:10/21:9 keep the authored 70° vertical FOV; only 32:9 changes (136° → 120°).

## SEO

`src/components/SeoHead.astro` is the only `<head>` SEO block: every public page renders exactly one, passes an explicit `path`, and gets `<title>` / description / canonical / Open Graph / Twitter card / JSON-LD from it. Canonicals are `Astro.site` + trailing-slash path, so `astro.config.mjs` `site` and `SITE_URL` in `src/seo.js` must match (pinned by `tests/seo.test.mjs`). `src/seo.js` is node-pure and shared with the `/sitemap.xml` and `/robots.txt` endpoints (`src/pages/*.js`) and the tests.

- **Share image** — `public/assets/og-cover.jpg` (1200×630) is the default card, generated once by `scripts/generate-og-cover.py` (Pillow + macOS system fonts; re-run only to restyle). Notes share their own art (`/notes-art/<slug>.webp`, always 1536×1024 → `noteArtDimensions`) and fall back to the card while the art workflow hasn't stamped one yet.
- **JSON-LD** — `WebSite` (home), `Blog` + `BreadcrumbList` (`/notes/`), `BlogPosting` + `BreadcrumbList` (each note), `WebPage` (villa map). `serializeJsonLd` escapes `<` so note text can never close the script tag.
- **Sitemap / robots** — `/sitemap.xml` lists home, `/notes/`, every note (`lastmod` = note date) and `/villa-map/`. `/robots.txt` points at it and deliberately does **not** `Disallow: /admin/`: the editors rely on `<meta name="robots" content="noindex, nofollow">`, which a Disallow would hide from the crawler (the URL could then be indexed title-less from the footer link). Internal links into `/admin/` carry `rel="nofollow"`.
- **Core Web Vitals** — the note detail art is the LCP image: `loading="eager" fetchpriority="high"` with `width`/`height` reserved (`.note-art img { height: auto }` keeps the ratio). Card art keeps `aspect-ratio` in CSS instead. Landing portraits are served as 768 px WebP (`scripts/build-porky-webp.mjs`, uses the `sharp` that ships with Astro); the 1024² PNG originals stay in `public/porkies/` as the source the share-card script reads — after adding a pig, drop its PNG there, run the script, and point `site.json` at the `.webp`. Web fonts load from `src/components/Fonts.astro` (a head `<link>`), never from a CSS ``. `/villa-map/` carries a visually-hidden `<h1>` and a `<noscript>` fallback because the island renders nothing server-side.

## Workflows

**Adding furniture / props**

1. Copy kit GLBs into the right `public/models/` dir (Kenney ≈0.45× metric → base scale 2.2; KayKit metre-authored → base scale 1). Villa upstairs y ≈ 6.66, ground y ≈ 0.11; mushroom floors per `MUSHROOM_INTERIOR.floorY`.
2. Append placement records to the matching `*-placements.js`; stamping derives `footprint` / `floor` / `solid` / `noShadow` (override per record when needed). Solid = substantial grounded pieces only; elevated clutter stays walk-through.
3. `npm test` + `npm run build`, then eyeball in preview. The overlap/spacing tests gate regressions.

**Visual editor** — `/villa-map/?edit=1` swaps walk controls for orbit + drag gizmo with a dollhouse clipping plane (`[` / `]`); click a piece → the panel prints a paste-ready placement record (`G`/`R` translate/rotate, `Esc` deselect). Data files stay the source of truth.

**Verifying the 3D scene in preview** — prefer the query-only harness above: no temporary source hooks, production start position untouched. `observatory=test` for deterministic fixed-camera screenshots, `observatory=perf` for a real frame loop.

## Gotchas — hard-won, don't relearn

- **`notes-drafts` branch is live data**, not a stale branch — it is the cloud tier of the draft backup. Never delete or prune it.
- **GITHUB_TOKEN pushes don't retrigger workflows** — that's why the note-art job explicitly dispatches `deploy-pages.yml`.
- **`viewport-scale.css` must be inlined into the raw `/admin/` document via `?raw`** — `<Fragment set:html>` gets no injected stylesheet.
- **The ultra-wide zoom only works because the layout is rem-authored.** One hard-coded px width (shell caps, `minmax(320px, …)`) pins that column at laptop size while everything around it scales.
- **UnityGLTF-exported Kenney GLBs** (Holiday `bench`/`lantern`; City-Suburban `railing`/`planter`) reference `Textures/colormap.png` by relative URI — the atlas must be vendored per dir or those props render flat white.
- **Every sky-event billboard material must stay `DoubleSide`** — the anchored tangent frames face outward, so FrontSide culls them for a viewer at the shell's centre.
- **Never use GLSL ES reserved words** (`active`, `filter`, `input`, `output`, `superp`…) as shader identifiers — ANGLE rejects the program. Shader failure classification is per event: dispose and drop only that event id from the weighted pool, never collapse all 11 sky layers (`observatory-sky-events.test.mjs` pins this).
- **`openObservatoryJournal(event)` must `stopPropagation()`** — the opening E keydown arrives on the controls' *document* listener while the book's close listener sits on *window*, and React registers the latter in a microtask between the two targets of the same in-flight event; otherwise one keypress opens **and** closes the book.
- **`PlayerControls`' controls-creation effect may depend only on `[camera, gl, world, lockRef, wantLockRef]`** (every React callback is bridged through refs) — `createExplorerControls` resets the camera to the world start, so a remount mid-session is a player-visible teleport. Pinned by `observatory-event-journal.test.mjs` + `observatory-hidden-controls.test.mjs`.
- **Headless preview panes** sometimes open at 0×0: force pixel dimensions on `.villa-map-shell` / `.villa-map-root` and dispatch `resize` first. Don't infer production FPS from a stalled headless pane, and never ship `window.__villa*` debug hooks.
