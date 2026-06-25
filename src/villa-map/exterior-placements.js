// Data-driven GLB *exterior* placements — the Phase-3 courtyard counterpart to
// furniture-placements.js. Each record is consumed by the same generic loader
// (furniture-models.js -> createFurniturePiece) and mounts in Scene.jsx through
// <primitive>, exactly like the interior furniture and the porkies. Keeping
// this as pure DATA lets the node test suite assert on it (in-bounds positions,
// vendored files exist, footprints present) without a DOM.
//
// Coordinates are WORLD-space; the grassy courtyard is the open ground at z > 0
// (roughly x∈[-22,22], z∈[0,26]). The ground sits at y ≈ 0 and the loader
// grounds every piece's min-Y to its origin, so all props are placed at y: 0.
//
// Props are sourced from two CC0 Kenney kits (see exterior/LICENSE.txt):
//   Nature Kit  — statueRing (centerpiece), potLarge/potSmall (planters),
//                 flowerRed/flowerYellow, bush/bushLarge, campfire, log, rock,
//                 sign
//   Holiday Kit — bench, lantern (lamppost)
// Both are the same low-poly Kenney art style, so they read cohesively.
//
// SCALE: the loader applies FURNITURE_BASE_SCALE (2.2) × placement.scale. Each
// `scale` below was chosen so the piece hits a real-world target size (bench
// ~1.6 m, lamppost ~3.5 m tall, centerpiece ~2.2 m, planters ~0.6–0.9 m). The
// baked `footprint` is the resulting WORLD-space XZ extent (native × 2.2 ×
// scale) so the shadow + collider layers size themselves without loading a GLB.
//
// LAYOUT (kept out of the central stone path x∈[-0.7,4.7] and clear of the
// villa z<-2, hot springs x≳14, mushroom house, trees, dog house, sign, gate):
//   - a stone-ring fountain/well centerpiece on the open west lawn
//   - lanterns lining the path just outside its west (x≈-1.5) and east (x≈5.5)
//     edges (thin poles → not solid, so no invisible bumps)
//   - benches facing the fountain
//   - a rustic campfire + log seating cluster standing in for a picnic spot on
//     the far west lawn (the kits ship no picnic table — see report)
//   - planters flanking the villa front door, plus flowers / bushes as accents

const EXT = (name) => `/models/exterior/${name}.glb`;

// Grass / courtyard ground top is ≈ 0; the loader grounds each model's min-Y.
const G = 0;

// Per-record WORLD-space footprints (metres) = native XZ × 2.2 × scale,
// measured from each vendored GLB with a throwaway loader script and baked here
// so consumers never re-apply a scale or know the base factor.
export const EXTERIOR_PLACEMENTS = [
  // ===== Centerpiece — stone-ring fountain/well on the west lawn =====
  {
    id: "court-fountain", room: "courtyard", url: EXT("statueRing"),
    position: [-8, G, 8], rotationY: 0, scale: 1.65, model: "statueRing",
    floor: 0, footprint: { x: 2.178, z: 1.452 }, solid: true, noShadow: false
  },

  // ===== Lampposts lining the central path (just outside its edges) =====
  {
    id: "court-lamp-w1", room: "courtyard", url: EXT("lantern"),
    position: [-1.5, G, 6], rotationY: 0, scale: 0.95, model: "lantern",
    floor: 0, footprint: { x: 1.097, z: 0.951 }, solid: false, noShadow: false
  },
  {
    id: "court-lamp-e1", room: "courtyard", url: EXT("lantern"),
    position: [5.5, G, 6], rotationY: 0, scale: 0.95, model: "lantern",
    floor: 0, footprint: { x: 1.097, z: 0.951 }, solid: false, noShadow: false
  },
  {
    id: "court-lamp-w2", room: "courtyard", url: EXT("lantern"),
    position: [-1.5, G, 14], rotationY: 0, scale: 0.95, model: "lantern",
    floor: 0, footprint: { x: 1.097, z: 0.951 }, solid: false, noShadow: false
  },
  {
    id: "court-lamp-e2", room: "courtyard", url: EXT("lantern"),
    position: [5.5, G, 14], rotationY: 0, scale: 0.95, model: "lantern",
    floor: 0, footprint: { x: 1.097, z: 0.951 }, solid: false, noShadow: false
  },

  // ===== Benches facing the fountain =====
  // South bench (z=4) looks north (+Z) toward the fountain at z=8.
  {
    id: "court-bench-s", room: "courtyard", url: EXT("bench"),
    position: [-8, G, 4.2], rotationY: 0, scale: 0.65, model: "bench",
    floor: 0, footprint: { x: 1.603, z: 0.904 }, solid: true, noShadow: false
  },
  // West bench (x=-11.5) looks east (+X, rotationY = -PI/2) toward the fountain.
  {
    id: "court-bench-w", room: "courtyard", url: EXT("bench"),
    position: [-11.5, G, 8], rotationY: -Math.PI / 2, scale: 0.65, model: "bench",
    // footprint is LOCAL (unrotated); the collider/shadow layers apply rotationY.
    floor: 0, footprint: { x: 1.603, z: 0.904 }, solid: true, noShadow: false
  },

  // ===== Rustic campfire + log cluster (picnic-spot stand-in) far west lawn ===
  {
    id: "court-campfire", room: "courtyard", url: EXT("campfire"),
    position: [-14, G, 13], rotationY: 0, scale: 1.15, model: "campfire",
    floor: 0, footprint: { x: 1.369, z: 1.305 }, solid: true, noShadow: false
  },
  {
    id: "court-log-1", room: "courtyard", url: EXT("log"),
    position: [-14, G, 11.2], rotationY: Math.PI / 2, scale: 0.95, model: "log",
    floor: 0, footprint: { x: 0.489, z: 1.484 }, solid: true, noShadow: false
  },
  {
    id: "court-log-2", room: "courtyard", url: EXT("log"),
    position: [-14, G, 14.8], rotationY: Math.PI / 2, scale: 0.95, model: "log",
    floor: 0, footprint: { x: 0.489, z: 1.484 }, solid: true, noShadow: false
  },

  // ===== Planters flanking the villa front door (z just into the grass) =====
  {
    id: "court-planter-w", room: "courtyard", url: EXT("potLarge"),
    position: [-6, G, 0.6], rotationY: 0, scale: 0.72, model: "potLarge",
    floor: 0, footprint: { x: 0.893, z: 0.773 }, solid: true, noShadow: false
  },
  {
    id: "court-planter-e", room: "courtyard", url: EXT("potLarge"),
    position: [6, G, 0.6], rotationY: 0, scale: 0.72, model: "potLarge",
    floor: 0, footprint: { x: 0.893, z: 0.773 }, solid: true, noShadow: false
  },

  // ===== Garden accents — flowers, small pot, bushes, a decorative rock ======
  // Flowers in the front-door planters (sit on top — placed beside, grounded).
  {
    id: "court-flower-w", room: "courtyard", url: EXT("flowerRed"),
    position: [-6, G, 1.4], rotationY: 0, scale: 1.25, model: "flowerRed",
    floor: 0, footprint: { x: 0.437, z: 0.498 }, solid: false, noShadow: false
  },
  {
    id: "court-flower-e", room: "courtyard", url: EXT("flowerYellow"),
    position: [6, G, 1.4], rotationY: 0, scale: 1.25, model: "flowerYellow",
    floor: 0, footprint: { x: 0.437, z: 0.498 }, solid: false, noShadow: false
  },
  {
    id: "court-pot-small", room: "courtyard", url: EXT("potSmall"),
    position: [-9.6, G, 6], rotationY: 0, scale: 0.85, model: "potSmall",
    floor: 0, footprint: { x: 0.604, z: 0.524 }, solid: false, noShadow: false
  },
  {
    id: "court-bush-1", room: "courtyard", url: EXT("bush"),
    position: [-12, G, 4.5], rotationY: 0, scale: 0.75, model: "bush",
    floor: 0, footprint: { x: 0.995, z: 0.995 }, solid: false, noShadow: false
  },
  {
    id: "court-bush-2", room: "courtyard", url: EXT("bushLarge"),
    position: [9, G, 5], rotationY: 0.4, scale: 0.85, model: "bushLarge",
    floor: 0, footprint: { x: 0.699, z: 0.628 }, solid: false, noShadow: false
  },
  {
    id: "court-rock", room: "courtyard", url: EXT("rock"),
    position: [-16, G, 8.5], rotationY: 0.8, scale: 0.62, model: "rock",
    floor: 0, footprint: { x: 1.071, z: 1.384 }, solid: true, noShadow: false
  },
  // A small garden sign on the west lawn near the fountain approach.
  {
    id: "court-sign", room: "courtyard", url: EXT("sign"),
    position: [-4.5, G, 10], rotationY: -0.5, scale: 1.2, model: "sign",
    floor: 0, footprint: { x: 0.792, z: 0.185 }, solid: false, noShadow: false
  }
];
