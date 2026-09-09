import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MAP_TIERS,createMapQualityState,sampleMapQuality,mapDprForTier } from '../map-quality.js';

export function MapRenderBudget({sunRef,water,preference,onQualityChange,editMode,suspended}){
  const get=useThree(s=>s.get);
  const state=useRef(createMapQualityState());
  const active=useRef(null),elapsed=useRef(0),signature=useRef('');
  const qa=useMemo(()=>{
    const params=new URLSearchParams(window.location.search);
    const mode=params.get('observatory');
    return ['test','perf'].includes(mode)?{mode,tier:params.get('mapquality'),shadows:params.get('mapshadows')}:null;
  },[]);
  const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
  useEffect(()=>{
    const {gl}=get();const previous=gl.shadowMap.autoUpdate;
    const restore=()=>{gl.shadowMap.needsUpdate=true;signature.current='';};
    gl.domElement.addEventListener('webglcontextrestored',restore);
    return()=>{gl.shadowMap.autoUpdate=previous;gl.domElement.removeEventListener('webglcontextrestored',restore);};
  },[get]);
  useFrame((_,delta)=>{
    const {gl,scene,camera,setDpr,clock}=get();
    const tier=MAP_TIERS[qa?.tier]?qa.tier:MAP_TIERS[preference]?preference:
      qa?.mode==='test'?'high':sampleMapQuality(state.current,delta,
        !document.hidden&&!suspended&&camera.position.y>-20);
    const budget=MAP_TIERS[tier];
    const dpr=mapDprForTier(tier,window.devicePixelRatio);
    if(gl.getPixelRatio()!==dpr)setDpr(dpr);
    if(active.current!==tier){active.current=tier;onQualityChange?.(tier);}
    water.userData.update(reduced?0:clock.elapsedTime,budget.steam);
    // The legacy fallback has raised slabs and its own higher water surface.
    // Keep that complete fallback until the authored recessed basin is ready.
    water.visible=scene.getObjectByName('resort-asset-springs')?.userData.assetState==='ready';
    const sun=sunRef.current;
    if(!sun)return;
    const shadowSize=qa?.shadows==='off'?0:budget.shadowSize;
    if(!sun.castShadow && shadowSize>0)gl.shadowMap.needsUpdate=true;
    sun.castShadow=shadowSize>0;
    if(shadowSize && sun.shadow.mapSize.x!==shadowSize){
      sun.shadow.mapSize.set(shadowSize,shadowSize);
      sun.shadow.map?.dispose();sun.shadow.map=null;
      gl.shadowMap.needsUpdate=true;
    }
    // The sun and outdoor casters are static. Keep edit transforms live, and
    // invalidate after async model replacement (including equal mesh counts).
    gl.shadowMap.autoUpdate=editMode;
    elapsed.current+=delta;
    if(elapsed.current>.5||!signature.current){
      elapsed.current=0;
      const ids=[];scene.traverse(o=>{if(o.isMesh&&o.castShadow)ids.push(o.id);});
      const next=ids.join(',');
      if(next!==signature.current){signature.current=next;gl.shadowMap.needsUpdate=true;}
    }
    scene.userData.mapQuality={tier,dpr,shadowSize,steam:budget.steam,p95Ms:state.current.p95};
  },-3);
  return null;
}
