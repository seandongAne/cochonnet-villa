import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { subscribeAssetProgress } from '../asset-loading.js';
import {
  createBirthdayDecorations, createBirthdayHat, createVillageBirthdayHats,
  fitBirthdayHat, installBirthdayColliders, disposeParty,
} from '../birthday-party.js';

// Separate sibling groups survive the streamed loader's group.clear() swap.
// Their lifetime is independent of the residents and of the player controls.
export function BirthdayParty({ porkies, world }) {
  const mount = useRef();
  const get = useThree(state => state.get);
  useEffect(() => {
    const root = new THREE.Group(); root.name = 'annual-villa-birthday-party';
    root.add(createBirthdayDecorations(), createVillageBirthdayHats());
    const signs = createBirthdaySigns(); root.add(signs.root);
    const hats = porkies.map(({ placement, object }, index) => {
      const pivot = new THREE.Group(); pivot.name = `birthday-${placement.id}`;
      pivot.position.fromArray(placement.position); pivot.rotation.y = placement.rotationY ?? 0;
      const hat = createBirthdayHat(index); pivot.add(hat); root.add(pivot);
      return { placement, object, hat, state: null };
    });
    const refresh = () => {
      let changed = false;
      for (const entry of hats) {
        const state = entry.object.userData.assetState;
        if (state === entry.state) continue;
        fitBirthdayHat(entry.hat, entry.object, entry.placement, state);
        entry.state = state; changed = true;
      }
      if (changed) { get().gl.shadowMap.needsUpdate = true; get().invalidate(); }
    };
    refresh();
    mount.current.add(root);
    const removeColliders = installBirthdayColliders(world);
    let frame;
    const unsubscribe = subscribeAssetProgress(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refresh);
    });
    get().gl.shadowMap.needsUpdate = true;
    return () => {
      unsubscribe(); cancelAnimationFrame(frame);
      root.removeFromParent(); disposeParty(root); signs.texture.dispose();
      removeColliders();
      get().gl.shadowMap.needsUpdate = true;
    };
  }, [porkies, world, get]);
  return <group ref={mount} />;
}

function createBirthdaySigns() {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff5df'; ctx.beginPath(); ctx.roundRect(4, 4, 760, 248, 38); ctx.fill();
  ctx.strokeStyle = '#c29950'; ctx.lineWidth = 6; ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = '#845e47';
  ctx.font = '600 34px Georgia'; ctx.fillText('HAPPY BIRTHDAY', 384, 87);
  ctx.font = 'bold 76px Georgia'; ctx.fillText('CABBAGE', 384, 177);
  ctx.fillStyle = '#a3bb88';
  for (const x of [65, 703]) { ctx.beginPath(); ctx.ellipse(x, 130, 13, 23, -.35, 0, Math.PI * 2); ctx.fill(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
  const root = new THREE.Group(); root.name = 'birthday-welcome-signs';
  for (const [position, width] of [[[2, 2.47, 40.54], 2.5], [[8.4, .85, 10.19], .95]]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 3), material);
    sign.position.fromArray(position); root.add(sign);
    const back = sign.clone(); back.position.z -= .008; back.rotation.y = Math.PI; root.add(back);
  }
  return { root, texture };
}
