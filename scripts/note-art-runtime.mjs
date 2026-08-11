import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);
const WEBP_CHUNK_TYPES = new Set(["VP8 ", "VP8L", "VP8X"]);

export function parseBoundedPositiveInteger(
  value,
  { name = "value", fallback, maximum = Number.MAX_SAFE_INTEGER } = {}
) {
  const source = value === undefined || value === null || value === "" ? fallback : value;
  const parsed = Number(source);

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}; received ${source}`);
  }

  return parsed;
}

export function assertValidWebp(value, { expectedSize = "" } = {}) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value ?? []);

  if (bytes.length < 20) {
    throw new Error(`generated WebP is too short (${bytes.length} bytes)`);
  }

  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("generated image is not a RIFF/WEBP file");
  }

  const declaredLength = bytes.readUInt32LE(4) + 8;
  if (declaredLength !== bytes.length) {
    throw new Error(
      `generated WebP length mismatch (header ${declaredLength}, actual ${bytes.length})`
    );
  }

  let offset = 12;
  let canvasDimensions = null;
  let bitstreamDimensions = null;

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) {
      throw new Error("generated WebP has a truncated chunk header");
    }

    const chunkType = bytes.toString("ascii", offset, offset + 4);
    const chunkLength = bytes.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;
    const nextOffset = payloadOffset + chunkLength + (chunkLength % 2);

    if (nextOffset > bytes.length) {
      throw new Error(`generated WebP ${JSON.stringify(chunkType)} chunk is truncated`);
    }

    if (WEBP_CHUNK_TYPES.has(chunkType)) {
      const chunkDimensions = readWebpChunkDimensions(
        bytes,
        chunkType,
        payloadOffset,
        chunkLength
      );
      if (chunkType === "VP8X") {
        canvasDimensions ??= chunkDimensions;
      } else {
        bitstreamDimensions ??= chunkDimensions;
      }
    }

    offset = nextOffset;
  }

  if (offset !== bytes.length) {
    throw new Error("generated WebP chunk padding exceeds the RIFF payload");
  }

  if (!bitstreamDimensions) {
    throw new Error("generated WebP contains no supported VP8 image bitstream");
  }

  const dimensions = canvasDimensions ?? bitstreamDimensions;
  const expected = /^(\d+)x(\d+)$/i.exec(String(expectedSize).trim());
  if (
    expected &&
    (dimensions.width !== Number(expected[1]) || dimensions.height !== Number(expected[2]))
  ) {
    throw new Error(
      `generated WebP dimensions ${dimensions.width}x${dimensions.height} do not match requested ${expected[1]}x${expected[2]}`
    );
  }

  return bytes;
}

function readWebpChunkDimensions(bytes, chunkType, payloadOffset, chunkLength) {
  let width;
  let height;

  if (chunkType === "VP8 ") {
    if (
      chunkLength < 10 ||
      bytes[payloadOffset + 3] !== 0x9d ||
      bytes[payloadOffset + 4] !== 0x01 ||
      bytes[payloadOffset + 5] !== 0x2a
    ) {
      throw new Error("generated WebP has an invalid VP8 frame header");
    }

    width = bytes.readUInt16LE(payloadOffset + 6) & 0x3fff;
    height = bytes.readUInt16LE(payloadOffset + 8) & 0x3fff;
  } else if (chunkType === "VP8L") {
    if (chunkLength < 5 || bytes[payloadOffset] !== 0x2f) {
      throw new Error("generated WebP has an invalid VP8L frame header");
    }

    width = 1 + bytes[payloadOffset + 1] + ((bytes[payloadOffset + 2] & 0x3f) << 8);
    height =
      1 +
      ((bytes[payloadOffset + 2] & 0xc0) >> 6) +
      (bytes[payloadOffset + 3] << 2) +
      ((bytes[payloadOffset + 4] & 0x0f) << 10);
  } else {
    if (chunkLength < 10) {
      throw new Error("generated WebP has a truncated VP8X frame header");
    }

    width = 1 + bytes.readUIntLE(payloadOffset + 4, 3);
    height = 1 + bytes.readUIntLE(payloadOffset + 7, 3);
  }

  if (width < 1 || height < 1) {
    throw new Error(`generated WebP has invalid dimensions ${width}x${height}`);
  }

  return { width, height };
}

export function decodeBase64Webp(value, options) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("images API returned no b64_json");
  }

  const encoded = value.replace(/\s+/g, "");
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("images API returned malformed base64 image data");
  }

  return assertValidWebp(Buffer.from(encoded, "base64"), options);
}

function retryDelayMilliseconds(response, attempt) {
  const retryAfter = response?.headers?.get?.("retry-after");
  if (typeof retryAfter === "string" && retryAfter.trim()) {
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.min(retryAfterSeconds * 1_000, 30_000);
    }

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.min(Math.max(0, retryAt - Date.now()), 30_000);
    }
  }

  return Math.min(1_000 * 2 ** (attempt - 1), 8_000);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableStatus(status) {
  return RETRYABLE_HTTP_STATUSES.has(status) || (status >= 500 && status <= 599);
}

export async function requestGeneratedWebp({
  apiUrl,
  apiKey,
  model,
  prompt,
  quality,
  size,
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
  timeoutMs = 300_000,
  maximumAttempts = 2,
  logger = console
}) {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const clientRequestId = randomUUID();

    try {
      let response;
      try {
        response = await fetchImpl(apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-Client-Request-Id": clientRequestId
          },
          body: JSON.stringify({
            model,
            prompt,
            size,
            quality,
            output_format: "webp",
            output_compression: 85,
            n: 1
          }),
          signal: controller.signal
        });
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));

        if (controller.signal.aborted) {
          throw new Error(
            `images API timed out after ${timeoutMs}ms (client request ${clientRequestId})`,
            { cause: normalized }
          );
        }

        // A rejected fetch can still mean the paid request reached the server
        // and only the response was lost. Without a documented idempotency
        // contract, retrying here could silently charge for a duplicate.
        throw new Error(
          `images API network failure (client request ${clientRequestId}): ${normalized.message}`,
          { cause: normalized }
        );
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const requestId = response.headers?.get?.("x-request-id");
        const suffix = requestId ? ` (request ${requestId})` : "";
        const error = new Error(`images API ${response.status}${suffix}: ${detail.slice(0, 300)}`);

        if (attempt < maximumAttempts && isRetryableStatus(response.status)) {
          const delay = retryDelayMilliseconds(response, attempt);
          logger.warn(
            `Transient images API ${response.status}; retrying in ${delay}ms (${attempt}/${maximumAttempts}).`
          );
          await sleepImpl(delay);
          continue;
        }

        throw error;
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(`images API timed out after ${timeoutMs}ms`);
        }

        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`images API returned invalid JSON: ${detail}`);
      }

      // Once a paid 2xx response exists, malformed JSON or image bytes are
      // surfaced directly. Retrying those could silently charge twice.
      return decodeBase64Webp(payload?.data?.[0]?.b64_json, { expectedSize: size });
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("images API request failed without an attempt");
}

export async function writeFileAtomically(filePath, contents) {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`
  );

  await mkdir(directory, { recursive: true });

  try {
    await writeFile(temporaryPath, contents);
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}
