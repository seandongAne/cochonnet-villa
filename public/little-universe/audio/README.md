# Little Universe soundtrack

The author-supplied MP3 is served locally as `background.mp3` and selected by
`birthday.audio` in `src/little-universe/content.js`. Original filename and
SHA-256 are recorded in `sources.json`; the file is copied without transcoding.

The existing Sound button starts playback explicitly at volume 0.35, loops the
track, and pauses when the page is hidden. The component remains mounted while
visiting destinations. Return to the planet to access the sound control.
The separate Little Orbit draft is retained under `art/music/little-orbit/`.

Validation (2026-10-30): 503 tests passed; production build passed (40 pages).
Local Chrome preview: initial sound off, playback on click, state retained
through Hangar entry/exit, pause/resume at 390x844, and no console errors.
Physical-device playback and listening across the full track boundary remain
unchecked. The existing loop repeats the supplied track without crossfading.
All changes remain local; no publication or upload was performed.
