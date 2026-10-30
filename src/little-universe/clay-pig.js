// Texture-free clay sculpt. Y is up and +Z is the face; all dimensions are metres.
import * as THREE from 'three';

export function sculptClayPig(s) {
  const skin = '#f2b7aa', rose = '#e58f91', hair = '#d88b82';
  const cloth = '#393940', trim = '#505058', ink = '#33272d';
  const ball = (color, at, scale) => s.mesh(new THREE.SphereGeometry(1, 32, 24), color, at, scale);
  const stroke = (color, points, radius) => s.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 24, radius, 8, false), color);

  // A squat hoodie, with a generous hood visible from the side and back.
  ball(cloth, [0, .133, 0], [.135, .112, .098]);
  ball(trim, [0, .222, -.044], [.138, .052, .085]);
  ball(cloth, [0, .23, -.025], [.12, .036, .071]);
  ball(trim, [0, .057, .004], [.12, .021, .089]);
  ball(cloth, [0, .062, .007], [.12, .015, .091]);

  // Broad cheeks are part of one smooth head, rather than stuck-on spheres.
  const head = new THREE.SphereGeometry(1, 48, 32);
  const vertices = head.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const y = vertices.getY(i);
    vertices.setX(i, vertices.getX(i) * (1 + .1 * Math.exp(-(((y + .35) / .42) ** 2))));
  }
  head.computeVertexNormals();
  s.mesh(head, skin, [0, .337, .012], [.156, .137, .122]);

  for (const side of [-1, 1]) {
    // Soft tapered ear lobes, not cones; the inset sits on their forward surface.
    const ear = ball(skin, [side * .158, .416, -.006], [.069, .043, .028]);
    ear.rotation.z = side * .55;
    const inner = ball(rose, [side * .165, .418, .014], [.046, .026, .012]);
    inner.rotation.z = side * .55;
    const sleeve = ball(cloth, [side * .119, .138, .025], [.049, .067, .055]);
    sleeve.rotation.z = side * .28;
    ball(trim, [side * .111, .115, .068], [.034, .031, .019]);
    ball(skin, [side * .106, .116, .081], [.025, .025, .021]);
    ball(skin, [side * .067, .034, .019], [.043, .033, .049]);
    for (const toe of [-1, 1]) ball('#be827c', [side * .067 + toe * .014, .014, .052], [.019, .014, .024]);

    const eye = ball(ink, [side * .057, .354, .125], [.012, .017, .007]);
    eye.material.roughness = .28;
    ball('#fff6e9', [side * .057 - .0035, .36, .131], [.0034, .0042, .002]);
    const cheek = ball('#e99e9c', [side * .104, .313, .111], [.026, .013, .005]);
    cheek.rotation.y = side * .45;
    stroke(hair, [[side * .045, .388, .12], [side * .055, .394, .117], [side * .064, .391, .114]], .003);
    stroke(trim, [[side * .029, .216, .076], [side * .035, .179, .094], [side * .032, .151, .099]], .003);
    ball(trim, [side * .032, .147, .1], [.005, .008, .005]);
  }

  ball(rose, [0, .328, .139], [.052, .034, .026]);
  for (const side of [-1, 1]) ball('#a75d67', [side * .019, .331, .163], [.0065, .01, .003]);
  ball('#713d49', [0, .279, .127], [.014, .015, .004]);
  ball('#e8979b', [0, .273, .131], [.009, .005, .002]);
  const pocket = s.box(trim, [0, .09, .089], [.085, .036, .016]);
  pocket.rotation.x = -.12;

  // Five broad swept locks keep the silhouette readable at campsite scale.
  ball(hair, [0, .445, -.018], [.132, .045, .1]);
  for (const [x, y, z, rx, ry, rz, turn] of [
    [-.091, .443, .047, .045, .027, .07, -.55],
    [-.052, .455, .068, .04, .029, .075, -.4],
    [-.006, .462, .067, .041, .032, .078, -.3],
    [.04, .459, .055, .042, .031, .073, -.25],
    [.083, .447, .038, .039, .028, .061, -.25],
  ]) {
    const lock = ball(hair, [x, y, z], [rx, ry, rz]);
    lock.rotation.y = turn; lock.rotation.x = -.32;
  }
  const hoop = s.mesh(new THREE.TorusGeometry(.019, .0045, 12, 40), '#d9ac55', [-.188, .384, .018]);
  hoop.material.metalness = .65; hoop.material.roughness = .26;
  stroke(skin, [[0, .068, -.085], [.016, .078, -.113], [.027, .096, -.117], [.014, .108, -.119], [.001, .099, -.12], [.009, .089, -.122]], .006);
}
