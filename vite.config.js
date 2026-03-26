import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

import { escapeHtml, renderSite } from "./src/render-site.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const resolvedContentFile = resolve(rootDir, "content/site.json");
const mainIndexFile = resolve(rootDir, "index.html");
const adminPageFile = resolve(rootDir, "admin/index.html");
const siteUrl = "https://www.cochonnetvilla.ca";

function loadSiteContent() {
  return JSON.parse(readFileSync(resolvedContentFile, "utf8"));
}

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: mainIndexFile,
        admin: adminPageFile
      }
    }
  },
  plugins: [
    {
      name: "cochonnet-villa-content",
      transformIndexHtml(html) {
        const site = loadSiteContent();
        const title = escapeHtml(site?.seo?.title || "Cochonnet Villa");
        const description = escapeHtml(site?.seo?.description || "");

        return html
          .replace(/%SEO_TITLE%/g, title)
          .replace(/%SEO_DESCRIPTION%/g, description)
          .replace(/%SITE_URL%/g, siteUrl)
          .replace("%APP_HTML%", renderSite(site));
      },
      handleHotUpdate(context) {
        if (context.file === resolvedContentFile) {
          context.server.ws.send({ type: "full-reload" });
        }
      }
    }
  ]
});
