import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, PerspectiveCamera, Scene, Vector3, WebGLRenderTarget } from 'three';
import { isOutdoorPrewarmMesh, isPocketPrewarmMesh } from '../resort-assets.js';
import { MUSHROOM_INTERIOR } from '../world.js';

const OUTDOOR_BATCH = 1;
const POCKET_BATCH = 12;
const OUTDOOR_RESCAN_SECONDS = .5;
const POCKET_RESCAN_SECONDS = 2;

// Warm visible, above-ground asset materials first (one mesh per turn), then
// the buried mushroom pocket in small batches, so the door teleport never lands
// on a frame that compiles a dozen programs and uploads every interior buffer
// and atlas at once. The observatory's assets, shaders and FBOs remain
// exclusively owned by its lazy runtime: its roots are excluded, custom-shader
// meshes are skipped, and the pocket phase pauses on L2/L3 where that runtime
// runs its own prewarm budget.
export function OutdoorPrewarm({ excludedRoots, pocketRoots = [] }) {
  const get = useThree(s => s.get);
  const state = useRef({ elapsed: 0, pocketElapsed: POCKET_RESCAN_SECONDS, seen: new Set(), textures: new Set(),
    queue: [], pocketQueue: [], busy: false, epoch: 0, prepared: null, target: null, warmScene: null,
    warmCamera: new PerspectiveCamera(50, 1, .01, 2000), center: new Vector3(), scratch: new Vector3() });
  useEffect(() => {
    const { gl } = get();
    const reset = () => {
      state.current.epoch++;
      state.current.seen.clear(); state.current.textures.clear();
      state.current.queue = []; state.current.pocketQueue = []; state.current.busy = false;
      state.current.pocketElapsed = POCKET_RESCAN_SECONDS;
      disposeClones(state.current.prepared); state.current.prepared = null;
      state.current.target?.dispose(); state.current.target = null; state.current.warmScene = null;
    };
    gl.domElement.addEventListener('webglcontextrestored', reset);
    return () => { reset(); gl.domElement.removeEventListener('webglcontextrestored', reset); };
  }, [get]);
  useFrame((_, delta) => {
    const s = state.current;
    const { gl, scene, camera } = get();
    if (document.hidden || gl.getContext().isContextLost()) return;
    const outdoors = camera.position.y > -20;
    const onPocketGroundFloor = !outdoors && camera.position.y < MUSHROOM_INTERIOR.eyeY[1] - 2;
    if (!outdoors && !onPocketGroundFloor) return;
    s.elapsed += delta;
    if (outdoors && s.elapsed > OUTDOOR_RESCAN_SECONDS) {
      s.elapsed = 0;
      scene.updateMatrixWorld(true);
      scene.traverseVisible(object => {
        if (s.seen.has(object.id) || !isOutdoorPrewarmMesh(object, excludedRoots)) return;
        s.seen.add(object.id);
        s.queue.push(object);
      });
    }
    // The pocket is rescanned slowly because its furniture keeps swapping
    // placeholders for streamed models long after the first pass.
    s.pocketElapsed += delta;
    if (pocketRoots.length && !s.queue.length && !s.busy && !s.prepared && s.pocketElapsed > POCKET_RESCAN_SECONDS) {
      s.pocketElapsed = 0;
      // The interior root is excluded from the *outdoor* phase (its cap
      // projects above the meadow) but is exactly what this phase is for.
      const pocketExcluded = excludedRoots.filter(root => !pocketRoots.includes(root));
      for (const root of pocketRoots) {
        root.traverse(object => {
          if (s.seen.has(object.id) || !isPocketPrewarmMesh(object, pocketExcluded)) return;
          s.seen.add(object.id);
          s.pocketQueue.push(object);
        });
      }
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
      const batch = s.prepared;
      const group = new Group();
      // Frame the batch so the tiny throwaway pass actually covers pixels;
      // uploading an off-screen mesh alone does not exercise its GPU shader.
      let radius = .1;
      s.center.set(0, 0, 0);
      for (const mesh of batch) {
        mesh.frustumCulled = false;
        group.add(mesh);
        mesh.geometry.computeBoundingSphere();
        s.center.add(s.scratch.copy(mesh.geometry.boundingSphere.center).applyMatrix4(mesh.matrix));
      }
      s.center.divideScalar(batch.length);
      for (const mesh of batch) {
        const distance = s.scratch.copy(mesh.geometry.boundingSphere.center).applyMatrix4(mesh.matrix).distanceTo(s.center);
        radius = Math.max(radius, distance + mesh.geometry.boundingSphere.radius * mesh.matrix.getMaxScaleOnAxis());
      }
      s.warmScene.add(group);
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
        gl.render(s.warmScene, s.warmCamera);
      } catch (error) {
        s.error = String(error);
        s.queue = []; s.pocketQueue = [];
      } finally {
        gl.setRenderTarget(previousTarget);
        gl.shadowMap.autoUpdate = previousAuto; gl.shadowMap.needsUpdate = previousDirty;
        s.warmScene.remove(group); s.prepared = null; s.busy = false;
        disposeClones(batch);
      }
    } else if (!s.busy && (s.queue.length || s.pocketQueue.length)) {
      // Outdoor meshes go one per turn; the pocket (hundreds of small interior
      // meshes sharing a handful of programs) is prepared a dozen at a time.
      const fromPocket = !s.queue.length;
      const source = fromPocket ? s.pocketQueue : s.queue;
      const limit = fromPocket ? POCKET_BATCH : OUTDOOR_BATCH;
      const group = new Group();
      const clones = [];
      while (clones.length < limit && source.length) {
        const object = source.shift();
        let owner = object;
        while (owner.parent) owner = owner.parent;
        if (owner !== scene) continue;
        const clone = object.clone(false);
        clone.matrixAutoUpdate = false; clone.matrix.copy(object.matrixWorld);
        group.add(clone); clones.push(clone);
        for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
          for (const texture of Object.values(material)) {
            if (!texture?.isTexture || s.textures.has(texture)) continue;
            s.textures.add(texture); gl.initTexture(texture);
          }
        }
      }
      if (!clones.length) return;
      s.busy = true;
      const epoch = s.epoch;
      Promise.resolve(gl.compileAsync?.(group, camera, scene)).then(() => {
        if (s.epoch === epoch) s.prepared = clones; else disposeClones(clones);
      }).catch(() => {
        // Preparation is optional; ordinary renderer/fallback still owns display.
        if (s.epoch === epoch) s.busy = false;
        disposeClones(clones);
      });
    } else if (!s.busy && s.target) {
      s.target.dispose(); s.target = null; s.warmScene = null;
    }
    scene.userData.outdoorPrewarm = { pending: s.queue.length, pocketPending: s.pocketQueue.length, busy: s.busy,
      meshes: s.seen.size, activeTarget: Boolean(s.target), error: s.error ?? null };
  }, -2.5);
  return null;
}

// Clones share geometry/material with their originals; only an instanced
// clone owns a private instance-matrix attribute that needs releasing.
function disposeClones(clones) {
  for (const clone of clones ?? []) {
    if (clone.isInstancedMesh) clone.dispose();
  }
}
