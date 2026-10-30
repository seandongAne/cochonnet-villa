"""Export the supplied DA20 as a static display asset with bpy 4.5.9.
Usage: python scripts/export-da20.py INPUT.blend OUTPUT.glb
The source is read with scripts disabled and is never saved or modified.
"""
import bpy
import sys
import json
from pathlib import Path

source, output = map(Path, sys.argv[-2:])
bpy.ops.wm.open_mainfile(filepath=str(source.resolve()), use_scripts=False)
bpy.context.scene.frame_set(1)
depsgraph = bpy.context.evaluated_depsgraph_get()
# Freeze the evaluated source geometry, including curves and rigged details.
# Hidden boolean cutters, lights, reference images and cameras are not exhibits.
static = []
for obj in list(bpy.context.scene.objects):
    if obj.type not in {'MESH', 'CURVE'} or obj.hide_render:
        continue
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=depsgraph)
    if not mesh.polygons:
        bpy.data.meshes.remove(mesh)
        continue
    clone = bpy.data.objects.new(obj.name + '-display', mesh)
    clone.matrix_world = obj.matrix_world.copy()
    static.append(clone)
scene = bpy.data.scenes.new('DA20 static exhibit')
bpy.context.window.scene = scene
for obj in static:
    scene.collection.objects.link(obj)
    obj.select_set(True)
bpy.context.view_layer.objects.active = static[0]
# Keep the supplied 2K livery; reduce microdetail maps to 1K before export.
for image in bpy.data.images:
    if image.size[0] and image.type == 'IMAGE':
        limit = 2048 if image.name in {'Plane-Body-2.png', 'Plane-Label.png'} else 1024
        factor = min(1, limit / max(image.size))
        if factor < 1:
            image.scale(max(1, round(image.size[0]*factor)), max(1, round(image.size[1]*factor)))
# glTF cannot reproduce Cycles shader mixtures. Use the source primary BSDF,
# retaining its texture inputs and constant surface values for small details.
converted = []
for material in {slot.material for obj in static for slot in obj.material_slots if slot.material}:
    if not material.use_nodes:
        continue
    nodes, links = material.node_tree.nodes, material.node_tree.links
    output_node = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
    shader = nodes.get('Principled BSDF')
    if output_node and shader and output_node.inputs['Surface'].is_linked and output_node.inputs['Surface'].links[0].from_node.type == 'MIX_SHADER':
        links.new(shader.outputs['BSDF'], output_node.inputs['Surface'])
        converted.append(material.name)
    if material.name in {'Window', 'Transparent Plastic'} and shader:
        shader.inputs['Transmission Weight'].default_value = 0
        shader.inputs['Alpha'].default_value = .22
        shader.inputs['Roughness'].default_value = .16
        for link in list(shader.inputs['Roughness'].links):
            links.remove(link)
        material.surface_render_method = 'BLENDED'
# Merge static meshes to let the exporter batch primitives by shared material.
bpy.ops.object.join()
static_mesh = bpy.context.object
static_mesh.name = 'diamond-da20-c1'
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output.resolve()), export_format='GLB',
    use_selection=True, export_animations=False, export_skins=False,
    export_cameras=False, export_lights=False, export_yup=True,
    export_image_format='WEBP', export_image_quality=88)
print('DA20_REPORT', json.dumps({'sourceObjects': len(static), 'vertices': len(static_mesh.data.vertices),
    'triangles': sum(len(p.vertices)-2 for p in static_mesh.data.polygons),
    'bounds': list(static_mesh.dimensions), 'simplifiedShaderMixtures': sorted(converted)}))
