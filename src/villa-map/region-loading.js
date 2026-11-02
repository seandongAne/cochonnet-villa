// Geometry and loading policy only; no browser or renderer ownership here.
export function isPocketPlacement(placement) {
  return placement.room?.startsWith('mushroom-') || placement.position?.[1] < -20;
}
export function nearMushroomEntrance(position, entrance) {
  return position.y < -20 || (position.y < 8 && Math.hypot(position.x - entrance.x, position.z - entrance.z) <= 7);
}

// Deferred callbacks do not fetch, decode, or register in entry progress until
// the region is requested. Bound simultaneous prepare/swap chains as well as IO.
export function createRegionQueue(concurrency = 2) {
  const waiting = [];
  let requested = false, running = 0;
  function pump() {
    while (requested && running < concurrency && waiting.length) {
      const start = waiting.shift();
      running++;
      Promise.resolve().then(start).catch(() => {}).finally(() => { running--; pump(); });
    }
  }
  return {
    enqueue(start) { waiting.push(start); pump(); },
    request() { requested = true; pump(); },
    get requested() { return requested; },
    get pending() { return waiting.length + running; }
  };
}

export function prewarmBudget(tier, delta, suspended = false) {
  if (suspended || !Number.isFinite(delta) || delta <= 0 || delta > 1 / 30) return 0;
  return tier === 'minimum' || tier === 'low' ? 1 : 12;
}

// Build an invisible region at most once, when the camera first needs it.
// A thrown factory remains retryable and never publishes a half-built value.
export function createLazyRegion(factory) {
  let value, created = false;
  return {
    get created() { return created; },
    get() {
      if (!created) { value = factory(); created = true; }
      return value;
    }
  };
}
