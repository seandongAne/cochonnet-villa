import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFenceFallback, createPerimeterFence, disposePerimeterFence } from '../perimeter-fence.js';
import { trackAssetLoad } from '../asset-loading.js';
import { getGpuPreparer } from './gpu-prepare.js';

let sourcePromise;
function loadSources() {
  if (!sourcePromise) {
    const loader = new GLTFLoader();
    const promise = Promise.all(['CV_Panel_3m', 'CV_Post', 'CV_Welcome_Gate_6m']
      .map(name => loader.loadAsync(`/models/fence/${name}.glb`)))
      .then(([panel, post, gate]) => ({ panel: panel.scene, post: post.scene, gate: gate.scene }));
    sourcePromise = promise;
    promise.catch(() => { if (sourcePromise === promise) sourcePromise = undefined; });
  }
  return sourcePromise;
}

export function PerimeterFence({ bounds }) {
  const root = useMemo(() => new Group(), []);
  const gl = useThree(s => s.gl), get = useThree(s => s.get);
  useEffect(() => {
    let cancelled = false, model, preparing = false;
    const fallback = createFenceFallback(bounds);
    root.name = 'perimeter-fence-asset';
    root.userData.assetState = 'loading'; root.add(fallback);
    const params = new URLSearchParams(window.location.search);
    const forceFallback = ['test', 'perf'].includes(params.get('observatory')) && params.get('fenceassets') === 'fallback';
    const sources = forceFallback ? Promise.reject(new Error('QA fence fallback requested')) : loadSources();
    const prepare = getGpuPreparer(get);
    trackAssetLoad(sources.then(async source => {
      if (cancelled) return;
      model = createPerimeterFence(source, bounds);
      preparing = true;
      try { await prepare(model); } finally { preparing = false; }
      if (cancelled) { disposePerimeterFence(model); return; }
      root.remove(fallback); disposePerimeterFence(fallback); root.add(model);
      root.userData.assetState = 'ready'; gl.shadowMap.needsUpdate = true;
    })).catch(error => {
      if (model && !preparing) disposePerimeterFence(model);
      if (cancelled) return;
      root.userData.assetState = 'fallback';
      console.warn('Fence asset unavailable; using procedural fallback.', error);
    });
    return () => {
      cancelled = true; root.clear(); disposePerimeterFence(fallback);
      if (model && !preparing) disposePerimeterFence(model);
    };
  }, [bounds, root, gl, get]);
  return <primitive object={root} dispose={null} />;
}
