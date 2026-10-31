import * as THREE from 'three';
import { createGarden, createLandmark, surfaceFrame } from '../little-universe/planet.js';
import { landmarkLayout as landmarks } from '../little-universe/landmark-layout.js';
import { batchMiniature } from '../little-universe/miniature.js';
import { SKY_PLANET_POSITION, SKY_PLANET_SCALE, TELESCOPE_POSITION, UNIVERSE_GATEWAY_ID } from './little-universe-gateway.js';

// Reuse the authored layout and every part, with distant-only tessellation.
// The birthday Canvas, model viewers, audio and GLBs remain separate.
export function createSkyPlanet() {
  const root = new THREE.Group();
  const globe = new THREE.Mesh(new THREE.SphereGeometry(2.5, 48, 32), new THREE.MeshStandardMaterial({ color: '#a9c6ae', roughness: .96 }));
  root.add(globe, createGarden({ distant: true }));
  for (const place of landmarks) {
    const model = createLandmark(place.id, { distant: true });
    const frame = surfaceFrame(place.direction);
    model.position.copy(frame.position); model.quaternion.copy(frame.quaternion);
    root.add(model);
  }
  const pond = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: '#91bfc0', roughness: .3 }));
  const frame = surfaceFrame([-.62, -.04, .78], 2.475);
  pond.position.copy(frame.position); pond.quaternion.copy(frame.quaternion); pond.scale.set(.43, .075, .7); root.add(pond);
  // Bake each authored colour into vertices, then batch by surface finish.
  // Three finishes preserve the globe, garden/buildings and glossy pond without
  // paying a draw call per paint colour. The transparent ring stays separate.
  const finishes = new Map(); const sourceMaterials = new Set();
  // Ground fog would erase the faraway planet. A light sky-colour wash gives
  // it aerial perspective while keeping the miniature silhouette readable.
  const skyHaze = new THREE.Color('#a8c4e4');
  root.traverse(object => {
    if (!object.isMesh) return;
    const source = object.material;
    sourceMaterials.add(source);
    const color = source.color.clone().lerp(skyHaze, .28);
    const colors = new Float32Array(object.geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    object.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const key = `${source.roughness}:${source.metalness}`;
    if (!finishes.has(key)) {
      const material = new THREE.MeshStandardMaterial({
        color: '#ffffff', vertexColors: true, roughness: source.roughness,
        metalness: source.metalness, emissive: '#ffffff', emissiveIntensity: .025, fog: false
      });
      // The courtyard's strong hemisphere/IBL fill flattens a distant globe.
      // Keep the existing sun and surface normals, but soften only this
      // miniature's indirect light so its night side retains a rounded shape.
      material.onBeforeCompile = shader => {
        // StandardMaterial applies vertex colour to diffuse, not emissive.
        // Restore the previous per-colour emissive fill on the night side too.
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;'
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          reflectedLight.indirectDiffuse *= 0.28;
          reflectedLight.indirectSpecular *= 0.28;`
        );
      };
      material.customProgramCacheKey = () => 'little-universe-sky-vertex-fill-v2';
      finishes.set(key, material);
    }
    object.material = finishes.get(key);
  });
  sourceMaterials.forEach(material => material.dispose());
  const planet = batchMiniature(root);
  planet.name = 'little-universe-sky-planet';
  planet.userData.landmarks = landmarks.map(place => place.id);
  planet.rotation.set(.68, -.65, -.08);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5, .018, 6, 120), new THREE.MeshBasicMaterial({ color: '#c6d1dc', transparent: true, opacity: .45, fog: false }));
  ring.rotation.set(1.2, .18, -.4); planet.add(ring);
  planet.traverse(object => { object.castShadow = false; object.receiveShadow = false; });
  planet.position.set(...SKY_PLANET_POSITION); planet.scale.setScalar(SKY_PLANET_SCALE);
  return planet;
}

export function createUniverseTelescope() {
  const root = new THREE.Group(); root.name = UNIVERSE_GATEWAY_ID;
  const brass = new THREE.MeshStandardMaterial({ color: '#bd9963', metalness: .65, roughness: .34 });
  const dark = new THREE.MeshStandardMaterial({ color: '#354f4b', metalness: .3, roughness: .5 });
  const wood = new THREE.MeshStandardMaterial({ color: '#92745b', roughness: .85 });
  const glass = new THREE.MeshStandardMaterial({ color: '#91c7cb', metalness: .65, roughness: .15, emissive: '#397779', emissiveIntensity: .25 });
  const up = new THREE.Vector3(0, 1, 0);
  function rod(a, b, radius, material) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 20), material);
    mesh.position.copy(start.add(end).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(up, delta.normalize()); root.add(mesh); return mesh;
  }
  const pivot = [0, 1.42, 0];
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + .35; rod([Math.sin(a) * .62, .09, Math.cos(a) * .62], [0, 1.28, 0], .05, wood); }
  rod([0, .9, 0], pivot, .095, brass);
  const direction = new THREE.Vector3(...SKY_PLANET_POSITION).sub(new THREE.Vector3(TELESCOPE_POSITION.x, 1.42, TELESCOPE_POSITION.z)).normalize();
  const at = distance => new THREE.Vector3(...pivot).addScaledVector(direction, distance).toArray();
  rod(at(-.47), at(.59), .16, dark);
  rod(at(.47), at(.62), .19, brass);
  rod(at(-.5), at(-.38), .18, brass);
  rod(at(-.67), at(-.48), .075, dark);
  rod(at(.62), at(.635), .163, glass);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.16, .08, 48), new THREE.MeshStandardMaterial({ color: '#d6c9b1', roughness: .9 }));
  base.position.y = .05; root.add(base);
  root.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  root.position.set(TELESCOPE_POSITION.x, 0, TELESCOPE_POSITION.z);
  return root;
}
