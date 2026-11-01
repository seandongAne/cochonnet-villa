# The Little Gallery

An independent public art collection inside `/little-universe/`, entered from the seventh destination, **The Little Gallery / 一幅一刻**. The exterior also offers the full-image browser without requiring WebGL room entry. No note password is requested.

## Data boundary

- Runtime imports only `content/gallery.json`, never the notes document.
- Every work has an opaque SHA-256 identifier, a stable artwork number, copied original and thumbnail paths, dimensions, a UTC timestamp, and a timestamp kind. No note title, body, slug, source URL, or author/editor link is exposed in this manifest or gallery UI.
- Originals are byte-identical copies; their URLs use content hashes rather than note filenames. Thumbnails are up to 720 px wide, retaining the original aspect ratio. The gallery retains older copies when notes are edited, deleted, or regenerated.
- Identical image bytes are one work even if referenced more than once. Different bytes at an existing source path create an additional work. Original source images and notes are not changed by the sync.
- Picture labels are artwork numbers. Both landscape and older square originals fit within the frames and viewer without cropping or stretching.

## Automatic publication

`generate-note-art.mjs` records `imageGeneratedAt` and `imageSha256` only after successfully writing generated image bytes, then invokes `syncNoteGallery`. The generation timestamp is accepted only when its digest matches the actual source bytes. The notes editor preserves these stamps through normalization and image adoption.

The existing note-art Actions workflow stages `content/gallery.json` and `public/little-universe/gallery` alongside the generated originals and notes. Its existing stale-main refusal, recovery artifact, and explicit Pages dispatch remain in place. Gallery originals/thumbnails and the public manifest are included in recovery artifacts too. No new service, credential, DNS setting or dependency is required.

For locally supplied or repaired artwork, run:

```powershell
node scripts/sync-note-gallery.mjs
npm test
npm run build
```

Commit the gallery manifest and copied images together. Re-running sync without new image bytes is a no-op. Do not delete gallery works when deleting notes. A future deliberate gallery removal should be handled as a separate author request.

## Timestamp semantics

- `generated` / 生成时间: the successful image-generation timestamp, bound to its SHA-256.
- `archived` / 归档时间: the latest Git commit that changed the source image; used for the 35 initial works because exact generation timestamps were not recorded historically.
- `imported` / 入藏时间: sync time when neither a matching generation stamp nor image history is available.

All stored values are UTC ISO timestamps; the UI displays Toronto local time with the appropriate EST/EDT abbreviation. The collection is newest-first; stable artwork numbers do not change when browsing or adding works.

## Rendering and checks

`gallery.js` supplies the node-pure collection helpers and procedural pavilion/interior. `Gallery.jsx` owns browser textures through the shared WallPoster component, uses nine weekly selected thumbnails for the walls, and opens one original at a time in a native dialog. Arrow keys/buttons, thumbnail selection, Escape, focus restoration and paused room input follow the existing collection viewer pattern. The dialog remains available from the exterior when WebGL is unavailable.

Behavior tests cover independent copies, deduplication, regeneration at the same path, source deletion, truthful timestamps, generation-to-gallery flow, editor stamp preservation, asset hashes/dimensions, and deterministic weekly selection. Existing room geometry/collision and planet camera tests cover the new destination. The seventh miniature increases the rooftop sky planet to 80 draws and 112,464 triangles; bounded budgets are now 85 draws / 115,000 triangles.

Local verification includes production build, desktop/mobile previews, wall switching, full-image browsing, timestamp rendering, and Escape/focus behavior. Publication remains a separate Git push/deployment step.

## Daylight cottage interior (October 31 redesign)

The exterior and collection data stay unchanged. `gallery-interior.js` owns the
10 x 12 m interior, 6.6 m ridge, real arched window openings, glazed ridge,
light oak rafters, two broad portal arches, thin frames, and restrained ceramic
sculptures/bench/flower details. The two plinths and the bench sit in the entrance
alcoves; the central two-metre-wide aisle and every painting approach stay clear.
Nine exhibition positions share a 2.12 m hanging centerline with varied frame sizes.
`fitPoster` fits all originals, including square works, without cropping.

`GalleryLighting.jsx` mounts gallery-only hemisphere/ambient fill, one warm sun,
and nine unshadowed art spotlights. The sun has one 1024-square static shadow map;
`shadow.needsUpdate` must be true on first mount before caching it. Omitting that
initial update can make standard-material geometry disappear in the browser.
No external textures, models, lighting libraries, or dependencies were added.
Static architecture/decor is batched into 40 meshes and 72,793 triangles.
These geometry figures are not a measured FPS claim.

The existing room controls select gallery-only spawn, speed and bounds. Furniture
and portal-foot collision uses the existing bounded substeps. Other rooms keep
their original bounds, speed, lighting and appearance. Hover adds a still gold rim
without motion, while native-dialog paging, keyboard controls, focus restoration,
viewer pause and timestamp semantics retain their existing owners.
Gallery-specific CSS gives the interior controls a light ivory palette.

Regression coverage in `gallery-interior.test.mjs` checks the full central walk,
large-step collision, sliding, every artwork approach, image fit and geometry
budgets. `little-universe-rooms.test.mjs` retains the original bounds checks for
other rooms and adds the larger gallery envelope.

Validation for this redesign: 564/564 tests passed, production build emitted 43
pages, and `git diff --check` passed. Production preview was inspected at desktop
and 390 x 844 widths: physical artwork click, all five wall groups, original-image
next/arrow/last-item selection, Escape isolation, walking, drag-look, entrance
sculptures and bench/rug alcove were checked. The narrow viewer had a 390 px
scroll width at a 390 px viewport. No browser errors were captured; the existing
Three.js Clock deprecation warning remains. Real-device touch performance and
subjective visual acceptance are still user review items.


Gallery wheel zoom is bounded to 38–78 degrees and never arms or triggers room
exit, including repeated gestures after a pause. At either limit it simply stops;
scrolling in the opposite direction resumes zoom immediately. Visitors leave via
the existing Step outside control or Escape. All rooms now use the same explicit-exit policy. The gallery doorway click surface
is aligned with its enlarged entrance at z = 5.85 m.


## Weekly exhibition

The walls show up to nine distinct randomly selected works, with three frames on
each of the rear, left and right walls. The complete collection remains available
in the existing full-image browser. There is no wall paging control.

`galleryWeekKey` uses the Monday calendar date in America/Toronto, including DST
and year transitions. `weeklyGalleryWorks` uses that key to seed a deterministic
Fisher-Yates shuffle over canonical artwork IDs. For the same collection, the
selection and hanging order remain identical throughout the week across reloads
and devices. A new Monday draws a new selection; some works may recur in adjacent
weeks. A deployment that adds or removes collection records can change that week's
draw. The algorithm never edits the manifest or original artwork.

`useGalleryWeek` owns the browser clock through the node-pure `watchGalleryWeek`:
minute-boundary checks update an open page, while focus/visibility wake checks
immediately catch a missed week boundary. Update latency while open is at most
about a minute. No server, scheduled deployment, or external automation is needed;
the browser's local clock supplies the current instant. The UI displays the week
start and Toronto timezone. Reduced motion adds no new animation.

`gallery-weekly.test.mjs` covers uniqueness, deterministic order, changed weeks,
short/empty collections, Toronto midnight in summer/winter, year boundaries,
open-tab updates, wake checks and cleanup. Geometry tests cover all nine artwork
approach paths and image aspect ratios.

Weekly-exhibition verification: 568/568 tests and the 43-page production build
passed. The production preview showed the nine-work weekly notice and no wall
paging controls. Clicking selected work 018 opened its loaded 1536 x 1024 original
in the complete 35-work viewer; Escape returned to the same exhibition. No browser
errors were captured. The 2026-10-26 and 2026-11-02 seeds yielded distinct selections.

## Floating artwork viewer

The full-image dialog has a transparent, borderless surface over a dark translucent
backdrop. GallerySpace supplies 84 deterministic stars across three depth layers,
subtle nebula gradients and orbital lines. Two dimmed neighboring thumbnails sit
behind the original using CSS perspective. Mouse-driven parallax is scheduled only
on pointer movement; reduced motion disables parallax and entry animation. No new
WebGL canvas, external assets, dependencies or continuous animation loop is added.

Visible text is limited to the truthful timestamp label and Toronto-local timestamp.
Titles, work numbers, counters and the promotional tagline are omitted. Icon controls
and thumbnail buttons retain accessible names. Existing native-dialog focus handling,
Escape isolation, keyboard arrows, full-collection selection and room pause remain.
The weekly nine-work wall exhibition is independent of this presentation change.

Viewer validation: 568 tests and the 43-page production build passed. Desktop
1440 x 900 and narrow 390 x 844 previews showed landscape and square originals,
working next/keyboard/last-item selection, correct timestamps and restored focus
on Escape. Decorative glows are clipped by the full-screen surface; narrow layouts
hide the neighboring pictures and move arrows below the artwork.