import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, PerspectiveCamera, Scene, Vector3, WebGLRenderTarget } from 'three';
import { isOutdoorPrewarmMesh } from '../resort-assets.js';

// Warm only visible, above-ground asset materials. The buried observatory's
// assets, shaders and FBOs remain exclusively owned by its lazy runtime.
export function OutdoorPrewarm({ excludedRoots }) {
  const get = useThree(s => s.get);
  const state = useRef({ elapsed: 0, seen: new Set(), textures: new Set(), queue: [], busy: false, epoch: 0,
    prepared: null, target: null, warmScene: null, warmCamera: new PerspectiveCamera(50, 1, .01, 2000),
    center: new Vector3() });
  useEffect(() => {
    const { gl } = get();
    const reset = () => {
      state.current.epoch++;
      state.current.seen.clear(); state.current.textures.clear();
      state.current.queue = []; state.current.busy = false;
      if (state.current.prepared?.isInstancedMesh) state.current.prepared.dispose();
      state.current.prepared = null;
      state.current.target?.dispose(); state.current.target = null; state.current.warmScene = null;
    };
    gl.domElement.addEventListener('webglcontextrestored', reset);
    return () => { reset(); gl.domElement.removeEventListener('webglcontextrestored', reset); };
  }, [get]);
  useFrame((_, delta) => {
    const s = state.current;
    const { gl, scene, camera } = get();
    if (document.hidden || camera.position.y < -20 || gl.getContext().isContextLost()) return;
    s.elapsed += delta;
    if (s.elapsed > .5) {
      s.elapsed = 0;
      scene.updateMatrixWorld(true);
      scene.traverseVisible(object => {
        if (s.seen.has(object.id) || !isOutdoorPrewarmMesh(object, excludedRoots)) return;
        s.seen.add(object.id);
        s.queue.push(object);
      });
    }
    if (s.prepared) {
      if (!s.target) {
        s.target = new WebGLRenderTarget(32, 32, { depthBuffer: true, stencilBuffer: false });
        s.warmScene = new Scene();
        scene.traverseVisible(light => {
          if (!light.isLight) return;
          const copy = light.clone(false);
          copy.matrixAutoUpdate = false; copy.matrix.copy(light.matrixWorld);
          if (light.shadow) copy.shadow = light.shadow;
          s.warmScene.add(copy);
        });
      }
      s.warmScene.environment = scene.environment;
      s.warmScene.environmentIntensity = scene.environmentIntensity;
      s.warmScene.fog = scene.fog;
      const mesh = s.prepared;
      mesh.frustumCulled = false;
      s.warmScene.add(mesh);
      mesh.geometry.computeBoundingSphere();
      s.center.copy(mesh.geometry.boundingSphere.center).applyMatrix4(mesh.matrix);
      const radius = Math.max(.1, mesh.geometry.boundingSphere.radius * mesh.matrix.getMaxScaleOnAxis());
      s.warmCamera.position.copy(s.center).addScaledVector(new Vector3(1.6,1.1,1.7),radius);
      s.warmCamera.lookAt(s.center);
      s.warmCamera.near = Math.max(.001, radius*.01);
      s.warmCamera.far = radius*20+100;
      s.warmCamera.updateProjectionMatrix();
      const previousTarget = gl.getRenderTarget();
      const previousAuto = gl.shadowMap.autoUpdate;
      const previousDirty = gl.shadowMap.needsUpdate;
      try {
        gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = false;
        gl.setRenderTarget(s.target);
        // Frame each mesh so the tiny throwaway pass actually covers pixels;
        // uploading an off-screen mesh alone does not exercise its GPU shader.
        gl.render(s.warmScene, s.warmCamera);
      } catch (error) {
        s.error = String(error);
        s.queue = [];
      } finally {
        gl.setRenderTarget(previousTarget);
        gl.shadowMap.autoUpdate = previousAuto; gl.shadowMap.needsUpdate = previousDirty;
        s.warmScene.remove(mesh); s.prepared = null; s.busy = false;
        if (mesh.isInstancedMesh) mesh.dispose();
      }
    } else if (!s.busy && s.queue.length) {
      const group = new Group();
      // Bound preparation work per turn to one mesh and its material textures.
      const object = s.queue.shift();
      let owner = object;
      while (owner.parent) owner = owner.parent;
      if (owner !== scene) return;
      const clone = object.clone(false);
      clone.matrixAutoUpdate = false; clone.matrix.copy(object.matrixWorld);
      group.add(clone);
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        for (const texture of Object.values(material)) {
          if (!texture?.isTexture || s.textures.has(texture)) continue;
          s.textures.add(texture); gl.initTexture(texture);
        }
      }
      s.busy = true;
      const epoch = s.epoch;
      Promise.resolve(gl.compileAsync?.(group, camera, scene)).then(() => {
        if (s.epoch === epoch) s.prepared = clone;
      }).catch(() => {
        // Preparation is optional; ordinary renderer/fallback still owns display.
        if (s.epoch === epoch) s.busy = false;
      });
    } else if (!s.busy && s.target) {
      s.target.dispose(); s.target = null; s.warmScene = null;
    }
    scene.userData.outdoorPrewarm = { pending: s.queue.length, busy: s.busy, meshes: s.seen.size,
      activeTarget: Boolean(s.target), error: s.error ?? null };
  }, -2.5);
  return null;
}
