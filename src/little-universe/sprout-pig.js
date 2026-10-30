// Local sculpt study of the selected sprout-pig illustration. +Z faces forward.
// Hidden surfaces are design proposals; this is not an approved production asset.
import * as THREE from 'three';

export const SPROUT_PIG_URL = '/birthday-characters/sprout-pig-study-v1.glb';

export function createSproutPigStudy() {
  const root = new THREE.Group(); root.name = 'sprout-pig-study-v1';
  root.userData = { status: 'awaiting-visual-review', reference: 'sprout-pig-v1.png', hiddenSurfaces: 'proposed' };
  const skin = new THREE.MeshStandardMaterial({ color: '#ffc1b2', roughness: .86 });
  const hoof = new THREE.MeshStandardMaterial({ color: '#ce8b76', roughness: .87 });
  const rose = new THREE.MeshStandardMaterial({ color: '#eb9c88', roughness: .86 });
  const eye = new THREE.MeshPhysicalMaterial({ color: '#241813', roughness: .15, clearcoat: .8, clearcoatRoughness: .12 });
  const green = new THREE.MeshStandardMaterial({ color: '#9aac60', roughness: .88 });
  const vein = new THREE.MeshStandardMaterial({ color: '#b5bd7c', roughness: .9 });
  const mouth = new THREE.MeshStandardMaterial({ color: '#783126', roughness: .98 });
  const tongue = new THREE.MeshStandardMaterial({ color: '#e69785', roughness: .8 });
  const mesh = (name, geometry, material, position, scale, parent = root) => {
    const object = new THREE.Mesh(geometry, material); object.name = name;
    object.position.set(...position); if (scale) object.scale.set(...scale);
    object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  };
  const ball = (name, material, position, scale, parent) => mesh(name, new THREE.SphereGeometry(1, 64, 48), material, position, scale, parent);
  const tube = (name, points, radius, material, parent = root) => mesh(name,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 48, radius, 10, false), material, [0, 0, 0], null, parent);

  ball('seated-body', skin, [0, .195, -.005], [.272, .195, .215]);
  for (const side of [-1, 1]) {
    ball(`haunch-${side}`, skin, [side * .18, .115, .045], [.12, .112, .125]);
    const foot = ball(`foot-${side}`, hoof, [side * .19, .088, .18], [.086, .087, .055]);
    foot.rotation.z = side * -.17;
    // Shallow hoof clefts are geometry, visible without a painted image plane.
    tube(`foot-cleft-${side}`, [[side * .19, .121, .215], [side * .19, .107, .239], [side * .19, .089, .244]], .003, rose);
    const arm = ball(`arm-${side}`, skin, [side * .15, .23, .157], [.073, .112, .068]);
    arm.rotation.z = side * -.48; arm.rotation.x = -.32;
    const hand = ball(`hand-${side}`, hoof, [side * .106, .166, .205], [.048, .039, .042]);
    hand.rotation.z = side * -.45;
    tube(`hand-cleft-${side}`, [[side * .106, .183, .241], [side * .106, .164, .247], [side * .106, .148, .234]], .0025, rose);
  }
  tube('curled-tail-proposal', [[0, .13, -.188], [.055, .14, -.233], [.074, .182, -.245], [.042, .209, -.25], [.008, .189, -.254], [.023, .164, -.257], [.045, .178, -.259]], .012, skin);

  const head = new THREE.Group(); head.name = 'tilted-head'; head.position.set(-.008, .57, .016); head.rotation.z = .27; root.add(head);
  const headGeometry = new THREE.SphereGeometry(1, 128, 96);
  const positions = headGeometry.attributes.position; const colors = [];
  const base = new THREE.Color('#ffc1b2'); const blush = new THREE.Color('#e98d83');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const broad = 1 + .095 * Math.exp(-(((y + .4) / .45) ** 2));
    positions.setX(i, x * broad);
    const amount = z > 0 ? .68 * Math.exp(-(((Math.abs(x) - .62) / .19) ** 2) - ((y + .22) / .18) ** 2) * Math.min(1, z * 3) : 0;
    const color = base.clone().lerp(blush, amount); colors.push(color.r, color.g, color.b);
  }
  headGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); headGeometry.computeVertexNormals();
  const faceMaterial = skin.clone(); faceMaterial.color.set('white'); faceMaterial.vertexColors = true;

  mesh('round-cheek-head', headGeometry, faceMaterial, [0, 0, 0], [.325, .269, .24], head);

  for (const side of [-1, 1]) {
    // A thick closed ear with a curved drooping centreline and rounded tip.
    const g = new THREE.SphereGeometry(1, 64, 48); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = (p.getY(i) + 1) / 2; const x = p.getX(i), z = p.getZ(i);
      p.setXYZ(i, side * (.255 + .125 * u) + x * .095 * (.7 + .3 * u), .192 - .221 * u, .025 + .13 * u * u + z * .037);
    }
    g.computeVertexNormals(); mesh(`drooping-ear-${side}`, g, skin, [0, 0, 0], null, head);
    const e = ball(`glossy-eye-${side}`, eye, [side * .122, .011, .226], [.027, .033, .018], head);
    e.rotation.y = side * .28;
  }

  // Recessed nostrils deform the snout surface and darken inside the depressions.
  const snout = new THREE.SphereGeometry(1, 128, 80); const sp = snout.attributes.position; const sc = [];
  const noseColor = new THREE.Color('#eda38e'), cavityColor = new THREE.Color('#b76955');
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
    const indent = z > 0 ? Math.exp(-(((Math.abs(x) - .39) / .14) ** 2) - ((y - .05) / .27) ** 2) : 0;
    sp.setZ(i, z - .4 * indent);
    const c = noseColor.clone().lerp(cavityColor, indent * .72); sc.push(c.r, c.g, c.b);
  }
  snout.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3)); snout.computeVertexNormals();
  const noseMaterial = skin.clone(); noseMaterial.color.set('white'); noseMaterial.vertexColors = true;
  mesh('snout-with-recessed-nostrils', snout, noseMaterial, [0, -.038, .246], [.107, .071, .051], head);

  // The smile follows the head curvature, with a lip and a small raised tongue.
  const smileVertices = [], smileIndices = [];
  const rings = 20, segments = 96;
  for (let ring = 0; ring <= rings; ring++) for (let j = 0; j <= segments; j++) {
    const a = j / segments * Math.PI * 2, r = ring / rings;
    const edgeX = .046 * Math.cos(a);
    const edgeY = -.097 + Math.sin(a) * (Math.sin(a) > 0 ? -.008 : .053);
    const x = edgeX * r, y = -.122 + (edgeY + .122) * r;
    const broad = 1 + .095 * Math.exp(-(((y / .269 + .4) / .45) ** 2));
    const z = .24 * Math.sqrt(Math.max(0, 1 - (x / (.325 * broad)) ** 2 - (y / .269) ** 2)) + .0018;
    smileVertices.push(x, y, z);
    if (ring < rings && j < segments) {
      const i = ring * (segments + 1) + j, next = i + segments + 1;
      smileIndices.push(i, next, i + 1, i + 1, next, next + 1);
    }
  }
  const smile = new THREE.BufferGeometry();
  smile.setAttribute('position', new THREE.Float32BufferAttribute(smileVertices, 3)); smile.setIndex(smileIndices);
  smile.computeVertexNormals(); mesh('open-smile', smile, mouth, [0, 0, 0], null, head);
  const t = ball('tongue', tongue, [0, -.137, .212], [.023, .012, .006], head); t.rotation.x = -.55;

  tube('sprout-stem', [[-.045, .247, -.016], [-.057, .292, -.014], [-.078, .333, -.007]], .012, green, head);
  for (const [name, start, end, width] of [
    ['sprout-left-leaf', [-.074, .326, -.006], [-.179, .376, .002], .044],
    ['sprout-right-leaf', [-.073, .326, -.006], [-.026, .438, -.005], .047],
  ]) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end); const axis = b.clone().sub(a);
    const leaf = ball(name, green, a.clone().add(b).multiplyScalar(.5).toArray(), [width, axis.length() * .57, .014], head);
    leaf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
    const mid = a.clone().lerp(b, .52); mid.z += .015;
    tube(`${name}-vein`, [a.toArray(), mid.toArray(), b.toArray()], .0017, vein, head);
  }
  root.updateMatrixWorld(true);
  return root;
}
