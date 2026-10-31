// Small, locally authored display models; no external asset or texture requests.
import * as THREE from 'three';
import { studio, batchMiniature } from './miniature.js';

function rod(s, color, start, end, radius) {
  const a = new THREE.Vector3(...start); const b = new THREE.Vector3(...end);
  const mesh = s.cylinder(color, a.clone().add(b).multiplyScalar(0.5).toArray(), radius, a.distanceTo(b));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
}

export function createGundam(options = {}) {
  const s = studio(new Map(), options);
  const white = '#e9e5dc', blue = '#506b94', red = '#bc625e', dark = '#424956', gold = '#dcb86c';
  s.cylinder('#665964', [0, .025, 0], .34, .05);
  for (const side of [-1, 1]) {
    s.box(red, [side * .115, .09, .075], [.19, .11, .29]);
    s.box(white, [side * .115, .285, 0], [.15, .31, .16]);
    s.box(blue, [side * .115, .32, .09], [.12, .11, .055]);
    s.ball(dark, [side * .115, .48, 0], [.075, .065, .07]);
    s.box(white, [side * .11, .585, 0], [.15, .18, .17]);
    const skirt = s.box(white, [side * .11, .66, .1], [.16, .17, .075]); skirt.rotation.x = -.2;
    s.box(white, [side * .28, .95, 0], [.23, .17, .25]);
    s.box(blue, [side * .29, .98, .13], [.18, .045, .03]);
    s.ball(dark, [side * .29, .8, 0], [.06, .065, .06]);
    s.box(white, [side * .3, .72, 0], [.13, .18, .15]);
    s.box(dark, [side * .3, .59, .015], [.1, .09, .11]);
    s.box(gold, [side * .09, .89, .16], [.085, .045, .025]);
    rod(s, gold, [0, 1.19, .125], [side * .21, 1.34, .12], .017);
    s.box(white, [side * .1, 1.12, .02], [.055, .14, .13]);
  }
  s.box(red, [0, .7, 0], [.16, .14, .19]);
  s.box(blue, [0, .88, 0], [.34, .29, .25]);
  s.box(red, [0, .79, .14], [.095, .13, .05]);
  s.box(white, [0, 1.14, 0], [.18, .2, .17]);
  s.box(dark, [0, 1.16, .09], [.14, .04, .025]);
  s.box('#a4cfb0', [0, 1.165, .106], [.115, .016, .012]);
  s.box(white, [0, 1.1, .11], [.085, .06, .045]);
  s.box(red, [0, 1.065, .12], [.04, .04, .025]);
  s.box(red, [0, 1.225, .11], [.045, .055, .035]);
  s.box(dark, [0, .91, -.18], [.23, .26, .14]);
  rod(s, white, [.1, 1, -.2], [.15, 1.33, -.21], .025);
  const shield = s.box(red, [.42, .76, .04], [.17, .39, .09]); shield.rotation.z = -.14;
  s.box(white, [.42, .76, .095], [.12, .31, .025]);
  s.box(gold, [.42, .76, .115], [.03, .16, .015]);
  return batchMiniature(s.root);
}

export function createDisplayRifle() {
  const s = studio();
  s.box('#555761', [-.05, 0, 0], [.5, .12, .095]);
  s.box('#99765e', [-.43, -.025, 0], [.29, .17, .09]);
  s.box('#a38364', [.22, 0, 0], [.3, .1, .1]);
  rod(s, '#464955', [.34, .025, 0], [.69, .025, 0], .024);
  s.box('#444653', [-.07, -.12, 0], [.09, .18, .07]).rotation.z = -.2;
  s.box('#61606a', [.09, -.12, 0], [.09, .17, .065]).rotation.z = .12;
  rod(s, '#424751', [-.2, .13, 0], [.13, .13, 0], .038);
  s.box('#424751', [-.02, .08, 0], [.16, .1, .04]);
  return batchMiniature(s.root);
}

export function createDisplayPistol() {
  const s = studio();
  s.box('#585a65', [.04, .08, 0], [.33, .075, .07]);
  s.box('#444752', [-.055, 0, 0], [.13, .1, .065]);
  s.box('#8d6b54', [-.09, -.095, 0], [.095, .17, .065]).rotation.z = -.18;
  const guard = s.mesh(new THREE.TorusGeometry(.043, .008, 6, 16), '#444752', [.025, -.025, 0]);
  guard.scale.x = 1.2;
  return batchMiniature(s.root);
}

export function createRecord(label = '#c7837c') {
  const s = studio();
  s.cylinder('#292b35', [0, 0, 0], .265, .014);
  for (const r of [.14, .17, .2, .23, .25]) {
    const groove = s.mesh(new THREE.TorusGeometry(r, .0015, 4, 64), '#4f4b55', [0, .008, 0]);
    groove.rotation.x = Math.PI / 2;
  }
  s.cylinder(label, [0, .009, 0], .083, .003);
  s.cylinder('#d9c1a0', [0, .012, 0], .012, .006);
  s.box('#e7d2b2', [.018, .012, .033], [.06, .002, .012]);
  return batchMiniature(s.root);
}

export function createTurntable() {
  const s = studio();
  s.box('#8e6850', [0, .065, 0], [.94, .13, .7]);
  s.box('#b89872', [0, .135, 0], [.9, .025, .66]);
  s.cylinder('#b8ada1', [-.1, .16, 0], .285, .025);
  s.cylinder('#c7bfb2', [.3, .18, -.21], .045, .06);
  rod(s, '#c9bdac', [.3, .21, -.21], [.33, .21, .13], .012);
  rod(s, '#c9bdac', [.33, .21, .13], [.17, .21, .19], .012);
  s.box('#414652', [.16, .2, .19], [.075, .03, .04]);
  s.cylinder('#d1bf9c', [.34, .16, .25], .025, .025);
  const lid = s.box('#755e52', [0, .38, -.36], [.94, .5, .035]); lid.rotation.x = -.15;
  s.box('#c0a17e', [0, .39, -.326], [.8, .36, .015]).rotation.x = -.15;
  const root = batchMiniature(s.root);
  const record = createRecord(); record.name = 'spinning-record'; record.position.set(-.1, .18, 0); root.add(record);
  return root;
}

export function createSpeaker() {
  const s = studio();
  s.box('#785b4d', [0, .38, 0], [.43, .76, .38]);
  s.box('#383b44', [0, .38, .2], [.36, .66, .025]);
  for (const [y, r] of [[.25, .12], [.58, .065]]) {
    const cone = s.cylinder('#727077', [0, y, .23], r, .025); cone.rotation.x = Math.PI / 2;
    const center = s.cylinder('#333740', [0, y, .25], r * .5, .02); center.rotation.x = Math.PI / 2;
  }
  return batchMiniature(s.root);
}
