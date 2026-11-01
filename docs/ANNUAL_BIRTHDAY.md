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

## Villa birthday party

The Villa Map shares one `useBirthday()` state between its sky lettering and
`BirthdayParty`. Every Toronto November 1 it adds a pastel garden party:
balloons and bunting at the welcome gate and villa facade, a floral wreath at
the mushroom entrance, peripheral spring decorations, and a cabbage-topped
cake table with gifts and flowers on the east lawn.

- `src/villa-map/birthday-party.js`: node-pure geometry, per-variant crown fits,
  table collision lifecycle and distant-village hats.
- `src/villa-map/react/BirthdayParty.jsx`: effect-owned scene objects, local
  canvas welcome signs and asset-progress subscription. Non-birthday visits
  allocate none of these graphics.
- All 24 resident instances (18 available model variants) and all 13 distant
  village pigs wear hats. Hats have pastel satin cones, cream scalloped brims,
  gold trim/stars, polka dots and small pom-poms.
- Crown X/Z anchors, size and tilt are authored per variant in fitted-model
  coordinates. A downward surface ray determines crown Y after the model's
  internal rotation and normalization. Do not use whole-model height as the
  crown: ears, headphones, baths, cars and bedding change its meaning.
- Original GLBs and their baked accessories stay intact. Existing watermelon
  hats, bows and wizard hats carry a smaller birthday hat above their surface.
  Check front AND side views when changing the fit table or replacing a GLB.
- Birthday accessories are siblings of the resident model groups: the loader's
  `group.clear()` swap cannot remove them. Asset settlement updates the fitting
  without reloading residents. Loading/failed residents use a separate,
  procedural-head crown. The map's cached sun shadow is refreshed after swaps.
- Decorations use one vertex-colour batch (48,099 triangles); each hat uses one
  batch (3,972 triangles). Four sign faces share one local canvas texture.
  Distant village hats cast no shadows, matching the background village.
- The cake table has an explicitly scoped ground collider. Birthday teardown
  removes only its own collider, geometry, materials and sign texture. It never
  recreates the world or player controls. Other decor stays peripheral or above
  head height; hats use ordinary non-emissive materials in the observatory.

### Party QA

The existing query-only diagnostics add `birthday-garden` and
`birthday-arrival` bookmarks, plus a `birthdayParty` snapshot with each hat's
resident ID, variant, asset state, local position and scale. No production
window debug hook is added.

Use `/villa-map/?birthday=on` for ordinary exploration, and
`/villa-map/?birthday=on&observatory=perf&view=birthday-garden&lights=on` for the
cake-table bookmark. Wait for model preparation; refresh the diagnostics
snapshot before treating it as current. The perf harness uses normal walking
height, so elevated bookmarks settle toward the ground.

Validation for the party implementation:

- `npm test`: 564 tests pass, including explicit model-fit coverage, transformed
  surface fitting, fallback placement, temporary ground collision and geometry
  budgets. `npm run build` succeeds.
- Browser: 139 streamed assets complete with zero failures; all 24 resident
  hats report `ready`, with 13 additional village hats (37 total).
- A browser-only clock override verifies November 2 teardown and the following
  November 1 restore without navigation or moving the player. No OS clock is
  changed. Camera drift remains below 1 mm (existing height interpolation).
- Front/side model contact sheets and real map views cover the cake table,
  gate, arrival path, mushroom entrance, villa hall and mushroom den.
- Desktop 1600x1000, wide 2560x800 and portrait 390x844 were inspected. Portrait
  is a resized running scene; the existing mobile onboarding policy remains.
- Captures are in `docs/birthday-qa/party-*.jpg`. Visual review in the user's
  local preview remains the final aesthetic acceptance.
