import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Usage: node scripts/import-da20.mjs <exported.glb> <original.blend>
const [input, source] = process.argv.slice(2);
if (!input || !source) throw new Error('Provide the exported GLB and original blend.');
const output = 'public/little-universe/models/diamond-da20-c1.glb';
execFileSync(process.execPath, ['node_modules/gltfpack/cli.js', '-i', input, '-o', output,
  '-cc', '-si', '0.35', '-se', '0.001', '-vpf', '-vtf', '-kn', '-km'], { stdio: 'inherit' });
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifestPath = 'public/little-universe/models/sources.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath));
const record = {
  id: 'diamond-da20-c1', source: path.basename(source), sourceBytes: fs.statSync(source).size,
  sourceSha256: hash(source), runtimeBytes: fs.statSync(output).size, sha256: hash(output),
  simplificationRatio: .35, simplificationError: .001,
  conversion: 'bpy 4.5.9; scripts disabled; evaluated frame 1; 592 visible mesh/curve objects merged; hidden cutters, cameras, lights and rigs excluded.',
  materials: 'Packed source livery and PBR maps; 2K body/labels, other maps at most 1K. Cycles mixtures use primary source BSDF. Canopy uses alpha glass for the web viewer.',
  license: 'User-supplied model; original licensing remains with its rights holder. No public-domain claim or third-party upload.'
};
manifest.models = manifest.models.filter(m => m.id !== record.id);
manifest.models.push(record);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({record, totalBytes:manifest.models.reduce((s,m)=>s+m.runtimeBytes,0)}, null, 2));
