export const MAP_TIERS = Object.freeze({
  high: Object.freeze({dpr:1.8,shadowSize:2048,steam:12}),
  medium: Object.freeze({dpr:1.25,shadowSize:1024,steam:6}),
  low: Object.freeze({dpr:1,shadowSize:512,steam:3}),
  minimum: Object.freeze({dpr:.75,shadowSize:0,steam:0})
});
const ORDER=Object.keys(MAP_TIERS);
export function mapDprForTier(tier, deviceDpr = 1) {
  const device = Number.isFinite(deviceDpr) && deviceDpr > 0 ? deviceDpr : 1;
  return Math.min(device, (MAP_TIERS[tier] ?? MAP_TIERS.medium).dpr);
}
export function createMapQualityState(){return {tier:'medium',samples:[],elapsed:0,warmup:5,bad:0,good:0,p95:0};}
export function sampleMapQuality(state,delta,enabled=true){
  // Background / suspended intervals are not device performance observations.
  if(!enabled || !Number.isFinite(delta) || delta<=0 || delta>.25){
    state.samples.length=0;state.elapsed=0;state.bad=0;state.good=0;return state.tier;
  }
  if(state.warmup>0){state.warmup-=delta;return state.tier;}
  state.samples.push(delta*1000);state.elapsed+=delta;
  if(state.elapsed<2 || state.samples.length<30)return state.tier;
  const sorted=state.samples.sort((a,b)=>a-b);
  state.p95=sorted[Math.ceil(sorted.length*.95)-1];
  state.bad=state.p95>25?state.bad+1:0;
  state.good=state.p95<18?state.good+1:0;
  let index=ORDER.indexOf(state.tier);
  if(state.bad>=2 && index<3){index++;state.bad=0;state.good=0;state.warmup=4;}
  else if(state.good>=12 && index>0){index--;state.good=0;state.bad=0;state.warmup=4;}
  state.tier=ORDER[index];state.samples=[];state.elapsed=0;
  return state.tier;
}
