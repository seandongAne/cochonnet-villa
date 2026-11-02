// Loopback-only, opt-in diagnostics. No telemetry or persistent browser data.
(() => {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    || new URLSearchParams(location.search).get('startup') !== 'measure') return;
  performance.mark('cv:startup:enabled');
  performance.setResourceTimingBufferSize(2000);
  const tasks = [], paints = [], lcp = [];
  const observers = [];
  for (const [type, list] of [['longtask',tasks],['paint',paints],['largest-contentful-paint',lcp]]) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    const observer = new PerformanceObserver(entries => list.push(...entries.getEntries()));
    observer.observe({type, buffered:true}); observers.push(observer);
  }
  let output;
  function snapshot(final = false) {
    if (!output) return;
    const ready = performance.getEntriesByName('cv:ready')[0]?.startTime ?? null;
    const cutoff = ready ?? performance.now();
    const relevant = tasks.filter(t => t.startTime < cutoff);
    const resources = performance.getEntriesByType('resource');
    const factories = performance.getEntriesByType('measure').filter(e=>e.name.startsWith('cv:factory:'));
    const nav = performance.getEntriesByType('navigation')[0];
    output.textContent = JSON.stringify({page:location.pathname, final,
      elapsedMs:performance.now(), readyMs:ready,
      firstCanvasFrameMs:performance.getEntriesByName('cv:canvas-frame')[0]?.startTime ?? null,
      domContentLoadedMs:nav?.domContentLoadedEventEnd, loadMs:nav?.loadEventEnd,
      fcpMs:paints.find(p=>p.name==='first-contentful-paint')?.startTime ?? null,
      lcpMs:lcp.at(-1)?.startTime ?? null,
      longTasksBeforeReady:relevant.length,
      blockingMsBeforeReady:relevant.reduce((sum,t)=>sum+Math.max(0,t.duration-50),0),
      longTasksInWindow:tasks.length,
      blockingMsInWindow:tasks.reduce((sum,t)=>sum+Math.max(0,t.duration-50),0),
      lastResourceEndMs:Math.max(0,...resources.map(r=>r.responseEnd)),
      maxTaskMs:Math.max(0,...relevant.map(t=>t.duration)),
      sameOriginResources:resources.filter(r=>r.name.startsWith(location.origin)).length,
      sameOriginTransferBytes:resources.filter(r=>r.name.startsWith(location.origin)).reduce((sum,r)=>sum+r.transferSize,0),
      factories:factories.map(e=>({name:e.name.slice(11),startMs:e.startTime,durationMs:e.duration})),
      hidden:document.hidden, viewport:[innerWidth,innerHeight], dpr:devicePixelRatio});
  }
  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.createElement('details'); panel.open = true;
    panel.style.cssText='display:none;position:fixed;bottom:0;left:0;z-index:2147483647;background:#fff;color:#111;max-width:600px;font:12px monospace;padding:8px;max-height:170px;overflow:auto';
    const summary = document.createElement('summary'); summary.textContent='Local startup measurements';
    output=document.createElement('output'); output.id='startup-measurements';
    output.style.cssText='display:block;white-space:pre-wrap';
    panel.append(summary,output); document.body.append(panel);
    if (location.pathname === '/') {
      const hero = document.querySelector('.scene-artwork');
      const paintReady = () => requestAnimationFrame(()=>requestAnimationFrame(()=>performance.mark('cv:ready')));
      if (!hero || (hero.complete && hero.naturalWidth > 0)) paintReady(); else hero.addEventListener('load',paintReady,{once:true});
    }
    snapshot();
    const timer = setInterval(()=>snapshot(),500);
    setTimeout(()=>{clearInterval(timer);snapshot(true);observers.forEach(o=>o.disconnect());panel.style.display='block';},15000);
  }, {once:true});
})();
