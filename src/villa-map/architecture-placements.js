// Data-driven GLB *architectural-accent* placements — the Phase-4 front-entrance
// counterpart to exterior-placements.js. Each record is consumed by the same
// generic loader (furniture-models.js -> createFurniturePiece) and mounts in
// Scene.jsx through <primitive>, exactly like the interior furniture, the
// courtyard props and the porkies. Keeping this as pure DATA lets the node test
// suite assert on it (in-bounds positions, vendored files exist, footprints
// present) without a DOM.
//
// GOAL: dress the villa's front entrance with one calm, symmetrical layer —
// topiaries flanking the OPEN entry, one continuous-looking railing per side,
// and stone planter boxes at the foot of the steps. (The villa front is
// deliberately an open-plan portal — no door piece.)
//
// Coordinates are WORLD-space. The villa front face is at z ≈ -2.2 with an open
// entry gap x∈[-5,5] (front faces +Z, toward the courtyard / the player who
// starts at z=18 looking -Z). A procedural stone porch deck sits in front
// (≈ x∈[-6,6], z∈[-1,2.4]) and three step risers continue out to ≈ z+5.4. Ground
// top is y≈0 and the loader grounds every piece's min-Y to its origin, so all
// accents are placed at y: 0.
//
// Pieces are sourced from two CC0 Kenney kits (see architecture/LICENSE.txt):
//   Furniture Kit       — pottedPlant (flanking topiary). Self-contained
//                         (UniGLTF, KHR_materials_unlit + baseColorFactor — no
//                         external atlas), and the SAME kit the interior rooms
//                         use, so they read maximally cohesive with the villa.
//   City Suburban Kit   — fence (porch railing, `railing`), planter (stone
//                         planter box). UnityGLTF export → these reference an
//                         external `Textures/colormap.png` by relative URI, so
//                         that atlas is vendored at architecture/Textures/
//                         colormap.png (else they render flat white).
//
// SCALE: the loader applies FURNITURE_BASE_SCALE (2.2) × placement.scale. Each
// `scale` below was chosen so the piece hits a real-world target height (door
// arch ~3.0 m, topiary ~2.3 m, railing ~0.9 m, planter ~0.66 m). The baked
// `footprint` is the resulting WORLD-space XZ extent in LOCAL/unrotated
// orientation (native XZ × 2.2 × scale) — the shadow + collider layers apply
// `rotationY` themselves, so it must NOT be pre-rotated.
//
// DOORWAY STAYS PASSABLE: the flanking topiaries are non-solid, so nothing
// blocks the player walking through the open entry x∈[-5,5]. The side railings +
// planters are solid but sit at x≈±5.9/±6.6 (on the porch edge), so their
// colliders never reach the x∈[-5,5] entry path.

const ARCH = (name) => `/models/architecture/${name}.glb`;

// Grass / porch ground top is ≈ 0; the loader grounds each model's min-Y.
const G = 0;

// Per-record WORLD-space footprints (metres) = native XZ × 2.2 × scale, measured
// from each vendored GLB (POSITION accessor min/max, accounting for node TRS) and
// baked here so consumers never re-apply a scale or know the base factor.
//   native XZ:  pottedPlant 0.212 × 0.241   (Furniture Kit)
//               railing     0.475 × 0.075   (City Suburban fence)
//               planter     0.400 × 0.300   (City Suburban planter)
export const ARCHITECTURE_PLACEMENTS = [
  // NB: there is intentionally NO door piece — the villa front is an open-plan
  // portal (the lone door read as out of place against the open facade). The
  // entrance is dressed with greenery, railings and planters only.

  // ===== Flanking topiary planters either side of the open entry (on the porch) =====
  // Small/tall accents tucked to the outer third of the portal. Non-solid so
  // the player can brush past while the centre remains visually empty.
  {
    id: "arch-topiary-w", room: "entrance", url: ARCH("pottedPlant"),
    position: [-3.4, G, -0.2], rotationY: 0, scale: 1.5, model: "pottedPlant",
    floor: 0, footprint: { x: 0.700, z: 0.795 }, solid: false, noShadow: false
  },
  {
    id: "arch-topiary-e", room: "entrance", url: ARCH("pottedPlant"),
    position: [3.4, G, -0.2], rotationY: 0, scale: 1.5, model: "pottedPlant",
    floor: 0, footprint: { x: 0.700, z: 0.795 }, solid: false, noShadow: false
  },

  // ===== Porch / step side railings (x≈±5.9, on the porch edge) =====
  // One longer panel per side replaces the old four short repeated segments.
  // The model is rotated PI/2 so it runs ALONG Z. Footprint stays LOCAL
  // (unrotated) — the collider layer rotates it, giving a thin X span that
  // never reaches the x∈[-5,5] door path. Solid.
  {
    id: "arch-railing-w", room: "entrance", url: ARCH("railing"),
    position: [-5.9, G, 1.8], rotationY: Math.PI / 2, scale: 2.4, model: "railing",
    floor: 0, footprint: { x: 2.508, z: 0.396 }, solid: true, noShadow: false
  },
  {
    id: "arch-railing-e", room: "entrance", url: ARCH("railing"),
    position: [5.9, G, 1.8], rotationY: Math.PI / 2, scale: 2.4, model: "railing",
    floor: 0, footprint: { x: 2.508, z: 0.396 }, solid: true, noShadow: false
  },

  // ===== Stone planter boxes at the foot of the steps (flanking the path) =====
  // Sit at z≈4.8 (below the courtyard lamp line at z=6), just outside the porch
  // edge at x≈±6.6 so their solid colliders stay well clear of the x∈[-5,5] door
  // path. These are now the entrance's only planter boxes.
  {
    id: "arch-planter-w", room: "entrance", url: ARCH("planter"),
    position: [-6.6, G, 4.8], rotationY: 0, scale: 1.55, model: "planter",
    floor: 0, footprint: { x: 1.364, z: 1.023 }, solid: true, noShadow: false
  },
  {
    id: "arch-planter-e", room: "entrance", url: ARCH("planter"),
    position: [6.6, G, 4.8], rotationY: 0, scale: 1.55, model: "planter",
    floor: 0, footprint: { x: 1.364, z: 1.023 }, solid: true, noShadow: false
  }
];
