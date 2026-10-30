import { Component, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SPROUT_PIG_URL } from './sprout-pig.js';
import { disposeMiniature } from './miniature.js';

class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">无法启动 3D 预览，请刷新页面重试。</p> : this.props.children; }
}
function Model({ onStatus }) {
  const [model, setModel] = useState(null);
  useEffect(() => {
    let cancelled = false, owned;
    new GLTFLoader().load(SPROUT_PIG_URL, ({ scene }) => {
      if (cancelled) { disposeMiniature(scene); return; }
      owned = scene; scene.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      setModel(scene); onStatus('ready');
    }, undefined, () => { if (!cancelled) onStatus('failed'); });
    return () => { cancelled = true; if (owned) disposeMiniature(owned); };
  }, [onStatus]);
  return model && <primitive object={model} dispose={null} />;
}
function Camera({ view }) {
  const controls = useRef(); const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const angle = { portrait: .25, front: 0, left: -Math.PI / 2, right: Math.PI / 2, back: Math.PI }[view];
    const distance = Math.max(1.95, 1.4 / (size.width / size.height));
    camera.position.set(Math.sin(angle) * distance, .84, Math.cos(angle) * distance);
    camera.lookAt(0, .5, 0); controls.current?.target.set(0, .5, 0); controls.current?.update(); invalidate();
  }, [camera, size.width, size.height, view, invalidate]);
  return <OrbitControls ref={controls} target={[0, .5, 0]} enablePan={false} minDistance={1.5} maxDistance={5} minPolarAngle={.15} maxPolarAngle={Math.PI * .68} />;
}
export default function SproutPigPreview() {
  const [view, setView] = useState('portrait'); const [status, setStatus] = useState('loading');
  return <section className="study-viewer" aria-label="发芽小猪真实 3D 模型预览">
    <div className="study-canvas">
      <Boundary><Canvas shadows frameloop="demand" dpr={[1, 1.75]} camera={{ position: [.6, .84, 2.5], fov: 35, near: .05, far: 30 }}>
        <color attach="background" args={['#f5ecdf']} />
        <ambientLight intensity={.65} />
        <hemisphereLight args={['#fff7ed', '#d0beb0', .9]} />
        <directionalLight position={[-3, 5, 4]} intensity={2.1} color="#fff4e6" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-1.5} shadow-camera-right={1.5} shadow-camera-top={1.5} shadow-camera-bottom={-1.5} shadow-normalBias={.002} />
        <directionalLight position={[3, 2, -2]} intensity={.9} color="#ffffff" />
        <Model onStatus={setStatus} />
        <ContactShadows position={[0, -.003, 0]} opacity={.3} scale={4} blur={2.5} far={1.4} resolution={512} frames={Infinity} />
        <Camera view={view} />
      </Canvas></Boundary>
      {status !== 'ready' && <p className="study-status" role="status">{status === 'failed' ? '模型加载失败，请刷新重试。' : '正在加载 3D 小猪…'}</p>}
    </div>
    <nav aria-label="模型观察角度">{[['portrait', '小肖像'], ['front', '正面'], ['left', '左侧'], ['right', '右侧'], ['back', '背面']].map(([value, label]) => <button key={value} onClick={() => setView(value)} aria-pressed={view === value}>{label}</button>)}</nav>
    <p className="study-hint">拖动旋转 · 滚轮或双指缩放</p>
  </section>;
}
