"""Extract a curated runtime GLB without changing source geometry or materials."""
import copy
import hashlib
import json
from pathlib import Path
import struct
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NAMES = ['Tent_Orange', 'Campfire', 'Folding_Chair', 'Camp_Table', 'Lantern',
         'Mug', 'Kettle', 'Backpack', 'Cooler_Box', 'SleepingBag_Rolled',
         'Firewood_Stack', 'Pine_Tree_Tall', 'Pine_Tree_Small', 'Grass_Tuft',
         'Grass_Tall', 'Rock_Small', 'Rock_Medium_Moss', 'Pebbles',
         'Fern', 'Mushroom_Cluster', 'Map_Open']


def import_pack(source, archive):
    raw = source.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    binary = raw[28 + length:]
    selected = [copy.deepcopy(n) for n in doc['nodes'] if n['name'] in {'SM_' + n for n in NAMES}]
    assert len(selected) == len(NAMES)
    out = {k: copy.deepcopy(doc[k]) for k in ['asset', 'materials', 'textures', 'images', 'samplers', 'extensionsUsed'] if k in doc}
    out.update(scene=0, scenes=[{'name': 'Camping props', 'nodes': list(range(len(selected)))}], nodes=selected, meshes=[], accessors=[], bufferViews=[])
    chunks = bytearray()
    views, accessors = {}, {}

    def view(index):
        if index not in views:
            old = copy.deepcopy(doc['bufferViews'][index])
            offset = old.get('byteOffset', 0)
            chunks.extend(b'\0' * (-len(chunks) % 4))
            old['byteOffset'] = len(chunks)
            chunks.extend(binary[offset:offset + old['byteLength']])
            views[index] = len(out['bufferViews'])
            out['bufferViews'].append(old)
        return views[index]

    def accessor(index):
        if index not in accessors:
            old = copy.deepcopy(doc['accessors'][index])
            old['bufferView'] = view(old['bufferView'])
            accessors[index] = len(out['accessors'])
            out['accessors'].append(old)
        return accessors[index]

    for node in selected:
        mesh = copy.deepcopy(doc['meshes'][node['mesh']])
        node['mesh'] = len(out['meshes'])
        node.pop('translation', None)
        for primitive in mesh['primitives']:
            primitive['attributes'] = {k: accessor(v) for k, v in primitive['attributes'].items()}
            if 'indices' in primitive:
                primitive['indices'] = accessor(primitive['indices'])
        out['meshes'].append(mesh)
    for image in out['images']:
        image['bufferView'] = view(image['bufferView'])
    out['buffers'] = [{'byteLength': len(chunks)}]
    encoded = json.dumps(out, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    chunks.extend(b'\0' * (-len(chunks) % 4))
    result = struct.pack('<III', 0x46546c67, 2, 28 + len(encoded) + len(chunks)) + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + struct.pack('<II', len(chunks), 0x004e4942) + chunks
    target = ROOT / 'public/little-universe/camping'
    target.mkdir(parents=True, exist_ok=True)
    (target / 'camping-props.glb').write_bytes(result)
    with zipfile.ZipFile(archive) as package:
        entries = [i.filename for i in package.infolist() if i.filename.startswith('GLB/SM_') and i.filename.endswith('.glb')]
        identical = package.read('GLB/_AllProps.glb') == raw
    manifest = {'source': source.name, 'sourceSha256': hashlib.sha256(raw).hexdigest(), 'archive': archive.name, 'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'individualProps': len(entries), 'allPropsNodes': len(doc['nodes']), 'archiveAllPropsIdentical': identical, 'selectedNodes': [n['name'] for n in selected], 'output': 'camping-props.glb', 'outputBytes': len(result), 'outputSha256': hashlib.sha256(result).hexdigest(), 'materials': 'Original embedded palette, UVs, PBR factors and emissive material preserved.', 'rights': 'Author-supplied download. No license document in ZIP; no redistribution license inferred.', 'rebuild': 'python scripts/import-camping-pack.py <LowPoly_Camping_AllProps.glb> <Camping_Pack_GLB.zip>'}
    (target / 'sources.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    import_pack(Path(sys.argv[1]), Path(sys.argv[2]))
