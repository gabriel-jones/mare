"""Author the deep-tech kit: xeno lab and resonance reactor, built from what the caves give up. Run inside
Blender. Reuses the space kit's helpers and palette, builds in a temporary scene, writes only that scene to
deep-library.blend, and removes it again so the open file is left untouched."""
_source = open('/Users/gabe/Documents/Playground/lunar-art-test/game/blender/build_space.py').read()
exec(_source[:_source.index('# --- Fabricator')])
scene.name = 'Lunar deep asset library'

M['violet'] = material('Lunar • resonant crystal glow', (.62, .32, 1), .1, .2, 4)
M['ember'] = material('Lunar • alien relic ember', (1, .28, .12), .1, .3, 2.5)

def octa(name, loc, rx, ry, rz, mat):
    x, y, z = loc
    vs = [(x + rx, y, z), (x - rx, y, z), (x, y + ry, z), (x, y - ry, z), (x, y, z + rz), (x, y, z - rz)]
    fs = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
    return mesh_object(name, vs, fs, mat)

# --- Xeno lab: 4 x 4 m. A sealed lab with a glass containment column holding a specimen. ---
def xenolab():
    box('Foundation skid', (0, 0, .12), (3.85, 3.85, .24), 'dark', .05)
    box('Lab module', (-.55, .55, 1.05), (2.6, 2.6, 1.6), 'ivory', .12)
    box('Lab roof band', (-.55, .55, 1.92), (2.75, 2.75, .14), 'dark', .04)
    for x in [-1.4, -.55, .3]: box('Roof rib', (x, .55, 2.02), (.12, 2.5, .08), 'metal', .02)
    box('Observation window', (-.55, -.77, 1.2), (1.7, .05, .7), 'glass', .02)
    box('Window frame', (-.55, -.76, 1.2), (1.9, .03, .9), 'dark', .02)
    box('Hazard band', (-.55, -.78, .4), (2.5, .03, .14), 'orange', 0)
    # Containment column on the open corner: a ringed glass cylinder with the specimen glowing inside.
    cyl('Column plinth', (1.15, -1.1, .35), .78, .22, 'dark', 20)
    for z in [.5, 2.25]: cyl('Column ring', (1.15, -1.1, z), .64, .12, 'orange', 20)
    cyl('Column cap', (1.15, -1.1, 2.38), .5, .12, 'metal', 20)
    octa('Specimen', (1.15, -1.1, 1.4), .26, .26, .5, 'ember')
    cyl('Specimen cradle', (1.15, -1.1, .62), .3, .14, 'glass', 16)
    for a in [0, 2.1, 4.2]:
        beam('Sensor arm', (1.15 + math.cos(a) * .75, -1.1 + math.sin(a) * .75, .45), (1.15 + math.cos(a) * .66, -1.1 + math.sin(a) * .66, 2.3), .07, 'metal')
    beam('Feed conduit', (.6, -.2, .5), (.9, -.7, .5), .1, 'metal')
    box('Sample drawer', (1.35, .9, .55), (.9, 1.2, .6), 'ivory', .05)
    box('Drawer slot', (1.35, .29, .62), (.6, .03, .08), 'violet', .005)
    box('Analysis readout', (-1.5, -.78, 1.65), (.5, .04, .25), 'light', .01)
    beam('Antenna', (-1.6, 1.5, 1.95), (-1.6, 1.5, 2.8), .05, 'metal')
    cyl('Antenna dish', (-1.6, 1.5, 2.85), .26, .05, 'ivory', 14)
    status_lamp(-1.6, -.5, 2.15)

# --- Resonance reactor: 4 x 4 m. A rare-earth crystal held in a cage of rings, with radiator fins. ---
def reactor():
    box('Foundation skid', (0, 0, .15), (3.85, 3.85, .3), 'dark', .06)
    cyl('Core plinth', (0, 0, .5), 1.15, .4, 'ivory', 24)
    cyl('Plinth band', (0, 0, .72), 1.2, .08, 'orange', 24)
    octa('Resonant lattice', (0, 0, 1.75), .38, .38, .95, 'violet')
    octa('Lattice shard', (.42, .18, 1.25), .12, .12, .35, 'violet')
    octa('Lattice shard', (-.35, -.3, 1.35), .1, .1, .3, 'violet')
    for z, r in [(1.2, .92), (1.85, .8), (2.5, .62)]:
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=.05, major_segments=28, minor_segments=6, location=(0, 0, z))
        finish(bpy.context.object, 'Resonator ring', 'metal', 0, True)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        beam('Cage strut', (math.cos(a) * 1.0, math.sin(a) * 1.0, .7), (math.cos(a) * .55, math.sin(a) * .55, 2.9), .09, 'ivory')
    cyl('Cage crown', (0, 0, 2.95), .42, .12, 'dark', 18)
    for s in [-1, 1]:
        box('Radiator mast', (s * 1.6, .9, .9), (.18, .18, 1.2), 'dark', .02)
        for k in range(4): box('Radiator fin', (s * 1.6, .9 - .3 + k * .2, 1.0), (.5, .04, 1.1), 'metal', .005)
    box('Control cabinet', (-1.3, -1.35, .65), (.9, .6, .7), 'ivory', .05)
    box('Cabinet screen', (-1.3, -1.66, .75), (.6, .03, .3), 'glass', .01)
    beam('Power bus', (-1.3, -1.0, .4), (0, -.8, .4), .12, 'orange')
    status_lamp(1.6, -1.5, 1.4)

STATUS = [('Lamp', (0, 0, 0))]
layout = []
layout += export_asset('xenolab', xenolab, (-4, 0, 0), parts=STATUS)
layout += export_asset('reactor', reactor, (2, 0, 0), parts=STATUS)

scene.world = bpy.data.worlds.new('Deep library environment')
scene.world.use_nodes = True
background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs[0].default_value = (.16, .2, .27, 1); background.inputs[1].default_value = .4
bpy.ops.object.light_add(type='SUN', location=(0, 0, 20)); sun = bpy.context.object; sun.rotation_euler = (.45, -.5, -.55); sun.data.energy = 3
bpy.ops.object.light_add(type='AREA', location=(0, -10, 15)); area = bpy.context.object; area.data.energy = 1800; area.data.shape = 'DISK'; area.data.size = 15
bpy.ops.object.camera_add(location=(10, -16, 13)); camera = bpy.context.object
camera.rotation_euler = (Vector((-1, 0, 1)) - camera.location).to_track_quat('-Z', 'Y').to_euler(); camera.data.type = 'ORTHO'; camera.data.ortho_scale = 13; scene.camera = camera
for o in (sun, area, camera): created['objects'].append(o)
engines = {e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
for engine in ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES']:
    if engine in engines: scene.render.engine = engine; break
scene.render.resolution_x = 1400; scene.render.resolution_y = 900
scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = os.path.join(OUT, 'deep-library.png')
if RENDER: bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(os.path.join(OUT, 'deep-library.blend'), {scene}, fake_user=True)

bpy.context.window.scene = previous_scene
lights = [o.data for o in (sun, area)]; cam = camera.data; world = scene.world
for o in list(scene.collection.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.data.scenes.remove(scene)
for me in created['meshes']:
    try:
        if me.users == 0: bpy.data.meshes.remove(me)
    except ReferenceError:
        pass
for d in lights:
    if d.users == 0: bpy.data.lights.remove(d)
if cam.users == 0: bpy.data.cameras.remove(cam)
if world.users == 0: bpy.data.worlds.remove(world)
for m in created['materials']:
    if m.users == 0: bpy.data.materials.remove(m)
print('LUNAR_DEEP_LIBRARY_READY', OUT)
