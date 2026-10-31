# Little Universe

The birthday world is a separate React Three Fiber island. The villa's telescope
links to it; the villa sky renders only a small procedural version of the planet.

## Routes and review scope

| Route | Runtime | Publication |
|---|---|---|
| `/little-universe/` | `LittleUniverse.jsx` and `UniverseScene.jsx` | Production, noindex |
| `/little-universe/characters/` | Static Astro character gallery | Production, noindex |
| `/little-universe/sprout-pig/` | `src/review/sprout-pig.astro` | Development only |
| `/birthday-characters/sprout-pig-study-v1.glb` | Development endpoint | Development only |

`scripts/local-review-pages.mjs` injects the last two routes only for `astro dev`.
The study GLB lives in `art/little-universe/review/`, outside `public/`; the page
lives outside `src/pages/`. Neither is emitted by `npm run build` or served by
`npm run preview`. Run `node scripts/export-sprout-pig.mjs` to rebuild the local
study. Moving an artifact out of the deployed site does not remove its Git history
or make a public repository private. Noindex is not access control.

## Runtime ownership

| Module | Contract |
|---|---|
| `landmark-layout.js` | Six stable IDs, directions and label positions; pure sphere-position math. Shared geometry must import this, not personal content. |
| `content.js`, `media-details.js` | Birthday copy, movie/musical/series catalogs and details; loaded by the birthday island only. |
| `planet.js`, `miniature.js` | Procedural garden and landmarks; no browser globals or asset requests. |
| `focus-camera.js`, `UniverseScene.jsx` | Camera destinations and globe-safe flights; free overview orbit survives resize. Selection changes restore the saved overview; explicit reset and finale still use home. |
| `rooms.js`, `RoomInterior.jsx` | Room geometry, collision, movement, door transitions and room-specific content. |
| `CollectionModels.jsx` | Per-model GLTFLoader promise cache with meshopt decoding; a room and its detail viewer share decoded source models. |
| `CampingVignette.jsx` | Camping props and two characters load when the overview mounts; focus gates animation, not download. |
| `MovieNight.jsx`, `MusicWorld.jsx`, `OneMoreEpisode.jsx` | Posters and their detail viewers. Vinyl covers load with the listening room. |
| `LittleUniverse.jsx` | UI, visited memories, finale, room state and gesture-only background audio. |

The removed `CharacterPreview.jsx`, `camp-standees.js`, `characters.js` and
`clay-pig.js` were unused earlier designs; their history remains in Git.

## Villa gateway

`src/villa-map/little-universe-gateway.js` owns the URLs, action, shared
`UNIVERSE_GATEWAY_ID`, telescope position and return pose. `world.player.start`
may include `yaw`; controls apply it on creation. The ordinary start remains
`{ x: 0, y: 1.6, z: 18 }`.

Returning via `/villa-map/?arrival=little-universe` selects the telescope pose
`{ x: 2, y: 1.6, z: 16.6, yaw: -0.45 }`. After controls apply the pose,
`consumeUniverseArrival` removes only that recognized query parameter with
`history.replaceState`, retaining other parameters, the hash and history state.
Refreshing or sharing the resulting URL uses the normal entrance.

The existing query-only diagnostics have two additional bookmarks:

- `/villa-map/?observatory=test&view=universe-gateway` looks at the sky planet.
- `/villa-map/?observatory=test&view=universe-telescope` looks at the telescope.

The procedural sky planet opts into `{ distant: true }` on the same garden and
landmark factories. Positions, colours and authored parts stay shared; distant
boxes omit subpixel bevels and curved surfaces use fewer segments. Full-detail
birthday factories keep their existing defaults. Vertex colours merge opaque
paint colours into three surface finishes (globe, scenery, pond); the transparent
ring remains a separate batch. The sky-only shader preserves the previous haze,
indirect-light attenuation and per-colour emissive fill.

The sky now has 4 mesh batches / 27,764 triangles / 2,878,736 geometry bytes,
down from 66 / 108,532 / 7,746,368. It does not fetch birthday models, posters or
audio. Tests cap it at 4 meshes / 30,000 triangles / 3 MiB and compare the distant
and full-detail bounds for all six destinations and the garden. These are
geometry limits, not measured FPS.

## Asset workflow and budgets

- Collection models: `public/little-universe/models/sources.json` records source
  files, transformations, byte lengths and hashes. `collection-models.test.mjs`
  already enforces a 44 MiB total, a 12 MiB fighter subtotal and several per-model
  limits, including DA20 < 8 MiB and each fighter < 5 MiB. Preserve original
  markings, UVs, glass and geometry details when considering further reduction.
- Vinyl: lossless WebP sources are preserved in `art/little-universe/vinyl-records/`.
  Run `node scripts/optimize-vinyl-records.mjs` to generate quality-85 WebPs at the
  same dimensions. Source checksums prevent accidental recompression from lossy
  runtime copies. The script updates runtime sizes/hashes in `sources.json`;
  `vinyl-assets.test.mjs` enforces 512 KiB per cover / 1.5 MiB total.
- Public character PNGs remain full-resolution gallery download targets. They
  are not loaded by the ordinary birthday overview; keep that use distinct from
  unused source files when measuring download cost.
- Deploy runs `npm test` before `npm run build`. Tests passing do not establish
  visual acceptance or third-party redistribution permission.

## Open decisions after the October 30 audit

| Priority | Pending work | Evidence boundary |
|---|---|---|
| Before declaring licensing cleared | Recover original audio, camping and imported model license terms/download pages. | Current provenance does not independently establish permission for web-delivered GLBs/audio. Archive filenames do not establish purchase or license status. |
| Before declaring licensing cleared | Review artwork permissions individually and record any required attribution. | Film/musical posters, Commons logos and author-supplied covers are different source categories; do not label all of them non-free or invent a license. |
| Owner decision | Confirm whether personal names and collection wording are intended for a public gift page. | Wording is unchanged by the engineering fixes. |
| Performance follow-up | Profile mobile room entry and consider SU-100/DA20 reductions. | The distant sky optimization is verified below; mobile performance and collection-model reductions still require separate measurements and visual review. |

## Verification

Run `npm test` and `npm run build`. Check the production output for the absence
of the review page/model and inspect the villa's static JS dependency closure to
ensure personal birthday content has not leaked back into a shared chunk.

In preview, check the overview, orbit then resize, enter/leave a landmark, the
explicit reset, the listening-room covers and the return-to-villa link. In dev,
check the study route and its GLB. Refresh the diagnostics panel after streaming
finishes; its initial JSON is a mount-time snapshot. A stalled headless canvas
does not constitute visual acceptance of the villa.

### October 30 engineering verification

513/513 tests passed; the production build emitted 42 pages. Both study URLs
returned 404 in preview and 200 in development, with the served GLB matching its
source hash. The villa's static JS import closure contains no personal birthday
copy. Public assets fell from 170,886,888 to 159,783,127 bytes; preserved art sources
and QA screenshots are outside public and do not contribute to visitor downloads.

Browser checks confirmed orbit retention across resize, explicit reset, listening
room navigation and vinyl display, telescope arrival with query consumption, and
normal entrance after refresh. The villa and its distant planet rendered visibly
in this run. No console errors were captured; the existing THREE.Clock deprecation
warning remains. This does not establish mobile performance or license clearance.

Results and screenshots: [`little-universe-audit/verification.json`](little-universe-audit/verification.json).
The full run used a temporary local copy with the same lockfile after cloud-backed
workspace dependency reads stalled; changed source files were checked for byte
identity before delivery.

### October 30 distant sky optimization

514/514 tests passed and the production build emitted 42 pages from the workspace.
The 1280x720 fixed `universe-gateway` camera rendered the optimized planet with
4 batches, all 139 streamed assets settled without failure, and no console errors.
Before/after screenshots retain the planet's apparent size, placement, colours
and silhouette at the courtyard viewing distance. Tiny bevels and tessellation
are intentionally different; this is not a pixel-identical close-up model or a
claim of measured mobile FPS improvement. The full-detail birthday geometry is
unchanged and remains the default for the destination page.

Measurements and screenshots: [`sky-planet-optimization/verification.json`](sky-planet-optimization/verification.json),
[`before`](sky-planet-optimization/before.png), [`after`](sky-planet-optimization/after.png).
No publishing was performed.
