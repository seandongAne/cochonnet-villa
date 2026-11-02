import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMapQualityState, sampleMapQuality, mapDprForTier, MAP_TIERS, readMapAutoTier, writeMapAutoTier } from '../src/villa-map/map-quality.js';
import { createRegionQueue, nearMushroomEntrance, isPocketPlacement, prewarmBudget } from '../src/villa-map/region-loading.js';
import { getAssetProgress, resetAssetProgress, trackAssetLoad } from '../src/villa-map/asset-loading.js';
import { createVillaWorld } from '../src/villa-map/world.js';
import { PORKY_PLACEMENTS } from '../src/villa-map/placements.js';
import { FURNITURE_PLACEMENTS } from '../src/villa-map/furniture-placements.js';
import { isActiveInteriorPlacement } from '../src/villa-map/main-villa.js';
const flush = () => new Promise(resolve => setImmediate(resolve));

test('foreground overload escapes warmup while isolated stalls and hidden frames do not downgrade', () => {
  assert.equal(createMapQualityState().tier, 'low');
  const state = createMapQualityState('medium');
  sampleMapQuality(state, .3); sampleMapQuality(state, 1 / 60);
  assert.equal(state.tier, 'medium');
  for (let i = 0; i < 20; i++) sampleMapQuality(state, .3, false);
  assert.equal(state.tier, 'medium');
  for (let i = 0; i < 3; i++) sampleMapQuality(state, .3);
  assert.equal(state.tier, 'minimum');
  for (let i = 0; i < 600; i++) sampleMapQuality(state, 1 / 60);
  assert.equal(state.tier, 'minimum', 'recovery does not immediately undo emergency downgrade');
});

test('low tiers cap drawing pixels across ultrawide, retina, resize and browser zoom', () => {
  for (const tier of ['low', 'minimum']) for (const [w,h,d] of [[5120,1440,2],[7680,2160,3],[1280,720,1],[900,1600,3]]) {
    const ratio = mapDprForTier(tier,d,w,h);
    assert.ok(w*h*ratio*ratio <= MAP_TIERS[tier].maxPixels + .001);
    assert.ok(ratio <= d && ratio <= MAP_TIERS[tier].dpr);
  }
  assert.equal(mapDprForTier('low',.5,800,600),.5);
  assert.equal(mapDprForTier('high',2,7680,2160),1.8);
  assert.equal(mapDprForTier('low',NaN,0,0),1);
});

test('remembered weak devices start at minimum; unavailable or fast history starts conservatively', () => {
  let value;
  const storage = { getItem: () => value, setItem: (_, v) => { value = v; } };
  assert.equal(readMapAutoTier(storage),'low');
  writeMapAutoTier(storage,'minimum'); assert.equal(readMapAutoTier(storage),'minimum');
  writeMapAutoTier(storage,'high'); assert.equal(readMapAutoTier(storage),'low');
  assert.equal(readMapAutoTier({getItem(){throw Error();}}),'low');
});

test('normal spawn defers all 96 pocket furnishings and six residents, but door and teleport activate them', () => {
  const world = createVillaWorld();
  const entrance = world.interactions.find(i => i.id === 'mushroom-house').position;
  assert.equal(nearMushroomEntrance(world.player.start, entrance), false);
  assert.equal(nearMushroomEntrance(entrance, entrance), true);
  assert.equal(nearMushroomEntrance({x: -6,y: -46,z: 18}, entrance), true);
  assert.equal(nearMushroomEntrance({x: -6,y: 15,z: 24}, entrance), false);
  assert.equal(PORKY_PLACEMENTS.filter(isPocketPlacement).length, 6);
  assert.equal(FURNITURE_PLACEMENTS.filter(isActiveInteriorPlacement).filter(isPocketPlacement).length, 96);
});

test('deferred region does no work before approach, limits concurrency, and continues after failure', async () => {
  const queue = createRegionQueue(2);
  let started = 0, active = 0, peak = 0;
  const releases = [];
  for (let i=0;i<5;i++) queue.enqueue(() => {
    started++; active++; peak=Math.max(active,peak);
    return new Promise((resolve,reject) => releases.push(() => {active--; i===0?reject(Error('404')):resolve();}));
  });
  await flush(); assert.equal(started,0); assert.equal(queue.pending,5);
  queue.request(); queue.request(); await flush(); assert.equal(started,2);
  releases.shift()(); await flush(); assert.equal(started,3);
  while(queue.pending) { releases.shift()(); await flush(); }
  assert.equal(started,5); assert.equal(peak,2);
});

test('entry readiness remains complete while deferred pocket models prepare or fail', async () => {
  resetAssetProgress();
  await trackAssetLoad(Promise.resolve()); await flush();
  let resolve;
  const pocket = trackAssetLoad(new Promise(r=>{resolve=r;}),'pocket');
  assert.equal(getAssetProgress().entry.complete,true);
  assert.equal(getAssetProgress().complete,false);
  await trackAssetLoad(Promise.reject(Error('404')),'pocket').catch(()=>{});
  resolve(); await pocket; await flush();
  assert.equal(getAssetProgress().entry.failed,0);
  assert.equal(getAssetProgress().failed,1);
  resetAssetProgress();
});

test('optional prewarm yields to slow frames and modal suspension and uses tiny batches on low tiers', () => {
  assert.equal(prewarmBudget('high',.1),0);
  assert.equal(prewarmBudget('high',1/60,true),0);
  assert.equal(prewarmBudget('minimum',1/60),1);
  assert.equal(prewarmBudget('low',1/60),1);
  assert.equal(prewarmBudget('high',1/60),12);
});
