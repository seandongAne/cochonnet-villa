import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measureStartup, markStartup } from '../src/startup-metrics.js';
import { createLazyRegion } from '../src/villa-map/region-loading.js';

test('instrumentation is inert without an opt-in mark and preserves return values', () => {
  const clock={getEntriesByName:()=>[]};
  assert.equal(measureStartup('test',()=>42,clock),42);
  markStartup('ready',clock);
});
test('opt-in factory timing preserves errors and ready marks are idempotent', () => {
  const marks = new Set(['cv:startup:enabled']), entries=[]; let time=0;
  const clock={getEntriesByName:name=>marks.has(name)?[{}]:[],now:()=>++time,
    measure:(name,options)=>entries.push({name,...options}),mark:name=>marks.add(name)};
  assert.throws(()=>measureStartup('failure',()=>{throw Error('original');},clock),/original/);
  assert.deepEqual(entries,[{name:'cv:factory:failure',start:1,end:2}]);
  markStartup('ready',clock); markStartup('ready',clock);
  assert.equal(marks.size,2);
});
test('unvisited region creates nothing, first demand creates once, repeat visits reuse it', () => {
  let calls=0; const region=createLazyRegion(()=>({id:++calls}));
  assert.equal(region.created,false); assert.equal(calls,0);
  const first=region.get(); assert.equal(region.created,true);
  assert.equal(region.get(),first); assert.equal(calls,1);
});
test('failed region creation never publishes a partial value and can retry', () => {
  let calls=0; const region=createLazyRegion(()=>{if(++calls===1)throw Error('build');return 'ready';});
  assert.throws(()=>region.get(),/build/); assert.equal(region.created,false);
  assert.equal(region.get(),'ready'); assert.equal(region.created,true);
});
