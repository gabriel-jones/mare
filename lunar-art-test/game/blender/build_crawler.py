"""Author the crawler: an eyeless, human-sized cave hunter with four high-kneed legs and two folded scythe forelimbs.
Rigid faceted parts are bound to an armature; legs and forelimbs are posed by two-bone IK against planted foot targets,
then every clip is keyed as plain bone transforms. Builds in a temporary scene, exports crawler.glb, writes
crawler-library.blend and a preview render, then removes the scene so the open file is left untouched."""
import bpy, math, os
from mathutils import Vector, Matrix

OUT = '/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('Crawler • rig and animation')
bpy.context.window.scene = scene
created = {'materials': [], 'meshes': [], 'actions': []}
parts = []

def mat(name, c, rough=.6, metal=0, glow=0):
    m = bpy.data.materials.new(name); created['materials'].append(m); m.use_nodes = True; m.diffuse_color = (*c, 1)
    n = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = (*c, 1); n.inputs['Roughness'].default_value = rough; n.inputs['Metallic'].default_value = metal
    if glow: n.inputs['Emission Color'].default_value = (*c, 1); n.inputs['Emission Strength'].default_value = glow
    return m
# Obsidian chitin that swallows the lamp; only the killing edges are pale bone, so claws are seen before the body.
CHITIN = mat('Crawler • obsidian chitin', (.011, .01, .015), .22)
CARAPACE = mat('Crawler • carapace ridge', (.03, .026, .04), .3)
PLATE = mat('Crawler • bone edge', (.6, .56, .47), .45)
JOINT = mat('Crawler • joint sinew', (.05, .015, .07), .7)
MAW = mat('Crawler • maw', (.45, .03, .12), .5, 0, .8)
SEAM = mat('Crawler • resonant seam', (.62, .32, 1), .3, 0, 3.5)

def finish(o, name, m, bone):
    o.name = name; o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = False
    o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))), 1, 'REPLACE')
    created['meshes'].append(o.data); parts.append(o); return o
def mesh(name, vs, fs, m, bone):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in vs], [], fs); me.update()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    return finish(o, name, m, bone)
def rings(name, profile, m, bone, sides=8, axis='Y'):
    """Faceted loft. `profile` is (along, rx, rz, centre_z); along runs on Y. Ends are capped."""
    vs, fs = [], []
    for along, rx, rz, cz in profile:
        for i in range(sides):
            a = math.tau * i / sides + math.pi / sides
            vs.append((rx * math.cos(a), along, cz + rz * math.sin(a)))
    for j in range(len(profile) - 1):
        for i in range(sides): fs.append((j * sides + i, j * sides + (i + 1) % sides, (j + 1) * sides + (i + 1) % sides, (j + 1) * sides + i))
    fs.append(tuple(reversed(range(sides)))); fs.append(tuple((len(profile) - 1) * sides + i for i in range(sides)))
    return mesh(name, vs, fs, m, bone)
def limb(name, a, b, r0, r1, m, bone, sides=5):
    """A tapered faceted segment from a to b; r1 of zero ends in a point."""
    a, b = Vector(a), Vector(b); d = (b - a).normalized()
    side = d.cross(Vector((0, 0, 1))); side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0)); up = side.cross(d)
    vs, fs = [], []
    for c, r in [(a, r0), (b, r1)]:
        for i in range(sides):
            t = math.tau * i / sides
            vs.append(c + (side * math.cos(t) + up * math.sin(t)) * r)
    for i in range(sides): fs.append((i, (i + 1) % sides, sides + (i + 1) % sides, sides + i))
    fs.append(tuple(reversed(range(sides)))); fs.append(tuple(sides + i for i in range(sides)))
    return mesh(name, vs, fs, m, bone)
def knob(name, c, r, m, bone):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=c)
    return finish(bpy.context.object, name, m, bone)

# ---- Rest proportions (Blender: up +Z, the crawler faces -Y) ----
PIVOT = Vector((0, 0, .78))
LEGS = {  # hip, rest foot, upper length, lower length
    'A': (Vector((.27, -.12, .74)), Vector((1.0, -.5, 0)), .72, .95),
    'B': (Vector((.24, .24, .74)), Vector((.95, .8, 0)), .72, .95),
}
ARM_SHOULDER, ARM_HAND, ARM_L = Vector((.24, -.36, .86)), Vector((.26, -.98, .92)), (.55, .62)
side_name = lambda s: 'L' if s < 0 else 'R'

def ik(hip, target, l1, l2, pole):
    d = target - hip; dist = max(.05, min(l1 + l2 - .002, d.length)); u = d.normalized()
    a = (l1 * l1 + dist * dist - l2 * l2) / (2 * dist); h = math.sqrt(max(0, l1 * l1 - a * a))
    p = (pole - u * pole.dot(u)).normalized()
    return hip + u * a + p * h, hip + u * dist, p
def leg_pole(s): return Vector((s * .35, 0, 1))
def arm_pole(s): return Vector((s * .7, .55, 1))

# ---- Mesh ----
# Thorax: a low faceted dome with overlapping dorsal plates and a resonant seam down the spine.
bpy.ops.mesh.primitive_uv_sphere_add(segments=9, ring_count=6, radius=1, location=(0, -.06, .8)); o = bpy.context.object; o.scale = (.34, .44, .24)
bpy.ops.object.transform_apply(scale=True); finish(o, 'Thorax', CHITIN, 'Body')
for i, (y, w) in enumerate([(-.3, .26), (-.1, .32), (.1, .3)]):
    rings(f'Dorsal plate {i}', [(y - .1, w, .05, .99 - i * .01), (y + .1, w * .92, .05, 1.0 - i * .01)], CARAPACE, 'Body', 6)
limb('Spine seam', (0, -.36, 1.02), (0, .2, 1.0), .025, .02, SEAM, 'Body', 4)
# Abdomen: segmented, tapering behind, with a seam between each segment.
rings('Abdomen', [(.18, .27, .2, .8), (.42, .36, .27, .83), (.7, .33, .25, .78), (.95, .22, .17, .68), (1.12, .1, .08, .6), (1.22, .02, .02, .56)], CHITIN, 'Abdomen', 8)
for y, w, z in [(.42, .37, .83), (.7, .34, .78), (.95, .23, .68)]:
    rings(f'Abdomen band {y}', [(y - .035, w, w * .76, z), (y + .035, w, w * .76, z)], JOINT, 'Abdomen', 8)
    limb('Abdomen seam', (-.12, y + .01, z + w * .74), (.12, y + .01, z + w * .74), .02, .02, SEAM, 'Abdomen', 4)
# Head: a long blank skull, no eyes, no face. Only the maw.
rings('Skull', [(-.36, .2, .17, .82), (-.55, .19, .16, .84), (-.75, .14, .12, .8), (-.9, .06, .06, .74)], CHITIN, 'Head', 7)
rings('Skull crest', [(-.4, .05, .04, .98), (-.8, .03, .03, .9)], CARAPACE, 'Head', 4)
# The maw sits inside the skull's underside and only shows when the mandibles part.
rings('Maw', [(-.6, .09, .05, .72), (-.84, .05, .035, .71)], MAW, 'Head', 6)
for s in [-1, 1]:
    n = 'Jaw.' + side_name(s)
    limb('Mandible', (s * .11, -.68, .7), (s * .14, -.96, .6), .06, .04, PLATE, n)
    limb('Mandible hook', (s * .14, -.96, .6), (s * .03, -1.12, .66), .04, 0, PLATE, n)

# Limbs at rest, solved with the same IK that animates them so rest and pose agree.
rest = {}
for key, (hip, foot, l1, l2) in LEGS.items():
    for s in [-1, 1]:
        h, f = Vector((s * hip.x, hip.y, hip.z)), Vector((s * foot.x, foot.y, foot.z))
        knee, tip, p = ik(h, f, l1, l2, leg_pole(s)); su = side_name(s)
        rest[f'Leg{key}1.{su}'] = (h, knee, p); rest[f'Leg{key}2.{su}'] = (knee, tip, p)
        knob('Hip', h, .085, JOINT, f'Leg{key}1.{su}')
        limb('Thigh', h, knee, .075, .05, CHITIN, f'Leg{key}1.{su}')
        knob('Knee', knee, .06, JOINT, f'Leg{key}2.{su}')
        limb('Shank', knee, knee + (tip - knee) * .55, .05, .035, CHITIN, f'Leg{key}2.{su}')
        limb('Talon', knee + (tip - knee) * .55, tip, .035, 0, PLATE, f'Leg{key}2.{su}')
for s in [-1, 1]:
    su = side_name(s); h, hand = Vector((s * ARM_SHOULDER.x, ARM_SHOULDER.y, ARM_SHOULDER.z)), Vector((s * ARM_HAND.x, ARM_HAND.y, ARM_HAND.z))
    elbow, tip, p = ik(h, hand, *ARM_L, arm_pole(s))
    rest['Arm1.' + su] = (h, elbow, p); rest['Arm2.' + su] = (elbow, tip, p)
    knob('Shoulder', h, .08, JOINT, 'Arm1.' + su)
    limb('Upper scythe arm', h, elbow, .07, .05, CHITIN, 'Arm1.' + su)
    knob('Elbow', elbow, .065, JOINT, 'Arm2.' + su)
    limb('Forearm', elbow, tip, .05, .04, CHITIN, 'Arm2.' + su)
    # The scythe: a flat curved blade that folds back along the forearm, its point past the hand.
    d = (tip - elbow).normalized(); out = d.cross(p).normalized()
    blade = [elbow + d * .1, tip + d * .38 - p * .08, tip + d * .02 - p * .3, elbow + d * .3 - p * .14]
    vs = [v + out * w for v in blade for w in (-.012, .012)]
    mesh('Scythe blade', vs, [(0, 2, 4, 6), (7, 5, 3, 1), (0, 1, 3, 2), (2, 3, 5, 4), (4, 5, 7, 6), (6, 7, 1, 0)], PLATE, 'Arm2.' + su)

# ---- Armature ----
arm = bpy.data.armatures.new('Crawler skeleton'); rig = bpy.data.objects.new('CrawlerRig', arm); scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
def bone(name, head, tail, roll_axis, parent=None):
    b = arm.edit_bones.new(name); b.head = head; b.tail = tail; b.align_roll(roll_axis)
    if parent: b.parent = arm.edit_bones[parent]
    return b
bone('Body', PIVOT + Vector((0, .2, 0)), PIVOT + Vector((0, -.3, 0)), Vector((0, 0, 1)))
bone('Abdomen', Vector((0, .2, .8)), Vector((0, 1.15, .6)), Vector((0, 0, 1)), 'Body')
bone('Head', Vector((0, -.36, .82)), Vector((0, -.9, .74)), Vector((0, 0, 1)), 'Body')
for s in [-1, 1]: bone('Jaw.' + side_name(s), Vector((s * .1, -.7, .7)), Vector((s * .06, -1.0, .62)), Vector((0, 0, 1)), 'Head')
for name, (h, t, p) in rest.items(): bone(name, h, t, p, 'Body')
bpy.ops.object.mode_set(mode='OBJECT')
REST = {b.name: b.matrix_local.copy() for b in arm.bones}

bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); body = bpy.context.object; body.name = 'Crawler'
body.modifiers.new('Skeleton deformation', 'ARMATURE').object = rig; body.parent = rig
for pb in rig.pose.bones: pb.rotation_mode = 'QUATERNION'
rig.animation_data_create()

# ---- Posing ----
def frame(origin, y, z):
    y = y.normalized(); x = y.cross(z).normalized(); z = x.cross(y).normalized()
    return Matrix(((x.x, y.x, z.x, origin.x), (x.y, y.y, z.y, origin.y), (x.z, y.z, z.z, origin.z), (0, 0, 0, 1)))
def about(point, rotation): return Matrix.Translation(point) @ rotation.to_4x4() @ Matrix.Translation(-point)
def set_matrix(name, m): rig.pose.bones[name].matrix = m

def apply(pose):
    """`pose`: body (x, y, z, pitch, roll, yaw), abdomen (pitch, yaw), head (pitch, yaw), jaw, feet {leg: world}, hands {side: world}."""
    bx, by, bz, pitch, roll, yaw = pose.get('body', (0, 0, 0, 0, 0, 0))
    B = Matrix.Translation(Vector((bx, by, bz))) @ about(PIVOT, Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(pitch, 3, 'X') @ Matrix.Rotation(roll, 3, 'Y'))
    for pb in rig.pose.bones: pb.matrix_basis = Matrix()
    set_matrix('Body', B @ REST['Body']); bpy.context.view_layer.update()
    ap, ay = pose.get('abdomen', (0, 0)); hp, hy = pose.get('head', (0, 0))
    set_matrix('Abdomen', B @ about(REST['Abdomen'].translation, Matrix.Rotation(ay, 3, 'Z') @ Matrix.Rotation(ap, 3, 'X')) @ REST['Abdomen'])
    H = B @ about(REST['Head'].translation, Matrix.Rotation(hy, 3, 'Z') @ Matrix.Rotation(hp, 3, 'X'))
    set_matrix('Head', H @ REST['Head'])
    for name, (h0, t0, p0) in rest.items():
        side = -1 if name.endswith('L') else 1
        if not name[-3] == '1': continue
        hip = B @ h0
        if name.startswith('Arm'):
            target = pose.get('hands', {}).get(side_name(side)); l1, l2, pole = *ARM_L, arm_pole(side)
            pole = (B.to_3x3() @ pole)
        else:
            key = name[3]; target = pose.get('feet', {}).get(key + side_name(side)); l1, l2 = LEGS[key][2], LEGS[key][3]; pole = leg_pole(side)
        tip0 = rest[name.replace('1.', '2.')][1]
        target = Vector(target) if target is not None else B @ tip0 if name.startswith('Arm') else tip0
        knee, tip, p = ik(hip, target, l1, l2, pole)
        set_matrix(name, frame(hip, knee - hip, p)); set_matrix(name.replace('1.', '2.'), frame(knee, tip - knee, p))
    bpy.context.view_layer.update()
    jaw = pose.get('jaw', 0)
    for s in [-1, 1]:
        n = 'Jaw.' + side_name(s); J = H @ REST[n]
        set_matrix(n, J @ Matrix.Rotation(-s * jaw * .5, 4, 'Z') @ Matrix.Rotation(jaw * .35, 4, 'X'))
    bpy.context.view_layer.update()

FEET = {k + side_name(s): Vector((s * f.x, f.y, f.z)) for k, (h, f, a, b) in LEGS.items() for s in [-1, 1]}
FOLDED = {side_name(s): Vector((s * ARM_HAND.x, ARM_HAND.y, ARM_HAND.z)) for s in [-1, 1]}
lerp = lambda a, b, t: a + (b - a) * t
ease = lambda t: t * t * (3 - 2 * t)
def mix(a, b, t): return tuple(lerp(x, y, t) for x, y in zip(a, b))

def gait(t, stride, lift, low, bob, sway):
    """Diagonal pairs move together; a planted foot slides back as the body moves over it."""
    feet = {}
    for leg, offset in [('AL', 0), ('BR', 0), ('AR', .5), ('BL', .5)]:
        u = (t + offset) % 1; f = FEET[leg].copy()
        if u < .55: f.y += stride * (-.5 + u / .55)
        else:
            v = (u - .55) / .45; f.y += stride * (.5 - v); f.z = lift * math.sin(v * math.pi)
        feet[leg] = f
    w = math.sin(t * math.tau * 2)
    return feet, (0, 0, low + bob * w, .04, sway * math.sin(t * math.tau), 0)

def idle(t):
    w = math.sin(t * math.tau); twitch = max(0, math.sin(t * math.tau * 3 + 1)) ** 8
    hands = {k: v + Vector((0, 0, .03 * w)) for k, v in FOLDED.items()}
    return {'body': (0, 0, .02 * w, .02 * w, 0, 0), 'abdomen': (.05 * w, .04 * math.sin(t * math.tau + 1)), 'head': (-.04 * w, .15 * twitch), 'jaw': .25 * twitch, 'feet': FEET, 'hands': hands}
def stalk(t):
    feet, body = gait(t, .38, .22, -.16, .015, .03)
    hands = {k: v + Vector((0, -.08, -.1 + .04 * math.sin(t * math.tau))) for k, v in FOLDED.items()}
    return {'body': body, 'abdomen': (.1, .08 * math.sin(t * math.tau)), 'head': (.12, .1 * math.sin(t * math.tau * .5)), 'feet': feet, 'hands': hands}
def skitter(t):
    feet, body = gait(t, .8, .36, -.04, .05, .06)
    hands = {k: v + Vector((0, -.2, -.15)) for k, v in FOLDED.items()}
    return {'body': body[:3] + (.12,) + body[4:], 'abdomen': (-.08, .12 * math.sin(t * math.tau)), 'head': (.1, 0), 'feet': feet, 'hands': hands, 'jaw': .15}
def shriek(t):
    up = ease(min(1, t / .3)); tremble = math.sin(t * 90) * .02 * up
    hands = {side_name(s): lerp(FOLDED[side_name(s)], Vector((s * 1.05, -.55, 1.95)), up) for s in [-1, 1]}
    return {'body': (0, .12 * up, .3 * up + tremble, -.75 * up, 0, 0), 'abdomen': (.55 * up, 0), 'head': (-.35 * up + tremble, tremble * 3), 'jaw': up, 'feet': FEET, 'hands': hands}
def lunge(t):
    if t < .3: k = ease(t / .3); body = (0, .1 * k, -.22 * k, .18 * k, 0, 0); reach = 0
    elif t < .55: k = ease((t - .3) / .25); body = (0, lerp(.1, -.45, k), lerp(-.22, .08, k), lerp(.18, -.15, k), 0, 0); reach = k
    else: k = ease((t - .55) / .45); body = (0, lerp(-.45, 0, k), lerp(.08, 0, k), lerp(-.15, 0, k), 0, 0); reach = 1 - k
    hands = {side_name(s): lerp(FOLDED[side_name(s)], Vector((s * .32, -1.65, .85)), reach) for s in [-1, 1]}
    return {'body': body, 'abdomen': (-.2 * reach, 0), 'head': (-.1 * reach, 0), 'jaw': .9 * reach, 'feet': FEET, 'hands': hands}
def grab(t):
    pull = .5 + .5 * math.sin(t * math.tau)
    hands = {side_name(s): Vector((s * .18, lerp(-1.45, -1.05, pull), .72)) for s in [-1, 1]}
    feet = {k: v + Vector((0, .15, 0)) for k, v in FEET.items()}
    return {'body': (0, .12 * pull, -.06, -.1 - .12 * pull, 0, 0), 'abdomen': (.15, 0), 'head': (.1, .1 * math.sin(t * math.tau * 2)), 'jaw': .4 + .5 * abs(math.sin(t * math.tau * 2)), 'feet': feet, 'hands': hands}
def recoil(t):
    k = ease(min(1, t / .25)); tremble = math.sin(t * 70) * .015 * k
    hands = {side_name(s): lerp(FOLDED[side_name(s)], Vector((s * .12, -.45, 1.65)), k) for s in [-1, 1]}
    return {'body': (0, .32 * k, .12 * k + tremble, -.38 * k, 0, 0), 'abdomen': (.35 * k, 0), 'head': (.5 * k, tremble * 4), 'jaw': 0, 'feet': FEET, 'hands': hands}
def hit(t):
    k = math.sin(min(1, t / .6) * math.pi)
    return {'body': (0, .15 * k, .05 * k, -.15 * k, .25 * k, 0), 'abdomen': (.15 * k, .2 * k), 'head': (.25 * k, -.3 * k), 'jaw': .6 * k, 'feet': FEET, 'hands': FOLDED}
def death(t):
    k = ease(min(1, t / .45))
    feet = {name: lerp(f, Vector((f.x * .38, f.y * .6, .55)), k) for name, f in FEET.items()}
    hands = {side_name(s): lerp(FOLDED[side_name(s)], Vector((s * .12, -.55, .5)), k) for s in [-1, 1]}
    return {'body': (0, 0, -.5 * k, .08 * k, .55 * k, 0), 'abdomen': (-.15 * k, .25 * k), 'head': (.35 * k, .3 * k), 'jaw': .7 * k, 'feet': feet, 'hands': hands}

CLIP_NAMES = ['Idle', 'Stalk', 'Skitter', 'Shriek', 'Lunge', 'Grab', 'Recoil', 'Hit', 'Death']
set_aside = {}
for n in CLIP_NAMES:
    if n in bpy.data.actions: set_aside[n] = bpy.data.actions[n]; set_aside[n].name = n + ' (set aside)'
def make_clip(name, frames, pose):
    action = bpy.data.actions.new(name); created['actions'].append(action); rig.animation_data.action = action
    for f in range(frames + 1):
        apply(pose(f / frames))
        for pb in rig.pose.bones:
            pb.keyframe_insert('location', frame=f + 1, group=pb.name); pb.keyframe_insert('rotation_quaternion', frame=f + 1, group=pb.name)
    action.use_fake_user = True
    track = rig.animation_data.nla_tracks.new(); track.name = name; track.strips.new(name, 1, action); track.mute = True
    return action
clips = [make_clip('Idle', 60, idle), make_clip('Stalk', 40, stalk), make_clip('Skitter', 16, skitter), make_clip('Shriek', 40, shriek),
         make_clip('Lunge', 24, lunge), make_clip('Grab', 30, grab), make_clip('Recoil', 24, recoil), make_clip('Hit', 12, hit), make_clip('Death', 40, death)]
rig.animation_data.action = None; apply(idle(0))

scene.render.fps = 30
bpy.ops.object.select_all(action='DESELECT')
for o in [rig, body]: o.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'crawler.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_animations=True,
                          export_animation_mode='ACTIONS', export_anim_single_armature=False, export_force_sampling=True, export_frame_range=False, export_apply=False)
tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
print('LUNAR_ASSET crawler triangles', tris, 'bones', len(arm.bones), 'clips', [a.name for a in clips])

# Preview: three poses side by side under a cold key and a violet rim.
def point(o, p): o.rotation_euler = (Vector(p) - o.location).to_track_quat('-Z', 'Y').to_euler()
stage = []
world = bpy.data.worlds.new('Crawler studio'); world.use_nodes = True; scene.world = world
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (.05, .06, .08, 1); bg.inputs[1].default_value = .35
for name, loc, power, color in [('Key', (-3, -4, 5), 1100, (.9, .93, 1)), ('Rim', (3, 3, 3), 350, (.62, .35, 1))]:
    d = bpy.data.lights.new(name, 'AREA'); d.energy = power; d.size = 3; d.color = color
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.location = loc; point(o, (0, 0, .7)); stage.append(o)
cd = bpy.data.cameras.new('Crawler portrait'); cam = bpy.data.objects.new('Crawler portrait', cd); scene.collection.objects.link(cam)
cd.type = 'ORTHO'; cd.ortho_scale = 4.4; cam.location = (5.5, -3.5, 2.2); point(cam, (0, -.1, .9)); scene.camera = cam; stage.append(cam)
engines = {e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
for engine in ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES']:
    if engine in engines: scene.render.engine = engine; break
scene.render.resolution_x = 1100; scene.render.resolution_y = 800; scene.render.image_settings.file_format = 'PNG'
for clip, f, file in [('Stalk', 10, 'crawler-stalk.png'), ('Shriek', 40, 'crawler-shriek.png'), ('Lunge', 13, 'crawler-lunge.png')]:
    rig.animation_data.action = bpy.data.actions[clip]; scene.frame_set(f)
    scene.render.filepath = os.path.join(OUT, file); bpy.ops.render.render(write_still=True)
rig.animation_data.action = None
bpy.data.libraries.write(os.path.join(OUT, 'crawler-library.blend'), {scene}, fake_user=True)

bpy.context.window.scene = previous_scene
for o in list(scene.collection.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.data.scenes.remove(scene)
for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.lights, bpy.data.cameras):
    for d in list(coll):
        if d.users == 0: coll.remove(d)
if world.users == 0: bpy.data.worlds.remove(world)
for a in created['actions']: a.use_fake_user = False
for a in list(bpy.data.actions):
    if a in created['actions'] and a.users == 0: bpy.data.actions.remove(a)
for m in created['materials']:
    if m.users == 0: bpy.data.materials.remove(m)
for n, a in set_aside.items(): a.name = n
print('LUNAR_CRAWLER_READY', OUT)
