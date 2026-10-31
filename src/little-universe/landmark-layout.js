// Geometry-only contract shared by the birthday planet and the villa sky.
// Keep personal copy, media catalogs and asset loading out of this module.
export const landmarkLayout = [
  { id: 'camping', direction: [-0.8, 0.54, 0.25], label: [0, 1.25, 0] },
  { id: 'music', direction: [0.08, 0.99, -0.12], label: [0, 1.38, 0] },
  { id: 'workshop', direction: [0.86, 0.42, 0.23], label: [0, 1.1, 0] },
  { id: 'museum', direction: [-0.12, 0.25, 0.96], label: [0, 0.65, 0.75] },
  { id: 'movie-night', direction: [0.72, -0.4, 0.57], label: [0, 1.33, 0] },
  { id: 'one-more-episode', direction: [-0.7, -0.53, 0.48], label: [0, 1.1, 0] },
];

export function surfacePosition(direction, radius = 2.5) {
  const length = Math.hypot(...direction);
  if (!length) throw new RangeError('A surface direction must be nonzero.');
  return direction.map((value) => value / length * radius);
}
