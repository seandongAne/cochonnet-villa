import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { sanitizeNoteSlug } from "../src/render-notes.js";
import { buildArtPrompt, localArtFilename, pickPendingNotes, requestNoteScene, sceneInput } from "./generate-note-art.mjs";
import { assertValidWebp, requestGeneratedWebp, writeFileAtomically } from "./note-art-runtime.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DRAFTS = path.join(ROOT, ".private-notes", "panel-previews");
const PAPER = "#fff8ef";
const PORTRAIT = { width: 762, height: 1016, size: "1152x1536" };
const LANDSCAPE = { width: 762, height: 502, size: "1536x1024" };

function slots(count) {
  if (count === 2) return [
    { ...PORTRAIT, left: 0, top: 4 }, { ...PORTRAIT, left: 774, top: 4 }
  ];
  if (count === 3) return [
    { ...LANDSCAPE, left: 0, top: 4 }, { ...LANDSCAPE, left: 0, top: 518 },
    { ...PORTRAIT, left: 774, top: 4 }
  ];
  throw new Error("Expected two or three panel images in reading order");
}

export async function composePanels(images) {
  const layout = slots(images.length);
  const cells = await Promise.all(images.map(async (image, index) => {
    const { width, height, left, top } = layout[index];
    const input = await sharp(image).autoOrient().resize(width, height, {
      fit: "contain", background: PAPER
    }).png().toBuffer();
    return { input, left, top };
  }));
  return sharp({ create: { width: 1536, height: 1024, channels: 3, background: PAPER } })
    .composite(cells).webp({ quality: 96, effort: 5, smartSubsample: true }).toBuffer();
}

async function draftFolder(parent, prefix) {
  await mkdir(parent, { recursive: true });
  return mkdtemp(path.join(parent, prefix + "-"));
}

export async function generatePanelPreview({ note, slug, apiKey, original, drafts = DRAFTS, fetchImpl = fetch }) {
  if (!slug || sanitizeNoteSlug(slug) !== slug) throw new Error("Invalid preview slug");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required to plan and draw a new preview");
  const input = sceneInput(note);
  if (original) assertValidWebp(original);
  const { continuity, panels } = await requestNoteScene({ input, apiKey, fetchImpl, panelStudy: true });
  const layout = slots(panels.length);
  const shots = panels.map((panel, index) => {
    const { size, width, height } = layout[index];
    const prompt = [
      buildArtPrompt(panel, input, { portrait: height > width }),
      `【场景连续性】${continuity}`,
      "参考图只用于对齐角色外形、场景和笔触。本次只画这一格指定的角色、动作和地点，画满独立画布。",
      ...(original ? ["第一张参考图是原配图，忽略其中的分格和旧构图。"] : []),
      ...(index ? ["最后一张参考图是本组的第一格。保持同一角色的衣饰、体型与画风，依本格情节调整表情和景别。"] : [])
    ].join("\n");
    return { ...panel, size, prompt };
  });

  const directory = await draftFolder(drafts, slug);
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst";
  const quality = process.env.OPENAI_IMAGE_QUALITY || "xhigh";
  await writeFileAtomically(path.join(directory, "storyboard.json"),
    JSON.stringify({ slug, model, quality, continuity, panels: shots }, null, 2) + "\n");
  console.log(`Storyboard ready. Draft directory: ${directory}`);

  const images = [];
  for (const [index, { size, prompt }] of shots.entries()) {
    const referenceImages = [original, images[0]].filter(Boolean);
    const image = await requestGeneratedWebp({
      apiUrl: `https://api.openai.com/v1/images/${referenceImages.length ? "edits" : "generations"}`,
      apiKey, model, quality, size, prompt, referenceImages, fetchImpl
    });
    await writeFileAtomically(path.join(directory, `panel-${index + 1}.webp`), image);
    images.push(image);
  }
  const composition = await composePanels(images);
  await writeFileAtomically(path.join(directory, "preview.webp"), composition);
  if (original) {
    const left = await sharp(original).resize(1536, 1024, { fit: "contain", background: PAPER }).png().toBuffer();
    const comparison = await sharp({ create: { width: 3096, height: 1024, channels: 3, background: PAPER } })
      .composite([{ input: left, left: 0, top: 0 }, { input: composition, left: 1560, top: 0 }])
      .webp({ quality: 94, smartSubsample: true }).toBuffer();
    await writeFileAtomically(path.join(directory, "comparison.webp"), comparison);
  }
  return directory;
}

async function main(args) {
  if (args[0] === "--compose") {
    const composition = await composePanels(args.slice(1));
    const directory = await draftFolder(DRAFTS, "composition");
    await writeFileAtomically(path.join(directory, "preview.webp"), composition);
    return directory;
  }
  if (args[0] === "--file" && args.length === 2) {
    const title = path.parse(args[1]).name;
    const body = await readFile(args[1], "utf8");
    return generatePanelPreview({
      note: { title, body }, slug: sanitizeNoteSlug(title) || "draft", apiKey: process.env.OPENAI_API_KEY
    });
  }
  if (args.length !== 1 || !args[0].trim() || args[0].startsWith("-")) {
    throw new Error("Usage: npm run note-art:preview -- <note-slug> | --file <draft.md> | --compose <first-image> <second-image> [third-image]");
  }
  const data = JSON.parse(await readFile(path.join(ROOT, "content", "notes.json"), "utf8"));
  const [entry] = pickPendingNotes(data.notes, args[0]);
  const filename = localArtFilename(String(entry.note.image || "").trim());
  const original = filename ? await readFile(path.join(ROOT, "public", "notes-art", filename)) : null;
  return generatePanelPreview({ ...entry, original, apiKey: process.env.OPENAI_API_KEY });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(console.log).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
