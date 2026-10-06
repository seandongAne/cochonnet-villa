"""Cochonnet Villa / 安心木栅栏
Reproducible Blender 4.3+ script. Run: blender -b --python build_fence.py
Outputs are created beside this script. Authoring Z-up, export glTF +Y-up, meters.
"""
import bpy, math, os, json, sys
from mathutils import Vector
from pathlib import Path
OUT = Path(__file__).resolve().parent
(OUT/'modules').mkdir(exist_ok=True)
(OUT/'previews').mkdir(exist_ok=True)
# Authored villa colors inspected in the existing world source.
PALETTE = {'Cedar':'9a6747','Walnut':'553f32','Limestone':'b9ad95','Sage':'658174','Moss':'63774d','Brass':'ad8b52','Plaster':'e9c6a2','Terracotta':'99584c'}
MODULE_SPAN=3.0
PICKET_TOP=1.12
POST_TOP=1.30
GATE_CLEAR=6.0
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name='01_Editable_Fence_Kit'
scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1.0
scene['project']='Cochonnet Villa / 安心木栅栏'
scene['asset_only']=True
scene['integration_status']='New asset proposal; not installed in the live map.'
scene['coordinate_note']='Blender Z-up; GLB exported Y-up. Three.js (x,y,z) maps to Blender (x,-z,y).'


def linear(x): return x/12.92 if x<=0.04045 else ((x+.055)/1.055)**2.4

def material(name,h,roughness=.7,metallic=0):
    m=bpy.data.materials.new('CV_'+name); m.use_nodes=True
    c=tuple(linear(int(h[i:i+2],16)/255) for i in (0,2,4))
    m.diffuse_color=(*c,1)
    b=m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(*c,1); b.inputs['Roughness'].default_value=roughness; b.inputs['Metallic'].default_value=metallic
    return m
M={k:material(k,v, .46 if k=='Brass' else .78, .55 if k=='Brass' else 0) for k,v in PALETTE.items()}
M['CedarLight']=material('CedarLight','aa7858')
M['CedarWarm']=material('CedarWarm','a06d4b')
M['SageLight']=material('SageLight','718d7e')
M['SageWarm']=material('SageWarm','6b8577')
M['Ground']=material('PreviewGround','cdc5b5')
M['Grass']=material('PreviewGrass','8c9970')
M['Path']=material('PreviewPath','cdbb9a')
M['Type']=material('PreviewType','4a473a')


def collection(name,parent=None):
    c=bpy.data.collections.new(name); (parent.children if parent else scene.collection.children).link(c); return c
KIT=collection('ASSET_KIT | editable components')
STUDIO=collection('PREVIEW_ONLY | excluded from GLB')
ACTIVE=KIT

def relocate(obj,col):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    col.objects.link(obj)

def empty(name,parent=None,col=None,loc=(0,0,0)):
    o=bpy.data.objects.new(name,None); (col or ACTIVE).objects.link(o); o.location=loc
    o.empty_display_type='PLAIN_AXES'; o.empty_display_size=.22
    if parent:o.parent=parent
    return o

def finish(obj,name,mat,parent=None,bevel=0,segments=2,col=None):
    obj.name=name; relocate(obj,col or ACTIVE)
    if mat:obj.data.materials.append(mat)
    if parent:obj.parent=parent
    if bevel:
        mod=obj.modifiers.new('Soft safe-looking edges','BEVEL'); mod.width=bevel; mod.segments=segments
        mod.affect='EDGES'
        mod=obj.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL'); mod.keep_sharp=True; mod.weight=50
    return obj

def box(name,loc,dim,mat,parent=None,bevel=.018,col=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object; o.dimensions=dim
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,parent,bevel,col=col)

def uvball(name,loc,scale,mat,parent=None,segments=16,rings=8,col=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=loc)
    o=bpy.context.object; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    return finish(o,name,mat,parent,col=col)

def cylinder(name,loc,radius,depth,mat,parent=None,rotation=(0,0,0),vertices=16,bevel=.006,col=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc,rotation=rotation)
    o=bpy.context.object; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,parent,bevel,col=col)

def picket(name,x,z_top,mat,parent,width=.21,depth=.075,z_bottom=.10,y=0):
    # Top is a true semicircular profile, with a small all-edge bevel.
    r=width/2; shoulder=z_top-r
    profile=[(-r,z_bottom),(r,z_bottom),(r,shoulder)]
    for j in range(1,9):
        a=math.pi*j/8; profile.append((r*math.cos(a),shoulder+r*math.sin(a)))
    n=len(profile); v=[(x+px,y+py,pz) for py in (-depth/2,depth/2) for px,pz in profile]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    for i in range(n): j=(i+1)%n; faces.append((i,j,j+n,i+n))
    # Reverse extrusion winding so every solid has outward-facing normals.
    faces=[tuple(reversed(f)) for f in faces]
    mesh=bpy.data.meshes.new(name+'_mesh'); mesh.from_pydata(v,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); ACTIVE.objects.link(o)
    return finish(o,name,mat,parent,.011)

def board_between(name,a,b,width,depth,mat,parent):
    mid=(Vector(a)+Vector(b))*.5; delta=Vector(b)-Vector(a)
    o=box(name,mid,(width,depth,delta.length),mat,parent,.012)
    o.rotation_euler=Vector((0,0,1)).rotation_difference(delta).to_euler()
    return o

def snout_badge(parent,x=0,y=-.082,z=.84,size=1):
    # A gentle pig-snout insignia; no text or external texture dependency.
    uvball('CV_Snout_Walnut_Frame',(x,y,z),(.175*size,.028*size,.112*size),M['Walnut'],parent)
    uvball('CV_Snout_Brass_Inlay',(x,y-.022*size,z),(.150*size,.018*size,.087*size),M['Brass'],parent)
    for dx in (-.053,.053):
        uvball('CV_Snout_Nostril',(x+dx*size,y-.041*size,z),(.022*size,.010*size,.034*size),M['Walnut'],parent,12,6)

def post(parent,x=0,y=0,name='Post',height=POST_TOP):
    p=empty('CV_'+name,parent,loc=(x,y,0))
    box('CV_'+name+'_Limestone_Foot',(0,0,.095),(.30,.30,.19),M['Limestone'],p,.028)
    box('CV_'+name+'_Cedar_Core',(0,0,(height-.095)/2),(.225,.225,height-.095),M['Cedar'],p,.030)
    box('CV_'+name+'_Walnut_Collar',(0,0,height-.15),(.25,.25,.075),M['Walnut'],p,.018)
    box('CV_'+name+'_Rounded_Limestone_Cap',(0,0,height-.055),(.285,.285,.11),M['Limestone'],p,.045,)
    return p

def panel(parent,name='StraightPanel',span=3,top=PICKET_TOP,count=10,gate=False):
    p=empty('CV_'+name,parent)
    # Open strips remain between rounded pickets, for a friendly permeable edge.
    left=.265 if not gate else .13; right=span-left
    for i in range(count):
        x=left+(right-left)*i/(count-1)
        mat=[M['Sage'],M['SageWarm'],M['SageLight'],M['Sage']][i%4]
        picket('CV_'+name+'_Picket_%02d'%(i+1),x,top,mat,p,width=.21)
    for z in (.38,.81):box('CV_'+name+'_Back_Rail',(span/2,.074,z),(span-.16,.11,.13),M['Cedar'],p,.02)
    return p

roots={}
# Each complete bay has removable named endpoint posts; panel and post components are also exported separately.
r=empty('CV_Fence_Straight_3m'); roots['Straight_3m']=r
panel(r); post(r,0,0,'Start_Post'); post(r,3,0,'End_Post')
r['span_m']=3.0; r['snap_start']=[0.,0.,0.]; r['snap_end']=[3.,0.,0.]
r['sharing_note']='When adjoining bays, retain one post per shared endpoint. Post children are individually editable.'
r=empty('CV_Fence_Corner_90'); roots['Corner_90']=r
post(r,0,0,'Corner_Post'); post(r,3,0,'X_End_Post'); post(r,0,3,'Y_End_Post')
panel(r,'Corner_X_Panel')
p=panel(r,'Corner_Y_Panel'); p.rotation_euler.z=math.pi/2
r['snap_corner']=[0.,0.,0.]; r['snap_ends']=[3.,0.,0.,0.,3.,0.]
r['angle_degrees']=90
# Post centers separated by 6.5m: full hardware envelope retains at least 6.0m clear opening.
r=empty('CV_Welcome_Gate_6m'); roots['Welcome_Gate_6m']=r
post(r,-3.25,0,'Left_Gate_Post',1.35);post(r,3.25,0,'Right_Gate_Post',1.35)
r['clear_opening_m']=6.;r['post_center_spacing_m']=6.5
r['origin_note']='Gate origin is at center of opening on finished ground.'
for side in (-1,1):
    hinge=empty('CV_Gate_'+('Left' if side<0 else 'Right')+'_Hinge',r,loc=(side*3.15,0,0))
    # Both leaves swing into the local +Y side; center passage is fully open.
    if side<0: hinge.rotation_euler.z=math.radians(94)
    else: hinge.rotation_euler.z=math.radians(-94)
    # Local gate panel points +X (left) or -X (right); root remains editable for future rigging.
    leaf=empty('CV_Gate_'+('Left' if side<0 else 'Right')+'_Leaf',hinge)
    if side>0:leaf.rotation_euler.z=math.pi
    panel(leaf,'Gate_Leaf',span=2.97,top=1.10,count=12,gate=True)
    board_between('CV_Gate_Diagonal_Brace',(.14,.15,.32),(2.83,.15,.86),.105,.09,M['Walnut'],leaf)
    for h in (.37,.82):
        cylinder('CV_Gate_Hinge',(0,0,h),.040,.21,M['Brass'],hinge)
        box('CV_Gate_Hinge_Strap',(.19,.058,h),(.36,.035,.07),M['Brass'],leaf,.012)
    snout_badge(leaf,1.48,-.092,.70,1.3)
    hinge['closed_rotation_z_degrees']=0 if side<0 else 0
    hinge['open_rotation_z_degrees']=94 if side<0 else -94
    hinge['animation_note']='Static open pose; optional future hinge rig/collision integration.'
# Construction components for nonduplicating runs.
r=empty('CV_Fence_Panel_3m'); roots['Panel_3m']=r;panel(r)
r['snap_start']=[0.,0.,0.];r['snap_end']=[3.,0.,0.]
r=empty('CV_Fence_Post');roots['Post']=r;post(r)


def descendants(o):
    result=[o]
    for c in o.children:result.extend(descendants(c))
    return result

def selected_only(root):
    bpy.ops.object.select_all(action='DESELECT')
    for o in descendants(root):o.select_set(True)
    bpy.context.view_layer.objects.active=root

# Export all isolated modules at a sensible ground origin, no preview cameras/ground/text.
exports={}
for key,r in roots.items():
    selected_only(r)
    dest=OUT/'modules'/('CV_'+key+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False,export_materials='EXPORT')
    exports[key]=str(dest)

# Asset-kit source is presented spatially for editing, but isolated exports above are all rebased to zero.
roots['Straight_3m'].location=(-7,0,0)
roots['Corner_90'].location=(-2,0,0)
roots['Welcome_Gate_6m'].location=(7,0,0)
roots['Panel_3m'].location=(-7,4,0)
roots['Post'].location=(-2,4,0)
for o in roots.values():o['export_origin_m']=[0,0,0]

# Separate static layout convenience GLB. It intentionally contains ONLY the three main previewed modules.
for o in scene.objects:o.select_set(False)
for k in ['Straight_3m','Corner_90','Welcome_Gate_6m']:
    for o in descendants(roots[k]):o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'Cochonnet_Fence_Kit.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False,export_materials='EXPORT')

# Studio scene; editable sources remain linked in a dedicated scene.
kit_scene=scene
preview_scene=bpy.data.scenes.new('02_Previews')
preview_scene.unit_settings.system='METRIC';preview_scene.unit_settings.scale_length=1
bpy.context.window.scene=preview_scene;scene=preview_scene
ACTIVE=bpy.data.collections.new('PREVIEW_ONLY');scene.collection.children.link(ACTIVE)

def clone_assembly(src,name,loc=(0,0,0),rot=0):
    objs=descendants(src);mapping={}
    for o in objs:
        n=o.copy()
        if o.data:n.data=o.data # Shared geometry, local transforms remain editable.
        ACTIVE.objects.link(n);mapping[o]=n
    for o,n in mapping.items():
        if o.parent in mapping:n.parent=mapping[o.parent]
        else:n.parent=None
    root=mapping[src];root.name=name;root.location=loc;root.rotation_euler.z=rot
    return root

def look_at(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def camera(name,loc,target,ortho):
    data=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,data);ACTIVE.objects.link(o);o.location=loc;look_at(o,target);data.type='ORTHO';data.ortho_scale=ortho;scene.camera=o;return o

def area(name,loc,power,size,color,target=(0,0,0)):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);ACTIVE.objects.link(o);o.location=loc;look_at(o,target)

def text_obj(body,loc,size=.28,mat=None,align='LEFT',rotation=(0,0,0)):
    data=bpy.data.curves.new('Label_'+body,'FONT');data.body=body;data.size=size;data.align_x=align;data.extrude=.0
    o=bpy.data.objects.new('PREVIEW_LABEL_'+body,data);ACTIVE.objects.link(o);o.location=loc;o.rotation_euler=rotation;data.materials.append(mat or M['Type']);o.visible_shadow=False;return o

def setup_render():
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=128;scene.cycles.use_denoising=False
    scene.cycles.max_bounces=5;scene.cycles.diffuse_bounces=3;scene.cycles.glossy_bounces=2
    scene.render.resolution_x=1600;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.world=bpy.data.worlds.new('Warm Preview World');scene.world.use_nodes=True
    scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.73,.78,.80,1)
    scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.65
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    area('Key_Softbox',(-3,-5,10),1800,8,(1.0,.86,.68),(0,1,0))
    area('Fill_Softbox',(6,4,7),1000,6,(.82,.9,1.0),(0,1,0))

def render(name):
    wanted=os.environ.get('CV_RENDER_SET','all')
    if wanted!='all' and name not in wanted.split(','): return
    scene.render.filepath=str(OUT/'previews'/name);bpy.ops.render.render(write_still=True)

def clear_preview_geometry():
    for o in list(ACTIVE.objects):
        if o.type not in {'LIGHT'}:bpy.data.objects.remove(o,do_unlink=True)

setup_render()
# 1. A composed entry vignette, using only the actual fence assets and schematic landscaping.
box('PREVIEW_Terrain', (0,1.0,-.19),(16,12,.36),M['Grass'],bevel=.35)
box('PREVIEW_Path',(0,1.0,-.005),(5.5,11.3,.025),M['Path'],bevel=.08)
clone_assembly(roots['Welcome_Gate_6m'],'PREVIEW_Gate',(0,0,0))
clone_assembly(roots['Panel_3m'],'PREVIEW_LeftBay',(-6.25,0,0))
clone_assembly(roots['Post'],'PREVIEW_LeftEndPost',(-6.25,0,0))
clone_assembly(roots['Panel_3m'],'PREVIEW_RightBay',(3.25,0,0))
clone_assembly(roots['Post'],'PREVIEW_RightEndPost',(6.25,0,0))
# Minimal hedge mounds are preview-only and emphasize open, welcoming landscaping.
for side in (-1,1):
    for i in range(4):
        uvball('PREVIEW_Sage_Shrub',(side*(4.1+i*.6),1.1,.33),(.5,.50,.43),M['Moss'],segments=12,rings=6)
# Friendly character-scale proxy, marked explicitly as preview-only, inspired by general pig proportions.
# No copied character model is used.
pig=empty('PREVIEW_ONLY_1m_Pig_Scale_Proxy',loc=(1.35,1.4,0))
pink=material('PreviewPigClay','d7998b');pinkdark=material('PreviewPigSnout','bb776e')
uvball('PREVIEW_Pig_Body',(0,0,.52),(.36,.49,.35),pink,pig)
uvball('PREVIEW_Pig_Head',(0,-.36,.70),(.33,.29,.28),pink,pig)
uvball('PREVIEW_Pig_Snout',(0,-.60,.64),(.20,.085,.13),pinkdark,pig)
for x in (-.095,.095):uvball('PREVIEW_Pig_Nostril',(x,-.676,.65),(.035,.02,.04),M['Walnut'],pig,12,6)
for x in (-.17,.17):
    uvball('PREVIEW_Pig_Eye',(x,-.574,.78),(.027,.016,.032),M['Walnut'],pig,12,6)
    uvball('PREVIEW_Pig_Ear',(x,-.33,.955),(.105,.065,.14),pink,pig,12,6)
    for y in (-.21,.25):cylinder('PREVIEW_Pig_Leg',(x,y,.17),.075,.27,pink,pig,vertices=12)
# Ground labels are physically rendered and never exported.
text_obj('COCHONNET VILLA',(-6.4,-4.30,.025),.42)
text_obj('SAGE + CEDAR / 6 m OPEN WELCOME GATE',(-6.4,-4.83,.025),.22)
text_obj('DESIGN PREVIEW - NOT INSTALLED',(-6.4,-5.23,.025),.19)
camera('Hero_Camera',(13,-18,13),(0,.5,.15),19.6)
render('01_welcome_gate.png')

# 2. Modular detail catalog, with dimensions and component names in rendered labels.
clear_preview_geometry()
box('PREVIEW_CatalogGround',(0,1,-.13),(17,11,.24),M['Ground'],bevel=.2)
clone_assembly(roots['Straight_3m'],'PREVIEW_Straight',(-6.6,-1,0))
clone_assembly(roots['Corner_90'],'PREVIEW_Corner',(-1.4,-1,0))
clone_assembly(roots['Welcome_Gate_6m'],'PREVIEW_Gate',(4.6,3.4,0),math.pi)
text_obj('01  STRAIGHT / 3 m',(-6.75,-2.1,.012),.26)
text_obj('1.12 m pickets / 1.30 m posts',(-6.75,-2.48,.012),.17)
text_obj('02  CORNER / 90 deg',(-1.55,-2.1,.012),.26)
text_obj('3 m + 3 m arms',(-1.55,-2.48,.012),.17)
text_obj('03  WELCOME GATE',(1.85,4.3,.012),.26)
text_obj('6 m clear opening / editable hinges',(1.85,4.0,.012),.17)
text_obj('COCHONNET VILLA / SAGE + CEDAR KIT',(-6.75,-3.6,.012),.35)
camera('Catalog_Camera',(13,-20,18),(0,.7,.05),19.2)
render('02_modular_kit.png')

# 3. Source-coordinate placement study. This is intentionally a diagram, not a live scene screenshot.
# Other villa geometry is omitted so it cannot be mistaken for an installed scene.
clear_preview_geometry()
scene.name='03_Placement_Study'
for light_obj in [o for o in list(ACTIVE.objects) if o.type=='LIGHT']:bpy.data.objects.remove(light_obj,do_unlink=True)
sun_data=bpy.data.lights.new('Plan_Uniform_Sun','SUN');sun_data.energy=2.0;sun_data.angle=.15
sun_obj=bpy.data.objects.new('Plan_Uniform_Sun',sun_data);ACTIVE.objects.link(sun_obj);sun_obj.rotation_euler=(0,0,0)
M['Amber']=material('PreviewConnectionPending','bd8449')
M['Ghost']=material('PreviewGhost','ddcba8')
box('PREVIEW_SourceWorld',(2,-1,-.25),(86,84,.5),M['Grass'],bevel=.15)
# Boundary line center coordinates match world.js x[-40,44], z[-40,42].
for x in (-40,44):box('PREVIEW_Proposed_Boundary',(x,-1,.18),(.35,82,.34),M['Cedar'],bevel=.06)
box('PREVIEW_Proposed_North',(2,40,.18),(84,.35,.34),M['Cedar'],bevel=.06)
# South boundary leaves the full 6.5m center-spacing gate opening.
box('PREVIEW_Proposed_South_Left',((-40-1.25)/2,-42,.18),(38.75,.35,.34),M['Cedar'],bevel=.06)
box('PREVIEW_Proposed_South_Right',((5.25+44)/2,-42,.18),(38.75,.35,.34),M['Cedar'],bevel=.06)
# The path has source x[-0.7,4.7], z[-3,37], and therefore stops 5m short.
box('PREVIEW_Existing_Main_Path',(2,-17,.025),(5.4,40,.04),M['Path'],bevel=.03)
# Amber dashes mark only a future connection proposal; they are not part of the existing path.
for y in (-37.5,-38.7,-39.9,-41.1):box('PREVIEW_Unbuilt_Path_Link',(2,y,.06),(5.4,.52,.03),M['Amber'],bevel=.02)
clone_assembly(roots['Welcome_Gate_6m'],'PREVIEW_South_Gate',(2,-42,.02))
# Plan annotations stay flat on the schematic.
text_obj('COCHONNET VILLA',(-36,33,.10),2.15)
text_obj('PERIMETER PLACEMENT STUDY',(-36,29.5,.10),1.1)
text_obj('SOURCE COORDINATES / NOT INSTALLED',(-36,27.2,.10),.83)
text_obj('Existing villa + garden',(-30,7,.10),1.2)
text_obj('interior stays open',(-30,4.4,.10),1.1)
text_obj('(building geometry omitted)',(-30,2,.10),.78)
text_obj('Existing main path',(10,-11,.10),1.05)
text_obj('x -0.7 .. 4.7 / z -3 .. 37',(10,-13.3,.10),.73)
text_obj('5 m CONNECTION NEEDED',(-34,-31,.10),1.06, M['Type'])
text_obj('Path currently ends at z = 37',(-34,-33.4,.10),.8)
# Source-boundary labels, south/gate labels on an additional cream footer.
box('PREVIEW_PlanFooter',(2,-48,-.12),(86,10,.18),M['Ground'],bevel=.15)
text_obj('SOUTH GATE  x = 2 / z = 42',(-36,-46.5,.10),1.18)
text_obj('6 m clear opening. Connect path + add collision in a later integration pass.',(-36,-49,.10),.78)
text_obj('Boundary centerline: x [-40,44], z [-40,42]; grass y = 0.02 m.',(-36,-51,.10),.78)
# A callout from the path end to the explanatory label.
board_between('PREVIEW_Callout',(-8,-33,.12),(1.8,-37,.12),.09,.09,M['Amber'],None)
scene.render.resolution_x=1500;scene.render.resolution_y=1600
camera('Plan_Camera',(2,-5.3,125),(2,-5.3,0),99)
render('03_perimeter_placement_study.png')

# Save with the kit source scene active; previews remain available in their own scene.
bpy.context.window.scene=kit_scene
for o in kit_scene.objects:o.select_set(False)
roots['Welcome_Gate_6m'].select_set(True);bpy.context.view_layer.objects.active=roots['Welcome_Gate_6m']
# Useful viewport on opening the editable file.
for screen in bpy.data.screens:
    for area_ in screen.areas:
        if area_.type=='VIEW_3D':
            area_.spaces.active.region_3d.view_distance=24
            area_.spaces.active.region_3d.view_location=(0,1,0)
            area_.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Cochonnet_Fence_Kit.blend'))
print('CV_BUILD_COMPLETE',json.dumps(exports))
