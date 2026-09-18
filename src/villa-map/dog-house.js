import * as THREE from 'three';

// A hollow kennel, authored facing local -Z. Roof halves meet at one ridge;
// their lengths are the slope length, not the width of the whole building.
export function createDogHouse(materials) {
  const root = new THREE.Group();
  root.name = 'dog-house';
  const siding = materials.dogHouse.clone();
  siding.color.set('#d5b579');
  siding.roughness = .9;
  const inside = materials.wood.clone();
  inside.color.set('#745339');
  const add = (name, geometry, material, position = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const box = (name, size, position, material) => add(name, new THREE.BoxGeometry(...size), material, position);

  box('dog-house-floor', [2.4, .12, 2.2], [0, .06, 0], inside);
  for (const side of [-1, 1]) {
    box(`dog-house-side-${side}`, [.16, 1.38, 2.2], [side * 1.12, .81, 0], siding);
  }
  const gable = new THREE.Shape();
  gable.moveTo(-1.2, .12);
  gable.lineTo(-1.2, 1.5);
  gable.lineTo(0, 2.1);
  gable.lineTo(1.2, 1.5);
  gable.lineTo(1.2, .12);
  gable.closePath();
  const extrusion = { depth: .16, bevelEnabled: false, curveSegments: 24 };
  add('dog-house-back', new THREE.ExtrudeGeometry(gable, extrusion), siding, [0, 0, .94]);

  // The doorway is a concave boundary open to the floor, not a dark decal on
  // an opaque box. Its curved header and jambs leave the interior visible.
  const front = new THREE.Shape();
  front.moveTo(-1.2, .12);
  front.lineTo(-1.2, 1.5);
  front.lineTo(0, 2.1);
  front.lineTo(1.2, 1.5);
  front.lineTo(1.2, .12);
  front.lineTo(.5, .12);
  front.lineTo(.5, .78);
  front.absarc(0, .78, .5, 0, Math.PI, false);
  front.lineTo(-.5, .12);
  front.closePath();
  add('dog-house-front', new THREE.ExtrudeGeometry(front, extrusion), siding, [0, 0, -1.1]);
  add('dog-house-door-arch', new THREE.TorusGeometry(.55, .055, 6, 32, Math.PI),
    materials.wood, [0, .78, -1.14]);
  for (const side of [-1, 1]) {
    box(`dog-house-door-jamb-${side}`, [.11, .66, .12], [side * .55, .45, -1.14], materials.wood);
    for (const z of [-1.13, 1.13]) {
      box(`dog-house-corner-${side}-${z}`, [.13, 1.42, .12], [side * 1.17, .81, z], materials.wood);
    }
  }
  box('dog-house-threshold', [1.18, .08, .36], [0, .12, -1.17], materials.wood);

  const halfWidth = 1.4, eave = 1.48, ridge = 2.18;
  const rise = ridge - eave, pitch = Math.atan2(rise, halfWidth);
  for (const side of [-1, 1]) {
    const roof = box(`dog-house-roof-${side}`, [Math.hypot(halfWidth, rise), .14, 2.68],
      [side * halfWidth / 2, (eave + ridge) / 2, 0], materials.roof);
    roof.rotation.z = -side * pitch;
    for (const z of [-1.36, 1.36]) {
      const fascia = box(`dog-house-fascia-${side}-${z}`, [Math.hypot(halfWidth, rise), .15, .12],
        [side * halfWidth / 2, (eave + ridge) / 2, z], materials.wood);
      fascia.rotation.z = -side * pitch;
    }
  }
  box('dog-house-ridge', [.16, .14, 2.84], [0, ridge + .035, 0], materials.roof);
  return root;
}
