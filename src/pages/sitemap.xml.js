// Public routes only. Password-gated notes use noindex and generic metadata.
import { buildSitemapEntries, renderSitemapXml } from "../seo.js";

export function GET({ site }) {
  const entries = buildSitemapEntries([], { site });

  return new Response(renderSitemapXml(entries), {
    headers: { "Content-Type": "application/xml; charset=utf-8" }
  });
}
