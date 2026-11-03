# The Hangar: walkable bright futuristic atelier

## Current experience

Sean's Workshop and The Hangar are the same existing `workshop` destination. Opening its door from `/little-universe/` now enters the bright atelier directly. There is no separate Showcase button or standalone orbit-camera exhibition.

The former `/little-universe/hangar/` route is a static compatibility redirect to `/little-universe/?room=workshop`. Once the planet is ready, that one-time room link opens the Hangar and removes the query parameter. Ordinary visits still begin on the planet.

The selected bright architecture is retained: ivory curved wall, titanium dado and continuous rails, rounded portals and detailed cover plates, recessed skylight coffers, louvres, framed plaque, reflective silver floor, and the layered central mechanical plinth. Side walls, a continuous ceiling backing and the entrance wall/door complete the set for visitors who can turn around.

## Layout and controls

- Sean’s five original works occupy the central three-tier cabinet on the round plinth. The 6.1 m cabinet and 5.6 m CREATED BY SEAN heading face the entrance. Aircraft fitting envelopes grow from 1.8 × .55 × .7 m to 2.7 × 1.25 × 2 m; the character envelope grows from .6 × .46 × .62 m to 1.5 × 1.25 × 1.8 m. Proportions remain unchanged.
- Five matching side cabinets retain all nine other exhibits: two fighter cabinets on the left, and Gundam, light-aircraft and Reborns cabinets on the right. All cabinets share ivory shelves, titanium backs, side frames and warm edge strips. Fighters show a side silhouette; lower aircraft tiers improve visibility from walking eye height. Reborns retains its original PBR material adaptation in its own tall bay.
- WASD moves; dragging looks around. Arrow Up/Down walks and Arrow Left/Right turns. The existing on-screen pad supports pointer holds and keyboard controls.
- The spawn is `[0, 1.8, 10.2]`; walking speed is 2.8 m/s. A circular collider protects the 3.29 m-radius main plinth. Curved rear-wall bounds, side cabinets, portal feet and the entrance wall all constrain walking through bounded substeps.
- All aisles remain reachable, including a complete lap around the main exhibit and a route back to the entrance. The entrance-wall shelves are removed. Side cabinet footprints generate their own colliders. Their rear corners and every fitted GLB clear the 12.85 m inner curved-wall/rail envelope; the previous F-14 and SD Gundam positions at ±10.5, -6.2 crossed this wall.
- Desktop room FOV remains 58 degrees. Portrait screens preserve at least 42 degrees of horizontal view (vertical FOV capped at 98), so the central cabinet fits on 390 × 844 screens. Resize updates projection only, preserving the visitor’s position and look; the fitted value is also the wheel-zoom rest value, so the per-frame zoom damping settles on it instead of pulling portrait screens back to 58.
- Model clicks and `Explore the collection` open the existing accessible viewer. Opening a viewer clears and pauses room movement; closing it preserves the visitor's location. Side labels appear only nearby and retain a fixed screen size.
- Escape, the HUD's `Step outside`, and the physical exit button return to the existing exterior.

## Implementation and ownership

- `hangar-atelier.js` owns node-pure architecture, display placements and collision boundaries. `rooms.js` selects it only for `workshop`; the other rooms keep their original dimensions and movement rules.
- `HangarAtelier.jsx` owns browser-only lettering, environment/reflection resources, prepared Reborns loading and the side exhibits. `RoomInterior.jsx` continues to own room movement and camera restoration.
- Static architecture is merged by semantic group/material while retaining UVs for anisotropic metal: 57 draws / 10,860 triangles, excluding GLBs and browser-owned reflection/shadow passes.
- The 512px floor reflection, 128px finite-frame environment and 1024px key shadow preserve the bright rendering approach. The old Reborns-specific central contact-shadow passes are removed with its relocation. Renderer exposure/tone mapping are restored on exit. The planet starfield is not rendered inside this room.
- The model adaptation in `hangar-showcase.js` remains a pure shared helper. It clones materials, retains original maps and disposes only its own materials; it never disposes cached source textures or geometry.
- The old compact `hangar.js` layout was removed in favour of `hangar-atelier.js`; `createRoom('workshop')` builds the walkable atelier. The compact version remains in Git history.
- Gun & Rose / The Iron & Rose geometry, lighting, models and navigation are unchanged.

## Checkpoints and QA

- Dark prototype: `272eeff`; pre-bright checkpoint: `9c3a658`.
- Approved bright direction/refinement: `6e6dde6` on `codex/bright-hangar-atelier`.
- Walking integration branches from that checkpoint on `codex/walkable-hangar`.
- Current display revision: `npm test`: 546 passed, 0 failed. Tests cover source asset integrity, retained collection membership, real decoded GLB bounds, shelf/canopy clearance and curved-wall containment, round-plinth stopping, a complete walking lap, both side aisles, pillar/cabinet collisions, curved shell containment, and old-link compatibility. `npm run build`: 43 pages.
- Browser checks include the old-address redirect, first-person walking and turning, collection viewer, room exit/re-entry and 390 x 844 layout with no horizontal overflow. Existing Three.js Clock deprecation remains.
- Current browser acceptance: 1440 × 900 desktop and 390 × 844 portrait; central Sean cabinet, F-14 and SD Gundam in their actual bays, both model viewers, label selection, walking, exit and re-entry. No console errors were captured. Portrait framing has no horizontal overflow. Captures and logs were taken in a local production preview and are not committed; reproduce with `npm run build && npm run preview`, then open `/little-universe/?room=workshop` at 1440 × 900 and 390 × 844. Historical prototype evidence remains in ignored `artifacts/hangar-atelier/`. No push/deployment, physical touch-device test or sustained FPS benchmark is included.
