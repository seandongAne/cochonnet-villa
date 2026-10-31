import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { createRoom, moveInRoom, ROOM_SPAWN } from './rooms.js';
import { disposeMiniature } from './miniature.js';
import { RoomCollection } from './CollectionModels.jsx';
import { CinemaPosters } from './MovieNight.jsx';
import { MusicalPosters } from './MusicWorld.jsx';
import { SeriesWall } from './OneMoreEpisode.jsx';
import { CinemaSign } from './MovieNight.jsx';

export default function RoomInterior({ id, reducedMotion, input, spinning, onSpin, onExit, onPoster, paused }) {
  const { camera, gl } = useThree();
  const room = useMemo(() => createRoom(id), [id]);
  const keys = useRef(new Set());
  const look = useRef({ yaw: 0, pitch: -.06 });
  const record = useMemo(() => room.getObjectByName('spinning-record'), [room]);
  useEffect(() => { keys.current.clear(); input.current = null; }, [paused, input]);
  useEffect(() => () => disposeMiniature(room), [room]);
  useLayoutEffect(() => {
    const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), up: camera.up.clone(), fov: camera.fov, near: camera.near };
    camera.position.set(...(id === 'museum' ? [0, 1.7, 2.1] : id === 'workshop' ? [.45, 1.8, 2.1] : ROOM_SPAWN)); camera.up.set(0, 1, 0); camera.fov = id === 'workshop' ? 68 : 62; camera.near = .04; camera.updateProjectionMatrix();
    look.current = { yaw: 0, pitch: id === 'museum' ? -.17 : id === 'workshop' ? -.2 : -.06 };
    return () => {
      camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion); camera.up.copy(saved.up);
      camera.fov = saved.fov; camera.near = saved.near; camera.updateProjectionMatrix();
    };
  }, [camera, id]);
  useEffect(() => {
    const canvas = gl.domElement; let drag = null;
    const down = (event) => {
      if (paused || event.button !== 0 || event.target !== canvas) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId);
    };
    const move = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      look.current.yaw -= (event.clientX - drag.x) * .004;
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch - (event.clientY - drag.y) * .004, -.85, .85);
      drag.x = event.clientX; drag.y = event.clientY;
    };
    const up = () => { drag = null; };
    const clear = () => { keys.current.clear(); input.current = null; drag = null; };
    const keyDown = (event) => {
      if (paused || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) { event.preventDefault(); keys.current.add(event.code); }
    };
    const keyUp = (event) => keys.current.delete(event.code);
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', clear); document.addEventListener('visibilitychange', clear);
    return () => {
      clear(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up);
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear);
    };
  }, [gl, input, paused]);
  useFrame((_, delta) => {
    if (paused) return;
    const dt = Math.min(Math.max(delta, 0), .05); const k = keys.current; const touch = input.current;
    const forward = Number(k.has('KeyW') || k.has('ArrowUp') || touch === 'forward') - Number(k.has('KeyS') || k.has('ArrowDown') || touch === 'back');
    const sideways = Number(k.has('KeyD') || touch === 'right') - Number(k.has('KeyA') || touch === 'left');
    const turn = Number(k.has('ArrowLeft') || touch === 'turn-left') - Number(k.has('ArrowRight') || touch === 'turn-right');
    look.current.yaw += turn * dt * 1.2;
    const { yaw, pitch } = look.current; const speed = dt * 1.45 / Math.max(1, Math.hypot(forward, sideways));
    camera.position.set(...moveInRoom(camera.position.toArray(), (-Math.sin(yaw) * forward + Math.cos(yaw) * sideways) * speed, (-Math.cos(yaw) * forward - Math.sin(yaw) * sideways) * speed, id));
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    if (record && spinning && !reducedMotion) record.rotation.y -= dt * 1.4;
  });
  return <group>
    {id === 'museum' ? <>
      <ambientLight intensity={.32} color="#d7e1ef" />
      <hemisphereLight args={['#dce5ef', '#13171d', .65]} />
      <pointLight position={[-1.3, 2.65, -1.45]} intensity={12} distance={5} decay={2} color="#ffecd1" />
      <pointLight position={[1.4, 2.65, -1.45]} intensity={10} distance={5} decay={2} color="#ffecd1" />
      <pointLight position={[0, 2.7, .9]} intensity={17} distance={6} decay={2} color="#d8e5f4" />
    </> : id === 'workshop' ? <>
      <ambientLight intensity={.48} color="#f1f3ef" />
      <hemisphereLight args={['#e9f4fa', '#8e9790', 1.15]} />
      <pointLight position={[-2.35, 2.5, .1]} intensity={12} distance={7} decay={2} color="#e2f1ff" />
      <pointLight position={[1.2, 2.85, .8]} intensity={13} distance={7} decay={2} color="#fff4e1" />
      <pointLight position={[-.7, 2.65, -1.5]} intensity={5} distance={3.5} decay={2} color="#ffead0" />
      <pointLight position={[1.95, 2.7, -1.5]} intensity={4} distance={3.5} decay={2} color="#ffead0" />
    </> : id === 'one-more-episode' ? <>
      <ambientLight intensity={.55} color="#eee9de" />
      <hemisphereLight args={['#e5edf0', '#777970', .85]} />
      <pointLight position={[0, 2.48, .35]} intensity={10} distance={7} decay={2} color="#f5e4c9" />
      <pointLight position={[1.8, 2, 1.9]} intensity={5} distance={6} decay={2} color="#dce8ec" />
    </> : <>
      <ambientLight intensity={id === 'movie-night' ? .5 : .85} color="#f4dfce" />
      <hemisphereLight args={['#fff1d7', '#8a7380', id === 'movie-night' ? .65 : 1.3]} />
      <pointLight position={[0, 2.43, 0]} intensity={id === 'movie-night' ? 14 : 24} distance={10} decay={2} color="#ffe2b6" />
      <pointLight position={[-2.5, 2, -.8]} intensity={9} distance={7} color="#cbd8e8" />
    </>}
    <primitive object={room} dispose={null} />
    <RoomCollection room={id} onSelect={onPoster} />
    {id === 'movie-night' && <CinemaPosters onSelect={onPoster} reducedMotion={reducedMotion} paused={paused} />}
    {id === 'music' && <MusicalPosters onSelect={onPoster} />}
    {id === 'one-more-episode' && <SeriesWall onSelect={onPoster} />}
    {id === 'workshop' && <>
      <CinemaSign title="H A N G A R" subtitle="MADE FOR THE THINGS YOU LOVE" background="#e7e9e5" color="#344e59" size={[2.3, .22]} position={[0, 3.015, -2.35]} />
      {[-1.82, 1.82].map(x => <group key={x} position={[x, 2.92, 2.35]} rotation={[0, Math.PI, 0]}><CinemaSign title="CREATED BY SEAN" subtitle="FIVE ORIGINAL WORKS / MADE WITH IMAGINATION" background="#344e59" color="#e8d5ad" size={[1.95, .2]} position={[0, 0, 0]} /></group>)}
      {[-1.25, -.05, 1.95].map((x, i) => <CinemaSign key={x} title={`0${i + 1} / MODEL BAY`} background="#344e59" color="#d3c5a3" size={[.62, .075]} position={[x, 2.69, -2.255]} />)}
    </>}
    {id === 'museum' && <CinemaSign title="THE IRON & ROSE" subtitle="THE COLLECTOR'S WORKBENCH" background="#101215" color="#c9b99c" size={[3.4, .22]} position={[0, 3.03, -1.77]} />}
    {id === 'music' && <Html position={[0, 1.15, -1.45]} center zIndexRange={[23, 22]} occlude>
      <button className="lu-room-tag" onClick={onSpin}>{spinning ? 'Stop the vinyl' : 'Spin the vinyl'} <span>↗</span></button>
    </Html>}
    <Html position={[0, 1.4, 2.4]} center zIndexRange={[23, 22]} occlude>
      <button className="lu-room-tag" onClick={onExit}>Step outside ↗</button>
    </Html>
  </group>;
}
