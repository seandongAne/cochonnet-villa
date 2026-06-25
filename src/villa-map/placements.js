// Placement data for the GLB-backed porkies scattered across the villa map.
// Pulled out of the old scene.js so both the React Scene component and the
// test suite consume the same source of truth (data, not source-string regex).
//
// Each entry feeds createPorkyModel(materials, entry): `variant`, `mic`,
// `modelScale`, and `fallbackScale` are read by the factory; `position` and
// `rotationY` are applied to the mounted group by the Scene component.
//
// rotationY ≈ Math.PI means the piglet faces south (+Z), toward the entry path,
// so its sculpted face is visible to a player walking in from the gate.
export const PORKY_PLACEMENTS = [
  {
    id: "guaguazhu",
    variant: "daigua",
    mic: true,
    modelScale: 1.02,
    fallbackScale: 1.0,
    position: [-3.6, 0, 4],
    rotationY: Math.PI - 0.35
  },
  {
    id: "great-hall-giant",
    variant: "big-ear-piglet",
    modelScale: 1.2,
    fallbackScale: 1.4,
    position: [-5, 0, -13],
    rotationY: -0.35
  },
  {
    id: "tiny-corner",
    variant: "wild-piglet",
    modelScale: 0.62,
    fallbackScale: 0.55,
    position: [7, 0.05, -18.6],
    rotationY: -1.2
  },
  {
    id: "master-bedroom",
    variant: "guadai",
    modelScale: 0.78,
    fallbackScale: 0.7,
    position: [-4.0, 6.7, -9.5],
    rotationY: 1.2
  },
  {
    id: "study-loft",
    variant: "wild-piglet",
    modelScale: 0.66,
    fallbackScale: 0.6,
    position: [4.0, 6.72, -12.8],
    rotationY: 0.4
  },
  {
    id: "lounge-balcony",
    variant: "daigua",
    modelScale: 0.7,
    fallbackScale: 0.62,
    position: [6.4, 6.72, -8],
    rotationY: -0.7
  },
  {
    id: "porch",
    variant: "guadai",
    modelScale: 0.76,
    fallbackScale: 0.68,
    position: [2.6, 0.02, 3.2],
    rotationY: Math.PI + 0.25
  },
  {
    id: "mushroom",
    variant: "wild-piglet",
    modelScale: 0.72,
    fallbackScale: 0.62,
    position: [-12.5, 0.03, 14.2],
    rotationY: 0.95
  },
  {
    id: "hot-spring",
    variant: "daigua",
    modelScale: 0.68,
    fallbackScale: 0.58,
    position: [14.4, 0.04, 12.2],
    rotationY: -1.65
  }
];
