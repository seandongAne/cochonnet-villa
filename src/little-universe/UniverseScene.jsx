import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { landmarks } from './content.js';
import { cameraFlight, copyPose, focusPose, resolveCameraDestination, PLANET_TILT } from './focus-camera.js';
import { createFlowers, createGarden, createLandmark, disposeMiniature, surfaceFrame } from './planet.js';
import CampingVignette from './CampingVignette.jsx';
import RoomInterior from './RoomInterior.jsx';
import { EXTERIOR_DOORS } from './rooms.js';
import { CinemaSign } from './MovieNight.jsx';

function Miniature({ factory, ...props }) {
  const object = useMemo(factory, [factory]);
  useEffect(() => () => disposeMiniature(object), [object]);
  return <primitive object={object} dispose={null} {...props} />;
}

function LandmarkDoor({ id, opening, active, onEnter, reducedMotion }) {
  const hinge = useRef(); const door = EXTERIOR_DOORS[id];
  useFrame((_, delta) => { if (hinge.current) hinge.current.rotation.y = reducedMotion ? (opening ? -1.45 : 0) : THREE.MathUtils.damp(hinge.current.rotation.y, opening ? -1.45 : 0, 6, Math.min(delta, .05)); });
  if (!door) return null;
  return <group position={door.position}>
    <group ref={hinge} onClick={(event) => { event.stopPropagation(); if (active && event.delta < 6) onEnter(); }}>
      <mesh position={[door.width / 2, door.height / 2, 0]}><boxGeometry args={[door.width, door.height, .025]} /><meshStandardMaterial color={door.color} roughness={.8} /></mesh>
      <mesh position={[door.width * .8, door.height / 2, .025]}><sphereGeometry args={[.012, 10, 8]} /><meshStandardMaterial color="#ddbc85" /></mesh>
    </group>
    {active && !opening && <Html position={[door.width / 2, -.03, .28]} center zIndexRange={[24, 22]}><button className="lu-door-link" onClick={onEnter}>Open the door ↗</button></Html>}
  </group>;
}

function Landmark({ place, visited, onVisit, reducedMotion, labels, selected, moving, opening, onEnter }) {
  const frame = useMemo(() => surfaceFrame(place.direction), [place]);
  const factory = useMemo(() => () => createLandmark(place.id), [place.id]);
  const flowers = useRef();
  const light = useRef();
  const [hover, setHover] = useState(false);
  useFrame((_, delta) => {
    const target = visited ? 1 : 0.001;
    if (flowers.current) flowers.current.scale.setScalar(reducedMotion ? target : THREE.MathUtils.damp(flowers.current.scale.x, target, 2.8, Math.min(delta, 0.05)));
    const glow = place.id === 'camping' ? 0 : selected ? (selected === place.id ? 0.55 : 0) : visited ? 2 : 0;
    if (light.current) light.current.intensity = reducedMotion ? glow : THREE.MathUtils.damp(light.current.intensity, glow, 2, Math.max(0, delta));
  });
  return <group position={frame.position} quaternion={frame.quaternion} userData={{ location: place.id }}>
    <group onClick={(event) => { event.stopPropagation(); if (!selected && event.delta < 6) onVisit(place.id); }} onPointerOver={(event) => { event.stopPropagation(); setHover(true); }} onPointerOut={() => setHover(false)}>
      {place.id === 'camping' ? <CampingVignette active={selected === 'camping'} showCaptions={selected === 'camping' && !moving} reducedMotion={reducedMotion} dialogue={place.dialogue} /> : <Miniature factory={factory} />}
      {place.id === 'movie-night' && <><CinemaSign position={[-.07, .61, .5]} size={[1, .12]} background="#edd16c" color="#9e4936" /><CinemaSign title="CINEMA" vertical background="#42b5ac" color="#b65337" size={[.19, .55]} position={[-.19, 1.04, .315]} /></>}
      {place.id === 'music' && <CinemaSign title="THE ENCORE" size={[.86, .14]} position={[0, 1.2, .09]} />}
      {['museum', 'one-more-episode'].includes(place.id) && <CinemaSign title={place.name.toUpperCase()} size={[.72, .09]} position={[0, .565, .38]} />}
      <LandmarkDoor id={place.id} opening={opening && selected === place.id} active={selected === place.id && !moving} onEnter={onEnter} reducedMotion={reducedMotion} />
      <mesh position={[0, place.id === 'camping' ? .067 : .06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={place.id === 'camping' ? [.73, hover ? .75 : .74, 48] : [0.65, hover ? 0.69 : 0.66, 48]} /><meshBasicMaterial color={visited ? '#ffe3a0' : '#efdfc6'} transparent opacity={hover || visited ? 0.8 : 0.3} side={THREE.DoubleSide} />
      </mesh>
    </group>
    <group ref={flowers} scale={0.001}><Miniature factory={createFlowers} /></group>
    <pointLight ref={light} position={[0, 0.55, 0.38]} color="#ffd195" distance={2} decay={2} intensity={0} />
    {labels && <Html position={place.label} center occlude distanceFactor={11} zIndexRange={[12, 0]}>
      <button className={`lu-pin ${visited ? 'is-visited' : ''}`} onClick={() => onVisit(place.id)} aria-label={`Visit ${place.name}`}><span>{visited ? '✦' : '✧'}</span>{place.name}</button>
    </Html>}
  </group>;
}

function Starfield({ finale, reducedMotion, campNight }) {
  const points = useRef();
  const positions = useMemo(() => {
    const data = new Float32Array(360 * 3);
    for (let i = 0; i < 360; i++) {
      const a = i * 2.39996; const y = 1 - (i + 0.5) / 360 * 2; const r = 15 + (i % 7);
      data.set([Math.cos(a) * Math.sqrt(1 - y * y) * r, y * r, Math.sin(a) * Math.sqrt(1 - y * y) * r], i * 3);
    }
    return data;
  }, []);
  useFrame((_, delta) => { if (!reducedMotion) points.current.rotation.y += Math.min(delta, 0.05) * (finale ? 0.016 : 0.002); });
  return <points ref={points}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <pointsMaterial color={campNight ? "#dbe6ff" : "#f7d8b8"} size={finale ? 0.065 : campNight ? .052 : 0.035} transparent opacity={campNight ? .9 : .7} sizeAttenuation depthWrite={false} />
  </points>;
}

function BirthdayStar({ onWish, reducedMotion, visible }) {
  const ref = useRef();
  const shape = useMemo(() => {
    const result = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 + Math.PI / 2; const r = i % 2 ? 0.13 : 0.28;
      if (i === 0) result.moveTo(Math.cos(a) * r, Math.sin(a) * r); else result.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    result.closePath(); return result;
  }, []);
  useFrame(({ clock }) => {
    if (ref.current && !reducedMotion) { ref.current.position.y = 3.5 + Math.sin(clock.elapsedTime * 0.7) * 0.09; ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.4) * 0.1; }
  });
  return <group ref={ref} position={[2.8, 3.5, 0]} visible={visible}>
    <mesh onClick={(e) => { e.stopPropagation(); if (e.delta < 6) onWish(); }}>
      <extrudeGeometry args={[shape, { depth: 0.1, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.035, bevelThickness: 0.035 }]} />
      <meshStandardMaterial color="#ffe3a1" emissive="#efbd6d" emissiveIntensity={1} roughness={0.35} />
    </mesh>
    {visible && <Html position={[0, 0.55, 0]} center zIndexRange={[12, 0]}><button className="lu-star-pin" onClick={onWish}>Make a wish <span>↗</span></button></Html>}
  </group>;
}

function CameraRig({ selected, finale, reducedMotion, resetKey, onMoving, enabled }) {
  const { camera, size } = useThree();
  const flight = useRef(null);
  const initialized = useRef(false);
  const overview = useRef(null);
  const previousSelection = useRef(null);
  const previousReset = useRef(resetKey);
  const currentTarget = useRef(new THREE.Vector3(0, 0.3, 0));
  const home = useMemo(() => ({
    position: new THREE.Vector3(0, 3.8, size.width / size.height < 0.85 ? 15.4 : 11.8),
    target: new THREE.Vector3(0, 0.3, 0), up: new THREE.Vector3(0, 1, 0),
  }), [size.width, size.height]);
  useLayoutEffect(() => {
    if (!enabled) { flight.current = null; return; }
    const current = { position: camera.position.clone(), target: currentTarget.current.clone(), up: camera.up.clone() };
    if (selected && !previousSelection.current && !overview.current) overview.current = initialized.current ? copyPose(current) : copyPose(home);
    const reset = resetKey !== previousReset.current;
    if (reset) overview.current = null;
    const place = landmarks.find((item) => item.id === selected);
    const destination = resolveCameraDestination({ place, home, overview: overview.current,
      initialized: initialized.current, previousSelection: previousSelection.current,
      reset, finale, aspect: size.width / size.height });
    if (!destination) {
      // A reduced-motion change may finish an existing flight immediately,
      // but a resize must not start or restart one.
      if (reducedMotion && flight.current) {
        const pose = flight.current.sample(1);
        camera.position.copy(pose.position); camera.up.copy(pose.up); camera.lookAt(pose.target);
        currentTarget.current.copy(pose.target); flight.current = null; overview.current = null;
        onMoving(false);
      }
      return;
    }
    previousSelection.current = selected;
    previousReset.current = resetKey;
    flight.current = { sample: cameraFlight(current, destination), elapsed: 0, duration: finale ? 3.5 : 1.8 };
    if (reducedMotion || !initialized.current) {
      camera.position.copy(destination.position); camera.up.copy(destination.up); camera.lookAt(destination.target);
      currentTarget.current.copy(destination.target); flight.current = null;
      if (!selected) overview.current = null;
      onMoving(false);
    } else onMoving(true);
    initialized.current = true;
  }, [selected, finale, reducedMotion, resetKey, home, camera, size.width, size.height, onMoving, enabled]);
  useFrame((_, delta) => {
    const active = flight.current;
    if (!active) return;
    active.elapsed = Math.min(active.duration, active.elapsed + Math.max(0, delta));
    const pose = active.sample(active.elapsed / active.duration);
    camera.position.copy(pose.position); camera.up.copy(pose.up); camera.lookAt(pose.target);
    currentTarget.current.copy(pose.target);
    if (active.elapsed >= active.duration) {
      flight.current = null;
      if (!selected) overview.current = null;
      onMoving(false);
    }
  });
  return null;
}

function WorldFocus({ selected, reducedMotion, children }) {
  const root = useRef();
  const originals = useRef(new WeakMap());
  const materials = useRef([]);
  const tint = useMemo(() => new THREE.Color(), []);
  useLayoutEffect(() => {
    const entries = [];
    function collect(object, location = null) {
      const id = object.userData.location || location;
      if (object.material?.color) {
        const material = object.material;
        if (!originals.current.has(material)) originals.current.set(material, { color: material.color.clone(), glow: material.emissiveIntensity || 0 });
        entries.push({ material, original: originals.current.get(material), dim: !!selected && id !== selected });
      }
      object.children.forEach((child) => collect(child, id));
    }
    collect(root.current); materials.current = entries;
  }, [selected]);
  useFrame((_, delta) => {
    const blend = reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, delta) * 3);
    for (const { material, original, dim } of materials.current) {
      tint.copy(original.color).multiplyScalar(dim ? 0.42 : 1);
      material.color.lerp(tint, blend);
      if ('emissiveIntensity' in material && !material.userData.animatedGlow) material.emissiveIntensity = THREE.MathUtils.lerp(material.emissiveIntensity, original.glow * (dim ? 0.2 : 1), blend);
    }
  });
  return <group ref={root}>{children}</group>;
}

function CampingViewControls({ reducedMotion }) {
  const { size } = useThree();
  const pose = useMemo(() => focusPose(landmarks.find((place) => place.id === 'camping'), size.width / size.height), [size.width, size.height]);
  return <OrbitControls target={pose.target} enablePan={false} enableDamping={!reducedMotion} dampingFactor={0.065}
    minDistance={1.8} maxDistance={5.5} minPolarAngle={0.3} maxPolarAngle={Math.PI / 2 - 0.08}
    rotateSpeed={0.45} zoomSpeed={0.6} />;
}

function ContextEvents({ onReady, onFailure }) {
  const { gl } = useThree();
  const didRender = useRef(false);
  useFrame(() => { if (!didRender.current) { didRender.current = true; onReady(); } });
  useEffect(() => {
    const lost = (event) => { event.preventDefault(); onFailure(); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => gl.domElement.removeEventListener('webglcontextlost', lost);
  }, [gl, onFailure]);
  return null;
}

function SceneLighting({ campNight, reducedMotion }) {
  const ambient = useRef(); const sky = useRef(); const sun = useRef(); const rim = useRef();
  useFrame((_, delta) => {
    const blend = reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, delta) * 2);
    for (const [ref, day, night] of [[ambient, 1.1, 0.32], [sky, 2, 0.65], [sun, 3.3, 0.4], [rim, 1.7, 0.7]]) {
      ref.current.intensity = THREE.MathUtils.lerp(ref.current.intensity, campNight ? night : day, blend);
    }
  });
  return <>
    <ambientLight ref={ambient} intensity={1.1} color="#e9d9ed" />
    <hemisphereLight ref={sky} args={['#ffebd2', '#718a82', 2]} />
    <directionalLight ref={sun} position={[-4, 8, 5]} intensity={3.3} color="#ffe4bc" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} shadow-normalBias={0.035} />
    <directionalLight ref={rim} position={[5, 1, -3]} intensity={1.7} color="#cdbce5" />
  </>;
}

export default function UniverseScene({ visited, onVisit, onWish, reducedMotion, finale, selected, resetKey, onReady, onFailure, roomPhase, onEnter, onExitRoom, roomInput, spinning, onSpin, onPoster, posterOpen }) {
  const [moving, setMoving] = useState(true);
  const inside = roomPhase === 'inside';
  return <>
    <ContextEvents onReady={onReady} onFailure={onFailure} />
    {!inside && <SceneLighting campNight={selected === 'camping'} reducedMotion={reducedMotion} />}
    <Starfield finale={finale} reducedMotion={reducedMotion} campNight={selected === 'camping'} />
    <group visible={!inside}>
    <WorldFocus selected={selected} reducedMotion={reducedMotion}><group rotation={[0, 0, PLANET_TILT]}>
      <mesh receiveShadow><sphereGeometry args={[2.5, 80, 64]} /><meshStandardMaterial color="#a9c6ae" roughness={0.96} /></mesh>
      <Miniature factory={createGarden} />
      {/* A small, inset-looking blue pond on the lower left hemisphere. */}
      <group {...surfaceFrame([-0.62, -0.04, 0.78], 2.475)}>
        <mesh scale={[0.43, 0.075, 0.7]}><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color="#91bfc0" roughness={0.3} metalness={0.12} /></mesh>
        <mesh position={[0.03, 0.077, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.7, 1, 1]}><ringGeometry args={[0.23, 0.236, 40]} /><meshBasicMaterial color="#deeee0" transparent opacity={0.5} /></mesh>
      </group>
      {landmarks.map((place) => <Landmark key={place.id} place={place} visited={finale || visited.includes(place.id)} onVisit={onVisit} reducedMotion={reducedMotion} labels={!finale && !selected} selected={selected} moving={moving || inside} opening={roomPhase === 'opening'} onEnter={onEnter} />)}
    </group></WorldFocus>
    <mesh rotation={[1.2, 0.18, -0.4]} visible={!selected}><torusGeometry args={[3.65, 0.009, 6, 160]} /><meshBasicMaterial color="#d5b991" transparent opacity={0.22} /></mesh>
    <mesh position={[-3.8, 1.6, -1.4]} visible={!selected}><sphereGeometry args={[0.19, 24, 16]} /><meshStandardMaterial color="#e8cabc" roughness={1} /></mesh>
    <BirthdayStar onWish={onWish} reducedMotion={reducedMotion} visible={!finale && !selected} />
    </group>
    {!selected && !finale && !moving && <OrbitControls enablePan={false} enableDamping={!reducedMotion} dampingFactor={0.065} minDistance={7.5} maxDistance={17} minPolarAngle={0.08} maxPolarAngle={Math.PI - 0.08} rotateSpeed={0.55} zoomSpeed={0.6} target={[0, 0.3, 0]} />}
    <CameraRig selected={selected} finale={finale} reducedMotion={reducedMotion} resetKey={resetKey} onMoving={setMoving} enabled={!inside} />
    {selected === 'camping' && !inside && !finale && !moving && <CampingViewControls key={resetKey} reducedMotion={reducedMotion} />}
    {inside && <RoomInterior key={selected} id={selected} reducedMotion={reducedMotion} input={roomInput} spinning={spinning} onSpin={onSpin} onExit={onExitRoom} onPoster={onPoster} paused={posterOpen} />}
  </>;
}
