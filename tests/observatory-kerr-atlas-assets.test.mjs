import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  getCircularDiscRedshift,
  getKerrHorizonRadius,
  getKerrRayConstants,
  getProgradeKerrIscoRadius,
  KERR_RAY_STATUS,
  traceKerrRay
} from "../scripts/build-kerr-transfer-atlas.mjs";

const DATA_ROOT = new URL("../public/data/", import.meta.url);
const SCRIPT_URL = new URL("../scripts/build-kerr-transfer-atlas.mjs", import.meta.url);
const META_URL = new URL(
  "observatory-kerr-transfer-atlas-v1.meta.json",
  DATA_ROOT
);
const LICENCE_URL = new URL(
  "observatory-kerr-transfer-atlas-LICENSE.txt",
  DATA_ROOT
);

const EXPECTED = Object.freeze({
  sky: {
    path: "observatory-kerr-sky-v1.bin",
    channels: 4,
    bytes: 2_359_304,
    sha256: "ffd617c58f5d456673597f27abc2d7661ed7198354611f7a93b5fbfa5cf10c89"
  },
  discPrimary: {
    path: "observatory-kerr-disc-primary-v1.bin",
    channels: 4,
    bytes: 2_359_304,
    sha256: "0871f99794fae2dbf61c8640fce2421adcd7e07d2b691ed0714a447e180566fe"
  },
  discSecondary: {
    path: "observatory-kerr-disc-secondary-v1.bin",
    channels: 4,
    bytes: 2_359_304,
    sha256: "99a0fc3b646efd84a83da76801e559299177e4da2bed4cd8b2e18e12c0f493f9"
  },
  path: {
    path: "observatory-kerr-path-v1.bin",
    channels: 2,
    bytes: 1_179_656,
    sha256: "7293266fe356aa85ed7fd5fb739827e6250c7d7cac4cb971c9e0d7c54da4d4e7"
  }
});

let fixturePromise;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeAtlas(bytes, channels) {
  const width = bytes.readUInt32LE(0);
  const height = bytes.readUInt32LE(4);
  const expectedBytes = 8 + width * height * channels * Float32Array.BYTES_PER_ELEMENT;
  assert.equal(bytes.byteLength, expectedBytes);
  const data = new Float32Array(width * height * channels);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = bytes.readFloatLE(8 + index * Float32Array.BYTES_PER_ELEMENT);
  }
  return { width, height, channels, data };
}

async function loadFixture() {
  fixturePromise ??= Promise.all([
    readFile(META_URL, "utf8"),
    readFile(LICENCE_URL, "utf8"),
    readFile(SCRIPT_URL),
    ...Object.values(EXPECTED).map(({ path }) => readFile(new URL(path, DATA_ROOT)))
  ]).then(([rawMetadata, licence, script, ...binaries]) => {
    const metadata = JSON.parse(rawMetadata);
    const decoded = Object.fromEntries(
      Object.entries(EXPECTED).map(([key, definition], index) => [
        key,
        decodeAtlas(binaries[index], definition.channels)
      ])
    );
    return { metadata, licence, script, binaries, ...decoded };
  });
  return fixturePromise;
}

test("Kerr v1 atlas retains exact dimensions, hashes, fixed physics, and provenance", async () => {
  const { metadata, licence, script, binaries } = await loadFixture();
  assert.equal(metadata.schema, "cochonnet-observatory-kerr-transfer-atlas");
  assert.equal(metadata.version, 1);
  assert.equal(metadata.fixedPhysicalParameters.dimensionlessSpin, 0.94);
  assert.ok(
    Math.abs(metadata.fixedPhysicalParameters.observerInclinationDegrees - 60) < 1e-10
  );
  assert.equal(metadata.fixedPhysicalParameters.observerBoyerLindquistRadiusM, 1_000);
  assert.equal(metadata.fixedPhysicalParameters.sourceSphereBoyerLindquistRadiusM, 1_000);
  assert.ok(metadata.fixedPhysicalParameters.outerHorizonRadiusM > 1.3);
  assert.ok(metadata.fixedPhysicalParameters.outerHorizonRadiusM < 1.4);
  assert.ok(metadata.fixedPhysicalParameters.progradeIscoRadiusM > 2);
  assert.ok(metadata.fixedPhysicalParameters.progradeIscoRadiusM < 2.1);

  assert.match(metadata.integration.method, /exact separated Kerr/i);
  assert.match(metadata.integration.radialPotential, /Delta/);
  assert.match(metadata.integration.polarPotential, /Theta/);
  assert.match(metadata.integration.note, /marked unresolved/);
  assert.equal(metadata.discModel.imageOrders[0], 0);
  assert.equal(metadata.discModel.imageOrders[1], 1);
  assert.match(metadata.discModel.redshift, /u\^t/);
  assert.equal(metadata.skyModel.statusValues.captured, KERR_RAY_STATUS.captured);
  assert.equal(metadata.skyModel.statusValues.unresolved, KERR_RAY_STATUS.unresolved);
  assert.match(metadata.skyModel.sourceDirectionFrame, /Kerr spin axis/);
  assert.match(metadata.pathModel.backgroundTimeDelay, /coordinate travel time/);
  assert.match(metadata.pathModel.backgroundImageOrder, /central angular travel/);

  assert.deepEqual(
    metadata.references.map(({ doi }) => doi),
    ["10.1103/PhysRevD.101.044032", "10.1103/PhysRevD.107.043030"]
  );
  assert.equal(metadata.licence.spdx, "CC0-1.0");
  assert.match(metadata.licence.note, /no AART code or data/i);
  assert.match(licence, /SPDX-License-Identifier: CC0-1.0/);
  assert.match(licence, /No source code or precomputed data from AART/i);

  assert.equal(sha256(script), metadata.generator.sha256);
  for (const [index, [key, definition]] of Object.entries(EXPECTED).entries()) {
    const fileMetadata = metadata.files.find((file) => file.key === key);
    assert.ok(fileMetadata, `missing metadata for ${key}`);
    assert.equal(fileMetadata.path, definition.path);
    assert.equal(fileMetadata.width, 384);
    assert.equal(fileMetadata.height, 384);
    assert.equal(fileMetadata.channels, definition.channels);
    assert.equal(fileMetadata.byteLength, definition.bytes);
    assert.equal(fileMetadata.sha256, definition.sha256);
    assert.equal(binaries[index].byteLength, definition.bytes);
    assert.equal(sha256(binaries[index]), definition.sha256);
  }
});

test("physical atlas has a resolved displaced, non-circular Kerr capture region", async () => {
  const { metadata, sky } = await loadFixture();
  let escaped = 0;
  let captured = 0;
  let unresolved = 0;
  let invalid = 0;
  let alphaTotal = 0;
  let betaTotal = 0;
  let minAlpha = Infinity;
  let maxAlpha = -Infinity;
  let minBeta = Infinity;
  let maxBeta = -Infinity;
  let maximumDirectionError = 0;

  for (let pixel = 0; pixel < sky.width * sky.height; pixel += 1) {
    const x = pixel % sky.width;
    const y = Math.floor(pixel / sky.width);
    const alpha = -12 + 24 * (x + 0.5) / sky.width;
    const beta = 12 - 24 * (y + 0.5) / sky.height;
    const offset = pixel * 4;
    const status = sky.data[offset + 3];
    assert.ok(Number.isInteger(status));
    assert.ok(status >= KERR_RAY_STATUS.escaped && status <= KERR_RAY_STATUS.invalid);
    if (status === KERR_RAY_STATUS.escaped) {
      escaped += 1;
      const length = Math.hypot(
        sky.data[offset],
        sky.data[offset + 1],
        sky.data[offset + 2]
      );
      maximumDirectionError = Math.max(maximumDirectionError, Math.abs(length - 1));
    } else if (status === KERR_RAY_STATUS.captured) {
      captured += 1;
      alphaTotal += alpha;
      betaTotal += beta;
      minAlpha = Math.min(minAlpha, alpha);
      maxAlpha = Math.max(maxAlpha, alpha);
      minBeta = Math.min(minBeta, beta);
      maxBeta = Math.max(maxBeta, beta);
    } else if (status === KERR_RAY_STATUS.unresolved) {
      unresolved += 1;
    } else {
      invalid += 1;
    }
  }

  const pixelCount = sky.width * sky.height;
  assert.ok(escaped > pixelCount * 0.8);
  assert.ok(captured > pixelCount * 0.1);
  assert.ok(captured < pixelCount * 0.2);
  assert.ok(unresolved / pixelCount < 0.002);
  assert.equal(invalid, 0);
  assert.ok(maximumDirectionError < 1e-6);

  const alphaCentroid = alphaTotal / captured;
  const betaCentroid = betaTotal / captured;
  assert.ok(alphaCentroid > 1.5, "frame dragging must displace the shadow horizontally");
  assert.ok(Math.abs(betaCentroid) < 1e-10, "equatorial reflection symmetry must remain");
  const horizontalDiameter = maxAlpha - minAlpha;
  const verticalDiameter = maxBeta - minBeta;
  assert.ok(
    verticalDiameter - horizontalDiameter > 0.4,
    "the inclined high-spin shadow must not collapse to a shifted circle"
  );
  // Independent critical-curve values from the exact spherical-photon-orbit
  // formula at a=0.94, theta_o=60deg.  Agreement to one 0.0625M atlas texel
  // guards against a plausible-looking but non-geodesic painted mask.
  assert.ok(Math.abs(minAlpha - (-2.9077284251909647)) < 0.07);
  assert.ok(Math.abs(maxAlpha - 6.645783336649286) < 0.07);
  assert.ok(Math.abs(maxBeta - 5.129716392336909) < 0.07);

  assert.deepEqual(metadata.statistics, {
    pixelCount: 147_456,
    escaped,
    captured,
    unresolved,
    invalid,
    primaryDiscIntersections: 142_616,
    secondaryDiscIntersections: 26_457,
    raysWithPositiveCircularDiscRedshift: 140_152,
    maximumBackgroundImageOrder: 4
  });
});

test("both equatorial transfer layers contain finite intersections, redshift, and time", async () => {
  const { discPrimary, discSecondary } = await loadFixture();
  for (const [label, atlas, minimumCount] of [
    ["primary", discPrimary, 140_000],
    ["secondary", discSecondary, 25_000]
  ]) {
    let validCount = 0;
    let positiveRedshiftCount = 0;
    let maximumTime = 0;
    for (let pixel = 0; pixel < atlas.width * atlas.height; pixel += 1) {
      const offset = pixel * 4;
      const radius = atlas.data[offset];
      const azimuth = atlas.data[offset + 1];
      const redshift = atlas.data[offset + 2];
      const coordinateTime = atlas.data[offset + 3];
      assert.ok(Number.isFinite(radius));
      assert.ok(Number.isFinite(azimuth));
      assert.ok(Number.isFinite(redshift));
      assert.ok(Number.isFinite(coordinateTime));
      if (radius === 0) {
        assert.deepEqual(
          [azimuth, redshift, coordinateTime],
          [0, 0, 0],
          `${label} invalid texel must use the all-zero sentinel`
        );
        continue;
      }
      validCount += 1;
      assert.ok(radius > getKerrHorizonRadius());
      assert.ok(azimuth >= -Math.PI && azimuth <= Math.PI);
      assert.ok(redshift >= 0);
      assert.ok(coordinateTime > 0);
      if (redshift > 0) positiveRedshiftCount += 1;
      maximumTime = Math.max(maximumTime, coordinateTime);
    }
    assert.ok(validCount > minimumCount);
    assert.ok(positiveRedshiftCount > minimumCount * 0.9);
    assert.ok(maximumTime > 1_000);
  }
});

test("path layer supplies finite slow-light delay and resolved higher image orders", async () => {
  const { sky, path } = await loadFixture();
  let maximumDelay = 0;
  let maximumOrder = 0;
  let higherOrderCount = 0;
  for (let pixel = 0; pixel < path.width * path.height; pixel += 1) {
    const status = sky.data[pixel * 4 + 3];
    const delay = path.data[pixel * 2];
    const imageOrder = path.data[pixel * 2 + 1];
    assert.ok(Number.isFinite(delay));
    assert.ok(Number.isFinite(imageOrder));
    assert.ok(delay >= 0);
    assert.ok(Number.isInteger(imageOrder));
    if (status !== KERR_RAY_STATUS.escaped) {
      assert.deepEqual([delay, imageOrder], [0, 0]);
      continue;
    }
    maximumDelay = Math.max(maximumDelay, delay);
    maximumOrder = Math.max(maximumOrder, imageOrder);
    if (imageOrder > 0) higherOrderCount += 1;
  }
  assert.ok(maximumDelay > 100);
  assert.equal(maximumOrder, 4);
  assert.ok(higherOrderCount > 0);
});

test("generator equations reproduce Kerr asymmetry and the circular-orbit redshift contract", () => {
  assert.ok(Math.abs(getKerrHorizonRadius() - 1.3411744421846397) < 1e-12);
  assert.ok(Math.abs(getProgradeKerrIscoRadius() - 2.023593104700402) < 1e-12);
  const constants = getKerrRayConstants(4, 3);
  assert.ok(Math.abs(constants.lambda + 4 * Math.sin(Math.PI / 3)) < 1e-12);
  assert.ok(Number.isFinite(constants.eta));

  const centre = traceKerrRay(0, 0);
  const progradeSide = traceKerrRay(5, 0);
  const retrogradeSide = traceKerrRay(-5, 0);
  assert.equal(centre.status, KERR_RAY_STATUS.captured);
  assert.equal(progradeSide.status, KERR_RAY_STATUS.captured);
  assert.equal(retrogradeSide.status, KERR_RAY_STATUS.escaped);
  assert.equal(retrogradeSide.sourceDirection.length, 3);
  assert.ok(retrogradeSide.discCrossings.length > 0);

  const isco = getProgradeKerrIscoRadius();
  assert.equal(getCircularDiscRedshift(isco - 1e-3, 0), 0);
  assert.ok(getCircularDiscRedshift(isco + 0.1, 0) > 0);
});
