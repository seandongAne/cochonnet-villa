import * as THREE from 'three';
import { fighterExhibits } from './fighter-exhibits.js';
import { seanExhibits } from './sean-exhibits.js';

export const collectionModels = [
  ...seanExhibits,
  ...fighterExhibits,
  { id: 'sd-gundam', name: 'SD Gundam', room: 'workshop', position: [-1.25, .97, -1.85], size: [.95, 1.05, .72], rotation: [0, .12, 0], note: 'A little hero in your Hangar.' },
  { id: 'reborns-gundam', name: 'Reborns Gundam', room: 'workshop', position: [1.95, 1.16, -1.95], size: [1.1, 1.3, .75], rotation: [0, -.12, 0], note: 'A place for your favorite builds.' },
  { id: 'zz-gundam-verka', name: 'ZZ Gundam Ver.Ka', room: 'workshop', position: [-.05, .99, -1.85], size: [1, 1.04, .72], rotation: [0, 0, 0], note: 'One more favorite build, at home in your Hangar.' },
  { id: 'cessna-172', name: 'Cessna 172 Skyhawk', room: 'workshop', aircraft: true, position: [-.2, .67, -.15], size: [2.05, .65, 1.55], rotation: [0, .22, 0], labelPosition: [0, -.09, .78], note: 'A little Skyhawk, ready for all the places we could go.' },
  { id: 'diamond-da20-c1', name: 'Diamond DA20-C1', room: 'workshop', aircraft: true, position: [2.22, .83, .1], size: [1, .55, 1.64], rotation: [0, -Math.PI / 2, 0], labelPosition: [-.45, .48, -.15], note: 'A little Diamond, with a whole sky ahead.' },
  { id: 'cz-bren-2', name: 'CZ BREN 2', room: 'museum', position: [-1.25, 1.7, -2.12], size: [2.1, .9, .26], rotation: [0, Math.PI / 2, 0], note: 'From your collection, displayed in The Iron & Rose.' },
  { id: 'm1887-short', name: 'M1887 Short', room: 'museum', position: [1.32, 1.93, -2.12], size: [1.25, .9, .26], rotation: [0, Math.PI / 2, 0], note: 'A closer look at the short model from your collection.' },
  { id: 'm590', name: 'M590', room: 'museum', position: [.9, 1.38, -2.12], size: [1.95, .45, .26], rotation: [0, Math.PI / 2, 0], note: 'Your M590, with a quiet place in the collection.' },
  { id: 'rose', name: 'Rose', room: 'museum', position: [2.13, 1.07, -1.98], size: [.43, .85, .34], rotation: [0, -.4, 0], labelPosition: [0, -.09, .24], note: 'A little softness among the iron.' },
  { id: 'ru-winter-su100', name: 'RU Winter SU-100', room: 'museum', position: [0, .5, -.15], size: [1.6, .9, 1.9], rotation: [0, -Math.PI / 2, 0], note: 'The centerpiece of The Iron & Rose, in its winter finish.' },
];
export const modelUrl = id => `/little-universe/models/${id}.glb`;

// Orient first, then fit all three dimensions and sit the asset on its support.
export function fitCollectionModel(source, size, rotation = [0, 0, 0]) {
  const pivot = new THREE.Group();
  const model = source.clone(true); model.rotation.set(...rotation); pivot.add(model);
  pivot.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(pivot);
  const extent = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  if (![...extent.toArray(), ...center.toArray()].every(Number.isFinite) || extent.length() === 0) throw new RangeError('Empty model bounds');
  const scale = Math.min(...size.map((value, i) => value / Math.max(extent.getComponent(i), 1e-6)));
  model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  pivot.scale.setScalar(scale);
  return pivot;
}
