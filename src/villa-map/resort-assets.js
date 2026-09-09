import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three';

export function isOutdoorPrewarmMesh(object, excludedRoots = []) {
  if (!object.isMesh || object.matrixWorld.elements[13] < -20) return false;
  for (let parent = object; parent; parent = parent.parent) {
    if (excludedRoots.includes(parent)) return false;
    if (parent.userData.assetState === 'loading') return false;
  }
  return !object.name.includes('placeholder');
}

// The buried mushroom pocket is the mirror image: only meshes below the meadow
// qualify, observatory roots stay excluded, and anything driven by a custom
// shader is left to the observatory runtime (the pocket's furniture, joinery,
// slabs and lights-on finishes are all ordinary material programs).
export function isPocketPrewarmMesh(object, excludedRoots = []) {
  if (!object.isMesh || object.matrixWorld.elements[13] >= -20) return false;
  for (let parent = object; parent; parent = parent.parent) {
    if (excludedRoots.includes(parent)) return false;
    if (parent.userData.assetState === 'loading') return false;
  }
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  if (materials.some((m) => !m || m.isShaderMaterial || m.isRawShaderMaterial)) return false;
  return !object.name.includes('placeholder');
}

// Flatten only the contact decals, grouped by physical floor. The original
// factory remains useful for editing / geometry tests; runtime draws five batches.
export function batchContactShadows(root) {
  root.updateMatrixWorld(true);
  const buckets=new Map();
  const oldGeometry=new Set(),oldMaterials=new Set();
  root.traverse(mesh=>{
    if(!mesh.isMesh) return;
    const floor=Math.round(mesh.matrixWorld.elements[13]);
    if(!buckets.has(floor)) buckets.set(floor,[]);
    buckets.get(floor).push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
    oldGeometry.add(mesh.geometry); oldMaterials.add(mesh.material);
  });
  const material=oldMaterials.values().next().value;
  root.clear();
  for(const [floor,geometries] of buckets) {
    const geometry=mergeGeometries(geometries);
    geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=`contact-shadows-floor-${floor}`;
    mesh.renderOrder=-1;
    root.add(mesh);
  }
  oldGeometry.forEach(g=>g.dispose());
  oldMaterials.forEach(m=>{if(m!==material)m.dispose();});
  return root;
}

export function prepareResortModel(model) {
  // Assets are authored in the world's metre coordinates. Never bbox-fit an
  // architectural shell: doing so would move floors and the stair opening.
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    mesh.castShadow=materials.every(m=>!m.transparent);
    mesh.receiveShadow=true;
    materials.forEach(m=>{ if(m.transparent) m.depthWrite=false; });
  });
  return model;
}

export function disposeOwnedObject(root) {
  const geometries=new Set(),materials=new Set();
  root.traverse(o=>{ if(o.geometry)geometries.add(o.geometry);
    for(const m of (Array.isArray(o.material)?o.material:[o.material])) if(m)materials.add(m); });
  geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose());
}
