"""Author the crawler's body: a small glossy teardrop of black goo whose blank front splits open into a slit of needle teeth.
Two halves hinge at the back (ShellL, ShellR); a wet interior (Maw) sits between them; goo strands hang beneath (Core).
The legs are not modelled here: crawler-view.js grows and steps them at runtime. Builds in a temporary scene, exports
crawler.glb, writes crawler-library.blend and a preview render, then removes the scene so the open file is left untouched."""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

OUT = '/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('Crawler • goo body')
bpy.context.window.scene = scene
created = {'materials': [], 'meshes': []}

def mat(name, c, rough, metal=0, coat=0):
    m = bpy.data.materials.new(name); created['materials'].append(m); m.use_nodes = True; m.diffuse_color = (*c, 1)
    n = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = (*c, 1); n.inputs['Roughness'].default_value = rough; n.inputs['Metallic'].default_value = metal
    if coat and 'Coat Weight' in n.inputs: n.inputs['Coat Weight'].default_value = coat; n.inputs['Coat Roughness'].default_value = .03
    return m
INK = mat('Crawler • ink', (.006, .006, .007), .08, 0, 1)
BONE = mat('Crawler • bone', (.006, .006, .007), .12)
MAW = mat('Crawler • maw', (.008, .004, .004), .2)

LENGTH, WIDTH, HEIGHT = .62, .42, .4
HINGE = Vector((0, .2, 0))  # behind the middle, so the front opens like a mouth and the rear stays shut

def teardrop(v):
    """Sphere point to goo body: a round front bulb tapering to a drooping point behind."""
    t = (v.y + 1) / 2
    shrink = 1 - .62 * t ** 1.6
    return Vector((v.x * WIDTH / 2 * shrink, v.y * LENGTH / 2, v.z * HEIGHT / 2 * shrink - .09 * t ** 2.2 + .025 * (1 - t)))

def body_bmesh():
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=1)
    # The sphere's poles sit on Z; turn them to face front and back so the teardrop tapers cleanly.
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    for v in bm.verts: v.co = teardrop(v.co)
    return bm

def finish(o, m=None):
    if m: o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    created['meshes'].append(o.data); return o
def link(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.update()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); return o

root = bpy.data.objects.new('CrawlerBody', None); scene.collection.objects.link(root)

# Two halves. Each is cut at x=0 and capped; the cap is the wet inside of the mouth.
for side, name in [(-1, 'ShellL'), (1, 'ShellR')]:
    bm = body_bmesh()
    cut = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(side, 0, 0), clear_inner=True)
    edges = [e for e in cut['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    bmesh.ops.edgeloop_fill(bm, edges=edges)
    o = link(name, bm); o.data.materials.append(INK); o.data.materials.append(MAW); finish(o)
    for p in o.data.polygons:
        if abs(p.center.x) < 1e-4 and abs(p.normal.x) > .9: p.material_index = 1
    # One ragged row of needle teeth around the front of the cut edge, leaning across the slit and inward.
    teeth = bmesh.new()
    for i in range(26):
        a = math.pi * (.08 + .84 * i / 25)  # around the front of the cut outline, top to bottom
        rim = teardrop(Vector((0, -math.sin(a), math.cos(a))))
        if rim.y > HINGE.y - .08: continue
        centre = Vector((0, rim.y * .6, teardrop(Vector((0, -math.sin(a) * .6, 0))).z))
        inward = (centre - rim).normalized()
        size = .022 + .03 * (.5 + .5 * math.sin(i * 2.7 + side)) * math.sin(a)
        r = bmesh.ops.create_cone(teeth, cap_ends=True, segments=6, radius1=size * .32, radius2=0, depth=size * 2.4)
        axis = (Vector((-side, 0, 0)) * .8 + inward * .6).normalized()
        rot = Vector((0, 0, 1)).rotation_difference(axis).to_matrix().to_4x4()
        m = Matrix.Translation(rim + inward * .012 + Vector((side * .003, 0, 0))) @ rot @ Matrix.Translation((0, 0, size * 1.2))
        bmesh.ops.transform(teeth, matrix=m, verts=r['verts'])
    tm = bpy.data.meshes.new(name + ' teeth'); teeth.to_mesh(tm); teeth.free()
    t = bpy.data.objects.new(name + ' teeth', tm); scene.collection.objects.link(t); finish(t, BONE)
    # Join teeth into the half and move the origin to the hinge.
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); t.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.join()
    o.data.transform(Matrix.Translation(-HINGE)); o.location = HINGE; o.parent = root

# The wet inside, seen when the halves part.
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1)
for v in bm.verts: v.co = Vector((v.co.x * .05, v.co.y * LENGTH * .36 - .05, v.co.z * HEIGHT * .3))
maw = finish(link('Maw', bm), MAW); maw.parent = root

# Goo strands hanging from the underside: a thin neck that swells into a drop.
bm = bmesh.new()
strands = [(-.05, .06, .3, .016), (.07, .12, .42, .02), (.01, .21, .55, .018), (-.1, .17, .18, .012), (.11, -.01, .12, .011), (.03, -.07, .08, .01), (-.03, .27, .34, .014), (.06, .25, .2, .011)]
SIDES, RINGS = 10, 22
for x, y, length, drop in strands:
    xn, yn = x / (WIDTH / 2), y / (LENGTH / 2)
    base = teardrop(Vector((xn, yn, -math.sqrt(max(0, 1 - xn * xn - yn * yn)))))
    rings = []
    for j in range(RINGS + 1):
        k = j / RINGS
        # A wide root where it leaves the body, a long thinning thread, then a round drop gathering at the end.
        neck = .03 * (1 - k) ** 6 + drop * .28 * (1 - k * .6)
        bulb = drop * math.sqrt(max(0, 1 - ((k - .9) / .1) ** 2)) if k > .8 else 0
        r = max(neck, bulb) if k < 1 else .001
        rings.append([bm.verts.new((x + r * math.cos(a), y + r * math.sin(a), base.z + .03 - length * k)) for a in [i * math.tau / SIDES for i in range(SIDES)]])
    for a, b in zip(rings, rings[1:]):
        for i in range(SIDES): bm.faces.new((a[i], a[(i + 1) % SIDES], b[(i + 1) % SIDES], b[i]))
    bm.faces.new(list(reversed(rings[-1])))
core = finish(link('Core', bm), INK); core.parent = root

bpy.ops.object.select_all(action='DESELECT')
for o in [root, *root.children]: o.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'crawler.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_apply=True, export_yup=True, export_animations=False)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in root.children)
print('LUNAR_ASSET crawler body triangles', tris, 'nodes', [o.name for o in root.children])

# Preview with the halves parted, under a cold key light.
def point(o, p): o.rotation_euler = (Vector(p) - o.location).to_track_quat('-Z', 'Y').to_euler()
root.location = (0, 0, .5)
for o in root.children:
    if o.name.startswith('Shell'): o.rotation_euler.z = (.45 if o.name == 'ShellR' else -.45)
world = bpy.data.worlds.new('Crawler studio'); world.use_nodes = True; scene.world = world
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (.05, .055, .065, 1); bg.inputs[1].default_value = .6
stage = []
for name, loc, power in [('Key', (-1.5, -2, 2), 220), ('Rim', (1.5, 1.6, 1.2), 160)]:
    d = bpy.data.lights.new(name, 'AREA'); d.energy = power; d.size = 1.2
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.location = loc; point(o, (0, 0, .5)); stage.append(o)
cd = bpy.data.cameras.new('Crawler portrait'); cam = bpy.data.objects.new('Crawler portrait', cd); scene.collection.objects.link(cam)
cd.lens = 70; cam.location = (1.0, -1.6, .9); point(cam, (0, -.05, .45)); scene.camera = cam
engines = {e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
for engine in ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES']:
    if engine in engines: scene.render.engine = engine; break
scene.render.resolution_x = 900; scene.render.resolution_y = 700; scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(OUT, 'crawler-body.png'); bpy.ops.render.render(write_still=True)
for o in root.children: o.rotation_euler.z = 0
cam.location = (1.9, 0, .55); point(cam, (0, 0, .45))
scene.render.filepath = os.path.join(OUT, 'crawler-body-side.png'); bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(os.path.join(OUT, 'crawler-library.blend'), {scene}, fake_user=True)

bpy.context.window.scene = previous_scene
for o in list(scene.collection.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.data.scenes.remove(scene)
for coll in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras):
    for d in list(coll):
        if d.users == 0: coll.remove(d)
if world.users == 0: bpy.data.worlds.remove(world)
for m in created['materials']:
    if m.users == 0: bpy.data.materials.remove(m)
print('LUNAR_CRAWLER_READY', OUT)
