"""Author the cave's rock formations: organic, drip-built shapes that replace the old cones.
Each is one smooth mesh, 1 m tall with a base radius near .75, origin at the centre of its foot; cave-view.js scales it
per spire and glazes the tips with the crawler's goo at runtime. Builds in a temporary scene, exports
cave-formations.glb, writes formations-library.blend and a preview, then removes only what it made."""
import bpy, bmesh, math, os
from mathutils import Vector, noise

OUT = '/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('Cave • formations')
bpy.context.window.scene = scene
made = {'meshes': [], 'materials': [], 'lights': [], 'cameras': [], 'worlds': []}

rock = bpy.data.materials.new('Formation • limestone'); made['materials'].append(rock); rock.use_nodes = True
bsdf = next(n for n in rock.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Base Color'].default_value = (.42, .45, .44, 1); bsdf.inputs['Roughness'].default_value = .8

def lathe(bm, profile, seed, height=1., segs=20, rings=34, base=(0, 0), bend=(0, 0), flutes=5, flute=.07, wobble=.16, tip=True):
    """A drip-built column: `profile(t)` is the radius up the height. The axis wanders, flowstone ridges run down the
    sides (strongest low down, twisting as they go) and lumps of every size break the symmetry."""
    rows = []
    for i in range(rings + 1):
        t = i / rings; r = profile(t)
        cx = base[0] + bend[0] * t * t + .05 * noise.noise(Vector((seed, t * 2.6, 0))) * t
        cy = base[1] + bend[1] * t * t + .05 * noise.noise(Vector((0, t * 2.6, seed))) * t
        row = []
        for j in range(segs):
            a = j / segs * math.tau
            p = Vector((math.cos(a) * 1.3 + seed, math.sin(a) * 1.3, t * 3.2 * height))
            lumps = noise.noise(p) + .45 * noise.noise(p * 2.7) + .2 * noise.noise(p * 6.1)
            ridge = flute * (1.2 - t) * abs(math.sin(a * flutes * .5 + 1.4 * noise.noise(Vector((t * 1.8, seed, 2))))) * (.6 + .8 * abs(noise.noise(Vector((a, seed, 5)))))
            w = 1 + wobble * lumps + ridge
            row.append(bm.verts.new((cx + math.cos(a) * r * w, cy + math.sin(a) * r * w, t * height)))
        rows.append(row)
    for i in range(rings):
        for j in range(segs):
            bm.faces.new((rows[i][j], rows[i][(j + 1) % segs], rows[i + 1][(j + 1) % segs], rows[i + 1][j]))
    top = bm.verts.new((base[0] + bend[0], base[1] + bend[1], height + (.012 if tip else 0)))
    for j in range(segs): bm.faces.new((rows[-1][j], rows[-1][(j + 1) % segs], top))
    foot = bm.verts.new((base[0], base[1], 0))
    for j in range(segs): bm.faces.new((rows[0][(j + 1) % segs], rows[0][j], foot))
    return rows

def drip(t, base=.75, rings=6.5, swell=.12, seed=0.):
    """Uneven drip rings tapering to a blunt, beaded tip."""
    taper = (1 - t) ** .85
    bulge = 1 + swell * max(0, math.sin(t * math.pi * rings + 2.2 * noise.noise(Vector((t * 1.7, seed, 9))))) ** 1.5
    bead = .05 * math.exp(-((t - .93) / .035) ** 2)
    return base * taper * bulge + bead + .006

def build(name, make):
    bm = bmesh.new(); make(bm)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); made['meshes'].append(me)
    for p in me.polygons: p.use_smooth = True
    me.materials.append(rock)
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); return o

def stalagmite(bm):
    lathe(bm, lambda t: drip(t, seed=1.7), 1.7, bend=(.14, .05))

def twin(bm):
    # Two drips grown together at the foot, the smaller leaning away.
    lathe(bm, lambda t: drip(t, .62), 4.1, base=(-.12, 0), bend=(-.05, .02))
    lathe(bm, lambda t: drip(t, .46, 5.5), 9.3, height=.66, base=(.3, .05), bend=(.16, .04), segs=14, rings=22)

def column(bm):
    # Flowstone column: fluted, pinched at the waist, flaring where it meets the dark above.
    lathe(bm, lambda t: .75 * (.45 + .55 * (1 - t) ** 2.4) * (1 + .55 * t ** 5) * (1 + .07 * math.sin(t * math.pi * 7 + 2 * noise.noise(Vector((t * 2, 1, 1))))), 2.6,
          flutes=9, flute=.12, wobble=.12, tip=False, rings=40, segs=28)

def stump(bm):
    # Snapped off: a squat drip with a broken, cratered top.
    rows = lathe(bm, lambda t: drip(.45 * t) * (1 if t < .97 else .85), 6.2, tip=False, rings=20)
    for j, v in enumerate(rows[-1]): v.co.z -= .14 * abs(noise.noise(Vector((j * .7, 3.1, 0)))) + .05 * (j % 3 == 0)
    for j, v in enumerate(rows[-2]): v.co.z -= .05 * abs(noise.noise(Vector((j * .9, 5.3, 0))))

def cluster(bm):
    # A big drip with a brood of small ones round its foot.
    lathe(bm, lambda t: drip(t, .55), 3.3, bend=(.04, -.03))
    for k, (a, d, h, r) in enumerate([(.4, .62, .42, .26), (2.3, .58, .3, .2), (3.9, .7, .52, .28), (5.2, .5, .22, .16)]):
        lathe(bm, lambda t, r=r: drip(t, r, 4.5), 11 + k * 2.7, height=h, base=(math.cos(a) * d, math.sin(a) * d),
              bend=(math.cos(a) * .08, math.sin(a) * .08), segs=12, rings=16)

FORMS = [('Formation_Stalagmite', stalagmite), ('Formation_Twin', twin), ('Formation_Column', column), ('Formation_Stump', stump), ('Formation_Cluster', cluster)]
objects = [build(n, f) for n, f in FORMS]
bpy.ops.object.select_all(action='DESELECT')
for o in objects: o.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'cave-formations.glb'), export_format='GLB', use_selection=True, use_active_scene=True,
                          export_apply=True, export_yup=True, export_animations=False, export_materials='NONE')
tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objects}

# Preview: the family in a row.
for i, o in enumerate(objects): o.location = ((i - 2) * 1.9, 0, 0); o.scale = (1, 1, 2.6 if o.name != 'Formation_Stump' else 1.2)
world = bpy.data.worlds.new('Formation studio'); made['worlds'].append(world); world.use_nodes = True; scene.world = world
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (.04, .045, .055, 1); bg.inputs[1].default_value = .7
def aim(o, target): o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()
for name, loc, power in [('Key', (-3, -5, 6), 900), ('Rim', (4, 4, 3), 500)]:
    d = bpy.data.lights.new(name, 'AREA'); made['lights'].append(d); d.energy = power; d.size = 3
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.location = loc; aim(o, (0, 0, 1))
cd = bpy.data.cameras.new('Formations'); made['cameras'].append(cd); cam = bpy.data.objects.new('Formations', cd); scene.collection.objects.link(cam)
cd.lens = 40; cam.location = (0, -10.5, 3.2); aim(cam, (0, 0, 1.1)); scene.camera = cam
engines = {e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
for engine in ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES']:
    if engine in engines: scene.render.engine = engine; break
scene.render.resolution_x = 1400; scene.render.resolution_y = 700; scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(OUT, 'cave-formations.png'); bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(os.path.join(OUT, 'formations-library.blend'), {scene}, fake_user=True)

bpy.context.window.scene = previous_scene
for o in list(scene.collection.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.data.scenes.remove(scene)
for kind, coll in (('meshes', bpy.data.meshes), ('lights', bpy.data.lights), ('cameras', bpy.data.cameras), ('worlds', bpy.data.worlds), ('materials', bpy.data.materials)):
    for d in made[kind]:
        if d.users == 0: coll.remove(d)
print('LUNAR_FORMATIONS_READY', tris)
