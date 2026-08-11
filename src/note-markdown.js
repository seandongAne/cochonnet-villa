// Shared Markdown contract for 猪猪小记. This module stays browser/Node safe
// so the editor preview, Astro build, excerpts and tests all use one parser.

import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  // Notes are authored text, not trusted HTML. Markdown links are also
  // validated by markdown-it, so unsafe protocols never become href/src.
  html: false,
  // Preserve the writing studio's existing single-newline behaviour while
  // using the real Markdown block/inline grammar everywhere else.
  breaks: true,
  xhtmlOut: true,
  linkify: false,
  typographer: false
});

function normalizeLineEndings(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

export function normalizeNoteMarkdownSource(value) {
  const lines = normalizeLineEndings(value).split("\n");

  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }

  while (lines.length && !lines.at(-1).trim()) {
    lines.pop();
  }

  return lines.join("\n");
}

function mapMarkdownTextLines(value, visit) {
  const lines = normalizeLineEndings(value).split("\n");
  let fenceCharacter = "";
  let fenceLength = 0;

  return lines.map((line, index) => {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);

    if (fenceCharacter) {
      if (
        fence &&
        fence[1][0] === fenceCharacter &&
        fence[1].length >= fenceLength &&
        !fence[2].trim()
      ) {
        fenceCharacter = "";
        fenceLength = 0;
      }

      return line;
    }

    if (fence) {
      fenceCharacter = fence[1][0];
      fenceLength = fence[1].length;
      return line;
    }

    return visit(line, index);
  });
}

// Older notes used compact Chinese headings such as `##标题`. CommonMark
// requires whitespace after the marker. The editor applies this narrow,
// deterministic migration on save; fenced code and single-# hashtags remain
// untouched so normal prose cannot silently change meaning.
export function canonicalizeNoteMarkdown(value) {
  const formatted = mapMarkdownTextLines(value, (line) =>
    line.replace(/^( {0,3}#{2,6})(?=[^\s#])/, "$1 ")
  ).join("\n");

  return normalizeNoteMarkdownSource(formatted);
}

export function findNoteMarkdownIssues(value) {
  const issues = [];

  mapMarkdownTextLines(value, (line, index) => {
    if (/^ {0,3}#{2,6}(?=[^\s#])/.test(line)) {
      issues.push({
        code: "compact-heading",
        line: index + 1,
        message: `第 ${index + 1} 行：标题的 # 后需要一个空格。`
      });
    }

    return line;
  });

  return issues;
}

export function renderNoteMarkdown(value) {
  return markdown.render(normalizeLineEndings(value)).trim();
}

function inlineTokenText(token) {
  if (Array.isArray(token.children)) {
    return token.children.map(inlineTokenText).join("");
  }

  switch (token.type) {
    case "text":
    case "code_inline":
    case "code_block":
    case "fence":
    case "image":
      return token.content;
    case "softbreak":
    case "hardbreak":
      return " ";
    default:
      return "";
  }
}

export function noteMarkdownToPlainText(value) {
  return markdown
    .parse(normalizeLineEndings(value), {})
    .map(inlineTokenText)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
