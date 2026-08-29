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

// `[[character name]]` is an author-only identity marker. It renders as plain
// text while remaining machine-readable in the parsed token stream. Keeping it
// as an inline rule means code spans and fenced code retain their literal
// brackets instead of accidentally summoning a note-art character.
function noteCharacterMarkerRule(state, silent) {
  const start = state.pos;

  if (!state.src.startsWith("[[", start)) {
    return false;
  }

  const end = state.src.indexOf("]]", start + 2);
  if (end < 0 || end >= state.posMax) {
    return false;
  }

  const source = state.src.slice(start + 2, end);
  const name = source.trim();
  if (!name || name.length > 64 || /[\[\]\r\n]/u.test(source)) {
    return false;
  }

  if (!silent) {
    const token = state.push("note_character_marker", "", 0);
    token.content = name;
    token.markup = "[[…]]";
  }

  state.pos = end + 2;
  return true;
}

markdown.inline.ruler.before("link", "note_character_marker", noteCharacterMarkerRule);
markdown.renderer.rules.note_character_marker = (tokens, index) =>
  markdown.utils.escapeHtml(tokens[index].content);

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
    case "note_character_marker":
      return token.content;
    case "softbreak":
    case "hardbreak":
      return " ";
    default:
      return "";
  }
}

export function extractNoteCharacterMarkers(value) {
  const names = [];
  const seen = new Set();

  function visit(token) {
    if (token.type === "note_character_marker" && !seen.has(token.content)) {
      seen.add(token.content);
      names.push(token.content);
    }

    if (Array.isArray(token.children)) {
      token.children.forEach(visit);
    }
  }

  markdown.parse(normalizeLineEndings(value), {}).forEach(visit);
  return names;
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
