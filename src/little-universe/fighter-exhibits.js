// Four independent supplied aircraft on the Hangar's two-tier left gallery.
export const fighterExhibits = [
  { id: 'f14-tomcat', name: 'F-14 Tomcat', position: [-2.34, 1.85, -.77] },
  { id: 'f15e-strike-eagle', name: 'F-15E Strike Eagle', position: [-2.34, 1.85, .65] },
  { id: 'f16-fighting-falcon', name: 'F-16 Fighting Falcon', position: [-2.34, .8, -.77] },
  { id: 'fa18-hornet', name: 'F/A-18 Hornet', position: [-2.34, .8, .65] },
].map(item => ({ ...item, room: 'workshop', aircraft: true, fighter: true,
  size: [.86, .43, 1.24], rotation: [0, -.18, 0], labelPosition: [.48, -.1, .1],
  note: 'Original paint, cockpit and landing gear — a little closer to the sky.' }));
export const FIGHTER_GALLERY_OBSTACLE = [-2.88, -1.87, -1.43, 1.32];
