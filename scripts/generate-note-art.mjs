#!/usr/bin/env node
// Generates a cute piglet comic illustration for every 猪猪小记 post that
// doesn't have one yet, using the OpenAI Image API (gpt-image-2), and stamps
// the note's `image` field. Runs in GitHub Actions (see
// .github/workflows/generate-note-art.yml); the workflow commits the results.
//
// Testable helpers are exported for the node suite; main performs no I/O when
// this module is imported.

import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import { deriveNoteSlug, noteExcerpt, sanitizeNoteImage } from "../src/render-notes.js";
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
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || "medium";
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
// into copies of one generic pink piglet.
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
  Object.freeze({
    name: "呆呆猪",
    size: "普通大小",
    visual: "蓬松凌乱的额毛、右耳只有一只金色耳环、炭灰色连帽衫"
  }),
  Object.freeze({
    name: "呱呱猪",
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
    visual: "扶着一个黄色玩具方向盘，身体轮廓必须完整可见"
  }),
  Object.freeze({
    name: "臭臭猪",
    size: "普通大小",
    visual: "乱翘耳毛、一颗小小的下獠牙、肩上站着黄色橡皮鸭、少量污渍"
  }),
  Object.freeze({
    name: "香香猪",
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

const FULL_CAST_SUBJECT_PATTERN =
  /(?:15|十五)\s*(?:只)?\s*(?:小猪|猪猪|猪)|(?:所有|全体|全员|全部)\s*(?:的)?\s*(?:小猪|猪猪|猪)/u;
const FULL_CAST_SCENE_PATTERN =
  /(?:一起|共同|到齐|集合|合照|拍照|全家福|大合照|全部登场|全部出镜)/u;
const FULL_CAST_SHORTHAND_PATTERN =
  /(?:猪猪|小猪)?\s*(?:全员|全体)\s*(?:到齐|集合|合照|登场|出镜)/u;
const FULL_CAST_EXCEPTION_PATTERN = /(?:只有|仅有|除了|缺席|没来|不在|没拍成|取消|未能)/u;

function noteStoryText(note) {
  return `${String(note?.title ?? "").trim()}\n${noteExcerpt(note?.body, 1200)}`;
}

function isExplicitFullCastNote(note) {
  return noteStoryText(note)
    .split(/[\n。！？；]+/u)
    .some((clause) => {
      if (!clause.trim() || FULL_CAST_EXCEPTION_PATTERN.test(clause)) {
        return false;
      }

      return (
        FULL_CAST_SHORTHAND_PATTERN.test(clause) ||
        (FULL_CAST_SUBJECT_PATTERN.test(clause) && FULL_CAST_SCENE_PATTERN.test(clause))
      );
    });
}

function mentionsNamedTinyPorky(note) {
  const title = String(note?.title ?? "").trim();
  const clauses = noteStoryText(note).split(/[\n。！？；]+/u);

  if (
    clauses.some(
      (clause) =>
        /小猪[^。！？；\n]{0,30}黄色(?:玩具)?方向盘/u.test(clause) ||
        /黄色(?:玩具)?方向盘[^。！？；\n]{0,30}小猪/u.test(clause)
    )
  ) {
    return true;
  }

  if (!title.includes("小猪")) {
    return false;
  }

  return !/(?:小猪们|小猪(?:都|各自|纷纷)|(?:一|这|那)群[^。！？\n]{0,8}小猪|(?:每只|所有|全部|全体|这些|那些)[^。！？\n]{0,8}小猪|(?:\d+|[一二三四五六七八九十百几多]+)\s*只?[^。！？\n]{0,8}小猪)/u.test(
    title
  );
}

function findMentionedCast(note) {
  const story = noteStoryText(note);

  return PORKY_CAST.filter((porky) =>
    porky.name === "小猪" ? mentionsNamedTinyPorky(note) : story.includes(porky.name)
  );
}

function formatCast(cast) {
  return cast.map(
    (porky, index) => `${index + 1}. ${porky.name}（${porky.size}）：${porky.visual}。`
  ).join("\n");
}

export function selectNoteArtCast(note) {
  const mode = isExplicitFullCastNote(note) ? "full" : "story";
  const fixedCast = mode === "full" ? PORKY_CAST : findMentionedCast(note);

  return Object.freeze({
    mode,
    fixedCastNames: Object.freeze(fixedCast.map((porky) => porky.name))
  });
}

function buildFullCastPrompt(note) {
  const cast = formatCast(PORKY_CAST);

  return [
    "【任务】为一篇中文随笔画一幅可爱的单幅小猪漫画插图。",
    "",
    "【不可协商的数量要求】画面中必须恰好有15只真实、活着的小猪：13只普通大小、1只特别大的大呆猪、1只特别小的小猪。固定演员表里的每个角色必须出现且只能出现一次。不得复制角色，不得把任何角色画成克隆，不得少画，也不得出现第16只小猪。",
    "",
    "【固定演员表：逐只遵守视觉身份】",
    cast,
    "",
    "【固定构图：三排，每排恰好5只】",
    `前排从左到右：${PORKY_ROWS[0].join("、")}。`,
    `中排从左到右：${PORKY_ROWS[1].join("、")}。`,
    `后排从左到右：${PORKY_ROWS[2].join("、")}。`,
    "采用轻微俯视的宽幅合照式场景。三排之间留出清楚的空隙，不得互相遮挡；15张脸、15个完整猪鼻子和每只猪的身份配饰都必须清楚可见，任何小猪都不能被裁切、藏在另一只身后或只露出局部。",
    "每只猪要有不同的脸型、眼型、耳朵姿态、身体轮廓、表情和动作；严格保持各自配饰，不能互换、合并或重复配饰。",
    "",
    "【风格】温暖的儿童水彩绘本手绘风；奶油色底（#FFF8EF），柔和的粉色（#F8A6BA）与蜜桃色（#F5B57E）为主色；圆润软萌的粉红小猪；细腻纸张纹理、柔和光线与简洁背景。保持温馨、有同理心、不嘲弄角色。",
    "",
    "【随笔内容】",
    `随笔标题：《${String(note?.title ?? "").trim()}》`,
    `随笔内容：${noteExcerpt(note?.body, 1200)}`,
    "在不改变固定人数、排位和角色身份的前提下，根据随笔内容安排表情、小动作和非猪形道具，想象一个最温馨、最有画面感的瞬间。",
    "",
    "【绝对禁止】演员表的编号和名字仅供理解，绝不能画进画面。不要出现任何文字、汉字、字母、数字、标志或对话框；不要出现香烟、电子烟、烟斗、酒、酒瓶或酒罐；不要出现人类；不得出现第16只活猪。背景可以有照片、画作、猪形玩具或装饰，但必须一眼看出它们不是活猪。",
    "",
    "【完成前自检】逐排数清楚：前排5只 + 中排5只 + 后排5只 = 总计恰好15只活猪；再确认15个角色各出现一次、外观互不相同、没有第16只活猪，然后才完成画面。"
  ].join("\n");
}

function buildStoryCastPrompt(note, fixedCastNames) {
  const fixedCastNameSet = new Set(fixedCastNames);
  const mentionedCast = PORKY_CAST.filter((porky) => fixedCastNameSet.has(porky.name));
  const identityGuide = mentionedCast.length
    ? [
        "【本文可能涉及的固定角色身份参考】",
        formatCast(mentionedCast),
        "这些档案只用于保持角色长相稳定，不是强制出席名单。只有该角色在所选瞬间直接在场、行动或承载情绪时才画出来。"
      ]
    : [
        "【角色身份】正文没有明确点名固定演员表成员。根据故事选择最少且必要的小猪角色，不要因此召集山庄全员。"
      ];

  return [
    "【任务】为一篇中文随笔画一幅可爱的单幅小猪漫画插图。",
    "",
    "【角色范围——最高优先级】先在心里选择随笔中最有画面感的一个具体瞬间，只画该瞬间直接在场、正在行动或承载情绪的小猪，使用完成这个瞬间所需的最少角色。每只活猪都必须对故事动作或情绪有明确作用。",
    "随笔标题中直接点名、而且在所选瞬间实际在场的小猪是核心角色，必须出镜；若标题或正文明确说明它缺席，则不要实体出镜。正文里出现的其他角色，也只有在所选瞬间直接参与时才出镜。",
    "猪猪山庄虽然共有15只固定小猪，但本篇不是全员合照：绝不能为了热闹、展示演员表或凑数量而补齐15只；不要添加背景路人猪、远处猪群或与该瞬间无关的活猪。",
    "仅仅被回忆、谈论、等待，或明确没有在场的角色不要实体出镜，可以用空椅子、空手柄、空出的伙伴位置或其他非猪形道具暗示。",
    "如果随笔中有固定演员表之外的具名猪角色，而且它在所选瞬间直接参与动作或对话，可以把它作为来宾猪画出来；不要把来宾随机替换成山庄的其他固定角色。",
    "",
    ...identityGuide,
    "",
    "【构图】根据实际出镜角色数量自然安排宽幅场景：一只用有环境叙事的单猪情绪画面，两只突出清楚互动，三只以上按实际相关人数使用疏松分组构图。所有活猪都要完整、清楚、互不遮挡，不裁切，不克隆，不合并角色或配饰。",
    "",
    "【风格】温暖的儿童水彩绘本手绘风；奶油色底（#FFF8EF），柔和的粉色（#F8A6BA）与蜜桃色（#F5B57E）为主色；圆润软萌的粉红小猪；细腻纸张纹理、柔和光线与简洁背景。保持温馨、有同理心、不嘲弄角色。",
    "",
    "【随笔内容——只作为画面故事依据，不要把文字画出来】",
    `随笔标题：《${String(note?.title ?? "").trim()}》`,
    `随笔内容：${noteExcerpt(note?.body, 1200)}`,
    "",
    "【绝对禁止】角色编号和名字仅供理解，绝不能画进画面。不要出现任何文字、汉字、字母、数字、标志或对话框；不要出现香烟、电子烟、烟斗、酒、酒瓶或酒罐；不要出现人类。背景可以有照片、画作、猪形玩具或装饰，但必须一眼看出它们不是活猪。",
    "",
    "【完成前自检】数清楚所有活猪，并逐只确认它确实直接参与所选故事瞬间；删除任何无关活猪。再确认角色外观互不混淆、没有克隆或多余猪，然后才完成画面。"
  ].join("\n");
}

export function buildArtPrompt(note) {
  const selection = selectNoteArtCast(note);

  return selection.mode === "full"
    ? buildFullCastPrompt(note)
    : buildStoryCastPrompt(note, selection.fixedCastNames);
}

function artPromptFingerprint(prompt) {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}

export function noteArtSourceFingerprint(note) {
  return artPromptFingerprint(buildArtPrompt(note));
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

export function buildNoteArtSourceManifest(sources) {
  return {
    version: 1,
    sources: sources.map(({ slug, fingerprint }) => ({ slug, fingerprint }))
  };
}

export function verifyNoteArtSourceManifest(
  manifest,
  notesDocument,
  { expectedCount, requireImageReferences = false } = {}
) {
  validateNotesDocument(notesDocument);

  if (manifest?.version !== 1 || !Array.isArray(manifest.sources)) {
    throw new Error("note-art source manifest must contain a version 1 sources array");
  }

  if (expectedCount !== undefined) {
    const parsedCount = Number(expectedCount);
    if (!Number.isSafeInteger(parsedCount) || parsedCount < 0) {
      throw new Error(`generated source count is invalid: ${expectedCount}`);
    }
    if (manifest.sources.length !== parsedCount) {
      throw new Error(
        `note-art source manifest has ${manifest.sources.length} source(s), expected ${parsedCount}`
      );
    }
  }

  const seen = new Set();
  for (const source of manifest.sources) {
    const slug = String(source?.slug ?? "");
    const fingerprint = String(source?.fingerprint ?? "");

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[a-f0-9]{64}$/.test(fingerprint)) {
      throw new Error("note-art source manifest contains an invalid slug or fingerprint");
    }
    if (seen.has(slug)) {
      throw new Error(`note-art source manifest repeats slug ${slug}`);
    }
    seen.add(slug);

    let entry;
    try {
      [entry] = pickPendingNotes(notesDocument.notes, slug);
    } catch {
      throw new Error(`note ${slug} no longer exists in the latest notes.json`);
    }

    const currentFingerprint = noteArtSourceFingerprint(entry.note);
    if (currentFingerprint !== fingerprint) {
      throw new Error(`note ${slug} changed while its art was being generated`);
    }

    if (requireImageReferences) {
      const expectedImage = `${ART_URL_PREFIX}${slug}.webp`;
      if (entry.note.image !== expectedImage) {
        throw new Error(
          `note ${slug} no longer references its generated art at ${expectedImage}`
        );
      }
    }
  }

  return true;
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
    requestImage = requestGeneratedWebp,
    writeImage = writeFileAtomically,
    logger = console,
    warning = warn
  } = {}
) {
  const generated = [];
  const generatedSources = [];
  const failures = [];

  for (const entry of batch) {
    try {
      logger.log(`Generating art for "${entry.note.title}" (${entry.slug})…`);
      const prompt = buildArtPrompt(entry.note);
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
      generated.push(entry.slug);
      generatedSources.push({ slug: entry.slug, fingerprint: artPromptFingerprint(prompt) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ slug: entry.slug, message });
      logger.error(`Failed for "${entry.note.title}" (${entry.slug}): ${message}`);
      warning(`Note art failed for ${entry.slug}: ${message}`);
    }
  }

  return { generated, generatedSources, failures };
}

async function appendActionFile(filePath, contents) {
  if (filePath) {
    await appendFile(filePath, contents, "utf8");
  }
}

export async function writeNoteArtSourceManifest(filePath, sources) {
  if (filePath && sources.length > 0) {
    const manifest = buildNoteArtSourceManifest(sources);
    await writeFileAtomically(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
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
      generatedSources: [],
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
      generatedSources: [],
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
    generatedSources: result.generatedSources,
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

  await writeNoteArtSourceManifest(
    process.env.NOTE_ART_SOURCE_MANIFEST,
    result.generatedSources
  );
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

export async function verifyNoteArtSourceFiles(
  manifestPath,
  notesPath,
  expectedCount,
  { requireImageReferences = false } = {}
) {
  if (!manifestPath || !notesPath || expectedCount === undefined) {
    throw new Error(
      "--verify-source-manifest requires manifest path, notes JSON path, and generated count"
    );
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const notesDocument = JSON.parse(await readFile(notesPath, "utf8"));
  verifyNoteArtSourceManifest(manifest, notesDocument, {
    expectedCount,
    requireImageReferences
  });
}

async function runCli() {
  if (process.argv[2] === "--verify-source-manifest") {
    const referenceFlag = process.argv[6];
    if (
      (referenceFlag && referenceFlag !== "--require-image-reference") ||
      process.argv.length > 7
    ) {
      throw new Error(`Unknown source-manifest verification option: ${referenceFlag ?? ""}`);
    }

    await verifyNoteArtSourceFiles(process.argv[3], process.argv[4], process.argv[5], {
      requireImageReferences: referenceFlag === "--require-image-reference"
    });
    console.log("Generated note art still matches its latest source and expected reference.");
    return;
  }

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
