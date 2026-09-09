import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMaterials, createModernVilla, createTieredHotSprings, createMushroomHouse } from '../assets.js';
import { prepareResortModel, disposeOwnedObject } from '../resort-assets.js';
import { trackAssetLoad } from '../asset-loading.js';
import { getGpuPreparer } from './gpu-prepare.js';

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
  const get=useThree(s=>s.get);
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
    // Texture uploads go through the canvas-wide one-per-frame queue and shader
    // programs compile asynchronously before the swap, so the authored shell
    // never lands on a frame that also pays its first-use GPU cost. The chain
    // is reported to the loading veil's progress registry.
    const prepare=getGpuPreparer(get);
    trackAssetLoad(sourcePromise.then(async source=>{
      if(cancelled)return;
      const model=source.clone(true);
      await prepare(model);
      if(cancelled)return;
      root.remove(fallback); disposeFallback(); root.add(model);
      root.userData.assetState='ready'; gl.shadowMap.needsUpdate=true;
    })).catch(error=>{
      if(cancelled)return;
      root.userData.assetState='fallback';
      console.warn(`Resort ${kind} asset unavailable; using procedural fallback.`,error);
    });
    return()=>{cancelled=true;root.clear();disposeFallback();};
  },[kind,root,gl,get]);
  return <primitive object={root} position={position} rotation-y={rotationY} dispose={null} />;
}
