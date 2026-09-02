// Pins the crawlable surface: canonical URLs, sitemap/robots, share images,
// JSON-LD shapes, and the noindex on the editors. Node-pure — the Astro pages
// are read as text; the built HTML is checked by `npm run build` + preview.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

import { normalizeNotes, noteArtDimensions, renderNotePage, renderNotesPage } from "../src/render-notes.js";
import { renderSite } from "../src/render-site.js";
import {
  DEFAULT_SHARE_IMAGE,
  SITE_URL,
  absoluteUrl,
  blogJsonLd,
  blogPostingJsonLd,
  breadcrumbJsonLd,
  buildSitemapEntries,
  normalizePath,
  noteShareImage,
  renderRobotsTxt,
  renderSitemapXml,
  serializeJsonLd,
  websiteJsonLd
} from "../src/seo.js";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const notes = normalizeNotes(JSON.parse(await read("../content/notes.json")));

const artNote = {
  slug: "2026-08-23",
  title: "快乐的周末",
  date: "2026-08-23",
  mood: "满足",
  body: "## 徒步\n今天走了 trail。",
  image: "/notes-art/2026-08-23.webp"
};

test("paths canonicalize to trailing-slash directory URLs under the configured site", async () => {
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath("notes"), "/notes/");
  assert.equal(normalizePath("/notes/2026-08-23"), "/notes/2026-08-23/");
  assert.equal(normalizePath("/sitemap.xml"), "/sitemap.xml");

  assert.equal(absoluteUrl("/"), `${SITE_URL}/`);
  assert.equal(absoluteUrl("/notes/x", new URL("https://example.test/")), "https://example.test/notes/x/");
  assert.equal(absoluteUrl("https://cdn.example/a.png"), "https://cdn.example/a.png");

  // astro.config `site` and SITE_URL are the same origin, or canonicals drift.
  assert.match(await read("../astro.config.mjs"), new RegExp(`site:\\s*"${SITE_URL}"`));
});

test("the sitemap lists every public page and note, dated, and no admin route", () => {
  const entries = buildSitemapEntries(notes);
  const locs = entries.map((entry) => entry.loc);
  const newest = notes[0].date;

  assert.deepEqual(entries[0], { loc: `${SITE_URL}/`, lastmod: newest });
  assert.deepEqual(entries[1], { loc: `${SITE_URL}/notes/`, lastmod: newest });
  assert.deepEqual(entries.at(-1), { loc: `${SITE_URL}/villa-map/` });

  for (const note of notes) {
    assert.ok(locs.includes(`${SITE_URL}/notes/${note.slug}/`), note.slug);
  }

  assert.equal(entries.length, notes.length + 3);
  assert.ok(locs.every((loc) => loc.startsWith(`${SITE_URL}/`) && loc.endsWith("/")));
  assert.ok(!locs.some((loc) => loc.includes("/admin")));

  const xml = renderSitemapXml([{ loc: "https://x.test/a&b/", lastmod: "2026-01-02" }]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/x\.test\/a&amp;b\/<\/loc>\n\s*<lastmod>2026-01-02<\/lastmod>/);
});

test("robots.txt advertises the sitemap and leaves /admin/ crawlable so its noindex is seen", async () => {
  const robots = renderRobotsTxt();
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/);
  assert.match(robots, new RegExp(`Sitemap: ${SITE_URL}/sitemap\\.xml`));
  assert.doesNotMatch(robots, /Disallow/);

  for (const file of ["../admin/index.html", "../src/pages/admin/notes.astro"]) {
    assert.match(await read(file), /<meta name="robots" content="noindex, nofollow" \/>/, `${file} is noindex`);
  }

  for (const file of ["../src/pages/robots.txt.js", "../src/pages/sitemap.xml.js"]) {
    assert.match(await read(file), /export function GET\(/, `${file} is an endpoint`);
  }

  // Internal links into the editors don't pass crawl equity.
  assert.match(renderSite({ porkies: [] }), /href="\.\/admin\/" rel="nofollow"/);
  assert.match(renderNotesPage(notes), /href="\/admin\/notes\/" rel="nofollow"/);
  assert.doesNotMatch(renderNotesPage(notes), /href="\/admin\/notes\/">/);
});

test("share images: note art with known dimensions, otherwise the site card", () => {
  const art = noteShareImage(artNote);
  assert.deepEqual(art, {
    url: `${SITE_URL}/notes-art/2026-08-23.webp`,
    width: 1536,
    height: 1024,
    alt: "《快乐的周末》的小猪漫画配图"
  });

  const foreign = noteShareImage({ ...artNote, image: "https://cdn.example/pic.png" });
  assert.equal(foreign.url, "https://cdn.example/pic.png");
  assert.equal(foreign.width, undefined);

  const bare = noteShareImage({ ...artNote, image: undefined });
  assert.equal(bare.url, `${SITE_URL}${DEFAULT_SHARE_IMAGE.path}`);
  assert.deepEqual([bare.width, bare.height], [1200, 630]);

  assert.deepEqual(noteArtDimensions("/notes-art/x.webp"), { width: 1536, height: 1024 });
  assert.equal(noteArtDimensions("https://cdn.example/pic.png"), null);
});

test("the default share card ships at 1200×630 as a JPEG", async () => {
  const bytes = await readFile(new URL(`../public${DEFAULT_SHARE_IMAGE.path}`, import.meta.url));
  assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xd8], "JPEG SOI");
  assert.ok(bytes.length < 600 * 1024, "share card stays lean");

  // Walk the marker segments to the first SOF (baseline or progressive).
  let offset = 2;
  let size = null;

  while (offset < bytes.length - 9) {
    assert.equal(bytes[offset], 0xff, "marker alignment");
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);

    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      size = { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      break;
    }

    offset += 2 + length;
  }

  assert.deepEqual(size, { width: DEFAULT_SHARE_IMAGE.width, height: DEFAULT_SHARE_IMAGE.height });
});

test("note art on the detail page is the LCP image: eager, prioritized, box reserved", () => {
  const html = renderNotePage(artNote, {});
  assert.match(
    html,
    /<figure class="note-art"><img src="\/notes-art\/2026-08-23\.webp" alt="《快乐的周末》的小猪漫画配图" width="1536" height="1024" loading="eager" fetchpriority="high" decoding="async" \/><\/figure>/
  );

  const foreign = renderNotePage({ ...artNote, image: "https://cdn.example/pic.png" }, {});
  assert.match(foreign, /<img src="https:\/\/cdn\.example\/pic\.png"[^>]*loading="eager"/);
  assert.doesNotMatch(foreign, /width="1536"/, "unknown art gets no guessed box");
});

test("JSON-LD: WebSite, Blog, BlogPosting and BreadcrumbList carry absolute URLs", () => {
  const site = websiteJsonLd({ description: "hello" });
  assert.equal(site["@type"], "WebSite");
  assert.equal(site.url, `${SITE_URL}/`);
  assert.deepEqual(site.inLanguage, ["en", "zh-Hans"]);

  const posting = blogPostingJsonLd(artNote);
  assert.equal(posting["@context"], "https://schema.org");
  assert.equal(posting["@type"], "BlogPosting");
  assert.equal(posting.headline, "快乐的周末");
  assert.equal(posting.url, `${SITE_URL}/notes/2026-08-23/`);
  assert.equal(posting.mainEntityOfPage, posting.url);
  assert.equal(posting.datePublished, "2026-08-23");
  assert.deepEqual(posting.image, [`${SITE_URL}/notes-art/2026-08-23.webp`]);
  assert.equal(posting.inLanguage, "zh-Hans");
  assert.equal(posting.publisher.url, `${SITE_URL}/`);
  assert.ok(!("datePublished" in blogPostingJsonLd({ ...artNote, date: "" })), "undated notes claim no date");

  const blog = blogJsonLd(notes, { limit: 5 });
  assert.equal(blog["@type"], "Blog");
  assert.equal(blog.url, `${SITE_URL}/notes/`);
  assert.equal(blog.blogPost.length, Math.min(5, notes.length));
  assert.ok(blog.blogPost.every((post) => !("@context" in post)), "nested postings carry no context");

  const crumbs = breadcrumbJsonLd([
    { name: "猪猪山庄", path: "/" },
    { name: "猪猪小记", path: "/notes/" }
  ]);
  assert.deepEqual(
    crumbs.itemListElement.map((item) => [item.position, item.item]),
    [
      [1, `${SITE_URL}/`],
      [2, `${SITE_URL}/notes/`]
    ]
  );

  // A `</script>` inside note text must not be able to close the JSON-LD tag.
  const serialized = serializeJsonLd(blogPostingJsonLd({ ...artNote, title: "x</script><b>" }));
  assert.ok(!serialized.includes("</script"));
  assert.equal(JSON.parse(serialized).headline, "x</script><b>");
});

test("every public page renders SeoHead with an explicit canonical path", async () => {
  for (const [page, path] of [
    ["../src/pages/index.astro", '"/"'],
    ["../src/pages/notes/index.astro", '"/notes/"'],
    ["../src/pages/notes/[slug].astro", "{path}"],
    ["../src/pages/villa-map.astro", '"/villa-map/"']
  ]) {
    const source = await read(page);
    assert.match(source, /import SeoHead from "[./]+components\/SeoHead\.astro"/, `${page} imports SeoHead`);
    assert.match(source, /<SeoHead[\s\S]*?\/>/, `${page} renders SeoHead`);
    assert.ok(source.includes(`path=${path}`), `${page} passes path=${path}`);
  }

  const head = await read("../src/components/SeoHead.astro");
  for (const tag of [
    'rel="canonical"',
    'property="og:image"',
    'property="og:url"',
    'name="twitter:card"',
    'type="application/ld+json" is:inline set:html='
  ]) {
    assert.ok(head.includes(tag), `SeoHead emits ${tag}`);
  }
});

test("landing portraits are served as lean WebP, with the PNG originals kept for the share card", async () => {
  const site = JSON.parse(await read("../content/site.json"));
  const porkies = site.porkies.filter((porky) => porky.image);
  assert.equal(porkies.length, 15);

  for (const porky of porkies) {
    assert.match(porky.image, /^\/porkies\/[a-z]+\.webp$/, `${porky.name} serves WebP`);
    const bytes = await readFile(new URL(`../public${porky.image}`, import.meta.url));
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", `${porky.image} is a RIFF container`);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", `${porky.image} is WebP`);
    assert.ok(bytes.length < 160 * 1024, `${porky.image} stays lean (${bytes.length} bytes)`);
    await access(new URL(`../public${porky.image.replace(/\.webp$/, ".png")}`, import.meta.url));
  }
});

test("web fonts load from a head <link>, not a CSS @import chain", async () => {
  assert.doesNotMatch(await read("../src/styles.css"), /@import\s+url\(/, "no render-blocking @import chain");

  const fonts = await read("../src/components/Fonts.astro");
  assert.match(fonts, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>/);
  assert.match(fonts, /<link rel="stylesheet" href=\{FONTS_URL\} \/>/);
  assert.match(fonts, /fonts\.googleapis\.com\/css2\?family=Fraunces[^"]*Plus\+Jakarta\+Sans[^"]*display=swap/);

  for (const page of ["../src/pages/index.astro", "../src/pages/notes/index.astro", "../src/pages/notes/[slug].astro"]) {
    const source = await read(page);
    assert.match(source, /import Fonts from "[./]+components\/Fonts\.astro"/, `${page} imports Fonts`);
    assert.match(source, /<Fonts \/>/, `${page} renders Fonts`);
    assert.doesNotMatch(source, /rel="preconnect"/, `${page} leaves the preconnects to Fonts`);
  }
});
