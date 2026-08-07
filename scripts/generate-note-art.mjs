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
const SIZE = "1024x1024";
const MAX_PER_RUN = Number(process.env.NOTE_ART_MAX_PER_RUN || 4);

export function buildArtPrompt(note) {
  return [
    "为一篇中文随笔画一幅可爱的单幅小猪漫画插图。",
    "风格：温暖的儿童绘本手绘风；奶油色底（#FFF8EF），柔和的粉色（#F8A6BA）与蜜桃色（#F5B57E）为主色；圆润软萌的粉红小猪；柔和的光线与简洁的背景。",
    "画面中绝对不要出现任何文字、字母或数字。",
    "主角设定：猪猪山庄的小猪——一群快乐的宠物小猪，13只普通大小、1只特别大、1只特别小。",
    `随笔标题：《${String(note?.title ?? "").trim()}》`,
    `随笔内容：${noteExcerpt(note?.body, 300)}`,
    "请根据随笔内容想象一个最温馨、最有画面感的瞬间，画成插图。"
  ].join("\n");
}

// Raw notes (as stored in notes.json) that still need art: they have real
// content and no image yet. Returns [{ note, slug }] with collision-safe
// slugs mirroring normalizeNotes' derivation, so filenames match page URLs.
export function pickPendingNotes(rawNotes) {
  const list = Array.isArray(rawNotes) ? rawNotes : [];
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

    if (!String(note?.image ?? "").trim()) {
      pending.push({ note, slug });
    }
  });

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
  const pending = pickPendingNotes(data?.notes);

  if (!pending.length) {
    console.log("All notes already have art. Nothing to do.");
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log(
      `${pending.length} note(s) need art, but OPENAI_API_KEY is not set — skipping. ` +
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
