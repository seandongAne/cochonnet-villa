// Node-pure optional User Timing instrumentation. No browser state at import.
export function measureStartup(name, factory, clock = globalThis.performance) {
  if (!clock?.getEntriesByName('cv:startup:enabled').length) return factory();
  const start = clock.now();
  try { return factory(); }
  finally { clock.measure(`cv:factory:${name}`, { start, end: clock.now() }); }
}
export function markStartup(name, clock = globalThis.performance) {
  if (clock?.getEntriesByName('cv:startup:enabled').length && !clock.getEntriesByName(`cv:${name}`).length) {
    clock.mark(`cv:${name}`);
  }
}
