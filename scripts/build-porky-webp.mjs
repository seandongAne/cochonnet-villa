// Encode the porky portraits into the WebP files the landing page serves.
//
// public/porkies/<name>.png (1024², ~2 MB each) stay in place as the originals
// — scripts/generate-og-cover.py composes the share card from them — while
// content/site.json points at the <name>.webp siblings this script writes.
// The largest rendered box is .porky-photo-frame at 9rem: ≈ 290 CSS px on the
// ultra-wide 32px root, so 768 px covers 2× DPR with margin.
//
// `sharp` arrives with Astro (its image service), so no extra dependency.
//
//     node scripts/build-porky-webp.mjs

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const DIR = fileURLToPath(new URL("../public/porkies/", import.meta.url));
const WIDTH = 768;
const QUALITY = 80;

const sources = (await readdir(DIR)).filter((name) => name.endsWith(".png")).sort();
let total = 0;

for (const name of sources) {
  const output = path.join(DIR, name.replace(/\.png$/, ".webp"));
  const info = await sharp(path.join(DIR, name))
    .resize(WIDTH, WIDTH, { fit: "cover" })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(output);

  total += info.size;
  console.log(`${name} → ${path.basename(output)}  ${info.width}×${info.height}  ${Math.round(info.size / 1024)} KB`);
}

console.log(`${sources.length} portraits, ${Math.round(total / 1024)} KB total`);
