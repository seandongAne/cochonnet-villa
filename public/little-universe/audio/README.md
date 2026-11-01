# Little Universe soundtrack

The author-supplied MP3 is served locally as `background.mp3` and selected by
`birthday.audio` in `src/little-universe/content.js`. Original filename and
SHA-256 are recorded in `sources.json`; the file is copied without transcoding.

The existing Sound button starts playback explicitly at volume 0.35, loops the
track continuously, including when the page is hidden. The app stops playback on an explicit Sound
off action or when leaving the page. The component remains mounted while
visiting destinations. Return to the planet to access the sound control.
The separate Little Orbit draft is retained under `art/music/little-orbit/`.

Validation (2026-10-30): 503 tests passed; production build passed (40 pages).
Local Chrome preview: initial sound off, playback on click, state retained
through Hangar entry/exit, pause/resume at 390x844, and no console errors.
Physical-device playback and listening across the full track boundary remain
unchecked. The existing loop repeats the supplied track without crossfading.
All changes remain local; no publication or upload was performed.

Validation (2026-10-31): 531 tests passed; production build passed (44 pages).
Chrome preview played the full 211.487-second track and automatically wrapped
from 194.9 seconds to 13.3 seconds, still playing with loop enabled. Destination
navigation kept playback running; Sound off paused it and updated the button.
No browser console errors were reported. The visibility-change pause was removed;
mobile OS background suspension and physical-device listening remain unchecked.
