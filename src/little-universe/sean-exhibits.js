// Five works supplied by the author and explicitly credited to Sean.
// The three-tier original-work cabinet is the room's central focal point.
export const SEAN_GALLERY_OBSTACLES = [[-3.05, 3.05, -1.15, 1.15]];
export const seanExhibits = [
  { id: 'sean-tornado', name: 'Luftwaffe Tornado', position: [-1.5, .85, 0], aircraft: true },
  { id: 'sean-eurofighter', name: 'German Eurofighter Typhoon', position: [1.5, .85, 0], aircraft: true },
  { id: 'sean-azure-eagle', name: 'Azure Eagle', position: [-1.5, 2.45, 0], aircraft: true },
  { id: 'sean-beauty-hunter', name: 'Beauty Hunter', position: [1.5, 2.45, 0], aircraft: true },
  { id: 'sean-four-legged-friend', name: '四脚小可爱', position: [0, 4.05, 0], size: [1.5, 1.25, 1.8], rotation: [0, 0, 0], detailRotation: [0, 0, 0] },
].map(item => ({ room: 'workshop', creator: 'Sean', size: [2.7, 1.25, 2],
  rotation: [0, Math.PI, 0], detailRotation: [0, Math.PI / 2, 0], labelPosition: [0, -.12, 1.23],
  note: 'Created by Sean · A little imagination, made real. One of five original works in Sean’s Hangar gallery.', ...item }));
