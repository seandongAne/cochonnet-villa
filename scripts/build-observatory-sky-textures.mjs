import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

export const OBSERVATORY_SKY_ASSET_PAGE =
  "https://polyhaven.com/a/qwantani_night_puresky";
export const OBSERVATORY_SKY_SOURCE_API =
  "https://api.polyhaven.com/files/qwantani_night_puresky";
export const OBSERVATORY_SKY_SOURCE_URL =
  "https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/qwantani_night_puresky.jpg";
export const OBSERVATORY_SKY_SOURCE_MD5 =
  "70c24e45fe8db819641c76068675c4a2";
export const OBSERVATORY_SKY_SOURCE_SHA256 =
  "e557a79662a413d93e7248a418a1f2f11cca604ffd3a56bb9687d925629b7e2d";
export const OBSERVATORY_SKY_SOURCE_BYTES = 30_309_210;
export const OBSERVATORY_SKY_SOURCE_WIDTH = 8_192;
export const OBSERVATORY_SKY_SOURCE_HEIGHT = 4_096;

export const OBSERVATORY_SKY_HIGH_FILENAME =
  "qwantani-night-puresky-dome-8k.webp";
export const OBSERVATORY_SKY_MEDIUM_FILENAME =
  "qwantani-night-puresky-dome-4k.webp";
export const OBSERVATORY_SKY_METADATA_FILENAME =
  "qwantani-night-puresky-dome-tiers.meta.json";
export const OBSERVATORY_SKY_LICENSE_FILENAME =
  "qwantani-night-puresky-dome-tiers.LICENSE.txt";

export const OBSERVATORY_SKY_HIGH_WIDTH = 8_192;
export const OBSERVATORY_SKY_HIGH_HEIGHT = 2_048;
export const OBSERVATORY_SKY_MEDIUM_WIDTH = 4_096;
export const OBSERVATORY_SKY_MEDIUM_HEIGHT = 1_024;
export const OBSERVATORY_SKY_MEDIUM_SHA256 =
  "38bd58883bc16a315dda45df73ac60833cf774e3227cd0045884deccbf4b028d";

export const OBSERVATORY_SKY_BUILD_METHOD = Object.freeze({
  detailSource: "official Poly Haven 8K tonemapped JPEG",
  crop: Object.freeze({
    left: 0,
    top: 0,
    width: OBSERVATORY_SKY_HIGH_WIDTH,
    height: OBSERVATORY_SKY_HIGH_HEIGHT
  }),
  detailContrast: Object.freeze({
    saturation: 1.12,
    linearSlope: 1.14,
    linearIntercept: -14
  }),
  gradeTransfer: Object.freeze({
    reference: OBSERVATORY_SKY_MEDIUM_FILENAME,
    blurSigmaAtMediumResolution: 12,
    minimumGuideValue: 8,
    maximumChannelRatio: 2.5,
    purpose:
      "low-frequency colour and horizon grade only; all 8K spatial detail comes from the official source"
  }),
  webp: Object.freeze({
    quality: 92,
    effort: 6,
    smartSubsample: true
  })
});

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const DEFAULT_OUTPUT_DIRECTORY = resolve(REPOSITORY_ROOT, "public", "textures");

function printUsage() {
  process.stdout.write(`Build the Observatory High sky texture from Poly Haven's official 8K master.

Usage:
  node scripts/build-observatory-sky-textures.mjs [options]

Options:
  --source <path>      Use an already-downloaded official source JPEG.
  --output-dir <path>  Override public/textures output directory.
  --help               Show this message.

The source is always verified against Poly Haven's published MD5 and the
repository's recorded SHA-256. The existing 4K Medium texture is used only as
a heavily blurred colour/horizon-grade reference; it is never enlarged to
provide High-tier image detail.
`);
}

export function parseObservatorySkyBuildArgs(argv) {
  const options = {
    sourcePath: null,
    outputDirectory: DEFAULT_OUTPUT_DIRECTORY,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--source" || argument === "--output-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a path`);
      }
      index += 1;
      if (argument === "--source") options.sourcePath = resolve(value);
      else options.outputDirectory = resolve(value);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export async function hashFile(filePath, algorithm = "sha256") {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyFile(filePath, expected) {
  const fileStats = await stat(filePath);
  if (fileStats.size !== expected.bytes) {
    throw new Error(
      `${expected.label} has ${fileStats.size} bytes; expected ${expected.bytes}`
    );
  }
  for (const [algorithm, expectedDigest] of Object.entries(expected.digests)) {
    const actualDigest = await hashFile(filePath, algorithm);
    if (actualDigest !== expectedDigest) {
      throw new Error(
        `${expected.label} ${algorithm.toUpperCase()} mismatch: ${actualDigest}`
      );
    }
  }
  return fileStats;
}

async function downloadOfficialSource(destination) {
  const response = await fetch(OBSERVATORY_SKY_SOURCE_URL, {
    headers: {
      "User-Agent": "cochonnet-villa-observatory-texture-builder/1.0"
    }
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `Poly Haven source request failed (${response.status} ${response.statusText})`
    );
  }
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(destination, { flags: "wx" })
  );
}

async function loadSharp() {
  try {
    const imported = await import("sharp");
    return imported.default;
  } catch (directImportError) {
    // Astro has Sharp as a locked direct dependency, but pnpm may not hoist its
    // symlink to the repository root. Resolve it from Astro without adding a
    // second image stack or mutating package.json.
    try {
      const repositoryRequire = createRequire(import.meta.url);
      const astroEntry = repositoryRequire.resolve("astro");
      return createRequire(astroEntry)("sharp");
    } catch (nestedImportError) {
      throw new Error(
        "Sharp is unavailable. Run the repository package install before rebuilding sky textures.",
        { cause: nestedImportError ?? directImportError }
      );
    }
  }
}

function sourceDetailPipeline(sharp, sourcePath) {
  const { crop, detailContrast } = OBSERVATORY_SKY_BUILD_METHOD;
  return sharp(sourcePath)
    .extract(crop)
    .removeAlpha()
    .toColourspace("srgb")
    .modulate({ saturation: detailContrast.saturation })
    .linear(detailContrast.linearSlope, detailContrast.linearIntercept);
}

function assertRawImageInfo(info, label) {
  if (
    info.width !== OBSERVATORY_SKY_HIGH_WIDTH
    || info.height !== OBSERVATORY_SKY_HIGH_HEIGHT
    || info.channels !== 3
  ) {
    throw new Error(
      `${label} resolved to ${info.width}x${info.height}x${info.channels}; expected 8192x2048x3`
    );
  }
}

export async function buildObservatorySkyHighTexture({
  sharp,
  sourcePath,
  mediumPath,
  outputPath
}) {
  const sourceMetadata = await sharp(sourcePath).metadata();
  if (
    sourceMetadata.width !== OBSERVATORY_SKY_SOURCE_WIDTH
    || sourceMetadata.height !== OBSERVATORY_SKY_SOURCE_HEIGHT
    || sourceMetadata.format !== "jpeg"
  ) {
    throw new Error(
      `Official source must be an 8192x4096 JPEG; received ${sourceMetadata.width}x${sourceMetadata.height} ${sourceMetadata.format}`
    );
  }
  const mediumMetadata = await sharp(mediumPath).metadata();
  if (
    mediumMetadata.width !== OBSERVATORY_SKY_MEDIUM_WIDTH
    || mediumMetadata.height !== OBSERVATORY_SKY_MEDIUM_HEIGHT
    || mediumMetadata.format !== "webp"
  ) {
    throw new Error(
      `Medium grade reference must be a 4096x1024 WebP; received ${mediumMetadata.width}x${mediumMetadata.height} ${mediumMetadata.format}`
    );
  }

  const blurSigma = OBSERVATORY_SKY_BUILD_METHOD.gradeTransfer
    .blurSigmaAtMediumResolution;
  const highResize = {
    width: OBSERVATORY_SKY_HIGH_WIDTH,
    height: OBSERVATORY_SKY_HIGH_HEIGHT,
    kernel: "cubic"
  };
  const [detail, sourceGuide, mediumGuide] = await Promise.all([
    sourceDetailPipeline(sharp, sourcePath)
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sourceDetailPipeline(sharp, sourcePath)
      .resize(OBSERVATORY_SKY_MEDIUM_WIDTH, OBSERVATORY_SKY_MEDIUM_HEIGHT, {
        kernel: "lanczos3"
      })
      .blur(blurSigma)
      .resize(highResize)
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sharp(mediumPath)
      .removeAlpha()
      .toColourspace("srgb")
      .blur(blurSigma)
      .resize(highResize)
      .raw()
      .toBuffer({ resolveWithObject: true })
  ]);
  assertRawImageInfo(detail.info, "Official 8K detail");
  assertRawImageInfo(sourceGuide.info, "Official-source grade guide");
  assertRawImageInfo(mediumGuide.info, "Medium grade guide");

  const output = Buffer.allocUnsafe(detail.data.length);
  const minimumGuide = OBSERVATORY_SKY_BUILD_METHOD.gradeTransfer.minimumGuideValue;
  const maximumRatio = OBSERVATORY_SKY_BUILD_METHOD.gradeTransfer.maximumChannelRatio;
  for (let index = 0; index < output.length; index += 1) {
    const ratio = Math.min(
      maximumRatio,
      mediumGuide.data[index] / Math.max(minimumGuide, sourceGuide.data[index])
    );
    output[index] = Math.max(
      0,
      Math.min(255, Math.round(detail.data[index] * ratio))
    );
  }

  const temporaryOutputPath = `${outputPath}.building.webp`;
  await rm(temporaryOutputPath, { force: true });
  await sharp(output, {
    raw: {
      width: OBSERVATORY_SKY_HIGH_WIDTH,
      height: OBSERVATORY_SKY_HIGH_HEIGHT,
      channels: 3
    }
  })
    .webp(OBSERVATORY_SKY_BUILD_METHOD.webp)
    .toFile(temporaryOutputPath);
  await rm(outputPath, { force: true });
  await rename(temporaryOutputPath, outputPath);

  return {
    sourceMetadata,
    mediumMetadata,
    outputMetadata: await sharp(outputPath).metadata()
  };
}

async function createMetadata({ sourcePath, mediumPath, highPath, sharp }) {
  const [sourceStats, mediumStats, highStats] = await Promise.all([
    stat(sourcePath),
    stat(mediumPath),
    stat(highPath)
  ]);
  const [mediumMetadata, highMetadata] = await Promise.all([
    sharp(mediumPath).metadata(),
    sharp(highPath).metadata()
  ]);
  const [sourceSha256, mediumSha256, highSha256] = await Promise.all([
    hashFile(sourcePath),
    hashFile(mediumPath),
    hashFile(highPath)
  ]);
  return {
    schemaVersion: 1,
    title: "Qwantani Night Pure Sky observatory texture tiers",
    license: {
      expression: "CC0-1.0",
      url: "https://creativecommons.org/publicdomain/zero/1.0/",
      photography: "Greg Zaal",
      processing: "Jarod Guest",
      publisher: "Poly Haven"
    },
    source: {
      assetPage: OBSERVATORY_SKY_ASSET_PAGE,
      api: OBSERVATORY_SKY_SOURCE_API,
      url: OBSERVATORY_SKY_SOURCE_URL,
      tier: "official-tonemapped-8k",
      format: "jpeg",
      width: OBSERVATORY_SKY_SOURCE_WIDTH,
      height: OBSERVATORY_SKY_SOURCE_HEIGHT,
      bytes: sourceStats.size,
      publishedMd5: OBSERVATORY_SKY_SOURCE_MD5,
      sha256: sourceSha256
    },
    transform: OBSERVATORY_SKY_BUILD_METHOD,
    tiers: {
      medium: {
        url: `/textures/${OBSERVATORY_SKY_MEDIUM_FILENAME}`,
        filename: OBSERVATORY_SKY_MEDIUM_FILENAME,
        width: mediumMetadata.width,
        height: mediumMetadata.height,
        bytes: mediumStats.size,
        sha256: mediumSha256,
        role: "existing default and Medium-tier fallback"
      },
      high: {
        url: `/textures/${OBSERVATORY_SKY_HIGH_FILENAME}`,
        filename: OBSERVATORY_SKY_HIGH_FILENAME,
        width: highMetadata.width,
        height: highMetadata.height,
        bytes: highStats.size,
        sha256: highSha256,
        role: "High-tier native-detail upper-hemisphere backdrop"
      }
    },
    generatedBy: {
      command: "node scripts/build-observatory-sky-textures.mjs",
      script: "scripts/build-observatory-sky-textures.mjs",
      sharp: sharp.versions?.sharp ?? "unknown",
      libvips: sharp.versions?.vips ?? "unknown"
    }
  };
}

export async function buildObservatorySkyTextures(options = {}) {
  const outputDirectory = resolve(
    options.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY
  );
  const mediumPath = resolve(outputDirectory, OBSERVATORY_SKY_MEDIUM_FILENAME);
  const highPath = resolve(outputDirectory, OBSERVATORY_SKY_HIGH_FILENAME);
  const metadataPath = resolve(outputDirectory, OBSERVATORY_SKY_METADATA_FILENAME);
  const sharp = options.sharp ?? await loadSharp();
  sharp.cache(false);
  sharp.concurrency(1);

  await mkdir(outputDirectory, { recursive: true });
  await verifyFile(mediumPath, {
    label: "Medium texture",
    bytes: 1_284_590,
    digests: { sha256: OBSERVATORY_SKY_MEDIUM_SHA256 }
  });

  let sourcePath = options.sourcePath ? resolve(options.sourcePath) : null;
  let temporaryDirectory = null;
  try {
    if (!sourcePath) {
      temporaryDirectory = await mkdtemp(resolve(tmpdir(), "cochonnet-sky-"));
      sourcePath = resolve(temporaryDirectory, "qwantani-night-puresky-official-8k.jpg");
      await downloadOfficialSource(sourcePath);
    }
    await verifyFile(sourcePath, {
      label: "Official Poly Haven source",
      bytes: OBSERVATORY_SKY_SOURCE_BYTES,
      digests: {
        md5: OBSERVATORY_SKY_SOURCE_MD5,
        sha256: OBSERVATORY_SKY_SOURCE_SHA256
      }
    });
    await buildObservatorySkyHighTexture({
      sharp,
      sourcePath,
      mediumPath,
      outputPath: highPath
    });
    const metadata = await createMetadata({
      sourcePath,
      mediumPath,
      highPath,
      sharp
    });
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    return { highPath, metadataPath, metadata };
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  let options;
  try {
    options = parseObservatorySkyBuildArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n`);
    printUsage();
    process.exitCode = 1;
  }
  if (options?.help) {
    printUsage();
  } else if (options) {
    buildObservatorySkyTextures(options)
      .then(({ metadata }) => {
        const high = metadata.tiers.high;
        process.stdout.write(
          `Built ${high.filename} (${high.width}x${high.height}, ${high.bytes} bytes, SHA-256 ${high.sha256})\n`
        );
      })
      .catch((error) => {
        process.stderr.write(`${error.stack ?? error.message}\n`);
        process.exitCode = 1;
      });
  }
}
