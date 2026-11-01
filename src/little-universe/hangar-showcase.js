// Node-pure configuration and material adaptation for the single-exhibit study.
import * as THREE from 'three';
import { fitCollectionModel } from './collection-models.js';

export const SHOWCASE_MODEL = 'reborns-gundam';
export const PEDESTAL_TOP = .38;
export const SHOWCASE_SIZE = [4.8, 5, 3.6];
export const CAMERA_VIEWS = {
  hero: { position: [7.2, 4.4, 14.6], target: [0, 2.7, 0] },
  front: { position: [0, 3.6, 15.8], target: [0, 2.7, 0] },
  detail: { position: [3.8, 4.4, 8.6], target: [0, 3.65, 0] },
};
export function showcasePose(view, aspect = 1.6) {
  const pose = CAMERA_VIEWS[view] || CAMERA_VIEWS.hero;
  const target = new THREE.Vector3(...pose.target);
  const position = new THREE.Vector3(...pose.position);
  // Preserve the full silhouette on portrait screens without widening perspective.
  position.sub(target).multiplyScalar(Math.max(1, .68 / Math.max(.25, aspect))).add(target);
  return { position, target };
}

export function prepareShowcaseModel(source, size = SHOWCASE_SIZE, rotation = [0, 0, 0]) {
  const root = fitCollectionModel(source, size, rotation);
  const materials = new Set();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    const adapt = original => {
      const material = original.clone();
      material.envMapIntensity = .8;
      // Keep the supplied normal/ORM maps and all UV transforms. The one-atlas
      // source has no semantic part IDs: use a conservative finish mask only.
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
          #include <roughnessmap_fragment>
          float finishMax = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
          float finishMin = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          float neutralFinish = 1.0 - smoothstep(0.06, 0.22, finishMax - finishMin);
          float armorFinish = smoothstep(0.18, 0.55, finishMin) * neutralFinish;
          roughnessFactor = mix(clamp(roughnessFactor, 0.28, 0.65), 0.4, armorFinish * 0.7);
        `).replace('#include <metalnessmap_fragment>', `
          #include <metalnessmap_fragment>
          metalnessFactor = mix(clamp(metalnessFactor, 0.25, 0.78), 0.12, armorFinish);
        `);
      };
      material.customProgramCacheKey = () => 'hangar-collectible-finish-v2';
      materials.add(material); return material;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(adapt) : adapt(mesh.material);
  });
  let disposed = false;
  return { root, dispose() { if (disposed) return; disposed = true; materials.forEach(m => m.dispose()); } };
}
