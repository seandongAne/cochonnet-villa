export const MAP_TIERS = Object.freeze({
  high: Object.freeze({ dpr: 1.8, maxPixels: Infinity, shadowSize: 2048, steam: 12 }),
  medium: Object.freeze({ dpr: 1.25, maxPixels: Infinity, shadowSize: 1024, steam: 6 }),
  low: Object.freeze({ dpr: 1, maxPixels: 1500000, shadowSize: 512, steam: 3 }),
  minimum: Object.freeze({ dpr: .75, maxPixels: 1000000, shadowSize: 0, steam: 0 })
});
const ORDER = Object.keys(MAP_TIERS);
export const MAP_AUTO_STORAGE_KEY = 'cochonnet-villa:map-auto:v1';

export function readMapAutoTier(storage) {
  try {
    const saved = storage?.getItem(MAP_AUTO_STORAGE_KEY);
    // A previous fast run never makes the next cold start more expensive.
    return saved === 'minimum' ? 'minimum' : 'low';
  } catch { return 'low'; }
}
export function writeMapAutoTier(storage, tier) {
  try { if (MAP_TIERS[tier]) storage?.setItem(MAP_AUTO_STORAGE_KEY, tier); } catch { /* Optional. */ }
}
export function mapDprForTier(tier, deviceDpr = 1, width = 0, height = 0) {
  const device = Number.isFinite(deviceDpr) && deviceDpr > 0 ? deviceDpr : 1;
  const budget = MAP_TIERS[tier] ?? MAP_TIERS.medium;
  const pixels = width * height;
  const cap = Number.isFinite(pixels) && pixels > 0 ? Math.sqrt(budget.maxPixels / pixels) : Infinity;
  return Math.min(device, budget.dpr, cap);
}
export function createMapQualityState(tier = 'low') {
  return { tier: MAP_TIERS[tier] ? tier : 'low', samples: [], elapsed: 0,
    warmup: 5, bad: 0, good: 0, p95: 0, slowFrames: 0 };
}
export function sampleMapQuality(state, delta, enabled = true) {
  if (!enabled || !Number.isFinite(delta) || delta <= 0) {
    state.samples.length = 0; state.elapsed = 0; state.bad = 0; state.good = 0;
    state.slowFrames = 0;
    return state.tier;
  }
  // Ignore one resume/compile stall, but never ignore a continuously overloaded
  // foreground. This path also works before the normal warmup has elapsed.
  state.slowFrames = delta > .25 ? state.slowFrames + 1 : 0;
  if (state.slowFrames >= 3) {
    state.tier = 'minimum'; state.p95 = delta * 1000;
    state.samples.length = 0; state.elapsed = 0; state.bad = 0; state.good = 0;
    state.warmup = 4;
    return state.tier;
  }
  if (delta > .25) {
    state.samples.length = 0; state.elapsed = 0; state.bad = 0; state.good = 0;
    return state.tier;
  }
  if (state.warmup > 0) { state.warmup -= delta; return state.tier; }
  state.samples.push(delta * 1000); state.elapsed += delta;
  if (state.elapsed < 2 || state.samples.length < 30) return state.tier;
  const sorted = state.samples.sort((a, b) => a - b);
  state.p95 = sorted[Math.ceil(sorted.length * .95) - 1];
  state.bad = state.p95 > 25 ? state.bad + 1 : 0;
  state.good = state.p95 < 18 ? state.good + 1 : 0;
  let index = ORDER.indexOf(state.tier);
  if (state.bad >= 2 && index < 3) { index++; state.bad = 0; state.good = 0; state.warmup = 4; }
  else if (state.good >= 12 && index > 0) { index--; state.good = 0; state.bad = 0; state.warmup = 4; }
  state.tier = ORDER[index]; state.samples = []; state.elapsed = 0;
  return state.tier;
}
