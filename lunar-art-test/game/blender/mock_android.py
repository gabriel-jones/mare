"""Design study for the colony android: three candidate bodies lined up beside the astronaut for scale.
Static, unrigged blockouts rendered to assets/android-study.png (lineup) and assets/android-study-<id>.png (close-ups).
Run headless with --factory-startup; nothing is saved."""
import bpy, math, os, contextlib
from mathutils import Vector
OUT='/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
scene=bpy.context.scene
for o in list(scene.objects):bpy.data.objects.remove(o,do_unlink=True)

def mat(name,c,rough=.6,metal=0,glow=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*c,1)
 n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 n.inputs['Base Color'].default_value=(*c,1);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
 if glow:n.inputs['Emission Color'].default_value=(*c,1);n.inputs['Emission Strength'].default_value=glow
 return m
orange=mat('Oxide orange',(.66,.115,.025),.74)
ivory=mat('Warm chalk ceramic',(.70,.74,.71),.45,.08)
graphite=mat('Graphite',(.025,.040,.052),.65,.24)
rubber=mat('Seals',(.016,.022,.029),.9)
steel=mat('Titanium',(.25,.32,.36),.34,.75)
lcd=mat('LCD cyan',(.30,.80,1.0),.3,0,6)
lcdglass=mat('LCD glass',(.01,.04,.06),.12,.5)
amber=mat('Amber',(.93,.6,.25),.4,0,3)

ox=0
def bevel(o,w):
 if w:m=o.modifiers.new('b','BEVEL');m.width=w;m.segments=1;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
def put(o,m,smooth=False):
 o.data.materials.append(m)
 if smooth:
  for p in o.data.polygons:p.use_smooth=True
 return o
def box(loc,size,m,b=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(loc[0]+ox,loc[1],loc[2]));o=bpy.context.object;o.scale=size
 bpy.ops.object.transform_apply(scale=True);bevel(o,b);return put(o,m)
def sph(loc,size,m,seg=16,rings=8):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=1,location=(loc[0]+ox,loc[1],loc[2]));o=bpy.context.object;o.scale=size
 bpy.ops.object.transform_apply(scale=True);return put(o,m,True)
def cyl(a,b,r,m,v=12,bv=.01):
 a=Vector(a)+Vector((ox,0,0));b=Vector(b)+Vector((ox,0,0))
 bpy.ops.mesh.primitive_cylinder_add(vertices=v,radius=r,depth=(b-a).length,location=(a+b)/2)
 o=bpy.context.object;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();bpy.ops.object.transform_apply(rotation=True);bevel(o,bv);return put(o,m)
def limbs(sx,hip,knee,ankle,thigh_r,shin_r,joint,foot):
 for s in (-1,1):
  x=s*sx
  sph((x,0,hip),(joint,)*3,rubber);cyl((x,0,hip),(x,0,knee),thigh_r,graphite)
  sph((x,0,knee),(joint*.9,)*3,rubber);cyl((x,0,knee),(x,0,ankle),shin_r,graphite);foot(x)

# A: Courier. A slim ceramic android in the suit's palette; a rounded head with a single LCD strip for a face.
def courier():
 box((0,0,1.30),(.40,.24,.36),ivory,.06)                       # chest shell
 box((0,-.125,1.33),(.22,.02,.10),graphite,.01)
 box((-.05,-.137,1.35),(.09,.006,.02),lcd,.002)
 cyl((0,0,1.10),(0,0,1.02),.12,rubber)                        # waist spine
 box((0,0,.97),(.30,.20,.12),graphite,.03)                    # pelvis
 box((0,-.06,1.47),(.36,.12,.05),orange,.015)                 # collar plate
 cyl((0,0,1.50),(0,0,1.60),.05,steel)                         # neck
 sph((0,0,1.75),(.15,.16,.17),ivory,24,12)                    # head
 box((0,-.135,1.76),(.24,.05,.055),lcdglass,.02)              # face band
 box((0,-.16,1.76),(.17,.01,.018),lcd,.004)                   # LCD strip
 box((0,0,1.93),(.03,.12,.03),orange,.008)                    # crest
 box((0,.17,1.30),(.26,.10,.30),graphite,.03)                 # battery spine
 for z in (1.22,1.30,1.38):box((0,.222,z),(.14,.006,.025),lcd,.002)
 for s in (-1,1):
  sph((s*.25,0,1.43),(.085,)*3,rubber)
  box((s*.27,0,1.47),(.13,.18,.10),orange,.035)               # shoulder cap
  cyl((s*.27,0,1.42),(s*.29,0,1.15),.05,ivory)
  sph((s*.29,0,1.13),(.055,)*3,rubber)
  cyl((s*.29,0,1.12),(s*.30,-.03,.88),.048,ivory)
  box((s*.30,-.035,.82),(.07,.09,.11),graphite,.02)           # hand
 def foot(x):
  box((x,-.05,.05),(.13,.26,.08),graphite,.02);box((x,-.15,.07),(.12,.06,.06),orange,.015)
 limbs(.11,.92,.52,.10,.06,.05,.07,foot)
 for s in (-1,1):box((s*.11,-.06,.70),(.10,.04,.22),ivory,.02);box((s*.11,-.055,.30),(.09,.04,.22),ivory,.02)

# B: Stevedore. A wide industrial worker: no neck, a sensor bar between the shoulders, a big swappable battery pack.
def stevedore():
 box((0,0,1.22),(.62,.40,.48),ivory,.07)                      # torso block
 box((0,-.205,1.28),(.40,.03,.16),graphite,.015)
 for i,x in enumerate((-.14,-.07,0,.07,.14)):box((x,-.225,1.21),(.05,.01,.035),orange,.004)   # hazard chevrons
 box((0,0,1.52),(.30,.30,.14),graphite,.03)                   # head housing, sunk between shoulders
 box((0,-.155,1.53),(.26,.03,.06),lcdglass,.01)
 box((0,-.172,1.53),(.20,.008,.022),lcd,.003)                 # sensor bar
 for s in (-1,1):box((s*.12,-.02,1.62),(.04,.04,.06),steel,.008)  # antennae stubs
 box((0,.29,1.24),(.44,.20,.44),graphite,.04)                 # battery pack
 box((0,.395,1.24),(.30,.01,.30),orange,.01)
 for z in (1.10,1.18,1.26,1.34):box((0,.402,z),(.20,.006,.03),lcd,.002)
 box((0,0,.90),(.40,.30,.16),graphite,.04)                    # pelvis
 for s in (-1,1):
  box((s*.42,0,1.40),(.24,.36,.20),orange,.05)                # big pauldron
  cyl((s*.42,0,1.32),(s*.45,0,1.06),.075,graphite)
  sph((s*.45,0,1.03),(.075,)*3,rubber)
  box((s*.46,-.03,.90),(.16,.18,.28),ivory,.04)               # forearm
  box((s*.46,-.05,.71),(.13,.14,.12),graphite,.025)           # mitt
 def foot(x):
  box((x,-.04,.06),(.20,.32,.12),graphite,.03);box((x,-.20,.07),(.18,.06,.08),orange,.015)
 limbs(.16,.84,.47,.12,.085,.075,.09,foot)
 for s in (-1,1):box((s*.16,-.08,.30),(.15,.05,.24),ivory,.02)

# C: Hollow suit. A pressure suit worn by a machine: the astronaut's silhouette, an empty visor with a cyan glow
# and exposed actuators where the soft joints would be.
def hollow():
 box((0,0,1.25),(.50,.32,.46),orange,.06)
 box((0,-.17,1.32),(.38,.05,.20),ivory,.03)
 box((0,-.198,1.32),(.18,.01,.03),lcd,.003)
 box((0,.21,1.28),(.40,.18,.44),ivory,.04)                    # backpack (hollow life support)
 box((0,.305,1.28),(.24,.01,.28),graphite,.01)
 cyl((0,0,1.47),(0,0,1.55),.18,graphite)
 sph((0,0,1.75),(.27,.25,.27),ivory,24,12)                    # helmet
 sph((0,-.15,1.76),(.23,.13,.17),lcdglass,24,10)              # dark visor
 sph((0,-.255,1.77),(.12,.03,.03),lcd,16,8)                  # inner glow slit
 box((0,0,.96),(.42,.30,.16),orange,.04)
 for s in (-1,1):
  box((s*.33,0,1.44),(.20,.28,.18),ivory,.05)
  cyl((s*.33,0,1.40),(s*.36,0,1.16),.075,orange)
  cyl((s*.36,0,1.15),(s*.36,0,1.07),.04,steel)                # exposed elbow actuator
  cyl((s*.37,0,1.07),(s*.37,-.03,.88),.07,orange)
  sph((s*.37,-.04,.80),(.07,.08,.08),graphite)
  cyl((s*.10,0,.86),(s*.10,0,.80),.05,steel)                  # hip actuators
 def foot(x):box((x,-.05,.06),(.21,.34,.10),ivory,.03)
 limbs(.13,.88,.50,.13,.10,.085,.06,foot)
 for s in (-1,1):
  for z in (.50,):cyl((s*.13,-.06,z+.05),(s*.13,-.06,z-.05),.04,steel)
  box((s*.13,-.09,.70),(.14,.04,.18),ivory,.02)

DESIGNS=[('courier',courier),('stevedore',stevedore),('hollow',hollow)]
SPACING=1.6
for i,(_,build) in enumerate(DESIGNS):ox=(i+1)*SPACING;build()

# The astronaut on the left for scale.
astro=os.path.join(OUT,'astronaut-v3.glb')
if os.path.exists(astro):
 bpy.ops.import_scene.gltf(filepath=astro)
 for o in bpy.context.selected_objects:
  if o.parent is None:o.location.x+=0
  if o.type=='ARMATURE' and o.animation_data:o.animation_data.action=None
 for o in bpy.context.selected_objects:
  if o.type=='MESH' and any(k in o.name for k in ('Pistol','Rifle','Flame','Smg','Katana','Rail','Arc','Construction')):o.hide_render=True

def point(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.data.materials.append(mat('Floor',(.085,.11,.14),.95));floor.location.z=-.01
world=bpy.data.worlds.new('fill');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.12,.17,.24,1);bg.inputs['Strength'].default_value=.4;scene.world=world
for name,loc,power,size,color in [('Key',(-2,-6,7),1400,6,(1,.88,.73)),('Rim',(6,3,5),1400,5,(.55,.73,1))]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
 o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;point(o,(2.4,0,1))
cd=bpy.data.cameras.new('cam');cam=bpy.data.objects.new('cam',cd);scene.collection.objects.link(cam);cd.type='ORTHO';scene.camera=cam
engines={e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
for engine in ['BLENDER_EEVEE_NEXT','BLENDER_EEVEE','CYCLES']:
 if engine in engines:scene.render.engine=engine;break
with contextlib.suppress(Exception):scene.eevee.taa_render_samples=32
scene.render.image_settings.file_format='PNG'

cx=SPACING*len(DESIGNS)/2
cd.ortho_scale=6.6;cam.location=(cx+2.2,-7,2.6);point(cam,(cx,0,1.0))
scene.render.resolution_x=1600;scene.render.resolution_y=800
scene.render.filepath=os.path.join(OUT,'android-study.png');bpy.ops.render.render(write_still=True)
cd.ortho_scale=2.5;scene.render.resolution_x=scene.render.resolution_y=800
for i,(name,_) in enumerate(DESIGNS):
 x=(i+1)*SPACING;cam.location=(x+2.6,-4.4,2.5);point(cam,(x,0,1.05))
 scene.render.filepath=os.path.join(OUT,f'android-study-{name}.png');bpy.ops.render.render(write_still=True)
print('ANDROID_STUDY_READY')
