import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  equatorialToUnitVector,
  GAIA_STAR_CATALOG_MAGIC,
  GAIA_STAR_CATALOG_VERSION,
  GAIA_STAR_FORMAT_FLAGS,
  GAIA_STAR_HEADER_BYTES,
  GAIA_STAR_LOD_COUNTS,
  GAIA_STAR_RECORD_BYTES
} from "../src/villa-map/gaia-stars.js";

export const GAIA_TAP_ENDPOINT = "https://gea.esac.esa.int/tap-server/tap/sync";
export const GAIA_CATALOG_LIMIT = GAIA_STAR_LOD_COUNTS.high;
export const GAIA_DATA_MODEL_URL =
  "https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html";
export const GAIA_CREDIT_URL =
  "https://gea.esac.esa.int/archive/documentation/GDR3/Miscellaneous/sec_credit_and_citation_instructions/";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const DEFAULT_OUTPUT_DIRECTORY = resolve(REPOSITORY_ROOT, "public", "data");
const BINARY_FILENAME = "gaia-bright-stars-v1.bin";
const META_FILENAME = "gaia-bright-stars-v1.meta.json";
const MAX_RAW_BINARY_BYTES = 2_000_000;
const MILLIMAGNITUDE_SCALE = 1_000;

export function createGaiaAdqlQuery(limit = GAIA_CATALOG_LIMIT) {
  if (!Number.isInteger(limit) || limit < 1 || limit > GAIA_CATALOG_LIMIT) {
    throw new RangeError(`Gaia catalogue limit must be between 1 and ${GAIA_CATALOG_LIMIT}`);
  }
  return `SELECT TOP ${limit}
  source_id,
  ra,
  dec,
  phot_g_mean_mag,
  bp_rp
FROM gaiadr3.gaia_source
WHERE ra IS NOT NULL
  AND dec IS NOT NULL
  AND phot_g_mean_mag IS NOT NULL
  AND bp_rp IS NOT NULL
ORDER BY phot_g_mean_mag ASC, source_id ASC`;
}

function parseCsvRecord(line) {
  const fields = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (quoted) throw new Error("Unterminated quoted field in Gaia CSV response");
  fields.push(current);
  return fields;
}

export function parseGaiaCsv(csvText, expectedCount = null) {
  const lines = String(csvText)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error("Gaia TAP response contains no catalogue rows");

  const headers = parseCsvRecord(lines[0]).map((header) => header.trim());
  const requiredHeaders = [
    "source_id",
    "ra",
    "dec",
    "phot_g_mean_mag",
    "bp_rp"
  ];
  const fieldIndex = Object.fromEntries(
    requiredHeaders.map((header) => [header, headers.indexOf(header)])
  );
  for (const header of requiredHeaders) {
    if (fieldIndex[header] < 0) throw new Error(`Gaia TAP response is missing ${header}`);
  }

  const seenSourceIds = new Set();
  const stars = lines.slice(1).map((line, rowIndex) => {
    const fields = parseCsvRecord(line);
    const sourceIdText = fields[fieldIndex.source_id]?.trim();
    if (!/^\d+$/.test(sourceIdText ?? "")) {
      throw new Error(`Invalid Gaia source_id on CSV row ${rowIndex + 2}`);
    }
    if (seenSourceIds.has(sourceIdText)) {
      throw new Error(`Duplicate Gaia source_id in TAP response: ${sourceIdText}`);
    }
    seenSourceIds.add(sourceIdText);

    const sourceId = BigInt(sourceIdText);
    const ra = Number(fields[fieldIndex.ra]);
    const dec = Number(fields[fieldIndex.dec]);
    const magnitude = Number(fields[fieldIndex.phot_g_mean_mag]);
    const bpRp = Number(fields[fieldIndex.bp_rp]);
    if (!Number.isFinite(ra) || ra < 0 || ra >= 360) {
      throw new Error(`Invalid Gaia RA on CSV row ${rowIndex + 2}`);
    }
    if (!Number.isFinite(dec) || dec < -90 || dec > 90) {
      throw new Error(`Invalid Gaia declination on CSV row ${rowIndex + 2}`);
    }
    if (!Number.isFinite(magnitude) || !Number.isFinite(bpRp)) {
      throw new Error(`Missing Gaia photometry on CSV row ${rowIndex + 2}`);
    }

    return { sourceId, ra, dec, magnitude, bpRp };
  });

  stars.sort((first, second) => {
    const magnitudeOrder = first.magnitude - second.magnitude;
    if (magnitudeOrder !== 0) return magnitudeOrder;
    return first.sourceId < second.sourceId ? -1 : first.sourceId > second.sourceId ? 1 : 0;
  });
  if (expectedCount !== null && stars.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} Gaia sources but the TAP response contained ${stars.length}`
    );
  }
  return stars;
}

function encodeMillimagnitudes(value, label) {
  const encoded = Math.round(value * MILLIMAGNITUDE_SCALE);
  if (encoded < -32_768 || encoded > 32_767) {
    throw new RangeError(`${label} ${value} is outside the binary format range`);
  }
  return encoded;
}

function writeUint64(view, offset, value) {
  view.setUint32(offset, Number(value & 0xffff_ffffn), true);
  view.setUint32(offset + 4, Number(value >> 32n), true);
}

export function buildGaiaCatalogBinary(stars) {
  if (!Array.isArray(stars) || stars.length < 1 || stars.length > GAIA_CATALOG_LIMIT) {
    throw new RangeError(`Gaia binary requires 1-${GAIA_CATALOG_LIMIT} validated stars`);
  }
  const lodCounts = {
    low: Math.min(GAIA_STAR_LOD_COUNTS.low, stars.length),
    medium: Math.min(GAIA_STAR_LOD_COUNTS.medium, stars.length),
    high: stars.length
  };
  const binary = new ArrayBuffer(
    GAIA_STAR_HEADER_BYTES + stars.length * GAIA_STAR_RECORD_BYTES
  );
  const view = new DataView(binary);
  for (let index = 0; index < GAIA_STAR_CATALOG_MAGIC.length; index += 1) {
    view.setUint8(index, GAIA_STAR_CATALOG_MAGIC.charCodeAt(index));
  }
  view.setUint16(8, GAIA_STAR_CATALOG_VERSION, true);
  view.setUint16(10, GAIA_STAR_HEADER_BYTES, true);
  view.setUint16(12, GAIA_STAR_RECORD_BYTES, true);
  view.setUint16(14, GAIA_STAR_FORMAT_FLAGS, true);
  view.setUint32(16, stars.length, true);
  view.setUint32(20, lodCounts.low, true);
  view.setUint32(24, lodCounts.medium, true);
  view.setUint32(28, lodCounts.high, true);

  for (let index = 0; index < stars.length; index += 1) {
    const star = stars[index];
    const offset = GAIA_STAR_HEADER_BYTES + index * GAIA_STAR_RECORD_BYTES;
    const [x, y, z] = equatorialToUnitVector(star.ra, star.dec);
    writeUint64(view, offset, star.sourceId);
    view.setFloat32(offset + 8, x, true);
    view.setFloat32(offset + 12, y, true);
    // The frozen v1 record layout stores the LEGACY MIRRORED z component
    // (+cos(dec)sin(ra)). equatorialToUnitVector now returns the corrected
    // render-space z (east toward -z), so negate while encoding; the decoder
    // negates again on read. encode -> decode therefore stays an exact
    // identity and regeneration reproduces the shipped bytes.
    view.setFloat32(offset + 16, -z, true);
    view.setInt16(
      offset + 20,
      encodeMillimagnitudes(star.magnitude, "Gaia G magnitude"),
      true
    );
    view.setInt16(
      offset + 22,
      encodeMillimagnitudes(star.bpRp, "Gaia BP-RP colour"),
      true
    );
  }

  if (binary.byteLength > MAX_RAW_BINARY_BYTES) {
    throw new RangeError(
      `Gaia binary is ${binary.byteLength} bytes; limit is ${MAX_RAW_BINARY_BYTES}`
    );
  }
  return { binary, lodCounts };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildGaiaMetadata({ stars, binary, lodCounts, query, generatedAt }) {
  const magnitudes = stars.map((star) => star.magnitude);
  const colours = stars.map((star) => star.bpRp);
  const binaryBytes = Buffer.from(binary);
  return {
    schemaVersion: 1,
    id: "gaia-bright-stars-v1",
    generatedAt,
    source: {
      organisation: "European Space Agency (ESA)",
      mission: "Gaia",
      dataRelease: "Gaia Data Release 3 (Gaia DR3)",
      archiveTable: "gaiadr3.gaia_source",
      tapEndpoint: GAIA_TAP_ENDPOINT,
      responseFormat: "CSV",
      adqlQuery: query,
      adqlQuerySha256: sha256(query),
      fields: {
        source_id: "Gaia DR3 source identifier",
        ra: "ICRS right ascension in degrees at reference epoch J2016.0",
        dec: "ICRS declination in degrees at reference epoch J2016.0",
        phot_g_mean_mag: "Mean Gaia G-band magnitude on the Vega scale",
        bp_rp: "Gaia BP-RP colour in magnitudes"
      },
      dataModelUrl: GAIA_DATA_MODEL_URL,
      selection:
        `The first ${stars.length.toLocaleString("en-US")} Gaia DR3 sources with finite RA, Dec, mean G magnitude, and BP-RP colour after sorting by ascending G magnitude and then source_id.`,
      completenessCaveat:
        "This is a rendering-oriented Gaia subset, not a complete traditional bright-star catalogue. Gaia DR3 omits or lacks complete BP/RP photometry for some of the brightest naked-eye stars, so familiar objects such as Sirius are not guaranteed to be present. No synthetic or random stars are stored in this file."
    },
    catalogue: {
      sourceCount: stars.length,
      ordering: "phot_g_mean_mag ascending, source_id ascending",
      coordinateFrame: "ICRS",
      referenceEpoch: "J2016.0",
      lodCounts,
      magnitudeRange: [Math.min(...magnitudes), Math.max(...magnitudes)],
      bpRpRange: [Math.min(...colours), Math.max(...colours)]
    },
    binary: {
      filename: BINARY_FILENAME,
      magic: GAIA_STAR_CATALOG_MAGIC,
      formatVersion: GAIA_STAR_CATALOG_VERSION,
      endianness: "little",
      headerBytes: GAIA_STAR_HEADER_BYTES,
      recordBytes: GAIA_STAR_RECORD_BYTES,
      byteLength: binary.byteLength,
      sha256: sha256(binaryBytes),
      recordLayout: [
        "source_id uint64",
        "ICRS unit vector x float32",
        "ICRS unit vector y float32",
        "ICRS unit vector z float32",
        "phot_g_mean_mag int16 millimagnitudes",
        "bp_rp int16 millimagnitudes"
      ]
    },
    attribution: {
      credit: "ESA/Gaia/DPAC",
      usage:
        "Gaia data are open and free to use provided that ESA/Gaia/DPAC is credited; consult the official Gaia DR3 credit and citation instructions.",
      officialCreditUrl: GAIA_CREDIT_URL,
      acknowledgement:
        "This work has made use of data from the European Space Agency (ESA) mission Gaia (https://www.cosmos.esa.int/gaia), processed by the Gaia Data Processing and Analysis Consortium (DPAC, https://www.cosmos.esa.int/web/gaia/dpac/consortium). Funding for the DPAC has been provided by national institutions, in particular the institutions participating in the Gaia Multilateral Agreement."
    },
    regeneration: {
      script: "scripts/build-gaia-star-catalog.mjs",
      command: "node scripts/build-gaia-star-catalog.mjs",
      offlineCommand:
        "node scripts/build-gaia-star-catalog.mjs --input path/to/esa-tap-response.csv"
    }
  };
}

async function fetchGaiaCsv(query, limit) {
  const url = new URL(GAIA_TAP_ENDPOINT);
  for (const [key, value] of Object.entries({
    REQUEST: "doQuery",
    LANG: "ADQL",
    FORMAT: "csv",
    MAXREC: String(limit),
    RUNID: "cochonnet-villa-gaia-bright-stars-v1",
    QUERY: query
  })) {
    url.searchParams.set(key, value);
  }

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "text/csv" },
        signal: AbortSignal.timeout(10 * 60 * 1_000)
      });
      if (!response.ok) {
        throw new Error(`ESA Gaia TAP returned ${response.status} ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 2_000));
      }
    }
  }
  throw lastError;
}

function parseArguments(argv) {
  const options = {
    input: null,
    outputDirectory: DEFAULT_OUTPUT_DIRECTORY,
    limit: GAIA_CATALOG_LIMIT
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") options.input = resolve(argv[++index]);
    else if (argument === "--output-dir") options.outputDirectory = resolve(argv[++index]);
    else if (argument === "--limit") options.limit = Number(argv[++index]);
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printUsage() {
  process.stdout.write(`Build the rendering-oriented Gaia DR3 bright-star subset.\n\n`);
  process.stdout.write(`  node scripts/build-gaia-star-catalog.mjs\n`);
  process.stdout.write(`  node scripts/build-gaia-star-catalog.mjs --input esa-response.csv\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --input <csv>       Rebuild offline from a saved official TAP CSV response\n`);
  process.stdout.write(`  --output-dir <dir>  Override public/data output directory\n`);
  process.stdout.write(`  --limit <count>     Build a smaller test catalogue (maximum 80000)\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    printUsage();
    return;
  }
  const query = createGaiaAdqlQuery(options.limit);
  process.stdout.write(
    options.input
      ? `Reading saved ESA Gaia TAP response: ${options.input}\n`
      : `Querying ESA Gaia Archive for ${options.limit.toLocaleString("en-US")} sources...\n`
  );
  const csv = options.input
    ? await readFile(options.input, "utf8")
    : await fetchGaiaCsv(query, options.limit);
  const stars = parseGaiaCsv(csv, options.limit);
  const { binary, lodCounts } = buildGaiaCatalogBinary(stars);
  const metadata = buildGaiaMetadata({
    stars,
    binary,
    lodCounts,
    query,
    generatedAt: new Date().toISOString()
  });

  await mkdir(options.outputDirectory, { recursive: true });
  const binaryPath = resolve(options.outputDirectory, BINARY_FILENAME);
  const metadataPath = resolve(options.outputDirectory, META_FILENAME);
  await writeFile(binaryPath, Buffer.from(binary));
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Wrote ${stars.length.toLocaleString("en-US")} real Gaia DR3 sources `
      + `(${binary.byteLength.toLocaleString("en-US")} bytes).\n`
  );
  process.stdout.write(`${binaryPath}\n${metadataPath}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
