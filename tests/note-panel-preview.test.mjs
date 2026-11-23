import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { generateNoteArtBatch, requestNoteScene } from "../scripts/generate-note-art.mjs";
import { generatePanelPreview } from "../scripts/preview-note-panels.mjs";

const note = { title: "回家", body: "呆呆猪回家。白白菜开门。两人笑起来。" };
const panels = [
  { moment: "呆呆猪敲门。", cast: ["呆呆猪"] },
  { moment: "白白菜开门。", cast: ["白白菜"] },
  { moment: "呆呆猪和白白菜笑起来。", cast: ["呆呆猪", "白白菜"] }
].map((shot, i) => ({ ...shot, fullHerd: false, firstSentence: i + 1, lastSentence: i + 1 }));

function storyResponse(shots) {
  const text = JSON.stringify({ continuity: "门边暖光。", panels: shots });
  return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] });
}

function solid(size, background) {
  const [width, height] = size.split("x").map(Number);
  return sharp({ create: { width, height, channels: 3, background } }).webp({ lossless: true }).toBuffer();
}

async function temporaryDrafts(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "note-panel-study-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

for (const count of [2, 3]) {
  test(`a ${count}-shot study grounds each request, passes the right references, and lays out the saved images`, async (t) => {
    const drafts = await temporaryDrafts(t);
    const original = count === 3 ? await solid("96x64", "white") : null;
    const saved = [];
    const colors = ["#ff0000", "#00ff00", "#0000ff"];
    const fetchImpl = async (url, request) => {
      if (url.endsWith("/responses")) {
        const planRequest = JSON.parse(request.body);
        assert.equal(planRequest.text.format.name, "note_panel_study");
        assert.equal(JSON.parse(planRequest.input).sentences.map(s => s.text).join(""), note.body);
        return storyResponse(panels.slice(0, count));
      }
      const index = saved.length;
      const expected = [original, saved[0]].filter(Boolean);
      assert.ok(url.endsWith(expected.length ? "/edits" : "/generations"));
      const fields = expected.length ? Object.fromEntries(request.body) : JSON.parse(request.body);
      if (expected.length) {
        const references = request.body.getAll("image[]");
        assert.equal(references.length, expected.length);
        for (const [i, file] of references.entries()) {
          assert.deepEqual(Buffer.from(await file.arrayBuffer()), expected[i]);
        }
      }
      assert.ok(fields.prompt.includes(panels[index].moment));
      assert.match(fields.prompt, /不分格/);
      assert.equal(fields.size, count === 3 && index < 2 ? "1536x1024" : "1152x1536");
      const bytes = await solid(fields.size, colors[index]);
      saved.push(bytes);
      return Response.json({ data: [{ b64_json: bytes.toString("base64") }] });
    };
    const directory = await generatePanelPreview({ note, slug: "sample", drafts, original, apiKey: "fixture", fetchImpl });
    const plan = JSON.parse(await readFile(path.join(directory, "storyboard.json"), "utf8"));
    assert.equal(plan.panels[0].sourceExcerpt, "呆呆猪回家。");
    assert.equal(saved.length, count);
    for (const [i, file] of saved.entries()) {
      assert.deepEqual(await readFile(path.join(directory, `panel-${i + 1}.webp`)), file);
    }
    const preview = await readFile(path.join(directory, "preview.webp"));
    const { data, info } = await sharp(preview).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height], [1536, 1024]);
    const samplePoints = count === 2 ? [[381, 512], [1155, 512]] : [[381, 255], [381, 769], [1155, 512]];
    for (const [index, [x, y]] of samplePoints.entries()) {
      const offset = (y * info.width + x) * info.channels;
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(data[offset + c] - (c === index ? 255 : 0)) < 5);
    }
    assert.equal((await readdir(directory)).includes("comparison.webp"), Boolean(original));
  });
}

test("reversed source order and invalid later casts fail before requesting any image", async (t) => {
  const drafts = await temporaryDrafts(t);
  for (const [shots, expected] of [
    [[panels[1], panels[0]], /source order/],
    [[panels[0], { ...panels[1], cast: ["invented"] }], /identity/]
  ]) {
    const fetchImpl = async (url) => {
      assert.ok(url.endsWith("/responses"));
      return storyResponse(shots);
    };
    await assert.rejects(generatePanelPreview({ note, slug: "sample", drafts, apiKey: "fixture", fetchImpl }), expected);
  }
  assert.deepEqual(await readdir(drafts), []);
});

test("an interrupted study preserves its plan and first panel without emitting a partial composition", async (t) => {
  const drafts = await temporaryDrafts(t);
  const fetchImpl = async (url) => {
    if (url.endsWith("/responses")) return storyResponse(panels.slice(0, 2));
    if (url.endsWith("/edits")) return new Response("test error", { status: 400 });
    return Response.json({ data: [{ b64_json: (await solid("1152x1536", "white")).toString("base64") }] });
  };
  await assert.rejects(generatePanelPreview({ note, slug: "sample", drafts, apiKey: "fixture", fetchImpl }), /400/);
  const [run] = await readdir(drafts);
  assert.deepEqual((await readdir(path.join(drafts, run))).sort(), ["panel-1.webp", "storyboard.json"]);
});

test("production plans once, draws each panel, and publishes only a finished composite", async () => {
  for (const interrupt of [false, true]) {
    const entry = { slug: "sample", note: { ...note } };
    const writes = [];
    const images = [];
    let plans = 0;
    const result = await generateNoteArtBatch([entry], "fixture", {
      requestScene: (options) => requestNoteScene({
        ...options, fetchImpl: async (_url, request) => {
          plans++;
          const format = JSON.parse(request.body).text.format;
          assert.equal(format.name, "note_scene");
          assert.deepEqual(format.schema.properties.scene.anyOf.map(s => s.properties.layout.enum[0]), ["single", "panels"]);
          const scene = { layout: "panels", continuity: "门边暖光。", panels: panels.slice(0, 2) };
          const text = JSON.stringify({ scene });
          return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] });
        }
      }),
      requestImage: async ({ apiUrl, referenceImages, size, prompt }) => {
        const index = images.length;
        assert.ok(apiUrl.endsWith(index ? "/edits" : "/generations"));
        assert.deepEqual(referenceImages, images.slice(0, 1));
        assert.match(prompt, /不分格/);
        assert.ok(prompt.includes(panels[index].moment));
        if (index && interrupt) throw new Error("second panel failed");
        const bytes = await solid(size, index ? "green" : "red");
        images.push(bytes);
        return bytes;
      },
      writeImage: async (name, data) => writes.push({ name, data }),
      logger: { log() {}, error() {} }, warning() {}
    });
    assert.equal(plans, 1);
    if (interrupt) {
      assert.deepEqual(result.failures, [{ slug: "sample", message: "second panel failed" }]);
      assert.equal(writes.length, 0);
      assert.deepEqual(entry.note, note);
    } else {
      assert.deepEqual(result.generated, ["sample"]);
      assert.equal(images.length, 2);
      assert.equal(writes.length, 1);
      assert.equal(path.basename(writes[0].name), "sample.webp");
      const { width, height } = await sharp(writes[0].data).metadata();
      assert.deepEqual([width, height], [1536, 1024]);
      assert.equal(entry.note.image, "/notes-art/sample.webp");
    }
  }
});
