import { VILLA_RETURN_URL } from '../villa-map/little-universe-gateway.js';
import { vinylRecords } from './vinyl-records.js';
import { Component, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PCFShadowMap } from 'three';
import UniverseScene from './UniverseScene.jsx';
import { birthday, landmarks, movies, musicals, series, visitLandmark } from './content.js';
import { ModelViewer } from './CollectionModels.jsx';
import { collectionModels } from './collection-models.js';
import { ROOM_IDS } from './rooms.js';
import { MoviePosterViewer } from './MovieNight.jsx';
import { MusicalPosterViewer } from './MusicWorld.jsx';
import { SeriesViewer } from './OneMoreEpisode.jsx';

class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return reduced;
}

function Icon({ type, ...props }) {
  const paths = {
    camping: <><path d="m3 20 9-16 9 16H3Z" /><path d="m8 20 4-8 4 8M10 4l3-2" /></>,
    music: <><circle cx="11" cy="12" r="8" /><circle cx="11" cy="12" r="2" /><path d="M16 4h5v11l-3 3M6 12a5 5 0 0 1 5-5" /></>,
    workshop: <><path d="m4 20 9-9m-3-6a5 5 0 0 0 7 7l4-4-5 1-1-5-5 1Z" /><circle cx="5" cy="19" r="2" /></>,
    museum: <><path d="m2 8 10-5 10 5H2ZM3 21h18M5 10v8m5-8v8m4-8v8m5-8v8M2 19h20" /></>,
    'movie-night': <><path d="M3 8h18v13H3ZM3 8V4h18v4M7 4l-3 4m9-4-3 4m9-4-3 4" /><path d="m10 12 5 3-5 3v-6Z" /></>,
    'one-more-episode': <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="m8 2 4 4 4-4M8 22h8" /></>,
    sound: <><path d="M4 10v4h4l5 4V6l-5 4H4Zm12-2a7 7 0 0 1 0 8m3-11a11 11 0 0 1 0 14" /></>,
    reset: <><path d="M4 9a8 8 0 1 1 0 7M4 4v5h5" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[type]}</svg>;
}

// Scene navigation and room-specific actions; posters have an accessible viewer.
function LocationFocus({ place, onClose, onSelect, unavailable, roomPhase, onEnter, roomInput, spinning, onSpin, reducedMotion, onPoster, onResetView }) {
  const back = useRef();
  const inside = roomPhase === 'inside';
  const opening = roomPhase === 'opening';
  useEffect(() => { back.current?.focus({ preventScroll: true }); }, [inside]);
  useEffect(() => {
    const key = (event) => { if (event.key === 'Escape' && !event.target?.closest?.('dialog')) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return <section className={`lu-focus-ui ${inside ? 'is-inside' : ''} ${['movie-night', 'one-more-episode'].includes(place.id) ? 'is-cinema' : ''} ${place.id === 'music' ? 'is-music' : ''} ${['workshop', 'museum'].includes(place.id) ? 'is-collection' : ''}`} aria-label={inside ? `${place.name} interior` : 'Location focus'}>
    <button ref={back} className="lu-focus-back" onClick={onClose}>← {inside ? 'Step outside' : 'Back to planet'} <span>Esc</span></button>
    <div className="lu-focus-caption" aria-live="polite">
      <p className="lu-eyebrow">{inside ? 'COME IN. STAY A WHILE.' : 'A LITTLE CLOSER'}</p>
      <h2>{place.name}</h2><p>{place.subtitle}</p>
      {place.id === 'camping' && <div className="lu-camp-view-controls"><small>Drag to look around · Scroll or pinch to zoom</small><button className="lu-pill" disabled={unavailable} onClick={onResetView}>Reset view ↺</button></div>}
      {!inside && place.entranceNote && <small className="lu-entrance-note">{place.entranceNote}</small>}
      {unavailable && <p role="status">3D is unavailable. Return to the planet to retry.</p>}
      {!inside && ROOM_IDS.includes(place.id) && <button className="lu-enter-room lu-pill" disabled={unavailable || opening} onClick={onEnter}>{opening ? 'Opening the door…' : 'Open the door & step inside'} <span>↗</span></button>}
      {inside && place.id === 'music' && <div className="lu-record-controls"><button className="lu-pill" onClick={() => onPoster(musicals[0].id)}>Browse {musicals.length} musicals <span>↗</span></button><button className="lu-pill" onClick={() => onPoster(vinylRecords[0].id)}>Browse {vinylRecords.length} records <span>↗</span></button><button className="lu-pill" aria-pressed={spinning} onClick={onSpin}>{spinning ? 'Stop the vinyl' : 'Spin the vinyl'}</button><small>{reducedMotion ? 'Our vinyl & theatre collection · reduced motion is on' : 'Our vinyl. Our nights at the theatre.'}</small></div>}
      {inside && place.id === 'movie-night' && <div className="lu-record-controls"><button className="lu-pill" onClick={() => onPoster(movies[0].id)}>Browse {movies.length} movie posters <span>↗</span></button><small>Tap a holographic poster, or explore the whole collection</small></div>}
      {inside && place.id === 'one-more-episode' && <div className="lu-record-controls"><button className="lu-pill" onClick={() => onPoster(series[0].id)}>Browse {series.length} series <span>↗</span></button><small>Our favorite worlds, one episode at a time</small></div>}
      {inside && ['workshop', 'museum'].includes(place.id) && <div className="lu-record-controls"><button className="lu-pill" onClick={() => onPoster(collectionModels.find(item => item.room === place.id && (place.id !== 'museum' || item.id === 'ru-winter-su100')).id)}>Explore the collection ↗</button><small>{place.id === 'workshop' ? 'Five creations by Sean · Turn toward the entrance' : 'Tap a model to turn it around and look closer'}</small></div>}
      <nav aria-label="Focus another location">{landmarks.map((item) => <button key={item.id} aria-label={`Focus ${item.name}`} aria-pressed={item.id === place.id} onClick={() => onSelect(item.id)}><Icon type={item.id} /></button>)}</nav>
    </div>
    {inside && <div className="lu-room-navigation">
      <p>Drag to look · Hold arrows to move<br /><span>WASD to walk · Arrow keys to walk & turn</span></p>
      <div className="lu-room-pad" aria-label="Room movement controls">{[['turn-left', '↶', 'Turn left'], ['forward', '↑', 'Walk forward'], ['turn-right', '↷', 'Turn right'], ['left', '←', 'Step left'], ['back', '↓', 'Walk backward'], ['right', '→', 'Step right']].map(([direction, glyph, label]) => <button key={direction} aria-label={label}
        onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); roomInput.current = direction; }}
        onPointerUp={() => { roomInput.current = null; }} onPointerCancel={() => { roomInput.current = null; }} onLostPointerCapture={() => { roomInput.current = null; }}
        onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); roomInput.current = direction; } }}
        onKeyUp={() => { roomInput.current = null; }} onBlur={() => { roomInput.current = null; }}>{glyph}</button>)}</div>
    </div>}
    {opening && <div className="lu-door-transition" aria-hidden="true" />}
  </section>;
}

function SoundButton() {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const pause = () => { if (document.hidden) { audio.current?.pause(); setPlaying(false); } };
    document.addEventListener('visibilitychange', pause);
    return () => { document.removeEventListener('visibilitychange', pause); audio.current?.pause(); };
  }, []);
  async function toggle() {
    if (!birthday.audio) return;
    if (!audio.current) { audio.current = new Audio(birthday.audio); audio.current.loop = true; audio.current.volume = 0.35; }
    if (playing) { audio.current.pause(); setPlaying(false); }
    else { try { await audio.current.play(); setPlaying(true); setFailed(false); } catch { setFailed(true); setPlaying(false); } }
  }
  return <div className="lu-sound-wrap"><button className="lu-sound" aria-pressed={playing} disabled={!birthday.audio} onClick={toggle} title={birthday.audio ? 'Optional birthday soundtrack' : 'Add a soundtrack in content.js'}><Icon type="sound" /><span>{playing ? 'Sound on' : 'Sound off'}</span></button>{failed && <span role="status">Audio unavailable</span>}</div>;
}

function Finale({ reducedMotion, onClose }) {
  const [revealed, setRevealed] = useState(reducedMotion);
  const close = useRef();
  useEffect(() => { close.current?.focus(); const timer = setTimeout(() => setRevealed(true), reducedMotion ? 0 : 1700); return () => clearTimeout(timer); }, [reducedMotion]);
  useEffect(() => { const key = (event) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [onClose]);
  return <section className={`lu-finale ${revealed ? 'is-revealed' : ''}`} aria-labelledby="birthday-title">
    <div className="lu-finale-stars" aria-hidden="true">✧ <span>✦</span> ✧</div>
    <p className="lu-eyebrow">THE UNIVERSE IS A LITTLE BRIGHTER WITH YOU IN IT</p>
    <h2 id="birthday-title">Happy birthday,<br /><em>{birthday.recipient}.</em></h2>
    <p className="lu-birthday-message">{birthday.message}</p><p className="lu-signature">{birthday.signature}</p>
    <button ref={close} className="lu-pill" onClick={onClose}>Stay a little longer <span>↗</span></button>
  </section>;
}

export default function LittleUniverse() {
  const reducedMotion = useReducedMotion();
  const [visited, setVisited] = useState([]);
  const [selected, setSelected] = useState(null);
  const [finale, setFinale] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [retry, setRetry] = useState(0);
  const [roomPhase, setRoomPhase] = useState('outside');
  const [spinning, setSpinning] = useState(false);
  const [posterId, setPosterId] = useState(null);
  const roomInput = useRef(null);
  const wishButton = useRef();
  const returnFocus = useRef(null);
  const onReady = useCallback(() => setReady(true), []);
  const onFailure = useCallback(() => { setFailed(true); setReady(false); }, []);
  const visit = useCallback((id) => {
    if (!selected) returnFocus.current = document.activeElement;
    roomInput.current = null; setRoomPhase('outside'); setSpinning(false); setPosterId(null);
    setSelected(id); setVisited((current) => visitLandmark(current, id));
  }, [selected]);
  const leaveFocus = useCallback(() => {
    roomInput.current = null; setRoomPhase('outside'); setSpinning(false); setPosterId(null); setSelected(null);
    requestAnimationFrame(() => {
      const previous = returnFocus.current;
      if (previous instanceof HTMLElement && previous.isConnected && previous.matches('button, a, [tabindex]')) previous.focus({ preventScroll: true });
      else document.querySelector('[data-location]')?.focus({ preventScroll: true });
    });
  }, []);
  const enterRoom = useCallback(() => { if (ROOM_IDS.includes(selected) && roomPhase === 'outside' && ready && !failed) setRoomPhase('opening'); }, [selected, roomPhase, ready, failed]);
  const exitRoom = useCallback(() => { roomInput.current = null; setRoomPhase('outside'); setSpinning(false); setPosterId(null); }, []);
  const openPoster = useCallback((id) => { roomInput.current = null; setPosterId(id); }, []);
  const spin = useCallback(() => setSpinning((value) => !value), []);
  useEffect(() => {
    if (roomPhase !== 'opening') return;
    const timer = setTimeout(() => setRoomPhase('inside'), reducedMotion ? 0 : 850);
    return () => clearTimeout(timer);
  }, [roomPhase, selected, reducedMotion]);
  const wish = useCallback(() => { roomInput.current = null; setRoomPhase('outside'); setSpinning(false); setPosterId(null); setSelected(null); setFinale(true); }, []);
  const closeFinale = useCallback(() => { setFinale(false); setResetKey((i) => i + 1); requestAnimationFrame(() => wishButton.current?.focus()); }, []);
  useEffect(() => { setSlow(false); const timer = setTimeout(() => setSlow(true), 12000); return () => clearTimeout(timer); }, [retry]);
  const place = landmarks.find((item) => item.id === selected);
  useEffect(() => {
    if (!selected) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [selected]);
  return <main className={`lu-root ${finale ? 'is-finale' : ''} ${place ? 'is-focused' : ''} ${reducedMotion ? 'reduce-motion' : ''}`}>
    <header className="lu-header" inert={finale || !!place ? true : undefined}>
      <a className="lu-brand" href="/little-universe/" aria-label="The Little Universe home"><span className="lu-brand-orbit">✧</span><span>COCHONNET VILLA<small>A LITTLE BIRTHDAY EDITION</small></span></a>
      <div className="lu-header-actions"><a className="lu-villa-return" href={VILLA_RETURN_URL}>← 返回山庄</a><SoundButton /></div>
    </header>
    <div className="lu-introduction" inert={finale || !!place ? true : undefined}>
      <p className="lu-eyebrow"><span className="lu-tiny-star">✦</span> SOMEWHERE, JUST FOR YOU</p>
      <h1>The Little<br /><em>Universe.</em></h1>
      <p className="lu-dedication">A tiny world. <br />All our favorite things.</p>
      <p className="lu-intro-copy">A place for the places we’ve been,<br className="lu-desktop-break" /> the things we’ve made, and all the<br className="lu-desktop-break" /> little moments in between.</p>
      <button ref={wishButton} className="lu-wish" onClick={wish}><span>✧</span> There’s a wish waiting for you <span>↗</span></button>
      <div className="lu-love-note"><span />made of memories & a little stardust</div>
    </div>
    <div className="lu-canvas-wrap" aria-label={roomPhase === 'inside' ? `Inside ${place.name}. Drag to look, use WASD or the movement buttons to walk. Escape steps outside.` : place ? `3D close-up of ${place.name}. ${place.id === 'camping' ? 'Drag to look around, scroll or pinch to zoom. ' : ''}Use Back to planet or Escape to return.` : 'Interactive miniature planet. Drag to rotate, scroll or pinch to zoom. Use the location buttons below for keyboard exploration.'} inert={finale ? true : undefined}>
      {!failed && <SceneBoundary key={retry} onFailure={onFailure}>
        <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} camera={{ position: [0, 3.8, 11.8], fov: 42, near: 0.1, far: 80 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} fallback={<span>Explore the memories using the buttons below.</span>}>
          <UniverseScene visited={visited} onVisit={visit} onWish={wish} reducedMotion={reducedMotion} finale={finale} selected={selected} resetKey={resetKey} onReady={onReady} onFailure={onFailure} roomPhase={roomPhase} onEnter={enterRoom} onExitRoom={exitRoom} roomInput={roomInput} spinning={spinning} onSpin={spin} onPoster={openPoster} posterOpen={!!posterId} />
        </Canvas>
      </SceneBoundary>}
      {(!ready || failed) && <div className="lu-loading" role="status"><span>✧</span><p>{failed ? 'The stars need a little rest.' : slow ? 'This little world is taking a moment.' : 'Planting trees. Hanging stars…'}</p><small>{failed || slow ? 'You can retry this little world below.' : 'Your little universe is on its way.'}</small>{(failed || slow) && <button className="lu-pill" onClick={() => { setFailed(false); setReady(false); setRetry((n) => n + 1); }}>Try 3D again</button>}</div>}
    </div>
    <div className="lu-world-caption" inert={finale || !!place ? true : undefined}><span>YOUR OWN LITTLE CORNER OF THE COSMOS</span><div><span>↔</span> Drag to wander <i>·</i> Scroll or pinch to get closer<button onClick={() => setResetKey((n) => n + 1)} aria-label="Reset planet view" title="Reset view"><Icon type="reset" /></button></div></div>
    <section className="lu-destinations" aria-label="Explore our favorite places" inert={finale || !!place ? true : undefined}>
      <div className="lu-section-caption"><p>{landmarks.length} LITTLE PLACES. <span>ONE BIG LOVE.</span></p><p role="status" aria-live="polite">{visited.length ? `${visited.length} of ${landmarks.length} memories glowing` : 'No right way to wander'}</p></div>
      <div className="lu-cards">{landmarks.map((item) => <button className={`lu-card ${visited.includes(item.id) ? 'is-visited' : ''}`} key={item.id} data-location={item.id} onClick={() => visit(item.id)} style={{ '--place-color': item.color }}>
        <span className="lu-card-icon"><Icon type={item.id} /></span><span className="lu-card-copy"><small><span>{visited.includes(item.id) ? '✦ A MEMORY ALIGHT' : item.zh}</span></small><strong>{item.name}</strong><span>{item.subtitle}</span></span><span className="lu-card-arrow">↗</span>
      </button>)}</div>
    </section>
    <footer className="lu-footer" inert={finale || !!place ? true : undefined}><span>A SMALL WORLD, MADE WITH A VERY FULL HEART.</span><span>For you. Always. <i>♡</i></span></footer>
    {place && <LocationFocus place={place} onClose={roomPhase === 'inside' ? exitRoom : leaveFocus} onSelect={visit} unavailable={failed || slow && !ready} roomPhase={roomPhase} onEnter={enterRoom} roomInput={roomInput} spinning={spinning} onSpin={spin} reducedMotion={reducedMotion} onPoster={openPoster} onResetView={() => setResetKey((n) => n + 1)} />}
    {posterId && (['workshop', 'museum'].includes(selected) ? <ModelViewer initialId={posterId} onClose={() => setPosterId(null)} /> : selected === 'one-more-episode' ? <SeriesViewer initialId={posterId} onClose={() => setPosterId(null)} /> : selected === 'music' ? <MusicalPosterViewer initialId={posterId} onClose={() => setPosterId(null)} /> : <MoviePosterViewer initialId={posterId} onClose={() => setPosterId(null)} />)}
    {finale && <Finale reducedMotion={reducedMotion} onClose={closeFinale} />}
  </main>;
}
