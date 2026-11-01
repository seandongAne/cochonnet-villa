import { GAME_CONSOLES } from './game-room.js';
import { games, findGame, GAME_COVER_SLOTS, GAME_FRAME_SIZE } from './games.js';
import { useEffect, useRef, useState } from 'react';
import { CinemaSign, WallPoster } from './MovieNight.jsx';

export function GameRoomScreen({ activeConsole, activeGame, onSelect }) {
  const selected = GAME_CONSOLES.find(item => item.id === activeConsole) || GAME_CONSOLES[0];
  const game = findGame(activeGame);
  return <group>
    <CinemaSign title="P L A Y E R   T W O" size={[2.7, .2]} background="#344850" color="#e1cfad" position={[0, 3, -2.31]} />
    <mesh position={[0, 2.06, -2.175]}><planeGeometry args={[3.08, 1.29]} /><meshBasicMaterial color="#172b34" toneMapped={false} /></mesh>
    <CinemaSign title={selected.name} size={[1.3, .1]} background="#344850" color={selected.color} position={[0, 2.83, -2.17]} />
    <WallPoster movie={game} slot={{ position: [0, 2.12, -2.2], rotation: 0 }} bounds={[2.9, .9]} labelOffset={.61} labelSize={[2.8, .14]} onSelect={onSelect} />
    {games.map((item, index) => <WallPoster key={item.id} movie={item} slot={GAME_COVER_SLOTS[index]} bounds={GAME_FRAME_SIZE} labelOffset={-.37} labelSize={[1.04, .13]} onSelect={onSelect} />)}
    {GAME_CONSOLES.map(item => <group key={item.id}>
      <CinemaSign title={item.name} size={[.85, .12]} background="#4e514b" color={item.id === selected.id ? item.color : '#e1cfad'} position={[item.position[0], .48, -1.498]} />
      <mesh position={[item.position[0], .73, -1.49]}>
        <boxGeometry args={[.7, .018, .015]} /><meshBasicMaterial color={item.id === selected.id ? item.color : '#667065'} toneMapped={false} />
      </mesh>
    </group>)}
  </group>;
}

function GameArtwork({ game }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="lu-game-art-error" role="status"><p>封面暂时没有加载出来。</p><button className="lu-pill" onClick={() => setFailed(false)}>重新加载</button></div>
    : <img src={game.poster} alt={game.zh + ' · ' + game.title} onError={() => setFailed(true)} />;
}

export function GameCollectionViewer({ initialId, onClose, onDisplay }) {
  const dialog = useRef();
  const [index, setIndex] = useState(() => Math.max(0, games.findIndex(game => game.id === initialId)));
  const game = games[index];
  const advance = step => setIndex(value => (value + step + games.length) % games.length);
  useEffect(() => {
    const element = dialog.current; const previous = document.activeElement;
    element.showModal();
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="lu-poster-viewer lu-games-viewer" aria-labelledby="lu-game-title" onCancel={onClose}
    onKeyDown={event => { event.stopPropagation(); if (event.key === 'ArrowRight') { event.preventDefault(); advance(1); } if (event.key === 'ArrowLeft') { event.preventDefault(); advance(-1); } }}>
    <header><div><p className="lu-eyebrow">PLAYER TWO · OUR GAME COLLECTION</p><span>{games.length} 款游戏，一间小屋。</span></div><button className="lu-pill" autoFocus onClick={onClose} aria-label="关闭游戏收藏">回到小屋 ×</button></header>
    <div className="lu-games-feature">
      <div className="lu-games-art"><GameArtwork key={game.id} game={game} /></div>
      <div className="lu-games-info" aria-live="polite"><p className="lu-eyebrow">{String(index + 1).padStart(2, '0')} / {games.length}</p><h2 id="lu-game-title">{game.zh}</h2><p>{game.title}</p>
        {game.alias && <small>{game.alias}</small>}
        <button className="lu-pill" onClick={() => { onDisplay(game.id); onClose(); }}>展示在电视上 ↗</button>
        <div className="lu-poster-arrows"><button className="lu-pill" aria-label="上一款游戏" onClick={() => advance(-1)}>←</button><button className="lu-pill" aria-label="下一款游戏" onClick={() => advance(1)}>→</button></div>
      </div>
    </div>
    <nav className="lu-games-grid" aria-label="选择游戏">{games.map((item, i) => <button key={item.id} aria-pressed={i === index} aria-label={item.zh} onClick={() => { setIndex(i); dialog.current?.scrollTo({ top: 0 }); }}><img src={item.poster} alt="" loading="lazy" /><span>{item.zh}</span><small>{item.title}</small></button>)}</nav>
  </dialog>;
}
