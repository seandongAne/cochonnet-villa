# The Hangar: walkable bright futuristic atelier

## Current experience

Sean's Workshop and The Hangar are the same existing `workshop` destination. Opening its door from `/little-universe/` now enters the bright atelier directly. There is no separate Showcase button or standalone orbit-camera exhibition.

The former `/little-universe/hangar/` route is a static compatibility redirect to `/little-universe/?room=workshop`. Once the planet is ready, that one-time room link opens the Hangar and removes the query parameter. Ordinary visits still begin on the planet.

The selected bright architecture is retained: ivory curved wall, titanium dado and continuous rails, rounded portals and detailed cover plates, recessed skylight coffers, louvres, framed plaque, reflective silver floor, and the layered central mechanical plinth. Side walls, a continuous ceiling backing and the entrance wall/door complete the set for visitors who can turn around.

## Layout and controls

- Reborns Gundam remains the central full-height exhibit, using the original local GLB, proportions, colors and PBR textures.
- The four fighters remain on the left counter; SD Gundam, ZZ Gundam Ver.Ka, Cessna 172 and Diamond DA20-C1 are on the right. No collection item is removed.
- WASD moves; dragging looks around. Arrow Up/Down walks and Arrow Left/Right turns. The existing on-screen pad supports pointer holds and keyboard controls.
- The spawn is `[0, 1.8, 10.2]`; walking speed is 2.8 m/s. A circular collider protects the 3.29 m-radius main plinth. Curved rear-wall bounds, side cabinets, portal feet and the entrance wall all constrain walking through bounded substeps.
- All aisles remain reachable, including a complete lap around the main exhibit and a route back to the entrance.
- Model clicks and `Explore the collection` open the existing accessible viewer. Opening a viewer clears and pauses room movement; closing it preserves the visitor's location. Side labels appear only nearby and retain a fixed screen size.
- Escape, the HUD's `Step outside`, and the physical exit button return to the existing exterior.

## Implementation and ownership

- `hangar-atelier.js` owns node-pure architecture, display placements and collision boundaries. `rooms.js` selects it only for `workshop`; the other rooms keep their original dimensions and movement rules.
- `HangarAtelier.jsx` owns browser-only lettering, environment/reflection resources, prepared Reborns loading and the side exhibits. `RoomInterior.jsx` continues to own room movement and camera restoration.
- Static architecture is merged by semantic group/material while retaining UVs for anisotropic metal: 50 draws / 10,524 triangles, excluding GLBs and browser-owned reflection/shadow passes.
- The 512px floor reflection, 128px finite-frame environment, 1024px key shadow and finite-frame contact shadows preserve the prototype's rendering approach. Renderer exposure/tone mapping are restored on exit. The planet starfield is not rendered inside this room.
- The model adaptation in `hangar-showcase.js` remains a pure shared helper. It clones materials, retains original maps and disposes only its own materials; it never disposes cached source textures or geometry.
- The old compact `hangar.js` layout is archival and no longer selected by `createRoom('workshop')`.
- Gun & Rose / The Iron & Rose geometry, lighting, models and navigation are unchanged.

## Checkpoints and QA

- Dark prototype: `272eeff`; pre-bright checkpoint: `9c3a658`.
- Approved bright direction/refinement: `6e6dde6` on `codex/bright-hangar-atelier`.
- Walking integration branches from that checkpoint on `codex/walkable-hangar`.
- `npm test`: 529 passed, 0 failed. Tests cover source asset integrity, retained collection membership and fitted side-counter bounds, round-plinth stopping, a complete walking lap, both side aisles, pillar/cabinet collisions, curved shell containment, and old-link compatibility. `npm run build`: 44 pages.
- Browser checks include the old-address redirect, first-person walking and turning, collection viewer, room exit/re-entry and 390 x 844 layout with no horizontal overflow. Existing Three.js Clock deprecation remains.
- Real preview screenshots and logs live locally in ignored `artifacts/hangar-atelier/`. No push/deployment, physical touch-device test or sustained FPS benchmark is included.
