import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  GUEST_CAST,
  PORKY_CAST,
  buildArtPrompt,
  pickPendingNotes,
  selectNoteArtCast
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

test("a single-protagonist note only injects that porky's identity", () => {
  const prompt = buildArtPrompt({
    title: "呆呆猪心情不好",
    body: "## 打游戏\n\n想要一个抱抱，也想去攀岩。"
  });

  const protagonist = PORKY_CAST.find((porky) => porky.name === "呆呆猪");

  assert.ok(prompt.includes(protagonist.visual));
  assert.match(prompt, /使用完成这个瞬间所需的最少角色/);
  assert.match(prompt, /随笔标题中直接点名、而且在所选瞬间实际在场的小猪是核心角色/);
  assert.match(prompt, /绝不能为了热闹、展示演员表或凑数量而补齐15只/);
  assert.match(prompt, /本篇不是全员合照/);
  assert.match(prompt, /不要添加背景路人猪、远处猪群/);
  assert.doesNotMatch(prompt, /固定构图：三排/);
  assert.doesNotMatch(prompt, /必须恰好有15只/);
  assert.match(prompt, /背景可以有照片、画作、猪形玩具或装饰/);
  assert.match(prompt, /1536x1024|宽幅/);
  assert.ok(prompt.includes("想要一个抱抱，也想去攀岩"));

  for (const porky of PORKY_CAST.filter((entry) => entry.name !== "呆呆猪")) {
    assert.ok(!prompt.includes(porky.visual), `${porky.name} is not injected`);
  }

  for (const guest of GUEST_CAST) {
    assert.ok(!prompt.includes(guest.name), `${guest.name} is not injected`);
  }
});

test("only an explicitly full-cast note requests the 15-porky three-row portrait", () => {
  const prompt = buildArtPrompt({
    title: "十五只小猪全员合照",
    body: "山庄的十五只小猪一起到齐，拍一张温暖的全家福。"
  });

  assert.match(prompt, /必须恰好有15只/);
  assert.match(prompt, /前排5只 \+ 中排5只 \+ 后排5只 = 总计恰好15只/);
  assert.match(prompt, /15张脸、15个完整猪鼻子/);
  assert.match(prompt, /不得把任何角色画成克隆/);

  for (const porky of PORKY_CAST) {
    assert.ok(prompt.includes(porky.name), `${porky.name} is listed`);
    assert.ok(prompt.includes(porky.visual), `${porky.name} keeps its visual identity`);
  }
});

test("a one-sentence herd backdrop does not turn a two-pig story into a full-cast scene", () => {
  const prompt = buildArtPrompt({
    title: "卖零食给不呆不呆猪！",
    body: "十五猪猪昨天去超市进货。呆呆猪把零食卖给不呆不呆猪，两只猪当场完成了交易。"
  });
  const protagonist = PORKY_CAST.find((porky) => porky.name === "呆呆猪");

  assert.ok(prompt.includes(protagonist.visual));
  assert.ok(prompt.includes("不呆不呆猪"));
  assert.match(prompt, /固定演员表之外的具名猪角色/);
  assert.doesNotMatch(prompt, /必须恰好有15只/);
  assert.doesNotMatch(prompt, /固定构图：三排/);
});

test("generic plural piglets do not borrow the named tiny porky's identity", () => {
  const prompt = buildArtPrompt({
    title: "小猪们的新鲜事",
    body: "一群小猪在院子里晒太阳。"
  });
  const namedTinyPorky = PORKY_CAST.find((porky) => porky.name === "小猪");

  assert.ok(!prompt.includes(namedTinyPorky.visual));
  assert.match(prompt, /正文没有明确点名固定演员表成员/);
  assert.doesNotMatch(prompt, /必须恰好有15只/);
});

test("numbers and broad herd mentions alone do not force a full-cast portrait", () => {
  const focusedStories = [
    {
      title: "15只小猪中只有呆呆猪没睡",
      body: "其他猪都已经睡着，呆呆猪一个人在窗边看星星。"
    },
    {
      title: "所有小猪都睡了，只有呆呆猪醒着",
      body: "这一刻只有呆呆猪坐在窗前。"
    },
    {
      title: "三只小猪晒太阳",
      body: "三只普通小猪在草地上晒太阳。"
    }
  ];
  const namedTinyPorky = PORKY_CAST.find((porky) => porky.name === "小猪");

  for (const note of focusedStories) {
    const prompt = buildArtPrompt(note);
    assert.doesNotMatch(prompt, /必须恰好有15只/, note.title);
  }

  assert.ok(!buildArtPrompt(focusedStories[2]).includes(namedTinyPorky.visual));
});

test("only collective scenes without an exception enable full-cast mode", () => {
  const fullCastNotes = [
    { title: "全员到齐", body: "今天拍纪念照。" },
    { title: "山庄纪念日", body: "十五只小猪的全家福终于拍好啦。" },
    { title: "一起拍照", body: "所有小猪一起合照。" },
    { title: "今天去郊游", body: "十五只小猪今天在草地上一起野餐。" }
  ];
  const focusedNotes = [
    { title: "合照没拍成", body: "全员合照没拍成，最后只有呆呆猪来了。" },
    { title: "有人没睡", body: "所有小猪都睡了，只有呆呆猪醒着。" },
    { title: "超市进货", body: "十五猪猪昨天去超市进货，后来呆呆猪单独卖零食。" },
    { title: "大家都知道", body: "所有小猪都知道呆呆猪今天很难过。" }
  ];

  for (const note of fullCastNotes) {
    assert.equal(selectNoteArtCast(note).mode, "full", note.title);
  }

  for (const note of focusedNotes) {
    assert.equal(selectNoteArtCast(note).mode, "story", note.title);
  }
});

test("cast selection is exact for fixed names and conservative for the ambiguous named tiny pig", () => {
  assert.deepEqual(
    selectNoteArtCast({
      title: "一起整理房间",
      body: "呆呆猪和乖乖猪一起整理房间。"
    }).fixedCastNames,
    ["乖乖猪", "呆呆猪"]
  );
  assert.deepEqual(
    selectNoteArtCast({
      title: "方向盘找到了",
      body: "最小的那只小猪抱着黄色玩具方向盘。"
    }).fixedCastNames,
    ["小猪"]
  );
  assert.deepEqual(
    selectNoteArtCast({
      title: "一群快乐的小猪",
      body: "这些小猪都困了。"
    }).fixedCastNames,
    []
  );
  assert.deepEqual(
    selectNoteArtCast({ title: "小猪都困了", body: "毯子已经准备好了。" }).fixedCastNames,
    []
  );
  assert.deepEqual(
    selectNoteArtCast({ title: "小猪纷纷回家", body: "天快黑了。" }).fixedCastNames,
    []
  );
});

test("the named tiny porky is summoned by driving context but not by plural piglets", () => {
  assert.deepEqual(
    selectNoteArtCast({
      title: "周末兜风",
      body: "小猪开车带大家去看海。"
    }).fixedCastNames,
    ["小猪"]
  );
  assert.deepEqual(
    selectNoteArtCast({
      title: "司机就位",
      body: "握住方向盘的小猪出发啦。"
    }).fixedCastNames,
    ["小猪"]
  );
  assert.deepEqual(
    selectNoteArtCast({
      title: "郊游",
      body: "小猪们开车去郊游。"
    }).fixedCastNames,
    []
  );
});

test("the guest cast is frozen and mentioning 白菜 injects the cabbage identity", () => {
  assert.ok(Object.isFrozen(GUEST_CAST));
  assert.ok(GUEST_CAST.every(Object.isFrozen));

  const note = { title: "看流星雨", body: "呆呆猪和白菜一起看流星雨。" };
  const selection = selectNoteArtCast(note);

  assert.deepEqual(selection.guestCastNames, ["白白菜"]);
  assert.deepEqual(selection.fixedCastNames, ["呆呆猪"]);

  const prompt = buildArtPrompt(note);
  assert.match(prompt, /白白菜/);
  assert.match(prompt, /直立的拟人化大白菜/);
  assert.match(prompt, /不加猪鼻子/);
  assert.match(prompt, /不要把它替换成任何小猪/);

  const fullNameSelection = selectNoteArtCast({
    title: "白白菜来做客",
    body: "白白菜今天来山庄玩。"
  });
  assert.deepEqual(fullNameSelection.guestCastNames, ["白白菜"]);
});

test("a full-cast note can bring 白白菜 along without breaking the 15-pig contract", () => {
  const prompt = buildArtPrompt({
    title: "全员到齐",
    body: "十五只小猪一起拍全家福，白白菜也来了。"
  });

  assert.match(prompt, /必须恰好有15只/);
  assert.match(prompt, /白白菜/);
  assert.match(prompt, /不占用15只小猪的名额/);
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
