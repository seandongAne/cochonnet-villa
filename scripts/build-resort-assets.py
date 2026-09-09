"""Offline resort art. Run after export-resort-reference.mjs with Blender 5.1+.

Keeps the authored stairwell and collision envelope; rebuilds the villa facade,
mushroom exterior and spa landscape, then bakes static contact AO.
No third-party assets. Coordinates passed to helpers are Three.js Y-up metres.
"""
import bpy, bmesh, json, math, random
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'art/resort'
OUT = ROOT / 'public/models/resort'
ART.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
random.seed(1908)
REF = json.loads((ART / 'spatial-reference.json').read_text())
# Only the dedicated background process's factory scene is reset.
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'

def xyz(p): return (p[0], -p[2], p[1])
def linear(v): return v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4
def rgb(code): return tuple(linear(int(code[i:i+2], 16) / 255) for i in (1,3,5))

def texture(name, color, kind):
    n = 256
    y,x = np.mgrid[0:n,0:n] / n
    rng = np.random.default_rng(1908)
    noise = rng.random((n,n)) - .5
    if kind == 'wood':
        v = .97 + .012*np.sin(x*math.tau*24 + 1.3*np.sin(y*math.tau*2)) + .008*noise
        v -= .11*(np.minimum(x,1-x) < .015)
    elif kind == 'stone':
        v = .94 + .045*np.sin(x*math.tau*5 + np.sin(y*math.tau*3)) + .075*noise
    else:
        v = .97 + .05*noise
    pixels = np.ones((n,n,4), dtype=np.float32)
    # Image pixels are scene-linear; the exported PNG is converted to sRGB.
    pixels[:,:,:3] = np.array([int(color[i:i+2],16)/255 for i in (1,3,5)])[None,None,:] * v[:,:,None]
    image = bpy.data.images.new(name, width=n, height=n)
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = str(ART / (name+'.png'))
    image.file_format = 'PNG'
    image.save(); image.pack()
    return image

def material(name, color, kind=None, rough=.85, alpha=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb(color),1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Alpha'].default_value = alpha
    mat.diffuse_color = (*rgb(color),alpha)
    mat.use_backface_culling = alpha == 1
    if kind:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = texture(name+'-grain',color,kind)
        uv = mat.node_tree.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'SurfaceUV'
        mat.node_tree.links.new(uv.outputs['UV'],tex.inputs['Vector'])
        mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    if alpha < 1: mat.surface_render_method = 'BLENDED'
    return mat

M = {
    'plaster': material('Warm mineral plaster','#e9c6a2','plaster'),
    'cedar': material('Oiled cedar','#9a6747','wood',.72),
    'darkwood': material('Walnut joinery','#553f32','wood',.72),
    'stone': material('Warm limestone','#b9ad95','stone'),
    'rock': material('River basalt','#777f70','stone',.94),
    'roof': material('Oxide terracotta','#99584c','stone'),
    'moss': material('Sage moss','#63774d','plaster'),
    'glass': material('Clear blue glazing','#b8d9d4',rough=.2,alpha=.23),
    'brass': material('Aged brass','#ad8b52',rough=.45),
}
M['brass'].node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value = .55
objects = []

def mesh(name, verts, faces, mat, zone):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(v) for v in verts],[],faces)
    data.update()
    obj = bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.data.materials.append(M[mat])
    obj['zone'] = zone
    objects.append(obj)
    return obj

def box(name, pos, size, mat, zone, bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(pos))
    obj=bpy.context.object; obj.name=name
    obj.scale=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=obj.modifiers.new('Soft crafted edges','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(M[mat]); obj['zone']=zone; objects.append(obj)
    return obj

def rock(name, pos, size, zone):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=xyz(pos))
    obj=bpy.context.object; obj.name=name
    for v in obj.data.vertices:
        v.co *= random.uniform(.9,1.1)
        v.co.z = max(-.65,v.co.z)
    obj.scale=(size[0],size[2],size[1]); obj.rotation_euler.z=random.random()*math.tau
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=obj.modifiers.new('Weathered edges','BEVEL'); mod.width=.06; mod.segments=2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(M['rock']); obj['zone']=zone; objects.append(obj)
    return obj

def surface_uv(obj):
    # Box projection in metres, so every timber / mineral surface has one scale.
    data=obj.data
    while data.uv_layers: data.uv_layers.remove(data.uv_layers[0])
    uv=data.uv_layers.new(name='SurfaceUV')
    for face in data.polygons:
        axis=max(range(3),key=lambda k:abs(face.normal[k]))
        axes=[k for k in range(3) if k!=axis]
        for li in face.loop_indices:
            p=obj.matrix_world @ data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv=(p[axes[0]]/1.8,p[axes[1]]/1.8)

def beam(name, a, b, width, mat, zone):
    start,end=Vector(xyz(a)),Vector(xyz(b))
    obj=box(name,tuple((a[i]+b[i])/2 for i in range(3)),(width,(end-start).length,width),mat,zone,.02)
    obj.rotation_euler=(end-start).to_track_quat('Z','Y').to_euler()
    return obj

def arch(name, x, bottom, spring, radius, z, depth, mat, zone, border=0):
    # Extruded semicircular arch; an optional inner loop makes a real opening.
    def outline(r,b):
        return [(x-r,b),(x+r,b)]+[(x+r*math.cos(i*math.pi/32),spring+r*math.sin(i*math.pi/32)) for i in range(33)]
    outer=outline(radius,bottom); n=len(outer)
    verts=[(a,b,c) for c in (z-depth/2,z+depth/2) for a,b in outer]
    faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    if border:
        inner=outline(radius-border,bottom-.01)
        verts.extend((a,b,c) for c in (z-depth/2,z+depth/2) for a,b in inner)
        for i in range(n):
            j=(i+1)%n
            faces.extend([(i,j,2*n+j,2*n+i),(n+j,n+i,3*n+i,3*n+j),(2*n+j,2*n+i,3*n+i,3*n+j)])
    else: faces.extend([tuple(reversed(range(n))),tuple(range(n,2*n))])
    obj=mesh(name,verts,faces,mat,zone)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    return obj

def ellipsoid(name,pos,size,mat,zone):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=1,location=xyz(pos))
    obj=bpy.context.object;obj.name=name;obj.scale=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in obj.data.polygons:p.use_smooth=True
    obj.data.materials.append(M[mat]);obj['zone']=zone;objects.append(obj)
    return obj

def pitched_roof(name, halfwidth, front, back, eave, ridge, zone):
    verts=[(-halfwidth,eave,front),(0,ridge,front),(halfwidth,eave,front),
           (-halfwidth,eave,back),(0,ridge,back),(halfwidth,eave,back)]
    obj=mesh(name,verts,[(0,3,4,1),(1,4,5,2)],'roof',zone)
    solid=obj.modifiers.new('Tile roof thickness','SOLIDIFY');solid.thickness=.18
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=solid.name)
    for z in (front,back):
        beam('Carved gable fascia',(-halfwidth,eave-.04,z),(0,ridge-.04,z),.20,'darkwood',zone)
        beam('Carved gable fascia',(0,ridge-.04,z),(halfwidth,eave-.04,z),.20,'darkwood',zone)
    beam('Terracotta ridge cap',(0,ridge+.06,back),(0,ridge+.06,front),.19,'roof',zone)
    # Shallow tile courses read as horizontal rows on the two sloping planes.
    for side in (-1,1):
        for i in range(1,13):
            t=i/13; x=side*halfwidth*t; y=ridge+(eave-ridge)*t+.035
            beam('Overlapping tile course',(x,y,back),(x,y,front),.045,'roof',zone)

def author_villa():
    palette={'villaWall':'plaster','fascia':'darkwood','wood':'cedar','glass':'glass',
             'roof':'roof','trim':'roof','floorPlank':'cedar','baseboard':'darkwood',
             'wallInterior':'plaster','wallAccent':'roof','metalBrass':'brass',
             'villaDark':'darkwood','stoneBase':'stone','ceiling':'plaster'}
    for i,item in enumerate(REF['villa']):
        p=item['position']; verts=[p[k:k+3] for k in range(0,len(p),3)]
        inds=item['index'] or list(range(len(verts)))
        # Replace the upper roof, its trim and stack as one coherent silhouette.
        if min(v[1] for v in verts)>11.3: continue
        # The old opaque wall's twelve inset 'windows' cannot transmit light.
        if item['material']=='glass' and max(v[1] for v in verts)<4.5 and abs(sum(v[0] for v in verts)/len(verts))>12: continue
        mid=np.mean(verts,axis=0)
        zone='upper' if mid[1]>6.4 else ('west' if mid[0]<-3 else 'east' if mid[0]>3 else 'entry')
        obj=mesh(item['name'] or f'Structure-{i}',verts,[inds[k:k+3] for k in range(0,len(inds),3)],palette.get(item['material'],'plaster'),zone)
        # Weld duplicated triangle vertices and preserve planar normals.
        bm=bmesh.new(); bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
        bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges))
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(obj.data); bm.free()
    # Limestone piers frame broad glazed bays instead of dense timber screens.
    for side in (-1,1):
        zone='west' if side<0 else 'east'
        for x in (side*5.9,side*9.1,side*12.65):
            box('Limestone arcade pier',(x,2.78,11.2),(.38,5.5,.50),'stone',zone,.06)
            box('Carved pier capital',(x,5.37,11.2),(.65,.22,.66),'plaster',zone,.04)
        for x in (side*7.5,side*10.85):
            arch('Arcade arch',x,4.2,4.25,1.47,11.24,.24,'stone',zone,.16)
        box('Stone sill',(side*9, .42,11.05),(7.7,.4,.6),'stone','west' if side<0 else 'east')
        box('Limestone side plinth',(side*12.84,.44,0),(.5,.85,21.8),'stone','west' if side<0 else 'east')
        # Shallow masonry pilasters give the long side walls a room-scale rhythm.
        for z in (-10.4,-5.2,0,5.2,10.4):
            box('Side masonry pier',(side*12.98,2.82,z),(.24,5.15,.40),'stone',zone,.04)
        box('Side cornice',(side*12.97,5.55,0),(.28,.22,21.5),'stone',zone,.04)
    # A gabled entrance canopy hangs from the existing lintel; no new obstacle
    # is placed within the world's open entrance or porch approach.
    pitched_roof('Entrance pavilion',4.85,13.35,10.7,4.98,6.08,'entry')
    for side in (-1,1):
        beam('Entrance bracket',(side*4.8,4.95,11.25),(side*3.55,5.8,12.9),.20,'cedar','entry')
    # The upper storey becomes a distinct garden lodge with one pitched roof.
    pitched_roof('Villa garden lodge roof',8.9,8.25,-3.95,11.4,13.55,'upper')
    for z in (-3.08,7.04):
        mesh('Plaster gable', [(-8,11.18,z),(8,11.18,z),(0,13.27,z),
                              (-8,11.18,z-.16),(8,11.18,z-.16),(0,13.27,z-.16)],
             [(0,1,2),(5,4,3),(0,3,4,1),(1,4,5,2),(2,5,3,0)],'plaster','upper')
    for x in (-7.5,-5,-2.5,0,2.5,5,7.5):
        box('Upper window pilaster',(x,8.96,7.3),(.22,4.12,.34),'stone','upper',.035)
    for x in (-6.25,-3.75,-1.25,1.25,3.75,6.25):
        arch('Upper window arch',x,9.75,9.75,1.10,7.34,.20,'stone','upper',.11)
    # A small gable oculus and timber spokes establish the house's centre.
    ellipsoid('Gable oculus',(0,12.03,7.09),(.48,.48,.07),'darkwood','upper')
    beam('Oculus vertical',(0,11.61,7.19),(0,12.45,7.19),.07,'brass','upper')
    beam('Oculus horizontal',(-.42,12.03,7.19),(.42,12.03,7.19),.07,'brass','upper')
    box('Chimney masonry',(-5.6,12.18,-1.2),(1.0,2.35,1.0),'stone','upper',.06)
    box('Chimney crown',(-5.6,13.37,-1.2),(1.24,.18,1.24),'darkwood','upper',.04)
    # Room-scale timber floor, flush with the existing ground floor.
    box('Ground timber floor',(0,.015,0),(25.1,.17,21.1),'cedar','entry',0)

def author_mushroom():
    M['cap']=material('Rosehip mushroom roof','#ba5044','plaster',.88)
    M['cream']=material('Ivory mushroom gills','#f0ddbd','plaster')
    M['sage']=material('Sage painted shutters','#658174','wood')
    M['window']=material('Honey window glass','#d5b271',rough=.35)
    M['window'].node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(*rgb('#e0aa53'),1)
    M['window'].node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.12
    n=96
    # Continuous pinched plaster body, with a flared stone foundation.
    profile=[(4.55,0),(4.4,.25),(4.05,1.0),(3.92,2.2),(3.75,4.1),(3.82,5.7),(4.2,6.5)]
    verts=[]
    for r,y in profile:
        for i in range(n):
            a=i/n*math.tau; radius=r*(1+.018*math.sin(3*a)+.012*math.cos(5*a))
            verts.append((radius*math.cos(a),y,radius*math.sin(a)))
    obj=mesh('Sculpted limewash stem',verts,[(j*n+i,(j+1)*n+i,(j+1)*n+(i+1)%n,j*n+(i+1)%n) for j in range(len(profile)-1) for i in range(n)],'plaster','stem')
    for p in obj.data.polygons:p.use_smooth=True
    # One continuous cap: downturned edge, rounded shoulders and offset crown.
    def cap_point(t,a,offset=0):
        radius=7.05*math.sin(t*math.pi/2)
        radius*=1+.026*math.sin(3*a+.4)*t+.015*math.sin(7*a)*t*t
        y=6.45+4.3*math.cos(t*math.pi/2)**1.45+.13*math.sin(3*a+.8)*t*t
        return (radius*math.cos(a)+.35*(1-t),y+offset,radius*.96*math.sin(a))
    verts=[cap_point(j/32,i/n*math.tau) for j in range(33) for i in range(n)]
    cap=mesh('Continuous rosehip cap',verts,[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(32) for i in range(n)],'cap','canopy')
    for p in cap.data.polygons:p.use_smooth=True
    # Cream underside is a shallow sculpted dish; radial veins stay underneath.
    verts=[]
    for r,y in ((3.8,5.95),(5.2,6.02),(6.6,6.20),(7.05,6.45)):
        for i in range(n):
            a=i/n*math.tau; p=cap_point(1,a); scale=r/7.05
            verts.append((p[0]*scale,y+(p[1]-6.45)*scale,p[2]*scale))
    dish=mesh('Ivory gill canopy',verts,[(j*n+i,(j+1)*n+i,(j+1)*n+(i+1)%n,j*n+(i+1)%n) for j in range(3) for i in range(n)],'cream','canopy')
    for p in dish.data.polygons:p.use_smooth=True
    for i in range(48):
        a=i/48*math.tau
        edge=cap_point(1,a)
        path=[(r/7.05*edge[0],y+(edge[1]-6.45)*r/7.05,r/7.05*edge[2])
              for r,y in ((4.0,5.88),(5.2,5.95),(6.6,6.13),(6.95,6.33))]
        curve=bpy.data.curves.new('Sweeping gill','CURVE');curve.dimensions='3D'
        curve.resolution_u=8;curve.bevel_depth=.035;curve.bevel_resolution=2
        spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(path)-1)
        for j,(point,pos) in enumerate(zip(spline.bezier_points,path)):
            point.co=xyz(pos);point.handle_left_type='AUTO';point.handle_right_type='AUTO'
            point.radius=.40 if j in (0,len(path)-1) else 1
        obj=bpy.data.objects.new('Sculpted ivory gill',curve);scene.collection.objects.link(obj)
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH');obj=bpy.context.object
        obj.data.materials.append(M['cream']);obj['zone']='canopy';objects.append(obj)
    # Small irregular patches conform to the roof rather than floating spheres.
    for k,(t,a,r) in enumerate([(.28,.3,.10),(.47,1.8,.11),(.69,2.5,.07),(.57,3.5,.09),(.78,4.15,.10),(.49,4.8,.11),(.75,5.3,.07),(.82,.4,.07),(.70,1.3,.065),(.24,3.4,.09),(.91,3.1,.055)]):
        verts=[cap_point(t,a,.035)]
        for ring in range(1,9):
            for j in range(32):
                b=j/32*math.tau; s=r*ring/8*(1+.12*math.sin(3*b+k))
                verts.append(cap_point(t+s*math.sin(b),a+s*2.8*math.cos(b),.035))
        faces=[(0,j+1,(j+1)%32+1) for j in range(32)]
        faces.extend((1+ring*32+j,1+(ring+1)*32+j,1+(ring+1)*32+(j+1)%32,1+ring*32+(j+1)%32) for ring in range(7) for j in range(32))
        patch=mesh('Ivory roof freckle',verts,faces,'cream','canopy')
        for p in patch.data.polygons:p.use_smooth=True
        # Both sides render: the cap patches are decorative surface shells.
        patch.data.materials[0].use_backface_culling=False
    # Rounded doorway surround replaces the rectangular facade slab.
    arch('Rounded entrance mass',0,.06,2.8,2.05,-4.38,1.38,'plaster','entry')
    arch('Recessed arch reveal',0,.12,2.7,1.48,-5.11,.16,'darkwood','entry')
    arch('Sage arched door',0,.17,2.68,1.30,-5.23,.14,'sage','entry')
    arch('Limestone portal',0,.1,2.7,1.70,-5.25,.30,'stone','entry',.23)
    for x in (-.96,-.64,-.32,0,.32,.64,.96):
        top=2.68+math.sqrt(1.3**2-x*x)
        box('Door plank joint',(x,(top+.22)/2,-5.315),(.024,top-.22,.025),'darkwood','entry',.006)
    for y in (.9,2.3):box('Door strap hinge',(-.90,y,-5.35),(.42,.10,.06),'brass','entry',.02)
    ellipsoid('Brass door handle',(.80,1.8,-5.40),(.10,.10,.10),'brass','entry')
    # Honey-coloured round windows with sage shutters and stone ledges.
    for side in (-1,1):
        x=side*2.95; z=-3.68
        ellipsoid('Circular walnut window reveal',(x,2.8,z),(.88,.88,.28),'darkwood','stem')
        ellipsoid('Circular honey glazing',(x,2.8,z-.24),(.70,.70,.065),'window','stem')
        beam('Round window mullion',(x-.65,2.8,z-.32),(x+.65,2.8,z-.32),.085,'cedar','stem')
        beam('Round window mullion',(x,2.15,z-.32),(x,3.45,z-.32),.085,'cedar','stem')
        box('Window stone ledge',(x,1.85,z-.16),(1.95,.18,.70),'stone','stem',.08)
        for offset in (-1,1):
            shutter=box('Sage window shutter',(x+offset*.94,2.80,z+.02),(.35,1.38,.16),'sage','stem',.06)
            shutter.rotation_euler.z=side*offset*.12
    box('Low entrance threshold',(0,.08,-5.56),(3.3,.16,1.0),'stone','entry',.08)
    # Keep the approach clear; planting nestles against side foundations.
    for i in range(16):
        a=i/16*math.tau
        if math.sin(a)<-.65:continue
        x,z=4.25*math.cos(a),4.25*math.sin(a)
        stone=rock('Foundation fieldstone',(x,.25,z),(.65,.32,.52),'garden')
        stone.data.materials.clear();stone.data.materials.append(M['stone'])
        ellipsoid('Soft fern cushion',(x,.48,z),(.65,.25,.48),'moss','garden')
    # Warm hanging lanterns sit either side of the portal.
    for side in (-1,1):
        x=side*1.82
        beam('Lantern bracket',(x,3.12,-4.95),(x,3.12,-5.56),.08,'darkwood','entry')
        box('Lantern amber glass',(x,2.77,-5.56),(.26,.43,.26),'window','entry',.03)
        for y in (2.52,3.02):box('Lantern brass rim',(x,y,-5.56),(.37,.09,.37),'brass','entry',.04)

POOLS=[('upper',20,-8,3,3.2,.62),('middle',24,-2,1.3,2,.38),('lower',21,9,3.4,3.3,.14)]
def ring_point(a,rx,rz,scale=1):
    organic=1+.025*math.sin(3*a+.5)+.018*math.cos(5*a)
    return (math.cos(a)*rx*organic*scale,math.sin(a)*rz*organic*scale)

def author_springs():
    for name,x,z,rx,rz,y in POOLS:
        n=64; verts=[]
        # Continuous basin lip, with broad, low irregular rocks on selected arcs.
        # West entry stays low and has no boulders, matching walkable physics.
        rings=[(rx+.6,rz+.6,-.08),(rx+.55,rz+.55,y+.12),(rx-.30,rz-.30,y+.18),(rx-.48,rz-.48,y-.23)]
        for ax,az,h in rings:
            for i in range(n):
                a=i/n*math.tau; px,pz=ring_point(a,ax,az)
                h2=min(h,y+.035) if math.cos(a)<-.82 and h>y else h
                verts.append((x+px,h2,z+pz))
        faces=[]
        for r in range(3):
            for i in range(n):
                j=(i+1)%n; faces.append((r*n+i,r*n+j,(r+1)*n+j,(r+1)*n+i))
        faces.append(tuple(range(3*n,4*n)))
        faces.append(tuple(reversed(range(n))))
        basin=mesh('Carved mineral basin',verts,faces,'stone',name)
        bm=bmesh.new(); bm.from_mesh(basin.data)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(basin.data); bm.free()
        # Broad asymmetrical silhouettes at the blocked east and end edges.
        for i in range(12 if name!='middle' else 7):
            a=-math.pi*.53+i/(11 if name!='middle' else 6)*math.pi*1.06
            px,pz=ring_point(a,rx+.13,rz+.13)
            s=random.uniform(.42,.68) if name!='middle' else random.uniform(.28,.43)
            rock('Weathered basalt',(x+px,y+.13,z+pz),(s,random.uniform(.2,.38),s*.8),name)
        # Terrace annulus has a real hole: no opaque slab covers the water.
        verts=[]
        for ax,az,h in [(rx-.46,rz-.46,y-.03),(rx+1.1,rz+1.1,.04),(rx+1.1,rz+1.1,-.12)]:
            for i in range(n):
                px,pz=ring_point(i/n*math.tau,ax,az)
                verts.append((x+px,h,z+pz))
        faces=[(r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i) for r in range(2) for i in range(n)]
        mesh('Mineral terrace',verts,faces,'rock',name)
        # Selected moss cushions stay outside the usable pool, below collider tops.
        for i in range(5):
            a=-1.45+i*.68; px,pz=ring_point(a,rx+.55,rz+.55)
            o=rock('Moss cushion',(x+px,.08,z+pz),(.36,.09,.3),name)
            o.data.materials.clear(); o.data.materials.append(M['moss'])
    # Warm cedar boardwalk west of the pools; low boards follow ground eye height.
    for i in range(40):
        z=-10.5+i*.62; x=16.2+.65*math.sin((z+8)*.11)
        box('Spa boardwalk',(x,.015,z),(1.8,.15,.59),'cedar','walk',.025)
    # Short stepping stones between the natural basins, avoiding fake raised steps.
    for i in range(7):
        box('Garden stepping stone',(22.1+math.sin(i*.5)*.6,.035,1.0+i*.51),(1.25,.13,.43),'stone','walk',.06)

def join_objects(items,name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in items: obj.select_set(True)
    bpy.context.view_layer.objects.active=items[0]
    bpy.ops.object.join(); obj=bpy.context.object; obj.name=name
    return obj

def bake_and_export(kind):
    bpy.context.view_layer.update()
    for obj in objects: surface_uv(obj)
    # Batch by spatial section AND material, retaining useful culling bounds.
    buckets={}; glass=[]
    for obj in objects:
        if obj.data.materials[0]==M['glass']:
            glass.append(obj); continue
        buckets.setdefault((obj['zone'],obj.data.materials[0].name),[]).append(obj)
    opaque=[join_objects(items,zone+' / '+mat) for (zone,mat),items in buckets.items()]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in opaque: obj.select_set(True)
    bpy.context.view_layer.objects.active=opaque[0]
    for obj in opaque:
        obj.data.uv_layers.new(name='ContactAO'); obj.data.uv_layers.active_index=1
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.008)
    bpy.ops.object.mode_set(mode='OBJECT')
    ao=bpy.data.images.new(kind+'-contact-ao',width=1024,height=1024)
    ao.colorspace_settings.name='Non-Color'
    for mat in {o.data.materials[0] for o in opaque}:
        node=mat.node_tree.nodes.new('ShaderNodeTexImage'); node.image=ao
        mat.node_tree.nodes.active=node
    scene.render.engine='CYCLES'; scene.cycles.samples=64
    scene.world=bpy.data.worlds.new('Bake world'); scene.world.use_nodes=True
    scene.render.bake.margin=6; scene.render.bake.use_clear=True
    # Distance-limited AO: closed rooms must not become uniformly black.
    # Bake the AO node's emission, then restore each material's surface shader.
    restore=[]
    for mat in {o.data.materials[0] for o in opaque}:
        nodes=mat.node_tree.nodes; links=mat.node_tree.links
        output=nodes.get('Material Output'); old=output.inputs['Surface'].links[0].from_socket
        ambient=nodes.new('ShaderNodeAmbientOcclusion'); ambient.inputs['Distance'].default_value=.85
        ambient.samples=16
        emit=nodes.new('ShaderNodeEmission'); links.new(ambient.outputs['Color'],emit.inputs['Color'])
        links.new(emit.outputs[0],output.inputs['Surface']); restore.append((mat,output,old,ambient,emit))
    bpy.ops.object.bake(type='EMIT')
    for mat,output,old,ambient,emit in restore:
        mat.node_tree.links.new(old,output.inputs['Surface'])
        mat.node_tree.nodes.remove(ambient);mat.node_tree.nodes.remove(emit)
    ao.filepath_raw=str(ART/(kind+'-contact-ao.png')); ao.file_format='PNG'; ao.save(); ao.pack()
    group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
    group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    for mat in {o.data.materials[0] for o in opaque}:
        node=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image==ao)
        uv=mat.node_tree.nodes.new('ShaderNodeUVMap'); uv.uv_map='ContactAO'
        mat.node_tree.links.new(uv.outputs['UV'],node.inputs['Vector'])
        output=mat.node_tree.nodes.new('ShaderNodeGroup'); output.node_tree=group
        mat.node_tree.links.new(node.outputs['Color'],output.inputs['Occlusion'])
    for obj in opaque: obj.data.uv_layers.active_index=0
    bpy.ops.object.select_all(action='DESELECT')
    for obj in opaque+glass: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'.glb')),export_format='GLB',use_selection=True,
        export_apply=True,export_yup=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
    stats={'meshes':len(opaque)+len(glass),'opaqueBatches':len(opaque),'glassPanes':len(glass),
           'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in opaque+glass),
           'bytes':(OUT/(kind+'.glb')).stat().st_size,'aoResolution':1024,'aoSamples':64}
    (ART/(kind+'-report.json')).write_text(json.dumps(stats,indent=2))
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/(kind+'.blend')))
    return stats

import sys
kind=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'springs'
if kind=='villa': author_villa()
elif kind=='mushroom': author_mushroom()
else: author_springs()
print(json.dumps(bake_and_export(kind)))
