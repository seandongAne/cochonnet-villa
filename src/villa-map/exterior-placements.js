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
// villa z<-2, hot springs x≳14, mushroom house, trees and dog house):
//   - a straight four-lantern arrival axis
//   - a formal fountain garden on the west lawn: fountain, opposing benches,
//     paired flowers and two corner shrubs
//   - one compact campfire + log cluster on the far west lawn
// Entrance planters belong to architecture-placements.js. Keeping them out of
// this list avoids the former double row of pots around the porch.

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
    position: [-8.5, G, 8.5], rotationY: 0, scale: 1.65, model: "statueRing",
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

  // ===== Opposing benches make the fountain a readable garden room =====
  // South bench looks north (+Z) toward the fountain.
  {
    id: "court-bench-s", room: "courtyard", url: EXT("bench"),
    position: [-8.5, G, 5.0], rotationY: 0, scale: 0.65, model: "bench",
    floor: 0, footprint: { x: 1.603, z: 0.904 }, solid: true, noShadow: false
  },
  // North bench looks south (-Z) toward the fountain.
  {
    id: "court-bench-n", room: "courtyard", url: EXT("bench"),
    position: [-8.5, G, 12.0], rotationY: Math.PI, scale: 0.65, model: "bench",
    floor: 0, footprint: { x: 1.603, z: 0.904 }, solid: true, noShadow: false
  },

  // ===== Rustic campfire + log cluster (picnic-spot stand-in) far west lawn ===
  {
    id: "court-campfire", room: "courtyard", url: EXT("campfire"),
    position: [-15, G, 14.5], rotationY: 0, scale: 1.15, model: "campfire",
    floor: 0, footprint: { x: 1.369, z: 1.305 }, solid: true, noShadow: false
  },
  {
    id: "court-log-1", room: "courtyard", url: EXT("log"),
    position: [-15, G, 12.5], rotationY: Math.PI / 2, scale: 0.95, model: "log",
    floor: 0, footprint: { x: 0.489, z: 1.484 }, solid: true, noShadow: false
  },
  {
    id: "court-log-2", room: "courtyard", url: EXT("log"),
    position: [-15, G, 16.5], rotationY: Math.PI / 2, scale: 0.95, model: "log",
    floor: 0, footprint: { x: 0.489, z: 1.484 }, solid: true, noShadow: false
  },

  // ===== Fountain-garden accents: paired flowers + two outer shrubs ========
  {
    id: "court-flower-w", room: "courtyard", url: EXT("flowerRed"),
    position: [-11.0, G, 8.5], rotationY: 0, scale: 1.25, model: "flowerRed",
    floor: 0, footprint: { x: 0.437, z: 0.498 }, solid: false, noShadow: false
  },
  {
    id: "court-flower-e", room: "courtyard", url: EXT("flowerYellow"),
    position: [-6.0, G, 8.5], rotationY: 0, scale: 1.25, model: "flowerYellow",
    floor: 0, footprint: { x: 0.437, z: 0.498 }, solid: false, noShadow: false
  },
  {
    id: "court-bush-1", room: "courtyard", url: EXT("bush"),
    position: [-11.2, G, 11.7], rotationY: 0, scale: 0.75, model: "bush",
    floor: 0, footprint: { x: 0.995, z: 0.995 }, solid: false, noShadow: false
  },
  {
    id: "court-bush-2", room: "courtyard", url: EXT("bushLarge"),
    position: [-5.8, G, 5.3], rotationY: 0.4, scale: 0.85, model: "bushLarge",
    floor: 0, footprint: { x: 0.699, z: 0.628 }, solid: false, noShadow: false
  },
  // A single sign marks the opening from the path into the fountain garden.
  {
    id: "court-sign", room: "courtyard", url: EXT("sign"),
    position: [-5.4, G, 10.7], rotationY: -0.45, scale: 1.2, model: "sign",
    floor: 0, footprint: { x: 0.792, z: 0.185 }, solid: false, noShadow: false
  }
];
