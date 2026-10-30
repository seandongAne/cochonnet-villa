"""Inspect the user-supplied aircraft without executing or modifying the source."""
import bpy
import json
import sys

bpy.ops.wm.open_mainfile(filepath=sys.argv[-1], use_scripts=False)
for collection in bpy.data.collections:
    print('COLLECTION', collection.name)
    for obj in collection.all_objects:
        print(json.dumps({'name': obj.name, 'hide': obj.hide_render,
            'dimensions': list(obj.dimensions), 'location': list(obj.location),
            'triangles': sum(len(p.vertices)-2 for p in obj.data.polygons),
            'materials': [m.name if m else None for m in obj.data.materials],
            'modifiers': [(m.name, m.type) for m in obj.modifiers]}))
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    print('MATERIAL', mat.name, mat.surface_render_method)
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE':
            print('TEXTURE', node.name, node.image.name if node.image else None)
        elif node.type == 'BSDF_PRINCIPLED':
            print('BSDF', [(i.name, list(i.default_value) if hasattr(i.default_value, '__len__') else i.default_value) for i in node.inputs if not i.is_linked])
    print('LINKS', [(l.from_node.name, l.from_socket.name, l.to_node.name, l.to_socket.name) for l in mat.node_tree.links])
