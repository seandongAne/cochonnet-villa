import { GalleryLighting } from './GalleryLighting.jsx';
import { GALLERY_SPAWN, GALLERY_SPEED } from './gallery-interior.js';
import HangarAtelier from './HangarAtelier.jsx';
import { HANGAR_LOOK, HANGAR_SPAWN, HANGAR_SPEED } from './hangar-atelier.js';
import { GameRoomScreen } from './GameRoom.jsx';
import { GalleryWall } from './Gallery.jsx';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { createRoom, moveInRoom, ROOM_SPAWN, ROOM_EXITS, ROOM_CAMERA_NEAR, roomBaseFov } from './rooms.js';
import { disposeMiniature } from './miniature.js';
import { RoomCollection } from './CollectionModels.jsx';
import { CinemaPosters } from './MovieNight.jsx';
import { MusicalPosters } from './MusicWorld.jsx';
import { SeriesWall } from './OneMoreEpisode.jsx';
import { CinemaSign } from './MovieNight.jsx';
import { advanceRoomZoom, createRoomZoom, createRoomPointer, moveRoomPointer, wheelPixels } from './planet-navigation.js';

export default function RoomInterior({ id, reducedMotion, input, spinning, onSpin, onExit, onPoster, paused, galleryWeek, gameConsole, gameId }) {
  const { camera, gl, size } = useThree();
  const room = useMemo(() => createRoom(id), [id]);
  const keys = useRef(new Set());
  const look = useRef({ yaw: 0, pitch: -.06 });
  const zoom = useRef(createRoomZoom(roomBaseFov(id, size.width / Math.max(1, size.height))));
  const framing = useRef(null);
  const exit = ROOM_EXITS[id];
  const record = useMemo(() => room.getObjectByName('spinning-record'), [room]);
  useEffect(() => { keys.current.clear(); input.current = null; }, [paused, input]);
  useEffect(() => () => disposeMiniature(room), [room]);
  useLayoutEffect(() => {
    const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), up: camera.up.clone(), fov: camera.fov, near: camera.near };
    camera.position.set(...(id === 'museum' ? [0, 1.7, 2.1] : id === 'workshop' ? HANGAR_SPAWN : id === 'gallery' ? GALLERY_SPAWN : ROOM_SPAWN)); camera.up.set(0, 1, 0); camera.near = ROOM_CAMERA_NEAR; camera.updateProjectionMatrix();
    look.current = id === 'workshop' ? { ...HANGAR_LOOK } : { yaw: 0, pitch: id === 'museum' ? -.17 : id === 'gallery' ? .12 : -.06 };
    return () => {
      framing.current = null;
      camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion); camera.up.copy(saved.up);
      camera.fov = saved.fov; camera.near = saved.near; camera.updateProjectionMatrix();
    };
  }, [camera, id]);
  useLayoutEffect(() => {
    // The viewport-fitted base is also the wheel-zoom rest value; otherwise the
    // per-frame damping below would pull a portrait Hangar back to 58 degrees.
    // Rooms with a fixed base keep the visitor's wheel zoom across resizes.
    const fov = roomBaseFov(id, size.width / Math.max(1, size.height));
    if (framing.current === fov) return;
    framing.current = fov;
    zoom.current = createRoomZoom(fov);
    camera.fov = fov; camera.updateProjectionMatrix();
  }, [camera, id, size.width, size.height]);
  useEffect(() => {
    const canvas = gl.domElement; let drag = null; let suppressClick = true;
    const wheel = event => {
      if (paused || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      suppressClick = true;
      zoom.current = advanceRoomZoom(zoom.current, wheelPixels(event));
    };
    const down = (event) => {
      if (paused || event.button !== 0 || event.target !== canvas) return;
      if (drag) { suppressClick = true; drag = null; return; }
      suppressClick = false;
      drag = createRoomPointer(event); canvas.setPointerCapture(event.pointerId);
    };
    const move = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      look.current.yaw -= (event.clientX - drag.x) * .004;
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch - (event.clientY - drag.y) * .004, -.85, .85);
      drag = moveRoomPointer(drag, event);
      suppressClick ||= drag.dragged;
    };
    const up = event => {
      if (!drag || drag.id !== event.pointerId) return;
      suppressClick ||= moveRoomPointer(drag, event).dragged;
      drag = null;
    };
    const cancel = () => { if (drag) suppressClick = true; drag = null; };
    // Capture runs before R3F click handlers; returning to the drag origin is
    // still a drag. Cancellation and wheel gestures never become door clicks.
    const click = event => { if (paused || suppressClick) { event.stopImmediatePropagation(); event.preventDefault(); } };
    const clear = () => { keys.current.clear(); input.current = null; suppressClick = true; drag = null; };
    const keyDown = (event) => {
      if (paused || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) { event.preventDefault(); keys.current.add(event.code); }
    };
    const keyUp = (event) => keys.current.delete(event.code);
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('lostpointercapture', cancel);
    canvas.addEventListener('click', click, true);
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', clear); document.addEventListener('visibilitychange', clear);
    return () => {
      clear(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('lostpointercapture', cancel);
      canvas.removeEventListener('click', click, true);
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear);
    };
  }, [gl, input, paused, id]);
  useFrame((_, delta) => {
    if (paused) return;
    const nextFov = reducedMotion ? zoom.current.fov : THREE.MathUtils.damp(camera.fov, zoom.current.fov, 12, Math.min(delta, .05));
    if (Math.abs(nextFov - camera.fov) > .001) { camera.fov = nextFov; camera.updateProjectionMatrix(); }
    const dt = Math.min(Math.max(delta, 0), .05); const k = keys.current; const touch = input.current;
    const forward = Number(k.has('KeyW') || k.has('ArrowUp') || touch === 'forward') - Number(k.has('KeyS') || k.has('ArrowDown') || touch === 'back');
    const sideways = Number(k.has('KeyD') || touch === 'right') - Number(k.has('KeyA') || touch === 'left');
    const turn = Number(k.has('ArrowLeft') || touch === 'turn-left') - Number(k.has('ArrowRight') || touch === 'turn-right');
    look.current.yaw += turn * dt * 1.2;
    const { yaw, pitch } = look.current; const speed = dt * (id === 'workshop' ? HANGAR_SPEED : id === 'gallery' ? GALLERY_SPEED : 1.45) / Math.max(1, Math.hypot(forward, sideways));
    camera.position.set(...moveInRoom(camera.position.toArray(), (-Math.sin(yaw) * forward + Math.cos(yaw) * sideways) * speed, (-Math.cos(yaw) * forward - Math.sin(yaw) * sideways) * speed, id));
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    if (record && spinning && !reducedMotion) record.rotation.y -= dt * 1.4;
  });
  return <group>
    {id === 'gallery' ? <GalleryLighting /> : id === 'museum' ? <>
      <ambientLight intensity={.32} color="#d7e1ef" />
      <hemisphereLight args={['#dce5ef', '#13171d', .65]} />
      <pointLight position={[-1.3, 2.65, -1.45]} intensity={12} distance={5} decay={2} color="#ffecd1" />
      <pointLight position={[1.4, 2.65, -1.45]} intensity={10} distance={5} decay={2} color="#ffecd1" />
      <pointLight position={[0, 2.7, .9]} intensity={17} distance={6} decay={2} color="#d8e5f4" />
    </> : id === 'workshop' ? <HangarAtelier onSelect={onPoster} /> : id === 'one-more-episode' ? <>
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
    {id === 'game-room' && <GameRoomScreen activeConsole={gameConsole} activeGame={gameId} onSelect={onPoster} />}
    {id === 'gallery' && <GalleryWall week={galleryWeek} onSelect={onPoster} />}
    {id !== 'workshop' && <RoomCollection room={id} onSelect={onPoster} />}
    {id === 'movie-night' && <CinemaPosters onSelect={onPoster} reducedMotion={reducedMotion} paused={paused} />}
    {id === 'music' && <MusicalPosters onSelect={onPoster} />}
    {id === 'one-more-episode' && <SeriesWall onSelect={onPoster} />}
    {id === 'museum' && <CinemaSign title="THE IRON & ROSE" subtitle="THE COLLECTOR'S WORKBENCH" background="#101215" color="#c9b99c" size={[3.4, .22]} position={[0, 3.03, -1.77]} />}
    {id === 'music' && <Html position={[0, 1.15, -1.45]} center zIndexRange={[23, 22]} occlude>
      <button className="lu-room-tag" onClick={onSpin}>{spinning ? 'Stop the vinyl' : 'Spin the vinyl'} <span>↗</span></button>
    </Html>}
    <mesh name="room-exit" position={exit.position} rotation={[0, Math.PI, 0]}
      onClick={event => { event.stopPropagation(); if (!paused && event.delta < 6) onExit(); }}>
      <planeGeometry args={exit.size} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  </group>;
}
