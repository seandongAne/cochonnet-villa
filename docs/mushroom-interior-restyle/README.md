# Mushroom interior finishes — 2026-09-09

The pocket retains its 2x scale, approximately 19 m diameter, 8 m storey height,
three floor levels, stair openings and all interaction locations. No world or
collision constants were changed.

- `mushroom-finishes.js` generates subtle plaster and oak plank surface maps
  without a DOM dependency. Slabs use a separate pale ceiling material on their
  underside, preserving the exact floor and stair geometry.
- Low wall panelling uses sage on L1, warm clay on L2 and grey sage on L3. These
  shallow profiles stay within the existing wall skin and player clearance.
- Mushroom furniture gets cloned matte materials and a muted cyan-to-sage
  upholstery palette. The original GLB files and cache materials stay intact.
  Blank wall frames contain original botanical vector prints; the vanity mirror
  remains unchanged.
- L1's dining group is repositioned together with its tabletop objects and a
  larger rug. L2's lounge is brought slightly inward with inward-facing chairs;
  its reading chair is pulled clear of the curved wall. L3's reading chairs face
  the coffee table. The bed/pig anchor, journal shelf and switch stay fixed.
- L3 windows are warm while house lights are on and return to their original
  dark red emission after lights-out. New L3 panelling follows the existing
  adaptation channel and the observatory wall's Rift opacity.

## Validation

`npm test`: 438 passing, including furniture overlap/spacing, rounded-wall bounds,
pig clearance and player-width routes from both stair landings.
`npm run build`: passed. Browser screenshots cover L1, L2, L3 lights-on,
lights-off and the hidden Rift wall dissolve. No performance benchmark was run.

Query-only bookmarks: `mushroom-hearth`, `mushroom-den`, `loft-room`.
For example: `/villa-map/?observatory=test&view=mushroom-hearth&lights=on`.
Advance the QA panel once after models finish loading for a deterministic image.
