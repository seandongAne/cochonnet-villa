import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  GUEST_CAST,
  PORKY_CAST,
  buildArtPrompt,
  pickPendingNotes,
  requestNoteScene,
  sceneInput
} from "../scripts/generate-note-art.mjs";

test("the note-art cast defines 15 immutable, visually distinct porkies", () => {
  assert.equal(PORKY_CAST.length, 15);
  assert.equal(new Set(PORKY_CAST.map((porky) => porky.name)).size, 15);
  assert.equal(new Set(PORKY_CAST.map((porky) => porky.visual)).size, 15);
  assert.equal(PORKY_CAST.filter((porky) => porky.size.startsWith("特别大")).length, 1);
  assert.equal(PORKY_CAST.filter((porky) => porky.size.startsWith("特别小")).length, 1);
  assert.ok(Object.isFrozen(PORKY_CAST));
  assert.ok(PORKY_CAST.every(Object.isFrozen));
  assert.ok(PORKY_CAST.every((porky) => !porky.aliases || Object.isFrozen(porky.aliases)));
});

test("every character name and alias resolves to exactly one identity", () => {
  const names = [...PORKY_CAST, ...GUEST_CAST].flatMap((character) => [
    character.name,
    ...(character.aliases ?? [])
  ]);

  assert.equal(new Set(names).size, names.length);
});

test("the planner reads the whole story with canonical names and real identity markers", () => {
  const input = sceneInput({
    title: "胖呆呆的周末", body: "小猪们去郊游。\n\n" + "路很长。".repeat(350) +
      "[[小猪]]遇见香瓜猪。胖呆呆回家想白菜了。"
  });
  assert.ok(input.body.endsWith("[[小猪]]遇见香瓜猪。胖呆呆回家想白菜了。"));
  assert.deepEqual(input.candidates.map(({ name }) => name), ["呆呆猪", "小猪", "香香猪", "白白菜"]);
  assert.ok(input.candidates.find(({ name }) => name === "呆呆猪").aliases.includes("胖呆呆"));
  assert.deepEqual(sceneInput({ body: "小猪们看着 `[[小猪]]`。" }).candidates, []);
  assert.throws(() => sceneInput({ body: "[[小豬]]回家。" }), /Unknown note character marker/);
});

test("only identities present in the chosen moment are passed to the illustrator", () => {
  const { candidates } = sceneInput({ body: "胖呆呆说我想白菜了。晚上白菜才回来和呆呆猪一起吃饭。" });
  const early = buildArtPrompt({ moment: "呆呆猪托腮看着空椅子。", cast: ["呆呆猪"], fullHerd: false }, candidates);
  const later = buildArtPrompt({ moment: "呆呆猪和白白菜并排吃饭。", cast: ["呆呆猪", "白白菜"], fullHerd: false }, candidates);
  assert.ok(early.includes("托腮看着空椅子"));
  assert.ok(early.includes(PORKY_CAST.find(({ name }) => name === "呆呆猪").visual));
  assert.doesNotMatch(early, /白菜|来宾朋友|共15只/);
  assert.ok(later.includes(GUEST_CAST[0].visual));
  assert.ok(!early.includes("晚上"));
});

test("explicit full-herd scenes supply every identity and keep guests outside the fifteen", () => {
  const { candidates } = sceneInput({ body: "十五只猪拍全家福，白菜也来了。" });
  const group = buildArtPrompt({ moment: "全家福", cast: ["白白菜"], fullHerd: true }, candidates);
  for (const character of [...PORKY_CAST, ...GUEST_CAST]) assert.ok(group.includes(character.visual));
  assert.match(group, /三排，每排五只/);
  const generic = buildArtPrompt({ moment: "两只小猪晒太阳。", cast: [], fullHerd: false }, []);
  assert.doesNotMatch(generic, /波波头|三排/);
});

test("invalid scene plans cannot introduce an unmentioned identity or submit a blank scene", () => {
  const { candidates } = sceneInput({ body: "呆呆猪回家了。" });
  for (const cast of [["白白菜"], ["未知"], ["呆呆猪", "呆呆猪"]]) {
    assert.throws(() => buildArtPrompt({ moment: "家中", cast, fullHerd: false }, candidates), /identity/);
  }
  assert.throws(() => buildArtPrompt({ moment: " ", cast: [], fullHerd: false }, candidates), /Invalid scene/);
});

test("the text request uses a structured scene response and surfaces refusal or incomplete output", async () => {
  const input = sceneInput({ title: "晚饭", body: "呆呆猪说我想白菜了。" });
  const scene = { moment: "呆呆猪独自吃饭。", cast: ["呆呆猪"], fullHerd: false };
  const message = { type: "message", content: [{ type: "output_text", text: JSON.stringify(scene) }] };
  let payload = { status: "completed", output: [{ type: "reasoning" }, message] };
  let request;
  const options = { input, apiKey: "test-key", fetchImpl: async (_url, options) => {
    request = JSON.parse(options.body);
    return Response.json(payload);
  } };
  assert.deepEqual(await requestNoteScene(options), scene);
  assert.deepEqual(JSON.parse(request.input), input);
  assert.equal(request.store, false);
  assert.equal(request.text.format.strict, true);
  payload = { status: "incomplete", output: [message] };
  await assert.rejects(requestNoteScene(options), /completed scene/);
  payload = { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] };
  await assert.rejects(requestNoteScene(options), /completed scene/);
});

test("forced note art selects only the exact derived slug, including notes with art", () => {
  const notes = [
    {
      title: "已有图",
      date: "2026-05-01",
      body: "第一篇",
      image: "/notes-art/2026-05-01.webp"
    },
    { title: "待配图", date: "2026-05-01", body: "第二篇" },
    { title: "另一天", date: "2026-05-02", body: "第三篇" }
  ];

  assert.deepEqual(
    pickPendingNotes(notes).map((entry) => entry.slug),
    ["2026-05-01-2", "2026-05-02"],
    "ordinary runs remain missing-only"
  );
  assert.deepEqual(
    pickPendingNotes(notes, "2026-05-01").map((entry) => entry.slug),
    ["2026-05-01"],
    "force mode can replace existing art without selecting other missing notes"
  );
  assert.deepEqual(
    pickPendingNotes(notes, "2026-05-01-2").map((entry) => entry.slug),
    ["2026-05-01-2"],
    "collision-safe slugs are selected exactly"
  );
  assert.throws(() => pickPendingNotes(notes, "../../wrong"), /did not match a note/);
});

test("manual workflow dispatch passes a force slug without interpolating it into shell", async () => {
  const workflow = (
    await readFile(
      new URL("../.github/workflows/generate-note-art.yml", import.meta.url),
      "utf8"
    )
  ).replace(/\r\n?/g, "\n");
  const generator = await readFile(
    new URL("../scripts/generate-note-art.mjs", import.meta.url),
    "utf8"
  );

  assert.match(workflow, /force_slug:\n\s+description:/);
  assert.match(workflow, /force_slug:[\s\S]*?type:\s*string/);
  assert.ok(workflow.includes("NOTE_ART_FORCE_SLUG:"));
  assert.ok(workflow.includes("github.event_name == 'workflow_dispatch'"));
  assert.doesNotMatch(workflow, /node scripts\/generate-note-art\.mjs[^\n]*force_slug/);
  assert.ok(generator.includes('OPENAI_IMAGE_SIZE || "1536x1024"'));
});
