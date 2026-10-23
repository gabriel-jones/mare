"""Author the lunar industrial kit. Run inside Blender. Builds in a temporary scene, writes only that
scene to industrial-library.blend and removes it again so the open file is left untouched.
Set ONLY = {'solar', ...} before running to export just those GLBs; the hopper here is superseded
by build_production.py and is only exported when named."""
import bpy, math, os
from mathutils import Vector

OUT = '/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
os.makedirs(OUT, exist_ok=True)
EXPORT = globals().get('ONLY') or {'launchpad', 'starship', 'habitat', 'solar', 'battery'}
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('Lunar industrial asset library')
bpy.context.window.scene = scene
objects = []
created = {'objects': [], 'meshes': [], 'materials': []}

def material(name, color, metallic=0, roughness=.5, emission=0):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name); created['materials'].append(m)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m

M = {
 'ivory': material('Lunar • ceramic ivory', (.78,.79,.71), .15,.42),
 'dark': material('Lunar • graphite structure', (.045,.065,.08), .45,.45),
 'orange': material('Lunar • burnt orange safety', (.8,.21,.045), .15,.45),
 'metal': material('Lunar • brushed stainless', (.48,.57,.62), .78,.3),
 'pv': material('Lunar • photovoltaic blue black', (.018,.055,.105), .45,.27),
 'glass': material('Lunar • deep teal glazing', (.025,.14,.18), .55,.2),
 'light': material('Lunar • warm powered emission', (1,.61,.2), .1,.3, 3),
 'floor': material('Lunar • regolith composite', (.19,.22,.24), .1,.75),
}

def finish(o, name, mat, bevel=0, smooth=False):
    o.name = name
    o.data.materials.append(M[mat])
    if bevel:
        mod=o.modifiers.new('Precision edge highlights','BEVEL'); mod.width=bevel; mod.segments=1
        bpy.context.view_layer.objects.active=o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if smooth:
        for f in o.data.polygons: f.use_smooth=True
    objects.append(o); created['objects'].append(o); created['meshes'].append(o.data)
    return o

def box(name, loc, size, mat='ivory', bevel=.035, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o=bpy.context.object; o.scale=size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rot: o.rotation_euler=rot
    return finish(o,name,mat,bevel)

def cyl(name, loc, radius, depth, mat='metal', vertices=16, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o=bpy.context.object
    if rotation: o.rotation_euler=rotation
    return finish(o,name,mat,0,True)

def beam(name,a,b,width,mat='dark'):
    a,b=Vector(a),Vector(b)
    o=box(name,(a+b)/2,(width,width,(b-a).length),mat,min(width*.15,.025))
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return o

def profile(name, rings, mat='metal', sides=32):
    vs=[]
    for z,r in rings:
        vs += [(r*math.cos(i*math.tau/sides),r*math.sin(i*math.tau/sides),z) for i in range(sides)]
    fs=[]
    for j in range(len(rings)-1):
        for i in range(sides):
            a=j*sides+i;b=j*sides+(i+1)%sides
            fs.append((a,b,b+sides,a+sides))
    fs += [tuple(reversed(range(sides))),tuple((len(rings)-1)*sides+i for i in range(sides))]
    me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update()
    o=bpy.data.objects.new(name,me);scene.collection.objects.link(o)
    return finish(o,name,mat,0,True)

def polygon_prism(name, points, depth, mat='metal'):
    # points in X/Z, thickness in Y
    n=len(points);vs=[(x,y,z) for y in [-depth/2,depth/2] for x,z in points]
    fs=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    fs += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update()
    o=bpy.data.objects.new(name,me);scene.collection.objects.link(o)
    return finish(o,name,mat)

exec(open(os.path.join(os.path.dirname(OUT), 'blender', 'status_parts.py')).read())

def join_group(group,name):
    if not group:return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in group:o.select_set(True)
    bpy.context.view_layer.objects.active=group[0]
    bpy.ops.object.join();o=bpy.context.object;o.name=name
    scene.cursor.location=(0,0,0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return o

def export_asset(name, builder, location):
    global objects
    objects=[];builder()
    roof=[o for o in objects if o.name.startswith('Roof')]
    # Status parts stay separate, named nodes the runtime can recolour or scale.
    status=[o for o in objects if o.name.split('.')[0] in ('Lamp','Level') or o.name.startswith('Cell')]
    regular=[o for o in objects if o not in roof and o not in status]
    result=[join_group([o],o.name.split('.')[0]) for o in status]
    groups={key:[o for o in regular if o.data.materials[0] == mat] for key,mat in M.items()}
    for key,g in groups.items():
        o=join_group(g,name+'_'+key)
        if o:result.append(o)
    o=join_group(roof,'Roof')
    if o:result.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in result:o.select_set(True)
    if name in EXPORT: bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_yup=True,export_animations=False)
    tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in result)
    print('LUNAR_ASSET',name,'triangles',tris,'mesh_objects',len(result))
    for o in result:o.location+=Vector(location)
    return result

def starship():
    profile('Pressure hull',[(1.2,1.36),(1.4,1.5),(8.7,1.5),(9.5,1.46),(10.4,1.27),(11.3,.94),(12.15,.5),(12.8,.07),(12.85,0)],sides=40)
    # dark shield on rear hemisphere; deliberately separate from polished front
    sides=20;vs=[]
    for z,r in [(1.45,1.512),(8.7,1.512),(9.5,1.472),(10.4,1.282),(11.3,.952),(12.15,.512)]:
        vs += [(r*math.cos(i*math.pi/sides),r*math.sin(i*math.pi/sides),z) for i in range(sides+1)]
    fs=[(j*(sides+1)+i,j*(sides+1)+i+1,(j+1)*(sides+1)+i+1,(j+1)*(sides+1)+i) for j in range(5) for i in range(sides)]
    me=bpy.data.meshes.new('Shield');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('Heat shield',me);scene.collection.objects.link(o);finish(o,'Heat shield','dark',smooth=True)
    for z in [1.48,3.4,6.2,8.65]:
        profile('Circumferential seams',[(z,1.508),(z+.035,1.508)],'dark',40)
    for sign in [-1,1]:
        fin=polygon_prism('Aft aerodynamic flap',[(sign*1.3,1.65),(sign*2.45,1.5),(sign*2.7,3.2),(sign*1.45,4.4)],.16,'metal')
        fin=polygon_prism('Forward aerodynamic flap',[(sign*1.15,9.1),(sign*1.95,9.35),(sign*1.85,10.55),(sign*.95,10.75)],.12,'metal')
    profile('Engine skirt',[(.95,1.4),(1.3,1.4)],'dark',32)
    for angle in [0,math.tau/3,math.tau*2/3]:
        x,y=.7*math.cos(angle),.7*math.sin(angle)
        bell=profile('Engine bell',[(.48,.35),(.62,.31),(1.1,.17)],'dark',16);bell.location.x=x;bell.location.y=y
    for angle in [math.pi/4+i*math.pi/2 for i in range(4)]:
        x,y=math.cos(angle),math.sin(angle)
        beam('Landing strut',(x*1.3,y*1.3,2.0),(x*2.05,y*2.05,.22),.13,'metal')
        beam('Landing brace',(x*1.4,y*1.4,1.05),(x*2.05,y*2.05,.3),.08)
        box('Landing shoe',(x*2.05,y*2.05,.12),(.64,.7,.18),'dark',.04)
    box('Cargo hatch seal',(0,-1.49,6.3),(1.15,.09,2.25),'dark',.12)
    box('Cargo hatch',(0,-1.55,6.3),(.99,.06,2.08),'metal',.1)
    box('Hatch safety band',(0,-1.59,5.65),(.9,.02,.13),'orange',.01)
    for x in [-.4,.4]:box('Forward observation port',(x,-1.31,9.7),(.39,.08,.32),'glass',.06,rot=(math.radians(18),0,0))

def launchpad():
    # Fills the reserved 9 x 7 cell rectangle like any other skid: graphite foundation, regolith deck
    # with seams on the 2 m grid, an orange safety curb, and a heat plate under the engines. Front is -Y.
    W,D=17.7,13.7
    box('Pad foundation',(0,0,.12),(W,D,.24),'dark',.08)
    box('Pad deck',(0,0,.26),(W-.6,D-.6,.06),'floor',.02)
    # Seams fall between grid cells, which are centred on even metres.
    for x in range(-7,8,2):box('Deck seam',(x,0,.295),(.05,D-.7,.012),'dark',0)
    for y in range(-5,6,2):box('Deck seam',(0,y,.295),(W-.7,.05,.012),'dark',0)
    for x in [-1,1]:box('Safety curb',(x*(W/2-.22),0,.33),(.18,D-.2,.1),'orange',.02)
    for y in [-1,1]:box('Safety curb',(0,y*(D/2-.22),.33),(W-.2,.18,.1),'orange',.02)
    # Engine heat plate and blast grate, with chevrons marking the touchdown square.
    box('Heat plate',(0,0,.31),(6.1,6.1,.05),'metal',.03)
    box('Blast grate',(0,0,.34),(3.2,3.2,.02),'dark',0)
    for i in range(-3,4):box('Grate bar',(i*.42,0,.355),(.06,3.0,.02),'metal',0)
    for sx in [-1,1]:
        for sy in [-1,1]:
            box('Touchdown chevron',(sx*2.55,sy*2.2,.345),(.9,.16,.02),'orange',0)
            box('Touchdown chevron',(sx*2.2,sy*2.55,.345),(.16,.9,.02),'orange',0)
    # Corner bollards carry the pad lights.
    for sx in [-1,1]:
        for sy in [-1,1]:
            box('Corner bollard',(sx*(W/2-.6),sy*(D/2-.6),.65),(.42,.42,.7),'ivory',.06)
            box('Bollard light',(sx*(W/2-.6),sy*(D/2-.6),1.03),(.3,.3,.06),'light',.01)
    for x in [-4,0,4]:
        for y in [-1,1]:box('Edge light',(x,y*(D/2-.22),.39),(.5,.08,.02),'light',0)
    # Fuelling station on the east edge, where propellant tanks stand, and the launch terminal at the front.
    box('Fuel manifold',(W/2-.9,1.5,.5),(.7,3.4,.45),'ivory',.05)
    for y in [.3,1.5,2.7]:box('Fuel coupling',(W/2-.45,y,.5),(.3,.36,.3),'orange',.025)
    beam('Fuel line',(W/2-1.25,1.5,.45),(3.1,1.5,.45),.14,'metal')
    box('Terminal pedestal',(6.6,-4.6,.75),(.45,.45,1.0),'dark',.05)
    box('Terminal housing',(6.6,-4.6,1.42),(.8,.5,.4),'ivory',.06)
    box('Terminal screen',(6.6,-4.86,1.45),(.6,.02,.23),'glass',.02)
    box('Terminal stripe',(6.6,-4.86,1.24),(.62,.02,.05),'orange',0)

def solar():
    for x in [-1.4,1.4]:
        box('Foot',(x,0,.1),(.55,1.5,.2),'dark')
        beam('Panel support',(x,0,.2),(x,0,1.15),.15)
        beam('Diagonal support',(x,.7,.18),(x,-.6,1.35),.08,'metal')
    # tilted rack with visible PV cell divisions
    angle=math.radians(18)
    box('Array backing',(0,0,1.25),(3.65,3.45,.1),'metal',.025,(angle,0,0))
    for ix in range(6):
        for iy in range(4):
            x=(ix-2.5)*.575;y=(iy-1.5)*.79
            box('PV tile',(x,y*math.cos(angle)-.03,1.32+y*math.sin(angle)),(.55,.755,.025),'pv',0,(angle,0,0))
    box('Inverter',(0,.7,.38),(.8,.45,.55),'ivory',.04)
    box('Inverter indicator',(0,.455,.43),(.28,.02,.06),'light',.005)
    status_lamp(-1.92,1.78,2.15,0)

def battery():
    box('Skid',(0,0,.14),(1.8,3.6,.28),'dark',.06)
    for y in [-1.12,0,1.12]:
        box('Battery cassette',(0,y,.89),(1.52,1.0,1.35),'ivory',.10)
        for x in [-.68,.68]:box('Protective rail',(x,y,.89),(.1,1.07,1.45),'metal',.025)
        box('Cassette face',(0,y-.515,.9),(1.16,.035,.84),'dark',.03)
        if y>-1: box('Charge indicator',(0,y-.54,1.1),(.65,.02,.075),'light',.005)
        box('Cassette release',(0,y-.55,.65),(.32,.045,.08),'orange',.015)
    status_cells(0,-1.665,1.1)
    beam('Power bus',(.6,-1.5,1.65),(.6,1.5,1.65),.12,'orange')
    status_lamp(-.78,1.7,2.1,.28)

def hopper():
    box('Base skid',(0,0,.16),(3.4,3.4,.3),'dark',.06)
    for x in [-1.2,1.2]:
        for y in [-1.2,1.2]:beam('Hopper leg',(x,y,.3),(x,y,1.8),.16,'metal')
    # open funnel: four sloped faces, visible interior, rolled top rails
    vs=[(-1.4,-1.4,2.2),(1.4,-1.4,2.2),(1.4,1.4,2.2),(-1.4,1.4,2.2),(-.5,-.5,1),(.5,-.5,1),(.5,.5,1),(-.5,.5,1)]
    fs=[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)]
    me=bpy.data.meshes.new('Open tapered hopper');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('Open tapered hopper',me);scene.collection.objects.link(o);finish(o,'Open tapered hopper','ivory')
    for a,b in [((-1.45,-1.45,2.2),(1.45,-1.45,2.2)),((1.45,-1.45,2.2),(1.45,1.45,2.2)),((1.45,1.45,2.2),(-1.45,1.45,2.2)),((-1.45,1.45,2.2),(-1.45,-1.45,2.2))]:beam('Rolled top lip',a,b,.13,'orange')
    box('Discharge housing',(0,-.35,.65),(1.1,1.75,.6),'dark',.04)
    box('Conveyor output collar',(0,-1.3,.65),(1.15,.25,.65),'orange',.04)
    for x in [-.4,0,.4]:beam('Top safety grate',(x,-1.3,2.19),(x,1.3,2.19),.025,'metal')

def habitat():
    box('Insulated foundation',(0,0,.14),(3.95,3.95,.28),'dark',.07)
    box('Interior floor',(0,0,.29),(3.62,3.62,.1),'floor',.02)
    # Front has a genuine 1.2 m opening, side windows are actual wall openings
    for x in [-1.25,1.25]:box('Front wall',(x,-1.82,1.27),(1.25,.23,1.94),'ivory',.06)
    box('Front lintel',(0,-1.82,2.13),(1.3,.23,.3),'ivory',.04)
    box('Back wall',(0,1.82,1.27),(3.86,.23,1.94),'ivory',.06)
    for x in [-1.82,1.82]:
        for y in [-1.27,1.27]:box('Side wall pier',(x,y,1.27),(.23,1.0,1.94),'ivory',.05)
        box('Window sill wall',(x,0,.64),(.23,1.55,.67),'ivory',.04)
        box('Window lintel',(x,0,2.03),(.23,1.55,.48),'ivory',.04)
        box('Window frame',(x,0,1.4),(.26,1.7,.95),'dark',.04)
        box('Pressure glazing',(x+(.145 if x>0 else -.145),0,1.4),(.025,1.48,.73),'glass',.02)
    for x in [-.65,.65]:box('Airlock jamb',(x,-1.96,1.27),(.13,.35,1.94),'orange',.025)
    box('Door threshold',(0,-1.96,.36),(1.4,.42,.1),'metal',.015)
    box('Door light',(0,-1.97,2.1),(.8,.035,.06),'light',.01)
    for x in [-1.86,1.86]:
        for y in [-1.86,1.86]:box('Corner structural spine',(x,y,1.29),(.18,.18,2.0),'metal',.025)
    # Every roof part starts with Roof and is joined into the named hideable mesh.
    box('Roof shell',(0,0,2.36),(3.98,3.98,.27),'ivory',.12)
    box('Roof service panel',(0,.2,2.53),(2.8,2.6,.12),'dark',.05)
    box('Roof ventilation',(0,1.1,2.64),(1.25,.7,.12),'metal',.025)
    for x in [-.45,-.15,.15,.45]:box('Roof vent rib',(x,1.1,2.71),(.08,.58,.04),'dark',.005)
    # interior wall services, leaving center and doorway unobstructed
    box('Interior utility cabinet',(-1.4,1.55,.93),(.56,.32,1.16),'ivory',.04)
    box('Interior cabinet screen',(-1.4,1.375,1.1),(.35,.02,.24),'glass',.01)
    beam('Interior service conduit',(-1.65,1.64,1.85),(1.65,1.64,1.85),.055,'orange')

export_asset('launchpad',launchpad,(-11,0,0))
export_asset('starship',starship,(-11,0,.09))
export_asset('habitat',habitat,(3,0,0))
export_asset('solar',solar,(8,0,0))
export_asset('battery',battery,(3,-6,0))
export_asset('hopper',hopper,(8,-6,0))

scene.world=bpy.data.worlds.new('Industrial library environment')
scene.world.use_nodes=True
background=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs[0].default_value=(.16,.2,.27,1)
background.inputs[1].default_value=.4
bpy.ops.object.light_add(type='SUN',location=(0,0,20));sun=bpy.context.object;sun.rotation_euler=(.45,-.5,-.55);sun.data.energy=3
bpy.ops.object.light_add(type='AREA',location=(0,-10,15));area=bpy.context.object;area.data.energy=1800;area.data.shape='DISK';area.data.size=15
bpy.ops.object.camera_add(location=(29,-38,31));camera=bpy.context.object;camera.rotation_euler=(Vector((-3,0,4))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=39;scene.camera=camera
engines={e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
for engine in ['BLENDER_EEVEE_NEXT','BLENDER_EEVEE','CYCLES']:
    if engine in engines:
        scene.render.engine=engine
        break
if scene.render.engine=='CYCLES': scene.cycles.samples=24
scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(OUT,'asset-library.png')
if os.environ.get('LUNAR_RENDER_PREVIEW','1')=='1': bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(os.path.join(OUT,'industrial-library.blend'),{scene},fake_user=True)

# Leave the user's open file as it was.
bpy.context.window.scene=previous_scene
lights=[o.data for o in (sun,area)];cam=camera.data;world=scene.world
for o in list(scene.collection.objects):bpy.data.objects.remove(o,do_unlink=True)
bpy.data.scenes.remove(scene)
for me in created['meshes']:
    try:
        if me.users==0:bpy.data.meshes.remove(me)
    except ReferenceError:
        pass
for d in lights:
    if d.users==0:bpy.data.lights.remove(d)
if cam.users==0:bpy.data.cameras.remove(cam)
if world.users==0:bpy.data.worlds.remove(world)
for m in created['materials']:
    if m.users==0:bpy.data.materials.remove(m)
print('LUNAR_INDUSTRIAL_LIBRARY_READY', OUT)
