"""Four Blender-authored inventory samples. Run in Blender or via --background --python.

Builds isolated scenes, writes an editable library and transparent renders, and restores
the user's scene. No game meshes, UI, or materials are changed.
"""
from pathlib import Path
import math
import random
import bpy
from mathutils import Vector

ROOT = Path('/Users/gabe/Documents/Playground/lunar-art-test/game')
OUT = ROOT / 'assets' / 'inventory-study'
SCENES = {}
CREATED = []
PREVIOUS = None


def mat(name, color, metallic=0, rough=.45, emission=0):
    m = bpy.data.materials.new('Icon study / ' + name)
    CREATED.append(m)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = rough
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m


def finish(o, name, material, bevel=0, smooth=False):
    o.name = name
    o.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new('Broad machined edges', 'BEVEL')
        b.width = bevel
        b.segments = 2
        bpy.ops.object.modifier_apply(modifier=b.name)
    if smooth:
        for f in o.data.polygons:
            f.use_smooth = True
    elif bevel:
        n = o.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
        n.keep_sharp = True
    o.select_set(False)
    return o


def box(name, loc, size, material, bevel=.025, angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = size
    o.rotation_euler.z = angle
    return finish(o, name, material, bevel)


def mesh(name, verts, faces, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def metal(p):
    # Cast ingots: tapered shoulders rather than featureless cubes.
    for i, (x, y, z, a) in enumerate([(-.08, .12, .14, -.07), (.07, -.08, .40, .08)]):
        verts = [(sx * w, sy * d, h) for w, d, h in [(.69, .32, -.12), (.60, .26, .12)] for sx, sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        o = mesh('Metal / cast ingot ' + str(i + 1), verts,
                 [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], p['silver'])
        o.location = (x, y, z)
        o.rotation_euler.z = a
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        b = o.modifiers.new('Cast edge bevel', 'BEVEL'); b.width = .045; b.segments = 2
        bpy.ops.object.modifier_apply(modifier=b.name)
        n = o.modifiers.new('Cast face normals', 'WEIGHTED_NORMAL'); n.keep_sharp = True
        o.select_set(False)


def potatoes(p):
    rng = random.Random(19)
    # Two long, full-volume russets. Flat round forms with dark dots read as cookies.
    specs = [((-.29, .12, .34), (.30,.70,.34), -.12),
             ((.27,-.12,.33), (.29,.64,.33), -.73)]
    for i, (loc, size, a) in enumerate(specs):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=12, radius=1, location=loc)
        o = bpy.context.object
        # A gentle kidney curve, narrow end and uneven shoulders define a tuber.
        for v in o.data.vertices:
            v.co.x += .12 * (1-v.co.y*v.co.y) * (.4+v.co.y)
            v.co.x *= 1 + .14*v.co.y
            v.co *= 1 + rng.uniform(-.035, .035)
        o.scale = size
        o.rotation_euler = (.12 * i, -.1, a)
        finish(o, 'Potatoes / tuber ' + str(i+1), p['potato'], smooth=False)
        o.data.materials.append(p['potato_light'])
        for f in o.data.polygons:
            if rng.random() < .18:
                f.material_index = 1
        # Eyes on the upper surface, attached in the potato's local coordinates.
        for j, (u,v) in enumerate([(-.25,-.3),(.18,.5)]):
            w = math.sqrt(max(.1, 1-u*u-v*v))
            bpy.ops.mesh.primitive_uv_sphere_add(segments=7, ring_count=4, radius=1)
            eye = bpy.context.object
            eye.parent = o
            eye.location = (u*size[0], v*size[1], w*size[2])
            eye.scale = (.012,.027,.003)
            finish(eye, 'Potatoes / eye ' + str(i) + '-' + str(j), p['eye'])


def chip(p):
    box('Chip / green ceramic PCB', (0,0,.12), (1.08,1.08,.12), p['pcb'], .045)
    # Generous gold contacts remain visible at 40 px.
    for side in [-1,1]:
        for i in range(5):
            t = (i-2)*.19
            box('Chip / edge contact', (side*.59,t,.09), (.22,.095,.08), p['gold'], .014)
            box('Chip / edge contact', (t,side*.59,.09), (.095,.22,.08), p['gold'], .014)
    box('Chip / ivory carrier', (0,0,.24), (.73,.73,.17), p['ivory'], .04)
    box('Chip / silicon package', (0,0,.36), (.58,.58,.10), p['navy'], .028)
    # A broad stripe and registration dot replace illegible microtext.
    box('Chip / identification stripe', (-.12,0,.415), (.055,.35,.009), p['silver'], .006)
    box('Chip / identification stripe', (-.015,0,.415), (.028,.35,.009), p['silver'], .004)
    box('Chip / powered marker', (.17,-.17,.418), (.085,.085,.012), p['cyan'], .012)
    for x,y in [(-.41,-.32),(.41,.32)]:
        box('Chip / surface capacitor', (x,y,.21), (.095,.19,.075), p['dark'], .014)


def diamond(name, levels, material, x=0, y=0):
    verts = [(x+rx*sx,y+ry*sy,z) for z,rx,ry in levels for sx,sy in [(1,0),(0,1),(-1,0),(0,-1)]]
    faces = [(3,2,1,0)]
    for i in range(len(levels)-1):
        for j in range(4):
            faces.append((4*i+j,4*i+(j+1)%4,4*(i+1)+(j+1)%4,4*(i+1)+j))
    faces.append(tuple(4*(len(levels)-1)+j for j in range(4)))
    return mesh(name, verts, faces, material)


def artifact(p):
    # An elongated ember octahedron, echoing the actual cave pickup and lab specimen.
    # Two separated dark shells expose a luminous core in a deliberate fracture.
    diamond('Artifact / lower obsidian shell', [(.02,.025,.025),(.52,.35,.29),(.66,.31,.26)], p['relic'])
    diamond('Artifact / upper obsidian shell', [(.79,.30,.25),(1.02,.23,.19),(1.48,.012,.012)], p['relic'])
    diamond('Artifact / exposed ember core', [(.42,.06,.05),(.71,.285,.235),(1.12,.045,.04)], p['ember'])
    # Incised orange veins on the camera-facing facets; no neon aura baked into alpha.
    beam = box('Artifact / lower ember incision', (.12,-.19,.40), (.035,.025,.29), p['ember'], .006)
    beam.rotation_euler = (.16,.32,-.55)
    beam = box('Artifact / upper ember incision', (.11,-.13,1.05), (.026,.02,.26), p['ember'], .005)
    beam.rotation_euler = (.16,-.15,-.5)
    diamond('Artifact / detached shard', [(.40,.015,.015),(.61,.075,.06),(.81,.012,.012)], p['relic'], x=-.36,y=.04)


def area(scene, name, loc, power, size, color):
    data = bpy.data.lights.new('Icon study / ' + name, 'AREA')
    data.energy = power; data.shape = 'DISK'; data.size = size; data.color = color
    o = bpy.data.objects.new(data.name, data); scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector((0,0,.4))-o.location).to_track_quat('-Z','Y').to_euler()


def setup_camera(scene, objects):
    bpy.context.view_layer.update()
    # Use actual vertices: rotated bounding boxes leave rounded food and tall relics
    # needlessly small and off-center in the tiny inventory slots.
    points = [o.matrix_world @ v.co for o in objects for v in o.data.vertices]
    center = Vector(tuple((min(v[i] for v in points)+max(v[i] for v in points))/2 for i in range(3)))
    data = bpy.data.cameras.new('Icon study / orthographic camera')
    o = bpy.data.objects.new(data.name, data); scene.collection.objects.link(o)
    o.location = center + Vector((3,-5,3.65))
    o.rotation_euler = (center-o.location).to_track_quat('-Z','Y').to_euler()
    data.type = 'ORTHO'; scene.camera = o
    q = o.rotation_euler.to_quaternion().inverted()
    projected = [q @ (p-center) for p in points]
    bounds = [(min(p[i] for p in projected), max(p[i] for p in projected)) for i in range(2)]
    data.ortho_scale = max(b-a for a,b in bounds)*1.17
    # Recenter the projected silhouette, not just the world-axis bounds.
    offset = Vector(((bounds[0][0]+bounds[0][1])/2,(bounds[1][0]+bounds[1][1])/2,0))
    o.location += o.rotation_euler.to_quaternion() @ offset


def build_study(builders=None, library_name='inventory-study.blend'):
    global PREVIOUS
    PREVIOUS = bpy.context.window.scene
    OUT.mkdir(parents=True, exist_ok=True)
    p = {
        'silver': mat('brushed lunar alloy', (.57,.65,.71), .78, .27),
        'ivory': mat('ceramic ivory', (.78,.79,.71), .15, .42),
        'dark': mat('graphite structure', (.045,.065,.08), .45, .45),
        'navy': mat('blue silicon package', (.022,.058,.105), .42, .25),
        'pcb': mat('green circuit substrate', (.045,.17,.105), .18, .42),
        'gold': mat('gold contacts', (.83,.52,.16), .72, .27),
        'cyan': mat('status cyan', (.13,.61,.76), .1, .3, 1),
        'potato': mat('russet potato skin', (.27,.125,.044), 0, .86),
        'potato_light': mat('potato skin variation', (.30,.145,.053), 0, .86),
        'eye': mat('potato shallow eyes', (.18,.078,.028), 0, .95),
        'relic': mat('ancient mineral shell', (.095,.07,.065), .32, .36),
        'ember': mat('alien relic ember', (1,.16,.025), .15, .3, 1.8),
    }
    try:
        if builders is None:
            builders = [('metal',metal),('crop',potatoes),('chip',chip),('artifact',artifact)]
        for key, builder in builders:
            scene = bpy.data.scenes.new('Inventory study / ' + key)
            SCENES[key] = scene
            bpy.context.window.scene = scene
            builder(p)
            models = list(scene.objects)
            scene.world = bpy.data.worlds.new('Icon study / soft studio')
            scene.world.use_nodes = True
            bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
            bg.inputs[0].default_value = (.26,.30,.37,1); bg.inputs[1].default_value = .5
            area(scene,'large warm key',(-3,-4,6), 520,4,(1,.92,.82))
            area(scene,'cool fill',(4,-1,3), 350,3,(.74,.85,1))
            area(scene,'top rim',(0,4,5), 650,3,(1,.97,.89))
            setup_camera(scene,models)
            # Read valid engine identifiers from Blender's assignment error if needed.
            for engine in ['CYCLES']:
                try:
                    scene.render.engine = engine
                    break
                except TypeError:
                    continue
            scene.cycles.samples = 48; scene.cycles.use_denoising = True
            scene.render.resolution_x = 512; scene.render.resolution_y = 512
            scene.render.resolution_percentage = 100
            scene.render.film_transparent = True
            scene.render.image_settings.file_format = 'PNG'
            scene.render.image_settings.color_mode = 'RGBA'
            scene.render.image_settings.color_depth = '8'
            scene.render.filepath = str(OUT / (key + '.png'))
            scene.view_settings.view_transform = 'AgX'
            scene.render.threads_mode = 'FIXED'; scene.render.threads = 6
        bpy.data.libraries.write(str(OUT / library_name),set(SCENES.values()),fake_user=True)
    finally:
        bpy.context.window.scene = PREVIOUS
    print('INVENTORY_STUDY_BUILT', str(OUT), list(SCENES))


def render_icon(key):
    previous = bpy.context.window.scene
    try:
        bpy.context.window.scene = SCENES[key]
        bpy.ops.render.render(write_still=True, scene=SCENES[key].name)
    finally:
        bpy.context.window.scene = previous
    print('ICON_RENDERED', key, str(OUT / (key + '.png')))


def cleanup():
    bpy.context.window.scene = PREVIOUS
    for scene in SCENES.values():
        for o in list(scene.objects):
            data = o.data
            bpy.data.objects.remove(o,do_unlink=True)
            if data and data.users == 0:
                if isinstance(data,bpy.types.Mesh): bpy.data.meshes.remove(data)
                elif isinstance(data,bpy.types.Camera): bpy.data.cameras.remove(data)
                elif isinstance(data,bpy.types.Light): bpy.data.lights.remove(data)
        world = scene.world
        bpy.data.scenes.remove(scene)
        if world.users == 0: bpy.data.worlds.remove(world)
    for m in CREATED:
        if m.users == 0: bpy.data.materials.remove(m)
    SCENES.clear()
    print('INVENTORY_STUDY_RESTORED_ORIGINAL_SCENE')


if __name__ == '__main__':
    build_study()
    try:
        for key in SCENES: render_icon(key)
    finally:
        cleanup()
