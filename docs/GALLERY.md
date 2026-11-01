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

All stored values are UTC ISO timestamps; the UI explicitly displays America/Toronto with the appropriate EST/EDT offset. The collection is newest-first; stable artwork numbers do not change when browsing or adding works.

## Rendering and checks

`gallery.js` supplies the node-pure collection helpers and procedural pavilion/interior. `Gallery.jsx` owns browser textures through the shared WallPoster component, uses seven thumbnails at a time for the walls, and opens one original at a time in a native dialog. Arrow keys/buttons, thumbnail selection, Escape, focus restoration and paused room input follow the existing collection viewer pattern. The dialog remains available from the exterior when WebGL is unavailable.

Behavior tests cover independent copies, deduplication, regeneration at the same path, source deletion, truthful timestamps, generation-to-gallery flow, editor stamp preservation, asset hashes/dimensions, and complete pagination. Existing room geometry/collision and planet camera tests cover the new destination. The seventh miniature increases the rooftop sky planet to 80 draws and 112,464 triangles; bounded budgets are now 85 draws / 115,000 triangles.

Local verification includes production build, desktop/mobile previews, wall switching, full-image browsing, timestamp rendering, and Escape/focus behavior. Publication remains a separate Git push/deployment step.
