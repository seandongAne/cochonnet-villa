import BirthdayFireworks from './BirthdayFireworks.jsx';
import { games } from './games.js';
import { GameCollectionViewer } from './GameRoom.jsx';
import { GAME_CONSOLES } from './game-room.js';
import { GalleryViewer } from './Gallery.jsx';
import { galleryWorks, GALLERY_EXHIBITION_SIZE } from './gallery.js';
import { useGalleryWeek } from './useGalleryWeek.js';
import { VILLA_RETURN_URL } from '../villa-map/little-universe-gateway.js';
import { vinylRecords } from './vinyl-records.js';
import { Component, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PCFShadowMap } from 'three';
import UniverseScene from './UniverseScene.jsx';
import { birthday, landmarks, movies, musicals, series, visitLandmark } from './content.js';
import { ModelViewer } from './CollectionModels.jsx';
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
    'game-room': <><path d="M7 7h10c3 0 5 10 3 11-2 1-4-3-5-3H9c-1 0-3 4-5 3-2-1 0-11 3-11Z" /><path d="M6 11h5m-2.5-2.5v5M16 10h.01M18 12h.01" /></>,
    gallery: <><rect x="3" y="3" width="18" height="18" rx="1" /><circle cx="9" cy="9" r="2" /><path d="m4 18 5-5 4 3 3-4 4 6" /></>,
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
function LocationFocus({ place, onClose, onSelect, unavailable, roomPhase, roomInput, spinning, onSpin, reducedMotion, onPoster, onResetView, galleryWeek, gameConsole, onGameConsole, gameId }) {
  const back = useRef();
  const inside = roomPhase === 'inside' || roomPhase === 'closing';
  const opening = roomPhase === 'opening';
  useEffect(() => { back.current?.focus({ preventScroll: true }); }, [inside]);
  useEffect(() => {
    const key = (event) => { if (event.key === 'Escape' && !event.target?.closest?.('dialog')) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return <section className={`lu-focus-ui ${inside ? 'is-inside' : ''} ${inside && place.id === 'workshop' ? 'is-atelier' : ''} ${['movie-night', 'one-more-episode', 'gallery', 'game-room'].includes(place.id) ? 'is-cinema' : ''} ${place.id === 'music' ? 'is-music' : ''} ${place.id === 'gallery' ? 'is-gallery' : ''} ${['workshop', 'museum'].includes(place.id) ? 'is-collection' : ''}`} aria-label={inside ? `${place.name} interior` : 'Location focus'}>
    <button ref={back} className="lu-focus-back" onClick={onClose}>← {inside ? 'Step outside' : 'Back to planet'} <span>Esc</span></button>
    <div className="lu-focus-caption" aria-live="polite">
      <p className="lu-eyebrow">{inside ? 'COME IN. STAY A WHILE.' : 'A LITTLE CLOSER'}</p>
      <h2>{place.name}</h2><p>{place.subtitle}</p>
      {!inside && <div className="lu-camp-view-controls"><small>Drag to explore · Scroll or pinch to zoom out and back in</small><button className="lu-pill" disabled={unavailable} onClick={onResetView}>Reset view ↺</button></div>}
      {!inside && place.entranceNote && <small className="lu-entrance-note">{place.entranceNote}</small>}
      {unavailable && <p role="status">3D is unavailable. Return to the planet to retry.</p>}
      {place.id === 'gallery' && <div className="lu-record-controls lu-gallery-controls">
        {galleryWorks.length ? <button className="lu-pill" onClick={() => onPoster(galleryWorks[0].id)}>浏览 {galleryWorks.length} 幅作品 ↗</button> : <small>第一幅作品正在路上。</small>}
        {inside && <small className="lu-gallery-weekly" aria-live="polite">本周随机展出 {Math.min(GALLERY_EXHIBITION_SIZE, galleryWorks.length)} 幅 · 每周一换展<br />{galleryWeek} 起 · 多伦多时间</small>}

      </div>}
      {place.id === 'game-room' && <div className="lu-record-controls"><button className="lu-pill" onClick={() => onPoster(gameId)}>浏览 {games.length} 款游戏 ↗</button></div>}
      {inside && place.id === 'game-room' && <div className="lu-record-controls lu-game-controls"><div role="group" aria-label="Choose a console">{GAME_CONSOLES.map(item => <button key={item.id} className="lu-pill" aria-pressed={gameConsole === item.id} onClick={() => onGameConsole(item.id)}>{item.name}</button>)}</div><small>Console shelf: {GAME_CONSOLES.find(item => item.id === gameConsole).name} · Make yourself at home.</small></div>}
      {inside && place.id === 'music' && <div className="lu-record-controls"><button className="lu-pill" onClick={() => onPoster(musicals[0].id)}>Browse {musicals.length} musicals <span>↗</span></button><button className="lu-pill" onClick={() => onPoster(vinylRecords[0].id)}>Browse {vinylRecords.length} records <span>↗</span></button><button className="lu-pill" aria-pressed={spinning} onClick={onSpin}>{spinning ? 'Stop the vinyl' : 'Spin the vinyl'}</button><small>{reducedMotion ? 'Our vinyl & theatre collection · reduced motion is on' : 'Our vinyl. Our nights at the theatre.'}</small></div>}
      {inside && place.id === 'movie-night' && <div className="lu-record-controls"><button className="lu-pill" onClick={() => onPoster(movies[0].id)}>Browse {movies.length} movie posters <span>↗</span></button><small>Tap a holographic poster, or explore the whole collection</small></div>}
      {inside && place.id === 'one-more-episode' && <div className="lu-record-controls"><button className="lu-pill" onClick={() => onPoster(series[0].id)}>Browse {series.length} series <span>↗</span></button><small>Our favorite worlds, one episode at a time</small></div>}
      {inside && ['workshop', 'museum'].includes(place.id) && <div className="lu-record-controls"><button className="lu-pill" onClick={() => onPoster(place.id === 'workshop' ? 'sean-tornado' : 'ru-winter-su100')}>Explore the collection ↗</button><small>{place.id === 'workshop' ? 'Five creations by Sean · At the heart of the Hangar' : 'Tap a model to turn it around and look closer'}</small></div>}
      <nav aria-label="Visit another location">{landmarks.map((item) => <button key={item.id} aria-label={`Focus ${item.name}`} aria-pressed={item.id === place.id} onClick={() => onSelect(item.id)}><Icon type={item.id} /></button>)}</nav>
    </div>
    {inside && <div className="lu-room-navigation">
      <p>Drag to look · Hold arrows to move<br /><span>WASD to walk · Arrow keys to walk & turn</span><br /><span>Scroll to zoom · Esc or click the doorway to step outside</span></p>
      <div className="lu-room-pad" aria-label="Room movement controls">{[['turn-left', '↶', 'Turn left'], ['forward', '↑', 'Walk forward'], ['turn-right', '↷', 'Turn right'], ['left', '←', 'Step left'], ['back', '↓', 'Walk backward'], ['right', '→', 'Step right']].map(([direction, glyph, label]) => <button key={direction} aria-label={label}
        onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); roomInput.current = direction; }}
        onPointerUp={() => { roomInput.current = null; }} onPointerCancel={() => { roomInput.current = null; }} onLostPointerCapture={() => { roomInput.current = null; }}
        onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); roomInput.current = direction; } }}
        onKeyUp={() => { roomInput.current = null; }} onBlur={() => { roomInput.current = null; }}>{glyph}</button>)}</div>
    </div>}
    {(opening || roomPhase === 'closing' || roomPhase === 'returning') && <div className={`lu-door-transition ${roomPhase === 'closing' ? 'is-closing' : roomPhase === 'returning' ? 'is-returning' : ''}`} aria-hidden="true" />}
  </section>;
}

function SoundButton() {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const track = audio.current;
    return () => { track?.pause(); };
  }, []);
  async function play() {
    const track = audio.current;
    if (!track || !birthday.audio) return;
    track.loop = true;
    track.volume = 0.35;
    try { await track.play(); setFailed(false); }
    catch { setFailed(true); setPlaying(false); }
  }
  function toggle() {
    if (!audio.current) return;
    if (!audio.current.paused) audio.current.pause();
    else void play();
  }
  return <div className="lu-sound-wrap">
    <audio ref={audio} src={birthday.audio || undefined} loop preload="none"
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onError={() => { setFailed(true); setPlaying(false); }} />
    <button className="lu-sound" aria-pressed={playing} disabled={!birthday.audio} onClick={toggle} title={birthday.audio ? 'Looping birthday soundtrack' : 'Add a soundtrack in content.js'}><Icon type="sound" /><span>{playing ? 'Sound on' : 'Sound off'}</span></button>{failed && <span role="status">Audio unavailable</span>}
  </div>;
}

function Finale({ reducedMotion, onClose }) {
  const [revealed, setRevealed] = useState(reducedMotion);
  const close = useRef();
  useEffect(() => { close.current?.focus(); const timer = setTimeout(() => setRevealed(true), reducedMotion ? 0 : 1700); return () => clearTimeout(timer); }, [reducedMotion]);
  useEffect(() => { const key = (event) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [onClose]);
  return <section className={`lu-finale ${revealed ? 'is-revealed' : ''}`} aria-labelledby="birthday-title">
    <BirthdayFireworks reducedMotion={reducedMotion} />
    <div className="lu-finale-stars" aria-hidden="true">✧ <span>✦</span> ✧</div>
    <p className="lu-eyebrow">THE UNIVERSE IS A LITTLE BRIGHTER WITH YOU IN IT</p>
    <h2 id="birthday-title">Happy birthday,<br /><em>{birthday.recipient}.</em></h2>
    <p className="lu-birthday-message">{birthday.message}</p><p className="lu-signature">{birthday.signature}</p>
    <p className="lu-birthday-stamp"><time dateTime={birthday.date}>{birthday.dateLabel}</time><span>{birthday.dedication}</span></p>
    <button ref={close} className="lu-pill" onClick={onClose}>Stay a little longer <span>↗</span></button>
  </section>;
}

export default function LittleUniverse() {
  const reducedMotion = useReducedMotion();
  const [visited, setVisited] = useState([]);
  const [selected, setSelected] = useState(null);
  const [exploring, setExploring] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const [moving, setMoving] = useState(false);
  const [finale, setFinale] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [retry, setRetry] = useState(0);
  const [roomPhase, setRoomPhase] = useState('outside');
  const [spinning, setSpinning] = useState(false);
  const [posterId, setPosterId] = useState(null);
  const [gameConsole, setGameConsole] = useState('switch');
  const [gameId, setGameId] = useState(games[0].id);
  const galleryWeek = useGalleryWeek();
  const roomInput = useRef(null);
  const wishButton = useRef();
  const returnFocus = useRef(null);
  const onReady = useCallback(() => setReady(true), []);
  const onFailure = useCallback(() => { setFailed(true); setReady(false); }, []);
  const visit = useCallback((id) => {
    if (!selected) returnFocus.current = document.activeElement;
    roomInput.current = null; setRoomPhase('outside'); setExploring(true); setSpinning(false); setPosterId(null);
    setSelected(id); setVisited((current) => visitLandmark(current, id));
  }, [selected]);
  const leaveFocus = useCallback(() => {
    roomInput.current = null; setRoomPhase('outside'); setSpinning(false); setPosterId(null); setSelected(null); setExploring(false);
    requestAnimationFrame(() => {
      const previous = returnFocus.current;
      if (previous instanceof HTMLElement && previous.isConnected && previous.matches('button, a, [tabindex]')) previous.focus({ preventScroll: true });
      else document.querySelector('.lu-pin, [data-location]')?.focus({ preventScroll: true });
    });
  }, []);
  const browse = useCallback(() => { setSelected(null); setRoomPhase('outside'); }, []);
  const endExplore = useCallback(() => { leaveFocus(); setResetKey(n => n + 1); }, [leaveFocus]);
  const enterRoom = useCallback(() => { if (!moving && ROOM_IDS.includes(selected) && roomPhase === 'outside' && ready && !failed) setRoomPhase('opening'); }, [selected, roomPhase, ready, failed, moving]);
  const exitRoom = useCallback(() => { roomInput.current = null; setRoomPhase(reducedMotion ? 'outside' : 'closing'); setSpinning(false); setPosterId(null); }, [reducedMotion]);
  const openPoster = useCallback((id) => { roomInput.current = null; setPosterId(id); }, []);
  const spin = useCallback(() => setSpinning((value) => !value), []);
  useEffect(() => {
    if (!['opening', 'closing', 'returning'].includes(roomPhase)) return;
    const timer = setTimeout(() => setRoomPhase(roomPhase === 'opening' ? 'inside' : roomPhase === 'closing' ? 'returning' : 'outside'), reducedMotion ? 0 : roomPhase === 'opening' ? 850 : 350);
    return () => clearTimeout(timer);
  }, [roomPhase, selected, reducedMotion]);
  const followedRoomLink = useRef(false);
  useEffect(() => {
    if (!ready || failed || followedRoomLink.current) return;
    followedRoomLink.current = true;
    if (new URLSearchParams(window.location.search).get('room') !== 'workshop') return;
    setSelected('workshop'); setExploring(true); setRoomPhase('opening');
    setVisited(current => visitLandmark(current, 'workshop'));
    const url = new URL(window.location.href); url.searchParams.delete('room');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, [ready, failed]);
  const wish = useCallback(() => { roomInput.current = null; setRoomPhase('outside'); setSpinning(false); setPosterId(null); setSelected(null); setExploring(false); setFinale(true); }, []);
  const closeFinale = useCallback(() => { setFinale(false); setResetKey((i) => i + 1); requestAnimationFrame(() => wishButton.current?.focus()); }, []);
  useEffect(() => { setSlow(false); const timer = setTimeout(() => setSlow(true), 12000); return () => clearTimeout(timer); }, [retry]);
  const place = landmarks.find((item) => item.id === selected);
  useEffect(() => {
    if (!exploring && !finale) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [exploring, finale]);
  useEffect(() => {
    if (!exploring || selected || finale) return;
    const key = event => { if (event.key === 'Escape') endExplore(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [exploring, selected, finale, endExplore]);
  const canEnter = !!place && ROOM_IDS.includes(place.id) && roomPhase === 'outside' && ready && !failed && !moving;
  return <main className={`lu-root ${finale ? 'is-finale' : ''} ${exploring ? 'is-focused' : ''} ${reducedMotion ? 'reduce-motion' : ''}`}>
    <header className="lu-header" inert={finale || exploring ? true : undefined}>
      <a className="lu-brand" href="/little-universe/" aria-label="The Little Universe home"><span className="lu-brand-orbit">✧</span><span>COCHONNET VILLA<small>A LITTLE BIRTHDAY EDITION</small></span></a>
      <div className="lu-header-actions"><a className="lu-villa-return" href={VILLA_RETURN_URL}>← 返回山庄</a><SoundButton /></div>
    </header>
    <div className="lu-introduction" inert={finale || exploring ? true : undefined}>
      <p className="lu-eyebrow"><span className="lu-tiny-star">✦</span> SOMEWHERE, JUST FOR US</p>
      <h1>The Little<br /><em>Universe.</em></h1>
      <p className="lu-dedication">A tiny world. <br />All our favorite things.</p>
      <p className="lu-intro-copy">A place for the places we’ve been,<br className="lu-desktop-break" /> the things we’ve made, and all the<br className="lu-desktop-break" /> little moments in between.</p>
      <button ref={wishButton} className="lu-wish" onClick={wish}><span>✧</span> There’s a wish waiting for you <span>↗</span></button>
      <div className="lu-love-note"><span />made of memories & a little stardust</div>
    </div>
    <div className="lu-canvas-wrap" tabIndex={canEnter ? 0 : undefined} role={canEnter ? 'button' : undefined}
      title={canEnter ? `Enter ${place.name}` : undefined}
      onKeyDown={(event) => { if (canEnter && event.target === event.currentTarget && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); enterRoom(); } }}
      aria-label={canEnter ? `Explore ${place.name}. Drag to rotate, scroll or pinch to zoom. Press Enter or Space to step inside.` : roomPhase === 'inside' ? `Inside ${place.name}. Drag to look, use WASD or the movement buttons to walk. Escape steps outside.` : place ? `3D close-up of ${place.name}. Drag to explore, scroll or pinch to zoom out and back in. Escape returns to the planet.` : 'Interactive miniature planet. Drag to rotate, scroll or pinch to zoom. Use the planet labels or Tab through the location navigation to explore.'} inert={finale ? true : undefined}>
      {!failed && <SceneBoundary key={retry} onFailure={onFailure}>
        <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} camera={{ position: [0, 3.8, 11.8], fov: 42, near: 0.1, far: 80 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} fallback={<span>Explore the memories using the location navigation.</span>}>
          <UniverseScene moving={moving} onMoving={setMoving} onBrowse={browse} candidate={candidate} onCandidate={setCandidate} visited={visited} onVisit={visit} onWish={wish} reducedMotion={reducedMotion} finale={finale} selected={selected} resetKey={resetKey} onReady={onReady} onFailure={onFailure} roomPhase={roomPhase} onEnter={enterRoom} onExitRoom={exitRoom} roomInput={roomInput} spinning={spinning} onSpin={spin} onPoster={openPoster} posterOpen={!!posterId} galleryWeek={galleryWeek} gameConsole={gameConsole} gameId={gameId} />
        </Canvas>
      </SceneBoundary>}
      {(!ready || failed) && <div className="lu-loading" role="status"><span>✧</span><p>{failed ? 'The stars need a little rest.' : slow ? 'This little world is taking a moment.' : 'Planting trees. Hanging stars…'}</p><small>{failed || slow ? 'You can retry this little world below.' : 'Our little universe is on its way.'}</small>{(failed || slow) && <button className="lu-pill" onClick={() => { setFailed(false); setReady(false); setRetry((n) => n + 1); }}>Try 3D again</button>}</div>}
    </div>
    <div className="lu-world-caption" inert={finale || exploring ? true : undefined}><span>OUR OWN LITTLE CORNER OF THE COSMOS</span><div><span>↔</span> Drag to wander <i>·</i> Scroll or pinch to get closer<button onClick={() => setResetKey((n) => n + 1)} aria-label="Reset planet view" title="Reset view"><Icon type="reset" /></button></div></div>
    <nav className={`lu-location-access ${failed ? 'is-unavailable' : ''}`} aria-label="Explore our favorite places" inert={finale || exploring ? true : undefined}>
      {landmarks.map((item) => <button className="lu-pill" key={item.id} data-location={item.id} onClick={() => visit(item.id)}>{item.name}</button>)}
    </nav>
    <footer className="lu-footer" inert={finale || exploring ? true : undefined}><span>A SMALL WORLD, MADE WITH A VERY FULL HEART.</span><span>For you. Always. <i>♡</i></span></footer>
    {place && <LocationFocus gameId={gameId} gameConsole={gameConsole} onGameConsole={setGameConsole} galleryWeek={galleryWeek} place={place} onClose={roomPhase === 'inside' || roomPhase === 'closing' ? exitRoom : leaveFocus} onSelect={visit} unavailable={failed || slow && !ready} roomPhase={roomPhase} roomInput={roomInput} spinning={spinning} onSpin={spin} reducedMotion={reducedMotion} onPoster={openPoster} onResetView={() => setResetKey((n) => n + 1)} />}
    {exploring && !place && !finale && <section className="lu-focus-ui lu-browse-ui" aria-label="Explore the planet">
      <button className="lu-focus-back" onClick={endExplore}>← Back to welcome</button>
      <div className="lu-focus-caption"><p className="lu-eyebrow">KEEP WANDERING</p><p>Drag to explore · Scroll or pinch to zoom</p>
        {candidate && <button className="lu-pill lu-candidate-button" onClick={() => visit(candidate)}>Explore {landmarks.find(item => item.id === candidate)?.name} ↗</button>}
        <nav aria-label="Choose a location">{landmarks.map(item => <button key={item.id} aria-label={`Focus ${item.name}`} onClick={() => visit(item.id)}><Icon type={item.id} /></button>)}</nav>
      </div>
    </section>}
    {posterId && (selected === 'game-room' ? <GameCollectionViewer initialId={posterId} onDisplay={setGameId} onClose={() => setPosterId(null)} /> : selected === 'gallery' ? <GalleryViewer initialId={posterId} onClose={() => setPosterId(null)} /> : ['workshop', 'museum'].includes(selected) ? <ModelViewer initialId={posterId} onClose={() => setPosterId(null)} /> : selected === 'one-more-episode' ? <SeriesViewer initialId={posterId} onClose={() => setPosterId(null)} /> : selected === 'music' ? <MusicalPosterViewer initialId={posterId} onClose={() => setPosterId(null)} /> : <MoviePosterViewer initialId={posterId} onClose={() => setPosterId(null)} />)}
    {finale && <Finale reducedMotion={reducedMotion} onClose={closeFinale} />}
  </main>;
}
