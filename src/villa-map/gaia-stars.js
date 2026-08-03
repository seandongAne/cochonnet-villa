import * as THREE from "three";

export const GAIA_STAR_CATALOG_URL = "/data/gaia-bright-stars-v1.bin";
export const GAIA_STAR_CATALOG_META_URL = "/data/gaia-bright-stars-v1.meta.json";
export const GAIA_STAR_CATALOG_MAGIC = "GAIASTR1";
export const GAIA_STAR_CATALOG_VERSION = 1;
export const GAIA_STAR_HEADER_BYTES = 32;
export const GAIA_STAR_RECORD_BYTES = 24;
export const GAIA_STAR_FORMAT_FLAGS = 0x0003;
export const GAIA_STAR_POINTS_NAME = "mushroom-observatory-gaia-stars";
export const GAIA_STAR_LOD_COUNTS = Object.freeze({
  low: 8_000,
  medium: 35_000,
  high: 80_000
});

const LOD_NAMES = new Set(Object.keys(GAIA_STAR_LOD_COUNTS));
const MILLIMAGNITUDE_SCALE = 1_000;
const DEFAULT_RADIUS = 79;

// Default direction on the same camera-centred celestial sphere as the
// catalogue. Runtime can derive a slightly changing direction/angular scale
// from a finite world anchor while the Gaia points themselves stay in the far
// field. The shipped composition keeps the anchor high and away from stairs.
export const GAIA_LENS_DEFAULT_DIRECTION = Object.freeze({
  x: 0.31,
  y: 0.79,
  z: -0.53
});
export const GAIA_LENS_DEFAULT_EINSTEIN_RADIUS = 0.095;
export const GAIA_LENS_DEFAULT_INFLUENCE_RADIUS = 0.42;

// Coarse BP-RP colour anchors. They preserve Gaia's measured blue-to-red
// ordering without pretending that a broad-band colour is a complete stellar
// spectrum. THREE.Color converts the authored sRGB anchors to its linear
// working colour space before they enter the GPU attribute.
const BP_RP_COLOR_STOPS = [
  [-0.6, new THREE.Color("#9fbfff")],
  [0.0, new THREE.Color("#c8dcff")],
  [0.5, new THREE.Color("#f4f6ff")],
  [0.9, new THREE.Color("#fff4df")],
  [1.5, new THREE.Color("#ffd2a5")],
  [2.4, new THREE.Color("#ffad78")],
  [4.5, new THREE.Color("#ff825e")]
];

const GAIA_STAR_VERTEX_SHADER = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uReveal;
  uniform float uMagnitudeLimit;
  uniform float uMagnitudeFeather;
  uniform float uLensAmount;
  uniform vec3 uLensDirection;
  uniform float uLensEinsteinRadius;
  uniform float uLensInfluenceRadius;
  uniform float uLensSourceMaskAmount;
  uniform float uLensSourceMaskRadius;

  attribute float aMagnitude;
  attribute float aBpRp;
  attribute float aIntensity;
  attribute vec3 aStarColor;

  varying float vIntensity;
  varying float vMagnitudeVisibility;
  varying float vLensMagnification;
  varying float vLensSourceVisibility;
  varying float vSpriteSizePx;
  varying vec3 vStarColor;

  float angularDistance(vec3 first, vec3 second) {
    vec3 a = normalize(first);
    vec3 b = normalize(second);
    return atan(length(cross(a, b)), clamp(dot(a, b), -1.0, 1.0));
  }

  vec3 lensStarPosition(vec3 sourcePosition) {
    // Preserve the original vertex path exactly while the hidden event is off.
    if (uLensAmount <= 0.0) return sourcePosition;

    float sphereRadius = length(sourcePosition);
    vec3 sourceDirection = sourcePosition / max(sphereRadius, 0.0001);
    vec3 lensDirection = normalize(uLensDirection);
    float alignment = clamp(dot(sourceDirection, lensDirection), -1.0, 1.0);
    float sourceAngle = angularDistance(sourceDirection, lensDirection);
    if (sourceAngle >= uLensInfluenceRadius) return sourcePosition;

    vec3 radialDirection = sourceDirection - lensDirection * alignment;
    if (length(radialDirection) < 0.00001) {
      vec3 fallbackAxis = abs(lensDirection.y) < 0.92
        ? vec3(0.0, 1.0, 0.0)
        : vec3(1.0, 0.0, 0.0);
      radialDirection = cross(fallbackAxis, lensDirection);
    }
    radialDirection = normalize(radialDirection);

    // Point-mass lens equation: a source close to the lens is pushed toward
    // the Einstein radius. Fade it before the influence boundary so the fixed
    // far field cannot develop a visible seam.
    float lensSquared = uLensEinsteinRadius * uLensEinsteinRadius * uLensAmount;
    float imageAngle = 0.5 * (
      sourceAngle + sqrt(sourceAngle * sourceAngle + 4.0 * lensSquared)
    );
    float influence = 1.0 - smoothstep(
      uLensEinsteinRadius * 1.35,
      uLensInfluenceRadius,
      sourceAngle
    );
    imageAngle = mix(sourceAngle, imageAngle, influence);
    vec3 apparentDirection = lensDirection * cos(imageAngle)
      + radialDirection * sin(imageAngle);
    return normalize(apparentDirection) * sphereRadius;
  }

  void main() {
    // Gaia G magnitude is logarithmic: smaller values are brighter. Dark
    // adaptation raises uMagnitudeLimit, revealing faint catalogue stars in
    // measured order instead of fading the entire star field in as one sheet.
    vMagnitudeVisibility = 1.0 - smoothstep(
      uMagnitudeLimit,
      uMagnitudeLimit + uMagnitudeFeather,
      aMagnitude
    );
    // BP-RP already drives the baked colour attribute; keep the measurement
    // live in the shader interface without perturbing the radiometric value.
    float catalogSignal = aBpRp * 0.0;
    vIntensity = aIntensity + catalogSignal;
    vStarColor = aStarColor;

    vec3 lensedPosition = position;
    vLensMagnification = 1.0;
    float sourceAngle = angularDistance(position, uLensDirection);
    float sourceMaskFeatherStart = uLensSourceMaskRadius * 0.88;
    float sourceMask = 1.0 - smoothstep(
      sourceMaskFeatherStart,
      uLensSourceMaskRadius,
      sourceAngle
    );
    vLensSourceVisibility = 1.0
      - clamp(uLensSourceMaskAmount, 0.0, 1.0) * sourceMask;
    if (uLensAmount > 0.0) {
      float lensInfluence = uLensAmount * (
        1.0 - smoothstep(uLensEinsteinRadius, uLensInfluenceRadius, sourceAngle)
      );
      vLensMagnification += lensInfluence * 0.72;
      lensedPosition = lensStarPosition(position);
    }

    gl_Position = projectionMatrix * modelViewMatrix * vec4(lensedPosition, 1.0);
    // Gaia sources are unresolved. A fixed support sprite gives the analytic
    // one-CSS-pixel PSF enough samples on HiDPI screens; brightness and lens
    // magnification must not inflate the apparent stellar diameter.
    gl_PointSize = 6.0 * uPixelRatio;
    vSpriteSizePx = gl_PointSize;
  }
`;

const GAIA_STAR_FRAGMENT_SHADER = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uReveal;

  varying float vIntensity;
  varying float vMagnitudeVisibility;
  varying float vLensMagnification;
  varying float vLensSourceVisibility;
  varying float vSpriteSizePx;
  varying vec3 vStarColor;

  void main() {
    vec2 centred = gl_PointCoord - vec2(0.5);
    float safePixelRatio = max(uPixelRatio, 0.5);
    vec2 pixelPositionCss = centred * max(vSpriteSizePx, 1.0) / safePixelRatio;
    float pixelRadiusCss = length(pixelPositionCss);
    float prominence = smoothstep(0.45, 3.6, vIntensity);

    // Gaia sources remain unresolved regardless of magnitude. A fixed
    // 0.40-CSS-pixel sigma keeps the useful bright centre at roughly one-pixel
    // FWHM on every DPR without turning bright measurements into larger bulbs.
    const float STAR_SIGMA_CSS = 0.40;
    float stellarCore = exp(
      -0.5 * pow(pixelRadiusCss / STAR_SIGMA_CSS, 2.0)
    );

    // Only the two brightest measurements in the shipped catalogue reach this
    // gate. Their sub-pixel, low-energy spikes read as restrained optics rather
    // than a repeated cross icon or a soft halo.
    float diffractionGate = smoothstep(3.15, 3.55, vIntensity);
    float verticalSpike = exp(-0.5 * pow(pixelPositionCss.x / 0.15, 2.0))
      * exp(-0.5 * pow(pixelPositionCss.y / 1.7, 2.0));
    float horizontalSpike = exp(-0.5 * pow(pixelPositionCss.y / 0.15, 2.0))
      * exp(-0.5 * pow(pixelPositionCss.x / 1.7, 2.0));
    float diffractionSpike = (verticalSpike + horizontalSpike)
      * diffractionGate * 0.03;

    float edge = max(abs(centred.x), abs(centred.y));
    float edgeAA = max(fwidth(edge), 0.001);
    float spriteSupport = 1.0 - smoothstep(0.5 - edgeAA, 0.5, edge);
    float coverage = clamp(
      (stellarCore + diffractionSpike) * spriteSupport,
      0.0,
      1.0
    );
    float alpha = coverage
      * uReveal
      * vMagnitudeVisibility
      * vLensSourceVisibility;
    if (alpha < 1.0 / 2048.0) discard;

    // AdditiveBlending applies alpha once, so radiometric brightness belongs
    // in RGB. Keeping alpha as coverage avoids squaring flux into soft bulbs.
    float chroma = mix(0.12, 0.38, prominence);
    vec3 stellarColour = mix(vec3(1.0), vStarColor, chroma);
    vec3 sourceRadiance = stellarColour * vIntensity * vLensMagnification;
    gl_FragColor = vec4(sourceRadiance, alpha);
    #include <colorspace_fragment>
  }
`;

function asDataView(binary) {
  if (binary instanceof ArrayBuffer) return new DataView(binary);
  if (ArrayBuffer.isView(binary)) {
    return new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  }
  throw new TypeError("Gaia catalogue must be an ArrayBuffer or typed-array view");
}

function readAscii(view, offset, length) {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += String.fromCharCode(view.getUint8(offset + index));
  }
  return result;
}

function readUint64(view, offset) {
  const low = BigInt(view.getUint32(offset, true));
  const high = BigInt(view.getUint32(offset + 4, true));
  return (high << 32n) | low;
}

function validateLodName(lod) {
  const normalized = String(lod ?? "high").toLowerCase();
  if (!LOD_NAMES.has(normalized)) {
    throw new RangeError(`Unknown Gaia star LOD: ${lod}`);
  }
  return normalized;
}

export function equatorialToUnitVector(raDegrees, decDegrees) {
  const ra = Number(raDegrees) * Math.PI / 180;
  const dec = Number(decDegrees) * Math.PI / 180;
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) {
    throw new TypeError("RA and declination must be finite numbers");
  }
  if (decDegrees < -90 || decDegrees > 90) {
    throw new RangeError("Declination must be between -90 and 90 degrees");
  }

  const horizontal = Math.cos(dec);
  return [
    horizontal * Math.cos(ra),
    Math.sin(dec),
    horizontal * Math.sin(ra)
  ];
}

export function readGaiaStarCatalogHeader(binary) {
  const view = asDataView(binary);
  if (view.byteLength < GAIA_STAR_HEADER_BYTES) {
    throw new RangeError("Gaia catalogue is shorter than its binary header");
  }

  const magic = readAscii(view, 0, GAIA_STAR_CATALOG_MAGIC.length);
  if (magic !== GAIA_STAR_CATALOG_MAGIC) {
    throw new Error(`Invalid Gaia catalogue magic: ${JSON.stringify(magic)}`);
  }

  const version = view.getUint16(8, true);
  const headerBytes = view.getUint16(10, true);
  const recordBytes = view.getUint16(12, true);
  const flags = view.getUint16(14, true);
  const count = view.getUint32(16, true);
  const lodCounts = {
    low: view.getUint32(20, true),
    medium: view.getUint32(24, true),
    high: view.getUint32(28, true)
  };

  if (version !== GAIA_STAR_CATALOG_VERSION) {
    throw new Error(`Unsupported Gaia catalogue version: ${version}`);
  }
  if (headerBytes !== GAIA_STAR_HEADER_BYTES) {
    throw new Error(`Unsupported Gaia header size: ${headerBytes}`);
  }
  if (recordBytes !== GAIA_STAR_RECORD_BYTES) {
    throw new Error(`Unsupported Gaia record size: ${recordBytes}`);
  }
  if (flags !== GAIA_STAR_FORMAT_FLAGS) {
    throw new Error(`Unsupported Gaia catalogue flags: ${flags}`);
  }
  if (
    lodCounts.low > lodCounts.medium
    || lodCounts.medium > lodCounts.high
    || lodCounts.high > count
  ) {
    throw new Error("Gaia catalogue LOD counts are not monotonic");
  }

  const expectedBytes = headerBytes + count * recordBytes;
  if (view.byteLength !== expectedBytes) {
    throw new RangeError(
      `Gaia catalogue byte length mismatch: expected ${expectedBytes}, got ${view.byteLength}`
    );
  }

  return {
    magic,
    version,
    headerBytes,
    recordBytes,
    flags,
    count,
    lodCounts: Object.freeze(lodCounts),
    byteLength: view.byteLength
  };
}

export function decodeGaiaStarCatalog(
  binary,
  { lod = "high", includeSourceIds = false } = {}
) {
  const view = asDataView(binary);
  const header = readGaiaStarCatalogHeader(binary);
  const lodName = validateLodName(lod);
  const count = header.lodCounts[lodName];
  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const bpRp = new Float32Array(count);
  const sourceIds = includeSourceIds ? new BigUint64Array(count) : null;

  for (let index = 0; index < count; index += 1) {
    const recordOffset = header.headerBytes + index * header.recordBytes;
    const positionOffset = index * 3;
    if (sourceIds) sourceIds[index] = readUint64(view, recordOffset);
    positions[positionOffset] = view.getFloat32(recordOffset + 8, true);
    positions[positionOffset + 1] = view.getFloat32(recordOffset + 12, true);
    positions[positionOffset + 2] = view.getFloat32(recordOffset + 16, true);
    magnitudes[index] = view.getInt16(recordOffset + 20, true)
      / MILLIMAGNITUDE_SCALE;
    bpRp[index] = view.getInt16(recordOffset + 22, true)
      / MILLIMAGNITUDE_SCALE;
  }

  return {
    formatVersion: header.version,
    catalogCount: header.count,
    count,
    lod: lodName,
    lodCounts: header.lodCounts,
    positions,
    magnitudes,
    bpRp,
    sourceIds
  };
}

export function gaiaBpRpToColor(bpRp, target = new THREE.Color()) {
  const colour = Number.isFinite(bpRp) ? bpRp : 0.8;
  if (colour <= BP_RP_COLOR_STOPS[0][0]) {
    return target.copy(BP_RP_COLOR_STOPS[0][1]);
  }

  for (let index = 1; index < BP_RP_COLOR_STOPS.length; index += 1) {
    const [upperValue, upperColor] = BP_RP_COLOR_STOPS[index];
    if (colour <= upperValue) {
      const [lowerValue, lowerColor] = BP_RP_COLOR_STOPS[index - 1];
      const amount = (colour - lowerValue) / (upperValue - lowerValue);
      return target.copy(lowerColor).lerp(upperColor, amount);
    }
  }

  return target.copy(BP_RP_COLOR_STOPS[BP_RP_COLOR_STOPS.length - 1][1]);
}

function createGaiaStarGeometry(catalog, radius) {
  const positions = new Float32Array(catalog.count * 3);
  const intensities = new Float32Array(catalog.count);
  const colours = new Float32Array(catalog.count * 3);
  const scratchColor = new THREE.Color();
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_RADIUS;

  for (let index = 0; index < catalog.count; index += 1) {
    const offset = index * 3;
    positions[offset] = catalog.positions[offset] * safeRadius;
    positions[offset + 1] = catalog.positions[offset + 1] * safeRadius;
    positions[offset + 2] = catalog.positions[offset + 2] * safeRadius;

    // Gaia G magnitude is logarithmic: lower values are brighter.
    const prominence = THREE.MathUtils.clamp(
      (10.2 - catalog.magnitudes[index]) / 8.6,
      0,
      1
    );
    // Put measured-like flux into a continuous long tail instead of encoding
    // brightness as a larger disc. Almost all points stay faint; only the
    // sparse brightest measurements can reach the diffraction-spike gate.
    intensities[index] = 0.055
      + Math.pow(prominence, 2.4) * 0.38
      + Math.pow(prominence, 18) * 4.2;

    gaiaBpRpToColor(catalog.bpRp[index], scratchColor);
    colours[offset] = scratchColor.r;
    colours[offset + 1] = scratchColor.g;
    colours[offset + 2] = scratchColor.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aMagnitude", new THREE.BufferAttribute(catalog.magnitudes, 1));
  geometry.setAttribute("aBpRp", new THREE.BufferAttribute(catalog.bpRp, 1));
  geometry.setAttribute("aIntensity", new THREE.BufferAttribute(intensities, 1));
  geometry.setAttribute("aStarColor", new THREE.BufferAttribute(colours, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function copyGaiaLensDirection(target, direction) {
  if (direction?.isVector3) {
    target.copy(direction);
  } else if (Array.isArray(direction) || ArrayBuffer.isView(direction)) {
    target.set(
      Number(direction[0]),
      Number(direction[1]),
      Number(direction[2])
    );
  } else if (direction && typeof direction === "object") {
    target.set(Number(direction.x), Number(direction.y), Number(direction.z));
  } else {
    target.set(
      GAIA_LENS_DEFAULT_DIRECTION.x,
      GAIA_LENS_DEFAULT_DIRECTION.y,
      GAIA_LENS_DEFAULT_DIRECTION.z
    );
  }

  if (
    !Number.isFinite(target.x)
    || !Number.isFinite(target.y)
    || !Number.isFinite(target.z)
    || target.lengthSq() < 1e-8
  ) {
    target.set(
      GAIA_LENS_DEFAULT_DIRECTION.x,
      GAIA_LENS_DEFAULT_DIRECTION.y,
      GAIA_LENS_DEFAULT_DIRECTION.z
    );
  }
  return target.normalize();
}

export function createGaiaStarPoints(
  binaryOrCatalog,
  {
    lod = "high",
    radius = DEFAULT_RADIUS,
    pixelRatio = 1,
    reveal = 1,
    includeSourceIds = false
  } = {}
) {
  const catalog = binaryOrCatalog?.positions instanceof Float32Array
    ? binaryOrCatalog
    : decodeGaiaStarCatalog(binaryOrCatalog, { lod, includeSourceIds });
  let minimumMagnitude = Number.POSITIVE_INFINITY;
  let maximumMagnitude = Number.NEGATIVE_INFINITY;
  for (const magnitude of catalog.magnitudes) {
    if (!Number.isFinite(magnitude)) continue;
    minimumMagnitude = Math.min(minimumMagnitude, magnitude);
    maximumMagnitude = Math.max(maximumMagnitude, magnitude);
  }
  if (!Number.isFinite(minimumMagnitude) || !Number.isFinite(maximumMagnitude)) {
    minimumMagnitude = 0;
    maximumMagnitude = 1;
  }
  const brightMagnitudeLimit = Math.min(
    maximumMagnitude,
    minimumMagnitude + 2.2
  );
  const initialReveal = THREE.MathUtils.clamp(
    Number.isFinite(reveal) ? reveal : 0,
    0,
    1
  );
  const initialMagnitudeLimit = THREE.MathUtils.lerp(
    brightMagnitudeLimit,
    maximumMagnitude + 0.35,
    initialReveal
  );

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: {
        value: THREE.MathUtils.clamp(
          Number.isFinite(pixelRatio) ? pixelRatio : 1,
          1,
          1.8
        )
      },
      uReveal: {
        value: initialReveal
      },
      uMagnitudeLimit: { value: initialMagnitudeLimit },
      uMagnitudeFeather: { value: 0.42 },
      uLensAmount: { value: 0 },
      uLensDirection: {
        value: copyGaiaLensDirection(new THREE.Vector3())
      },
      uLensEinsteinRadius: { value: GAIA_LENS_DEFAULT_EINSTEIN_RADIUS },
      uLensInfluenceRadius: { value: GAIA_LENS_DEFAULT_INFLUENCE_RADIUS },
      uLensSourceMaskAmount: { value: 0 },
      uLensSourceMaskRadius: { value: GAIA_LENS_DEFAULT_INFLUENCE_RADIUS }
    },
    vertexShader: GAIA_STAR_VERTEX_SHADER,
    fragmentShader: GAIA_STAR_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false
  });
  material.name = "mushroom-gaia-star-material";

  const points = new THREE.Points(createGaiaStarGeometry(catalog, radius), material);
  points.name = GAIA_STAR_POINTS_NAME;
  points.frustumCulled = false;
  points.userData.catalogCount = catalog.catalogCount;
  points.userData.count = catalog.count;
  points.userData.lod = catalog.lod;
  points.userData.minimumMagnitude = minimumMagnitude;
  points.userData.maximumMagnitude = maximumMagnitude;
  points.userData.brightMagnitudeLimit = brightMagnitudeLimit;
  points.userData.sourceIds = catalog.sourceIds;
  points.userData.lens = {
    amount: 0,
    direction: material.uniforms.uLensDirection.value.clone(),
    einsteinRadius: GAIA_LENS_DEFAULT_EINSTEIN_RADIUS,
    influenceRadius: GAIA_LENS_DEFAULT_INFLUENCE_RADIUS,
    sourceMaskAmount: 0,
    sourceMaskRadius: GAIA_LENS_DEFAULT_INFLUENCE_RADIUS
  };
  points.userData.disposed = false;
  return points;
}

export function setGaiaStarPixelRatio(points, pixelRatio) {
  const uniform = points?.material?.uniforms?.uPixelRatio;
  if (!uniform) return;
  uniform.value = THREE.MathUtils.clamp(
    Number.isFinite(pixelRatio) ? pixelRatio : 1,
    1,
    1.8
  );
}

export function setGaiaStarReveal(points, reveal) {
  const uniform = points?.material?.uniforms?.uReveal;
  if (!uniform) return;
  const safeReveal = THREE.MathUtils.clamp(
    Number.isFinite(reveal) ? reveal : 0,
    0,
    1
  );
  uniform.value = safeReveal;
  const magnitudeUniform = points?.material?.uniforms?.uMagnitudeLimit;
  if (magnitudeUniform) {
    magnitudeUniform.value = THREE.MathUtils.lerp(
      points.userData.brightMagnitudeLimit,
      points.userData.maximumMagnitude + 0.35,
      safeReveal
    );
  }
}

export function setGaiaStarLens(points, lens = {}) {
  const uniforms = points?.material?.uniforms;
  const state = points?.userData?.lens;
  if (!uniforms?.uLensAmount || !state) return;

  const options = typeof lens === "number" ? { amount: lens } : (lens ?? {});
  const amount = Number.isFinite(options.amount)
    ? THREE.MathUtils.clamp(options.amount, 0, 1)
    : state.amount;
  const einsteinRadius = Number.isFinite(options.einsteinRadius)
    ? THREE.MathUtils.clamp(options.einsteinRadius, 0.015, 0.22)
    : state.einsteinRadius;
  const requestedInfluence = Number.isFinite(options.influenceRadius)
    ? options.influenceRadius
    : state.influenceRadius;
  const influenceRadius = THREE.MathUtils.clamp(
    Math.max(requestedInfluence, einsteinRadius * 1.6),
    0.08,
    0.9
  );
  const sourceMaskAmount = Number.isFinite(options.sourceMaskAmount)
    ? THREE.MathUtils.clamp(options.sourceMaskAmount, 0, 1)
    : amount <= 0
      ? 0
      : state.sourceMaskAmount;
  const sourceMaskRadius = Number.isFinite(options.sourceMaskRadius)
    ? THREE.MathUtils.clamp(options.sourceMaskRadius, 0.08, 0.9)
    : state.sourceMaskRadius;

  if (options.direction !== undefined) {
    copyGaiaLensDirection(state.direction, options.direction);
  }
  state.amount = amount;
  state.einsteinRadius = einsteinRadius;
  state.influenceRadius = influenceRadius;
  state.sourceMaskAmount = sourceMaskAmount;
  state.sourceMaskRadius = sourceMaskRadius;

  uniforms.uLensAmount.value = amount;
  uniforms.uLensDirection.value.copy(state.direction);
  uniforms.uLensEinsteinRadius.value = einsteinRadius;
  uniforms.uLensInfluenceRadius.value = influenceRadius;
  uniforms.uLensSourceMaskAmount.value = sourceMaskAmount;
  uniforms.uLensSourceMaskRadius.value = sourceMaskRadius;
}

export async function loadGaiaStarCatalog(
  {
    url = GAIA_STAR_CATALOG_URL,
    lod = "high",
    includeSourceIds = false,
    fetchImpl = globalThis.fetch,
    signal
  } = {}
) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required to load the Gaia catalogue");
  }
  const response = await fetchImpl(url, { signal });
  if (!response?.ok) {
    throw new Error(
      `Could not load Gaia catalogue (${response?.status ?? "network error"})`
    );
  }
  return decodeGaiaStarCatalog(await response.arrayBuffer(), {
    lod,
    includeSourceIds
  });
}

export function disposeGaiaStarPoints(points) {
  if (!points || points.userData.disposed) return;
  points.removeFromParent();
  points.geometry?.dispose();
  const materials = Array.isArray(points.material) ? points.material : [points.material];
  materials.filter(Boolean).forEach((material) => material.dispose());
  points.userData.sourceIds = null;
  points.userData.disposed = true;
}
