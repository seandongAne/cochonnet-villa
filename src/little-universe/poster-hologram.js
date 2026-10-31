// Node-pure projection geometry. The caller owns the poster texture.
import * as THREE from 'three';
import { disposeMiniature } from './miniature.js';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function lightMaterial(fragmentShader, uniforms = {}) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
}

export function createPosterHologram(texture, [width, height]) {
  const root = new THREE.Group(); root.name = 'poster-hologram';
  const floating = new THREE.Group(); floating.position.z = .24; root.add(floating);
  const time = { value: 0 };
  // MeshBasicMaterial retains Three's texture color-space and output conversion.
  const artwork = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: .9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  artwork.onBeforeCompile = (shader) => {
    shader.uniforms.holoTime = time;
    shader.fragmentShader = 'uniform float holoTime;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      #ifdef USE_MAP
        float scan = 0.5 + 0.5 * sin(vMapUv.y * 640.0);
        float sweepDistance = abs(vMapUv.y - (fract(holoTime * 0.11) * 1.4 - 0.2));
        float sweep = 1.0 - smoothstep(0.0, 0.065, sweepDistance);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 1.08, 1.16), 0.32);
        diffuseColor.rgb += vec3(0.06, 0.24, 0.29) * sweep;
        diffuseColor.a *= 0.92 + 0.08 * scan;
      #endif
    `);
  };
  artwork.customProgramCacheKey = () => 'cinema-hologram-v1';
  const image = new THREE.Mesh(new THREE.PlaneGeometry(width, height), artwork);
  image.name = 'hologram-artwork'; floating.add(image);

  const rim = new THREE.Mesh(new THREE.PlaneGeometry(width + .12, height + .12), lightMaterial(`
    varying vec2 vUv;
    void main() {
      vec2 edge = min(vUv, 1.0 - vUv);
      float d = min(edge.x, edge.y);
      float line = exp(-abs(d - 0.034) * 310.0);
      float halo = exp(-abs(d - 0.034) * 48.0) * 0.16;
      gl_FragColor = vec4(0.23, 0.88, 1.0, line * 0.72 + halo);
      #include <colorspace_fragment>
    }
  `));
  rim.position.z = -.012; rim.raycast = () => {}; floating.add(rim);

  // A tapered light volume connects the emitter to the bottom of the image.
  const bottom = -1.18, top = -height / 2;
  const beamGeometry = new THREE.BufferGeometry();
  beamGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.15, bottom, .20, .15, bottom, .20, width / 2, top, .24, -width / 2, top, .24,
    0, bottom, .08, 0, bottom, .32, 0, top, .38, 0, top, .10,
  ], 3));
  beamGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
  beamGeometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const beam = new THREE.Mesh(beamGeometry, lightMaterial(`
    varying vec2 vUv;
    void main() {
      float sides = pow(max(0.0, sin(vUv.x * 3.14159265)), 0.7);
      float fade = (1.0 - vUv.y) * 0.23 + 0.025;
      gl_FragColor = vec4(0.18, 0.8, 1.0, sides * fade);
      #include <colorspace_fragment>
    }
  `));
  beam.raycast = () => {}; root.add(beam);
  const emitter = new THREE.Mesh(new THREE.PlaneGeometry(.45, .075), new THREE.MeshBasicMaterial({ color: '#89eeff', toneMapped: false }));
  emitter.position.set(0, bottom, .21); emitter.rotation.x = -Math.PI / 2; emitter.raycast = () => {}; root.add(emitter);

  let disposed = false;
  return {
    root,
    update(seconds, reducedMotion = false) {
      const t = reducedMotion ? 0 : seconds;
      time.value = t;
      floating.position.y = Math.sin(t * .85) * .022;
    },
    dispose() { if (!disposed) { disposed = true; disposeMiniature(root); } },
  };
}
