import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BIRTHDAY_MESSAGE, birthdayPreview, isCabbageBirthday, watchBirthday } from '../birthday.js';

const ASPECT = 2048 / 720;
const PLANET_CENTER = new THREE.Vector3(0, 1.7, 0);
const NO_RAYCAST = () => {};

export function useBirthday() {
  const [active, setActive] = useState(() => birthdayPreview(window.location) ?? isCabbageBirthday());
  useEffect(() => watchBirthday(setActive, {
    preview: birthdayPreview(window.location),
    subscribeWake(check) {
      document.addEventListener('visibilitychange', check);
      window.addEventListener('focus', check);
      window.addEventListener('pageshow', check);
      return () => {
        document.removeEventListener('visibilitychange', check);
        window.removeEventListener('focus', check);
        window.removeEventListener('pageshow', check);
      };
    },
  }), []);
  return active;
}

// Browser-owned, locally drawn type: no font download or image request.
// One transparent quad carries both crisp lemon-yellow letters and soft glow.
function createBirthdayTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 720;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const line = (text, y, size) => {
    ctx.font = `900 ${size}px "Arial Black", "Segoe UI", sans-serif`;
    ctx.shadowColor = '#ffe600'; ctx.shadowBlur = 14;
    ctx.strokeStyle = '#a57700'; ctx.lineWidth = 6;
    ctx.strokeText(text, 1024, y);
    ctx.fillStyle = '#ffff25';
    ctx.fillText(text, 1024, y);
    ctx.shadowBlur = 0;
    ctx.fillText(text, 1024, y);
  };
  line('HAPPY BIRTHDAY', 220, 155);
  line('CABBAGE', 445, 255);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = 'annual-cabbage-birthday-type';
  return texture;
}

function BirthdayLetters({ scene, visible }) {
  const mesh = useRef();
  const up = useRef(new THREE.Vector3());
  const [texture, setTexture] = useState(null);
  // Allocate inside the effect so StrictMode cleanup never reuses a disposed map.
  useEffect(() => {
    const owned = createBirthdayTexture();
    setTexture(owned);
    return () => owned.dispose();
  }, []);
  useFrame(({ camera, size }) => {
    if (!mesh.current) return;
    mesh.current.visible = visible && (scene !== 'villa' || camera.position.y >= 0);
    if (!mesh.current.visible) return;
    if (scene === 'villa') {
      // Translate with the camera, but keep a fixed northeast sky direction.
      // Depth testing lets real walls/roofs occlude it. The pocket is excluded.
      mesh.current.position.copy(camera.position).add(up.current.set(75, 175, -200));
      mesh.current.lookAt(camera.position);
      const width = Math.min(200, 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 265 * size.width / size.height * .95);
      mesh.current.scale.set(width, width / ASPECT, 1);
    } else {
      const distance = camera.position.distanceTo(PLANET_CENTER);
      const height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
      const width = Math.min(8.8, height * size.width / size.height * .92);
      up.current.set(0, 1, 0).applyQuaternion(camera.quaternion);
      mesh.current.position.copy(PLANET_CENTER).addScaledVector(up.current, height * .5 - width / ASPECT * .48 - .08);
      mesh.current.quaternion.copy(camera.quaternion);
      mesh.current.scale.set(width, width / ASPECT, 1);
    }
  });
  if (!texture) return null;
  return <mesh ref={mesh} name="annual-cabbage-birthday" visible={false}
    renderOrder={801} raycast={NO_RAYCAST} userData={{ message: BIRTHDAY_MESSAGE }}>
    <planeGeometry args={[1, 1]} />
    <meshBasicMaterial map={texture} transparent depthTest depthWrite={false}
      toneMapped={false} fog={false} side={THREE.DoubleSide} />
  </mesh>;
}

function ScheduledBirthdaySky({ scene, visible }) {
  const active = useBirthday();
  return active ? <BirthdayLetters scene={scene} visible={visible} /> : null;
}

export default function BirthdaySky({ scene, visible = true, active }) {
  if (active === undefined) return <ScheduledBirthdaySky scene={scene} visible={visible} />;
  return active ? <BirthdayLetters scene={scene} visible={visible} /> : null;
}