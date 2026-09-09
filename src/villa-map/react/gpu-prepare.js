// Browser-only GPU preparation shared by every streamed-model loader.
//
// A freshly decoded GLB costs two things on its first visible frame: texture
// uploads (synchronous texImage2D per map) and shader program compilation.
// Doing both inside the render loop shows up as a hitch exactly when the
// model pops in. Loaders therefore await `prepare(model)` before swapping the
// model into the scene: textures are uploaded through one global queue (one
// upload per animation frame, whatever the number of concurrent loads) and
// programs are compiled with the renderer's KHR_parallel_shader_compile path.
//
// Preparation is best-effort. Any failure resolves silently; the ordinary
// render path still owns display and will simply pay the cost on first draw.

const preparers = new WeakMap();

function collectTextures(object) {
  const textures = new Set();
  object.traverse((child) => {
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  });
  return textures;
}

function nextFrame() {
  // Nobody watches a hidden tab, so there is no frame to protect there — and
  // its timers are throttled to once a second, which would turn the queue
  // into minutes. Upload back-to-back until the page is visible again.
  if (document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    // The timeout still makes progress if requestAnimationFrame stalls.
    const timer = window.setTimeout(resolve, 40);
    window.requestAnimationFrame(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

export function createGpuPreparer(get) {
  const uploaded = new WeakSet();
  let queue = Promise.resolve();

  return async function prepare(object) {
    try {
      const { gl, scene, camera } = get();
      if (!gl || gl.getContext?.()?.isContextLost?.()) return;
      // A model whose textures are already resident (shared atlases, a second
      // copy of the same pig) must not wait behind other models' uploads.
      let lastUpload = null;
      for (const texture of collectTextures(object)) {
        if (uploaded.has(texture)) continue;
        queue = queue.then(async () => {
          if (uploaded.has(texture)) return;
          uploaded.add(texture);
          try {
            gl.initTexture(texture);
          } catch {
            // A broken image falls back to the material colour at draw time.
          }
          await nextFrame();
        });
        lastUpload = queue;
      }
      if (lastUpload) await lastUpload;
      if (typeof gl.compileAsync === "function") {
        await gl.compileAsync(object, camera, scene);
      }
    } catch {
      // Preparation is optional; never block the model swap on it.
    }
  };
}

// One preparer per R3F root, keyed by its stable state getter, so every
// loader in the same canvas shares the same upload queue and upload ledger.
export function getGpuPreparer(get) {
  let preparer = preparers.get(get);
  if (!preparer) {
    preparer = createGpuPreparer(get);
    preparers.set(get, preparer);
  }
  return preparer;
}
