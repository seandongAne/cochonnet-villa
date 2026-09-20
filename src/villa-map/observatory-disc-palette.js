import * as THREE from 'three';
import { DISC_PALETTE_RGBA } from './observatory-disc-palette-data.js';

// Tiny owned texture: no browser objects, requests or import-time GPU work.
export function createObservatoryDiscPalette() {
  const texture = new THREE.DataTexture(DISC_PALETTE_RGBA.slice(), 512, 1,
    THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'observatory-nestaeric-disc-palette';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
