#!/usr/bin/env node
// Generates a cute piglet comic illustration for every 猪猪小记 post that
// doesn't have one yet, using the OpenAI Image API (gpt-image-2), and stamps
// the note's `image` field. Runs in GitHub Actions (see
// .github/workflows/generate-note-art.yml); the workflow commits the results.
//
// Pure helpers (buildArtPrompt / pickPendingNotes) are exported for the node
// test suite; nothing below performs I/O at import time.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import { deriveNoteSlug, noteExcerpt } from "../src/render-notes.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NOTES_PATH = path.join(ROOT, "content", "notes.json");
const ART_DIR = path.join(ROOT, "public", "notes-art");
const ART_URL_PREFIX = "/notes-art/";

const API_URL = "https://api.openai.com/v1/images/generations";
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || "medium";
const SIZE = process.env.OPENAI_IMAGE_SIZE || "1536x1024";
const MAX_PER_RUN = Number(process.env.NOTE_ART_MAX_PER_RUN || 4);

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

export function buildArtPrompt(note) {
  const cast = PORKY_CAST.map(
    (porky, index) => `${index + 1}. ${porky.name}（${porky.size}）：${porky.visual}。`
  ).join("\n");

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
    "【背景限制】背景只使用简洁的奶油色墙面、窗户、攀岩墙和不具猪形的日常道具。墙面不得悬挂任何照片、相框、海报、画作或壁画，背景任何位置都不得出现额外猪脸或猪形轮廓。",
    "",
    "【随笔内容】",
    `随笔标题：《${String(note?.title ?? "").trim()}》`,
    `随笔内容：${noteExcerpt(note?.body, 300)}`,
    "在不改变固定人数、排位和角色身份的前提下，根据随笔内容安排表情、小动作和非猪形道具，想象一个最温馨、最有画面感的瞬间。",
    "",
    "【绝对禁止】演员表的编号和名字仅供理解，绝不能画进画面。不要出现任何文字、汉字、字母、数字、标志或对话框；不要出现香烟、电子烟、烟斗、酒、酒瓶或酒罐；不要出现人类；不要出现额外的猪形玩具、猪照片、猪画像、猪雕像、猪玩偶、独立猪形剪影、镜中猪影或任何可能被数成第16只猪的猪形图案。",
    "",
    "【完成前自检】逐排数清楚：前排5只 + 中排5只 + 后排5只 = 总计恰好15只；再确认15个角色各出现一次、外观互不相同，并检查背景没有照片或额外猪形图像、整张画没有第16只猪，然后才完成画面。"
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

    if (requestedSlug ? slug === requestedSlug : !String(note?.image ?? "").trim()) {
      pending.push({ note, slug });
    }
  });

  if (requestedSlug && pending.length === 0) {
    throw new Error(`NOTE_ART_FORCE_SLUG did not match a note: ${requestedSlug}`);
  }

  return pending;
}

async function generateImage(prompt, apiKey) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size: SIZE,
      quality: QUALITY,
      output_format: "webp",
      output_compression: 85,
      n: 1
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`images API ${response.status}: ${detail.slice(0, 300)}`);
  }

  const payload = await response.json();
  const b64 = payload?.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error("images API returned no b64_json");
  }

  return Buffer.from(b64, "base64");
}

async function main() {
  const data = JSON.parse(await readFile(NOTES_PATH, "utf8"));
  const forceSlug = String(process.env.NOTE_ART_FORCE_SLUG || "").trim();
  const pending = pickPendingNotes(data?.notes, forceSlug);

  if (!pending.length) {
    console.log("All notes already have art. Nothing to do.");
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    if (forceSlug) {
      throw new Error("OPENAI_API_KEY is required when NOTE_ART_FORCE_SLUG is set");
    }

    console.log(
      `${pending.length} note(s) selected for art, but OPENAI_API_KEY is not set — skipping. ` +
        "Add the repo Actions secret to enable art generation."
    );
    return;
  }

  const batch = pending.slice(0, MAX_PER_RUN);

  if (batch.length < pending.length) {
    console.log(
      `Capping this run at ${MAX_PER_RUN} image(s); ${pending.length - batch.length} more will be generated on the next run.`
    );
  }

  await mkdir(ART_DIR, { recursive: true });

  let generated = 0;

  for (const { note, slug } of batch) {
    try {
      console.log(`Generating art for "${note.title}" (${slug})…`);
      const image = await generateImage(buildArtPrompt(note), apiKey);
      await writeFile(path.join(ART_DIR, `${slug}.webp`), image);
      note.image = `${ART_URL_PREFIX}${slug}.webp`;
      generated += 1;
    } catch (error) {
      console.error(`Failed for "${note.title}": ${error.message}`);
    }
  }

  if (generated > 0) {
    await writeFile(NOTES_PATH, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`Done: ${generated}/${batch.length} image(s) generated and stamped into notes.json.`);
  }

  if (generated === 0) {
    // Every attempt failed — likely a bad key or API outage; fail the run so
    // it shows up red instead of silently doing nothing forever.
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
