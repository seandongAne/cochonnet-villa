import { useEffect, useRef } from "react";
import { advance, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

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
  const providersRef = useRef(new Map());
  const lightsOnRef = useRef(lightsOn);

  lightsOnRef.current = lightsOn;

  useFrame((_, delta) => {
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
        camera: {
          position: camera.position.toArray(),
          quaternion: camera.quaternion.toArray(),
          fov: camera.fov,
          aspect: camera.aspect
        },
        drawingBuffer: drawingBufferSize.toArray(),
        exposure: gl.toneMappingExposure,
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
      setLights(value) {
        setLightsOn(Boolean(value));
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
  }, [getState, initialView, mode, onReady, setLightsOn]);

  return null;
}
