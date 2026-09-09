// Spatial reference only: Blender reauthors the finish and landscape offline.
import fs from 'node:fs';
import { createMaterials, createModernVilla, createTieredHotSprings } from '../src/villa-map/assets.js';
const materials = createMaterials();
const keys = new Map(Object.entries(materials).map(([key, mat]) => [mat, key]));
const output = { villa: [], baseline: {} };
for (const [name, object] of [['villa', createModernVilla(materials)], ['springs', createTieredHotSprings(materials)]]) {
  object.updateMatrixWorld(true);
  const stats = { meshes: 0, triangles: 0, shadowCasters: 0, transparent: 0 };
  object.traverse(mesh => {
    if (!mesh.isMesh) return;
    stats.meshes++;
    stats.triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    stats.shadowCasters += Number(mesh.castShadow);
    stats.transparent += Number(mesh.material.transparent);
    if (name !== 'villa') return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    output.villa.push({ name: mesh.name, material: keys.get(mesh.material),
      position: Array.from(geometry.attributes.position.array),
      index: geometry.index ? Array.from(geometry.index.array) : null });
    geometry.dispose();
  });
  output.baseline[name] = stats;
}
fs.mkdirSync('art/resort', { recursive: true });
fs.writeFileSync('art/resort/spatial-reference.json', JSON.stringify(output));
console.log(output.baseline);
