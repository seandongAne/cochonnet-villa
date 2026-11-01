import { BoxGeometry } from 'three';
// Public art collection: independent copies and timestamps only.
import collection from '../../content/gallery.json' with { type: 'json' };
import { studio, batchMiniature } from './miniature.js';
export const galleryWorks = [...collection.works].sort((a,b) => b.timestamp.localeCompare(a.timestamp) || b.number - a.number);
export const GALLERY_PAGE_SIZE = 7;
export const GALLERY_FRAME_SIZE = [1.48, .99];
export const GALLERY_SLOTS = [
  ...[-1.85, 0, 1.85].map(x => ({ position: [x, 1.93, -2.37], rotation: 0 })),
  ...[-.9, 1.05].map(z => ({ position: [-2.87, 1.93, z], rotation: Math.PI / 2 })),
  ...[-.9, 1.05].map(z => ({ position: [2.87, 1.93, z], rotation: -Math.PI / 2 }))
];
export const GALLERY_OBSTACLES = [[-.95,.95,-.33,.33],[-2.65,-2.05,-2.25,-1.65],[2.05,2.65,-2.25,-1.65]];
export function galleryPage(works, page) {
  const count = Math.max(1, Math.ceil(works.length / GALLERY_PAGE_SIZE));
  const index = Math.min(count - 1, Math.max(0, Math.floor(Number(page) || 0)));
  return works.slice(index * GALLERY_PAGE_SIZE, (index + 1) * GALLERY_PAGE_SIZE);
}
export function artworkLabel(work) { return '作品 ' + String(work.number).padStart(3, '0'); }
export function formatGalleryTimestamp(work) {
  const text = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23', timeZoneName:'short' }).format(new Date(work.timestamp));
  return text;
}
export function timestampLabel(work) { return ({ generated: '生成时间', archived: '归档时间', imported: '入藏时间' })[work.timestampKind]; }
export { createGalleryMiniature } from './destination-buildings.js';
export function createGalleryRoom() {
  const s=studio();
  const wall = (color, position, size) => s.mesh(new BoxGeometry(...size), color, position);
  s.box('#cbb394',[0,-.08,0],[6,.16,5]);
  for(let i=0;i<24;i++) s.box(i%3?'#dfcbb0':'#d7bea0',[-2.875+i*.25,.015,0],[.24,.02,4.95]);
  wall('#f0e9df',[0,1.6,-2.5],[6,3.2,.12]);
  for(const x of [-3,3]) wall('#f0e9df',[x,1.6,0],[.12,3.2,5]);
  for(const x of [-1.8,1.8]) wall('#f0e9df',[x,1.6,2.5],[2.4,3.2,.12]);
  wall('#f0e9df',[0,2.8,2.5],[1.2,.8,.12]);
  wall('#eee4d6',[0,3.23,0],[6,.1,5]);
  s.box('#b8c9c6',[0,3.16,-.15],[2.25,.035,2.3]);
  for(const x of [-1.1,0,1.1]) s.box('#bba386',[x,3.12,-.15],[.05,.08,2.4]);
  for(const z of [-1.3,1]) s.box('#bba386',[0,3.12,z],[2.3,.08,.05]);
  for(const slot of GALLERY_SLOTS) {
    const f=studio();f.box('#b49061',[0,0,0],[1.66,1.17,.08]);
    f.box('#fff9ed',[0,0,.045],[1.56,1.07,.025]);
    f.box('#c4ad8b',[0,.78,.08],[.6,.055,.15]);
    f.box('#ffedcf',[0,.75,.12],[.49,.018,.1]);
    f.root.position.set(...slot.position);f.root.rotation.y=slot.rotation;s.root.add(f.root);
  }
  s.box('#957455',[0,.43,0],[1.8,.12,.58]);
  s.box('#d4bda0',[0,.51,0],[1.75,.09,.54]);
  for(const x of [-.68,.68])s.box('#77634f',[x,.22,0],[.09,.44,.45]);
  for(const x of [-2.35,2.35]) {
    s.cylinder('#b69b80',[x,.24,-1.95],.21,.46);
    s.cylinder('#80745a',[x,.58,-1.95],.028,.6);
    s.ball('#95a482',[x,.92,-1.95],[.23,.39,.22]);
    s.ball('#aaba91',[x+.12,1.04,-1.95],[.18,.24,.16]);
  }
  const root=batchMiniature(s.root);root.name='gallery-interior';return root;
}
