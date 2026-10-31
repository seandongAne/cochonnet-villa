import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { movies } from './content.js';
import { fitPoster, MOVIE_POSTER_SLOTS } from './movie-night.js';
import { createPosterHologram } from './poster-hologram.js';

function labelTexture(title, subtitle = '', background = '#ead2a5', color = '#4d303c', portrait = false, aspect = 4, vertical = false) {
  const canvas = document.createElement('canvas');
  canvas.width = portrait ? 512 : 1024; canvas.height = portrait ? 768 : Math.round(1024 / aspect);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (vertical) {
    ctx.font = `600 ${Math.round(Math.min(canvas.width * .6, canvas.height / (title.length + 1) * .8))}px "Segoe UI", sans-serif`;
    [...title].forEach((letter, i) => ctx.fillText(letter, canvas.width / 2, canvas.height * (i + 1) / (title.length + 1)));
  } else {
  let size = portrait ? 48 : Math.round(canvas.height * (subtitle ? .34 : .52));
  do { ctx.font = `500 ${size}px Georgia, serif`; size -= 2; } while (ctx.measureText(title).width > canvas.width * .88 && size > 18);
  ctx.fillText(title, canvas.width / 2, canvas.height * (subtitle ? .4 : .5));
  if (subtitle) { ctx.font = `${portrait ? 23 : Math.round(canvas.height * .2)}px "Segoe UI", sans-serif`; ctx.fillText(subtitle, canvas.width / 2, canvas.height * .77); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function CinemaSign({ title = 'THE MIDNIGHT MATINEE', subtitle = '', size = [.9, .13], background = '#ead2a5', color = '#4d303c', vertical = false, ...props }) {
  const [texture, setTexture] = useState(null);
  const aspect = size[0] / size[1];
  useEffect(() => {
    const map = labelTexture(title, subtitle, background, color, false, aspect, vertical); setTexture(map);
    return () => map.dispose();
  }, [title, subtitle, aspect, background, color, vertical]);
  return <mesh {...props}><planeGeometry args={size} /><meshBasicMaterial key={texture?.uuid || 'loading'} map={texture} color={texture ? '#ffffff' : '#ead2a5'} toneMapped={false} /></mesh>;
}

function usePosterTexture(movie) {
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    let active = true;
    const fallback = labelTexture(movie.title, 'Poster unavailable', '#312635', '#e8c994', true);
    setTexture(fallback);
    const requested = new THREE.TextureLoader().load(movie.poster, (loaded) => {
      if (!active) { loaded.dispose(); return; }
      loaded.colorSpace = THREE.SRGBColorSpace; setTexture(loaded);
    }, undefined, () => { /* The named fallback keeps this frame readable. */ });
    return () => { active = false; fallback.dispose(); requested.dispose(); };
  }, [movie]);
  return texture;
}

export function WallPoster({ movie, slot, onSelect, bounds, labelOffset = -.91, labelSize = [.92, .145], labelBackground, labelColor }) {
  const texture = usePosterTexture(movie);
  const image = texture?.image;
  const size = fitPoster(image?.width, image?.height, bounds);
  return <group position={slot.position} rotation={[0, slot.rotation, 0]}>
    <mesh position={[0, 0, .065]} onClick={(event) => { event.stopPropagation(); if (event.delta < 6) onSelect(movie.id); }}>
      <planeGeometry args={size} /><meshBasicMaterial key={texture?.uuid || 'loading'} map={texture} color={texture ? '#ffffff' : '#312635'} toneMapped={false} />
    </mesh>
    <CinemaSign title={movie.title} subtitle={movie.note || (movie.year ? String(movie.year) : 'Seen together')} background={labelBackground} color={labelColor} size={labelSize} position={[0, labelOffset, .04]} />
  </group>;
}

function HolographicPoster({ movie, slot, onSelect, reducedMotion, paused }) {
  const texture = usePosterTexture(movie);
  const [projection, setProjection] = useState(null);
  const elapsed = useRef(0);
  useEffect(() => {
    if (!texture) return;
    const image = texture.image;
    const next = createPosterHologram(texture, fitPoster(image?.width, image?.height));
    setProjection(next);
    return () => next.dispose();
  }, [texture]);
  useFrame((_, delta) => {
    if (!paused && !reducedMotion) elapsed.current += Math.min(delta, .05);
    projection?.update(elapsed.current, reducedMotion);
  });
  return <group position={slot.position} rotation={[0, slot.rotation, 0]}>
    {projection && <primitive object={projection.root} dispose={null} onClick={(event) => { event.stopPropagation(); if (event.delta < 6) onSelect(movie.id); }} />}
    <CinemaSign title={movie.title} subtitle={movie.note || String(movie.year)} background="#152c34" color="#b9eff1" size={[1.08, .18]} position={[0, -1.39, .32]} />
  </group>;
}

export function CinemaPosters({ onSelect, reducedMotion, paused }) {
  return <group>
    <CinemaSign title="OUR FAVORITE STORIES" size={[2.8, .12]} position={[0, 2.64, -2.24]} />
    {MOVIE_POSTER_SLOTS.map((slot) => {
      const movie = movies.find((item) => item.id === slot.id);
      return movie ? <HolographicPoster key={movie.id} movie={movie} slot={slot} onSelect={onSelect} reducedMotion={reducedMotion} paused={paused} /> : null;
    })}
  </group>;
}

function PosterImage({ movie, mediaType }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="lu-poster-fallback" role="status"><span>✧</span><strong>{movie.title}</strong><p>The poster couldn’t load.</p><button className="lu-pill" onClick={() => setFailed(false)}>Try again</button></div>
    : <img src={movie.poster} alt={`${movie.title}${movie.year ? ` (${movie.year})` : ''} ${mediaType} artwork`} onError={() => setFailed(true)} />;
}

export function PosterViewer({ initialId, onClose, collection, heading, subtitle, returnLabel, dedication, mediaType, listLabel }) {
  const dialog = useRef();
  const [index, setIndex] = useState(() => Math.max(0, collection.findIndex((movie) => movie.id === initialId)));
  const movie = collection[index];
  const advance = (step) => setIndex((value) => (value + step + collection.length) % collection.length);
  useEffect(() => {
    const element = dialog.current; const previous = document.activeElement;
    element.showModal();
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="lu-poster-viewer" aria-labelledby="lu-poster-title" onCancel={onClose}
    onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}
    onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'ArrowRight') { event.preventDefault(); advance(1); } if (event.key === 'ArrowLeft') { event.preventDefault(); advance(-1); } }}>
    <header><div><p className="lu-eyebrow">{heading}</p><span>{subtitle}</span></div><button className="lu-pill" onClick={onClose} autoFocus aria-label="Close poster viewer">{returnLabel} <span>×</span></button></header>
    <div className="lu-poster-feature">
      <div className="lu-poster-art"><PosterImage key={movie.id} movie={movie} mediaType={mediaType} /></div>
      <div className="lu-poster-story" aria-live="polite">
        <p className="lu-eyebrow">{String(index + 1).padStart(2, '0')} / {String(collection.length).padStart(2, '0')} · ON OUR WALL</p>
        <h2 id="lu-poster-title">{movie.title}</h2><p className="lu-poster-year">{movie.year || 'Seen together'}{movie.status ? ` · ${movie.status}` : ''}</p>
        {movie.note && <p className="lu-poster-favorite">♡ {movie.note}</p>}
        {movie.primaryText ? <div className="lu-poster-copy">
          <p className="lu-poster-copy-kind">{{ quote: 'Dialogue', lyric_excerpt: 'Lyric excerpt', official_tagline: 'Promotional tagline', on_screen_text: 'On-screen text' }[movie.primaryTextType]}</p>
          <blockquote>{movie.primaryText}</blockquote>
          {movie.attribution && <p className="lu-poster-attribution">— {movie.attribution}</p>}
          <p className="lu-poster-editorial-label">Curator’s note · Original reflection</p>
          <p className="lu-poster-editorial">{movie.originalBlurb}</p>
        </div> : <p className="lu-poster-dedication">{dedication}</p>}
        <div className="lu-poster-arrows"><button className="lu-pill" onClick={() => advance(-1)} aria-label="Previous poster">←</button><button className="lu-pill" onClick={() => advance(1)} aria-label="Next poster">→</button></div>
      </div>
    </div>
    <nav className="lu-poster-list" aria-label={listLabel}>{collection.map((item, i) => <button key={item.id} aria-pressed={i === index} onClick={() => setIndex(i)}><span>{String(i + 1).padStart(2, '0')}</span>{item.title}{item.note && <i aria-label={item.note}>♡</i>}</button>)}</nav>
  </dialog>;
}

export function MoviePosterViewer(props) {
  return <PosterViewer {...props} collection={movies} heading="THE MIDNIGHT MATINEE" subtitle="The stories we watched together." returnLabel="Back to the cinema" dedication="The best seat is the one next to you." mediaType="film" listLabel="Choose a movie poster" />;
}
