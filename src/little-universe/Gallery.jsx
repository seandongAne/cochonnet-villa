import { GallerySpace } from './GallerySpace.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WallPoster } from './MovieNight.jsx';
import { galleryWorks, weeklyGalleryWorks, GALLERY_SLOTS, artworkLabel, formatGalleryTimestamp, timestampLabel } from './gallery.js';

export function GalleryWall({ week, onSelect }) {
  const works = useMemo(() => weeklyGalleryWorks(galleryWorks, week).map(work => ({
    id: work.id, title: artworkLabel(work), poster: work.thumbnail,
    note: timestampLabel(work) + ' · ' + formatGalleryTimestamp(work),
  })), [week]);
  return <group>{works.map((work, index) => <GalleryArtwork key={work.id} work={work} slot={GALLERY_SLOTS[index]} onSelect={onSelect} />)}</group>;
}

function GalleryArtwork({ work, slot, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const [w, h] = slot.size;
  return <group onPointerOver={event => { event.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)}>
    <WallPoster movie={work} slot={slot} bounds={slot.size} labelOffset={-h / 2 - .25}
      labelSize={[1.35, .16]} labelBackground="#f7f2e9" labelColor="#766b59" onSelect={onSelect} />
    <group position={slot.position} rotation={[0, slot.rotation, 0]} visible={hovered}>
      {[[0, (h + .22) / 2, w + .24, .018], [0, -(h + .22) / 2, w + .24, .018],
        [-(w + .22) / 2, 0, .018, h + .24], [(w + .22) / 2, 0, .018, h + .24]].map(([x, y, width, height], i) =>
        <mesh key={i} position={[x, y, .052]} raycast={() => null}><planeGeometry args={[width, height]} /><meshBasicMaterial color="#ddbd75" transparent opacity={.85} toneMapped={false} /></mesh>)}
    </group>
  </group>;
}

function GalleryImage({ work }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="lu-gallery-error" role="status"><p>这幅画暂时没有加载出来。</p><button className="lu-pill" onClick={() => setFailed(false)}>再试一次</button></div>
    : <img src={work.image} width={work.width} height={work.height} alt={artworkLabel(work)} onError={() => setFailed(true)} />;
}

export function GalleryViewer({ initialId, onClose }) {
  const dialog = useRef();
  const selectedThumbnail = useRef();
  const [index, setIndex] = useState(() => Math.max(0, galleryWorks.findIndex(work => work.id === initialId)));
  const work = galleryWorks[index];
  const advance = step => setIndex(value => (value + step + galleryWorks.length) % galleryWorks.length);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement;
    element.showModal();
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { selectedThumbnail.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [index]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame;
    const reset = () => {
      cancelAnimationFrame(frame);
      element.style.setProperty('--look-x', '0');
      element.style.setProperty('--look-y', '0');
    };
    const move = event => {
      if (motion.matches || event.pointerType !== 'mouse') return;
      cancelAnimationFrame(frame);
      const r = element.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - r.left) / r.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - r.top) / r.height * 2 - 1));
      frame = requestAnimationFrame(() => {
        element.style.setProperty('--look-x', String(x));
        element.style.setProperty('--look-y', String(y));
      });
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', reset);
    motion.addEventListener('change', reset);
    return () => {
      reset(); element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', reset); motion.removeEventListener('change', reset);
    };
  }, []);
  if (!work) return null;
  const previousWork = galleryWorks[(index - 1 + galleryWorks.length) % galleryWorks.length];
  const nextWork = galleryWorks[(index + 1) % galleryWorks.length];
  return <dialog ref={dialog} className="lu-gallery-viewer" aria-label="画作浏览" onCancel={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => { event.stopPropagation(); if (event.key === 'ArrowRight') { event.preventDefault(); advance(1); } if (event.key === 'ArrowLeft') { event.preventDefault(); advance(-1); } }}>
    <GallerySpace />
    <button className="lu-gallery-icon lu-gallery-close" autoFocus onClick={onClose} aria-label="关闭画作">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
    </button>
    <div className="lu-gallery-stage">
      {galleryWorks.length > 1 && <div className="lu-gallery-distant" aria-hidden="true">
        <img className="is-previous" src={previousWork.thumbnail} alt="" />
        <img className="is-next" src={nextWork.thumbnail} alt="" />
      </div>}
      <div className="lu-gallery-art" key={work.id}><GalleryImage work={work} /></div>
      <button className="lu-gallery-icon lu-gallery-previous" onClick={() => advance(-1)} aria-label="上一幅作品">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg>
      </button>
      <button className="lu-gallery-icon lu-gallery-next" onClick={() => advance(1)} aria-label="下一幅作品">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5 7 7-7 7" /></svg>
      </button>
    </div>
    <footer className="lu-gallery-footer">
      <p className="lu-gallery-meta" aria-live="polite"><span>{timestampLabel(work)}</span><time dateTime={work.timestamp}>{formatGalleryTimestamp(work)}</time></p>
      <nav className="lu-gallery-thumbnails" aria-label="选择画作">{galleryWorks.map((item, i) => <button key={item.id} ref={index === i ? selectedThumbnail : null} aria-label={artworkLabel(item)} aria-pressed={index === i} onClick={() => setIndex(i)}><img src={item.thumbnail} width={120} height={80} loading="lazy" alt="" /></button>)}</nav>
    </footer>
  </dialog>;
}
