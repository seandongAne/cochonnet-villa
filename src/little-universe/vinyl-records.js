// Author-supplied collection artwork; kept separate from theatre and film posters.
import { studio, batchMiniature } from './miniature.js';

export const vinylRecords = [
  { id: 'vinyl-leslie-cheung', title: 'Leslie Cheung', zh: '张国荣', year: 'Vinyl collection', note: 'Collected together', poster: '/little-universe/vinyl-records/leslie-cheung.webp' },
  { id: 'vinyl-teresa-teng', title: 'Teresa Teng', zh: '邓丽君', year: 'Vinyl collection', note: 'Collected together', poster: '/little-universe/vinyl-records/teresa-teng.webp' },
  { id: 'vinyl-rocketman', title: 'Rocketman', year: 'Vinyl collection', note: 'Collected together', poster: '/little-universe/vinyl-records/rocketman.webp' },
  { id: 'vinyl-jesus-christ-superstar', title: 'Jesus Christ Superstar', year: 'Vinyl collection', note: 'Collected together', poster: '/little-universe/vinyl-records/jesus-christ-superstar.webp' },
];

export const VINYL_SIZE = [.94, .94];
// The entrance faces -Z: +X is its right wall. Artwork faces inward toward -X.
export const VINYL_SLOTS = vinylRecords.map((record, i) => ({
  id: record.id, position: [2.88, 1.72, -1.71 + i * 1.14], rotation: -Math.PI / 2,
}));

export function createVinylFrames() {
  const s = studio();
  for (const { position: [x, y, z] } of VINYL_SLOTS) {
    s.box('#947451', [x, y, z], [.07, 1.02, 1.02]);
    s.box('#302734', [x - .04, y, z], [.02, .97, .97]);
  }
  const root = batchMiniature(s.root);
  root.name = 'vinyl-collection-frames';
  return root;
}
