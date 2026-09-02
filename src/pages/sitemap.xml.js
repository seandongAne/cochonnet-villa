// /sitemap.xml — every public page plus one entry per 猪猪小记 note, with
// lastmod from the note dates. Admin pages are deliberately absent (they
// carry noindex). Referenced from public/robots.txt.
import notesData from "../../content/notes.json";
import { normalizeNotes } from "../render-notes.js";
import { buildSitemapEntries, renderSitemapXml } from "../seo.js";

export function GET({ site }) {
  const entries = buildSitemapEntries(normalizeNotes(notesData), { site });

  return new Response(renderSitemapXml(entries), {
    headers: { "Content-Type": "application/xml; charset=utf-8" }
  });
}
