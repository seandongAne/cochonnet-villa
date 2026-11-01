import { useEffect, useMemo, useRef, useState } from 'react';
import { WallPoster } from './MovieNight.jsx';
import { galleryWorks, galleryPage, GALLERY_SLOTS, GALLERY_FRAME_SIZE, artworkLabel, formatGalleryTimestamp, timestampLabel } from './gallery.js';

export function GalleryWall({ page, onSelect }) {
  const works = useMemo(() => galleryPage(galleryWorks, page).map(work => ({
    id: work.id, title: artworkLabel(work), poster: work.thumbnail,
    note: timestampLabel(work) + ' · ' + formatGalleryTimestamp(work),
  })), [page]);
  return <group>{works.map((work, index) => <WallPoster key={work.id} movie={work} slot={GALLERY_SLOTS[index]} bounds={GALLERY_FRAME_SIZE} labelOffset={-.72} labelSize={[1.65, .18]} onSelect={onSelect} />)}</group>;
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
  if (!work) return null;
  return <dialog ref={dialog} className="lu-gallery-viewer" aria-labelledby="lu-gallery-title" onCancel={onClose}
    onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}
    onKeyDown={event => { event.stopPropagation(); if (event.key === 'ArrowRight') { event.preventDefault(); advance(1); } if (event.key === 'ArrowLeft') { event.preventDefault(); advance(-1); } }}>
    <header><div><p className="lu-eyebrow">THE LITTLE GALLERY</p><h2 id="lu-gallery-title">一幅一刻</h2></div><button className="lu-pill" autoFocus onClick={onClose} aria-label="关闭画作">回到画廊 ×</button></header>
    <div className="lu-gallery-art"><GalleryImage key={work.id} work={work} /></div>
    <div className="lu-gallery-meta" aria-live="polite"><div><strong>{artworkLabel(work)}</strong><p>{timestampLabel(work)} <time dateTime={work.timestamp}>{formatGalleryTimestamp(work)}</time></p><small>America/Toronto</small></div><div className="lu-gallery-pages"><button className="lu-pill" onClick={() => advance(-1)} aria-label="上一幅作品">←</button><span>{index + 1} / {galleryWorks.length}</span><button className="lu-pill" onClick={() => advance(1)} aria-label="下一幅作品">→</button></div></div>
    <nav className="lu-gallery-thumbnails" aria-label="选择画作">{galleryWorks.map((item, i) => <button key={item.id} ref={index === i ? selectedThumbnail : null} aria-label={artworkLabel(item)} aria-pressed={index === i} onClick={() => setIndex(i)}><img src={item.thumbnail} width={120} height={80} loading="lazy" alt="" /><span>{String(item.number).padStart(3, '0')}</span></button>)}</nav>
  </dialog>;
}
