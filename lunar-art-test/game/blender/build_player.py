"""Author the frontier pressure suit and its pistol, skin them, and create the motion clips.
Exports astronaut-v3.glb: the v2 clips (Idle, Walk, Run, Jump, Build) plus the combat set (AimIdle, AimWalk, AimRun,
Fire, Hurt, Roll, Land, Struggle, ThrowOff, Collapse). Fire is authored from the aim pose so the runtime can layer it
additively over any locomotion. The pistol is a separate skinned mesh (Pistol) on Hand.R with a Slide bone that kicks
back, and marker bones at the muzzle and ejection port. Builds in a temporary scene, exports, writes
astronaut-library.blend and a portrait, then removes everything it made so the open file is left untouched."""
import bpy, math, os, contextlib, io
from mathutils import Vector, Quaternion
OUT='/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
os.makedirs(OUT,exist_ok=True)
previous_scene=bpy.context.window.scene
scene=bpy.data.scenes.new('Frontier astronaut • rig and animation')
bpy.context.window.scene=scene
created={'materials':[],'actions':[]}
# Everything this script adds is removed at the end; snapshot what the open file already holds.
DATA=('meshes','armatures','lights','cameras','worlds','materials','actions','images')
before={k:set(getattr(bpy.data,k)) for k in DATA}
parts=[]
def mat(name,c,rough=.6,metal=0,glow=0):
 m=bpy.data.materials.new(name);created['materials'].append(m);m.use_nodes=True;m.diffuse_color=(*c,1)
 n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 n.inputs['Base Color'].default_value=(*c,1);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
 if glow:n.inputs['Emission Color'].default_value=(*c,1);n.inputs['Emission Strength'].default_value=glow
 return m
orange=mat('Suit • oxide orange',(.66,.115,.025),.74)
ivory=mat('Ceramic • warm chalk',(.70,.74,.71),.45,.08)
graphite=mat('Mechanism • graphite',(.025,.040,.052),.65,.24)
rubber=mat('Pressure seals',(.016,.022,.029),.9)
visor=mat('Visor • midnight cobalt',(.008,.035,.062),.13,.62)
steel=mat('Machined titanium',(.25,.32,.36),.34,.75)
light=mat('Instrument • ice',(.17,.65,.78),.4,.1,1.4)
amber=mat('Marker • amber',(.95,.35,.035),.48,0,.5)
gunmetal=mat('Pistol • blued gunmetal',(.035,.042,.05),.38,.7)

def finish(o,name,m,bone):
 o.name=name;o.data.materials.append(m)
 if bone:o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))),1,'REPLACE')
 parts.append(o);return o
def bevel(o,width=.02,segments=1):
 mod=o.modifiers.new('Crafted edges','BEVEL');mod.width=width;mod.segments=segments
 bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 # Geometry has hard panel planes and small intentional bevel highlights.
 return o
def box(name,loc,size,m,bone,b=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if b:bevel(o,b,1)
 return finish(o,name,m,bone)
def sphere(name,loc,size,m,bone,seg=12,rings=6):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=1,location=loc);o=bpy.context.object;o.scale=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for p in o.data.polygons:p.use_smooth=True
 return finish(o,name,m,bone)
def cylinder(name,a,b,r,m,bone):
 a,b=Vector(a),Vector(b);bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=(b-a).length,location=(a+b)/2)
 o=bpy.context.object;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
 bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);bevel(o,.012,1)
 return finish(o,name,m,bone)
def tailored(name,rings,m,bone):
 # Octagonal ring profile: shaped pressure-suit shell rather than stacked cubes.
 vertices=[];faces=[]
 for z,rx,ry,y in rings:
  for i in range(8):
   a=math.tau*i/8+math.pi/8;vertices.append((rx*math.cos(a),y+ry*math.sin(a),z))
 for j in range(len(rings)-1):
  for i in range(8):faces.append((j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i))
 faces.extend([tuple(reversed(range(8))),tuple((len(rings)-1)*8+i for i in range(8))])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o)
 return finish(o,name,m,bone)

# Torso, backpack, and articulated pressure gear.
tailored('Tailored torso',[(1.00,.245,.17,0),(1.12,.255,.18,0),(1.37,.34,.20,0),(1.49,.29,.175,0)],orange,'Spine')
box('Chest armor',(0,-.195,1.36),(.40,.08,.22),ivory,'Spine',.035)
box('Chest recessed control',(0,-.242,1.36),(.245,.024,.11),graphite,'Spine',.015)
box('Chest readout',(-.045,-.257,1.38),(.105,.009,.024),light,'Spine',.003)
for x in [.055,.092]:box('Control toggle',(x,-.26,1.335),(.022,.012,.025),amber,'Spine',.003)
box('Waist seal',(0,0,1.045),(.50,.355,.07),graphite,'Hips',.025)
box('Pelvic pressure gear',(0,0,.95),(.47,.34,.19),orange,'Hips',.04)
box('Life-support backpack',(0,.255,1.29),(.45,.25,.51),ivory,'Spine',.045)
box('Backpack service recess',(0,.389,1.29),(.29,.02,.32),graphite,'Spine',.015)
box('Backpack orange access',(0,.405,1.40),(.21,.02,.055),orange,'Spine',.008)
for x in [-.10,0,.10]:box('Backpack radiator',(x,.41,1.25),(.03,.025,.17),steel,'Spine',.005)
for sign in [-1,1]:
 suffix='L' if sign<0 else 'R';x=sign*.155
 # Each section binds to the skeleton; the dark joints cover articulation gaps.
 sphere('Hip flex seal',(x,0,.94),(.139,.145,.14),rubber,'Thigh.'+suffix,12,6)
 cylinder('Thigh suit',(x,0,.91),(x,.01,.64),.13,orange,'Thigh.'+suffix)
 box('Thigh exterior plate',(x,-.113,.77),(.18,.055,.22),ivory,'Thigh.'+suffix,.025)
 sphere('Knee seal',(x,.01,.59),(.112,.119,.11),rubber,'Shin.'+suffix,12,6)
 box('Knee cap',(x,-.108,.59),(.17,.075,.14),graphite,'Shin.'+suffix,.03)
 cylinder('Lower leg',(x,.01,.54),(x,0,.22),.112,orange,'Shin.'+suffix)
 box('Shin protection',(x,-.103,.365),(.155,.055,.25),ivory,'Shin.'+suffix,.021)
 box('Boot sole',(x,-.06,.065),(.26,.40,.10),rubber,'Foot.'+suffix,.025)
 box('Boot pressure shell',(x,-.065,.16),(.245,.36,.16),ivory,'Foot.'+suffix,.035)
 box('Boot toe cap',(x,-.23,.145),(.22,.055,.11),graphite,'Foot.'+suffix,.018)
 sx=sign*.345
 sphere('Shoulder bearing',(sx,0,1.41),(.13,.145,.12),rubber,'UpperArm.'+suffix)
 # Faceted shoulder armor contrasts with the smooth helmet.
 box('Shoulder shell',(sign*.37,0,1.47),(.25,.32,.20),ivory,'UpperArm.'+suffix,.05)
 cylinder('Upper sleeve',(sign*.38,0,1.35),(sign*.405,0,1.16),.105,orange,'UpperArm.'+suffix)
 sphere('Elbow flex',(sign*.41,0,1.115),(.10,.11,.10),rubber,'Forearm.'+suffix,12,6)
 cylinder('Forearm suit',(sign*.41,0,1.10),(sign*.415,-.035,.91),.098,orange,'Forearm.'+suffix)
 box('Forearm protection',(sign*.415,-.092,1.015),(.15,.06,.15),ivory,'Forearm.'+suffix,.02)
 cylinder('Wrist lock',(sign*.415,-.035,.925),(sign*.415,-.04,.86),.105,graphite,'Hand.'+suffix)
 sphere('Glove',(sign*.415,-.05,.815),(.095,.112,.11),graphite,'Hand.'+suffix,12,6)
 cylinder('Oxygen cartridge',(sign*.25,.24,1.12),(sign*.25,.24,1.43),.057,steel,'Spine')
cylinder('Collar',(0,0,1.47),(0,0,1.55),.215,graphite,'Spine')
sphere('Helmet ceramic shell',(0,0,1.77),(.31,.283,.305),ivory,'Head',20,10)
sphere('Visor gasket',(0,-.185,1.78),(.278,.146,.214),graphite,'Head',20,8)
sphere('Visor glass',(0,-.204,1.79),(.262,.137,.194),visor,'Head',20,8)
box('Helmet brow',(0,-.248,1.995),(.145,.035,.033),orange,'Head',.009)
for s in [-1,1]:
 cylinder('Helmet latch',(s*.292,0,1.78),(s*.327,0,1.78),.068,orange,'Head')
box('Helmet headlight',(.16,-.226,1.963),(.07,.06,.06),light,'Head',.015)


# Simple mechanical build tool: hidden by the runtime outside construction.
toolparts_before=len(parts)
box('ConstructionTool grip',(.415,-.065,.78),(.09,.10,.22),graphite,'Hand.R',.018)
box('ConstructionTool emitter',(.415,-.065,.67),(.15,.12,.26),ivory,'Hand.R',.024)
box('ConstructionTool tip',(.415,-.065,.52),(.10,.075,.055),light,'Hand.R',.012)
toolparts=parts[toolparts_before:]

# Pistol, built in its own frame (x forward along the barrel, y to its left, z up) and placed in the right glove so the
# barrel runs along Hand.R: pointing the hand bone aims the gun. At rest the hand hangs, so the barrel points down
# and the top of the slide faces forward.
HAND_DIR=(Vector((.415,-.06,.77))-Vector((.415,-.04,.89))).normalized()
GUN_UP=(Vector((0,-1,0))-HAND_DIR*HAND_DIR.dot(Vector((0,-1,0)))).normalized()
GUN_LEFT=GUN_UP.cross(HAND_DIR)
GRIP=Vector((.415,-.05,.815))
GUN_SCALE=1.6
from mathutils import Matrix
def gun_point(x,y,z):return GRIP+(HAND_DIR*x+GUN_LEFT*y+GUN_UP*z)*GUN_SCALE
GUN_BASIS=Matrix((HAND_DIR,GUN_LEFT,GUN_UP)).transposed().to_4x4()
gunparts_before=len(parts)
def gbox(name,c,size,m,bone,b=.006,rake=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0));o=bpy.context.object;o.scale=[v*GUN_SCALE for v in size]
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.transform(Matrix.Translation(gun_point(*c))@GUN_BASIS@Matrix.Rotation(rake,4,'Y'))
 if b:bevel(o,b*GUN_SCALE,1)
 return finish(o,name,m,bone)
def gcyl(name,x0,x1,z,r,m,bone):
 a,b=gun_point(x0,0,z),gun_point(x1,0,z)
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r*GUN_SCALE,depth=(b-a).length,location=(a+b)/2)
 o=bpy.context.object;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
 bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 return finish(o,name,m,bone)
gbox('Pistol grip',(-.012,0,-.005),(.05,.042,.13),rubber,'Hand.R',.008,.25)
gbox('Pistol backstrap',(-.04,0,-.008),(.012,.032,.09),orange,'Hand.R',.003,.25)
gbox('Pistol magazine base',(-.03,0,-.074),(.062,.05,.016),graphite,'Hand.R',.004,.25)
gbox('Pistol frame',(.045,0,.048),(.2,.046,.036),gunmetal,'Hand.R',.006)
for side in [-1,1]:gbox('Pistol power cell',(.06,side*.0235,.048),(.11,.004,.012),light,'Hand.R',0)
gbox('Pistol guard',(.04,0,.008),(.075,.03,.008),gunmetal,'Hand.R',.002)
gbox('Pistol guard post',(.078,0,.03),(.008,.03,.04),gunmetal,'Hand.R',.002)
gbox('Pistol trigger',(.03,0,.022),(.01,.012,.025),steel,'Hand.R',0)
gcyl('Pistol barrel',.16,.205,.088,.015,steel,'Hand.R')
gcyl('Pistol muzzle',.195,.213,.088,.02,graphite,'Hand.R')
gbox('Pistol slide',(.04,0,.088),(.25,.054,.052),gunmetal,'Slide',.008)
gbox('Pistol slide rib',(.04,0,.116),(.2,.02,.006),ivory,'Slide',.002)
gbox('Pistol ejection port',(.035,.0275,.093),(.06,.004,.026),graphite,'Slide',0)
gbox('Pistol rear sight',(-.075,0,.12),(.014,.04,.014),graphite,'Slide',.002)
gbox('Pistol front sight',(.15,0,.12),(.012,.008,.014),amber,'Slide',.002)
gunparts=parts[gunparts_before:];bodyparts=parts[:toolparts_before]

# Semi-auto rifle: a bullpup, so the short arms of the suit can hold it two-handed. Same frame as the pistol: the grip
# sits in the right glove, the magazine behind it, the barrel out ahead; the left hand takes the fore-grip.
gunmetal_rifle=mat('Rifle • olive ceramic',(.13,.15,.11),.55,.15)
rifleparts_before=len(parts)
gbox('Rifle grip',(-.012,0,-.005),(.05,.042,.13),rubber,'Hand.R',.008,.25)
gbox('Rifle trigger guard',(.03,0,.008),(.09,.03,.008),gunmetal,'Hand.R',.002)
gbox('Rifle trigger',(.03,0,.022),(.01,.012,.025),steel,'Hand.R',0)
gbox('Rifle body',(.02,0,.06),(.34,.06,.075),gunmetal_rifle,'Hand.R',.012)
gbox('Rifle butt',(-.16,0,.05),(.04,.064,.11),rubber,'Hand.R',.01)
gbox('Rifle butt plate',(-.185,0,.05),(.012,.05,.09),orange,'Hand.R',.004)
gbox('Rifle magazine',(-.08,0,-.03),(.06,.04,.1),graphite,'Hand.R',.006,-.15)
gbox('Rifle handguard',(.24,0,.06),(.16,.062,.06),ivory,'Hand.R',.01)
for side in [-1,1]:gbox('Rifle vent',(.24,side*.032,.06),(.11,.004,.012),graphite,'Hand.R',0)
gbox('Rifle fore-grip',(.2,0,.0),(.035,.035,.075),rubber,'Hand.R',.006,.12)
gcyl('Rifle barrel',.31,.43,.06,.014,steel,'Hand.R')
gcyl('Rifle muzzle brake',.42,.47,.06,.022,graphite,'Hand.R')
gbox('Rifle rail',(.06,0,.103),(.24,.024,.012),graphite,'Hand.R',.002)
gcyl('Rifle scope',-.0,.15,.13,.022,graphite,'Hand.R')
gcyl('Rifle scope lens',.148,.156,.13,.018,light,'Hand.R')
for x in [.03,.12]:gbox('Rifle scope mount',(x,0,.114),(.02,.02,.02),graphite,'Hand.R',.002)
for side in [-1,1]:gbox('Rifle power cell',(.02,side*.031,.075),(.14,.004,.012),light,'Hand.R',0)
gbox('Rifle bolt handle',(-.02,.034,.075),(.03,.016,.014),steel,'Bolt',.003)
gbox('Rifle ejection port',(-.04,.0305,.07),(.06,.004,.024),graphite,'Bolt',0)
rifleparts=parts[rifleparts_before:]

# Flamethrower, held low at the hip: a pistol grip behind, a front handle for the left hand, the nozzle and its pilot
# light out ahead, and twin fuel tanks strapped over the backpack.
flameparts_before=len(parts)
gbox('Flamer grip',(-.012,0,-.005),(.05,.042,.13),rubber,'Hand.R',.008,.25)
gbox('Flamer trigger',(.03,0,.022),(.01,.012,.03),steel,'Hand.R',0)
gbox('Flamer guard',(.035,0,.004),(.08,.03,.008),gunmetal,'Hand.R',.002)
gcyl('Flamer body',-.12,.24,.065,.05,graphite,'Hand.R')
gbox('Flamer heat shield',(.15,0,.118),(.24,.085,.018),ivory,'Hand.R',.006)
for x in [.07,.11,.15,.19,.23]:gbox('Flamer shield slot',(x,0,.128),(.012,.06,.004),graphite,'Hand.R',0)
gcyl('Flamer cap',-.15,-.11,.065,.056,orange,'Hand.R')
gcyl('Flamer nozzle',.24,.38,.065,.026,steel,'Hand.R')
gcyl('Flamer nozzle bell',.37,.41,.065,.036,graphite,'Hand.R')
gbox('Flamer pilot',(.35,0,.036),(.035,.02,.016),amber,'Hand.R',.003)
gbox('Flamer handle',(.17,0,-.005),(.04,.04,.085),rubber,'Hand.R',.006,-.1)
gcyl('Flamer gauge',.0,.014,.125,.02,light,'Hand.R')
gbox('Flamer fuel cell',(.06,0,.0),(.09,.07,.05),orange,'Hand.R',.008)
for x in [-.11,.11]:
 cylinder('Flamer back tank',(x,.43,1.08),(x,.43,1.5),.07,orange,'Spine')
 cylinder('Flamer tank valve',(x,.43,1.5),(x,.43,1.56),.03,steel,'Spine')
 sphere('Flamer tank cap',(x,.43,1.08),(.07,.07,.03),graphite,'Spine',12,6)
box('Flamer tank strap',(0,.44,1.3),(.34,.05,.05),graphite,'Spine',.01)
flameparts=parts[flameparts_before:]

# Submachine gun: a short ceramic-shrouded carbine with a stick magazine ahead of the trigger and a wire stock,
# held two-handed by a vertical fore-grip. The charging handle rides the Bolt bone.
smgparts_before=len(parts)
gbox('Smg grip',(-.012,0,-.005),(.05,.042,.13),rubber,'Hand.R',.008,.25)
gbox('Smg trigger guard',(.03,0,.008),(.08,.03,.008),gunmetal,'Hand.R',.002)
gbox('Smg trigger',(.03,0,.022),(.01,.012,.025),steel,'Hand.R',0)
gbox('Smg lower receiver',(.05,0,.045),(.22,.05,.04),gunmetal,'Hand.R',.006)
gbox('Smg upper shroud',(.07,0,.08),(.26,.056,.04),ivory,'Hand.R',.008)
for x in [.12,.16,.2]:
 for side in [-1,1]:gbox('Smg shroud vent',(x,side*.029,.08),(.022,.004,.016),graphite,'Hand.R',0)
gbox('Smg magazine',(.1,0,-.035),(.034,.03,.12),graphite,'Hand.R',.004,-.1)
gbox('Smg magazine base',(.106,0,-.097),(.042,.036,.014),orange,'Hand.R',.003,-.1)
gbox('Smg fore-grip',(.19,0,.0),(.03,.03,.07),rubber,'Hand.R',.005,-.08)
gcyl('Smg barrel',.2,.29,.075,.012,steel,'Hand.R')
gcyl('Smg muzzle',.28,.31,.075,.019,graphite,'Hand.R')
for side in [-1,1]:gbox('Smg stock rail',(-.12,side*.014,.07),(.12,.006,.008),graphite,'Hand.R',0)
gbox('Smg stock pad',(-.18,0,.055),(.014,.044,.07),rubber,'Hand.R',.004)
gbox('Smg stock cap',(-.188,0,.055),(.006,.036,.056),orange,'Hand.R',.002)
gbox('Smg rail',(.04,0,.104),(.16,.022,.008),graphite,'Hand.R',.002)
gbox('Smg sight',(.03,0,.122),(.05,.032,.03),graphite,'Hand.R',.004)
gbox('Smg sight lens',(.056,0,.124),(.004,.022,.018),light,'Hand.R',0)
for side in [-1,1]:gbox('Smg power cell',(.05,side*.0255,.045),(.12,.004,.01),light,'Hand.R',0)
gbox('Smg charging handle',(.0,.032,.085),(.026,.014,.012),steel,'Bolt',.003)
gbox('Smg ejection port',(.01,.0285,.07),(.05,.004,.02),graphite,'Bolt',0)
smgparts=parts[smgparts_before:]

# Electric katana: the handle runs through the fist along the grip, so the blade rises from the gun frame's +z. The
# edge is a charged strip that glows.
arc_edge=mat('Blade • arc cyan',(.35,.85,1.0),.3,0,4)
blade_steel=mat('Blade • dark titanium',(.09,.11,.13),.28,.85)
bladeparts_before=len(parts)
gbox('Katana handle',(0,0,-.035),(.032,.03,.17),graphite,'Hand.R',.004)
for z in [-.1,-.065,-.03,.005]:gbox('Katana cord wrap',(0,0,z),(.035,.033,.008),orange,'Hand.R',.001)
gbox('Katana pommel',(0,0,-.125),(.038,.036,.02),steel,'Hand.R',.004)
gbox('Katana guard',(0,0,.06),(.08,.062,.012),graphite,'Hand.R',.003)
gbox('Katana guard ring',(0,0,.068),(.054,.042,.005),light,'Hand.R',0)
gbox('Katana collar',(0,0,.085),(.032,.022,.03),steel,'Hand.R',.002)
gbox('Katana blade',(-.004,0,.37),(.038,.009,.54),blade_steel,'Hand.R',.0008)
gbox('Katana edge',(.017,0,.37),(.009,.005,.53),arc_edge,'Hand.R',0)
gbox('Katana tip',(.003,0,.648),(.034,.0085,.034),blade_steel,'Hand.R',.0008,.7)
gbox('Katana tip edge',(.016,0,.646),(.009,.005,.03),arc_edge,'Hand.R',0,.7)
bladeparts=parts[bladeparts_before:]

# Railgun: a long two-handed coil gun. Twin rails run out past a row of glowing coils; a power cell slots in behind the
# trigger and a capacitor pack rides on top.
coil=mat('Coil • charged cyan',(.3,.8,1.0),.3,0,2.5)
railparts_before=len(parts)
gbox('Rail grip',(-.012,0,-.005),(.05,.042,.13),rubber,'Hand.R',.008,.25)
gbox('Rail trigger guard',(.03,0,.008),(.09,.03,.008),gunmetal,'Hand.R',.002)
gbox('Rail trigger',(.03,0,.022),(.01,.012,.025),steel,'Hand.R',0)
gbox('Rail body',(.04,0,.06),(.3,.062,.075),graphite,'Hand.R',.01)
gbox('Rail stock',(-.16,0,.055),(.07,.054,.11),ivory,'Hand.R',.01)
gbox('Rail butt cap',(-.2,0,.055),(.012,.05,.095),orange,'Hand.R',.003)
gbox('Rail cell',(-.07,0,-.01),(.06,.044,.07),orange,'Hand.R',.006)
gbox('Rail cell window',(-.07,.023,-.005),(.03,.004,.04),coil,'Hand.R',0)
for z in [.083,.037]:gbox('Rail rail',(.38,0,z),(.44,.03,.014),steel,'Hand.R',.002)
for x in [.22,.3,.38,.46]:gbox('Rail coil',(x,0,.06),(.022,.07,.082),coil,'Hand.R',.002)
gbox('Rail capacitor',(.02,0,.115),(.16,.05,.04),ivory,'Hand.R',.006)
gbox('Rail capacitor window',(.02,.026,.115),(.1,.004,.016),coil,'Hand.R',0)
gbox('Rail fore-grip',(.2,0,.0),(.035,.035,.075),rubber,'Hand.R',.006,.12)
gbox('Rail muzzle',(.6,0,.06),(.02,.05,.07),graphite,'Hand.R',.003)
railparts=parts[railparts_before:]

# Arc projector: a stubby ivory body ringed with coils, a cell housing under it and three prongs round a glowing emitter.
arcparts_before=len(parts)
gbox('Arc grip',(-.012,0,-.005),(.05,.042,.13),rubber,'Hand.R',.008,.25)
gbox('Arc trigger',(.03,0,.022),(.01,.012,.025),steel,'Hand.R',0)
gbox('Arc guard',(.035,0,.004),(.08,.03,.008),gunmetal,'Hand.R',.002)
gcyl('Arc body',-.1,.2,.065,.046,ivory,'Hand.R')
gcyl('Arc cap',-.13,-.09,.065,.05,graphite,'Hand.R')
for x in [.02,.08,.14]:gcyl('Arc coil',x,x+.016,.065,.053,coil,'Hand.R')
gbox('Arc cell',(.04,0,.005),(.09,.05,.04),orange,'Hand.R',.006)
gbox('Arc handle',(.15,0,-.005),(.035,.035,.075),rubber,'Hand.R',.006,-.1)
gcyl('Arc neck',.2,.25,.065,.026,graphite,'Hand.R')
gcyl('Arc emitter',.25,.27,.065,.02,coil,'Hand.R')
for a in [0,2.094,4.189]:
 y,z=math.sin(a)*.04,.065+math.cos(a)*.04
 gbox('Arc prong',(.25,y,z),(.08,.012,.012),steel,'Hand.R',.002)
 gbox('Arc prong tip',(.29,y,z),(.012,.016,.016),coil,'Hand.R',0)
arcparts=parts[arcparts_before:]

# Armature: bone-local Y follows each limb; explicit X axis handles forward/back swing.
arm=bpy.data.armatures.new('Frontier pressure suit skeleton');rig=bpy.data.objects.new('AstronautRig',arm);scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None,deform=True):
 b=arm.edit_bones.new(name);b.head=head;b.tail=tail;b.use_deform=deform
 if parent:b.parent=arm.edit_bones[parent]
 b.roll=0;return b
bone('Hips',(0,0,.95),(0,0,1.08));bone('Spine',(0,0,1.08),(0,0,1.48),'Hips');bone('Head',(0,0,1.53),(0,0,1.95),'Spine')
for s in [-1,1]:
 su='L' if s<0 else 'R'
 bone('Thigh.'+su,(s*.155,0,.95),(s*.155,.01,.59),'Hips')
 bone('Shin.'+su,(s*.155,.01,.59),(s*.155,0,.20),'Thigh.'+su)
 bone('Foot.'+su,(s*.155,0,.20),(s*.155,-.22,.12),'Shin.'+su)
 bone('UpperArm.'+su,(s*.345,0,1.43),(s*.41,0,1.115),'Spine')
 bone('Forearm.'+su,(s*.41,0,1.115),(s*.415,-.04,.89),'UpperArm.'+su)
 bone('Hand.'+su,(s*.415,-.04,.89),(s*.415,-.06,.77),'Forearm.'+su)
# The slide recoils along the barrel; marker bones give the runtime the muzzle, the aim line and the ejection port.
bone('Slide',gun_point(-.08,0,.088),gun_point(.17,0,.088),'Hand.R')
bone('Bolt',gun_point(-.08,0,.075),gun_point(.06,0,.075),'Hand.R')
for name,p,parent in [('Muzzle',(.215,0,.088),'Hand.R'),('MuzzleAhead',(.315,0,.088),'Hand.R'),('Port',(.035,.03,.095),'Slide'),('PortOut',(.015,.1,.145),'Slide'),
 ('RifleMuzzle',(.47,0,.06),'Hand.R'),('RifleMuzzleAhead',(.57,0,.06),'Hand.R'),('RiflePort',(-.04,.035,.07),'Bolt'),('RiflePortOut',(-.06,.11,.12),'Bolt'),
 ('Nozzle',(.41,0,.065),'Hand.R'),('NozzleAhead',(.51,0,.065),'Hand.R'),('Pilot',(.37,0,.036),'Hand.R'),
 ('SmgMuzzle',(.31,0,.075),'Hand.R'),('SmgMuzzleAhead',(.41,0,.075),'Hand.R'),('SmgPort',(.01,.033,.072),'Bolt'),('SmgPortOut',(-.01,.11,.12),'Bolt'),
 ('BladeBase',(.004,0,.1),'Hand.R'),('BladeTip',(.008,0,.66),'Hand.R'),
 ('RailMuzzle',(.62,0,.06),'Hand.R'),('RailMuzzleAhead',(.72,0,.06),'Hand.R'),('ArcEmitter',(.28,0,.065),'Hand.R'),('ArcEmitterAhead',(.38,0,.065),'Hand.R')]:
 head=gun_point(*p);bone(name,head,head+GUN_UP*.03,parent,False)
bpy.ops.object.mode_set(mode='OBJECT')

def join_skin(objects,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 mod=o.modifiers.new('Skeleton deformation','ARMATURE');mod.object=rig;o.parent=rig
 return o
body=join_skin(bodyparts,'FrontierSuit');tool=join_skin(toolparts,'ConstructionTool');pistol=join_skin(gunparts,'Pistol');rifle=join_skin(rifleparts,'Rifle');flamer=join_skin(flameparts,'Flamethrower')
smg=join_skin(smgparts,'Smg');katana=join_skin(bladeparts,'Katana');railgun=join_skin(railparts,'Railgun');arcgun=join_skin(arcparts,'ArcProjector')
for p in rig.pose.bones:p.rotation_mode='XYZ'
rig.animation_data_create()

# ---- Posing ----
def reset_pose():
 for p in rig.pose.bones:p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(1,1,1)
def rx(name,val):rig.pose.bones[name].rotation_euler.x=val
def rz(name,val):rig.pose.bones[name].rotation_euler.z=val
def refresh():bpy.context.view_layer.update()
REST_UP={'Hand.R':arm.bones['Hand.R'].matrix_local.to_3x3().inverted()@GUN_UP}
def point(name,direction,up=None):
 """Rotate a bone so it points along an armature-space direction; `up` twists the hand so the gun's top faces it."""
 refresh();pb=rig.pose.bones[name];b=pb.bone
 base=pb.parent.matrix@(pb.parent.bone.matrix_local.inverted()@b.matrix_local) if pb.parent else b.matrix_local
 inv=base.to_3x3().normalized().inverted();d=(inv@Vector(direction)).normalized()
 q=Vector((0,1,0)).rotation_difference(d)
 if up is not None and name in REST_UP:
  cur=q@REST_UP[name];want=inv@Vector(up)
  cur=(cur-d*cur.dot(d)).normalized();want=(want-d*want.dot(d)).normalized()
  angle=cur.angle(want,0);q=Quaternion(d,angle if d.dot(cur.cross(want))>0 else -angle)@q
 pb.rotation_euler=q.to_euler('XYZ')
LEN={n:arm.bones[n].length for n in arm.bones.keys()}
def reach(side,wrist,pole):
 """Two-bone arm IK: shoulder to wrist, the elbow bending toward `pole`."""
 refresh();s=rig.pose.bones['UpperArm.'+side].head.copy();t=Vector(wrist);a,b=LEN['UpperArm.'+side],LEN['Forearm.'+side]
 d=t-s;dist=min(d.length,a+b-1e-4);u=d.normalized()
 cos=(a*a+dist*dist-b*b)/(2*a*dist);p=Vector(pole);perp=(p-u*p.dot(u)).normalized()
 elbow=s+u*a*cos+perp*a*math.sqrt(max(0,1-cos*cos))
 point('UpperArm.'+side,elbow-s);point('Forearm.'+side,s+u*dist-elbow)
def lerp(a,b,k):return Vector(a).lerp(Vector(b),k)
def ease(k):k=max(0,min(1,k));return k*k*(3-2*k)
def leg(su,y,drop,lift=0):
 """Solve a leg for an ankle `y` ahead (negative is forward) and `lift` up, with the hips lowered by `drop`."""
 h=.95+drop-(.20+lift);L1,L2=.36,.39;distance=min(L1+L2-.001,math.hypot(y,h))
 knee=math.acos(max(-1,min(1,(distance*distance-L1*L1-L2*L2)/(2*L1*L2))))
 thigh=math.atan2(y,h)-math.atan2(L2*math.sin(knee),L1+L2*math.cos(knee))
 rx('Thigh.'+su,thigh);rx('Shin.'+su,knee);rx('Foot.'+su,-thigh-knee)

# The two-handed aim: right wrist ahead of the chest, gun level and upright; the left hand cups it from below.
AIM_W,AIM_A,AIM_WL,AIM_AL=Vector((.1,-.45,1.32)),Vector((0,-1,0)),Vector((0,-.43,1.25)),Vector((.6,-.7,.25)).normalized()
POLE_R,POLE_L=(1,.3,-1),(-1,.3,-1)
def aim(w=AIM_W,a=AIM_A,wl=AIM_WL,al=AIM_AL,up=(0,0,1)):
 reach('R',w,POLE_R);point('Hand.R',a,up);reach('L',wl,POLE_L);point('Hand.L',al)
STANCE_TWIST=0
def aim_body(lean=.05):
 rx('Spine',lean);rx('Head',.04)
 # Long guns are held bladed: the chest turns so the left shoulder comes forward, the head keeps on the target.
 if STANCE_TWIST:rig.pose.bones['Spine'].rotation_euler.y=STANCE_TWIST;rig.pose.bones['Head'].rotation_euler.y=-STANCE_TWIST

def idle(t):
 wave=math.sin(t*math.tau);rig.pose.bones['Spine'].scale=(1,1,1+wave*.007)
 rx('Spine',wave*.01);rz('Head',wave*.008)
 for su in ['L','R']:rx('Forearm.'+su,-.08)
def gait(t,run=False):
 phase=t*math.tau
 hip=-.13 if run else -.075
 rig.pose.bones['Hips'].location.y=hip
 stride=.40 if run else .29
 stance=.53 if run else .60
 for su,offset in [('L',0),('R',.5)]:
  u=(t+offset)%1
  if u<stance:y=-stride+2*stride*u/stance;lift=0
  else:v=(u-stance)/(1-stance);y=stride*math.cos(v*math.pi);lift=(.20 if run else .11)*math.sin(v*math.pi)
  leg(su,y,hip,lift)
  swing=math.sin(phase+offset*math.tau)
  rx('UpperArm.'+su,-swing*(.48 if run else .25))
  rx('Forearm.'+su,-.65 if run else -.18)
 rx('Spine',.12 if run else .025);rz('Spine',math.sin(phase)*.025)
def build(t):
 wave=math.sin(t*math.tau)
 rx('UpperArm.R',-1.05+wave*.055);rx('Forearm.R',-.32+wave*.06)
 rx('UpperArm.L',-.58);rx('Forearm.L',-.55);rx('Spine',.045);rz('Head',-.06)

# ---- Combat clips ----
# A weapon that is not aimed like a gun (the katana) sets UPPER to pose the arms itself, given the bob.
UPPER=None
def hold(bob):
 if UPPER:UPPER(bob)
 else:aim(AIM_W+Vector((0,0,bob)),AIM_A,AIM_WL+Vector((0,0,bob)))
def aim_idle(t):
 wave=math.sin(t*math.tau);aim_body(.05+wave*.008);rz('Head',wave*.01)
 hold(wave*.006)
def aim_gait(t,run=False):
 # Legs stride as usual; the upper body keeps the gun level on the target.
 gait(t,run);rz('Spine',0);aim_body(.1 if run else .05)
 hold(math.sin(t*math.tau*2)*(.012 if run else .006))
KICK=[0,1,.85,.55,.32,.17,.08,.03,0];SLIDE=[0,.7,1,.5,0,0,0,0,0]
def fire(t):
 f=round(t*8);k=KICK[f];aim_body(.05-.06*k);rx('Head',.04-.05*k)
 aim(AIM_W+Vector((0,.05,.035))*k,(AIM_A+Vector((0,0,.4*k))).normalized(),AIM_WL+Vector((0,.045,.03))*k)
 rig.pose.bones['Slide'].location.y=-.05*SLIDE[f]
def hurt(t):
 # Raked across the front: thrown back a step, head snapped, arms flung, then back on aim.
 h=min(1,t/.15) if t<.15 else 1-ease((t-.15)/.85)
 rx('Spine',.05-.4*h);rz('Spine',.18*h);rx('Head',.04-.45*h);rz('Head',.22*h)
 rig.pose.bones['Hips'].location.y=-.08*h
 leg('L',.18*h,-.08*h,0);leg('R',-.05*h,-.08*h,0)
 aim(AIM_W+Vector((.18,.28,.22))*h,(AIM_A+Vector((.3,.2,1.2))*h).normalized(),AIM_WL+Vector((-.25,.3,.12))*h,(AIM_AL+Vector((-1,.4,.8))*h).normalized())
TURN=math.pi/8
def turn(t,d):
 # Stepping round on the spot, d=+1 to the left. The runtime yaws the body a quarter turn per cycle; a planted foot
 # counter-rotates against that so it stays put on the ground, while the free foot lifts and swings ahead into the turn.
 aim_idle(t);rig.pose.bones['Hips'].location.y=-.03
 for su,offset in [('L' if d>0 else 'R',0),('R' if d>0 else 'L',.5)]:
  u=(t+offset)%1
  if u<.5:a=d*TURN*(1-4*u);lift=0
  else:v=(u-.5)/.5;a=d*TURN*(-1+2*ease(v));lift=.09*math.sin(math.pi*v)
  leg(su,0,-.03,lift);rig.pose.bones['Thigh.'+su].rotation_euler.y=a
 rz('Spine',d*.04*math.sin(t*math.tau*2))
def roll(t):
 # A forward roll through the hips, the body balled up round a lowered pivot.
 spin=math.tau*ease(t);tuck=math.sin(math.pi*t)**.6
 # The hips sink only while the body is upright; inverted, they ride high so the helmet clears the floor.
 rig.pose.bones['Hips'].location.y=-tuck*(.22+.24*math.cos(spin));rx('Hips',spin)
 rx('Spine',.9*tuck);rx('Head',.5*tuck)
 for su in ['L','R']:rx('Thigh.'+su,-1.9*tuck);rx('Shin.'+su,2.1*tuck);rx('Foot.'+su,-.3*tuck);rx('UpperArm.'+su,-1.0*tuck);rx('Forearm.'+su,-1.3*tuck)
def jump(t):
 s=math.sin(t*math.tau)
 rx('Thigh.L',-1.0);rx('Shin.L',1.4);rx('Foot.L',-.3);rx('Thigh.R',-.35+.05*s);rx('Shin.R',.9);rx('Foot.R',-.2)
 aim_body(.08)
 aim(AIM_W+Vector((0,.03,.06)),AIM_A,Vector((-.55,-.12,1.36+.02*s)),Vector((-1,-.2,.2)))
def land(t):
 l=t/.2 if t<.2 else 1-ease((t-.2)/.8)
 drop=-.22*l;rig.pose.bones['Hips'].location.y=drop;leg('L',-.03,drop);leg('R',.03,drop)
 aim_body(.05+.25*l);aim(AIM_W+Vector((0,0,-.1*l)),AIM_A,AIM_WL+Vector((0,0,-.1*l)))
HELMET=Vector((0,0,1.8))
def struggle(t):
 # Both hands clamped on the thing on its head, wrenching it side to side while it staggers.
 p=math.sin(t*math.tau)
 rx('Spine',-.12);rz('Spine',.2*p);rx('Head',-.2+.1*math.sin(t*math.tau*2));rz('Head',.3*p)
 drop=-.1;rig.pose.bones['Hips'].location=(.04*p,drop,0);leg('L',-.12+.05*p,drop);leg('R',.1-.05*p,drop)
 left=Vector((-.26-.03*p,-.13-.07*p,1.9+.04*p));right=Vector((.26-.03*p,-.13+.07*p,1.9-.04*p))
 reach('L',left,(-1,.4,-.4));point('Hand.L',HELMET-left+Vector((0,0,.15)))
 reach('R',right,(1,.4,-.4));point('Hand.R',(0,-.2,1),(-1,0,0))
def throw_off(t):
 # Grip the top, wrench it free, heave it forward over the head, then back on aim.
 grip_l,grip_r=Vector((-.14,-.08,2.02)),Vector((.14,-.08,2.02));heave_l,heave_r=Vector((-.22,-.58,1.85)),Vector((.22,-.58,1.85))
 if t<.25:k=ease(t/.25);wl,wr=grip_l,grip_r;spine=-.15*k;head=-.3*k;al,ar=(.3,0,1),(-.3,0,1)
 elif t<.55:k=ease((t-.25)/.3);wl,wr=lerp(grip_l,heave_l,k),lerp(grip_r,heave_r,k);spine=-.15+.5*k;head=-.3+.4*k;al,ar=(.3,-1,.6*(1-k)),(-.3,-1,.6*(1-k))
 else:
  k=ease((t-.55)/.45);aim_body(.35-.3*k);rx('Head',.1-.06*k)
  aim(lerp(heave_r,AIM_W,k),AIM_A,lerp(heave_l,AIM_WL,k),AIM_AL);return
 rx('Spine',spine);rx('Head',head)
 reach('L',wl,(-1,.3,-.3));point('Hand.L',al);reach('R',wr,(1,.3,-.3));point('Hand.R',ar,(0,-1,0))
def collapse(t):
 # Knees buckle, then it pitches forward onto its front.
 k=ease(t/.35);m=ease((t-.35)/.65)
 hips=rig.pose.bones['Hips'];hips.location.y=-.45*k-.15*m;rx('Hips',1.1*m);rz('Hips',.25*m)
 for su in ['L','R']:rx('Thigh.'+su,-.1*k-.5*m);rx('Shin.'+su,1.55*k);rx('Foot.'+su,.2*k);rx('UpperArm.'+su,.1*k-1.3*m);rx('Forearm.'+su,-.3*k-.3*m)
 rx('Spine',.3*k-.1*m);rx('Head',.35*k-.2*m)

def bolt_fire(t):
 # The rifle: a sharper, shorter kick into the shoulder and the bolt cycling.
 f=round(t*8);k=KICK[f]*.7;aim_body(.05-.05*k);rx('Head',.04-.03*k)
 aim(AIM_W+Vector((0,.04,.02))*k,(AIM_A+Vector((0,0,.22*k))).normalized(),AIM_WL+Vector((0,.04,.02))*k,AIM_AL)
 rig.pose.bones['Bolt'].location.y=-.06*SLIDE[f]
def smg_fire(t):
 # Lighter than the pistol's kick, quick enough to sit under each round of a burst.
 f=round(t*8);k=KICK[f]*.5;aim_body(.05-.04*k);rx('Head',.04-.03*k)
 aim(AIM_W+Vector((0,.035,.02))*k,(AIM_A+Vector((0,0,.18*k))).normalized(),AIM_WL+Vector((0,.03,.015))*k,AIM_AL)
 rig.pose.bones['Bolt'].location.y=-.04*SLIDE[f]

def rail_fire(t):
 # The slug leaves hard: a heavy shove back into the shoulder and the muzzle thrown high.
 f=round(t*8);k=KICK[f]*1.2;aim_body(.05-.08*k);rx('Head',.04-.06*k)
 aim(AIM_W+Vector((0,.07,.05))*k,(AIM_A+Vector((0,0,.5*k))).normalized(),AIM_WL+Vector((0,.06,.04))*k,AIM_AL)

def hand_point(p):
 """Where a gun-frame point on the posed right hand is, in armature space."""
 refresh();return rig.pose.bones['Hand.R'].matrix@(arm.bones['Hand.R'].matrix_local.inverted()@gun_point(*p))
def katana_grip(w,blade,fingers=(0,-1,-.4)):
 """Right fist at wrist `w` with the blade along `blade`; the left hand closes on the handle below it."""
 B=Vector(blade).normalized();F=Vector(fingers);F=F-B*F.dot(B)
 F=F.normalized() if F.length>.05 else Vector((0,-1,0))
 reach('R',w,POLE_R);point('Hand.R',F,B)
 grip=hand_point((-.005,0,-.1));reach('L',grip-F*GRIP_REACH,POLE_L);point('Hand.L',F)
KATANA_W,KATANA_B=Vector((.2,-.34,1.1)),Vector((-.15,-1,.8))
def katana_ready(bob):katana_grip(KATANA_W+Vector((0,0,bob)),KATANA_B)
# The slash: wound up over the right shoulder, a diagonal cut down across the front, followed through to the left hip.
SLASH=[(0,KATANA_W,KATANA_B,(0,-1,-.4),0),(.22,(.36,-.08,1.5),(.45,.65,.75),(0,-1,0),.38),(.45,(.1,-.55,1.22),(-.35,-1,.05),(0,-.3,-1),0),
 (.66,(-.28,-.4,1.0),(-1,.15,-.35),(0,-1,-.2),-.45),(1,KATANA_W,KATANA_B,(0,-1,-.4),0)]
def katana_slash(t):
 i=0
 while i<len(SLASH)-2 and t>=SLASH[i+1][0]:i+=1
 a,b=SLASH[i],SLASH[i+1];k=ease((t-a[0])/(b[0]-a[0]))
 aim_body(.08+.12*math.sin(math.pi*t));twist=a[4]+(b[4]-a[4])*k
 rig.pose.bones['Spine'].rotation_euler.y=twist;rig.pose.bones['Head'].rotation_euler.y=-twist*.7
 lunge=math.sin(math.pi*min(1,t*1.4));rig.pose.bones['Hips'].location.y=-.06*lunge
 leg('L',-.16*lunge,-.06*lunge);leg('R',.12*lunge,-.06*lunge)
 katana_grip(lerp(a[1],b[1],k),lerp(Vector(a[2]).normalized(),Vector(b[2]).normalized(),k),lerp(a[3],b[3],k))
# The parry: the blade snapped up flat across the visor to take the blow, braced, then a short shove out to throw it off.
PARRY=[(0,KATANA_W,KATANA_B,(0,-1,-.4),0),(.18,(.1,-.44,1.44),(-1,-.25,.3),(0,-.5,1),-.25),(.5,(.12,-.48,1.47),(-1,-.3,.38),(0,-.5,1),-.28),
 (.66,(.2,-.6,1.4),(-1,-.5,.2),(0,-.6,1),-.1),(1,KATANA_W,KATANA_B,(0,-1,-.4),0)]
def katana_parry(t):
 i=0
 while i<len(PARRY)-2 and t>=PARRY[i+1][0]:i+=1
 a,b=PARRY[i],PARRY[i+1];k=ease((t-a[0])/(b[0]-a[0]))
 brace=math.sin(math.pi*min(1,t*1.3));aim_body(.04-.08*brace);twist=a[4]+(b[4]-a[4])*k
 rig.pose.bones['Spine'].rotation_euler.y=twist;rig.pose.bones['Head'].rotation_euler.y=-twist*.5
 rig.pose.bones['Hips'].location.y=-.05*brace;leg('L',-.1*brace,-.05*brace);leg('R',.14*brace,-.05*brace)
 katana_grip(lerp(a[1],b[1],k),lerp(Vector(a[2]).normalized(),Vector(b[2]).normalized(),k),lerp(a[3],b[3],k))
GRIP_REACH=.077
def stance(right,fore,lean_left=(0,-.25,1),twist=0):
 """Set the aim globals for a weapon: the right wrist, and the left wrist placed so the glove closes on the fore-grip
 at gun-frame x=`fore` (the gun points along -y with its top up while aiming)."""
 global AIM_W,AIM_WL,AIM_AL,STANCE_TWIST
 AIM_W=Vector(right);STANCE_TWIST=twist
 AIM_AL=Vector(lean_left).normalized()
 grip=AIM_W+AIM_A*GRIP_REACH+AIM_A*fore*GUN_SCALE
 AIM_WL=grip-AIM_AL*GRIP_REACH
PISTOL_STANCE=(AIM_W.copy(),AIM_WL.copy(),AIM_AL.copy())
LOC_BONES={'Hips','Spine','Slide','Bolt'}
def make_clip(name,frames,pose,loop=True):
 # Pose every frame first, with nothing animating the rig so the solver reads a clean pose; then key them.
 rig.animation_data.action=None;samples=[]
 for f in range(frames+1):
  reset_pose();pose(f/frames if frames else 0);refresh()
  samples.append({p.name:(p.rotation_euler.copy(),p.location.copy(),p.scale.copy()) for p in rig.pose.bones})
 action=bpy.data.actions.new(name);created['actions'].append(action);rig.animation_data.action=action
 for f,sample in enumerate(samples):
  for p in rig.pose.bones:
   r,l,s=sample[p.name];p.rotation_euler=r;p.location=l;p.scale=s
   p.keyframe_insert(data_path='rotation_euler',frame=f+1,group=p.name)
   if p.name in LOC_BONES:p.keyframe_insert(data_path='location',frame=f+1,group=p.name)
   if p.name=='Spine':p.keyframe_insert(data_path='scale',frame=f+1,group=p.name)
 rig.animation_data.action=None
 track=rig.animation_data.nla_tracks.new();track.name=name
 track.strips.new(name,1,action);track.mute=True
 return action
CLIP_NAMES=['Idle','Walk','Run','Build','AimIdle','AimWalk','AimRun','Fire','Hurt','Roll','Jump','Land','Struggle','ThrowOff','Collapse','TurnL','TurnR']
clips=[make_clip('Idle',90,idle),make_clip('Walk',24,lambda t:gait(t)),make_clip('Run',20,lambda t:gait(t,True)),make_clip('Build',30,build),
 make_clip('AimIdle',60,aim_idle),make_clip('AimWalk',24,lambda t:aim_gait(t)),make_clip('AimRun',20,lambda t:aim_gait(t,True)),make_clip('Fire',8,fire),
 make_clip('Hurt',18,hurt),make_clip('Roll',13,roll),make_clip('Jump',30,jump),make_clip('Land',10,land),
 make_clip('Struggle',24,struggle),make_clip('ThrowOff',20,throw_off),make_clip('Collapse',36,collapse),
 make_clip('TurnL',24,lambda t:turn(t,1)),make_clip('TurnR',24,lambda t:turn(t,-1))]
stance((.1,-.36,1.34),.2,(0,-.3,1),.32)
clips+=[make_clip('RifleAimIdle',60,aim_idle),make_clip('RifleAimWalk',24,lambda t:aim_gait(t)),make_clip('RifleAimRun',20,lambda t:aim_gait(t,True)),make_clip('RifleFire',8,bolt_fire),
 make_clip('RifleTurnL',24,lambda t:turn(t,1)),make_clip('RifleTurnR',24,lambda t:turn(t,-1))]
stance((.16,-.3,1.1),.17,(0,-.2,1),.28)
clips+=[make_clip('FlameAimIdle',60,aim_idle),make_clip('FlameAimWalk',24,lambda t:aim_gait(t)),make_clip('FlameAimRun',20,lambda t:aim_gait(t,True)),
 make_clip('FlameTurnL',24,lambda t:turn(t,1)),make_clip('FlameTurnR',24,lambda t:turn(t,-1))]
CLIP_NAMES+=['RifleAimIdle','RifleAimWalk','RifleAimRun','RifleFire','RifleTurnL','RifleTurnR','FlameAimIdle','FlameAimWalk','FlameAimRun','FlameTurnL','FlameTurnR']
stance((.1,-.4,1.3),.19,(0,-.3,1),.18)
clips+=[make_clip('SmgAimIdle',60,aim_idle),make_clip('SmgAimWalk',24,lambda t:aim_gait(t)),make_clip('SmgAimRun',20,lambda t:aim_gait(t,True)),make_clip('SmgFire',8,smg_fire),
 make_clip('SmgTurnL',24,lambda t:turn(t,1)),make_clip('SmgTurnR',24,lambda t:turn(t,-1))]
stance((.1,-.36,1.34),.2,(0,-.3,1),.32)
clips+=[make_clip('RailAimIdle',60,aim_idle),make_clip('RailAimWalk',24,lambda t:aim_gait(t)),make_clip('RailAimRun',20,lambda t:aim_gait(t,True)),make_clip('RailFire',8,rail_fire),
 make_clip('RailTurnL',24,lambda t:turn(t,1)),make_clip('RailTurnR',24,lambda t:turn(t,-1))]
stance((.14,-.34,1.2),.15,(0,-.25,1),.26)
clips+=[make_clip('ArcAimIdle',60,aim_idle),make_clip('ArcAimWalk',24,lambda t:aim_gait(t)),make_clip('ArcAimRun',20,lambda t:aim_gait(t,True)),
 make_clip('ArcTurnL',24,lambda t:turn(t,1)),make_clip('ArcTurnR',24,lambda t:turn(t,-1))]
CLIP_NAMES+=['RailAimIdle','RailAimWalk','RailAimRun','RailFire','RailTurnL','RailTurnR','ArcAimIdle','ArcAimWalk','ArcAimRun','ArcTurnL','ArcTurnR']
STANCE_TWIST=.2;UPPER=katana_ready
clips+=[make_clip('KatanaAimIdle',60,aim_idle),make_clip('KatanaAimWalk',24,lambda t:aim_gait(t)),make_clip('KatanaAimRun',20,lambda t:aim_gait(t,True)),
 make_clip('KatanaTurnL',24,lambda t:turn(t,1)),make_clip('KatanaTurnR',24,lambda t:turn(t,-1)),make_clip('KatanaSlash',13,katana_slash),make_clip('KatanaParry',12,katana_parry)]
UPPER=None
CLIP_NAMES+=['SmgAimIdle','SmgAimWalk','SmgAimRun','SmgFire','SmgTurnL','SmgTurnR','KatanaAimIdle','KatanaAimWalk','KatanaAimRun','KatanaTurnL','KatanaTurnR','KatanaSlash','KatanaParry']
AIM_W,AIM_WL,AIM_AL=PISTOL_STANCE;STANCE_TWIST=0
reset_pose();refresh()

scene.render.fps=30;scene.frame_start=1;scene.frame_end=91
bpy.ops.object.select_all(action='DESELECT')
for o in [rig,body,tool,pistol,rifle,flamer,smg,katana,railgun,arcgun]:o.select_set(True)
bpy.context.view_layer.objects.active=rig
for track in rig.animation_data.nla_tracks:track.mute=False
with contextlib.redirect_stdout(io.StringIO()):
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'astronaut-v3.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_frame_range=False,export_apply=False)
for track in rig.animation_data.nla_tracks:track.mute=True

# Portraits for inspection, not exported: the aim, a shot at its kick, and the struggle.
def point_camera(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.name='Studio floor';floor.data.materials.append(mat('Studio graphite',(.085,.11,.14),.95));floor.location.z=-.015
world=bpy.data.worlds.new('Studio cool fill');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.12,.17,.24,1);bg.inputs['Strength'].default_value=.4;scene.world=world
for name,loc,power,size,color in [('Key',(-3,-4,6),650,4,(1,.88,.73)),('Rim',(3,1,4),800,3,(.55,.73,1))]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
 o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;point_camera(o,(0,0,1))
data=bpy.data.cameras.new('Suit portrait');cam=bpy.data.objects.new('Suit portrait',data);scene.collection.objects.link(cam);data.type='ORTHO';data.ortho_scale=2.65;cam.location=(3.4,-4.6,2.6);point_camera(cam,(0,0,1.1));scene.camera=cam
engines={e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
for engine in ['BLENDER_EEVEE_NEXT','BLENDER_EEVEE','CYCLES']:
 if engine in engines:scene.render.engine=engine;break
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.image_settings.file_format='PNG'
with contextlib.suppress(Exception):scene.eevee.taa_render_samples=32
tool.hide_render=True
PORTRAITS=[('AimIdle',1,'astronaut-v3-aim.png'),('Fire',2,'astronaut-v3-fire.png'),('Struggle',7,'astronaut-v3-struggle.png'),('Roll',7,'astronaut-v3-roll.png'),('TurnL',19,'astronaut-v3-turn.png'),
 ('RailAimIdle',1,'astronaut-v3-railgun.png'),('ArcAimIdle',1,'astronaut-v3-arc.png'),('SmgAimIdle',1,'astronaut-v3-smg.png'),('KatanaAimIdle',1,'astronaut-v3-katana.png'),('KatanaSlash',4,'astronaut-v3-slash-wind.png'),('KatanaSlash',7,'astronaut-v3-slash.png'),('KatanaParry',4,'astronaut-v3-parry.png'),
 ('RifleAimIdle',1,'astronaut-v3-rifle.png'),('RifleFire',2,'astronaut-v3-rifle-fire.png'),('FlameAimIdle',1,'astronaut-v3-flame.png'),('FlameAimWalk',7,'astronaut-v3-flame-walk.png')]
only=os.environ.get('LUNAR_PORTRAITS')
for clip,frame,file in PORTRAITS:
 if only and clip not in only.split(','):continue
 held={'Rifle':rifle,'Flame':flamer,'Smg':smg,'Katana':katana,'Rail':railgun,'Arc':arcgun}
 for pre,o in held.items():o.hide_render=not clip.startswith(pre)
 pistol.hide_render=clip.startswith(tuple(held))
 rig.animation_data.action=clips[CLIP_NAMES.index(clip)];scene.frame_set(frame)
 scene.render.filepath=os.path.join(OUT,file);bpy.ops.render.render(write_still=True)
rig.animation_data.action=None
bpy.data.libraries.write(os.path.join(OUT,'astronaut-library.blend'),{scene},fake_user=True)

# Leave the open file as it was.
bpy.context.window.scene=previous_scene
for o in list(scene.collection.objects):bpy.data.objects.remove(o,do_unlink=True)
bpy.data.scenes.remove(scene)
for k in DATA:
 coll=getattr(bpy.data,k)
 for d in [d for d in coll if d not in before[k]]:coll.remove(d)
print('LUNAR_ASTRONAUT_READY',os.path.join(OUT,'astronaut-v3.glb'),'clips',CLIP_NAMES)
