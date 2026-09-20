# Impossible Observatory — runtime reference

Companion to `docs/IMPOSSIBLE_OBSERVATORY_PLAN.md` (design/phase record). This file is the *runtime* reference: module map, rare-event mechanics, journal, quality tiers and the QA harness. `CLAUDE.md` keeps only the invariants and traps.

## Module map (`src/villa-map/`, all node-pure)

| File | Role |
|------|------|
| `observatory-adaptation.js` | **The only timing source** — switch/dark-adaptation director emitting house-light, room-darkness, portal, bright/faint-star, nebula and motion channels |
| `mushroom-sky.js` | 80 m camera-centred sky: filtered Milky Way backdrop, deterministic GPU stars, point-mass lensing/event horizon, switch-driven reveal, L3 gating, stencil aperture, disposal |
| `mushroom-nebula.js` | Volumetric ray-march nebula ShaderMaterial; bounded High/Medium/Low presets, camera bridge, reduced-motion pause |
| `gaia-stars.js` | Gaia DR3 v1 binary decoder → ICRS geometry, G-magnitude/BP-RP rendering, one `THREE.Points` draw with LOD + GPU lensing |
| `observatory-portal.js` | Portal/FBO factories: capped target sizing, near-layer parallax camera, stencil-ref-7 emission/extinction composite, safe lens projection, resize, idempotent disposal |
| `observatory-rift.js` · `observatory-rift-visual.js` | Hidden non-Euclidean Rift: reversible transition director + expanding stencil dome, finite star/shard bands, unfolding rings |
| `observatory-black-hole.js` · `observatory-black-hole-pass.js` | Finite-distance 3D black hole (42 m anchor, tilted accretion disc, event horizon, photon shell, debris) + depth-buffered FBO pass and HDR composite |
| `observatory-kerr-lens.js` · `observatory-relativistic-lens.js` | Offline Kerr transfer atlas (a\*=0.94, i=78°; `public/data/observatory-kerr-*.bin`; High/Medium primary) → Schwarzschild LUT (Bruneton BSD-3, `public/data/observatory-black-hole-*.bin`) → analytic point-mass fallback |
| `observatory-disc-palette.js` · `observatory-disc-palette-data.js` | Node-pure, owned 512×1 sRGB emissive lookup derived from NestaEric's Black Hole (CC BY 4.0); no browser loader or geometry import |
| `observatory-gaia-source-map.js` · `observatory-star-volume.js` | Equirect source atlas so lens passes bend stars *and* photo sky through one light path / three finite star shells (72–184 m) for parallax, single deterministic Points draw |
| `observatory-events.js` · `observatory-sky-events.js` | Rare-event director (hazard roll, envelopes, cooldown, anti-streak, injectable RNG) / its 11 sky layers |
| `observatory-event-journal.js` | 天象图鉴 persistence: versioned localStorage sightings (count + first-seen), SSR/storage-failure safe; exports the wall book's interaction action type |
| `observatory-quality.js` · `observatory-quality-preference.js` | High/Medium/Low/Minimum caps + rolling-p95 auto-tier with dwell/cooldown hysteresis / persisted `Q`-panel choice |
| `observatory-audio.js` · `observatory-diagnostics.js` | Procedural spatial-audio graph math (no audio files) / camera bookmarks, frame-time summaries, render-target memory estimates |

React owners (`src/villa-map/react/`): `MushroomObservatoryRuntime.jsx` (assets, FBOs, hidden channels, fail-close, context-loss recovery), `MushroomObservatoryAudio.jsx` (`M` mutes), `ObservatoryEventJournal.jsx`, `ObservatoryQualityPanel.jsx`, `ObservatoryDiagnostics.jsx`.

## Layered cosmos

Photo Milky Way backdrop (0.36 brightness) → 360 procedural hero stars → real Gaia stars revealed bright→faint by magnitude → half-res volumetric nebula Portal with controlled parallax. Everything is clipped to the dome by stencil ref 7.

**Depth guard.** The pocket is buried, so the loft's upward view contains the whole above-ground map. Opaque surface meshes are painted over by the backdrop (`renderOrder` 901, `depthTest: false`), but transparent ones draw later and — with the physical dome hidden — met no depth between the loft and the meadow. The dome aperture therefore parents a depth-only disc (`mushroom-observatory-sky-depth-guard`: opaque queue, `colorWrite: false`, no stencil) floating at y ≈ -7 between the dome apex (-13.7) and the surface, wider than the camera far plane. It is visible exactly when the aperture is (one extra draw in dark mode, none lights-on), covers the R-expanded aperture as well as the dome, and leaves opaque output untouched. Contract: every main-scene cosmos layer keeps `depthTest: false`; the Rift's depth-tested pieces stay room-sized (`tests/observatory-depth-guard.test.mjs`).

## Quality tiers

| Tier | Gaia stars | Portal scale | Nebula steps |
|---|---|---|---|
| High | 80k | 0.68 | 48 |
| Medium | 35k | 0.55 | 30 |
| Low | 8k | **no volumetric FBO** | — |
| Minimum | — (360 procedural hero stars only) | — | — |

Auto-tier via rolling p95 with dwell/cooldown hysteresis; the player `Q` panel overrides it (persisted); QA query overrides win over both.

### Black-hole reference finish (2026-09-19)

The High/Medium Kerr renderer follows the broad horizontal disc, ivory rear arch and dark centre of [NestaEric's Black Hole](https://sketchfab.com/3d-models/black-hole-e410da98b1e5445eae2acafaaa53587d). It uses the supplied GLB's actual emissive palette, rather than importing its static geometry. This is a visual adaptation, not a mesh-identical copy or a calibrated thermal-emission model.

- Ray paths still use a\*=0.94 Kerr transfers. The inclination is now 78°, with a 768×384 atlas spanning alpha ±24 M / beta ±12 M. This preserves the previous 0.0625 M sample pitch while doubling the horizontal field. The four binaries total 16,515,104 bytes (15.75 MiB), loaded only near the observatory approach. Regenerate with `node scripts/build-kerr-transfer-atlas.mjs`; the metadata, hashes and asset tests must match.
- Emission spans 5.5–22 M, independently of the unchanged physical ISCO (2.023593 M). Compressed Doppler contrast, filtered radial bands, a narrow ivory crest and a stronger secondary image retain both sides of the reference silhouette. Differential gas flow still shares the adaptation clock (10/15/25 s reference periods). The emissive colour and contrast are deliberately art-directed.
- The 512 RGBA palette samples add 2 KiB before module encoding. Regenerate with `node scripts/extract-black-hole-palette.mjs /path/to/black_hole.glb`. Source hashes and author metadata live in `observatory-disc-palette-data.js`; public attribution is in `public/data/observatory-disc-palette-LICENSE.txt`. The original 31 MB GLB is not shipped.
- The direct disc image is an optically thick sheet: its lane-free silhouette (`innerEdge * outerEdge * validCoverage`) occludes the order-1 image behind it. Compositing the 0.68-weight secondary under the lane-modulated alpha alone let the white-hot rear arch show through the lane gaps as a full ring cutting across the front of the near disc. Lensed sky still grazes through the lanes as before.
- The Schwarzschild underlay clamps `ringApproach` before `pow(…, 3.2)`. Rounding put the receding half of the line of nodes a hair below zero; the resulting NaN survived a zero glint *and* the opaque Kerr layer's blend (`dst * 0`), and with the disc now nearly edge-on that line is its major axis — a dotted black line across the brightest lanes on every tier.
- The finite black-hole composite renders after the distant nebula, so foreground captured rays remain black and the ivory disc retains its brightness. The analytic aureole is suppressed over captured black pixels. Low keeps the Schwarzschild fallback, with its outer radius converted from M to r_s = 2 M; Minimum retains the existing analytic fallback.

Acceptance images: `docs/observatory-final/27-reference-black-hole.png` (High, `loft-center`), `28-reference-black-hole-edge.png` (High, `black-hole-edge`) — harness canvas captures (`renderOnce()` + `toDataURL`, F on, +40 s) taken after both artifact fixes above and the dome depth guard, so neither shows the secondary ring, the dotted line or surface transparents. Diagnostic evidence is in `29-reference-black-hole-qa.json`; its draw-call figures are unaffected by those fixes, its suite counts are the ones current when it was recorded. The query-only harness verifies the same renderer through hidden F and the `black-hole-transit` event; relighting returns black-hole/Portal added draws and FBO activity to zero. These deterministic snapshots do not establish real-time performance on target GPUs. The observatory suite passes 225/225 and the production build passes; the full suite passes 459/460, with the mushroom-window glazing-alignment failure independently reproduced on unmodified HEAD.

## 特殊天象 (rare celestial events)

While genuinely stargazing (dark loft, stars ≥ 0.5 revealed, sky renderable), `observatory-events.js` rolls a frame-rate-independent 3%/s hazard (`1-(1-p)^dt`) to start one of **13** events:

流星雨 / 彗星经过 / 星云增强 / 黑洞凌日 / 超新星爆发 / 火流星 / 卫星列车 / 行星合 / 极光 / 星座连线 / 月亮过境 / 千新星涟漪 / 不明飞行物

- Each event is a ~18–55 s smootherstep envelope followed by a 40 s cooldown, with its own zh journal line.
- All definitions currently carry explicit `weight: 1` (high-probability test phase). Weighted selection also keeps an anti-streak memory: the last `OBSERVATORY_RARE_EVENT_RECENT_MEMORY` (= 2) started events are excluded while the pool allows.
- The `-1` runtime frame owner feeds event probability/duration from **uncapped** active-view delta; ordinary visual damping stays capped.
- Q/journal modals, background visibility and manual R/F Lab requests freeze event progress, cooldown **and** RNG.
- Reduced motion removes 流星雨 / 火流星 / 卫星列车 / UFO from the pool *before* selection.
- Ineligibility (relight, leaving L3, availability loss) cancels via a 0.45 s release that never resurrects.

11 of the 13 render through `observatory-sky-events.js` inside the sky group (meteors, comet, supernova, bolide + train, satellite train, planet trio, aurora curtains, seeded stick-figure constellations 北斗/猪猪/蘑菇/爱心, phased moon, kilonova ripple, darting UFO) — additive billboards sharing `configureSkyStencil` (ref 7), seed-deterministic per occurrence, idempotent dispose. The other two drive existing systems: 星云增强 multiplies Portal emission, and 黑洞凌日 drives the **same** damped lens target as hidden-F (inheriting the full fail-soft ladder + audio) without touching React R/F state. 月亮过境 honestly washes out stars (hero ×0.65, Gaia faint ×0.2 at full moonlight). A small HUD caption (`.villa-map-rare-event`, user copy “特殊天象”) names the active event.

## 天象图鉴 (event journal)

An event is recorded (count + first-seen date) only after its envelope reaches the genuinely-visible ≥ 0.5 threshold, via `observatory-event-journal.js` into versioned localStorage. A physical KayKit book on an L3 west-wall shelf (`m3-journal-shelf` / `m3-journal-book` placements) carries an E interaction (`observatory-event-journal` action type in `world.js`) that opens `ObservatoryEventJournal.jsx` — a modal catalogue where unseen events stay as ？？？ silhouettes, following the `Q` panel's pointer-lock release/suspend discipline.

## QA harness (query-only)

Ordinary visits always start lights-on and ignore every parameter below.

```
/villa-map/?observatory=test&view=loft-center&lights=off&quality=medium&motion=full&sky=impossible
/villa-map/?observatory=perf&…
```

- `observatory=test` — deterministic `frameloop="never"`, panel-driven 0.5 / 2 / 10 s steps.
- `observatory=perf` — real frame loop + walkable `PlayerControls`.
- `view=` — `l2-stair`, `loft-center`, `loft-edge`, `loft-room`, `black-hole-edge`.
- In diagnostics modes the random event roll is disabled (chance 0). Pin one with `event=<id>` (any of the 13, e.g. `supernova`, `moon-transit`; fixed seed 0.5, restarts after completing) and aim its seeded sky position with `eventseed=0..1` — each occurrence's position/path derives from the seed, so scan seeds in Node against the view quaternions to land an event in frame.
- The QA snapshot reports per-event disabled ids/errors plus `rareEvents {mode,event,intensity,availability,availableEventIds,effectiveChancePerSecond,paused,pausedReason}`.

Baseline/acceptance screenshots: `docs/observatory-baseline/`, `docs/observatory-final/`. The remaining acceptance gap is human / target-GPU (Iris Xe, M1, UHD 620) validation, not code.
