import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import {
  createGaiaStarPoints,
  decodeGaiaStarCatalog,
  disposeGaiaStarPoints,
  equatorialToUnitVector,
  GAIA_LENS_DEFAULT_EINSTEIN_RADIUS,
  GAIA_LENS_DEFAULT_INFLUENCE_RADIUS,
  GAIA_STAR_CATALOG_MAGIC,
  GAIA_STAR_CATALOG_VERSION,
  GAIA_STAR_HEADER_BYTES,
  GAIA_STAR_LOD_COUNTS,
  GAIA_STAR_POINTS_NAME,
  GAIA_STAR_RECORD_BYTES,
  loadGaiaStarCatalog,
  readGaiaStarCatalogHeader,
  setGaiaStarLens,
  setGaiaStarPixelRatio,
  setGaiaStarReveal
} from "../src/villa-map/gaia-stars.js";
import {
  buildGaiaCatalogBinary,
  createGaiaAdqlQuery,
  parseGaiaCsv
} from "../scripts/build-gaia-star-catalog.mjs";

const BINARY_PATH = fileURLToPath(
  new URL("../public/data/gaia-bright-stars-v1.bin", import.meta.url)
);
const META_PATH = fileURLToPath(
  new URL("../public/data/gaia-bright-stars-v1.meta.json", import.meta.url)
);
const binary = readFileSync(BINARY_PATH);
const metadata = JSON.parse(readFileSync(META_PATH, "utf8"));

const nearlyEqual = (actual, expected, epsilon = 1e-6) =>
  Math.abs(actual - expected) <= epsilon;

test("the vendored catalogue is a documented, reproducible ESA Gaia DR3 query", () => {
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.source.organisation, "European Space Agency (ESA)");
  assert.equal(metadata.source.dataRelease, "Gaia Data Release 3 (Gaia DR3)");
  assert.equal(metadata.source.archiveTable, "gaiadr3.gaia_source");
  assert.equal(
    metadata.source.tapEndpoint,
    "https://gea.esac.esa.int/tap-server/tap/sync"
  );
  assert.equal(metadata.source.adqlQuery, createGaiaAdqlQuery());
  assert.match(metadata.source.dataModelUrl, /^https:\/\/gea\.esac\.esa\.int\//);
  assert.match(metadata.attribution.officialCreditUrl, /^https:\/\/gea\.esac\.esa\.int\//);
  assert.equal(metadata.attribution.credit, "ESA/Gaia/DPAC");
  assert.match(metadata.attribution.acknowledgement, /Gaia Data Processing and Analysis Consortium/);
  assert.match(metadata.source.completenessCaveat, /not a complete traditional bright-star catalogue/);
  assert.match(metadata.source.completenessCaveat, /No synthetic or random stars/);
  assert.equal(metadata.regeneration.command, "node scripts/build-gaia-star-catalog.mjs");
  assert.match(metadata.regeneration.offlineCommand, /--input/);
});

test("the compact binary stays below 2 MB and matches its metadata checksum", () => {
  const digest = createHash("sha256").update(binary).digest("hex");
  assert.ok(binary.byteLength <= 2_000_000);
  assert.equal(binary.byteLength, 1_920_032);
  assert.equal(metadata.binary.byteLength, binary.byteLength);
  assert.equal(metadata.binary.sha256, digest);
  assert.equal(metadata.binary.magic, GAIA_STAR_CATALOG_MAGIC);
  assert.equal(metadata.binary.formatVersion, GAIA_STAR_CATALOG_VERSION);
  assert.equal(metadata.binary.headerBytes, GAIA_STAR_HEADER_BYTES);
  assert.equal(metadata.binary.recordBytes, GAIA_STAR_RECORD_BYTES);

  const header = readGaiaStarCatalogHeader(binary);
  assert.equal(header.count, 80_000);
  assert.deepEqual(header.lodCounts, GAIA_STAR_LOD_COUNTS);
  assert.equal(header.byteLength, binary.byteLength);
});

test("the first record is the brightest colour-complete source returned by the official query", () => {
  const catalogue = decodeGaiaStarCatalog(binary, {
    lod: "low",
    includeSourceIds: true
  });
  // Immutable Gaia DR3 row returned by the metadata's ADQL query:
  // source_id=1576683529448755328, RA=193.50817846782095,
  // Dec=55.959784778923755, G=1.731607, BP-RP=0.33836722.
  assert.equal(catalogue.sourceIds[0], 1_576_683_529_448_755_328n);
  assert.ok(nearlyEqual(catalogue.magnitudes[0], 1.732, 1e-5));
  assert.ok(nearlyEqual(catalogue.bpRp[0], 0.338, 1e-5));

  const expectedDirection = equatorialToUnitVector(
    193.50817846782095,
    55.959784778923755
  );
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(nearlyEqual(catalogue.positions[axis], expectedDirection[axis]));
  }
});

test("LOD tiers are magnitude-sorted prefixes with valid ICRS unit vectors", () => {
  const low = decodeGaiaStarCatalog(binary, { lod: "low" });
  const medium = decodeGaiaStarCatalog(binary, { lod: "medium" });
  const high = decodeGaiaStarCatalog(binary, { lod: "high" });

  assert.equal(low.count, 8_000);
  assert.equal(medium.count, 35_000);
  assert.equal(high.count, 80_000);
  assert.deepEqual(
    [...low.positions.slice(0, 300)],
    [...medium.positions.slice(0, 300)]
  );
  assert.deepEqual(
    [...medium.magnitudes.slice(0, 100)],
    [...high.magnitudes.slice(0, 100)]
  );

  for (let index = 1; index < high.count; index += 1) {
    assert.ok(
      high.magnitudes[index] >= high.magnitudes[index - 1],
      `G magnitude order breaks at record ${index}`
    );
  }
  for (let index = 0; index < high.count; index += 997) {
    const offset = index * 3;
    const length = Math.hypot(
      high.positions[offset],
      high.positions[offset + 1],
      high.positions[offset + 2]
    );
    assert.ok(nearlyEqual(length, 1, 2e-6));
    assert.ok(Number.isFinite(high.bpRp[index]));
  }
  assert.ok(nearlyEqual(high.magnitudes.at(-1), 8.228, 1e-5));
});

test("the runtime factory creates one GPU Points draw and disposes it once", () => {
  const stars = createGaiaStarPoints(binary, {
    lod: "low",
    radius: 79,
    pixelRatio: 3,
    reveal: 0.4
  });
  assert.ok(stars.isPoints);
  assert.equal(stars.name, GAIA_STAR_POINTS_NAME);
  assert.equal(stars.children.length, 0, "the catalogue must remain one Points draw");
  assert.equal(stars.geometry.getAttribute("position").count, GAIA_STAR_LOD_COUNTS.low);
  for (const attribute of [
    "aMagnitude",
    "aBpRp",
    "aIntensity",
    "aStarColor"
  ]) {
    assert.equal(
      stars.geometry.getAttribute(attribute).count,
      GAIA_STAR_LOD_COUNTS.low,
      `missing or truncated ${attribute}`
    );
  }
  assert.equal(
    stars.geometry.getAttribute("aSize"),
    undefined,
    "Gaia magnitude must change radiance, not apparent point diameter"
  );
  assert.equal(stars.material.type, "ShaderMaterial");
  assert.equal(stars.material.blending, THREE.AdditiveBlending);
  assert.equal(stars.material.depthTest, false);
  assert.equal(stars.material.depthWrite, false);
  assert.equal(stars.material.toneMapped, false);
  assert.equal(stars.material.uniforms.uPixelRatio.value, 1.8);
  assert.equal(stars.material.uniforms.uReveal.value, 0.4);
  assert.equal(stars.material.uniforms.uLensAmount.value, 0);
  assert.equal(
    stars.material.uniforms.uLensEinsteinRadius.value,
    GAIA_LENS_DEFAULT_EINSTEIN_RADIUS
  );
  assert.equal(
    stars.material.uniforms.uLensInfluenceRadius.value,
    GAIA_LENS_DEFAULT_INFLUENCE_RADIUS
  );
  const intensity = stars.geometry.getAttribute("aIntensity");
  let minimumIntensity = Infinity;
  let maximumIntensity = -Infinity;
  let spikeCandidateCount = 0;
  for (let index = 0; index < intensity.count; index += 1) {
    minimumIntensity = Math.min(minimumIntensity, intensity.getX(index));
    maximumIntensity = Math.max(maximumIntensity, intensity.getX(index));
    if (intensity.getX(index) > 3.15) spikeCandidateCount += 1;
  }
  assert.ok(minimumIntensity < 0.13, "most catalogue stars should remain faint");
  assert.ok(maximumIntensity > 3.5, "measured brightness needs a sparse long tail");
  assert.ok(maximumIntensity < 4.7);
  assert.ok(spikeCandidateCount > 0);
  assert.ok(
    spikeCandidateCount <= 2,
    "diffraction spikes belong only to the exceptionally bright catalogue tail"
  );
  const partialMagnitudeLimit = stars.material.uniforms.uMagnitudeLimit.value;
  assert.ok(partialMagnitudeLimit > stars.userData.brightMagnitudeLimit);
  assert.ok(partialMagnitudeLimit < stars.userData.maximumMagnitude + 0.35);

  const firstPosition = stars.geometry.getAttribute("position");
  assert.ok(nearlyEqual(
    Math.hypot(firstPosition.getX(0), firstPosition.getY(0), firstPosition.getZ(0)),
    79,
    1e-4
  ));
  setGaiaStarPixelRatio(stars, -2);
  setGaiaStarReveal(stars, 4);
  assert.equal(stars.material.uniforms.uPixelRatio.value, 1);
  assert.equal(stars.material.uniforms.uReveal.value, 1);
  assert.ok(nearlyEqual(
    stars.material.uniforms.uMagnitudeLimit.value,
    stars.userData.maximumMagnitude + 0.35
  ));
  assert.match(stars.material.vertexShader, /aMagnitude[\s\S]*uMagnitudeLimit/);
  assert.match(stars.material.vertexShader, /vec3 lensStarPosition/);
  assert.match(stars.material.vertexShader, /Point-mass lens equation/);
  assert.match(
    stars.material.vertexShader,
    /vec3 lensedPosition = position;[\s\S]*?if \(uLensAmount > 0\.0\)/,
    "80k Gaia vertices must bypass lens calculations while the event is off"
  );
  assert.match(stars.material.fragmentShader, /vMagnitudeVisibility/);
  assert.match(stars.material.vertexShader, /gl_PointSize = 6\.0 \* uPixelRatio/);
  assert.doesNotMatch(stars.material.vertexShader, /sizePulse/);
  assert.doesNotMatch(stars.material.vertexShader, /aSize|vPsfScale/);
  assert.match(stars.material.fragmentShader, /pixelPositionCss/);
  assert.match(stars.material.fragmentShader, /STAR_SIGMA_CSS = 0\.40/);
  assert.match(stars.material.fragmentShader, /float diffractionGate = smoothstep\(3\.15, 3\.55/);
  assert.match(stars.material.fragmentShader, /diffractionGate \* 0\.03/);
  assert.doesNotMatch(
    stars.material.fragmentShader,
    /float\s+(?:airyWing|starHalo|coreNormalization)|vPsfScale/,
    "Gaia PSFs must not rebuild a broad glow around their crisp centres"
  );
  assert.match(
    stars.material.fragmentShader,
    /float alpha = coverage[\s\S]*?\* uReveal[\s\S]*?\* vMagnitudeVisibility[\s\S]*?\* vLensSourceVisibility;/,
    "alpha must remain PSF coverage rather than catalogue brightness"
  );
  assert.match(
    stars.material.fragmentShader,
    /vec3 sourceRadiance = stellarColour \* vIntensity \* vLensMagnification;/,
    "catalogue brightness and lens magnification belong in RGB"
  );
  assert.doesNotMatch(stars.material.fragmentShader, /float halo/);

  const originalPositions = [...stars.geometry.getAttribute("position").array];
  setGaiaStarLens(stars, {
    amount: 1,
    direction: [3, 4, 0],
    einsteinRadius: 0.11,
    influenceRadius: 0.5,
    sourceMaskAmount: 0.75,
    sourceMaskRadius: 0.28
  });
  assert.equal(stars.material.uniforms.uLensAmount.value, 1);
  assert.ok(stars.material.uniforms.uLensDirection.value.distanceTo(
    new THREE.Vector3(0.6, 0.8, 0)
  ) < 1e-12);
  assert.equal(stars.material.uniforms.uLensEinsteinRadius.value, 0.11);
  assert.equal(stars.material.uniforms.uLensInfluenceRadius.value, 0.5);
  assert.equal(stars.material.uniforms.uLensSourceMaskAmount.value, 0.75);
  assert.equal(stars.material.uniforms.uLensSourceMaskRadius.value, 0.28);
  assert.deepEqual(
    [...stars.geometry.getAttribute("position").array],
    originalPositions,
    "lensing must bend the one catalogue draw in the GPU without rebuilding it"
  );
  setGaiaStarLens(stars, 0);
  assert.equal(
    stars.material.uniforms.uLensAmount.value,
    0,
    "the ordinary observatory must keep an exact opt-out path"
  );
  assert.equal(stars.material.uniforms.uLensSourceMaskAmount.value, 0);

  let geometryDisposals = 0;
  let materialDisposals = 0;
  stars.geometry.addEventListener("dispose", () => {
    geometryDisposals += 1;
  });
  stars.material.addEventListener("dispose", () => {
    materialDisposals += 1;
  });
  disposeGaiaStarPoints(stars);
  disposeGaiaStarPoints(stars);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(stars.userData.disposed, true);
});

test("the browser loader is injectable and rejects failed catalogue requests", async () => {
  const arrayBuffer = binary.buffer.slice(
    binary.byteOffset,
    binary.byteOffset + binary.byteLength
  );
  let requestedUrl = null;
  const catalogue = await loadGaiaStarCatalog({
    url: "/test-gaia.bin",
    lod: "medium",
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, arrayBuffer: async () => arrayBuffer };
    }
  });
  assert.equal(requestedUrl, "/test-gaia.bin");
  assert.equal(catalogue.count, GAIA_STAR_LOD_COUNTS.medium);

  await assert.rejects(
    loadGaiaStarCatalog({
      fetchImpl: async () => ({ ok: false, status: 404 })
    }),
    /Could not load Gaia catalogue \(404\)/
  );
});

test("the offline builder deterministically encodes saved official TAP CSV", () => {
  const csv = `source_id,ra,dec,phot_g_mean_mag,bp_rp
1576683529448755328,193.50817846782095,55.959784778923755,1.731607,0.33836722
6560604777055249536,332.05907779469464,-46.96161734131188,1.7732803,0.25205588
`;
  const stars = parseGaiaCsv(csv, 2);
  const first = buildGaiaCatalogBinary(stars).binary;
  const second = buildGaiaCatalogBinary(stars).binary;
  assert.deepEqual(new Uint8Array(first), new Uint8Array(second));

  const decoded = decodeGaiaStarCatalog(first, {
    lod: "high",
    includeSourceIds: true
  });
  assert.equal(decoded.count, 2);
  assert.deepEqual(
    [...decoded.sourceIds],
    [1_576_683_529_448_755_328n, 6_560_604_777_055_249_536n]
  );
});

test("catalogue corruption and unsupported LODs fail closed", () => {
  const badMagic = Buffer.from(binary);
  badMagic[0] = "X".charCodeAt(0);
  assert.throws(() => readGaiaStarCatalogHeader(badMagic), /Invalid Gaia catalogue magic/);
  assert.throws(
    () => readGaiaStarCatalogHeader(binary.subarray(0, -1)),
    /byte length mismatch/
  );
  assert.throws(
    () => decodeGaiaStarCatalog(binary, { lod: "cinematic" }),
    /Unknown Gaia star LOD/
  );
});
