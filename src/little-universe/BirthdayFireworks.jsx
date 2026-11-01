import { useEffect, useRef } from 'react';

// Screen-space fireworks stay crisp even when WebGL is unavailable.
const bursts = [
  { x: .16, y: .25, delay: 0, color: '#f4d293' },
  { x: .83, y: .33, delay: 1.9, color: '#eeb5c4' },
  { x: .24, y: .65, delay: 3.8, color: '#b8d8c4' },
  { x: .77, y: .69, delay: 5.7, color: '#f4d293' },
  { x: .5, y: .12, delay: 7.6, color: '#d6c7ed' },
];

export default function BirthdayFireworks({ reducedMotion }) {
  const canvas = useRef();
  useEffect(() => {
    const element = canvas.current;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    let width = 0, height = 0, frame = 0, previous = 0, elapsed = 0;
    function draw() {
      ctx.clearRect(0, 0, width, height);
      const radius = Math.min(width * .19, height * .21, 190);
      for (const burst of bursts) {
        const age = reducedMotion ? 2 : (elapsed - burst.delay + 12) % 12;
        if (age > 4.8) continue;
        const x = width * burst.x, y = height * burst.y;
        ctx.strokeStyle = burst.color; ctx.fillStyle = burst.color;
        if (age < 1) {
          const rocketY = y + (1 - age) ** 2 * height * .44;
          ctx.globalAlpha = Math.sin(age * Math.PI) * .7;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x, rocketY); ctx.lineTo(x, rocketY + 26); ctx.stroke();
          continue;
        }
        const t = (age - 1) / 3.8;
        const spread = (1 - Math.exp(-3.5 * t)) * radius;
        const fall = t * t * radius * .48;
        ctx.globalAlpha = reducedMotion ? .28 : Math.min(1, t * 12) * (1 - t) ** 1.6;
        for (let i = 0; i < 64; i++) {
          const angle = i * Math.PI * 2 / 64;
          const length = i % 3 === 0 ? .65 : 1;
          const dx = Math.cos(angle) * spread * length;
          const dy = Math.sin(angle) * spread * length;
          ctx.lineWidth = i % 3 === 0 ? 1 : 1.6;
          ctx.beginPath(); ctx.moveTo(x + dx * .84, y + dy * .84 + fall);
          ctx.lineTo(x + dx, y + dy + fall); ctx.stroke();
          ctx.beginPath(); ctx.arc(x + dx, y + dy + fall, 1.3, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    function resize() {
      const rect = element.getBoundingClientRect(); width = rect.width; height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * dpr); element.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
    }
    function tick(now) {
      if (previous) elapsed += Math.min((now - previous) / 1000, .05);
      previous = now; draw(); frame = requestAnimationFrame(tick);
    }
    function visibility() {
      cancelAnimationFrame(frame); previous = 0;
      if (!document.hidden && !reducedMotion) frame = requestAnimationFrame(tick);
    }
    const observer = new ResizeObserver(resize); observer.observe(element); resize(); visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, [reducedMotion]);
  return <canvas ref={canvas} className="lu-birthday-fireworks" aria-hidden="true" />;
}
