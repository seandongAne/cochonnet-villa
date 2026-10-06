"""Blender re-import QA for each meter-scale GLB. Run after build_fence.py."""
import bpy,bmesh,json,struct,math
from mathutils import Vector
from pathlib import Path
P=Path(__file__).resolve().parent
report={'format':'glTF 2.0 binary','coordinate_system':'glTF Y-up / Blender reimport Z-up','unit':'meter','files':[]}

def glb_json(path):
    raw=path.read_bytes();magic,version,length=struct.unpack_from('<4sII',raw)
    assert magic==b'glTF' and version==2 and length==len(raw)
    n,typ=struct.unpack_from('<II',raw,12);assert typ==0x4E4F534A
    return json.loads(raw[20:20+n])

def points_for(objects):
    pts=[]
    for o in objects:
        if o.type=='MESH':pts.extend(o.matrix_world@v.co for v in o.data.vertices)
    return pts

def bounds(pts):
    return {'min':[round(min(v[i] for v in pts),6) for i in range(3)],'max':[round(max(v[i] for v in pts),6) for i in range(3)]}

def children(o):
    a=[o]
    for c in o.children:a.extend(children(c))
    return a

for f in sorted((P/'modules').glob('*.glb'))+[P/'Cochonnet_Fence_Kit.glb']:
    j=glb_json(f)
    assert not j.get('images'), 'No image dependency should be present'
    assert all(not b.get('uri') for b in j.get('buffers',[])), 'Expected embedded buffer'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(f))
    bpy.context.view_layer.update()
    objs=list(bpy.context.scene.objects);meshobjs=[o for o in objs if o.type=='MESH']
    pts=points_for(meshobjs);assert pts
    assert all(math.isfinite(c) for v in pts for c in v)
    badvol=[];degenerate=0;triangles=0;verts=0;nonmanifold=0
    for o in meshobjs:
        me=o.data;verts+=len(me.vertices);me.calc_loop_triangles();triangles+=len(me.loop_triangles)
        bm=bmesh.new();bm.from_mesh(me)
        # Imported glTF splits vertices at material/UV/normal seams. Merge only for topology audit.
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        vol=bm.calc_volume(signed=True)
        if vol<=0:badvol.append({'name':o.name,'signed_volume':vol})
        nonmanifold+=sum(not e.is_manifold for e in bm.edges)
        degenerate+=sum(face.calc_area()<1e-10 for face in bm.faces)
        bm.free()
    b=bounds(pts)
    assert not badvol, badvol
    assert not degenerate, degenerate
    assert not nonmanifold, nonmanifold
    entry={'file':f.name,'bytes':f.stat().st_size,'mesh_objects':len(meshobjs),'triangles':triangles,'vertices':verts,'bounds_blender_m':b,'materials':len(j.get('materials',[])),'external_textures':0,'positive_closed_solids':True,'degenerate_faces':0,'nonmanifold_edges_after_weld':0}
    if f.name=='CV_Straight_3m.glb':
        assert abs(b['min'][0]+.15)<1e-4 and abs(b['max'][0]-3.15)<1e-4
        assert abs(b['max'][2]-1.30)<1e-4
    if f.name=='CV_Welcome_Gate_6m.glb':
        assert abs(b['max'][2]-1.35)<1e-4
        lparts=[];rparts=[]
        for o in objs:
            if o.name.startswith('CV_Gate_Left_Hinge') or o.name=='CV_Left_Gate_Post':lparts+=children(o)
            if o.name.startswith('CV_Gate_Right_Hinge') or o.name=='CV_Right_Gate_Post':rparts+=children(o)
        lp=points_for(set(lparts));rp=points_for(set(rparts))
        assert lp and rp
        lx=max(v.x for v in lp);rx=min(v.x for v in rp);gap=rx-lx
        entry['minimum_opening_width_in_open_pose_m']=round(gap,6)
        assert gap>=5.9999, f'Opening too narrow: {gap}'
    report['files'].append(entry)
report['passed']=True
(P/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('CV_VALIDATION_PASSED',json.dumps(report,ensure_ascii=False))
