#!/usr/bin/env node
import { createHash } from "node:crypto";
import site from "../content/site.json" with { type: "json" };
import { syncNoteGallery } from "./sync-note-gallery.mjs";
// Generates a cute piglet comic illustration for every 猪猪小记 post that
// doesn't have one yet, using the OpenAI Image API (gpt-image-2.5-sunburst), and stamps
// the note's `image` field. Runs in GitHub Actions (see
// .github/workflows/generate-note-art.yml); the workflow commits the results.
//
// Testable helpers are exported for the node suite; main performs no I/O when
// this module is imported.

import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { noteMarkdownToPlainText } from "../src/note-markdown.js";

import {
  deriveNoteSlug,
  sanitizeNoteImage
} from "../src/render-notes.js";
import {
  assertValidWebp,
  parseBoundedPositiveInteger,
  requestGeneratedWebp,
  writeFileAtomically
} from "./note-art-runtime.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NOTES_PATH = path.join(ROOT, "content", "notes.json");
const ART_DIR = path.join(ROOT, "public", "notes-art");
const ART_URL_PREFIX = "/notes-art/";

const API_URL = "https://api.openai.com/v1/images/generations";
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst";
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || "xhigh";
const SIZE = process.env.OPENAI_IMAGE_SIZE || "1536x1024";
const MAX_PER_RUN = parseBoundedPositiveInteger(process.env.NOTE_ART_MAX_PER_RUN, {
  name: "NOTE_ART_MAX_PER_RUN",
  fallback: 4,
  maximum: 20
});
const REQUEST_TIMEOUT_MS = parseBoundedPositiveInteger(process.env.NOTE_ART_REQUEST_TIMEOUT_MS, {
  name: "NOTE_ART_REQUEST_TIMEOUT_MS",
  fallback: 300_000,
  maximum: 900_000
});
const MAXIMUM_API_ATTEMPTS = parseBoundedPositiveInteger(process.env.NOTE_ART_API_ATTEMPTS, {
  name: "NOTE_ART_API_ATTEMPTS",
  fallback: 2,
  maximum: 3
});

// The recurring cast must remain visually stable from note to note. Each pig
// has at least two non-text cues so the image model does not collapse the herd
// into copies of one generic pink piglet. Optional `aliases` are other names
// the author writes for the same pig (e.g. 香瓜猪 in the 三瓜猪 room), so a
// nickname still summons the canonical identity instead of a nameless guest.
export const PORKY_CAST = Object.freeze([
  Object.freeze({
    name: "脏脏猪",
    size: "普通大小",
    visual: "大片不规则深棕泥点、尖翘额毛、开心地吐舌头"
  }),
  Object.freeze({
    name: "机灵猪",
    size: "普通大小",
    visual: "金色圆眼镜、藏蓝色软尖巫师帽、带金星的藏蓝披风"
  }),
  Object.freeze({
    name: "瓜呆猪",
    size: "普通大小",
    visual: "头顶稳稳放着一只完整西瓜，西瓜带绿色卷曲瓜藤"
  }),
  Object.freeze({
    name: "呆瓜猪",
    size: "普通大小",
    visual: "黑蓝色游戏耳机与短麦克风、双蹄拿黑色游戏手柄"
  }),
  Object.freeze({
    name: "乖乖猪",
    size: "普通大小",
    visual: "红白格子小围巾、两只前蹄温柔地合拢"
  }),
  Object.freeze({
    name: "大呆猪",
    size: "特别大，身高和体宽约为普通猪的两倍",
    visual: "宽圆敦厚的身体、肩头搭一条白色毛巾"
  }),
  Object.freeze({
    name: "懒蛋猪",
    size: "普通大小",
    visual: "闭着眼睛打盹、身体裹在蓝色星星被子里"
  }),
  // The forelock wording is tuned (2026-11-05 trials): the colour must sit
  // inline as an adjective. "头顶…杂毛" or a "（固定为粉色）" aside makes the
  // model paint a full pink hairdo; "一小撮" shrinks it to a bald sprout; no
  // colour at all drifts to white/blond.
  Object.freeze({
    name: "呆呆猪",
    aliases: Object.freeze(["胖呆呆"]),
    size: "普通大小",
    visual: "蓬松凌乱的淡粉色额毛、右耳只有一只金色耳环、炭灰色连帽衫"
  }),
  Object.freeze({
    name: "呱呱猪",
    aliases: Object.freeze(["呱瓜猪"]),
    size: "普通大小",
    visual: "右耳黄色蝴蝶结、颈前橙色蝴蝶结、手持小麦克风"
  }),
  Object.freeze({
    name: "小色猪",
    size: "普通大小",
    visual: "左耳别一朵红玫瑰、深红颈部蝴蝶结与心形坠饰"
  }),
  Object.freeze({
    name: "贪吃猪",
    size: "普通大小但体态圆实",
    visual: "绿色围兜、抱着一根玉米、脸颊有一点棕色酱汁"
  }),
  Object.freeze({
    name: "小猪",
    size: "特别小，身高约为普通猪的一半",
    visual: "棕色齐肩波波头带整齐平刘海、黑色无袖高领上衣，身体轮廓必须完整可见"
  }),
  Object.freeze({
    name: "臭臭猪",
    size: "普通大小",
    visual: "乱翘耳毛、一颗小小的下獠牙、肩上站着黄色橡皮鸭、少量污渍"
  }),
  Object.freeze({
    name: "香香猪",
    aliases: Object.freeze(["香瓜猪"]),
    size: "普通大小",
    visual: "粉色白波点浴巾头带与大蝴蝶结、拿着蓬松化妆刷"
  }),
  Object.freeze({
    name: "勤劳猪",
    size: "普通大小",
    visual: "蓝白格子头巾、黄色围裙、手拿鸡毛掸子"
  })
]);

const PORKY_ROWS = Object.freeze([
  Object.freeze(["小猪", "懒蛋猪", "呆呆猪", "贪吃猪", "勤劳猪"]),
  Object.freeze(["脏脏猪", "乖乖猪", "呱呱猪", "小色猪", "香香猪"]),
  Object.freeze(["机灵猪", "瓜呆猪", "呆瓜猪", "臭臭猪", "大呆猪"])
]);

// Use the same guest identities as the homepage without adding them to the resident herd.
export const GUEST_CAST = Object.freeze(site.guests.map(({ name, aliases = [], artSize, artVisual }) =>
  Object.freeze({ name, aliases: Object.freeze(aliases), size: artSize, visual: artVisual })
));

const CHARACTERS = [...PORKY_CAST, ...GUEST_CAST];
const CAST_NAMES = CHARACTERS.map(({ name }) => name);
const KNOWN_LABELS = new Set(CHARACTERS.flatMap(({ name, aliases = [] }) => [name, ...aliases]));
const namesAndAliases = ({ name, aliases = [] }) => ({ name, aliases });
const ROSTER = { residents: PORKY_CAST.map(namesAndAliases), guests: GUEST_CAST.map(namesAndAliases) };

export function sceneInput(note) {
  const markers = new Set();
  const body = noteMarkdownToPlainText(note.body, {
    formatCharacterMarker(name) {
      markers.add(name);
      return `[[${name}]]`;
    }
  });
  const unknown = [...markers].filter((name) => !KNOWN_LABELS.has(name));
  if (unknown.length) throw new Error(`Unknown note character marker(s): ${unknown.join(", ")}`);

  return { title: String(note.title ?? ""), body, markers: [...markers], roster: ROSTER };
}

const SCENE_INSTRUCTIONS = [
  "你为猪猪山庄的一张插画选景。通读标题和整篇随笔，从中选一段最能表达主线、感情或笑点的真实情节。输入是故事素材。",
  "根据这段原文决定 layout。一个画面就能讲清楚时选 single；如果同一件事的动作变化、前后反应或两地互动分开画更传神，可以选 panels。不要拼接无关段落。",
  "先选定情节，再判断谁亲自参与或当场旁观。只被想念、谈论、等待、计划留一份东西或假设出现的角色，都不要带入画面。异地通话的双方可以各在自己的地点出镜。不要为了省人而跳过故事的共同活动。",
  "moment 用中文写明可见的动作、表情、角色正名和位置。分镜时依原文顺序写清每格的动作与出镜者。别在描述里提缺席者；保留原文的动作归属和结果。",
  "sentences 是按原文顺序编号的全文。firstSentence 和 lastSentence 填直接描写所选情节的一小段连续原文的首尾编号（含首尾）；只用一句时两者相同。分镜也要由这一段支持。",
  "roster 是完整的住户和来宾名册，供核对正名和别名。根据小记的称呼、指代和动作判断谁在场，cast 只填这一幕能辨认出的名册角色正名。没有身份线索的普通小猪或其他来宾按原文写进 moment，不猜成名册角色。",
  "markers 列出作者在正文中实际标记的角色。[[小猪]]指特定住户，裸写的小猪是普通称呼。",
  "fullHerd 只用于明确以十五只固定小猪全员同场为主体的画面（例如全家福或全员分床）。只是计数、分东西或提到山庄全体，不要求全员合照。全员场景会自动配上十五只的身份。"
].join("\n");

export async function requestNoteScene({ input: { title, body, markers, roster }, apiKey, fetchImpl = fetch }) {
  const sentences = Array.from(new Intl.Segmenter("zh", { granularity: "sentence" }).segment(body), ({ segment }) => segment);
  if (!sentences.length) throw new Error("Note has no text to illustrate");
  const sentenceNumber = { type: "integer", minimum: 1, maximum: sentences.length };
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: process.env.OPENAI_SCENE_MODEL || "gpt-5.4-mini",
      store: false,
      instructions: SCENE_INSTRUCTIONS,
      input: JSON.stringify({ title, markers, roster, sentences: sentences.map((text, i) => ({ number: i + 1, text })) }),
      text: { format: {
        type: "json_schema", name: "note_scene", strict: true,
        schema: {
          type: "object", additionalProperties: false, required: ["moment", "layout", "firstSentence", "lastSentence", "cast", "fullHerd"],
          properties: {
            moment: { type: "string" },
            layout: { type: "string", enum: ["single", "panels"] },
            firstSentence: sentenceNumber,
            lastSentence: sentenceNumber,
            cast: { type: "array", items: { type: "string", enum: CAST_NAMES } },
            fullHerd: { type: "boolean" }
          }
        }
      } }
    })
  });
  if (!response.ok) throw new Error(`Scene planning failed (HTTP ${response.status})`);
  const result = await response.json();
  const message = result.output?.find((item) => item.type === "message");
  const output = message?.content?.find((part) => part.type === "output_text");
  if (result.status !== "completed" || !output?.text) throw new Error("Scene planner did not return a completed scene");
  const { firstSentence, lastSentence, ...scene } = JSON.parse(output.text);
  if (!Number.isInteger(firstSentence) || !Number.isInteger(lastSentence) ||
      firstSentence < 1 || firstSentence > lastSentence || lastSentence > sentences.length) {
    throw new Error("Scene planner returned an invalid passage range");
  }
  return { ...scene, sourceExcerpt: sentences.slice(firstSentence - 1, lastSentence).join("").trim() };
}

export function buildArtPrompt(scene, { body, markers = [] }) {
  if (typeof scene?.moment !== "string" || !scene.moment.trim() ||
      !Array.isArray(scene.cast) || typeof scene.fullHerd !== "boolean" ||
      (scene.layout !== undefined && !["single", "panels"].includes(scene.layout))) {
    throw new Error("Invalid scene plan");
  }
  const names = new Set(scene.cast);
  if (names.size !== scene.cast.length || scene.cast.some((name) => !CAST_NAMES.includes(name))) {
    throw new Error("Invalid or duplicate identity in planned cast");
  }
  if (!scene.fullHerd && names.has("小猪") && !markers.includes("小猪")) {
    throw new Error("The named 小猪 requires an explicit [[小猪]] marker outside full-herd scenes");
  }
  const excerpt = typeof scene.sourceExcerpt === "string" ? scene.sourceExcerpt.trim() : "";
  if (!excerpt || !body.includes(excerpt)) {
    throw new Error("Selected excerpt must be a verbatim passage from the note body");
  }
  if (scene.fullHerd) PORKY_CAST.forEach(({ name }) => names.add(name));
  const identities = CHARACTERS.filter(({ name }) => names.has(name)).map(
    ({ name, aliases = [], size, visual }) =>
      `${name}（${[...aliases.map((alias) => "也叫" + alias), size].join("，")}）：${visual}。`
  );

  return [
    "画一张温暖的儿童水彩绘本横幅插画。奶油色纸张（#FFF8EF），柔和的粉色和蜜桃色、细腻纸纹、圆润软萌的小猪。",
    scene.layout === "panels"
      ? "将这段情节画成连续分镜，按场景描述安排每格。每格只画该格在场的角色；跨格出现的同一角色保持造型一致。"
      : "用一个完整画面表现选定的一幕，不分格。",
    scene.moment,
    "【这一幕的原文】",
    excerpt,
    "用作者的措辞把握动作、表情和情绪，保留原文的语气。出镜角色以选定的场景为准，原文中仅被提及的人物不要入画。原句和标记都不要画成文字。",
    ...identities,
    "同一个镜头中每个角色只出现一次，动作、配饰只属于它自己。按场景写出的角色和人数构图，不额外添加旁观者或背景角色。",
    scene.fullHerd
      ? `全员同场的镜头里必须恰好有15只常住小猪（13只普通、1只特别大、1只特别小），三排，每排五只，完整可见。前排：${PORKY_ROWS[0].join("、")}。中排：${PORKY_ROWS[1].join("、")}。后排：${PORKY_ROWS[2].join("、")}。本场出镜的来宾在三排之外另计。`
      : "让每个在场角色的身份、动作和表情清楚可见。",
    "不要出现任何文字、数字、标志、对话框、烟酒或人类。角色名只供辨认。"
  ].join("\n");
}

// Raw notes (as stored in notes.json) that still need art: they have real
// content and no image yet. Returns [{ note, slug }] with collision-safe
// slugs mirroring normalizeNotes' derivation, so filenames match page URLs.
// When forceSlug is set, select that exact derived slug even if it already has
// art; a typo fails loudly instead of accidentally regenerating another note.
export function pickPendingNotes(rawNotes, forceSlug = "") {
  const list = Array.isArray(rawNotes) ? rawNotes : [];
  const requestedSlug = String(forceSlug ?? "").trim();
  const taken = new Set();
  const pending = [];

  list.forEach((note, index) => {
    const title = String(note?.title ?? "").trim();
    const body = String(note?.body ?? "").trim();

    if (!title || !body) {
      return;
    }

    const date = String(note?.date ?? "").trim();
    const slug = deriveNoteSlug({ slug: note?.slug, date, fallback: `note-${index + 1}` }, taken);
    taken.add(slug);

    if (requestedSlug ? slug === requestedSlug : !sanitizeNoteImage(note?.image)) {
      pending.push({ note, slug });
    }
  });

  if (requestedSlug && pending.length === 0) {
    throw new Error(`NOTE_ART_FORCE_SLUG did not match a note: ${requestedSlug}`);
  }

  return pending;
}

export function validateNotesDocument(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.notes)) {
    throw new Error("content/notes.json must contain a top-level notes array");
  }

  return value;
}

export function deriveRunStatus({ pendingCount, generatedCount }) {
  const remainingCount = Math.max(0, pendingCount - generatedCount);

  return Object.freeze({
    remainingCount,
    needsFollowup: remainingCount > 0 && generatedCount > 0
  });
}

function actionMessage(value) {
  return String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function warn(message) {
  console.warn(`::warning::${actionMessage(message)}`);
}

function localArtFilename(image) {
  if (!image.startsWith(ART_URL_PREFIX)) {
    return null;
  }

  const filename = image.slice(ART_URL_PREFIX.length);
  return /^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/.test(filename) ? filename : "";
}

export async function reconcileConfiguredArt(
  rawNotes,
  { artDirectory = ART_DIR, readImage = readFile, warning = warn } = {}
) {
  let changed = false;

  for (const note of rawNotes) {
    const rawImage = String(note?.image ?? "").trim();
    const image = sanitizeNoteImage(rawImage);

    if (rawImage && !image) {
      warning(`Ignoring invalid note image reference ${JSON.stringify(rawImage)}; it will be regenerated.`);
      note.image = "";
      changed = true;
      continue;
    }

    const filename = localArtFilename(image);
    if (filename === null) {
      continue;
    }

    if (!filename) {
      warning(`Ignoring unsafe local note-art path ${JSON.stringify(image)}; it will be regenerated.`);
      note.image = "";
      changed = true;
      continue;
    }

    try {
      assertValidWebp(await readImage(path.join(artDirectory, filename)));
    } catch (error) {
      if (error?.code && error.code !== "ENOENT") {
        throw error;
      }

      warning(`Configured art ${image} is missing or invalid; it will be regenerated.`);
      note.image = "";
      changed = true;
    }
  }

  return changed;
}

export async function generateNoteArtBatch(
  batch,
  apiKey,
  {
    apiUrl = API_URL,
    artDirectory = ART_DIR,
    model = MODEL,
    quality = QUALITY,
    size = SIZE,
    timeoutMs = REQUEST_TIMEOUT_MS,
    maximumAttempts = MAXIMUM_API_ATTEMPTS,
    requestScene = requestNoteScene,
    requestImage = requestGeneratedWebp,
    writeImage = writeFileAtomically,
    now = () => new Date().toISOString(),
    logger = console,
    warning = warn
  } = {}
) {
  const generated = [];
  const failures = [];

  for (const entry of batch) {
    try {
      logger.log(`Generating art for "${entry.note.title}" (${entry.slug})…`);
      const input = sceneInput(entry.note);
      const scene = await requestScene({ input, apiKey });
      const prompt = buildArtPrompt(scene, input);
      const excerpt = scene.sourceExcerpt.trim();
      logger.log(`Planned layout: ${scene.layout ?? "single"}`);
      logger.log(`Selected source excerpt (UTF-16 offset, length): ${input.body.indexOf(excerpt)}, ${excerpt.length}`);
      logger.log(`Planned recurring cast: ${scene.fullHerd ? "full herd; " : ""}${scene.cast.join(", ") || "(none named)"}`);
      const image = assertValidWebp(
        await requestImage({
          apiUrl,
          apiKey,
          model,
          prompt,
          quality,
          size,
          timeoutMs,
          maximumAttempts,
          logger
        }),
        { expectedSize: size }
      );
      await writeImage(path.join(artDirectory, `${entry.slug}.webp`), image);
      entry.note.image = `${ART_URL_PREFIX}${entry.slug}.webp`;
      entry.note.imageGeneratedAt = now();
      entry.note.imageSha256 = createHash("sha256").update(image).digest("hex");
      generated.push(entry.slug);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ slug: entry.slug, message });
      logger.error(`Failed for "${entry.note.title}" (${entry.slug}): ${message}`);
      warning(`Note art failed for ${entry.slug}: ${message}`);
    }
  }

  return { generated, failures };
}

async function appendActionFile(filePath, contents) {
  if (filePath) {
    await appendFile(filePath, contents, "utf8");
  }
}

export async function writeRunReport(
  {
    selectedCount,
    attemptedCount,
    generatedCount,
    failed,
    remainingCount,
    hasChanges,
    needsFollowup
  },
  {
    outputPath = process.env.GITHUB_OUTPUT,
    summaryPath = process.env.GITHUB_STEP_SUMMARY
  } = {}
) {
  await appendActionFile(
    outputPath,
    [
      `selected_count=${selectedCount}`,
      `attempted_count=${attemptedCount}`,
      `generated_count=${generatedCount}`,
      `failed_count=${failed.length}`,
      `remaining_count=${remainingCount}`,
      `has_changes=${hasChanges}`,
      `needs_followup=${needsFollowup}`,
      ""
    ].join("\n")
  );

  const summary = [
    "## Piglet note art",
    "",
    "| Selected | Attempted | Generated | Failed | Remaining |",
    "| ---: | ---: | ---: | ---: | ---: |",
    `| ${selectedCount} | ${attemptedCount} | ${generatedCount} | ${failed.length} | ${remainingCount} |`,
    ""
  ];

  if (failed.length) {
    summary.push("Failed slugs:", "", ...failed.map(({ slug }) => `- \`${slug}\``), "");
  }

  await appendActionFile(summaryPath, summary.join("\n")).catch((error) => {
    console.warn(`Could not write GitHub job summary: ${error.message}`);
  });
}

export async function runNoteArt({
  data,
  apiKey = "",
  forceSlug = "",
  artDirectory = ART_DIR,
  maxPerRun = MAX_PER_RUN,
  expectedSize = SIZE,
  readImage = readFile,
  requestScene = requestNoteScene,
  requestImage = requestGeneratedWebp,
  writeImage = writeFileAtomically,
  logger = console,
  warning = warn
}) {
  validateNotesDocument(data);

  let hasChanges = await reconcileConfiguredArt(data.notes, {
    artDirectory,
    readImage,
    warning
  });
  const selected = pickPendingNotes(data.notes, forceSlug);
  const pending = selected;

  if (!pending.length) {
    return {
      selectedCount: selected.length,
      attemptedCount: 0,
      generatedCount: 0,
      failed: [],
      remainingCount: 0,
      hasChanges,
      needsFollowup: false,
      fatalError: null
    };
  }

  if (!apiKey) {
    return {
      selectedCount: selected.length,
      attemptedCount: 0,
      generatedCount: 0,
      failed: pending.map(({ slug }) => ({ slug, message: "OPENAI_API_KEY is not set" })),
      remainingCount: pending.length,
      hasChanges,
      needsFollowup: false,
      fatalError: new Error(
        `OPENAI_API_KEY is required while ${pending.length} note(s) still need art`
      )
    };
  }

  const batch = pending.slice(0, maxPerRun);
  if (batch.length < pending.length) {
    logger.log(
      `Capping this run at ${maxPerRun} image(s); ${pending.length - batch.length} more will be queued after this batch is committed.`
    );
  }

  const result = await generateNoteArtBatch(batch, apiKey, {
    artDirectory,
    size: expectedSize,
    requestScene,
    requestImage,
    writeImage,
    logger,
    warning
  });
  hasChanges ||= result.generated.length > 0;

  const { remainingCount, needsFollowup } = deriveRunStatus({
    pendingCount: pending.length,
    generatedCount: result.generated.length
  });

  return {
    selectedCount: selected.length,
    attemptedCount: batch.length,
    generatedCount: result.generated.length,
    failed: result.failures,
    remainingCount,
    hasChanges,
    needsFollowup,
    fatalError: null
  };
}

async function main() {
  const data = validateNotesDocument(JSON.parse(await readFile(NOTES_PATH, "utf8")));
  const result = await runNoteArt({
    data,
    apiKey: process.env.OPENAI_API_KEY,
    forceSlug: String(process.env.NOTE_ART_FORCE_SLUG || "").trim()
  });

  if (result.hasChanges) {
    await writeFileAtomically(NOTES_PATH, `${JSON.stringify(data, null, 2)}\n`);
  }

  const gallery = await syncNoteGallery({ notes: data.notes });
  result.hasChanges ||= gallery.added > 0;
  console.log(`Independent gallery: ${gallery.added} added, ${gallery.total} total.`);
  await writeRunReport(result);

  if (result.selectedCount === 0) {
    console.log(data.notes.length ? "All notes have valid art. Nothing to generate." : "No notes found.");
  } else if (result.attemptedCount === 0) {
    console.log(`${result.remainingCount} note(s) still need art.`);
  } else {
    console.log(
      `Done: ${result.generatedCount}/${result.attemptedCount} generated, ` +
        `${result.failed.length} failed, ${result.remainingCount} remaining.`
    );
  }

  if (result.fatalError) {
    throw result.fatalError;
  }

  if (result.failed.length > 0) {
    process.exitCode = 1;
  }
}

async function runCli() {
  if (process.argv.length > 2) {
    throw new Error(`Unknown argument: ${process.argv[2]}`);
  }

  await main();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
