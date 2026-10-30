import { Component, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { createBirthdayCharacter } from './characters.js';
import { disposeMiniature } from './miniature.js';

class PreviewBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">3D preview is unavailable. Reload to try again.</p> : this.props.children; }
}

function Cast({ together }) {
  const models = useMemo(() => ['little-pig', 'bai-baicai'].map(createBirthdayCharacter), []);
  useEffect(() => () => models.forEach(disposeMiniature), [models]);
  return <>{models.map((model, i) => <primitive key={model.name} object={model} visible={i === 0 || together} position={[together ? (i ? 0.25 : -0.25) : 0, 0, 0]} dispose={null} />)}</>;
}

function Camera({ view, together }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const distance = Math.max(together ? 1.65 : 1.08, (together ? 1.1 : .58) / (size.width / size.height));
    const angle = view === 'back' ? Math.PI : view === 'side' ? Math.PI / 2 : view === 'portrait' ? .38 : 0;
    camera.position.set(Math.sin(angle) * distance, 0.44, Math.cos(angle) * distance);
    camera.lookAt(0, 0.23, 0);
  }, [camera, size.width, size.height, view, together]);
  return <OrbitControls key={`${view}-${together}-${size.width}-${size.height}`} target={[0, 0.23, 0]} enablePan={false} minDistance={0.65} maxDistance={4} minPolarAngle={0.2} maxPolarAngle={Math.PI / 2 + 0.08} />;
}

export default function CharacterPreview() {
  const [view, setView] = useState('portrait');
  const [together, setTogether] = useState(false);
  return <main className="character-studio">
    <header><a href="/little-universe/">← 回到生日星球</a><p>THE LITTLE UNIVERSE · CLAY COLLECTION</p><h1>一只软乎乎的小猪</h1><span>粉色刘海，暖暖脸颊，还有藏在身后的卷尾巴。</span></header>
    <div className="character-canvas" aria-label="Interactive 3D preview of Little Pig and Bai Baicai">
      <PreviewBoundary><Canvas shadows dpr={[1, 1.5]} camera={{ position: [0.2, 0.44, 1.8], fov: 38, near: 0.01, far: 20 }}>
        <color attach="background" args={['#f3eadc']} />
        <ambientLight intensity={.6} />
        <hemisphereLight args={['#fff1df', '#b4ab94', 1]} />
        <directionalLight position={[-2, 3, 4]} intensity={2.4} color="#fff0dc" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-1} shadow-camera-right={1} shadow-camera-top={1} shadow-camera-bottom={-1} shadow-normalBias={0.002} />
        <directionalLight position={[2, 1, -2]} intensity={1.3} color="#fff2dc" />
        <Cast together={together} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow><planeGeometry args={[200, 200]} /><shadowMaterial transparent opacity={0.14} /></mesh>
        <Camera view={view} together={together} />
      </Canvas></PreviewBoundary>
    </div>
    <footer><nav aria-label="查看角度">{[['portrait', '小肖像'], ['front', '正面'], ['side', '侧面'], ['back', '背面']].map(([value, label]) => <button key={value} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</nav><p>拖动转一转 · 滚轮或双指缩放</p><button className="companion-toggle" aria-pressed={together} onClick={() => setTogether(!together)}>{together ? '只看小猪' : '叫白菜来合照'}</button></footer>
  </main>;
}
