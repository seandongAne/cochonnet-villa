// /robots.txt — generated so the Sitemap line follows astro.config `site`.
import { renderRobotsTxt } from "../seo.js";

export function GET({ site }) {
  return new Response(renderRobotsTxt({ site }), {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
