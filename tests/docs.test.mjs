import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// CLAUDE.md and AGENTS.md are one document under two filenames, because
// different agents look for different names. They are kept byte-identical on
// purpose: they once drifted silently for three weeks, and the stale copy went
// on describing an /admin/ auth model (Decap OAuth) that had already been
// replaced, while omitting the entire 猪猪小记 blog. A reviewer reading the
// stale half reviews code against a repo that no longer exists.
//
// Editing one and copying it over the other is the whole workflow; this test
// is what makes forgetting fail loudly.
const read = (name) =>
  readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");

// Report the first divergence rather than dumping both files: the whole point
// is that whoever trips this can see *where* to fix in one glance.
function firstDifference(a, b) {
  const left = a.split("\n");
  const right = b.split("\n");

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) {
      return {
        line: index + 1,
        claude: left[index] ?? "(文件到此结束)",
        agents: right[index] ?? "(文件到此结束)"
      };
    }
  }

  return null;
}

test("CLAUDE.md and AGENTS.md are byte-identical", () => {
  const difference = firstDifference(read("CLAUDE.md"), read("AGENTS.md"));

  assert.equal(
    difference,
    null,
    difference &&
      "CLAUDE.md 与 AGENTS.md 已分叉。它们是同一份文档的两个文件名，必须逐字一致——" +
        `改完一个就把它覆盖到另一个（cp CLAUDE.md AGENTS.md）。\n` +
        `首处差异在第 ${difference.line} 行：\n` +
        `  CLAUDE.md: ${JSON.stringify(difference.claude)}\n` +
        `  AGENTS.md: ${JSON.stringify(difference.agents)}`
  );
});

test("the mirror rule is written down in the document itself", () => {
  const claude = read("CLAUDE.md");

  // Someone opening either file should learn about the rule there, not only
  // by tripping this test.
  assert.match(claude, /AGENTS\.md/);
  assert.match(claude, /逐字一致/);
});
