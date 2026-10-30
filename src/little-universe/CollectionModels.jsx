import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { collectionModels, fitCollectionModel, modelUrl } from './collection-models.js';

// Immutable geometry/textures are shared by the room and the detail canvas.
// This cache is bounded by the local asset catalog for the lifetime of the page.
const models = new Map();
function loadModel(id) {
  if (!models.has(id)) {
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    models.set(id, loader.loadAsync(modelUrl(id)).then(gltf => gltf.scene).catch(error => { models.delete(id); throw error; }));
  }
  return models.get(id);
}
export function LocalModel({ id, size, rotation = [0, 0, 0], onSelect, spinPropeller = false }) {
  const [source, setSource] = useState(null); const [failed, setFailed] = useState(false); const [retry, setRetry] = useState(0);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    let cancelled = false; setSource(null); setFailed(false);
    loadModel(id).then(model => { if (!cancelled) { setSource(model); invalidate(); } }, error => { if (!cancelled) { console.warn(`[Little Universe] Could not load ${id}`, error); setFailed(true); } });
    return () => { cancelled = true; };
  }, [id, retry, invalidate]);
  const fitted = useMemo(() => source ? fitCollectionModel(source, size, rotation) : null, [source, ...size, ...rotation]);
  const propeller = useMemo(() => fitted?.getObjectByName('cessna-propeller'), [fitted]);
  useFrame((_, delta) => {
    if (!spinPropeller || !propeller) return;
    propeller.rotation.z = (propeller.rotation.z + Math.min(delta, .05) * 1.2) % (Math.PI * 2);
    invalidate();
  });
  useEffect(() => { if (spinPropeller) invalidate(); }, [spinPropeller, invalidate]);
  return <group onClick={event => { event.stopPropagation(); if (onSelect && event.delta < 6) onSelect(id); }}>
    {fitted ? <primitive object={fitted} dispose={null} /> : <Html center><div className="lu-model-status" role="status">{failed ? <>Model unavailable <button onClick={() => setRetry(n => n + 1)}>Retry</button></> : 'Loading model…'}</div></Html>}
  </group>;
}
export function RoomCollection({ room, onSelect }) {
  return collectionModels.filter(item => item.room === room).map(item => <group key={item.id} position={item.position}>
    <LocalModel id={item.id} size={item.size} rotation={item.rotation} onSelect={onSelect} />
    {item.id === 'cessna-172' && <>
      <pointLight position={[0, 1.6, 1.2]} intensity={1.4} distance={3.5} color="#ffe8cd" />
    </>}
    <Html position={item.labelPosition || [0, -.09, .17]} center zIndexRange={[23, 22]}><button className="lu-room-tag" onClick={() => onSelect(item.id)}>{item.name} ↗</button></Html>
  </group>);
}
class ModelBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="status">The 3D view is unavailable. Close and reopen to retry.</p> : this.props.children; }
}
function DetailScene({ item, view, zoom, spinPropeller, reducedMotion }) {
  const controls = useRef();
  const { camera, invalidate, size } = useThree();
  const desiredPosition = useRef(null);
  const aircraft = item.aircraft === true;
  const targetY = item.id === 'rose' ? 1 : aircraft ? .42 : item.room === 'workshop' ? .95 : item.id === 'ru-winter-su100' ? .48 : .35;
  useEffect(() => {
    const angle = view * Math.PI / 2 + .45;
    const distance = Math.max(3, 3.5 / (size.width / size.height)) * zoom * (aircraft && size.width < size.height ? 1.15 : 1);
    const next = new Vector3(Math.sin(angle) * distance, targetY + distance * (aircraft ? .65 : .3), Math.cos(angle) * distance);
    if (aircraft) next.sub(new Vector3(0, targetY, 0)).clampLength(1.5, 7).add(new Vector3(0, targetY, 0));
    if (aircraft && !reducedMotion) desiredPosition.current = next;
    else { desiredPosition.current = null; camera.position.copy(next); }
    controls.current?.target.set(0, targetY, 0); controls.current?.update(); invalidate();
  }, [camera, invalidate, view, zoom, targetY, size.width, size.height, aircraft, reducedMotion]);
  useFrame((_, delta) => {
    if (!desiredPosition.current) return;
    camera.position.lerp(desiredPosition.current, 1 - Math.exp(-8 * Math.min(delta, .05)));
    controls.current?.update();
    if (camera.position.distanceTo(desiredPosition.current) < .002) { camera.position.copy(desiredPosition.current); desiredPosition.current = null; }
    invalidate();
  });
  return <>
    <ambientLight intensity={item.fighter ? .65 : 1.4} /><hemisphereLight args={['#fff7ed', '#a0a5bb', item.fighter ? 1 : 2]} />
    <directionalLight position={[3, 5, 4]} intensity={item.fighter ? 2 : 3} /><directionalLight position={[-3, 2, -2]} intensity={item.fighter ? 1 : 2} />
    <LocalModel id={item.id} size={aircraft ? [3.3, 2, 3.3] : [2.5, 2, 2.5]} rotation={item.rotation} spinPropeller={spinPropeller} />
    <OrbitControls onStart={() => { desiredPosition.current = null; }} ref={controls} target={[0, targetY, 0]} minDistance={1.5} maxDistance={7} enablePan={false} />
  </>;
}
export function ModelViewer({ initialId, onClose }) {
  const dialog = useRef(); const [id, setId] = useState(initialId); const [view, setView] = useState(0); const [zoom, setZoom] = useState(1);
  const [spinPropeller, setSpinPropeller] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches); update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => setSpinPropeller(false), [id, reducedMotion]);
  const item = collectionModels.find(model => model.id === id);
  useEffect(() => {
    const element = dialog.current; const previous = document.activeElement; element.showModal();
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected && previous.matches('button, a, [tabindex]')) previous.focus({ preventScroll: true }); else document.querySelector('.lu-record-controls button')?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="lu-model-viewer" aria-labelledby="lu-model-title" onCancel={onClose} onKeyDown={event => event.stopPropagation()}>
    <header><div><p className="lu-eyebrow">A CLOSER LOOK</p><h2 id="lu-model-title">{item.name}</h2></div><button className="lu-pill" autoFocus onClick={onClose} aria-label="Close model viewer">Back to the collection ×</button></header>
    <div className="lu-model-stage" aria-label={`Interactive 3D view of ${item.name}`}><ModelBoundary key={id}><Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [2, 2, 4], fov: 42 }}><DetailScene key={id} item={item} view={view} zoom={zoom} spinPropeller={spinPropeller && !reducedMotion} reducedMotion={reducedMotion} /></Canvas></ModelBoundary></div>
    <p>{item.note}</p><p className="lu-model-help">Drag to rotate · Scroll or pinch to zoom</p>
    <div className="lu-model-controls"><button className="lu-pill" onClick={() => setView(v => v - 1)} aria-label="Rotate model left">↶ Rotate left</button><button className="lu-pill" onClick={() => setView(v => v + 1)} aria-label="Rotate model right">Rotate right ↷</button><button className="lu-pill" onClick={() => setZoom(v => Math.max(.55, v - .15))}>Zoom in</button><button className="lu-pill" onClick={() => setZoom(v => Math.min(1.5, v + .15))}>Zoom out</button><button className="lu-pill" onClick={() => { setView(0); setZoom(1); }}>Reset view</button></div>
    {id === 'cessna-172' && <div className="lu-model-controls"><button className="lu-pill" aria-pressed={spinPropeller && !reducedMotion} disabled={reducedMotion} onClick={() => setSpinPropeller(value => !value)}>{spinPropeller && !reducedMotion ? 'Stop propeller' : 'Turn propeller slowly'}</button>{reducedMotion && <small>Propeller rests while reduced motion is on.</small>}</div>}
    <nav className="lu-model-controls" aria-label="Choose a collection model">{collectionModels.filter(model => model.room === item.room).map(model => <button className="lu-pill" key={model.id} aria-pressed={model.id === id} onClick={() => { setId(model.id); setView(0); setZoom(1); }}>{model.name}</button>)}</nav>
  </dialog>;
}
