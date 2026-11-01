import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Html, Lightformer, MeshReflectorMaterial } from '@react-three/drei';
import { ACESFilmicToneMapping, CanvasTexture, SRGBColorSpace } from 'three';
import { loadModel, LocalModel } from './CollectionModels.jsx';
import { collectionModels } from './collection-models.js';
import { HANGAR_DISPLAYS } from './hangar-atelier.js';
import { PEDESTAL_TOP, SHOWCASE_MODEL, prepareShowcaseModel } from './hangar-showcase.js';

function AtelierPlaque() {
  const [map, setMap] = useState(null);
  useEffect(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 640;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c1cacb'; ctx.fillRect(0, 0, 1536, 640);
    ctx.fillStyle = '#526c78'; ctx.font = '500 34px sans-serif';
    ctx.fillText('T H E   H A N G A R', 90, 116);
    ctx.fillStyle = '#344f5c'; ctx.font = '300 150px sans-serif'; ctx.fillText('ATELIER', 80, 300);
    ctx.fillStyle = '#607c88'; ctx.font = '300 230px sans-serif'; ctx.fillText('01', 1140, 300);
    ctx.fillStyle = '#6d8590'; ctx.fillRect(90, 370, 1350, 2);
    ctx.font = '500 26px sans-serif'; ctx.fillText('FORM  /  PRECISION  /  IMAGINATION', 90, 435);
    ctx.font = '500 21px sans-serif'; ctx.fillText('REBORNS GUNDAM     —     THE COLLECTION', 90, 535);
    for (let i = 0; i < 48; i++) ctx.fillRect(1160 + i * 6, 485, i % 3 === 0 ? 3 : 1, 42);
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    setMap(texture); return () => texture.dispose();
  }, []);
  return map && <mesh position={[0, 5.1, -10.34]}><planeGeometry args={[6.4, 2.66]} /><meshStandardMaterial map={map} metalness={.35} roughness={.52} /></mesh>;
}
function Exhibit({ retry, onStatus, onSelect }) {
  const [prepared, setPrepared] = useState(null);
  const { gl, scene, camera, invalidate } = useThree();
  useEffect(() => {
    let cancelled = false; let owned;
    onStatus('loading');
    loadModel(SHOWCASE_MODEL).then(async source => {
      if (cancelled) return;
      owned = prepareShowcaseModel(source);
      const textures = new Set();
      owned.root.traverse(mesh => { for (const m of [mesh.material].flat()) if (m) for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); });
      for (const texture of textures) gl.initTexture(texture);
      await gl.compileAsync(owned.root, camera, scene);
      if (cancelled) { owned.dispose(); return; }
      setPrepared(owned); onStatus('ready'); invalidate();
    }).catch(error => { if (!cancelled) { console.warn('[Hangar] Asset preparation failed', error); onStatus('error'); } });
    return () => { cancelled = true; owned?.dispose(); };
  }, [retry, gl, scene, camera, invalidate, onStatus]);
  return prepared ? <>
    <group position={[0, PEDESTAL_TOP, 0]} onClick={event => { event.stopPropagation(); if (event.delta < 6) onSelect(SHOWCASE_MODEL); }}><primitive object={prepared.root} dispose={null} /></group>
    <ContactShadows key={`floor-${retry}`} position={[0, .005, 0]} frames={2} resolution={256} scale={10} far={1} opacity={.28} blur={3} color="#536772" />
    <ContactShadows key={retry} position={[0, PEDESTAL_TOP + .006, 0]} frames={2} resolution={512} scale={8} far={6} opacity={.32} blur={3.2} color="#354751" />
  </> : null;
}

function NearbyLabel({ item, name, onSelect }) {
  const [nearby, setNearby] = useState(false);
  useFrame(({ camera }) => {
    const near = Math.hypot(camera.position.x - item.position[0], camera.position.z - item.position[2]) < 3.6;
    if (near !== nearby) setNearby(near);
  });
  return nearby && <Html position={[item.position[0] < 0 ? 1 : -1, .3, 0]} center occlude zIndexRange={[23, 22]}><button className="lu-room-tag" onClick={() => onSelect(item.id)}>{name} ↗</button></Html>;
}

export default function HangarAtelier({ onSelect, onExit }) {
  const [status, setStatus] = useState('loading');
  const [retry, setRetry] = useState(0);
  const onStatus = useCallback(next => setStatus(next), []);
  const { gl } = useThree();
  useLayoutEffect(() => {
    const saved = { toneMapping: gl.toneMapping, exposure: gl.toneMappingExposure };
    gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1;
    return () => { gl.toneMapping = saved.toneMapping; gl.toneMappingExposure = saved.exposure; };
  }, [gl]);
  return <>
    <color attach="background" args={['#dce2e1']} /><fog attach="fog" args={['#dce2e1', 38, 85]} />
    <hemisphereLight args={['#f2f5f3', '#9fadb5', 1.35]} />
    <spotLight position={[1, 10, 6]} angle={.65} penumbra={1} intensity={220} color="#fff4e4" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-.00015} shadow-normalBias={.025} shadow-radius={4} />
    <directionalLight position={[-6, 6, 5]} intensity={1.65} color="#e4f0f7" />
    <directionalLight position={[4, 5, -5]} intensity={2.1} color="#f7f4ed" />
    <Environment resolution={128} frames={1}>
      <Lightformer form="rect" intensity={2.5} color="#fff8ee" scale={[12, 9, 1]} position={[0, 9, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <Lightformer form="rect" intensity={1.8} color="#e5f0f6" scale={[5, 8, 1]} position={[-9, 4, 2]} rotation={[0, Math.PI / 2, 0]} />
      <Lightformer form="rect" intensity={2} color="#fff6e7" scale={[5, 7, 1]} position={[8, 4, 0]} rotation={[0, -Math.PI / 2, 0]} />
      <Lightformer form="rect" intensity={1.2} color="#ffffff" scale={[10, 5, 1]} position={[0, 5, 12]} rotation={[0, Math.PI, 0]} />
    </Environment>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.015, .5]} receiveShadow>
      <planeGeometry args={[26, 23]} />
      <MeshReflectorMaterial resolution={512} blur={[240, 100]} mixBlur={1} mixStrength={.38} mirror={.22} color="#a4b1b8" metalness={.48} roughness={.5} depthScale={.1} />
    </mesh>
    <AtelierPlaque />
    <Exhibit retry={retry} onStatus={onStatus} onSelect={onSelect} />
    {status !== 'ready' && <Html position={[0, 2.8, 0]} center><div className="lu-model-status" role="status">{status === 'error' ? <>Reborns Gundam could not load. <button onClick={() => setRetry(n => n + 1)}>Retry</button></> : 'Preparing Reborns Gundam…'}</div></Html>}
    {HANGAR_DISPLAYS.map(item => {
      const name = collectionModels.find(model => model.id === item.id).name;
      return <group key={item.id} position={item.position}>
        <LocalModel id={item.id} size={item.size} rotation={item.rotation} onSelect={onSelect} />
        <NearbyLabel item={item} name={name} onSelect={onSelect} />
      </group>;
    })}
    <Html position={[0, .85, 3.45]} center zIndexRange={[23, 22]}><button className="lu-room-tag" onClick={() => onSelect(SHOWCASE_MODEL)}>Reborns Gundam ↗</button></Html>
    <Html position={[0, 1.75, 11.7]} center occlude zIndexRange={[23, 22]}><button className="lu-room-tag" onClick={onExit}>Step outside ↗</button></Html>
  </>;
}
