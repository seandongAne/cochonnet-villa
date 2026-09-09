// Node-pure progress registry for the villa map's streamed GLB assets.
//
// Every loader (porky-models.js, furniture-models.js, react/ResortAsset.jsx)
// wraps the promise chain that ends in its model swap with trackAssetLoad().
// The React island subscribes to the aggregate so the loading veil can stay
// up until the authored models are actually mounted, instead of vanishing the
// moment the WebGL context exists while the procedural stand-ins still show.
//
// A rejected load (404, decode failure) still counts as settled: the loader
// keeps its procedural fallback and the veil must not wait forever for it.

export const ASSET_WAIT_TIMEOUT_MS = 25000;

const state = {
  total: 0,
  settled: 0,
  failed: 0,
  listeners: new Set(),
  snapshot: null
};

function buildSnapshot() {
  const pending = state.total - state.settled;
  return Object.freeze({
    total: state.total,
    settled: state.settled,
    failed: state.failed,
    pending,
    ratio: state.total > 0 ? state.settled / state.total : 0,
    complete: state.total > 0 && pending === 0
  });
}

function notify() {
  state.snapshot = buildSnapshot();
  for (const listener of state.listeners) {
    listener(state.snapshot);
  }
}

export function getAssetProgress() {
  if (!state.snapshot) state.snapshot = buildSnapshot();
  return state.snapshot;
}

export function subscribeAssetProgress(listener) {
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

// Register one asset load. Returns the same promise so call sites can keep
// chaining; settlement (either way) is what advances the progress counter.
export function trackAssetLoad(promise) {
  state.total += 1;
  notify();
  let done = false;
  const settle = (ok) => {
    if (done) return;
    done = true;
    state.settled += 1;
    if (!ok) state.failed += 1;
    notify();
  };
  promise.then(() => settle(true), () => settle(false));
  return promise;
}

// Tests and hot reloads start from a clean counter.
export function resetAssetProgress() {
  state.total = 0;
  state.settled = 0;
  state.failed = 0;
  notify();
}

// Human-readable progress line for the veil. Percentages are rounded down so
// the label never claims 100% while the final swap is still pending.
export function formatAssetProgress(progress) {
  if (!progress || progress.total === 0) return "正在搭建猪猪山庄…";
  if (progress.complete) return "猪猪山庄已就绪";
  const percent = Math.min(99, Math.floor(progress.ratio * 100));
  return `正在搭建猪猪山庄… ${percent}%`;
}
