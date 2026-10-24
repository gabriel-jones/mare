"""Author the colony android (the Courier from android-study): a slim ceramic body with an LCD-strip face, skinned to
a humanoid rig, with its work and combat clips. Exports android.glb: Idle, Walk, Carry, CarryIdle, Work, Harvest,
Charge, Down, and for weapons GunAim, GunWalk, GunFire (additive), PistolAim, PistolWalk, PistolFire, BladeAim,
BladeWalk, BladeSlash. Weapons are separate skinned meshes on Hand.R (Gun for rifle, smg and railgun; Pistol; Blade)
for the runtime to show; the face strip is its own mesh (Face) so its colour can show the android's state. Marker bones:
Carry (where a carried stack rides), Muzzle, PistolMuzzle, BladeTip. Also renders android-portraits.png for review.
Run headless with --factory-startup."""
import bpy, math, os, contextlib, io
from mathutils import Vector, Quaternion, Matrix
OUT = '/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
scene = bpy.context.scene
for o in list(scene.objects): bpy.data.objects.remove(o, do_unlink=True)
parts = []

def mat(name, c, rough=.6, metal=0, glow=0):
 m = bpy.data.materials.new(name); m.use_nodes = True; m.diffuse_color = (*c, 1)
 n = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
 n.inputs['Base Color'].default_value = (*c, 1); n.inputs['Roughness'].default_value = rough; n.inputs['Metallic'].default_value = metal
 if glow: n.inputs['Emission Color'].default_value = (*c, 1); n.inputs['Emission Strength'].default_value = glow
 return m
orange = mat('Android • oxide orange', (.66, .115, .025), .7)
ivory = mat('Android • warm chalk ceramic', (.70, .74, .71), .42, .08)
graphite = mat('Android • graphite', (.025, .040, .052), .6, .3)
rubber = mat('Android • seals', (.016, .022, .029), .9)
steel = mat('Android • titanium', (.25, .32, .36), .34, .75)
lcd = mat('Android • face LCD', (.30, .80, 1.0), .3, 0, 5)
glass = mat('Android • face glass', (.01, .04, .06), .12, .5)
cells = mat('Android • charge cells', (.30, .80, 1.0), .3, 0, 3)

def bevel(o, w):
 if not w: return
 m = o.modifiers.new('b', 'BEVEL'); m.width = w; m.segments = 1
 bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=m.name)
def finish(o, name, m, bone, smooth=False):
 o.name = name; o.data.materials.append(m)
 if smooth:
  for p in o.data.polygons: p.use_smooth = True
 o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))), 1, 'REPLACE')
 parts.append(o); return o
def box(name, loc, size, m, bone, b=.02):
 bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.object; o.scale = size
 bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); bevel(o, b); return finish(o, name, m, bone)
def sph(name, loc, size, m, bone, seg=16, rings=8):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc); o = bpy.context.object; o.scale = size
 bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); return finish(o, name, m, bone, True)
def cyl(name, a, b, r, m, bone, v=12):
 a, b = Vector(a), Vector(b)
 bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=(b - a).length, location=(a + b) / 2)
 o = bpy.context.object; o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
 bpy.ops.object.transform_apply(location=False, rotation=True, scale=True); bevel(o, .008); return finish(o, name, m, bone)

# ---- Body: the Courier. Front is -Y. ----
HIP, KNEE, ANKLE, LX = .92, .52, .10, .11
box('Chest shell', (0, 0, 1.30), (.40, .24, .36), ivory, 'Spine', .06)
box('Chest panel', (0, -.125, 1.33), (.22, .02, .10), graphite, 'Spine', .01)
box('Chest readout', (-.05, -.137, 1.35), (.09, .006, .02), cells, 'Spine', .002)
box('Collar plate', (0, -.06, 1.47), (.36, .12, .05), orange, 'Spine', .015)
box('Battery spine', (0, .17, 1.30), (.26, .10, .30), graphite, 'Spine', .03)
for z in (1.22, 1.30, 1.38): box('Charge bar', (0, .222, z), (.14, .006, .025), cells, 'Spine', .002)
cyl('Waist spine', (0, 0, 1.12), (0, 0, 1.02), .12, rubber, 'Hips')
box('Pelvis', (0, 0, .97), (.30, .20, .12), graphite, 'Hips', .03)
cyl('Neck', (0, 0, 1.49), (0, 0, 1.60), .05, steel, 'Head')
sph('Head shell', (0, 0, 1.75), (.15, .16, .17), ivory, 'Head', 24, 12)
box('Face band', (0, -.135, 1.76), (.24, .05, .055), glass, 'Head', .02)
box('Crest', (0, 0, 1.93), (.03, .12, .03), orange, 'Head', .008)
for s in (-1, 1):
 su = 'L' if s < 0 else 'R'
 sph('Shoulder bearing', (s * .25, 0, 1.43), (.085,) * 3, rubber, 'UpperArm.' + su)
 box('Shoulder cap', (s * .27, 0, 1.47), (.13, .18, .10), orange, 'UpperArm.' + su, .035)
 cyl('Upper arm', (s * .27, 0, 1.42), (s * .29, 0, 1.15), .05, ivory, 'UpperArm.' + su)
 sph('Elbow', (s * .29, 0, 1.13), (.055,) * 3, rubber, 'Forearm.' + su)
 cyl('Forearm', (s * .29, 0, 1.12), (s * .30, -.03, .90), .048, ivory, 'Forearm.' + su)
 box('Hand', (s * .30, -.035, .83), (.07, .09, .11), graphite, 'Hand.' + su, .02)
 x = s * LX
 sph('Hip joint', (x, 0, HIP), (.07,) * 3, rubber, 'Thigh.' + su)
 cyl('Thigh', (x, 0, HIP), (x, 0, KNEE), .06, graphite, 'Thigh.' + su)
 box('Thigh plate', (x, -.06, .70), (.10, .04, .22), ivory, 'Thigh.' + su, .02)
 sph('Knee', (x, 0, KNEE), (.063,) * 3, rubber, 'Shin.' + su)
 cyl('Shin', (x, 0, KNEE), (x, 0, ANKLE + .04), .05, graphite, 'Shin.' + su)
 box('Shin plate', (x, -.055, .30), (.09, .04, .22), ivory, 'Shin.' + su, .02)
 box('Foot', (x, -.05, .05), (.13, .26, .08), graphite, 'Foot.' + su, .02)
 box('Toe cap', (x, -.15, .07), (.12, .06, .06), orange, 'Foot.' + su, .015)
bodyparts = parts[:]
parts.clear()
box('Face LCD', (0, -.162, 1.76), (.17, .01, .018), lcd, 'Head', .004)
faceparts = parts[:]; parts.clear()

# ---- Weapons, built in a gun frame on the right hand: x along the barrel, y to its left, z up. ----
HAND_DIR = (Vector((.30, -.05, .76)) - Vector((.30, -.03, .88))).normalized()
GUN_UP = (Vector((0, -1, 0)) - HAND_DIR * HAND_DIR.dot(Vector((0, -1, 0)))).normalized()
GUN_LEFT = GUN_UP.cross(HAND_DIR)
GRIP = Vector((.30, -.035, .83)); GUN_SCALE = 1.5
def gun_point(x, y, z): return GRIP + (HAND_DIR * x + GUN_LEFT * y + GUN_UP * z) * GUN_SCALE
GUN_BASIS = Matrix((HAND_DIR, GUN_LEFT, GUN_UP)).transposed().to_4x4()
def gbox(name, c, size, m, b=.005, rake=0):
 bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0)); o = bpy.context.object; o.scale = [v * GUN_SCALE for v in size]
 bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
 o.data.transform(Matrix.Translation(gun_point(*c)) @ GUN_BASIS @ Matrix.Rotation(rake, 4, 'Y'))
 bevel(o, b * GUN_SCALE); return finish(o, name, m, 'Hand.R')
def gcyl(name, x0, x1, z, r, m):
 a, b = gun_point(x0, 0, z), gun_point(x1, 0, z)
 bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=r * GUN_SCALE, depth=(b - a).length, location=(a + b) / 2)
 o = bpy.context.object; o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
 bpy.ops.object.transform_apply(location=False, rotation=True, scale=True); return finish(o, name, m, 'Hand.R')
# A colony-issue carbine: ivory shroud, graphite receiver, glowing cells.
gbox('Gun grip', (-.012, 0, -.005), (.05, .042, .13), rubber, .008, .25)
gbox('Gun receiver', (.05, 0, .05), (.30, .055, .055), graphite, .008)
gbox('Gun shroud', (.2, 0, .07), (.2, .06, .05), ivory, .01)
gbox('Gun magazine', (.06, 0, -.03), (.04, .035, .1), graphite, .004, -.1)
gbox('Gun fore-grip', (.22, 0, .0), (.032, .032, .07), rubber, .005)
gcyl('Gun barrel', .3, .4, .07, .013, steel)
gcyl('Gun muzzle', .39, .43, .07, .02, graphite)
gbox('Gun stock', (-.15, 0, .05), (.06, .05, .09), orange, .008)
for side in (-1, 1): gbox('Gun cell', (.05, side * .029, .05), (.16, .004, .012), cells, 0)
gunparts = parts[:]; parts.clear()
gbox('Pistol grip', (-.012, 0, -.005), (.05, .042, .13), rubber, .008, .25)
gbox('Pistol body', (.05, 0, .07), (.22, .05, .06), graphite, .008)
gbox('Pistol rib', (.05, 0, .102), (.18, .02, .006), ivory, .002)
gcyl('Pistol muzzle', .16, .2, .07, .016, steel)
for side in (-1, 1): gbox('Pistol cell', (.05, side * .026, .07), (.1, .004, .012), cells, 0)
pistolparts = parts[:]; parts.clear()
gbox('Blade handle', (0, 0, -.035), (.032, .03, .17), graphite, .004)
for z in (-.1, -.06, -.02): gbox('Blade wrap', (0, 0, z), (.035, .033, .008), orange, .001)
gbox('Blade guard', (0, 0, .06), (.08, .062, .012), graphite, .003)
gbox('Blade steel', (-.004, 0, .37), (.038, .009, .54), steel, .0008)
gbox('Blade edge', (.017, 0, .37), (.009, .005, .53), lcd, 0)
bladeparts = parts[:]; parts.clear()

# ---- Armature ----
arm = bpy.data.armatures.new('Android skeleton'); rig = bpy.data.objects.new('AndroidRig', arm); scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
def bone(name, head, tail, parent=None, deform=True):
 b = arm.edit_bones.new(name); b.head = head; b.tail = tail; b.use_deform = deform
 if parent: b.parent = arm.edit_bones[parent]
 b.roll = 0; return b
bone('Hips', (0, 0, HIP), (0, 0, 1.05)); bone('Spine', (0, 0, 1.05), (0, 0, 1.48), 'Hips'); bone('Head', (0, 0, 1.53), (0, 0, 1.92), 'Spine')
for s in (-1, 1):
 su = 'L' if s < 0 else 'R'
 bone('Thigh.' + su, (s * LX, 0, HIP), (s * LX, .005, KNEE), 'Hips')
 bone('Shin.' + su, (s * LX, .005, KNEE), (s * LX, 0, ANKLE), 'Thigh.' + su)
 bone('Foot.' + su, (s * LX, 0, ANKLE), (s * LX, -.2, .04), 'Shin.' + su)
 bone('UpperArm.' + su, (s * .27, 0, 1.42), (s * .29, 0, 1.13), 'Spine')
 bone('Forearm.' + su, (s * .29, 0, 1.13), (s * .30, -.03, .88), 'UpperArm.' + su)
 bone('Hand.' + su, (s * .30, -.03, .88), (s * .30, -.05, .76), 'Forearm.' + su)
for name, p in [('Muzzle', (.43, 0, .07)), ('PistolMuzzle', (.2, 0, .07)), ('BladeTip', (.008, 0, .64))]:
 head = gun_point(*p); bone(name, head, head + GUN_UP * .03, 'Hand.R', False)
bone('Carry', (0, -.36, 1.1), (0, -.36, 1.13), 'Spine', False)
bpy.ops.object.mode_set(mode='OBJECT')
def join_skin(objects, name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects: o.select_set(True)
 bpy.context.view_layer.objects.active = objects[0]; bpy.ops.object.join(); o = bpy.context.object; o.name = name
 mod = o.modifiers.new('Skeleton', 'ARMATURE'); mod.object = rig; o.parent = rig
 return o
body = join_skin(bodyparts, 'AndroidBody'); face = join_skin(faceparts, 'Face')
gun = join_skin(gunparts, 'Gun'); pistol = join_skin(pistolparts, 'Pistol'); blade = join_skin(bladeparts, 'Blade')
for p in rig.pose.bones: p.rotation_mode = 'XYZ'
rig.animation_data_create()

# ---- Posing (same tools as the astronaut) ----
def reset_pose():
 for p in rig.pose.bones: p.location = (0, 0, 0); p.rotation_euler = (0, 0, 0); p.scale = (1, 1, 1)
def rx(name, v): rig.pose.bones[name].rotation_euler.x = v
def rz(name, v): rig.pose.bones[name].rotation_euler.z = v
def refresh(): bpy.context.view_layer.update()
REST_UP = {'Hand.R': arm.bones['Hand.R'].matrix_local.to_3x3().inverted() @ GUN_UP}
def point(name, direction, up=None):
 refresh(); pb = rig.pose.bones[name]; b = pb.bone
 base = pb.parent.matrix @ (pb.parent.bone.matrix_local.inverted() @ b.matrix_local) if pb.parent else b.matrix_local
 inv = base.to_3x3().normalized().inverted(); d = (inv @ Vector(direction)).normalized()
 q = Vector((0, 1, 0)).rotation_difference(d)
 if up is not None and name in REST_UP:
  cur = q @ REST_UP[name]; want = inv @ Vector(up)
  cur = (cur - d * cur.dot(d)).normalized(); want = (want - d * want.dot(d)).normalized()
  angle = cur.angle(want, 0); q = Quaternion(d, angle if d.dot(cur.cross(want)) > 0 else -angle) @ q
 pb.rotation_euler = q.to_euler('XYZ')
LEN = {n: arm.bones[n].length for n in arm.bones.keys()}
def reach(side, wrist, pole):
 refresh(); s = rig.pose.bones['UpperArm.' + side].head.copy(); t = Vector(wrist); a, b = LEN['UpperArm.' + side], LEN['Forearm.' + side]
 d = t - s; dist = min(d.length, a + b - 1e-4); u = d.normalized()
 cos = (a * a + dist * dist - b * b) / (2 * a * dist); p = Vector(pole); perp = (p - u * p.dot(u)).normalized()
 elbow = s + u * a * cos + perp * a * math.sqrt(max(0, 1 - cos * cos))
 point('UpperArm.' + side, elbow - s); point('Forearm.' + side, s + u * dist - elbow)
def ease(k): k = max(0, min(1, k)); return k * k * (3 - 2 * k)
def lerp(a, b, k): return Vector(a).lerp(Vector(b), k)
L1, L2 = HIP - KNEE, KNEE - ANKLE
def leg(su, y, drop, lift=0):
 h = HIP + drop - (ANKLE + lift); distance = min(L1 + L2 - .001, math.hypot(y, h))
 knee = math.acos(max(-1, min(1, (distance * distance - L1 * L1 - L2 * L2) / (2 * L1 * L2))))
 thigh = math.atan2(y, h) - math.atan2(L2 * math.sin(knee), L1 + L2 * math.cos(knee))
 rx('Thigh.' + su, thigh); rx('Shin.' + su, knee); rx('Foot.' + su, -thigh - knee)
POLE_R, POLE_L = (1, .3, -1), (-1, .3, -1)

def idle(t):
 w = math.sin(t * math.tau); rig.pose.bones['Spine'].scale = (1, 1, 1 + w * .006)
 rx('Spine', w * .01)
 # A slow scan left and right: the LCD strip sweeping the colony.
 rz('Head', math.sin(t * math.tau * 2) * .25 * ease(abs(math.sin(t * math.tau))))
 for su in 'LR': rx('Forearm.' + su, -.1)
def gait(t, arms=True, stride=.27):
 hip = -.06; rig.pose.bones['Hips'].location.y = hip
 for su, off in (('L', 0), ('R', .5)):
  u = (t + off) % 1
  if u < .6: y = -stride + 2 * stride * u / .6; lift = 0
  else: v = (u - .6) / .4; y = stride * math.cos(v * math.pi); lift = .1 * math.sin(v * math.pi)
  leg(su, y, hip, lift)
  if arms: rx('UpperArm.' + su, -math.sin((t + off) * math.tau) * .3); rx('Forearm.' + su, -.22)
 rx('Spine', .03); rz('Spine', math.sin(t * math.tau) * .03)
CARRY_R, CARRY_L = Vector((.17, -.3, 1.02)), Vector((-.17, -.3, 1.02))
def carry_arms(bob=0):
 reach('R', CARRY_R + Vector((0, 0, bob)), (1, .5, -.6)); point('Hand.R', (-.3, -1, .2))
 reach('L', CARRY_L + Vector((0, 0, bob)), (-1, .5, -.6)); point('Hand.L', (.3, -1, .2))
def carry(t): gait(t, False); carry_arms(math.sin(t * math.tau * 2) * .01); rx('Spine', -.04)
def carry_idle(t): carry_arms(math.sin(t * math.tau) * .006); rx('Spine', -.03)
def work(t):
 # Hands at work on something at waist height in front: alternate strikes with a tool hand, the other steadying.
 w = math.sin(t * math.tau); k = max(0, w)
 rx('Spine', .28); rx('Head', .25); rig.pose.bones['Hips'].location.y = -.05; leg('L', -.12, -.05); leg('R', .1, -.05)
 reach('R', Vector((.14, -.42, 1.02 + .14 * k)), (1, .3, -.5)); point('Hand.R', (0, -.4, -1))
 reach('L', Vector((-.12, -.44, .96 + .03 * math.sin(t * math.tau * 2))), (-1, .3, -.5)); point('Hand.L', (.2, -1, -.4))
def harvest(t):
 # Crouched at a bed, picking with alternate hands.
 drop = -.3; rig.pose.bones['Hips'].location.y = drop; leg('L', -.2, drop); leg('R', .12, drop)
 rx('Spine', .55); rx('Head', .2)
 for su, off, x in (('R', 0, .14), ('L', .5, -.14)):
  k = .5 + .5 * math.sin((t + off) * math.tau)
  reach(su, Vector((x, -.48 - .06 * k, .62 + .14 * k)), ((1 if su == 'R' else -1), .4, -.4)); point('Hand.' + su, (0, -.3, -1))
def charge(t):
 w = math.sin(t * math.tau); rx('Head', .32 + w * .02); rx('Spine', .06); rig.pose.bones['Spine'].scale = (1, 1, 1 + w * .003)
 for su in 'LR': rx('Forearm.' + su, -.05)
def collapse(t):
 # Knees go, then it pitches forward and lies face down, one arm under it.
 k = ease(t / .35); m = ease((t - .35) / .65)
 hips = rig.pose.bones['Hips']; hips.location.y = -.45 * k - .2 * m; rx('Hips', 1.2 * m); rz('Hips', .2 * m)
 for su in 'LR': rx('Thigh.' + su, -.1 * k - .55 * m); rx('Shin.' + su, 1.5 * k); rx('Foot.' + su, .2 * k); rx('UpperArm.' + su, .1 * k - 1.4 * m); rx('Forearm.' + su, -.3 * k - .4 * m)
 rx('Spine', .3 * k - .1 * m); rx('Head', .35 * k - .25 * m)
AIM_A = Vector((0, -1, 0)); GRIP_REACH = .07
def stance(right, fore, lean_left=(0, -.3, 1)):
 global AIM_W, AIM_WL, AIM_AL
 AIM_W = Vector(right); AIM_AL = Vector(lean_left).normalized()
 grip = AIM_W + AIM_A * GRIP_REACH + AIM_A * fore * GUN_SCALE; AIM_WL = grip - AIM_AL * GRIP_REACH
def aim(bob=0, kick=0):
 reach('R', AIM_W + Vector((0, .05 * kick, bob + .03 * kick)), POLE_R); point('Hand.R', (AIM_A + Vector((0, 0, .35 * kick))).normalized(), (0, 0, 1))
 reach('L', AIM_WL + Vector((0, .045 * kick, bob + .025 * kick)), POLE_L); point('Hand.L', AIM_AL)
def aim_idle(t): w = math.sin(t * math.tau); rx('Spine', .05); rig.pose.bones['Spine'].rotation_euler.y = .25; rig.pose.bones['Head'].rotation_euler.y = -.25; aim(w * .006)
def aim_walk(t): gait(t, False); rz('Spine', 0); rx('Spine', .06); rig.pose.bones['Spine'].rotation_euler.y = .25; rig.pose.bones['Head'].rotation_euler.y = -.25; aim(math.sin(t * math.tau * 2) * .008)
KICK = [0, 1, .85, .55, .32, .17, .08, .03, 0]
def fire(t): f = round(t * 8); k = KICK[f]; rx('Spine', .05 - .05 * k); rig.pose.bones['Spine'].rotation_euler.y = .25; rig.pose.bones['Head'].rotation_euler.y = -.25; aim(0, k)
BLADE_W, BLADE_B = Vector((.18, -.3, 1.06)), Vector((-.15, -1, .8))
def blade_grip(w, b, fingers=(0, -1, -.4)):
 B = Vector(b).normalized(); F = Vector(fingers); F = F - B * F.dot(B); F = F.normalized() if F.length > .05 else Vector((0, -1, 0))
 reach('R', w, POLE_R); point('Hand.R', F, B)
 refresh(); g = rig.pose.bones['Hand.R'].matrix @ (arm.bones['Hand.R'].matrix_local.inverted() @ gun_point(-.005, 0, -.1))
 reach('L', g - F * GRIP_REACH, POLE_L); point('Hand.L', F)
def blade_idle(t): rx('Spine', .08); rig.pose.bones['Spine'].rotation_euler.y = .2; blade_grip(BLADE_W + Vector((0, 0, math.sin(t * math.tau) * .006)), BLADE_B)
def blade_walk(t): gait(t, False); rz('Spine', 0); rx('Spine', .08); blade_grip(BLADE_W + Vector((0, 0, math.sin(t * math.tau * 2) * .008)), BLADE_B)
SLASH = [(0, BLADE_W, BLADE_B, (0, -1, -.4), 0), (.22, (.32, -.08, 1.42), (.45, .65, .75), (0, -1, 0), .38), (.45, (.1, -.5, 1.15), (-.35, -1, .05), (0, -.3, -1), 0),
 (.66, (-.26, -.38, .95), (-1, .15, -.35), (0, -1, -.2), -.45), (1, BLADE_W, BLADE_B, (0, -1, -.4), 0)]
def slash(t):
 i = 0
 while i < len(SLASH) - 2 and t >= SLASH[i + 1][0]: i += 1
 a, b = SLASH[i], SLASH[i + 1]; k = ease((t - a[0]) / (b[0] - a[0]))
 rx('Spine', .08 + .12 * math.sin(math.pi * t)); tw = a[4] + (b[4] - a[4]) * k
 rig.pose.bones['Spine'].rotation_euler.y = tw; rig.pose.bones['Head'].rotation_euler.y = -tw * .7
 lunge = math.sin(math.pi * min(1, t * 1.4)); rig.pose.bones['Hips'].location.y = -.06 * lunge
 leg('L', -.16 * lunge, -.06 * lunge); leg('R', .12 * lunge, -.06 * lunge)
 blade_grip(lerp(a[1], b[1], k), lerp(Vector(a[2]).normalized(), Vector(b[2]).normalized(), k), lerp(a[3], b[3], k))

LOC = {'Hips', 'Spine'}
clips = []
def make_clip(name, frames, pose):
 rig.animation_data.action = None; samples = []
 for f in range(frames + 1):
  reset_pose(); pose(f / frames if frames else 0); refresh()
  samples.append({p.name: (p.rotation_euler.copy(), p.location.copy(), p.scale.copy()) for p in rig.pose.bones})
 action = bpy.data.actions.new(name); rig.animation_data.action = action
 for f, sample in enumerate(samples):
  for p in rig.pose.bones:
   r, l, s = sample[p.name]; p.rotation_euler = r; p.location = l; p.scale = s
   p.keyframe_insert(data_path='rotation_euler', frame=f + 1, group=p.name)
   if p.name in LOC: p.keyframe_insert(data_path='location', frame=f + 1, group=p.name)
   if p.name == 'Spine': p.keyframe_insert(data_path='scale', frame=f + 1, group=p.name)
 rig.animation_data.action = None
 track = rig.animation_data.nla_tracks.new(); track.name = name; track.strips.new(name, 1, action); track.mute = True
 clips.append((name, action))
make_clip('Idle', 120, idle); make_clip('Walk', 24, gait); make_clip('Carry', 24, carry); make_clip('CarryIdle', 60, carry_idle)
make_clip('Work', 20, work); make_clip('Harvest', 30, harvest); make_clip('Charge', 90, charge); make_clip('Down', 36, collapse)
stance((.1, -.38, 1.3), .22)
make_clip('GunAim', 60, aim_idle); make_clip('GunWalk', 24, aim_walk); make_clip('GunFire', 8, fire)
stance((.08, -.42, 1.3), .1, (0, -.4, 1))
make_clip('PistolAim', 60, aim_idle); make_clip('PistolWalk', 24, aim_walk); make_clip('PistolFire', 8, fire)
make_clip('BladeAim', 60, blade_idle); make_clip('BladeWalk', 24, blade_walk); make_clip('BladeSlash', 13, slash)
reset_pose(); refresh()

scene.render.fps = 30
bpy.ops.object.select_all(action='DESELECT')
for o in (rig, body, face, gun, pistol, blade): o.select_set(True)
bpy.context.view_layer.objects.active = rig
for track in rig.animation_data.nla_tracks: track.mute = False
with contextlib.redirect_stdout(io.StringIO()):
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'android.glb'), export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_range=False, export_apply=False)
for track in rig.animation_data.nla_tracks: track.mute = True

# ---- Review sheet: one frame of each clip, side by side. ----
def point_at(o, p): o.rotation_euler = (Vector(p) - o.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200); floor = bpy.context.object; floor.data.materials.append(mat('Floor', (.085, .11, .14), .95)); floor.location.z = -.01
world = bpy.data.worlds.new('fill'); world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (.12, .17, .24, 1); bg.inputs['Strength'].default_value = .4; scene.world = world
for name, loc, power, size, color in [('Key', (-3, -4, 6), 650, 4, (1, .88, .73)), ('Rim', (3, 1, 4), 800, 3, (.55, .73, 1))]:
 d = bpy.data.lights.new(name, 'AREA'); d.energy = power; d.shape = 'DISK'; d.size = size; d.color = color
 o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.location = loc; point_at(o, (0, 0, 1))
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); scene.collection.objects.link(cam); cd.type = 'ORTHO'; cd.ortho_scale = 2.4; cam.location = (3.2, -4.4, 2.4); point_at(cam, (0, 0, .95)); scene.camera = cam
engines = {e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
for engine in ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES']:
 if engine in engines: scene.render.engine = engine; break
with contextlib.suppress(Exception): scene.eevee.taa_render_samples = 24
scene.render.resolution_x = scene.render.resolution_y = 420; scene.render.image_settings.file_format = 'PNG'
SHEET = [('Idle', 1, None), ('Walk', 6, None), ('Carry', 6, None), ('Work', 6, None), ('Harvest', 8, None), ('Charge', 1, None), ('Down', 37, None), ('GunAim', 1, gun), ('GunFire', 2, gun), ('PistolAim', 1, pistol), ('BladeAim', 1, blade), ('BladeSlash', 7, blade)]
only = os.environ.get('LUNAR_ANDROID_SHEET')
files = []
for name, frame, held in SHEET:
 if only and name not in only.split(','): continue
 for w in (gun, pistol, blade): w.hide_render = w is not held
 rig.animation_data.action = dict(clips)[name]; scene.frame_set(frame)
 path = os.path.join('/tmp', f'android-{name}.png'); scene.render.filepath = path; bpy.ops.render.render(write_still=True); files.append(path)
rig.animation_data.action = None
print('ANDROID_READY', [c[0] for c in clips], files)
