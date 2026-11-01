import { readFile } from 'node:fs/promises';

// Registered only by the development-only review integration.
export async function GET() {
  const bytes = await readFile(new URL('../../art/little-universe/review/sprout-pig-study-v1.glb', import.meta.url));
  return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'no-store' } });
}
