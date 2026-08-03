import * as THREE from "three";

import {
  MUSHROOM_INTERIOR_CENTER,
  MUSHROOM_INTERIOR_EYE_Y,
  MUSHROOM_INTERIOR_LOCAL_RADIUS,
  MUSHROOM_INTERIOR_SCALE
} from "./mushroom-interior-config.js";

export const OBSERVATORY_RIFT_VISUAL_NAME = "mushroom-observatory-rift-visual";
export const OBSERVATORY_RIFT_APERTURE_NAME = "mushroom-observatory-rift-aperture";
export const OBSERVATORY_RIFT_FRAGMENTS_NAME = "mushroom-observatory-rift-fragments";
export const OBSERVATORY_RIFT_SHARDS_NAME = "mushroom-observatory-rift-shards";
export const OBSERVATORY_RIFT_STENCIL_REF = 7;

const RIFT_RADIUS = MUSHROOM_INTERIOR_LOCAL_RADIUS * MUSHROOM_INTERIOR_SCALE - 0.28;
const RIFT_RING_COUNT = 3;
const RIFT_FRAGMENT_COUNT = 240;
const RIFT_SHARD_COUNT = 24;
const RIFT_EPSILON = 0.001;

const APERTURE_VERTEX_SHADER = /* glsl */ `
  varying vec3 vRiftPosition;

  void main() {
    vRiftPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const APERTURE_FRAGMENT_SHADER = /* glsl */ `
  uniform float uExpansion;
  uniform float uTime;

  varying vec3 vRiftPosition;

  const float PI = 3.141592653589793;

  void main() {
    vec3 direction = normalize(vRiftPosition);
    float azimuth = atan(direction.z, direction.x);
    float irregularEdge = (
      sin(azimuth * 7.0 + uTime * 0.34)
      + sin(azimuth * 13.0 - uTime * 0.21) * 0.45
    ) * 0.012 * sin(PI * clamp(uExpansion, 0.0, 1.0));
    // Finish slightly below the visitor's eye horizon so dissolving the full
    // L3 wall never exposes the ordinary meadow background as a flat strip.
    float frontier = mix(1.0, -0.28, clamp(uExpansion, 0.0, 1.0));
    if (direction.y + irregularEdge < frontier) discard;
    gl_FragColor = vec4(0.0);
  }
`;

const FRAGMENT_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uParallax;
  uniform float uPixelRatio;

  attribute float aBirth;
  attribute float aPhase;
  attribute float aSize;

  varying float vAlpha;
  varying float vPhase;

  void main() {
    float reveal = smoothstep(aBirth, min(1.0, aBirth + 0.16), uReveal);
    vec3 direction = normalize(position);
    vec3 tangent = normalize(cross(
      abs(direction.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0),
      direction
    ));
    float travel = sin(uTime * 0.38 + aPhase) * 0.22 * uParallax;
    vec3 displaced = position + tangent * travel;
    vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float perspectiveSize = 105.0 / max(2.0, -viewPosition.z);
    gl_PointSize = clamp(aSize * uPixelRatio * perspectiveSize, 1.0, 4.5);
    vAlpha = reveal;
    vPhase = aPhase;
  }
`;

const FRAGMENT_FRAGMENT_SHADER = /* glsl */ `
  uniform float uDepth;
  uniform float uTime;

  varying float vAlpha;
  varying float vPhase;

  void main() {
    vec2 centred = gl_PointCoord - vec2(0.5);
    vec2 diamond = abs(centred);
    float shard = 1.0 - smoothstep(0.18, 0.5, diamond.x + diamond.y * 0.42);
    float core = 1.0 - smoothstep(0.02, 0.17, length(centred));
    float pulse = 0.7 + 0.3 * sin(uTime * 1.2 + vPhase);
    float alpha = (shard * 0.52 + core * 0.8) * vAlpha * uDepth * pulse;
    if (alpha < 0.012) discard;
    vec3 cool = vec3(0.22, 0.62, 1.0);
    vec3 warm = vec3(0.82, 0.42, 1.0);
    vec3 colour = mix(cool, warm, 0.5 + 0.5 * sin(vPhase * 1.7));
    gl_FragColor = vec4(colour * (0.68 + core * 1.35), alpha);
    #include <colorspace_fragment>
  }
`;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function configureStencilTest(material) {
  material.stencilWrite = true;
  material.stencilRef = OBSERVATORY_RIFT_STENCIL_REF;
  material.stencilFunc = THREE.EqualStencilFunc;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.KeepStencilOp;
  return material;
}

function createRiftAperture() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uExpansion: { value: 0 },
      uTime: { value: 0 }
    },
    vertexShader: APERTURE_VERTEX_SHADER,
    fragmentShader: APERTURE_FRAGMENT_SHADER,
    side: THREE.BackSide,
    colorWrite: false,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    fog: false
  });
  material.name = "mushroom-observatory-rift-aperture-material";
  material.stencilWrite = true;
  material.stencilRef = OBSERVATORY_RIFT_STENCIL_REF;
  material.stencilFunc = THREE.AlwaysStencilFunc;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.ReplaceStencilOp;

  const aperture = new THREE.Mesh(
    new THREE.SphereGeometry(
      RIFT_RADIUS,
      72,
      42,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.59
    ),
    material
  );
  aperture.name = OBSERVATORY_RIFT_APERTURE_NAME;
  aperture.renderOrder = 900;
  aperture.frustumCulled = false;
  aperture.visible = false;
  return aperture;
}

function createRiftFragments() {
  const random = seededRandom(0x6e6f6e65);
  const positions = new Float32Array(RIFT_FRAGMENT_COUNT * 3);
  const births = new Float32Array(RIFT_FRAGMENT_COUNT);
  const phases = new Float32Array(RIFT_FRAGMENT_COUNT);
  const sizes = new Float32Array(RIFT_FRAGMENT_COUNT);

  for (let index = 0; index < RIFT_FRAGMENT_COUNT; index += 1) {
    const y = 0.05 + random() * 0.95;
    const azimuth = random() * Math.PI * 2;
    const horizontal = Math.sqrt(1 - y * y);
    // Three distinct radial bands make camera movement expose obvious
    // foreground/midground parallax instead of another flat star sheet.
    const band = index % 3;
    const radius = RIFT_RADIUS * (0.42 + band * 0.19 + random() * 0.12);
    const offset = index * 3;
    positions[offset] = Math.cos(azimuth) * horizontal * radius;
    positions[offset + 1] = y * radius;
    positions[offset + 2] = Math.sin(azimuth) * horizontal * radius;
    births[index] = THREE.MathUtils.clamp(1 - y + (random() - 0.5) * 0.12, 0, 0.94);
    phases[index] = random() * Math.PI * 2;
    sizes[index] = 0.55 + random() * 1.45;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aBirth", new THREE.BufferAttribute(births, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.computeBoundingSphere();

  const material = configureStencilTest(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uDepth: { value: 0 },
      uParallax: { value: 0 },
      uPixelRatio: { value: 1 }
    },
    vertexShader: FRAGMENT_VERTEX_SHADER,
    fragmentShader: FRAGMENT_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    fog: false
  }));
  material.name = "mushroom-observatory-rift-fragment-material";

  const fragments = new THREE.Points(geometry, material);
  fragments.name = OBSERVATORY_RIFT_FRAGMENTS_NAME;
  fragments.renderOrder = -840;
  fragments.frustumCulled = false;
  return fragments;
}

function createRiftRing(index) {
  const colour = index === 1 ? "#b775ff" : "#5abaff";
  const material = configureStencilTest(new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    fog: false
  }));
  material.name = `mushroom-observatory-rift-ring-material-${index + 1}`;

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.011 + index * 0.003, 8, 96),
    material
  );
  ring.name = `mushroom-observatory-rift-ring-${index + 1}`;
  ring.rotation.x = Math.PI / 2;
  ring.rotation.z = (index - 1) * 0.045;
  ring.renderOrder = -820 + index;
  ring.frustumCulled = false;
  return ring;
}

function createRiftShards() {
  const random = seededRandom(0x72696674);
  const geometry = new THREE.TetrahedronGeometry(0.14, 0);
  const material = configureStencilTest(new THREE.MeshBasicMaterial({
    color: "#70c9ff",
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    fog: false
  }));
  material.name = "mushroom-observatory-rift-shard-material";

  const shards = new THREE.InstancedMesh(geometry, material, RIFT_SHARD_COUNT);
  shards.name = OBSERVATORY_RIFT_SHARDS_NAME;
  shards.renderOrder = -830;
  shards.frustumCulled = false;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const blue = new THREE.Color("#57baff");
  const violet = new THREE.Color("#c18aff");
  for (let index = 0; index < RIFT_SHARD_COUNT; index += 1) {
    const y = 0.12 + random() * 0.86;
    const azimuth = random() * Math.PI * 2;
    const horizontal = Math.sqrt(1 - y * y);
    const band = index % 3;
    const radius = RIFT_RADIUS * (0.4 + band * 0.2 + random() * 0.1);
    position.set(
      Math.cos(azimuth) * horizontal * radius,
      y * radius,
      Math.sin(azimuth) * horizontal * radius
    );
    euler.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    quaternion.setFromEuler(euler);
    const shardScale = 0.65 + random() * 1.55;
    scale.set(shardScale * 0.58, shardScale * 1.65, shardScale * 0.42);
    matrix.compose(position, quaternion, scale);
    shards.setMatrixAt(index, matrix);
    shards.setColorAt(index, blue.clone().lerp(violet, random()));
  }
  shards.instanceMatrix.needsUpdate = true;
  if (shards.instanceColor) shards.instanceColor.needsUpdate = true;
  return shards;
}

export function createObservatoryRiftVisual() {
  const visual = new THREE.Group();
  visual.name = OBSERVATORY_RIFT_VISUAL_NAME;
  visual.position.set(
    MUSHROOM_INTERIOR_CENTER.x,
    MUSHROOM_INTERIOR_EYE_Y[2] - 0.08,
    MUSHROOM_INTERIOR_CENTER.z
  );
  visual.visible = false;

  const aperture = createRiftAperture();
  const fragments = createRiftFragments();
  const shards = createRiftShards();
  const rings = Array.from({ length: RIFT_RING_COUNT }, (_, index) => (
    createRiftRing(index)
  ));
  visual.add(aperture, fragments, shards, ...rings);
  visual.userData.aperture = aperture;
  visual.userData.fragments = fragments;
  visual.userData.shards = shards;
  visual.userData.rings = rings;
  visual.userData.elapsed = 0;
  visual.userData.disposed = false;
  visual.userData.channels = null;
  visual.userData.settledFragmentFactor = 0;
  return visual;
}

export function updateObservatoryRiftVisual(
  visual,
  channels,
  deltaSeconds,
  { pixelRatio = 1 } = {}
) {
  if (!visual || visual.userData.disposed) return false;
  const expansion = THREE.MathUtils.clamp(
    Number.isFinite(channels?.apertureExpansion)
      ? channels.apertureExpansion
      : 0,
    0,
    1
  );
  const depth = THREE.MathUtils.clamp(
    Number.isFinite(channels?.foregroundDepth) ? channels.foregroundDepth : 0,
    0,
    1
  );
  const parallax = THREE.MathUtils.clamp(
    Number.isFinite(channels?.foregroundParallax)
      ? channels.foregroundParallax
      : 0,
    0,
    1
  );
  const ringIntensity = THREE.MathUtils.clamp(
    Number.isFinite(channels?.ringIntensity) ? channels.ringIntensity : 0,
    0,
    1
  );
  const active = Math.max(expansion, depth, ringIntensity) > RIFT_EPSILON;
  visual.visible = active;
  visual.userData.channels = channels ?? null;
  if (!active) {
    visual.userData.elapsed = 0;
    visual.userData.settledFragmentFactor = 0;
    return false;
  }

  const frameDelta = Math.min(Math.max(deltaSeconds || 0, 0), 0.1);
  const motionScale = channels?.spatialMotionScale === 0 ? 0 : 1;
  visual.userData.elapsed += frameDelta * motionScale;
  const elapsed = visual.userData.elapsed;

  const aperture = visual.userData.aperture;
  aperture.visible = expansion > RIFT_EPSILON;
  aperture.material.uniforms.uExpansion.value = expansion;
  aperture.material.uniforms.uTime.value = elapsed;

  const fragments = visual.userData.fragments;
  // These close shards explain the dome unfolding, but once it is open they
  // must yield to the shared 72-184 m star volume instead of masquerading as
  // room-scale stars beside the player.
  const settledFragmentFactor = THREE.MathUtils.lerp(
    1,
    0.12,
    THREE.MathUtils.smoothstep(expansion, 0.68, 1)
  );
  visual.userData.settledFragmentFactor = settledFragmentFactor;
  fragments.visible = depth > RIFT_EPSILON;
  fragments.material.uniforms.uTime.value = elapsed;
  fragments.material.uniforms.uReveal.value = expansion;
  fragments.material.uniforms.uDepth.value = depth * settledFragmentFactor;
  fragments.material.uniforms.uParallax.value = parallax;
  fragments.material.uniforms.uPixelRatio.value = THREE.MathUtils.clamp(
    Number.isFinite(pixelRatio) ? pixelRatio : 1,
    1,
    1.8
  );
  fragments.rotation.y = elapsed * 0.025 * parallax;

  const shards = visual.userData.shards;
  const settledShardOpacity = THREE.MathUtils.lerp(
    0.18,
    0.08,
    THREE.MathUtils.smoothstep(expansion, 0.68, 1)
  );
  shards.visible = depth > RIFT_EPSILON;
  shards.material.opacity = depth * settledShardOpacity;
  shards.rotation.y = -elapsed * 0.035 * parallax;
  shards.rotation.z = Math.sin(elapsed * 0.21) * 0.018 * parallax;

  const settledTheta = [0.4, 0.84, 1.27];
  for (let index = 0; index < visual.userData.rings.length; index += 1) {
    const ring = visual.userData.rings[index];
    // The three seams peel apart into genuinely separate shells. Looking from
    // the room centre shows nested circles; walking to an edge turns them into
    // differently moving arcs, a much stronger monocular depth signal.
    const theta = THREE.MathUtils.lerp(
      0.055 + index * 0.012,
      settledTheta[index],
      expansion
    );
    const ringRadius = Math.max(0.035, RIFT_RADIUS * Math.sin(theta));
    ring.visible = ringIntensity > RIFT_EPSILON;
    ring.position.y = RIFT_RADIUS * Math.cos(theta);
    ring.scale.setScalar(ringRadius);
    if (ring.visible) {
      ring.rotation.y = elapsed
        * (index % 2 === 0 ? 0.08 : -0.06)
        * parallax;
    }
    ring.material.opacity = ringIntensity * (0.82 - index * 0.13);
  }
  return true;
}

export function disposeObservatoryRiftVisual(visual) {
  if (!visual || visual.userData.disposed) return false;
  visual.userData.disposed = true;
  visual.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) {
      for (const material of object.material) material?.dispose?.();
    } else {
      object.material?.dispose?.();
    }
  });
  visual.clear();
  return true;
}
