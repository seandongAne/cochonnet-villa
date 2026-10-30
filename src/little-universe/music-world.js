// The musical wall shares the listening room with the existing vinyl collection.
import { studio, batchMiniature } from './miniature.js';

export const MUSICAL_POSTER_SIZE = [.84, 1.08];
export const MUSICAL_POSTER_SLOTS = [
  { id: 'hamilton', position: [0, 2.34, -2.32], rotation: 0 },
  { id: 'rent', position: [-2.16, 2.34, -2.32], rotation: 0 },
  { id: 'phantom', position: [-1.08, 2.34, -2.32], rotation: 0 },
  { id: 'les-miserables', position: [1.08, 2.34, -2.32], rotation: 0 },
  { id: 'six', position: [2.16, 2.34, -2.32], rotation: 0 },
];

export function createMusicalFrames() {
  const s = studio();
  for (const slot of MUSICAL_POSTER_SLOTS) {
    const [x, y, z] = slot.position;
    s.box(slot.id === 'hamilton' ? '#d9b66e' : '#947451', [x, y, z], [.94, 1.18, .07]);
    s.box('#302734', [x, y, z + .04], [.87, 1.11, .02]);
  }
  const root = batchMiniature(s.root); root.name = 'musical-poster-frames'; return root;
}
