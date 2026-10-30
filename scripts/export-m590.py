"""Export a static local display derivative; never modify the supplied blend.
Run with bpy 4.5.9: python export-m590.py INPUT.blend OUTPUT.glb MATERIALS_DIR
"""
import bpy
import sys
from pathlib import Path

source, output, materials_dir = map(Path, sys.argv[-3:])
bpy.ops.wm.open_mainfile(filepath=str(source.resolve()), use_scripts=False)
# Match the supplied texture sets to the original UVs and material slots.
# Blender/glTF use OpenGL tangent-space normals; never use the DirectX variants.
texture_sets = {
    'm590_receiver': {
        'Base Color': 'm590_receiver/m590_receiver_BaseColor_black.png',
        'Metallic': 'm590_receiver/m590_receiver_Metallic.png',
        'Roughness': 'm590_receiver/m590_receiver_Roughness.png',
        'Normal': 'm590_receiver/m590_receiver_Normal_opengl.png',
        'Occlusion': 'm590_receiver/m590_receiver_AO.png',
    },
    'm590_furniture': {
        'Base Color': 'm590_furniture/m590_furniture_plastic/m590_furniture_BaseColor_plastic.png',
        'Metallic': 'm590_furniture/m590_furniture_plastic/m590_furniture_Metallic_plastic.png',
        'Roughness': 'm590_furniture/m590_furniture_plastic/m590_furniture_Roughness_plastic.png',
        'Normal': 'm590_furniture/m590_furniture_plastic/m590_furniture_Normal_opengl_plastic.png',
        'Occlusion': 'm590_furniture/m590_furniture_AO.png',
    },
}
ao_group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
ao_group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
for name, maps in texture_sets.items():
    material = bpy.data.materials[name]
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    surface = nodes.new('ShaderNodeOutputMaterial')
    links.new(shader.outputs['BSDF'], surface.inputs['Surface'])
    for slot, relative in maps.items():
        image = bpy.data.images.load(str((materials_dir / relative).resolve()), check_existing=True)
        image.colorspace_settings.name = 'sRGB' if slot == 'Base Color' else 'Non-Color'
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        if slot == 'Normal':
            normal = nodes.new('ShaderNodeNormalMap')
            links.new(texture.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], shader.inputs['Normal'])
        elif slot == 'Occlusion':
            occlusion = nodes.new('ShaderNodeGroup')
            occlusion.node_tree = ao_group
            links.new(texture.outputs['Color'], occlusion.inputs['Occlusion'])
        else:
            links.new(texture.outputs['Color'], shader.inputs[slot])
# Freeze the rest pose as a static exhibit. The alternate Knoxx grip and loose
# cartridge are excluded; the conventional source stock remains in the exhibit.
for obj in bpy.context.scene.objects:
    if obj.type == 'ARMATURE':
        obj.data.pose_position = 'REST'
bpy.context.view_layer.update()
selected = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.name not in {'knoxx_stock_grip', '12gauge'}]
bpy.ops.object.select_all(action='DESELECT')
for obj in selected:
    obj.select_set(True)
bpy.context.view_layer.objects.active = selected[0]
bpy.ops.object.convert(target='MESH')
for obj in bpy.context.selected_objects:
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output.resolve()), export_format='GLB', use_selection=True, export_animations=False, export_skins=False, export_yup=True, export_materials='EXPORT')
print('Exported static M590 exhibit:', output)
