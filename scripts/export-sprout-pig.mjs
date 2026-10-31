// Export a standalone local GLB; no remote service, source-image upload, or API key.
import { mkdir, writeFile } from 'node:fs/promises';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createSproutPigStudy } from '../src/little-universe/sprout-pig.js';
import { disposeMiniature } from '../src/little-universe/miniature.js';

// The texture-free exporter only needs Blob -> ArrayBuffer in Node.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); });
  }
};
const model = createSproutPigStudy();
try {
  const glb = await new GLTFExporter().parseAsync(model, { binary: true });
  await mkdir('art/little-universe/review', { recursive: true });
  await writeFile('art/little-universe/review/sprout-pig-study-v1.glb', Buffer.from(glb));
  console.log(`Exported sprout-pig-study-v1.glb: ${glb.byteLength} bytes`);
} finally { disposeMiniature(model); }
