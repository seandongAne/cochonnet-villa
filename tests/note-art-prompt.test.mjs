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
  const { residents, guests } = input.roster;
  assert.deepEqual(residents.map(({ name }) => name), PORKY_CAST.map(({ name }) => name));
  assert.deepEqual(guests.map(({ name }) => name), GUEST_CAST.map(({ name }) => name));
  assert.ok(residents.find(({ name }) => name === "呆呆猪").aliases.includes("胖呆呆"));
  assert.ok(guests.find(({ name }) => name === "白白菜").aliases.includes("白菜"));
  assert.deepEqual(input.markers, ["小猪"]);
  assert.deepEqual(sceneInput({ body: "两只小猪晒太阳。" }).roster, input.roster);
  assert.throws(() => sceneInput({ body: "[[小豬]]回家。" }), /Unknown note character marker/);
});

test("only identities present in the chosen moment are passed to the illustrator", () => {
  const earlyText = "胖呆呆说我想白菜了。";
  const laterText = "晚上白菜才回来和呆呆猪一起吃饭。";
  const input = sceneInput({ body: earlyText + laterText });
  const early = buildArtPrompt({ moment: "呆呆猪托腮看着空椅子。", sourceExcerpt: earlyText, cast: ["呆呆猪"], fullHerd: false }, input);
  const later = buildArtPrompt({ moment: "呆呆猪和白白菜并排吃饭。", sourceExcerpt: laterText, cast: ["呆呆猪", "白白菜"], fullHerd: false }, input);
  assert.ok(early.includes("托腮看着空椅子"));
  assert.ok(early.includes(PORKY_CAST.find(({ name }) => name === "呆呆猪").visual));
  assert.ok(early.includes(earlyText));
  assert.ok(!early.includes(GUEST_CAST[0].visual));
  assert.ok(later.includes(laterText));
  assert.ok(!later.includes(earlyText));
  assert.ok(later.includes(GUEST_CAST[0].visual));
  assert.ok(!early.includes("晚上"));
});

test("explicit full-herd scenes supply every identity and keep guests outside the fifteen", () => {
  const input = sceneInput({ body: "十五只猪拍全家福，白菜和不呆不呆猪也来了。" });
  const group = buildArtPrompt({ moment: "全家福", sourceExcerpt: input.body, cast: ["白白菜", "不呆不呆猪"], fullHerd: true }, input);
  for (const character of [...PORKY_CAST, ...GUEST_CAST]) assert.ok(group.includes(character.visual));
  assert.match(group, /三排，每排五只/);
  const genericInput = sceneInput({ body: "两只小猪晒太阳。" });
  const generic = buildArtPrompt({ moment: genericInput.body, sourceExcerpt: genericInput.body, cast: [], fullHerd: false }, genericInput);
  assert.doesNotMatch(generic, /波波头|三排/);
});

test("only an actual character marker identifies the named little pig in a partial cast", () => {
  for (const body of ["一只小猪推开门。", "牌子上写着 `[[小猪]]`。", "[[小猪]]推开门。"]) {
    const input = sceneInput({ body });
    const prompt = () => buildArtPrompt({ moment: "门前的小猪。", sourceExcerpt: input.body, cast: ["小猪"], fullHerd: false }, input);
    if (body.startsWith("[[小猪]]")) assert.match(prompt(), /波波头/);
    else assert.throws(prompt, /explicit.*marker/);
  }
});

test("invalid scene plans cannot use an unknown name, an alias, duplicate identities or a blank scene", () => {
  const input = sceneInput({ body: "呆呆猪回家了。" });
  for (const cast of [["胖呆呆"], ["未知"], ["呆呆猪", "呆呆猪"]]) {
    assert.throws(() => buildArtPrompt({ moment: "家中", sourceExcerpt: input.body, cast, fullHerd: false }, input), /identity/);
  }
  assert.throws(() => buildArtPrompt({ moment: " ", sourceExcerpt: input.body, cast: [], fullHerd: false }, input), /Invalid scene/);
});

test("the image prompt rejects invented or spliced quotes", () => {
  const input = sceneInput({ body: "胖呆呆开饭啦！吃得可香了。嘴巴里开始冒泡泡！" });
  for (const sourceExcerpt of ["", "胖呆呆开始吃饭了。", "胖呆呆开饭啦！嘴巴里开始冒泡泡！"]) {
    assert.throws(() => buildArtPrompt({
      moment: "呆呆猪吃饭。", sourceExcerpt, cast: ["呆呆猪"], fullHerd: false
    }, input), /verbatim passage/);
  }
});

test("the text request uses a structured scene response and surfaces refusal or incomplete output", async () => {
  const input = sceneInput({ title: "晚饭", body: "呆呆猪说我想白菜了。" });
  const scene = { moment: "呆呆猪独自吃饭。", sourceExcerpt: input.body, cast: ["呆呆猪"], fullHerd: false };
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
