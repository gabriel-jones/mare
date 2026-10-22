"""Lunar frontier art test. Run in Blender's Python environment."""
import bpy, math, random, os
from mathutils import Vector

OUT = os.path.dirname(os.path.abspath(__file__))
random.seed(19)
# Work in a separate scene; retain the user's existing scene.
scene = bpy.data.scenes.new('LUNAR • Material & silhouette study')
bpy.context.window.scene = scene
collection = bpy.data.collections.new('Lunar study')
scene.collection.children.link(collection)

def material(name, color, roughness=.65, metal=0, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    if emission:
        p.inputs['Emission Color'].default_value = (*color,1)
        p.inputs['Emission Strength'].default_value = emission
    return m

ivory = material('01 • ceramic / warm ivory', (.68,.72,.68), .48, .12)
orange = material('02 • suit / burnt orange', (.76,.135,.027), .72)
dark = material('03 • graphite / structural', (.026,.043,.056), .62, .35)
rubber = material('04 • rubber / seals', (.014,.021,.027), .9)
metal = material('05 • machined titanium', (.20,.27,.30), .32, .75)
visor = material('06 • visor / ink glass', (.012,.047,.075), .16, .68)
amber = material('07 • status / amber', (1,.39,.045), .35, .1, 2.5)
cyan = material('08 • instrument / pale cyan', (.12,.65,.78), .35, .1, 1.5)
soil = [material('regolith / tone %02d'%i, (.22+i*.009,.245+i*.009,.275+i*.009), .98) for i in range(7)]
rockmats = [material('basalt / tone %02d'%i, (.095+i*.027,.117+i*.028,.145+i*.03), .95) for i in range(4)]

def move(o, name, mat=None, parent=None):
    o.name = name
    for c in list(o.users_collection): c.objects.unlink(o)
    collection.objects.link(o)
    if mat: o.data.materials.append(mat)
    if parent: o.parent = parent
    return o

def root(name, loc):
    o = bpy.data.objects.new(name,None); collection.objects.link(o); o.location=loc
    return o

def box(name, loc, size, mat, bevel=.04, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0))
    o=move(bpy.context.object,name,mat,parent); o.location=loc; o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        m=o.modifiers.new('Precision edge highlights','BEVEL'); m.width=bevel; m.segments=2
        m=o.modifiers.new('Panel normals','WEIGHTED_NORMAL'); m.keep_sharp=True
    return o

def uv(name, loc, scale, mat, parent=None, seg=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=1)
    o=move(bpy.context.object,name,mat,parent); o.location=loc; o.scale=scale
    for p in o.data.polygons:p.use_smooth=True
    return o

def cyl(name, loc, radius, depth, mat, parent=None, vertices=12, direction=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth)
    o=move(bpy.context.object,name,mat,parent); o.location=loc
    if direction:o.rotation_euler=Vector(direction).to_track_quat('Z','Y').to_euler()
    m=o.modifiers.new('Small edge bevel','BEVEL');m.width=.015;m.segments=1
    m=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def link(name,a,b,r,mat,parent=None,vertices=10):
    a,b=Vector(a),Vector(b)
    return cyl(name,(a+b)*.5,r,(b-a).length,mat,parent,vertices,b-a)

# Astronaut: a deliberate mix of softly curved pressure gear and angular armor.
astro=root('ASTRONAUT • 2.2m • unrigged style model',(-1.45,-1.05,.035))
for s in [-1,1]:
    x=s*.18
    box('Boot / graphite sole',(x,-.075,.105),(.30,.52,.16),rubber,.045,astro)
    box('Boot / ceramic toe',(x,-.12,.22),(.29,.43,.21),ivory,.055,astro)
    box('Shin pressure shell',(x,.015,.46),(.26,.29,.37),orange,.065,astro)
    box('Shin armor',(x,-.145,.48),(.19,.065,.23),ivory,.025,astro)
    uv('Knee joint',(x,0,.69),(.145,.15,.12),dark,astro)
    box('Thigh',(x,.015,.87),(.30,.32,.31),orange,.065,astro)
box('Pelvis pressure shell',(0,.02,1.06),(.60,.38,.25),orange,.075,astro)
box('Waist seal',(0,0,1.18),(.61,.40,.10),dark,.025,astro)
box('Torso pressure suit',(0,.025,1.41),(.65,.45,.46),orange,.105,astro)
box('Chest ceramic plate',(0,-.226,1.47),(.43,.085,.24),ivory,.035,astro)
box('Chest instrument',(0,-.28,1.46),(.25,.035,.13),dark,.015,astro)
box('Chest instrument glow',(-.045,-.302,1.48),(.09,.012,.022),cyan,.004,astro)
for x in [.04,.08]: box('Chest toggle',(x,-.303,1.44),(.023,.014,.027),amber,.003,astro)
box('Life support pack',(0,.36,1.39),(.59,.30,.60),ivory,.07,astro)
box('Pack inset',(0,.527,1.40),(.36,.045,.34),dark,.02,astro)
for s in [-1,1]:
    cyl('Pack oxygen cartridge',(s*.27,.37,1.38),.095,.44,metal,astro)
    uv('Shoulder bell',(s*.39,.02,1.53),(.20,.215,.20),ivory,astro)
    link('Upper sleeve',(s*.42,.015,1.48),(s*.50,-.015,1.22),.135,orange,astro)
    uv('Elbow seal',(s*.50,-.02,1.20),(.13,.135,.12),dark,astro)
    link('Forearm',(s*.50,-.035,1.17),(s*.50,-.13,.97),.125,orange,astro)
    cyl('Wrist cuff',(s*.5,-.13,.96),.132,.08,ivory,astro,direction=(0,-.3,-1))
    uv('Glove',(s*.50,-.15,.86),(.12,.13,.14),dark,astro)
cyl('Helmet collar',(0,.015,1.68),.285,.115,dark,astro,vertices=24)
uv('Helmet / ivory pressure shell',(0,.015,1.93),(.405,.365,.385),ivory,astro,seg=24,rings=12)
uv('Visor / dark wraparound',(0,-.205,1.95),(.345,.208,.267),visor,astro,seg=24,rings=12)
for s in [-1,1]:
    cyl('Helmet side latch',(s*.385,0,1.94),.105,.055,orange,astro,direction=(1,0,0))
box('Helmet brow marker',(0,-.315,2.17),(.18,.037,.038),orange,.008,astro)

# Mining module, deliberately low and wide with a legible drilling silhouette.
drill=root('MINER • modular regolith drill',(1.25,.65,.025))
box('Lower chassis',(0,0,.29),(1.65,1.46,.30),dark,.075,drill)
box('Ceramic main housing',(.15,.19,.91),(1.24,.93,.86),ivory,.095,drill)
box('Orange service stripe',(.15,-.291,.94),(1.10,.025,.13),orange,.005,drill)
box('Housing cap',(.15,.19,1.38),(1.30,.99,.12),ivory,.045,drill)
box('Dark radiator recess',(.79,.19,1.0),(.045,.65,.44),dark,.012,drill)
for y in [-.065,.065,.195,.325,.455]:box('Radiator fin',(.825,y,1.0),(.065,.042,.39),metal,.006,drill)
box('Front instrument',(.43,-.31,1.16),(.34,.055,.23),dark,.018,drill)
box('Instrument face',(.43,-.344,1.18),(.26,.012,.10),cyan,.008,drill)
for x in [.33,.41,.49,.57]:box('Readout bar',(x,-.352,1.18),(.025,.008,.065),ivory,.002,drill)
for x in [-.75,.75]:
    for y in [-.59,.59]:
        box('Outrigger shoe',(x,y,.09),(.42,.40,.16),metal,.035,drill)
        cyl('Stabilizer piston',(x,y,.30),.075,.36,metal,drill)
        box('Outrigger hazard cap',(x,y,.51),(.25,.25,.08),orange,.02,drill)
# exposed drill and twin guide rails in front of the enclosed processing body
for x in [-.50,-.14]:
    link('Drill mast rail',(x,-.59,.39),(x,-.59,1.76),.05,metal,drill)
box('Mast crown',(-.32,-.59,1.77),(.62,.38,.17),ivory,.04,drill)
box('Drill carriage',(-.32,-.59,1.22),(.56,.39,.27),orange,.045,drill)
rotor=root('Drill rotor • animated',(0,0,0));rotor.parent=drill
rotor.location=(-.32,-.59,0)
cyl('Drill spindle',(0,0,.66),.075,1.03,metal,rotor)
# Broad continuous low-poly helical flight.
verts=[];faces=[];steps=72
for i in range(steps+1):
    a=i/steps*math.tau*3
    z=.16+i/steps*.84
    for r in [.08,.22]:verts.append((r*math.cos(a),r*math.sin(a),z))
for i in range(steps):faces.append((2*i,2*i+1,2*i+3,2*i+2))
mesh=bpy.data.meshes.new('Auger flight');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('Continuous helical auger',mesh);collection.objects.link(o);o.parent=rotor;o.data.materials.append(metal)
m=o.modifiers.new('Flight thickness','SOLIDIFY');m.thickness=.025
rotor.rotation_euler.z=0;rotor.keyframe_insert(data_path='rotation_euler',frame=1)
rotor.rotation_euler.z=math.tau;rotor.keyframe_insert(data_path='rotation_euler',frame=121)
box('Output hopper',(.30,.78,.66),(.87,.56,.54),dark,.055,drill)
box('Hopper rim',(.30,.81,.94),(.94,.60,.08),ivory,.025,drill)
box('Hopper ore',(.30,.82,.93),(.73,.42,.055),rockmats[1],.01,drill)
link('Beacon stalk',(.62,.43,1.42),(.62,.43,1.70),.025,dark,drill)
cyl('Amber status beacon',(.62,.43,1.75),.065,.12,amber,drill)

# Triangulated sculpted surface: large forms, restrained per-face value variation.
def height(x,y):
    d=math.hypot(x-1.4,y-3.45)
    crater=-.43*math.exp(-(d/1.05)**4)+.27*math.exp(-((d-1.36)/.30)**2)
    return .018*math.sin(x*1.7)*math.cos(y*1.3)+crater
n=27;verts=[];faces=[]
for j in range(n):
    for i in range(n):
        x=-5.5+i*11/(n-1);y=-4.3+j*9/(n-1)
        if i not in [0,n-1] and j not in [0,n-1]:x+=random.uniform(-.14,.14);y+=random.uniform(-.14,.14)
        verts.append((x,y,height(x,y)))
for j in range(n-1):
    for i in range(n-1):
        a=j*n+i;b=a+1;c=a+n;d=c+1
        faces.extend([(a,b,d),(a,d,c)] if random.random()<.5 else [(a,b,c),(b,d,c)])
mesh=bpy.data.meshes.new('Sculpted regolith triangulation');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('TERRAIN • faceted lunar patch',mesh);collection.objects.link(o)
for m in soil:o.data.materials.append(m)
for p in o.data.polygons:p.material_index=random.choices(range(7),weights=[1,2,4,12,4,2,1])[0]
box('Terrain cut edge',(0,.2,-.37),(11,9,.52),rockmats[1],.08)

rockroot=root('ROCKS • three reusable forms',(0,0,0))
templates=[]
for i in range(3):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1)
    o=move(bpy.context.object,'Basalt form %d'%(i+1),rockmats[i],rockroot)
    for v in o.data.vertices:
        v.co.x*=random.uniform(.83,1.18);v.co.y*=random.uniform(.85,1.15)
        v.co.z=max(-.35,v.co.z*random.uniform(.65,.95))
    templates.append(o)
for i in range(38):
    o=templates[i] if i<3 else bpy.data.objects.new('Basalt scatter %02d'%i,templates[i%3].data)
    if i>=3:collection.objects.link(o);o.parent=rockroot
    x=random.uniform(-5.1,5.1);y=random.uniform(-3.8,4.3)
    # keep foreground silhouettes and walkable space clear
    if -2.6<x<2.5 and -2.1<y<1.6:y+=3.0
    s=random.uniform(.10,.38) if i>5 else random.uniform(.4,.65)
    o.location=(x,y,height(x,y)+s*.3);o.scale=(s*1.3,s,s*.8);o.rotation_euler.z=random.random()*math.tau

world=bpy.data.worlds.new('Lunar black • subtle cool fill');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(.12,.16,.23,1);bg.inputs['Strength'].default_value=.22
scene.world=world
def light(name,typ,loc,energy,color,target):
    data=bpy.data.lights.new(name,typ);data.energy=energy;data.color=color
    o=bpy.data.objects.new(name,data);collection.objects.link(o);o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o
sun=light('SUN • long graphic shadows','SUN',(-7,-8,10),3.0,(1,.92,.80),(0,0,0));sun.data.angle=.055
fill=light('Studio bounce approximation','AREA',(1,-6,7),450,(.51,.67,1),(0,0,1));fill.data.shape='DISK';fill.data.size=8
camdata=bpy.data.cameras.new('Art test camera');camdata.type='ORTHO';camdata.ortho_scale=11.9
cam=bpy.data.objects.new('CAMERA • gameplay study',camdata);collection.objects.link(cam)
cam.location=(8,-12,9);cam.rotation_euler=(Vector((0,.55,.55))-cam.location).to_track_quat('-Z','Y').to_euler();scene.camera=cam
scene.render.resolution_x=1440;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(OUT,'lunar-art-test.png')
scene.render.film_transparent=False
scene.eevee.taa_samples=64
scene.eevee.taa_render_samples=128
scene.render.fps=30;scene.frame_start=1;scene.frame_end=120;scene.frame_set(1)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'lunar-art-test.blend'))
print('Created lunar art test:',len(scene.objects),'objects')
