import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  PORKY_CAST,
  buildArtPrompt,
  pickPendingNotes
} from "../scripts/generate-note-art.mjs";

test("the note-art cast defines 15 immutable, visually distinct porkies", () => {
  assert.equal(PORKY_CAST.length, 15);
  assert.equal(new Set(PORKY_CAST.map((porky) => porky.name)).size, 15);
  assert.equal(new Set(PORKY_CAST.map((porky) => porky.visual)).size, 15);
  assert.equal(PORKY_CAST.filter((porky) => porky.size.startsWith("特别大")).length, 1);
  assert.equal(PORKY_CAST.filter((porky) => porky.size.startsWith("特别小")).length, 1);
  assert.ok(Object.isFrozen(PORKY_CAST));
  assert.ok(PORKY_CAST.every(Object.isFrozen));
});

test("the note-art prompt fixes the cast at three rows of five without clones", () => {
  const prompt = buildArtPrompt({
    title: "呆呆猪心情不好",
    body: "## 打游戏\n\n想要一个抱抱，也想去攀岩。"
  });

  assert.match(prompt, /必须恰好有15只/);
  assert.match(prompt, /前排5只 \+ 中排5只 \+ 后排5只 = 总计恰好15只/);
  assert.match(prompt, /15张脸、15个完整猪鼻子/);
  assert.match(prompt, /不得把任何角色画成克隆/);
  assert.match(prompt, /演员表的编号和名字仅供理解，绝不能画进画面/);
  assert.match(prompt, /背景可以有照片、画作、猪形玩具或装饰/);
  assert.doesNotMatch(prompt, /墙面不得悬挂任何照片/);
  assert.match(prompt, /1536x1024|宽幅/);
  assert.ok(prompt.includes("想要一个抱抱，也想去攀岩"));

  for (const porky of PORKY_CAST) {
    assert.ok(prompt.includes(porky.name), `${porky.name} is listed`);
    assert.ok(prompt.includes(porky.visual), `${porky.name} keeps its visual identity`);
  }
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
  const workflow = await readFile(
    new URL("../.github/workflows/generate-note-art.yml", import.meta.url),
    "utf8"
  );
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
