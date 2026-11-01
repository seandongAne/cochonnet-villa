import { useMemo } from 'react';
import { Object3D } from 'three';
import { GALLERY_SLOTS } from './gallery-interior.js';
import { CinemaSign } from './MovieNight.jsx';

// Only mounted in the gallery: one cached daylight shadow and nine unshadowed art lights.
export function GalleryLighting() {
  const targets = useMemo(() => GALLERY_SLOTS.map(slot => {
    const target = new Object3D(); target.position.set(...slot.position); return target;
  }), []);
  const sunTarget = useMemo(() => { const target = new Object3D(); target.position.set(0, 0, -2.5); return target; }, []);
  return <>
    <ambientLight intensity={.65} color="#fff6e9" />
    <hemisphereLight args={['#f3f8ff', '#d8c1a0', 1.65]} />
    <primitive object={sunTarget} />
    <directionalLight position={[-3.7, 4.05, 4.4]} target={sunTarget} intensity={2.1} color="#fff0d6"
      castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-8} shadow-camera-right={8}
      shadow-camera-top={8} shadow-camera-bottom={-8} shadow-camera-near={.1} shadow-camera-far={24}
      shadow-normalBias={.035} shadow-bias={-.00015} shadow-autoUpdate={false} shadow-needsUpdate={true} />
    {GALLERY_SLOTS.map((slot, index) => <group key={index}>
      <primitive object={targets[index]} />
      <spotLight position={[slot.position[0] + Math.sin(slot.rotation) * .85, 3.75, slot.position[2] + Math.cos(slot.rotation) * .85]}
        target={targets[index]} intensity={7} angle={.8} penumbra={1} distance={5} decay={2} color="#fff4df" />
    </group>)}
    <CinemaSign title="THE LITTLE GALLERY" subtitle="A LITTLE LIGHT. A MOMENT HELD IN COLOR."
      size={[3.25, .48]} position={[0, 4.5, -5.91]} background="#f7f2e9" color="#8b7c65" />
  </>;
}
