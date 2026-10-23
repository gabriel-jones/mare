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
for name,p,parent in [('Muzzle',(.215,0,.088),'Hand.R'),('MuzzleAhead',(.315,0,.088),'Hand.R'),('Port',(.035,.03,.095),'Slide'),('PortOut',(.015,.1,.145),'Slide')]:
 head=gun_point(*p);bone(name,head,head+GUN_UP*.03,parent,False)
bpy.ops.object.mode_set(mode='OBJECT')

def join_skin(objects,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 mod=o.modifiers.new('Skeleton deformation','ARMATURE');mod.object=rig;o.parent=rig
 return o
body=join_skin(bodyparts,'FrontierSuit');tool=join_skin(toolparts,'ConstructionTool');pistol=join_skin(gunparts,'Pistol')
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
def aim_body(lean=.05):rx('Spine',lean);rx('Head',.04)

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
def aim_idle(t):
 wave=math.sin(t*math.tau);aim_body(.05+wave*.008);rz('Head',wave*.01)
 aim(AIM_W+Vector((0,0,wave*.006)),AIM_A,AIM_WL+Vector((0,0,wave*.006)))
def aim_gait(t,run=False):
 # Legs stride as usual; the upper body keeps the gun level on the target.
 gait(t,run);rz('Spine',0);aim_body(.1 if run else .05)
 bob=math.sin(t*math.tau*2)*(.012 if run else .006)
 aim(AIM_W+Vector((0,0,bob)),AIM_A,AIM_WL+Vector((0,0,bob)))
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

LOC_BONES={'Hips','Spine','Slide'}
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
reset_pose();refresh()

scene.render.fps=30;scene.frame_start=1;scene.frame_end=91
bpy.ops.object.select_all(action='DESELECT')
for o in [rig,body,tool,pistol]:o.select_set(True)
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
for clip,frame,file in [('AimIdle',1,'astronaut-v3-aim.png'),('Fire',2,'astronaut-v3-fire.png'),('Struggle',7,'astronaut-v3-struggle.png'),('Roll',7,'astronaut-v3-roll.png'),('TurnL',19,'astronaut-v3-turn.png')]:
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
