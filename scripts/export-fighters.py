"""Restore supplied PBR maps and export four independent static aircraft.
Usage: python scripts/export-fighters.py INPUT.blend EXTRACTED_TEXTURE_DIR OUTPUT_DIR
Source files are never saved; embedded scripts remain disabled.
"""
import bpy
import json
import sys
import numpy as np
from pathlib import Path
from mathutils import Vector

source, textures, output = map(Path, sys.argv[-3:])
output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source.resolve()), use_scripts=False)
files = {}
for path in textures.rglob('*.png'):
    files.setdefault(path.stem.casefold(), []).append(path)
restored = []
for image in bpy.data.images:
    if image.source != 'FILE':
        continue
    stem = Path(image.filepath.replace('\\', '/')).stem.casefold()
    matches = files.get(stem, [])
    if len(matches) != 1:
        raise RuntimeError(f'Expected one texture match for {image.filepath}: {matches}')
    image.filepath = str(matches[0].resolve())
    image.reload()
    if not all(image.size):
        raise RuntimeError(f'Unreadable texture: {matches[0]}')
    restored.append({'image': image.name, 'file': matches[0].relative_to(textures).as_posix(), 'size': list(image.size)})

# The supplied F/A-18 material lacks its Base Color node entirely.
material = bpy.data.materials['F18-main']
node = material.node_tree.nodes.new('ShaderNodeTexImage')
node.image = bpy.data.images.load(str((textures / 'FA18/F18-main_BaseColor.png').resolve()))
material.node_tree.links.new(node.outputs['Color'], material.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
restored.append({'image': node.image.name, 'file': 'FA18/F18-main_BaseColor.png', 'size': list(node.image.size)})

# Preserve supplied color interpretation, normal strength, UVs and all PBR links.
# Keep 4K liveries and cockpit maps; bound normals to 2K and scalar maps to 1K.
for image in bpy.data.images:
    if image.source != 'FILE' or not all(image.size):
        continue
    limit = 4096 if 'BaseColor' in image.filepath or '_Alpha' in image.filepath else 2048 if '_Normal' in image.filepath else 1024
    factor = min(1, limit / max(image.size))
    if factor < 1:
        image.scale(round(image.size[0] * factor), round(image.size[1] * factor))
bpy.context.scene.frame_set(1)
depsgraph = bpy.context.evaluated_depsgraph_get()
reports = []
opaque_materials = {}
alpha_pixels = {}
def separate_opaque_faces(mesh):
    """Keep glass alpha while letting opaque paint write depth correctly in glTF."""
    uv = mesh.uv_layers.active
    if not uv:
        raise RuntimeError('Aircraft mesh is missing source UVs')
    for slot, mat in list(enumerate(mesh.materials)):
        if not mat or not mat.use_nodes:
            continue
        shader = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not shader or not shader.inputs['Alpha'].is_linked:
            continue
        alpha_node = shader.inputs['Alpha'].links[0].from_node
        if alpha_node.type != 'TEX_IMAGE':
            raise RuntimeError(f'Unsupported source alpha graph: {mat.name}')
        image = alpha_node.image
        if image.name not in alpha_pixels:
            pixels = np.empty(len(image.pixels), dtype=np.float32)
            image.pixels.foreach_get(pixels)
            alpha_pixels[image.name] = pixels.reshape(image.size[1], image.size[0], 4)[:, :, 0].copy()
        pixels = alpha_pixels[image.name]
        if mat.name not in opaque_materials:
            opaque = mat.copy()
            opaque.name = mat.name + '-opaque-paint'
            opaque_shader = next(n for n in opaque.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            for link in list(opaque_shader.inputs['Alpha'].links):
                opaque.node_tree.links.remove(link)
            opaque_shader.inputs['Alpha'].default_value = 1
            opaque.surface_render_method = 'DITHERED'
            opaque_materials[mat.name] = opaque
        mesh.materials.append(opaque_materials[mat.name])
        opaque_slot = len(mesh.materials) - 1
        for polygon in mesh.polygons:
            if polygon.material_index != slot:
                continue
            coords = [uv.data[i].uv.copy() for i in polygon.loop_indices]
            coords.append(sum(coords, Vector((0, 0))) / len(coords))
            if all(pixels[min(int(v.y % 1 * pixels.shape[0]), pixels.shape[0]-1), min(int(v.x % 1 * pixels.shape[1]), pixels.shape[1]-1)] >= .99 for v in coords):
                polygon.material_index = opaque_slot
for collection_name, slug in [('F14', 'f14-tomcat'), ('F15E', 'f15e-strike-eagle'), ('F16', 'f16-fighting-falcon'), ('FA18', 'fa18-hornet')]:
    collection = bpy.data.collections[collection_name]
    originals = list(collection.all_objects)
    scene = bpy.data.scenes.new(slug)
    clones = []
    for original in originals:
        if original.type != 'MESH' or original.hide_render:
            continue
        mesh = bpy.data.meshes.new_from_object(original.evaluated_get(depsgraph), depsgraph=depsgraph)
        # Blender joins UV layers by name, not by their render-active role.
        # These sources mix F14_main_body_UV, F14_wheel_UV, map1 and UVMap.
        # Normalize only the layer name; preserve every original UV coordinate.
        render_uv = next((u for u in mesh.uv_layers if u.active_render), mesh.uv_layers.active)
        if render_uv is None:
            raise RuntimeError(f'Missing render UV: {original.name}')
        for layer in list(mesh.uv_layers):
            if layer != render_uv:
                mesh.uv_layers.remove(layer)
        render_uv.name = 'UVMap'
        mesh.uv_layers.active_index = 0
        render_uv.active_render = True
        separate_opaque_faces(mesh)
        clone = bpy.data.objects.new(original.name, mesh)
        clone.matrix_world = original.matrix_world.copy()
        scene.collection.objects.link(clone)
        clones.append(clone)
    bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(corner) for obj in clones for corner in obj.bound_box]
    low = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
    high = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
    offset = Vector(((low.x + high.x)/2, (low.y + high.y)/2, low.z))
    for obj in clones:
        obj.location -= offset
        obj.select_set(True)
    bpy.context.view_layer.objects.active = clones[0]
    triangles = sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in clones)
    objects = [obj.name for obj in clones]
    # Static exhibition geometry batches by material, including all small parts.
    bpy.ops.object.join()
    bpy.context.object.name = slug
    bpy.ops.export_scene.gltf(filepath=str((output / (slug + '.glb')).resolve()),
        export_format='GLB', use_selection=True, use_active_scene=True, export_animations=False,
        export_skins=False, export_cameras=False, export_lights=False,
        export_yup=True, export_image_format='WEBP', export_image_quality=92)
    reports.append({'id': slug, 'collection': collection_name, 'sourceObjects': len(clones),
        'objects': objects, 'triangles': triangles, 'sourceBounds': list(high-low)})
report = {'restoredTextures': restored, 'repairs': ['Restored missing F18-main Base Color node'], 'aircraft': reports}
(output / 'export-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print('FIGHTERS_REPORT', json.dumps(reports))
