import { useEffect, useRef } from "react";
import { advance, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MAP_BENCHMARK_LAP_SECONDS,sampleBenchmarkPosition,benchmarkSummary } from '../map-benchmark.js';
import { getAssetProgress } from '../asset-loading.js';

import {
  OBSERVATORY_DIAGNOSTIC_VIEWS,
  summarizeObservatoryFrameTimes
} from "../observatory-diagnostics.js";

const MAX_FRAME_SAMPLES = 1800;

// Query-only browser harness (`?observatory=test` or `?observatory=perf`). It
// gives visual QA deterministic camera bookmarks and a compact renderer/frame
// snapshot without affecting ordinary visitors. Test mode uses R3F's manual
// advance path, which also works in the app's headless pane where rAF stalls.
export function ObservatoryDiagnostics({
  mode,
  lightsOn,
  setLightsOn,
  hiddenEffects,
  onHiddenAction,
  initialView = "loft-center",
  onReady
}) {
  // Subscribe only to the stable store getter. Subscribing to the complete
  // RootState makes this component re-render while the Canvas is settling
  // (size, DPR and internal frame bookkeeping all update that object). Since
  // the effect cleanup publishes `onReady(null)`, those transient updates can
  // otherwise leave the query-only QA panel stuck on "loading".
  const getState = useThree((state) => state.get);
  const samplesRef = useRef([]);
  const routeRef = useRef({running:false,lap:0,elapsed:0,samples:[],results:[],longFrames:[]});
  const skipRouteFrameRef = useRef(false);
  useEffect(() => {
    const skipResume = () => { skipRouteFrameRef.current = true; };
    document.addEventListener('visibilitychange', skipResume);
    return () => document.removeEventListener('visibilitychange', skipResume);
  }, []);
  const providersRef = useRef(new Map());
  const lightsOnRef = useRef(lightsOn);
  const hiddenEffectsRef = useRef(hiddenEffects);

  lightsOnRef.current = lightsOn;
  hiddenEffectsRef.current = hiddenEffects;

  useFrame(({camera}, delta) => {
    const route=routeRef.current;
    if(route.running && !document.hidden && !skipRouteFrameRef.current){
      if(delta>.05)route.longFrames.push({lap:route.lap+1,elapsedSeconds:route.elapsed,
        frameMs:delta*1000,position:camera.position.toArray()});
      route.samples.push(delta*1000);route.elapsed+=delta;
      const pose=sampleBenchmarkPosition(Math.min(route.elapsed,MAP_BENCHMARK_LAP_SECONDS));
      camera.position.fromArray(pose.position);
      const distance = Math.hypot(...pose.target.map((v,i)=>v-camera.position.getComponent(i)));
      if(distance>.01)camera.lookAt(...pose.target);
      if(route.elapsed>=MAP_BENCHMARK_LAP_SECONDS){
        route.results.push(benchmarkSummary(route.samples));
        route.samples=[];route.elapsed=0;route.lap++;
        if(route.lap>=2)route.running=false;
      }
    }
    skipRouteFrameRef.current = false;
    const samples = samplesRef.current;
    samples.push(delta * 1000);
    if (samples.length > MAX_FRAME_SAMPLES) {
      samples.splice(0, samples.length - MAX_FRAME_SAMPLES);
    }
  });

  useEffect(() => {
    const state = getState();
    const { camera, gl, scene } = state;
    const drawingBufferSize = new THREE.Vector2();
    const webglContext = gl.getContext?.() ?? null;
    const contextLossExtension = webglContext?.getExtension?.(
      "WEBGL_lose_context"
    ) ?? null;

    const getContextLossStatus = (
      action = "status",
      requested = false,
      error = null
    ) => ({
      action,
      supported: Boolean(
        contextLossExtension?.loseContext
        && contextLossExtension?.restoreContext
      ),
      requested,
      lost: webglContext?.isContextLost?.() === true,
      ...(error
        ? { error: error instanceof Error ? error.message : String(error) }
        : {})
    });

    const requestContextLossAction = (action) => {
      const method = action === "restore" ? "restoreContext" : "loseContext";
      if (typeof contextLossExtension?.[method] !== "function") {
        return getContextLossStatus(action, false);
      }
      try {
        contextLossExtension[method]();
        // Context loss/restoration is asynchronous in browsers. `requested`
        // confirms injection while `lost` reports the state visible now.
        return getContextLossStatus(action, true);
      } catch (error) {
        return getContextLossStatus(action, false, error);
      }
    };

    const setView = (name) => {
      const view = OBSERVATORY_DIAGNOSTIC_VIEWS[name];
      if (!view) {
        throw new Error(`Unknown observatory diagnostic view: ${name}`);
      }
      camera.position.fromArray(view.position);
      camera.up.set(0, 1, 0);
      camera.lookAt(...view.target);
      camera.updateMatrixWorld(true);
      return {
        name,
        position: camera.position.toArray(),
        quaternion: camera.quaternion.toArray()
      };
    };

    const getSnapshot = () => {
      gl.getDrawingBufferSize(drawingBufferSize);
      const providers = {};
      for (const [name, provider] of providersRef.current) {
        try {
          providers[name] = provider();
        } catch (error) {
          providers[name] = { error: error instanceof Error ? error.message : String(error) };
        }
      }
      if (typeof window.__villaObservatoryRuntimeSnapshot === "function") {
        try {
          providers.runtime = window.__villaObservatoryRuntimeSnapshot();
        } catch (error) {
          providers.runtime = {
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
      return {
        mode,
        lightsOn: lightsOnRef.current,
        hiddenEffects: hiddenEffectsRef.current,
        camera: {
          position: camera.position.toArray(),
          quaternion: camera.quaternion.toArray(),
          fov: camera.fov,
          aspect: camera.aspect
        },
        drawingBuffer: drawingBufferSize.toArray(),
        exposure: gl.toneMappingExposure,
        mapQuality: scene.userData.mapQuality ?? null,
        outdoorPrewarm: scene.userData.outdoorPrewarm ?? null,
        benchmark: {running:routeRef.current.running,lap:Math.min(2,routeRef.current.lap+1),
          elapsedSeconds:routeRef.current.elapsed,results:routeRef.current.results,
          longFrames:routeRef.current.longFrames},
        gpu: (()=>{const ext=webglContext?.getExtension('WEBGL_debug_renderer_info');
          return ext?webglContext.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable';})(),
        resortAssets: Object.fromEntries(['villa','springs','mushroom'].map(kind => [kind,
          scene.getObjectByName(`resort-asset-${kind}`)?.userData.assetState ?? 'legacy'])),
        // Streamed GLB progress (pigs, furniture, shells) as the loading veil
        // sees it, plus whatever stand-ins are still on screen and why.
        streamedAssets: (() => {
          const standIns = { furniturePlaceholders: 0, porkyFallbacks: 0, loadFailed: 0, errors: [] };
          scene.traverse((object) => {
            if (object.name === 'furniture-placeholder') standIns.furniturePlaceholders += 1;
            if (object.name === 'porky-procedural-fallback') standIns.porkyFallbacks += 1;
            if (object.userData?.modelLoadFailed) {
              standIns.loadFailed += 1;
              const message = object.userData.modelLoadError ?? 'unknown';
              if (standIns.errors.length < 3 && !standIns.errors.includes(message)) standIns.errors.push(message);
            }
          });
          // First mushroom-furniture mesh (cottage-palette material): is the
          // shared KayKit atlas intact, and what does its group contain?
          let atlas = null;
          scene.traverse((object) => {
            if (atlas || !object.isMesh) return;
            const material = Array.isArray(object.material) ? object.material[0] : object.material;
            if (material?.customProgramCacheKey?.() !== 'mushroom-cottage-palette-v1') return;
            const image = material.map?.image;
            let group = object;
            while (group.parent && group.parent.userData?.assetState === undefined) group = group.parent;
            atlas = {
              mesh: object.name,
              vertices: object.geometry?.attributes?.position?.count ?? 0,
              hasMap: Boolean(material.map),
              imageType: image?.constructor?.name ?? null,
              imageWidth: image?.width ?? null,
              imageHeight: image?.height ?? null,
              colorSpace: material.map?.colorSpace ?? null,
              groupState: group.userData?.assetState ?? null,
              groupChildren: group.children.map((child) => child.name || child.type),
              worldY: Number(object.matrixWorld.elements[13].toFixed(2)),
              scale: Number(object.matrixWorld.getMaxScaleOnAxis().toFixed(3))
            };
          });
          return { ...getAssetProgress(), standIns, atlas };
        })(),
        webglContext: getContextLossStatus(),
        frameTimes: summarizeObservatoryFrameTimes(samplesRef.current),
        renderer: {
          calls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          points: gl.info.render.points,
          textures: gl.info.memory.textures,
          geometries: gl.info.memory.geometries
        },
        providers
      };
    };

    const api = {
      mode,
      views: Object.keys(OBSERVATORY_DIAGNOSTIC_VIEWS),
      setView,
      startMapBenchmark(){
        if(mode!=='perf')throw new Error('The map benchmark requires real frame timing (observatory=perf).');
        routeRef.current={running:true,lap:0,elapsed:0,samples:[],results:[],longFrames:[]};
        return getSnapshot();
      },
      stopMapBenchmark(){
        routeRef.current.running=false;
        return getSnapshot();
      },
      setLights(value) {
        setLightsOn(Boolean(value));
      },
      setSkyMode(value) {
        if (typeof window.__villaObservatoryRuntimeSetSkyMode !== "function") {
          return null;
        }
        return window.__villaObservatoryRuntimeSetSkyMode(value);
      },
      toggleHiddenEffect(action) {
        if (action !== "rift" && action !== "lens") {
          throw new Error(`Unknown observatory hidden effect: ${action}`);
        }
        onHiddenAction?.(action);
      },
      resetSamples() {
        samplesRef.current = [];
      },
      loseContext() {
        return requestContextLossAction("lose");
      },
      restoreContext() {
        return requestContextLossAction("restore");
      },
      getSnapshot,
      registerProvider(name, provider) {
        if (typeof name !== "string" || typeof provider !== "function") {
          throw new TypeError("registerProvider(name, provider) requires a function");
        }
        providersRef.current.set(name, provider);
        return () => providersRef.current.delete(name);
      },
      // `advance` expects elapsed seconds in frameloop="never" mode.
      advanceFrames(frameCount = 1, fps = 60) {
        if (mode !== "test") {
          throw new Error("Manual frame advance is available only in observatory=test mode");
        }
        const safeFrames = THREE.MathUtils.clamp(Math.floor(frameCount), 1, 1800);
        const safeFps = THREE.MathUtils.clamp(Number(fps) || 60, 1, 120);
        for (let frame = 0; frame < safeFrames; frame += 1) {
          const currentState = getState();
          advance(
            currentState.clock.elapsedTime + 1 / safeFps,
            true,
            currentState
          );
        }
        return getSnapshot();
      },
      advanceSeconds(seconds = 1, fps = 60) {
        const safeSeconds = THREE.MathUtils.clamp(Number(seconds) || 0, 0, 30);
        return this.advanceFrames(Math.max(1, Math.round(safeSeconds * fps)), fps);
      },
      renderOnce() {
        if (mode === "test") {
          const currentState = getState();
          advance(currentState.clock.elapsedTime + 1 / 60, true, currentState);
        } else {
          gl.render(scene, camera);
        }
        return getSnapshot();
      }
    };

    window.__villaObservatory = api;
    setView(OBSERVATORY_DIAGNOSTIC_VIEWS[initialView] ? initialView : "loft-center");
    onReady?.(api);
    if (mode === "test") {
      api.renderOnce();
    }

    return () => {
      if (window.__villaObservatory === api) {
        delete window.__villaObservatory;
      }
      onReady?.(null);
      providersRef.current.clear();
    };
  }, [getState, initialView, mode, onHiddenAction, onReady, setLightsOn]);

  return null;
}
