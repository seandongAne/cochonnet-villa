# Annual Cabbage birthday sky

Every November 1, the Little Universe planet and the outdoor Villa Map display
HAPPY BIRTHDAY CABBAGE in large, bright lemon-yellow letters with a soft glow.

## Calendar and lifecycle

- The calendar is fixed to America/Toronto, independent of the visitor's timezone.
- Visibility starts at local midnight November 1 and ends at local midnight
  November 2, every year. November 1, 2026 lasts 25 hours because DST ends that day.
- This is a browser-time feature, not a build-time condition or scheduled deployment.
  It trusts the device clock.
- The shared clock checks on minute boundaries (10 ms after the boundary) and
  immediately on visibilitychange, focus, and pageshow. Cleanup removes all wake
  listeners and timers; unchanged states do not trigger React updates.
- Non-birthday visits allocate no birthday texture, geometry, or material.

## Rendering and framing

src/birthday.js is node-pure. src/components/BirthdaySky.jsx owns browser canvas
drawing, React lifecycle, and one transparent quad (two triangles, one draw).
The texture uses system fonts; no remote font, image, postprocessing, audio, or
particle dependency is added. The letters remain still, including reduced-motion
visits. Texture ownership is effect-scoped for StrictMode cleanup.

The planet uses a camera-facing floating sign above the overview. Birthday
overview framing and closest zoom leave room above destination labels. Selecting
a destination, entering a room, or opening the existing finale hides the sign;
returning to the overview restores it. Ordinary-day camera settings stay intact.

The Villa Map sign retains a fixed northeast sky direction and translates with
the camera. Depth testing preserves wall/roof occlusion. It is hidden below
ground (camera Y < 0), including all mushroom pocket floors and the observatory.
It writes no depth, casts no shadows, and is unaffected by fog or tone mapping.

On a birthday, a fresh ordinary map arrival looks slightly up and right to frame
the letters above the villa and clear the nearby mushroom roof. Spawn position,
movement, collision, and teleport destination headings are unchanged. Return
visits with an arrival query preserve their existing heading. Crossing midnight
while already walking does not turn the player's camera.

## Local QA

Use the production build:

- /little-universe/?birthday=on
- /villa-map/?birthday=on
- Use birthday=off for the non-birthday comparison.

Overrides work only on localhost, 127.0.0.1, or [::1], are never persisted, and are
ignored on public hostnames. Production visitors always use the Toronto date.

Tests in tests/birthday.test.mjs cover Toronto midnight, the 2026 DST transition,
future years, equivalent timestamp offsets, local-only previews, open-page and
wake transitions, timer cleanup, and arrival/teleport controls.

Run npm test and npm run build. In preview check desktop and 390 px portrait,
32:9, rotation, destination/room entry and exit, the finale, and the existing
observatory QA bookmark with birthday=on. Existing mobile map onboarding still
recommends desktop; villa-mobile.jpg is a responsive view after starting the
desktop session.

Actual browser captures are in docs/birthday-qa/. They use a forced local birthday
preview, not a change to the operating-system clock.
