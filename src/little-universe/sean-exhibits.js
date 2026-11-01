// Five works supplied by the author and explicitly credited to Sean.
// Front-wall shelves leave the entrance and the cross-aisle open.
export const SEAN_GALLERY_OBSTACLES = [[-6.2, -3.8, 10.5, 11.65], [3.8, 6.2, 10.5, 11.65]];
export const seanExhibits = [
  { id: 'sean-tornado', name: 'Luftwaffe Tornado', position: [-5, .8, 11.05], aircraft: true },
  { id: 'sean-eurofighter', name: 'German Eurofighter Typhoon', position: [-5, 1.65, 11.05], aircraft: true },
  { id: 'sean-azure-eagle', name: 'Azure Eagle', position: [5, .8, 11.05], aircraft: true },
  { id: 'sean-beauty-hunter', name: 'Beauty Hunter', position: [5, 1.65, 11.05], aircraft: true },
  { id: 'sean-four-legged-friend', name: '四脚小可爱', position: [5, 2.4, 11.05], size: [.6, .46, .62], rotation: [0, Math.PI, 0], detailRotation: [0, 0, 0] },
].map(item => ({ room: 'workshop', creator: 'Sean', size: [1.8, .55, .7],
  rotation: [0, 0, 0], detailRotation: [0, Math.PI / 2, 0], labelPosition: [0, -.11, -.43],
  note: 'Created by Sean · A little imagination, made real. One of five original works in Sean’s Hangar gallery.', ...item }));
