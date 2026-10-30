// Convert the author's FBX locally using the installed Three.js pipeline.
// Usage: node scripts/import-cessna.mjs <fbx> <extracted Blender texture directory> [AO texture]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { LoadingManager, Texture, MeshStandardMaterial, Vector3 } from 'three';

const [input, textures, aoPath] = process.argv.slice(2);
if (!input || !textures) throw new Error('Pass the FBX and extracted Blender texture directory.');
// The exporter only needs Blob-to-ArrayBuffer support; image encoding uses sharp.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
};
const manager = new LoadingManager();
manager.addHandler(/.*/, { load: () => new Texture(), setPath() { return this; } });
const source = fs.readFileSync(input);
const scene = new FBXLoader(manager).parse(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), '');
// LOD0 and LOD1 are coincident alternatives, never render both.
const lowerLod = scene.getObjectByName('CESSNA172-BASE_LOD1');
if (!lowerLod) throw new Error('Expected source LOD structure changed.');
lowerLod.removeFromParent();
scene.updateMatrixWorld(true);
const body = new MeshStandardMaterial({ name: 'Cessna painted airframe' });
const glass = new MeshStandardMaterial({ name: 'Cessna cockpit glass' });
const meshReport = [];
scene.traverse(mesh => {
  if (!mesh.isMesh) return;
  const originalName = mesh.name;
  const worldPosition = mesh.getWorldPosition(new Vector3()).multiplyScalar(.01);
  mesh.geometry.applyMatrix4(mesh.matrixWorld).scale(.01, .01, .01);
  mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1);
  // This separate mesh contains the source propeller/spinner, centered on its shaft.
  if (originalName === 'CESSNA172002') {
    mesh.geometry.translate(-worldPosition.x, -worldPosition.y, -worldPosition.z);
    mesh.position.copy(worldPosition); mesh.name = 'cessna-propeller';
  }
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.name.endsWith('-GLASS') ? glass : body) : body;
  meshReport.push({ sourceName: originalName, runtimeName: mesh.name, triangles: mesh.geometry.attributes.position.count / 3 });
});
const raw = Buffer.from(await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true }));
const jsonLength = raw.readUInt32LE(12);
const json = JSON.parse(raw.subarray(20, 20 + jsonLength));
const oldBinLength = raw.readUInt32LE(20 + jsonLength);
const chunks = [raw.subarray(28 + jsonLength, 28 + jsonLength + oldBinLength)];
let cursor = oldBinLength;
json.images = []; json.textures = [];
json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
async function channel(name, size) {
  return sharp(path.join(textures, `CSSNA172_SKIN0_${name}.png`)).resize(size, size).extractChannel(0).raw().toBuffer();
}
async function embed(bytes) {
  const padding = (4 - cursor % 4) % 4;
  chunks.push(Buffer.alloc(padding)); cursor += padding;
  const view = json.bufferViews.length;
  json.bufferViews.push({ buffer: 0, byteOffset: cursor, byteLength: bytes.length });
  chunks.push(bytes); cursor += bytes.length;
  const index = json.images.length;
  json.images.push({ bufferView: view, mimeType: 'image/webp' });
  json.textures.push({ sampler: 0, extensions: { EXT_texture_webp: { source: index } } });
  return index;
}
const color = await sharp(path.join(textures, 'CSSNA172_SKIN0_BaseColor.png')).resize(2048, 2048).removeAlpha().raw().toBuffer();
const alpha = await channel('Alpha', 2048);
const rgba = Buffer.alloc(2048 * 2048 * 4);
for (let i = 0; i < alpha.length; i++) { color.copy(rgba, i * 4, i * 3, i * 3 + 3); rgba[i * 4 + 3] = alpha[i]; }
// Equivalent to GLTFExporter's flipY conversion for FBX textures.
const base = await embed(await sharp(rgba, {raw:{width:2048,height:2048,channels:4}}).flip().webp({quality:88,alphaQuality:100}).toBuffer());
const rough = await channel('Roughness', 1024); const metal = await channel('Metallic', 1024);
const ao = aoPath ? await sharp(aoPath).resize(1024,1024).extractChannel(0).raw().toBuffer() : null;
const orm = Buffer.alloc(1024 * 1024 * 3);
for (let i = 0; i < rough.length; i++) { orm[i*3] = ao ? ao[i] : 255; orm[i*3+1] = rough[i]; orm[i*3+2] = metal[i]; }
const packed = await embed(await sharp(orm,{raw:{width:1024,height:1024,channels:3}}).flip().webp({quality:90}).toBuffer());
const normal = await embed(await sharp(path.join(textures,'CSSNA172_SKIN0_Normal.png')).resize(1024,1024).flip().webp({quality:92}).toBuffer());
for (const material of json.materials) {
  material.pbrMetallicRoughness = { baseColorTexture:{index:base}, metallicRoughnessTexture:{index:packed}, metallicFactor:1, roughnessFactor:1 };
  material.normalTexture = {index:normal};
  if (ao) material.occlusionTexture = {index:packed, strength: .8};
  if (material.name.includes('glass')) { material.alphaMode='BLEND'; material.doubleSided=true; }
}
json.extensionsUsed = [...new Set([...(json.extensionsUsed || []),'EXT_texture_webp'])];
json.extensionsRequired = [...new Set([...(json.extensionsRequired || []),'EXT_texture_webp'])];
json.buffers[0].byteLength = cursor;
const data = Buffer.concat(chunks); const encoded = Buffer.from(JSON.stringify(json));
const jl = Math.ceil(encoded.length/4)*4; const bl = Math.ceil(data.length/4)*4;
const glb = Buffer.alloc(28+jl+bl);
glb.writeUInt32LE(0x46546c67,0); glb.writeUInt32LE(2,4); glb.writeUInt32LE(glb.length,8);
glb.writeUInt32LE(jl,12); glb.writeUInt32LE(0x4e4f534a,16); glb.fill(32,20,20+jl); encoded.copy(glb,20);
glb.writeUInt32LE(bl,20+jl); glb.writeUInt32LE(0x004e4942,24+jl); data.copy(glb,28+jl);
const intermediate = '.git/cessna-source/cessna-unpacked.glb';
const output = 'public/little-universe/models/cessna-172.glb';
fs.writeFileSync(intermediate,glb);
execFileSync(process.execPath,['node_modules/gltfpack/cli.js','-i',intermediate,'-o',output,'-cc','-kn','-km'],{stdio:'inherit'});
const runtime = fs.readFileSync(output);
const manifestPath = 'public/little-universe/models/sources.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath));
const record = {id:'cessna-172',source:path.basename(input),sourceBytes:source.length,sourceSha256:createHash('sha256').update(source).digest('hex'),runtimeBytes:runtime.length,sha256:createHash('sha256').update(runtime).digest('hex'),simplificationRatio:1,textureArchive:'4K+BLENDER+PRINCIPLED+BSDF.rar',aoArchive:aoPath ? '4K+PBR+METALLIC+ROUGHNESS.rar' : null,livery:'CSSNA172_SKIN0',textureSizes:{baseColorAlpha:2048,metallicRoughness:1024,normal:1024},removedMesh:'CESSNA172-BASE_LOD1',meshes:meshReport};
manifest.models = manifest.models.filter(m=>m.id!=='cessna-172'); manifest.models.push(record);
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(record,null,2));
