import * as THREE from 'three';
import { MAIN_VILLA_DATA as data } from './main-villa-data.js';

export const MAIN_VILLA_POSITION = Object.freeze(data.mount);
export const MAIN_VILLA_EYE_OFFSET = 1.6;
export const MAIN_VILLA_UPPER_EYE_Y = 6.65 + MAIN_VILLA_EYE_OFFSET;
// Global floors 2/3/4 belong to the mushroom pocket, forever.
export const MAIN_VILLA_ROOF_FLOOR = 5;

// The furnished GLB owns the villa. Legacy Kenney records remain available to
// their independent factories/tests, but no longer spawn, shadow or collide.
export const isActiveInteriorPlacement = p => p.room.startsWith('mushroom-');
export const isActiveArchitecturePlacement = () => false;

const rect = (x, z) => ({ minX: x[0], maxX: x[1], minZ: z[0], maxZ: z[1] });
const designRect = d => rect(d.x, [-d.y[1], -d.y[0]]);
export const MAIN_VILLA_UPPER_RECTANGLES = data.upperRectangles.map(r =>
  rect(r.x, r.z.map(z => z + MAIN_VILLA_POSITION[2])));

function floor(id, bounds, height, tolerance = 0.85) {
  const eyeY = height + MAIN_VILLA_EYE_OFFSET;
  return { id, ...bounds, eyeY, minY: eyeY - tolerance, maxY: eyeY + tolerance };
}

function flight(id, bounds, southHeight, northHeight) {
  const floorY = southHeight + MAIN_VILLA_EYE_OFFSET;
  const upperY = northHeight + MAIN_VILLA_EYE_OFFSET;
  return {
    id, ...bounds, floorY, upperY, speedMultiplier: 0.8,
    minY: Math.min(floorY, upperY) - 0.85,
    maxY: Math.max(floorY, upperY) + 0.85,
    maxDeltaY: 0.85,
    eyeYAt: z => {
      const t = THREE.MathUtils.clamp((bounds.maxZ - z) / (bounds.maxZ - bounds.minZ), 0, 1);
      return floorY + (upperY - floorY) * t;
    }
  };
}

const inner = data.stair;
const outer = data.roof.stair;
export const MAIN_VILLA_STAIRS = [
  flight('main-stairs', designRect(inner.design_west_flight), 0, 3.325),
  flight('main-stairs-return', designRect(inner.design_east_flight), 6.65, 3.325),
  flight('villa-roof-stairs-west', designRect(outer.west_up_run_design), 6.65, 10.15),
  flight('villa-roof-stairs-east', designRect(outer.east_up_run_design), 13.65, 10.15)
];

export const MAIN_VILLA_FLOOR_ZONES = [
  ...MAIN_VILLA_UPPER_RECTANGLES.map((r, i) => floor(`villa-upper-${i}`, r, 6.65)),
  floor('main-stair-landing', rect([-2.21, 2.21], [-18.695, -16.695]), 3.325),
  floor('villa-roof-lower-landing', designRect(outer.lower_landing_design), 6.65),
  floor('villa-roof-turn', designRect(outer.return_landing_design), 10.15),
  floor('villa-roof-bridge', designRect(data.roof.bridge_design), 13.65),
  floor('villa-rooftop', designRect(data.roof.deck_bounds_design), 13.65)
];

// Cinema platforms have a shallow east-side access ramp. Match the real row
// heights while keeping the decorative overlapping treads out of collision.
export function cinemaEyeY(position) {
  if (position.y < 0 || position.y > 3 || position.x < -12.5 || position.x > -4.2) return null;
  for (const [z, height] of [[-15, 0.48], [-17.15, 0.24]]) {
    if (Math.abs(position.z - z) > 0.94) continue;
    const t = THREE.MathUtils.clamp((-position.x - 5.58) / (height / 0.12 * 0.23), 0, 1);
    return MAIN_VILLA_EYE_OFFSET + height * t;
  }
  return null;
}

export function adaptMainVillaRooms(world) {
  const rooms = [
    ['grand_foyer', 'entry-foyer', '主楼玄关'],
    ['living_salon', 'great-hall-west', '法式大客厅'],
    ['family_dining_15', 'great-hall-east', '十五人家庭餐厅'],
    ['country_kitchen', 'villa-kitchen', '乡村厨房'],
    ['private_cinema_15', 'villa-cinema', '私人电影院'],
    ['mineral_bathhouse', 'villa-bathhouse', '矿物澡堂'],
    ['01_The_Orchard', 'master-bedroom', '二楼果园套房'],
    ['02_The_Rose_Garden', 'rose-suite', '二楼玫瑰套房'],
    ['03_The_Sunroom', 'sunroom-suite', '二楼阳光套房'],
    ['04_The_Cloud', 'lounge-balcony', '二楼云朵套房'],
    ['05_The_Cedar_Nest', 'cedar-suite', '二楼雪松套房'],
    ['computer_atelier_6', 'study-loft', '六工位电脑房']
  ];
  const additions = rooms.map(([sourceId, id, name]) => {
    const source = data.rooms.find(r => r.id === sourceId);
    const [x0, x1, y0, y1] = source.bounds_design;
    return { id, name, floor: source.floor, floorY: data.floorElevations[source.floor],
      center: { x: (x0 + x1) / 2, z: -(y0 + y1) / 2 }, size: { x: x1 - x0, z: y1 - y0 } };
  });
  world.rooms.splice(2, 0, ...additions);
  world.rooms.push({ id: 'villa-rooftop', name: '屋顶空中花园', floor: MAIN_VILLA_ROOF_FLOOR,
    floorY: 13.65, center: { x: 0, z: -13 }, size: { x: 22.4, z: 18.4 } });
  const stories = [
    ['main-villa-entry', '主楼玄关', '宽敞的拱门里，石材罗盘镶嵌迎着十五位住客，黄铜猪鼻徽章在吊灯下轻轻发亮。', 0, 1.4, -6.4],
    ['great-hall-west', '法式大客厅', '柔软沙发围着胡桃木茶几，壁炉、书柜和一杯热茶让下午慢慢安静下来。', -6, 1.4, -9.8],
    ['great-hall-east', '十五人家庭餐厅', '长餐桌上已经摆好十五套餐具，每一只小猪都有自己的位置。', 5.4, 1.4, -8.5],
    ['main-stairs', '折返大楼梯', '三十四级木踏步分成两跑，沿着黄铜扶手绕过平台，就能走到二楼。', -1.18, 1.4, -10.7],
    ['master-bedroom', '二楼果园套房', '三张独立小床藏在木格栅和软织物后，床头灯暖暖地亮着。', -7.8, 8.1, -5.65],
    ['study-loft', '六工位电脑房', '六张电脑桌背靠背排好，小猪们可以一起玩游戏，也可以安安静静写故事。', 6.9, 8.1, -20.25],
    ['lounge-balcony', '二楼云朵套房', '柔软的被子像一朵朵小云，三处私密睡眠角落各有自己的床头灯。', 7.5, 8.1, -5.65],
    ['blanket-nest', '软乎乎毯子窝', '大呆猪最喜欢客厅这一角，靠着柔软沙发就能打个长长的盹。', -6.5, .9, -10.8],
    ['tiny-corner', '小猪的秘密角落', '乡村厨房里飘着点心香，小猪在中岛旁边等着第一块出炉的饼干。', 5.2, .8, -15],
    ['villa-kitchen', '乡村厨房', '石材台面、木中岛和黄铜水龙头，把每天的小点心都照顾得妥妥当当。', 5.3, 1.4, -18.1],
    ['villa-cinema', '私人电影院', '十五个软座面向电影银幕，三排座台顺着视线错开，爆米花已经准备好了。', -5.05, 1.6, -18],
    ['villa-bathhouse', '矿物澡堂', '椭圆石材浴池旁摆着毛巾和木长凳，雨淋区藏在鼠尾草绿的隔屏后。', 0, 1.4, -20],
    ['villa-rooftop', '屋顶空中花园', '从二楼后连廊沿外楼梯上来，芳香种植床、橄榄树和木藤架在天空下等着你。', 0, 15.1, -14]
  ];
  for (const [id, title, body, x, y, z] of stories) {
    const story = { id, title, body, position: { x, y, z }, radius: 2.8 };
    world.interactions.push(story);
  }
  return world;
}

function box(id, x, z, w, d, minY, maxY) {
  return { id: `maison-${id}`, kind: 'box', ...rect([x - w / 2, x + w / 2], [z - d / 2, z + d / 2]), minY, maxY };
}

function segment(id, a, b, thickness = 0.105) {
  return { id: `maison-${id}`, kind: 'segment', start: a, end: b, thickness };
}

export function createMainVillaColliders() {
  const colliders = [];
  for (const [name, role, min, max] of data.proxies) {
    // Window holes in the wall proxies are visual openings, not doorways.
    // Continuous perimeter barriers below own glazing and the actual doors.
    if (/^(GF|UF)_(Front|Rear|Side)_Facade/.test(name)) continue;
    if (/Wardrobe_(Panel|Handle)/.test(name)) continue;
    const isFurniture = role === 'furniture_proxy';
    const upper = min[1] >= 6.6;
    const shrink = isFurniture ? 0.9 : 1;
    colliders.push(box(name, (min[0] + max[0]) / 2,
      (min[2] + max[2]) / 2 - 13, (max[0] - min[0]) * shrink,
      (max[2] - min[2]) * shrink,
      isFurniture ? (upper ? 7.4 : 0) : min[1],
      isFurniture ? (upper ? 10.5 : 3.2) : max[1]));
  }
  // Ground entry is 6m wide. Only the upper REAR door is traversable;
  // the upper front balcony stays behind fixed glass.
  for (const [suffix, lo, hi] of [['ground', 0, 5.6], ['upper', 6.65, 11.25]]) {
    colliders.push(box(`west-${suffix}`, -13, -13, .36, 22, lo, hi),
      box(`east-${suffix}`, 13, -13, .36, 22, lo, hi));
  }
  colliders.push(box('rear-ground', 0, -24, 26, .36, 0, 5.6),
    box('front-ground-west', -8, -2, 10, .36, 0, 5.6),
    box('front-ground-east', 8, -2, 10, .36, 0, 5.6),
    box('front-upper-glazing', 0, -2, 26, .36, 6.65, 11.25),
    box('rear-upper-west', -7.1, -24, 11.8, .36, 6.65, 11.25),
    box('rear-upper-east', 7.1, -24, 11.8, .36, 6.65, 11.25));

  // Eye-height guards: do not use the short visual rail's Y bounds.
  for (const [name, a, b, width] of data.guards) {
    colliders.push(segment(name, [a[0], a[1], a[2] - 13], [b[0], b[1], b[2] - 13], width));
  }
  for (const x of [-3, 3]) {
    colliders.push(segment(`atrium-side-${x}`, [x, 6.65, -4], [x, 6.65, -9]),
      segment(`well-side-${x}`, [x, 6.65, -11], [x, 6.65, -19]));
  }
  for (const z of [-4, -9, -19]) {
    colliders.push(segment(`upper-cross-${z}`, [-3, 6.65, z], [3, 6.65, z]));
  }
  for (const [x, south, north] of [[-2.27, 0, 3.325], [-.085, 0, 3.325], [.085, 6.65, 3.325], [2.27, 6.65, 3.325]]) {
    colliders.push(segment(`stair-rail-${x}`, [x, south, -11], [x, north, -16.695]));
  }
  colliders.push(segment('stair-turn-back', [-2.22, 3.325, -18.695], [2.22, 3.325, -18.695]));
  for (const x of [-2.28, 2.28]) {
    colliders.push(segment(`stair-turn-side-${x}`, [x, 3.325, -16.695], [x, 3.325, -18.695]));
  }
  // Prevent stepping off the upper arrival onto the LOW end of the west run.
  colliders.push(segment('arrival-west-guard', [-3, 6.65, -11], [0, 6.65, -11]));
  // Substantial furniture omitted from the author's suggested proxy list.
  const furniture = (id, x, z, w, d, upper = false) =>
    colliders.push(box(id, x, z, w, d, upper ? 7.4 : 0, upper ? 10.5 : 3.2));
  furniture('welcome-console', -2.6, -4.4, 1.6, .5);
  furniture('welcome-bench', 2.65, -4.5, 1.65, .7);
  furniture('salon-table', -8.55, -8.15, 2.5, 1.35);
  furniture('dining-sideboard', 11.35, -11.95, 1.9, .6);
  furniture('kitchen-north', 8.15, -23.23, 7.36, 1.26);
  furniture('kitchen-east', 12.22, -20.6, 1.30, 4.95);
  furniture('fridge', 5.1, -22.6, 1.35, 1.35);
  colliders.push({ id: 'maison-mineral-bath', kind: 'ellipse', centerX: 0,
    centerZ: -22.25, radiusX: 1.95, radiusZ: 1.125, minY: 0, maxY: 3.2 });
  furniture('computer-desk', 9.2, -20.8, 2.4, 5.25, true);
  // Cinema armchairs are substantial; dining/desk chairs stay walk-through.
  for (const [z, h] of [[-15, .48], [-17.15, .24], [-19.3, 0]]) {
    for (let i = 0; i < 5; i++) furniture(`cinema-seat-${z}-${i}`, -11.55 + i * 1.26, z, .75, .88);
  }
  const roofBox = (id, x, z, w, d) => colliders.push(box(id, x, z, w, d, 14.4, 17.5));
  for (const y of [7.25, 11.1, 15, 19.3]) roofBox(`west-bed-${y}`, -9.7, -y, 1.25, 2.5);
  for (const x of [-7.6, -3.5, 5, 8.8]) roofBox(`rear-bed-${x}`, x, -21.25, 2.6, .5);
  for (const x of [-5.3, 5.3]) roofBox(`front-bed-${x}`, x, -6.05, 5, .95);
  for (const x of [-6.8, -3.65]) for (const y of [10, 13.3]) roofBox(`herbs-${x}-${y}`, x, -y, 1.65, 1.3);
  for (const [x, y] of [[-8, 6.4], [8.8, 6.4], [-8.8, 18], [8.8, 18]]) roofBox(`olive-${x}-${y}`, x, -y, 1, 1);
  for (const x of [3, 9.1]) for (const y of [9.4, 14.8]) roofBox(`pergola-${x}-${y}`, x, -y, .5, .5);
  roofBox('garden-sofa', 6, -14, 3.7, 1.25);
  roofBox('garden-tea-table', 6, -11.7, 2.3, 1.4);
  roofBox('garden-dining', 5.55, -18, 3.7, 1.3);
  for (const y of [8.3, 16.2]) roofBox(`garden-bench-${y}`, -5.5, -y, 2.4, .69);
  // The rear stair's structural posts and stone feet remain solid below
  // the elevated flights without blocking the landing or overhead walk.
  for (const x of [-2.16, 2.16]) {
    for (const [z, top] of [[-24.75, 6.5], [-28.4, 8.5], [-32.8, 10.02]]) {
      colliders.push(box(`rear-stair-post-${x}-${z}`, x, z, .26, .26, 0, top + 1.6));
      colliders.push(box(`rear-stair-foot-${x}-${z}`, x, z, .65, .65, 0, 2.16));
    }
  }
  for (const x of [-2.35, 2.35]) for (const z of [-26.6, -29.5]) {
    furniture(`rear-stair-planter-${x}-${z}`, x, z, .7, 1.55);
  }
  // A ground visitor may walk below the high east flight, but cannot pass
  // through the solid risers supporting the west flight.
  colliders.push({ ...MAIN_VILLA_STAIRS[0], id: 'maison-west-stair-solid', kind: 'stair-volume' });
  return colliders;
}

// Guards use distance to a segment instead of expanded AABBs: a radius .62
// player can round the ends of rails and turn on a two-metre landing.
export function collidesWithMainVillaShape(position, collider, radius) {
  if (collider.kind === 'box') {
    // A circular player rounds actual wall corners; expanded square AABBs
    // falsely pinch the rear doorway's turn onto its 1.5m landing.
    const x = THREE.MathUtils.clamp(position.x, collider.minX, collider.maxX);
    const z = THREE.MathUtils.clamp(position.z, collider.minZ, collider.maxZ);
    return Math.hypot(position.x - x, position.z - z) < radius;
  }
  if (collider.kind === 'ellipse') {
    return ((position.x - collider.centerX) / (collider.radiusX + radius)) ** 2
      + ((position.z - collider.centerZ) / (collider.radiusZ + radius)) ** 2 < 1;
  }
  if (collider.kind === 'stair-volume') {
    return position.x > collider.minX && position.x < collider.maxX
      && position.z > collider.minZ && position.z < collider.maxZ
      && position.y >= 0 && position.y < collider.eyeYAt(position.z) - 0.85;
  }
  const [ax, ay, az] = collider.start, [bx, by, bz] = collider.end;
  const dx = bx - ax, dz = bz - az;
  const t = THREE.MathUtils.clamp(((position.x - ax) * dx + (position.z - az) * dz) / (dx * dx + dz * dz), 0, 1);
  const surfaceY = ay + (by - ay) * t;
  if (position.y < surfaceY - .2 || position.y > surfaceY + 3) return false;
  return Math.hypot(position.x - ax - dx * t, position.z - az - dz * t) < radius + collider.thickness / 2;
}

// Matched-coordinate fail-soft stand-in. The old single-flight shell would
// be unsafe with the new floor/collision contract when a model request fails.
export function createMainVillaFallback() {
  const group = new THREE.Group();
  group.name = 'maison-procedural-fallback';
  const wall = new THREE.MeshStandardMaterial({ color: '#efe4ce', roughness: .85 });
  const floorMat = new THREE.MeshStandardMaterial({ color: '#bd9872', roughness: .85 });
  const addBox = (x, y, z, w, h, d, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z + 13); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  };
  addBox(0, -.08, -13, 26, .16, 22, floorMat);
  for (const r of MAIN_VILLA_UPPER_RECTANGLES) {
    addBox((r.minX + r.maxX) / 2, 6.48, (r.minZ + r.maxZ) / 2,
      r.maxX - r.minX, .34, r.maxZ - r.minZ, floorMat);
  }
  for (const c of createMainVillaColliders()) {
    if (c.kind !== 'box' || !/maison-(GF_|UF_|west-|east-|rear-|front-)/.test(c.id)) continue;
    addBox((c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2, (c.minZ + c.maxZ) / 2,
      c.maxX - c.minX, c.maxY - c.minY, c.maxZ - c.minZ, wall);
  }
  for (const c of createMainVillaColliders().filter(c => c.kind === 'segment')) {
    const a = new THREE.Vector3(c.start[0], c.start[1] + 1.1, c.start[2] + 13);
    const b = new THREE.Vector3(c.end[0], c.end[1] + 1.1, c.end[2] + 13);
    const direction = b.clone().sub(a);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.1, direction.length(), .1), floorMat);
    rail.position.copy(a.add(b).multiplyScalar(.5));
    rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    group.add(rail);
  }
  for (const s of MAIN_VILLA_STAIRS) {
    for (let i = 0; i < 34; i++) {
      const depth = (s.maxZ - s.minZ) / 34;
      const z = s.minZ + (i + .5) * depth;
      const y = s.eyeYAt(z) - MAIN_VILLA_EYE_OFFSET;
      addBox((s.minX + s.maxX) / 2, y - .08, z, s.maxX - s.minX, .16, depth + .01, floorMat);
    }
  }
  for (const f of MAIN_VILLA_FLOOR_ZONES.filter(f => !f.id.startsWith('villa-upper-'))) {
    addBox((f.minX + f.maxX) / 2, f.eyeY - MAIN_VILLA_EYE_OFFSET - .1,
      (f.minZ + f.maxZ) / 2, f.maxX - f.minX, .2, f.maxZ - f.minZ, floorMat);
  }
  return group;
}
