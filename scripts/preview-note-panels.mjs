import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { sanitizeNoteSlug } from "../src/render-notes.js";
import { buildPanelShots, localArtFilename, pickPendingNotes, requestNoteScene, sceneInput } from "./generate-note-art.mjs";
import { assertValidWebp, writeFileAtomically } from "./note-art-runtime.mjs";
import { composePanels, PAPER, renderPanels } from "./note-art-panels.mjs";
export { composePanels } from "./note-art-panels.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DRAFTS = path.join(ROOT, ".private-notes", "panel-previews");

async function draftFolder(parent, prefix) {
  await mkdir(parent, { recursive: true });
  return mkdtemp(path.join(parent, prefix + "-"));
}

export async function generatePanelPreview({ note, slug, apiKey, original, drafts = DRAFTS, fetchImpl = fetch }) {
  if (!slug || sanitizeNoteSlug(slug) !== slug) throw new Error("Invalid preview slug");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required to plan and draw a new preview");
  const input = sceneInput(note);
  if (original) assertValidWebp(original);
  const storyboard = await requestNoteScene({ input, apiKey, fetchImpl, panelStudy: true });
  const shots = buildPanelShots(storyboard, input, original);

  const directory = await draftFolder(drafts, slug);
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst";
  const quality = process.env.OPENAI_IMAGE_QUALITY || "xhigh";
  await writeFileAtomically(path.join(directory, "storyboard.json"),
    JSON.stringify({ slug, model, quality, continuity: storyboard.continuity, panels: shots }, null, 2) + "\n");
  console.log(`Storyboard ready. Draft directory: ${directory}`);

  const composition = await renderPanels(shots, {
    apiKey, model, quality, fetchImpl, original,
    onPanel: (index, image) => writeFileAtomically(path.join(directory, `panel-${index + 1}.webp`), image)
  });
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
