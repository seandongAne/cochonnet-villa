import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMaterials, createModernVilla, createTieredHotSprings, createMushroomHouse } from '../assets.js';
import { prepareResortModel, disposeOwnedObject } from '../resort-assets.js';

// Immutable cached sources. Instances share GPU resources; cleanup
// detaches them, and disposes only the independently owned procedural fallback.
const cache=new Map();
function load(url) {
  if(!cache.has(url)) {
    const promise=new GLTFLoader().loadAsync(url).then(gltf=>prepareResortModel(gltf.scene));
    cache.set(url,promise);
    promise.catch(()=>{if(cache.get(url)===promise)cache.delete(url);});
  }
  return cache.get(url);
}

export function ResortAsset({kind,position,rotationY=0}) {
  const root=useMemo(()=>new Group(),[]);
  const gl=useThree(s=>s.gl);
  const scene=useThree(s=>s.scene);
  const camera=useThree(s=>s.camera);
  useEffect(()=>{
    let cancelled=false, fallbackDisposed=false;
    const factories={villa:createModernVilla,springs:createTieredHotSprings,mushroom:createMushroomHouse};
    const fallback=factories[kind](createMaterials());
    root.name=`resort-asset-${kind}`;
    root.userData.assetState='loading'; root.add(fallback);
    const disposeFallback=()=>{if(!fallbackDisposed){disposeOwnedObject(fallback);fallbackDisposed=true;}};
    const params=new URLSearchParams(window.location.search);
    const forceFallback=['test','perf'].includes(params.get('observatory')) && params.get('resortassets')==='fallback';
    const sourcePromise=forceFallback?Promise.reject(new Error('QA fallback requested')):load(`/models/resort/${kind}.glb`);
    sourcePromise.then(async source=>{
      if(cancelled)return;
      const model=source.clone(true);
      const textures=new Set();
      model.traverse(o=>{
        for(const m of (Array.isArray(o.material)?o.material:[o.material])){
          if(m)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
        }
      });
      // Spread first GPU uploads across frames. The timeout also makes progress
      // in throttled background QA tabs where requestAnimationFrame is stalled.
      for(const texture of textures){
        if(cancelled)return;
        gl.initTexture(texture);
        await new Promise(resolve=>{
          const timer=window.setTimeout(resolve,40);
          window.requestAnimationFrame(()=>{window.clearTimeout(timer);resolve();});
        });
      }
      // Async shader preparation reduces first-visible compilation stalls.
      if(gl.compileAsync) await gl.compileAsync(model,camera,scene);
      if(cancelled)return;
      root.remove(fallback); disposeFallback(); root.add(model);
      root.userData.assetState='ready'; gl.shadowMap.needsUpdate=true;
    }).catch(error=>{
      if(cancelled)return;
      root.userData.assetState='fallback';
      console.warn(`Resort ${kind} asset unavailable; using procedural fallback.`,error);
    });
    return()=>{cancelled=true;root.clear();disposeFallback();};
  },[kind,root,gl,scene,camera]);
  return <primitive object={root} position={position} rotation-y={rotationY} dispose={null} />;
}
