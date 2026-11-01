// Preserve the user-selected composition; encode uncropped homepage derivatives.
// Run: node scripts/build-villa-welcome.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../art/homepage/villa-welcome-approved.png', import.meta.url));
for (const width of [768, 1536]) {
  const name = width === 1536 ? 'villa-welcome.webp' : `villa-welcome-${width}.webp`;
  const output = fileURLToPath(new URL(`../public/assets/${name}`, import.meta.url));
  const info = await sharp(source).resize({ width }).webp({ quality: 90, effort: 6 }).toFile(output);
  console.log(`${name}: ${info.width} x ${info.height}, ${info.size} bytes`);
}
