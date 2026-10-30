import { useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCampingMiniature, composeCampingProps, disposeCampingProps, campingMotion, CAMP_ASSET_URL, CAMPFIRE, CAMP_CAPTION, CAMP_LANTERN } from './camping.js';
import { LocalModel } from './CollectionModels.jsx';
import { disposeMiniature } from './miniature.js';

let sourcePromise;
function loadCampingProps() {
  sourcePromise ||= new GLTFLoader().loadAsync(CAMP_ASSET_URL).then(gltf => gltf.scene).catch(error => { sourcePromise = null; throw error; });
  return sourcePromise;
}

function CampConversation({ dialogue, reducedMotion }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (reducedMotion || line === dialogue.length - 1) return;
    const timer = setTimeout(() => setLine((current) => Math.min(current + 1, dialogue.length - 1)), line === 0 ? 5500 : 4500);
    return () => clearTimeout(timer);
  }, [line, reducedMotion, dialogue]);
  const current = dialogue[line];
  if (!current) return null;
  return <Html position={CAMP_CAPTION} center zIndexRange={[24, 23]}>
    <button className="lu-camp-caption" onClick={() => setLine((value) => (value + 1) % dialogue.length)} aria-label={`${current.speaker}: ${current.text} ${line === dialogue.length - 1 ? 'Replay conversation' : 'Next line'}`}>
      <span className="lu-camp-speaker">{current.speaker}</span>
      <span className="lu-camp-words" aria-live="polite">“{current.text}”</span>
      <span className="lu-camp-next">{line === dialogue.length - 1 ? '↺ replay' : 'tap to continue'}</span>
    </button>
  </Html>;
}

export default function CampingVignette({ active, showCaptions, reducedMotion, dialogue }) {
  const ground = useMemo(createCampingMiniature, []);
  const [source, setSource] = useState(null); const [failed, setFailed] = useState(false); const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false; setFailed(false);
    loadCampingProps().then(value => { if (!cancelled) setSource(value); }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [retry]);
  const props = useMemo(() => source ? composeCampingProps(source) : null, [source]);
  const flame = useMemo(() => props?.getObjectByName('campfire-flames'), [props]);
  useEffect(() => () => disposeMiniature(ground), [ground]);
  useEffect(() => () => { if (props) disposeCampingProps(props); }, [props]);
  const fireLight = useRef(); const lanternLight = useRef(); const pig = useRef(); const cabbage = useRef();
  const particles = useRef(); const time = useRef(0);
  const dots = useMemo(() => new Float32Array(24 * 3), []);
  useFrame((_, delta) => {
    if (active && !reducedMotion) time.current += Math.min(delta, .1);
    const t = time.current; const motion = campingMotion(t, reducedMotion || !active);
    if (flame) { flame.scale.y = motion.flame; flame.scale.x = 1 + (motion.flame - 1) * .3; }
    fireLight.current.intensity = active ? motion.fireLight : .025;
    lanternLight.current.intensity = active ? .07 : 0;
    pig.current.position.y = .065 + motion.pigBreath;
    cabbage.current.rotation.z = motion.leafSway * .3;
    if (particles.current) {
      for (let i = 0; i < 24; i++) {
        const ember = i < 8; const phase = (t * (ember ? .17 : .035) + i * .618) % 1;
        dots[i * 3] = ember ? Math.sin(i * 2.4 + t * .7) * .045 : Math.sin(i * 2.4 + t * .12) * .62;
        dots[i * 3 + 1] = ember ? .21 + phase * .32 : .2 + (Math.sin(i + t * .35) + 1) * .2;
        dots[i * 3 + 2] = ember ? .35 + Math.cos(i + t) * .035 : Math.cos(i * 2.4 + t * .1) * .55;
      }
      particles.current.geometry.attributes.position.needsUpdate = true;
    }
  });
  return <group>
    <primitive object={ground} dispose={null} />
    {props && <primitive object={props} dispose={null} />}
    {!props && active && <Html position={[0, .55, 0]} center><div className="lu-model-status" role="status">{failed ? <>Campsite unavailable <button onClick={() => setRetry(v => v + 1)}>Retry campsite</button></> : 'Preparing our campsite…'}</div></Html>}
    <group ref={pig} position={[-.25, .065, .39]}><LocalModel id="little-pig" size={[.24, .3, .23]} rotation={[0, .3, 0]} /></group>
    <group ref={cabbage} position={[.25, .065, .4]}><LocalModel id="bai-baicai" size={[.24, .29, .23]} rotation={[0, -.3, 0]} /></group>
    <pointLight ref={fireLight} position={[CAMPFIRE[0], .27, CAMPFIRE[2]]} color="#ffb76c" distance={1.8} decay={2} intensity={.025} />
    <pointLight ref={lanternLight} position={CAMP_LANTERN} color="#ffd39a" distance={1} decay={2} intensity={0} />
    {active && <pointLight position={[-.04, .2, -.2]} color="#ffcf89" distance={.65} decay={2} intensity={.035} />}
    {active && !reducedMotion && <points ref={particles} frustumCulled={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[dots, 3]} /></bufferGeometry>
      <pointsMaterial color="#ffe4a0" size={.009} transparent opacity={.65} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>}
    {showCaptions && props && <CampConversation dialogue={dialogue} reducedMotion={reducedMotion} />}
  </group>;
}
