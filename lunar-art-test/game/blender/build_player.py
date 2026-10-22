"""Author the frontier pressure suit, skin it, and create reusable motion clips."""
import bpy, math, os, json, contextlib, io
from mathutils import Vector
OUT='/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
os.makedirs(OUT,exist_ok=True)
scene=bpy.data.scenes.new('Frontier astronaut • rig and animation')
bpy.context.window.scene=scene
parts=[]
def mat(name,c,rough=.6,metal=0,glow=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*c,1)
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
toolparts=parts[toolparts_before:];bodyparts=parts[:toolparts_before]

# Armature: bone-local Y follows each limb; explicit X axis handles forward/back swing.
arm=bpy.data.armatures.new('Frontier pressure suit skeleton');rig=bpy.data.objects.new('AstronautRig',arm);scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
 b=arm.edit_bones.new(name);b.head=head;b.tail=tail
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
bpy.ops.object.mode_set(mode='OBJECT')

def join_skin(objects,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 mod=o.modifiers.new('Skeleton deformation','ARMATURE');mod.object=rig;o.parent=rig
 return o
body=join_skin(bodyparts,'FrontierSuit');tool=join_skin(toolparts,'ConstructionTool')
for p in rig.pose.bones:p.rotation_mode='XYZ'
rig.animation_data_create()

def reset_pose():
 for p in rig.pose.bones:p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(1,1,1)
def rx(name,val):rig.pose.bones[name].rotation_euler.x=val
def rz(name,val):rig.pose.bones[name].rotation_euler.z=val
def make_clip(name,frames,pose):
 action=bpy.data.actions.new(name);rig.animation_data.action=action
 for f in range(frames+1):
  reset_pose();t=f/frames;pose(t)
  for p in rig.pose.bones:
   p.keyframe_insert(data_path='rotation_euler',frame=f+1,group=p.name)
   if p.name in ['Hips','Spine']:p.keyframe_insert(data_path='location',frame=f+1,group=p.name)
 action.use_fake_user=True
 track=rig.animation_data.nla_tracks.new();track.name=name
 strip=track.strips.new(name,1,action);track.mute=True
 return action
def idle(t):
 wave=math.sin(t*math.tau);rig.pose.bones['Spine'].scale=(1,1,1+wave*.007)
 rx('Spine',wave*.01);rz('Head',wave*.008)
 for su in ['L','R']:rx('Forearm.'+su,-.08)
def gait(t,run=False):
 phase=t*math.tau
 # Solve a two-link leg against a planted/swinging ankle path. Feet remain
 # level through stance; knees bend backwards rather than goose-stepping.
 hip=-.13 if run else -.075
 rig.pose.bones['Hips'].location.y=hip
 stride=.40 if run else .29
 stance=.53 if run else .60
 for su,offset in [('L',0),('R',.5)]:
  u=(t+offset)%1
  if u<stance:
   y=-stride+2*stride*u/stance;lift=0
  else:
   v=(u-stance)/(1-stance)
   y=stride*math.cos(v*math.pi);lift=(.20 if run else .11)*math.sin(v*math.pi)
  h=.95+hip-(.20+lift)
  L1,L2=.36,.39
  distance=min(L1+L2-.001,math.hypot(y,h))
  knee=math.acos(max(-1,min(1,(distance*distance-L1*L1-L2*L2)/(2*L1*L2))))
  thigh=math.atan2(y,h)-math.atan2(L2*math.sin(knee),L1+L2*math.cos(knee))
  rx('Thigh.'+su,thigh);rx('Shin.'+su,knee);rx('Foot.'+su,-thigh-knee)
  swing=math.sin(phase+offset*math.tau)
  rx('UpperArm.'+su,-swing*(.48 if run else .25))
  rx('Forearm.'+su,-.65 if run else -.18)
 rx('Spine',.12 if run else .025);rz('Spine',math.sin(phase)*.025)
def jump(t):
 # A held airborne pose; runtime blends this clip while the controller owns height.
 rx('Thigh.L',-.28);rx('Thigh.R',.20);rx('Shin.L',-.40);rx('Shin.R',-.55)
 rx('UpperArm.L',-.45);rx('UpperArm.R',-.45);rx('Forearm.L',-.45);rx('Forearm.R',-.45)
 rx('Spine',-.045)
def build(t):
 wave=math.sin(t*math.tau)
 rx('UpperArm.R',-1.05+wave*.055);rx('Forearm.R',-.32+wave*.06)
 rx('UpperArm.L',-.58);rx('Forearm.L',-.55);rx('Spine',.045);rz('Head',-.06)
clips=[make_clip('Idle',90,idle),make_clip('Walk',24,lambda t:gait(t)),make_clip('Run',20,lambda t:gait(t,True)),make_clip('Jump',30,jump),make_clip('Build',30,build)]
rig.animation_data.action=None;reset_pose();scene.frame_set(1)

scene.render.fps=30;scene.frame_start=1;scene.frame_end=91
bpy.ops.object.select_all(action='DESELECT')
for o in [rig,body,tool]:o.select_set(True)
bpy.context.view_layer.objects.active=rig
with contextlib.redirect_stdout(io.StringIO()):
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'astronaut-v2.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='ACTIONS',export_anim_single_armature=False,export_force_sampling=True,export_frame_range=False,export_apply=False)

# Portrait stage for visual inspection. It is not included in the GLB.
def point_camera(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.name='Studio floor';floor.data.materials.append(mat('Studio graphite',(.085,.11,.14),.95));floor.location.z=-.015
world=bpy.data.worlds.new('Studio cool fill');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.12,.17,.24,1);bg.inputs['Strength'].default_value=.4;scene.world=world
for name,loc,power,size,color in [('Key',(-3,-4,6),650,4,(1,.88,.73)),('Rim',(3,1,4),800,3,(.55,.73,1))]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
 o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;point_camera(o,(0,0,1))
data=bpy.data.cameras.new('Suit portrait');cam=bpy.data.objects.new('Suit portrait',data);scene.collection.objects.link(cam);data.type='ORTHO';data.ortho_scale=2.65;cam.location=(3,-5,3);point_camera(cam,(0,0,1.03));scene.camera=cam
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.eevee.taa_render_samples=128
scene.render.filepath=os.path.join(OUT,'astronaut-v2.png');tool.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'astronaut-v2.blend'))
bpy.ops.render.render(write_still=True)
print('Authored astronaut,',len(arm.bones),'bones; clips:',[a.name for a in clips])
print('Exports:',os.path.join(OUT,'astronaut-v2.glb'))
