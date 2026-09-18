import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMapQualityState,sampleMapQuality,MAP_TIERS,mapDprForTier } from '../src/villa-map/map-quality.js';
import { createResortWater,RESORT_POOLS } from '../src/villa-map/resort-water.js';
import { prepareResortModel,batchContactShadows,isOutdoorPrewarmMesh } from '../src/villa-map/resort-assets.js';
import { createShadowBlobs,SHADOW_BLOB_LIFT } from '../src/villa-map/shadows.js';

function glb(name){
  const buffer=fs.readFileSync(new URL(`../public/models/resort/${name}.glb`,import.meta.url));
  const jsonSize=buffer.readUInt32LE(12);
  const json=JSON.parse(buffer.subarray(20,20+jsonSize));
  return {buffer,json,bin:buffer.subarray(28+jsonSize)};
}
async function geometryScene(name){
  const {json,bin}=glb(name);
  // Only image decoding is removed for Node; mesh buffers and scene transforms
  // are loaded by the production GLTFLoader, including the Y-up conversion.
  json.images=[];json.textures=[];
  json.materials=json.materials.map(m=>({name:m.name,doubleSided:m.doubleSided,alphaMode:m.alphaMode}));
  const encoded=Buffer.from(JSON.stringify(json));
  const length=Math.ceil(encoded.length/4)*4;
  const out=Buffer.alloc(28+length+bin.length,32);
  out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(length,12);out.writeUInt32LE(0x4e4f534a,16);encoded.copy(out,20);
  out.writeUInt32LE(bin.length,20+length);out.writeUInt32LE(0x004e4942,24+length);bin.copy(out,28+length);
  return prepareResortModel((await new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'')).scene);
}

test('resort exports embed textures, bounded UV sets and section/material batches',()=>{
  for(const [name,max] of [['villa',35],['springs',15],['mushroom',25]]){
    const {json,buffer}=glb(name);
    assert.ok(json.meshes.length<=max);
    assert.ok(buffer.length<4*1024*1024);
    assert.ok(json.images.length>1);
    for(const image of json.images)assert.ok(Number.isInteger(image.bufferView),'textures are embedded');
    for(const mat of json.materials){
      if(mat.alphaMode==='BLEND')continue;
      assert.ok(mat.occlusionTexture,'opaque surfaces carry baked AO');
      assert.equal(mat.occlusionTexture.texCoord,1,'AO never samples the tiled surface UV');
      assert.equal(mat.pbrMetallicRoughness.baseColorTexture?.texCoord??0,0);
    }
    for(const mesh of json.meshes)for(const p of mesh.primitives){
      assert.ok(p.attributes.POSITION!==undefined);
      assert.equal(p.attributes.TEXCOORD_2,undefined,'no stray primitive default UV layer');
    }
  }
});

test('outdoor prewarm excludes observatory descendants even when their sky projects above ground',()=>{
  const cosmos=new THREE.Group();
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
  mesh.position.y=42;cosmos.add(mesh);cosmos.updateMatrixWorld(true);
  assert.equal(isOutdoorPrewarmMesh(mesh,[cosmos]),false);
  const outdoor=mesh.clone();outdoor.updateMatrixWorld(true);
  assert.equal(isOutdoorPrewarmMesh(outdoor,[cosmos]),true);
  outdoor.position.y=-32;outdoor.updateMatrixWorld(true);
  assert.equal(isOutdoorPrewarmMesh(outdoor,[cosmos]),false);
});

test('architectural GLB roundtrip preserves walkable floors and the stairwell',async()=>{
  const villa=await geometryScene('villa');villa.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(villa);
  assert.ok(bounds.min.x<-13 && bounds.max.x>13);
  assert.ok(bounds.max.y>11 && bounds.max.y<14);
  const down=(x,y,z)=>new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(0,-1,0)).intersectObject(villa,true);
  assert.ok(Math.abs(down(-5,7,0)[0].point.y-6.65)<.03,'upper floor height');
  assert.ok(down(0,7,3)[0].point.y<5,'roof and floor preserve the stair cutout');
  assert.ok(Math.abs(down(-5,1,0)[0].point.y-.1)<.03,'ground timber is flush');
  const entry=new THREE.Raycaster(new THREE.Vector3(0,1.6,16),new THREE.Vector3(0,0,-1),0,8).intersectObject(villa,true);
  assert.equal(entry.length,0,'entry canopy must not obstruct the open doorway');
  villa.traverse(o=>{if(o.material?.transparent)assert.equal(o.castShadow,false);});
});

test('spa basins never put an opaque slab above the water',async()=>{
  const springs=await geometryScene('springs');springs.updateMatrixWorld(true);
  for(const p of RESORT_POOLS){
    const hits=new THREE.Raycaster(new THREE.Vector3(p.x,3,p.z),new THREE.Vector3(0,-1,0)).intersectObject(springs,true);
    assert.ok(hits.length>0,'basin has a bottom');
    assert.ok(hits[0].point.y<p.y-.1,'centre is a real recessed basin');
  }
  const water=createResortWater();
  assert.equal(water.children.filter(o=>o.name.startsWith('resort-water-')).length,3);
  for(const mesh of water.children.filter(o=>o.name.startsWith('resort-water-'))){
    assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.depthWrite,true);
  }
  water.userData.update(10,3);assert.equal(water.getObjectByName('resort-steam').count,3);
  water.userData.update(10,0);assert.equal(water.getObjectByName('resort-steam').visible,false);
});

test('mushroom exterior retains its footprint and reachable south-facing portal',async()=>{
  const house=await geometryScene('mushroom');
  house.position.set(-6,0,18);house.rotation.y=Math.PI;house.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(house);
  assert.ok(bounds.max.y>10 && bounds.max.y<12,'original overall height');
  assert.ok(bounds.max.x-bounds.min.x>13 && bounds.max.x-bounds.min.x<15,'original canopy footprint');
  const doorRay=new THREE.Raycaster(new THREE.Vector3(-6,1.8,26),new THREE.Vector3(0,0,-1),0,4);
  const hit=doorRay.intersectObject(house,true)[0];
  assert.ok(hit && hit.point.z>23 && hit.point.z<24,'door remains at the existing interaction');
  const approach=new THREE.Raycaster(new THREE.Vector3(-6,1.6,30),new THREE.Vector3(0,0,-1),0,6);
  assert.equal(approach.intersectObject(house,true).length,0,'clear approach to the portal');
});

test('authored mushroom windows face the curved stem with plaster directly behind their frames', async () => {
  const house = await geometryScene('mushroom');
  house.updateMatrixWorld(true);
  const meshes = [];
  house.traverse(o => { if (o.isMesh && o.userData.zone === 'stem') meshes.push(o); });
  const glazing = meshes.find(o => o.material.name === 'Honey window glass');
  const plaster = meshes.find(o => o.material.name === 'Warm mineral plaster');
  const frame = meshes.find(o => o.material.name === 'Walnut joinery');
  assert.ok(glazing && plaster && frame, 'test the shipped GLB, not the procedural fallback');
  for (const side of [-1, 1]) {
    const angle = side * 55 * Math.PI / 180;
    const normal = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle));
    const tangent = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const ray = (u, y) => {
      const origin = normal.clone().multiplyScalar(8).addScaledVector(tangent, u);
      origin.y = y;
      return new THREE.Raycaster(origin, normal.clone().negate());
    };
    for (const [u, y] of [[-.3, 2.55], [.3, 2.55], [-.3, 3.05], [.3, 3.05]]) {
      const r = ray(u, y), glassHit = r.intersectObject(glazing)[0], wallHit = r.intersectObject(plaster)[0];
      assert.ok(glassHit && wallHit, 'glazing and its wall align along the outward direction');
      const gap = wallHit.distance - glassHit.distance;
      assert.ok(gap > .08 && gap < .42, `glass sits just in front of the wall, gap=${gap}`);
      const glassNormal = glassHit.face.normal.clone().transformDirection(glazing.matrixWorld);
      assert.ok(glassNormal.dot(normal) > .9, 'window turns with the curved wall');
    }
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const r = ray(.82 * Math.cos(a), 2.8 + .82 * Math.sin(a));
      const trimHit = r.intersectObject(frame)[0], supportHit = r.intersectObject(plaster)[0];
      assert.ok(trimHit && supportHit, 'continuous plaster collar supports every edge of the round frame');
      const gap = supportHit.distance - trimHit.distance;
      assert.ok(gap >= -.01 && gap < .14, `no unsupported frame edge, gap=${gap}`);
    }
  }
});

test('contact-shadow batching preserves geometry, rotations, floors and opt-outs',()=>{
  const placements=[{id:'a',position:[4,0,2],rotationY:Math.PI/3,footprint:{x:2,z:1}},
    {id:'b',position:[-3,0,4],footprint:{x:1,z:2}},
    {id:'c',position:[1,-32,18],footprint:{x:2,z:2}},
    {id:'rug',position:[0,0,0],noShadow:true}];
  const root=createShadowBlobs(placements);
  root.updateMatrixWorld(true);
  const before=[];root.traverse(o=>{if(o.isMesh){const g=o.geometry.clone().applyMatrix4(o.matrixWorld);before.push(...g.attributes.position.array);g.dispose();}});
  batchContactShadows(root);
  assert.equal(root.children.length,2);
  const after=root.children.flatMap(o=>Array.from(o.geometry.attributes.position.array));
  assert.deepEqual(after,before);
  const b=new THREE.Box3().setFromObject(root.children[1]);
  assert.ok(Math.abs(b.min.y-(-32+SHADOW_BLOB_LIFT))<.00001);
});

test('map Auto ignores isolated stalls and suspensions but responds to sustained load',()=>{
  const state=createMapQualityState();state.warmup=0;
  const feed=(seconds,delta)=>{for(let i=0;i<seconds/delta;i++)sampleMapQuality(state,delta);};
  feed(2,1/60);sampleMapQuality(state,.1);feed(2,1/60);
  assert.equal(state.tier,'medium');
  feed(4.3,1/25);assert.equal(state.tier,'low');
  const tier=state.tier;sampleMapQuality(state,2);sampleMapQuality(state,.04,false);
  assert.equal(state.tier,tier);
  feed(10,1/60);assert.equal(state.tier,'low','recovery has a long dwell');
  feed(25,1/60);assert.equal(state.tier,'medium');
  assert.equal(MAP_TIERS.minimum.shadowSize,0);assert.equal(MAP_TIERS.minimum.steam,0);
});

test('Canvas and runtime share the same DPR calculation, including browser zoom below one',()=>{
  assert.equal(mapDprForTier('medium',1.5),1.25);
  assert.equal(mapDprForTier('high',3),1.8);
  assert.equal(mapDprForTier('minimum',.5),.5);
  assert.equal(mapDprForTier('low',NaN),1);
  const canvas=fs.readFileSync(new URL('../src/villa-map/react/VillaMap.jsx',import.meta.url),'utf8');
  assert.match(canvas,/dpr=\{mapDprForTier\(mapQuality, window\.devicePixelRatio\)\}/);
});
