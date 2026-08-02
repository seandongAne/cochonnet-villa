import * as THREE from "three";

// Node-safe volumetric layer for the observatory portal. It renders linear
// emission in RGB and accumulated opacity in A; observatory-portal.js then
// applies both emission and extinction through the physical dome stencil.

export const MUSHROOM_NEBULA_NAME = "mushroom-observatory-volumetric-nebula";
export const MUSHROOM_NEBULA_MATERIAL_NAME =
  "mushroom-observatory-volumetric-nebula-material";
export const MUSHROOM_NEBULA_DEFAULT_QUALITY = "medium";
export const MUSHROOM_NEBULA_MAX_STEPS = 48;

export const MUSHROOM_NEBULA_QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({
    id: "high",
    steps: MUSHROOM_NEBULA_MAX_STEPS,
    density: 1,
    detail: 1
  }),
  medium: Object.freeze({
    id: "medium",
    steps: 30,
    density: 0.92,
    detail: 0.88
  }),
  low: Object.freeze({
    id: "low",
    // Runtime Low disables this pass; the value remains a safe manual/debug
    // fallback and never exceeds the production Medium budget.
    steps: 20,
    density: 0.82,
    detail: 0.72
  })
});

const NEBULA_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const NEBULA_FRAGMENT_SHADER = /* glsl */ `
  #define MUSHROOM_NEBULA_MAX_STEPS 48

  uniform float uTime;
  uniform float uReveal;
  uniform vec3 uParallax;
  uniform vec2 uResolution;
  uniform int uStepCount;
  uniform float uDensity;
  uniform float uDetail;
  uniform mat4 uProjectionMatrixInverse;
  uniform mat4 uCameraMatrixWorld;

  varying vec2 vUv;

  float hash31(vec3 value) {
    value = fract(value * 0.1031);
    value += dot(value, value.yzx + 33.33);
    return fract((value.x + value.y) * value.z);
  }

  float valueNoise(vec3 point) {
    vec3 cell = floor(point);
    vec3 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);

    float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, local.x);
    float nx10 = mix(n010, n110, local.x);
    float nx01 = mix(n001, n101, local.x);
    float nx11 = mix(n011, n111, local.x);
    return mix(
      mix(nx00, nx10, local.y),
      mix(nx01, nx11, local.y),
      local.z
    );
  }

  float fbm(vec3 point) {
    float result = 0.0;
    float amplitude = 0.54;
    for (int octave = 0; octave < 4; octave++) {
      result += valueNoise(point) * amplitude;
      point = point * 2.03 + vec3(7.1, 3.7, 5.9);
      amplitude *= 0.49;
    }
    return result;
  }

  void main() {
    vec2 safeResolution = max(uResolution, vec2(1.0));
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 viewRay = uProjectionMatrixInverse * vec4(ndc, 1.0, 1.0);
    vec3 rayDirectionView = normalize(viewRay.xyz / max(abs(viewRay.w), 0.0001));
    vec3 rayDirection = normalize(
      (uCameraMatrixWorld * vec4(rayDirectionView, 0.0)).xyz
    );
    vec3 cameraWorldPosition = uCameraMatrixWorld[3].xyz;

    float stepCount = max(float(uStepCount), 1.0);
    float stepLength = 15.0 / stepCount;
    // Keep the ray start stable from frame to frame. Time-varying jitter
    // without temporal accumulation reads as crawling noise; authored motion
    // comes from the much slower drift below instead.
    float stableJitter = hash31(vec3(gl_FragCoord.xy / safeResolution, 0.618));
    float travel = 0.45 + stableJitter * stepLength;
    float transmittance = 1.0;
    vec3 radiance = vec3(0.0);
    // Camera translation is deliberately compressed before entering the noise
    // domain. uParallax supplies the authored near-layer displacement; the far
    // star layer is separately camera-centred and therefore remains fixed.
    vec3 rayOrigin = cameraWorldPosition * 0.035 + uParallax;
    float drift = uTime * 0.012;

    for (int stepIndex = 0; stepIndex < MUSHROOM_NEBULA_MAX_STEPS; stepIndex++) {
      if (stepIndex >= uStepCount) break;

      float progress = float(stepIndex) / stepCount;
      vec3 samplePoint = rayOrigin + rayDirection * travel;
      vec3 slowWarp = vec3(
        valueNoise(samplePoint * 0.11 + vec3(drift, 0.0, 0.0)),
        valueNoise(samplePoint * 0.13 + vec3(0.0, drift * 0.7, 0.0)),
        valueNoise(samplePoint * 0.09 + vec3(0.0, 0.0, -drift * 0.5))
      ) - 0.5;
      float cloud = fbm((samplePoint + slowWarp * 2.2) * (0.23 + uDetail * 0.08));
      float density = smoothstep(0.5, 0.86, cloud);
      density *= smoothstep(0.0, 0.14, progress);
      density *= 1.0 - smoothstep(0.74, 1.0, progress);

      float sampleAlpha = 1.0 - exp(-density * uDensity * 0.19);
      vec3 cool = vec3(0.16, 0.27, 0.72);
      vec3 warm = vec3(0.76, 0.24, 0.62);
      vec3 cloudColor = mix(cool, warm, smoothstep(0.44, 0.8, cloud));
      cloudColor += vec3(0.12, 0.18, 0.32) * density;
      radiance += transmittance * cloudColor * sampleAlpha;
      transmittance *= 1.0 - sampleAlpha;
      if (transmittance < 0.025) break;
      travel += stepLength;
    }

    float reveal = clamp(uReveal, 0.0, 1.0);
    float opacity = 1.0 - transmittance;
    gl_FragColor = vec4(radiance * reveal, opacity * reveal);
  }
`;

function nebulaMaterialFrom(value) {
  if (value?.isShaderMaterial) return value;
  return value?.material?.isShaderMaterial ? value.material : null;
}

function copyVector2(target, value) {
  if (Array.isArray(value)) {
    target.set(
      Number.isFinite(value[0]) ? value[0] : 1,
      Number.isFinite(value[1]) ? value[1] : 1
    );
  } else {
    target.set(
      Number.isFinite(value?.x) ? value.x : 1,
      Number.isFinite(value?.y) ? value.y : 1
    );
  }
  target.max(new THREE.Vector2(1, 1));
  return target;
}

function copyVector3(target, value) {
  if (Array.isArray(value)) {
    target.set(
      Number.isFinite(value[0]) ? value[0] : 0,
      Number.isFinite(value[1]) ? value[1] : 0,
      Number.isFinite(value[2]) ? value[2] : 0
    );
  } else {
    target.set(
      Number.isFinite(value?.x) ? value.x : 0,
      Number.isFinite(value?.y) ? value.y : 0,
      Number.isFinite(value?.z) ? value.z : 0
    );
  }
  return target;
}

export function getMushroomNebulaQuality(quality) {
  const key = typeof quality === "string" ? quality.toLowerCase() : "";
  return MUSHROOM_NEBULA_QUALITY_PRESETS[key]
    ?? MUSHROOM_NEBULA_QUALITY_PRESETS[MUSHROOM_NEBULA_DEFAULT_QUALITY];
}

export function createMushroomNebulaMaterial({
  quality = MUSHROOM_NEBULA_DEFAULT_QUALITY,
  reveal = 0,
  parallax = null,
  resolution = null
} = {}) {
  const preset = getMushroomNebulaQuality(quality);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: {
        value: THREE.MathUtils.clamp(Number.isFinite(reveal) ? reveal : 0, 0, 1)
      },
      uParallax: { value: copyVector3(new THREE.Vector3(), parallax) },
      uResolution: { value: copyVector2(new THREE.Vector2(), resolution) },
      uStepCount: { value: preset.steps },
      uDensity: { value: preset.density },
      uDetail: { value: preset.detail },
      uProjectionMatrixInverse: { value: new THREE.Matrix4() },
      uCameraMatrixWorld: { value: new THREE.Matrix4() }
    },
    vertexShader: NEBULA_VERTEX_SHADER,
    fragmentShader: NEBULA_FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    toneMapped: false,
    fog: false
  });
  material.name = MUSHROOM_NEBULA_MATERIAL_NAME;
  material.userData.observatoryQuality = preset.id;
  material.userData.reducedMotion = false;
  material.userData.observatoryDisposed = false;
  return material;
}

export function createMushroomNebula(options = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -1, -1, 0,
    3, -1, 0,
    -1, 3, 0
  ], 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([
    0, 0,
    2, 0,
    0, 2
  ], 2));

  const nebula = new THREE.Mesh(
    geometry,
    createMushroomNebulaMaterial(options)
  );
  nebula.name = MUSHROOM_NEBULA_NAME;
  nebula.frustumCulled = false;
  nebula.userData.observatoryDisposed = false;
  return nebula;
}

export function setMushroomNebulaQuality(nebulaOrMaterial, quality) {
  const material = nebulaMaterialFrom(nebulaOrMaterial);
  if (!material) return null;
  const preset = getMushroomNebulaQuality(quality);
  material.uniforms.uStepCount.value = Math.min(
    preset.steps,
    MUSHROOM_NEBULA_MAX_STEPS
  );
  material.uniforms.uDensity.value = preset.density;
  material.uniforms.uDetail.value = preset.detail;
  material.userData.observatoryQuality = preset.id;
  return preset;
}

/**
 * Advance shader state without requiring a renderer. reducedMotion freezes the
 * time source (and therefore drift/jitter) while reveal, camera matrices and
 * parallax still respond immediately to input changes.
 */
export function updateMushroomNebula(
  nebulaOrMaterial,
  delta,
  {
    reveal,
    parallax,
    resolution,
    camera,
    reducedMotion = false
  } = {}
) {
  const material = nebulaMaterialFrom(nebulaOrMaterial);
  if (!material?.uniforms || material.userData.observatoryDisposed) return false;
  const uniforms = material.uniforms;

  if (!reducedMotion) {
    const frameDelta = THREE.MathUtils.clamp(
      Number.isFinite(delta) ? delta : 0,
      0,
      0.1
    );
    // Keep long-running sessions within a precision-friendly time window.
    uniforms.uTime.value = (uniforms.uTime.value + frameDelta) % 4096;
  }
  if (reveal !== undefined) {
    uniforms.uReveal.value = THREE.MathUtils.clamp(
      Number.isFinite(reveal) ? reveal : 0,
      0,
      1
    );
  }
  if (parallax !== undefined) {
    copyVector3(uniforms.uParallax.value, parallax);
  }
  if (resolution !== undefined) {
    copyVector2(uniforms.uResolution.value, resolution);
  }
  if (camera?.isCamera) {
    camera.updateMatrixWorld(true);
    uniforms.uProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
    uniforms.uCameraMatrixWorld.value.copy(camera.matrixWorld);
  }
  material.userData.reducedMotion = reducedMotion === true;
  return true;
}

export function disposeMushroomNebula(nebulaOrMaterial) {
  const material = nebulaMaterialFrom(nebulaOrMaterial);
  const nebula = nebulaOrMaterial?.isObject3D ? nebulaOrMaterial : null;
  const lifecycleOwner = nebula ?? material;
  if (!lifecycleOwner) return false;
  lifecycleOwner.userData ??= {};
  if (lifecycleOwner.userData.observatoryDisposed) return false;

  nebula?.geometry?.dispose();
  material?.dispose();
  lifecycleOwner.userData.observatoryDisposed = true;
  if (material) material.userData.observatoryDisposed = true;
  nebula?.removeFromParent();
  return true;
}

export {
  NEBULA_FRAGMENT_SHADER as MUSHROOM_NEBULA_FRAGMENT_SHADER,
  NEBULA_VERTEX_SHADER as MUSHROOM_NEBULA_VERTEX_SHADER
};
