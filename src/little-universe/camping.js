// Node-pure composition of the supplied camping pack in the planet local frame.
import * as THREE from 'three';
import { studio, batchMiniature } from './miniature.js';

export const CAMPFIRE = [0, .065, .35];
export const CAMP_LANTERN = [.42, .34, .03];
export const CAMP_CAPTION = [0, .88, .25];
// Sit together in front of the fire, clear of the chairs and each other.
export const CAMP_PIG_POSITION = [-.145, .065, .59];
export const CAMP_BAICAI_POSITION = [.145, .065, .59];
export const CAMPING_PARTS = ['tent', 'chair-pig', 'chair-baicai', 'lantern', 'wood-pile', 'little-pig', 'bai-baicai', 'campfire'];
export const CAMP_ASSET_URL = '/little-universe/camping/camping-props.glb';
// Authored units are metres. A shared miniature scale preserves prop proportions.
const prop = (id, asset, x, z, scale = .25, yaw = 0, y = .065) => ({ id, asset: `SM_${asset}`, position: [x, y, z], scale, yaw });
export const CAMP_PROPS = [
  prop('tent', 'Tent_Orange', -.04, -.25, .23, 0),
  prop('campfire', 'Campfire', 0, .35, .25),
  prop('chair-pig', 'Folding_Chair', -.31, .18, .34, .85),
  prop('chair-baicai', 'Folding_Chair', .31, .22, .34, -.85),
  prop('tea-table', 'Camp_Table', .45, -.04, .24, -.18),
  prop('lantern', 'Lantern', .46, -.06, .3, 0, .242),
  prop('tent-lantern', 'Lantern', -.04, -.27, .22),
  prop('kettle', 'Kettle', .41, .01, .25, .6, .242),
  prop('mug-pig', 'Mug', .36, -.09, .3, .4, .242),
  prop('mug-baicai', 'Mug', .51, .01, .3, -.6, .242),
  prop('map', 'Map_Open', .5, -.12, .15, -.18, .243),
  prop('backpack', 'Backpack', -.36, -.12, .27, -.5),
  prop('sleeping-roll', 'SleepingBag_Rolled', -.42, -.23, .27, .3),
  prop('cooler', 'Cooler_Box', .46, -.25, .24, -.25),
  prop('wood-pile', 'Firewood_Stack', -.43, .40, .18, .15),
  prop('moss-rock', 'Rock_Medium_Moss', .57, .24, .22, .3),
  prop('stone', 'Rock_Small', -.59, .28, .3),
  prop('pebbles', 'Pebbles', .40, .43, .22),
  prop('fern', 'Fern', .55, -.37, .25, 1),
  prop('mushrooms', 'Mushroom_Cluster', -.53, -.29, .3),
  ...Array.from({ length: 12 }, (_, i) => {
    const angle = i * Math.PI * 2 / 12;
    return prop(`grass-${i}`, i % 3 ? 'Grass_Tuft' : 'Grass_Tall', Math.cos(angle) * .65, Math.sin(angle) * .59, .22 + (i % 3) * .03, angle);
  }),
];

export function createCampingMiniature(options = {}) {
  const root = new THREE.Group(); root.name = 'camping-vignette';
  const ground = studio(new Map(), options);
  ground.cylinder('#687a60', [0, .01, 0], .74, .10);
  ground.cylinder('#aa9574', [0, .057, .18], .42, .008);
  // Match the planet's rounded trees while keeping the supplied camp furniture.
  ground.tree(-.49, -.44, .8);
  ground.tree(.38, -.41, .85);
  ground.tree(-.59, -.13, .65);
  const base = batchMiniature(ground.root); base.name = 'forest-floor'; root.add(base);
  // Anchors only: unavailable assets never silently become primitive replacements.
  for (const item of CAMP_PROPS) {
    const anchor = new THREE.Group(); anchor.name = item.id;
    anchor.position.fromArray(item.position); root.add(anchor);
  }
  for (const [name, position] of [['little-pig', CAMP_PIG_POSITION], ['bai-baicai', CAMP_BAICAI_POSITION]]) {
    const anchor = new THREE.Group(); anchor.name = name; anchor.position.fromArray(position);
    root.add(anchor);
  }
  return root;
}

export function composeCampingProps(source) {
  const root = new THREE.Group(); root.name = 'supplied-camping-props';
  const materials = new Map();
  for (const item of CAMP_PROPS) {
    const original = source.getObjectByName(item.asset);
    if (!original) throw new Error(`Camping pack is missing ${item.asset}`);
    const object = original.clone(true); object.position.set(0, 0, 0);
    object.traverse(mesh => {
      if (!mesh.isMesh) return;
      // Keep original maps, factors and UVs. Clone only materials, since world focus animates them.
      if (!materials.has(mesh.material)) materials.set(mesh.material, mesh.material.clone());
      mesh.material = materials.get(mesh.material); mesh.castShadow = true; mesh.receiveShadow = true;
      if (mesh.material.name === 'M_Palette_Emissive') {
        mesh.material.userData.animatedGlow = true;
        if (item.id === 'campfire') mesh.name = 'campfire-flames';
      }
    });
    const anchor = new THREE.Group(); anchor.name = item.id;
    anchor.position.fromArray(item.position); anchor.rotation.y = item.yaw; anchor.scale.setScalar(item.scale);
    anchor.add(object); root.add(anchor);
  }
  return root;
}

// The cached source owns geometry and texture memory; each composition owns only materials.
export function disposeCampingProps(root) {
  const materials = new Set();
  root.traverse(mesh => { if (mesh.isMesh) materials.add(mesh.material); });
  materials.forEach(material => material.dispose());
}

// Bounded, deterministic motion; reduced motion leaves a still, lit campsite.
export function campingMotion(seconds, reducedMotion = false) {
  const t = reducedMotion ? 0 : seconds;
  return {
    flame: reducedMotion ? 1 : 1 + Math.sin(t * 5.1) * 0.065 + Math.sin(t * 8.3) * 0.025,
    fireLight: reducedMotion ? 0.22 : 0.22 + Math.sin(t * 5.1) * 0.018 + Math.sin(t * 8.3) * 0.008,
    tentGlow: reducedMotion ? 0.65 : 0.65 + Math.sin(t * 0.7) * 0.035,
    pigBreath: reducedMotion ? 0 : Math.sin(t * 1.4) * 0.0025,
    leafSway: reducedMotion ? 0 : Math.sin(t * 1.1) * 0.018,
  };
}
