import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  assertValidWebp,
  decodeBase64Webp,
  parseBoundedPositiveInteger,
  requestGeneratedWebp,
  writeFileAtomically
} from "../scripts/note-art-runtime.mjs";
import {
  deriveRunStatus,
  generateNoteArtBatch,
  pickPendingNotes,
  reconcileConfiguredArt,
  runNoteArt,
  writeRunReport,
  validateNotesDocument
} from "../scripts/generate-note-art.mjs";

const VALID_WEBP_FIXTURES = Object.freeze({
  "1x1": "UklGRhwAAABXRUJQVlA4TBAAAAAvAAAAAAdQwP5H/wMR0f8A",
  "2x3": "UklGRhwAAABXRUJQVlA4TBAAAAAvAYAAAAdQwP5H/wMR0f8A"
});

function validWebp(size = "2x3") {
  return Buffer.from(VALID_WEBP_FIXTURES[size], "base64");
}

function response({ status = 200, body = "", json, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] ?? null;
      }
    },
    async text() {
      return body;
    },
    async json() {
      return json;
    }
  };
}

const quietLogger = Object.freeze({
  log() {},
  warn() {},
  error() {}
});

test("positive integer configuration rejects zero, fractions, and runaway batches", () => {
  assert.equal(
    parseBoundedPositiveInteger(undefined, { name: "LIMIT", fallback: 4, maximum: 20 }),
    4
  );
  assert.equal(parseBoundedPositiveInteger("7", { name: "LIMIT", fallback: 4, maximum: 20 }), 7);
  assert.throws(
    () => parseBoundedPositiveInteger("0", { name: "LIMIT", fallback: 4, maximum: 20 }),
    /LIMIT must be an integer/
  );
  assert.throws(
    () => parseBoundedPositiveInteger("1.5", { name: "LIMIT", fallback: 4, maximum: 20 }),
    /LIMIT must be an integer/
  );
  assert.throws(
    () => parseBoundedPositiveInteger("21", { name: "LIMIT", fallback: 4, maximum: 20 }),
    /LIMIT must be an integer/
  );
});

test("generated image data must be strict base64 with a complete RIFF/WEBP payload", () => {
  const webp = validWebp();
  assert.deepEqual(assertValidWebp(webp), webp);
  assert.deepEqual(decodeBase64Webp(webp.toString("base64")), webp);
  assert.deepEqual(decodeBase64Webp(webp.toString("base64"), { expectedSize: "2x3" }), webp);
  assert.throws(
    () => decodeBase64Webp(webp.toString("base64"), { expectedSize: "1x1" }),
    /do not match requested/
  );

  assert.throws(() => decodeBase64Webp("!!!="), /malformed base64/);
  assert.throws(() => decodeBase64Webp(Buffer.from("not a webp").toString("base64")), /too short/);

  const truncated = Buffer.from(webp);
  truncated.writeUInt32LE(100, 4);
  assert.throws(() => assertValidWebp(truncated), /length mismatch/);

  const truncatedChunk = Buffer.from(webp);
  truncatedChunk.writeUInt32LE(100, 16);
  assert.throws(() => assertValidWebp(truncatedChunk), /chunk is truncated/);

  const invalidFrame = Buffer.from(webp);
  invalidFrame[20] = 0;
  assert.throws(() => assertValidWebp(invalidFrame), /invalid VP8L frame header/);

  const containerOnly = Buffer.alloc(30);
  containerOnly.write("RIFF", 0, "ascii");
  containerOnly.writeUInt32LE(containerOnly.length - 8, 4);
  containerOnly.write("WEBP", 8, "ascii");
  containerOnly.write("VP8X", 12, "ascii");
  containerOnly.writeUInt32LE(10, 16);
  assert.throws(() => assertValidWebp(containerOnly), /no supported VP8 image bitstream/);
});

test("the image request retries one transient response and returns validated WebP", async () => {
  const webp = validWebp();
  const requests = [];
  const sleeps = [];

  const result = await requestGeneratedWebp({
    apiUrl: "https://example.test/images",
    apiKey: "test-key",
    model: "test-model",
    prompt: "piglet",
    quality: "medium",
    size: "2x3",
    maximumAttempts: 2,
    timeoutMs: 1_000,
    logger: quietLogger,
    sleepImpl: async (milliseconds) => sleeps.push(milliseconds),
    fetchImpl: async (_url, options) => {
      requests.push(options);
      return requests.length === 1
        ? response({ status: 429, body: "slow down", headers: { "retry-after": "0" } })
        : response({ json: { data: [{ b64_json: webp.toString("base64") }] } });
    }
  });

  assert.deepEqual(result, webp);
  assert.equal(requests.length, 2);
  assert.deepEqual(sleeps, [0]);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].headers.Authorization, "Bearer test-key");
  assert.match(requests[0].headers["X-Client-Request-Id"], /^[0-9a-f-]{36}$/);
  assert.ok(requests[0].signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(requests[0].body), {
    model: "test-model",
    prompt: "piglet",
    size: "2x3",
    quality: "medium",
    output_format: "webp",
    output_compression: 85,
    n: 1
  });
});

test("transient responses without Retry-After use bounded exponential backoff", async () => {
  const webp = validWebp();
  const sleeps = [];
  let requests = 0;

  await requestGeneratedWebp({
    apiUrl: "https://example.test/images",
    apiKey: "test-key",
    model: "test-model",
    prompt: "piglet",
    quality: "medium",
    size: "2x3",
    maximumAttempts: 2,
    timeoutMs: 1_000,
    logger: quietLogger,
    sleepImpl: async (milliseconds) => sleeps.push(milliseconds),
    fetchImpl: async () => {
      requests += 1;
      return requests === 1
        ? response({ status: 503, body: "try again" })
        : response({ json: { data: [{ b64_json: webp.toString("base64") }] } });
    }
  });

  assert.deepEqual(sleeps, [1_000]);
});

test("an ambiguous network failure is not retried without server idempotency", async () => {
  const sleeps = [];
  let requests = 0;

  await assert.rejects(
    requestGeneratedWebp({
      apiUrl: "https://example.test/images",
      apiKey: "test-key",
      model: "test-model",
      prompt: "piglet",
      quality: "medium",
      size: "2x3",
      maximumAttempts: 2,
      timeoutMs: 1_000,
      logger: quietLogger,
      sleepImpl: async (milliseconds) => sleeps.push(milliseconds),
      fetchImpl: async () => {
        requests += 1;
        throw new TypeError("fetch failed");
      }
    }),
    /images API network failure \(client request [0-9a-f-]{36}\): fetch failed/
  );

  assert.equal(requests, 1);
  assert.deepEqual(sleeps, []);
});

test("an invalid paid 2xx image fails without issuing a duplicate request", async () => {
  let requests = 0;

  await assert.rejects(
    requestGeneratedWebp({
      apiUrl: "https://example.test/images",
      apiKey: "test-key",
      model: "test-model",
      prompt: "piglet",
      quality: "medium",
      size: "2x3",
      maximumAttempts: 2,
      timeoutMs: 1_000,
      logger: quietLogger,
      sleepImpl: async () => {},
      fetchImpl: async () => {
        requests += 1;
        return response({
          json: { data: [{ b64_json: validWebp("1x1").toString("base64") }] }
        });
      }
    }),
    /do not match requested 2x3/
  );

  assert.equal(requests, 1);
});

test("the image request does not retry permanent authentication failures", async () => {
  let requests = 0;

  await assert.rejects(
    requestGeneratedWebp({
      apiUrl: "https://example.test/images",
      apiKey: "bad-key",
      model: "test-model",
      prompt: "piglet",
      quality: "medium",
      size: "2x3",
      maximumAttempts: 2,
      timeoutMs: 1_000,
      logger: quietLogger,
      sleepImpl: async () => {},
      fetchImpl: async () => {
        requests += 1;
        return response({ status: 401, body: "bad key", headers: { "x-request-id": "req_123" } });
      }
    }),
    /images API 401 \(request req_123\)/
  );

  assert.equal(requests, 1);
});

test("an elapsed paid generation times out once instead of risking a duplicate charge", async () => {
  let requests = 0;

  await assert.rejects(
    requestGeneratedWebp({
      apiUrl: "https://example.test/images",
      apiKey: "test-key",
      model: "test-model",
      prompt: "piglet",
      quality: "medium",
      size: "2x3",
      maximumAttempts: 2,
      timeoutMs: 5,
      logger: quietLogger,
      sleepImpl: async () => {},
      fetchImpl: async (_url, { signal }) => {
        requests += 1;
        await new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }
    }),
    /images API timed out after 5ms \(client request [0-9a-f-]{36}\)/
  );

  assert.equal(requests, 1);
});

test("atomic writes replace the destination only after the temporary file is complete", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cochonnet-note-art-"));
  const target = path.join(directory, "note.webp");

  try {
    await writeFileAtomically(target, validWebp());
    assert.deepEqual(await readFile(target), validWebp());

    const replacement = validWebp("1x1");
    await writeFileAtomically(target, replacement);
    assert.deepEqual(await readFile(target), replacement);
    assert.deepEqual(await readdir(directory), ["note.webp"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("partial batches retain successes and report every failed slug", async () => {
  const notes = [
    { title: "成功", date: "2026-08-11", body: "正文" },
    { title: "失败", date: "2026-08-12", body: "正文" }
  ];
  const batch = pickPendingNotes(notes);
  const writes = [];
  let requestIndex = 0;

  const result = await generateNoteArtBatch(batch, "test-key", {
    size: "2x3",
    logger: quietLogger,
    warning() {},
    requestImage: async () => {
      requestIndex += 1;
      if (requestIndex === 2) throw new Error("simulated outage");
      return validWebp();
    },
    writeImage: async (filePath, bytes) => writes.push({ filePath, bytes })
  });

  assert.deepEqual(result.generated, ["2026-08-11"]);
  assert.deepEqual(result.failures, [{ slug: "2026-08-12", message: "simulated outage" }]);
  assert.equal(writes.length, 1);
  assert.equal(notes[0].image, "/notes-art/2026-08-11.webp");
  assert.equal(notes[1].image, undefined);
});

test("batch status queues progress but stops retry loops when nothing succeeded", () => {
  assert.deepEqual(
    deriveRunStatus({ pendingCount: 5, generatedCount: 4 }),
    { remainingCount: 1, needsFollowup: true }
  );
  assert.deepEqual(
    deriveRunStatus({ pendingCount: 2, generatedCount: 1 }),
    { remainingCount: 1, needsFollowup: true }
  );
  assert.deepEqual(
    deriveRunStatus({ pendingCount: 2, generatedCount: 0 }),
    { remainingCount: 2, needsFollowup: false }
  );
});

test("invalid image fields and broken local art are selected for regeneration", async () => {
  const notes = [
    { title: "unsafe", date: "2026-08-11", body: "a", image: "javascript:alert(1)" },
    { title: "missing", date: "2026-08-12", body: "b", image: "/notes-art/missing.webp" },
    { title: "external", date: "2026-08-13", body: "c", image: "https://example.com/art.webp" },
    { title: "valid", date: "2026-08-14", body: "d", image: "/notes-art/valid.webp" }
  ];
  const warnings = [];

  const changed = await reconcileConfiguredArt(notes, {
    warning: (message) => warnings.push(message),
    readImage: async (filePath) => {
      if (filePath.endsWith("valid.webp")) return validWebp();
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    }
  });

  assert.equal(changed, true);
  assert.deepEqual(
    pickPendingNotes(notes).map(({ slug }) => slug),
    ["2026-08-11", "2026-08-12"]
  );
  assert.equal(notes[2].image, "https://example.com/art.webp");
  assert.equal(notes[3].image, "/notes-art/valid.webp");
  assert.equal(warnings.length, 2);
});

test("malformed notes documents fail instead of pretending every note has art", () => {
  assert.throws(() => validateNotesDocument({}), /top-level notes array/);
  assert.throws(() => validateNotesDocument({ notes: {} }), /top-level notes array/);
  assert.deepEqual(validateNotesDocument({ notes: [] }), { notes: [] });
});

function missingImage() {
  const error = new Error("missing");
  error.code = "ENOENT";
  throw error;
}

function pendingDocument(count) {
  return {
    notes: Array.from({ length: count }, (_value, index) => ({
      title: `Note ${index + 1}`,
      date: `2026-09-${String(index + 1).padStart(2, "0")}`,
      body: "Piglet story"
    }))
  };
}

test("the run state persists partial progress, reports it, and requests a follow-up", async () => {
  const data = pendingDocument(2);
  const writes = [];
  let requestIndex = 0;
  const result = await runNoteArt({
    data,
    apiKey: "test-key",
    expectedSize: "2x3",
    readImage: async () => missingImage(),
    requestImage: async () => {
      requestIndex += 1;
      if (requestIndex === 2) throw new Error("simulated outage");
      return validWebp();
    },
    writeImage: async (filePath) => writes.push(filePath),
    logger: quietLogger,
    warning() {}
  });

  assert.equal(result.generatedCount, 1);
  assert.equal(result.failed.length, 1);
  assert.equal(result.hasChanges, true);
  assert.equal(result.remainingCount, 1);
  assert.equal(result.needsFollowup, true);
  assert.equal(result.fatalError, null);
  assert.equal(writes.length, 1);
  assert.equal(data.notes[0].image, "/notes-art/2026-09-01.webp");
  assert.equal(data.notes[1].image, undefined);

  const directory = await mkdtemp(path.join(tmpdir(), "cochonnet-note-report-"));
  const outputPath = path.join(directory, "output.txt");
  const summaryPath = path.join(directory, "summary.md");
  try {
    await writeRunReport(result, { outputPath, summaryPath });
    const output = await readFile(outputPath, "utf8");
    const summary = await readFile(summaryPath, "utf8");
    assert.match(output, /^generated_count=1$/m);
    assert.match(output, /^failed_count=1$/m);
    assert.match(output, /^has_changes=true$/m);
    assert.match(output, /^needs_followup=true$/m);
    assert.match(summary, /2026-09-02/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the run state caps a five-note backlog at four and queues the remainder", async () => {
  const data = pendingDocument(5);
  let requests = 0;
  const result = await runNoteArt({
    data,
    apiKey: "test-key",
    maxPerRun: 4,
    expectedSize: "2x3",
    readImage: async () => missingImage(),
    requestImage: async () => {
      requests += 1;
      return validWebp();
    },
    writeImage: async () => {},
    logger: quietLogger,
    warning() {}
  });

  assert.equal(requests, 4);
  assert.equal(result.attemptedCount, 4);
  assert.equal(result.generatedCount, 4);
  assert.equal(result.remainingCount, 1);
  assert.equal(result.needsFollowup, true);
  assert.equal(result.failed.length, 0);
});

test("the run state fails visibly when pending art has no API key", async () => {
  const result = await runNoteArt({
    data: pendingDocument(2),
    apiKey: "",
    expectedSize: "2x3",
    readImage: async () => missingImage(),
    logger: quietLogger,
    warning() {}
  });

  assert.equal(result.attemptedCount, 0);
  assert.equal(result.failed.length, 2);
  assert.equal(result.remainingCount, 2);
  assert.equal(result.hasChanges, false);
  assert.equal(result.needsFollowup, false);
  assert.match(result.fatalError?.message ?? "", /OPENAI_API_KEY is required/);
});

test("the run state is a clean no-op when every configured image is healthy", async () => {
  const data = pendingDocument(1);
  data.notes[0].image = "/notes-art/2026-09-01.webp";
  const result = await runNoteArt({
    data,
    expectedSize: "2x3",
    readImage: async () => validWebp(),
    logger: quietLogger,
    warning() {}
  });

  assert.equal(result.selectedCount, 0);
  assert.equal(result.attemptedCount, 0);
  assert.equal(result.hasChanges, false);
  assert.equal(result.remainingCount, 0);
  assert.equal(result.fatalError, null);
});

test("missing art is regenerated instead of reusing an unproven same-slug file", async () => {
  const data = pendingDocument(1);
  let requests = 0;
  const result = await runNoteArt({
    data,
    apiKey: "test-key",
    expectedSize: "2x3",
    readImage: async () => validWebp(),
    requestImage: async () => {
      requests += 1;
      return validWebp();
    },
    writeImage: async () => {},
    logger: quietLogger,
    warning() {}
  });

  assert.equal(requests, 1);
  assert.equal(result.generatedCount, 1);
  assert.equal(data.notes[0].image, "/notes-art/2026-09-01.webp");
});
