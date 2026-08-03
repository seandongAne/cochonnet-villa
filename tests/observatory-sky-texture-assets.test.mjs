import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

import {
  OBSERVATORY_SKY_ASSET_PAGE,
  OBSERVATORY_SKY_BUILD_METHOD,
  OBSERVATORY_SKY_HIGH_FILENAME,
  OBSERVATORY_SKY_HIGH_HEIGHT,
  OBSERVATORY_SKY_HIGH_WIDTH,
  OBSERVATORY_SKY_LICENSE_FILENAME,
  OBSERVATORY_SKY_MEDIUM_FILENAME,
  OBSERVATORY_SKY_MEDIUM_HEIGHT,
  OBSERVATORY_SKY_MEDIUM_SHA256,
  OBSERVATORY_SKY_MEDIUM_WIDTH,
  OBSERVATORY_SKY_METADATA_FILENAME,
  OBSERVATORY_SKY_SOURCE_BYTES,
  OBSERVATORY_SKY_SOURCE_HEIGHT,
  OBSERVATORY_SKY_SOURCE_MD5,
  OBSERVATORY_SKY_SOURCE_SHA256,
  OBSERVATORY_SKY_SOURCE_URL,
  OBSERVATORY_SKY_SOURCE_WIDTH,
  parseObservatorySkyBuildArgs
} from "../scripts/build-observatory-sky-textures.mjs";

const TEXTURE_DIRECTORY = new URL("../public/textures/", import.meta.url);
const HIGH_PATH = new URL(OBSERVATORY_SKY_HIGH_FILENAME, TEXTURE_DIRECTORY);
const MEDIUM_PATH = new URL(OBSERVATORY_SKY_MEDIUM_FILENAME, TEXTURE_DIRECTORY);
const METADATA_PATH = new URL(OBSERVATORY_SKY_METADATA_FILENAME, TEXTURE_DIRECTORY);
const LICENSE_PATH = new URL(OBSERVATORY_SKY_LICENSE_FILENAME, TEXTURE_DIRECTORY);

const EXPECTED_HIGH_SHA256 =
  "85a8c22a11a7d45692848fa795a28f1664e3a9a3a44a476e5da62d7d3b185efc";
const EXPECTED_HIGH_BYTES = 5_101_484;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readLossyWebpDimensions(bytes) {
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "VP8 ");
  assert.deepEqual([...bytes.subarray(23, 26)], [0x9d, 0x01, 0x2a]);
  return {
    width: bytes.readUInt16LE(26) & 0x3fff,
    height: bytes.readUInt16LE(28) & 0x3fff
  };
}

test("the High observatory backdrop is a real 8192 x 2048 WebP within budget", () => {
  const highBytes = readFileSync(HIGH_PATH);
  const mediumBytes = readFileSync(MEDIUM_PATH);

  assert.deepEqual(readLossyWebpDimensions(highBytes), {
    width: OBSERVATORY_SKY_HIGH_WIDTH,
    height: OBSERVATORY_SKY_HIGH_HEIGHT
  });
  assert.deepEqual(readLossyWebpDimensions(mediumBytes), {
    width: OBSERVATORY_SKY_MEDIUM_WIDTH,
    height: OBSERVATORY_SKY_MEDIUM_HEIGHT
  });
  assert.equal(highBytes.length, EXPECTED_HIGH_BYTES);
  assert.equal(sha256(highBytes), EXPECTED_HIGH_SHA256);
  assert.equal(sha256(mediumBytes), OBSERVATORY_SKY_MEDIUM_SHA256);
  assert.ok(highBytes.length > mediumBytes.length * 2);
  assert.ok(highBytes.length < 8 * 1024 * 1024, "High sky should stay below 8 MiB");
});

test("sky tier metadata locks official provenance, transforms and checksums", () => {
  const metadata = JSON.parse(readFileSync(METADATA_PATH, "utf8"));

  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.license.expression, "CC0-1.0");
  assert.equal(metadata.source.assetPage, OBSERVATORY_SKY_ASSET_PAGE);
  assert.equal(metadata.source.url, OBSERVATORY_SKY_SOURCE_URL);
  assert.equal(metadata.source.width, OBSERVATORY_SKY_SOURCE_WIDTH);
  assert.equal(metadata.source.height, OBSERVATORY_SKY_SOURCE_HEIGHT);
  assert.equal(metadata.source.bytes, OBSERVATORY_SKY_SOURCE_BYTES);
  assert.equal(metadata.source.publishedMd5, OBSERVATORY_SKY_SOURCE_MD5);
  assert.equal(metadata.source.sha256, OBSERVATORY_SKY_SOURCE_SHA256);

  assert.deepEqual(metadata.transform.crop, OBSERVATORY_SKY_BUILD_METHOD.crop);
  assert.equal(
    metadata.transform.detailSource,
    "official Poly Haven 8K tonemapped JPEG"
  );
  assert.equal(
    metadata.transform.gradeTransfer.reference,
    OBSERVATORY_SKY_MEDIUM_FILENAME
  );
  assert.match(
    metadata.transform.gradeTransfer.purpose,
    /all 8K spatial detail comes from the official source/
  );

  assert.equal(metadata.tiers.medium.url, "/textures/qwantani-night-puresky-dome-4k.webp");
  assert.equal(metadata.tiers.medium.sha256, OBSERVATORY_SKY_MEDIUM_SHA256);
  assert.equal(metadata.tiers.high.url, "/textures/qwantani-night-puresky-dome-8k.webp");
  assert.equal(metadata.tiers.high.sha256, EXPECTED_HIGH_SHA256);
  assert.equal(metadata.tiers.high.bytes, EXPECTED_HIGH_BYTES);
  assert.equal(metadata.generatedBy.command, "node scripts/build-observatory-sky-textures.mjs");
});

test("the tier license preserves Poly Haven CC0 provenance and rebuild command", () => {
  const license = readFileSync(LICENSE_PATH, "utf8");

  assert.match(license, /Qwantani Night \(Pure Sky\)/);
  assert.match(license, /Photography: Greg Zaal/);
  assert.match(license, /Processing: Jarod Guest/);
  assert.match(license, /License: CC0 1\.0 Universal/);
  assert.match(license, /polyhaven\.com\/a\/qwantani_night_puresky/);
  assert.match(license, /build-observatory-sky-textures\.mjs/);
  assert.equal(statSync(LICENSE_PATH).size > 500, true);
});

test("the builder exposes an offline source path without weakening verification", () => {
  const options = parseObservatorySkyBuildArgs([
    "--source",
    "fixtures/source.jpg",
    "--output-dir",
    "fixtures/output"
  ]);

  assert.match(options.sourcePath, /fixtures[\\/]source\.jpg$/);
  assert.match(options.outputDirectory, /fixtures[\\/]output$/);
  assert.equal(options.help, false);
  assert.throws(
    () => parseObservatorySkyBuildArgs(["--source"]),
    /requires a path/
  );
  assert.throws(
    () => parseObservatorySkyBuildArgs(["--unverified"]),
    /Unknown argument/
  );
});
