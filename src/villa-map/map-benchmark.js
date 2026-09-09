import { summarizeObservatoryFrameTimes } from './observatory-diagnostics.js';

// A scripted camera route for rendering measurements, not a collision test.
// Reaches the same spa, both villa floors, stairwell and outdoor return on both laps.
export const MAP_BENCHMARK_ROUTE=Object.freeze([
  [0,1.6,18],[16.2,1.8,12],[16.2,1.8,-6],[14,1.6,1],
  [0,1.6,1],[0,1.6,-5],[-6,1.6,-13],[0,1.6,-8],
  [0,8.05,-12.5],[5.5,8.05,-10],[0,8.05,-12.5],[0,1.6,-8],
  [0,1.6,1],[0,1.6,18]
]);
export const MAP_BENCHMARK_LAP_SECONDS=(MAP_BENCHMARK_ROUTE.length-1)*2.5;
export function benchmarkSummary(samples){
  return {...summarizeObservatoryFrameTimes(samples),
    longFrames50ms:samples.filter(n=>n>50).length,
    longFrames100ms:samples.filter(n=>n>100).length,
    maxMs:samples.length?Math.max(...samples):0};
}
export function sampleBenchmarkPosition(seconds){
  const segment=Math.min(MAP_BENCHMARK_ROUTE.length-2,Math.floor(seconds/2.5));
  const t=Math.min(1,Math.max(0,(seconds-segment*2.5)/2.5));
  const a=MAP_BENCHMARK_ROUTE[segment],b=MAP_BENCHMARK_ROUTE[segment+1];
  return {position:a.map((v,i)=>v+(b[i]-v)*t),target:b};
}
