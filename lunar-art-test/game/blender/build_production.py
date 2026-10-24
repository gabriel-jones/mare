"""Author the Phase B production kit: mining rover, regolith processor, conveyor, storage crate and
revised hopper. Run inside Blender. Builds in a temporary scene, writes only that scene to
production-library.blend, and removes it again so the open file is left untouched."""
import bpy, bmesh, math, os
from mathutils import Vector

OUT = '/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
RENDER = os.environ.get('LUNAR_RENDER_PREVIEW', '1') == '1'
EXPORT = globals().get('ONLY') or {'rover', 'processor', 'conveyor', 'storage', 'hopper'}
# Inside the Blender UI the kit builds in a scene of its own; run headless (blender -b) it uses the empty startup scene.
window = bpy.context.window
previous_scene = window.scene if window else None
if window:
    scene = bpy.data.scenes.new('Lunar production asset library')
    window.scene = scene
else:
    scene = bpy.context.scene; scene.name = 'Lunar production asset library'
    for o in list(scene.objects): bpy.data.objects.remove(o, do_unlink=True)
objects = []
created = {'objects': [], 'meshes': [], 'materials': []}

def material(name, color, metallic=0, roughness=.5, emission=0):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name); created['materials'].append(m)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m

# Same palette names as build_industrial.py so both kits share one look.
M = {
 'ivory': material('Lunar • ceramic ivory', (.78,.79,.71), .15,.42),
 'dark': material('Lunar • graphite structure', (.045,.065,.08), .45,.45),
 'orange': material('Lunar • burnt orange safety', (.8,.21,.045), .15,.45),
 'metal': material('Lunar • brushed stainless', (.48,.57,.62), .78,.3),
 'pv': material('Lunar • photovoltaic blue black', (.018,.055,.105), .45,.27),
 'glass': material('Lunar • deep teal glazing', (.025,.14,.18), .55,.2),
 'light': material('Lunar • warm powered emission', (1,.61,.2), .1,.3, 3),
 'floor': material('Lunar • regolith composite', (.19,.22,.24), .1,.75),
 'regolith': material('Lunar • loose regolith', (.36,.34,.31), 0,.95),
 'rubber': material('Lunar • wheel elastomer', (.025,.028,.03), 0,.8),
 # The runtime gives this material a scrolling tread texture; UV v runs along the travel direction.
 'belt': material('Lunar • conveyor belt', (.42,.43,.43), 0,.85),
}

def track(o):
    created['objects'].append(o); created['meshes'].append(o.data); return o

def finish(o, name, mat, bevel=0, smooth=False):
    o.name = name
    o.data.materials.append(M[mat])
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.select_set(False)
    if bevel:
        mod = o.modifiers.new('Precision edge highlights', 'BEVEL'); mod.width = bevel; mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if smooth:
        for f in o.data.polygons: f.use_smooth = True
    objects.append(track(o))
    return o

def box(name, loc, size, mat='ivory', bevel=.035, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.scale = size
    if rot: o.rotation_euler = rot
    return finish(o, name, mat, bevel)

def cyl(name, loc, radius, depth, mat='metal', vertices=16, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o = bpy.context.object
    if rotation: o.rotation_euler = rotation
    return finish(o, name, mat, 0, True)

def beam(name, a, b, width, mat='dark', bevel=True):
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(a + b) / 2)
    o = bpy.context.object; o.scale = (width, width, (b - a).length)
    o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return finish(o, name, mat, min(width * .15, .025) if bevel else 0)

def mesh_object(name, vs, fs, mat):
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    return finish(o, name, mat)

def frustum(name, z0, z1, x0, y0, x1, y1, mat, cx=0, cy=0, closed_bottom=True):
    vs = [(cx-x0,cy-y0,z0),(cx+x0,cy-y0,z0),(cx+x0,cy+y0,z0),(cx-x0,cy+y0,z0),(cx-x1,cy-y1,z1),(cx+x1,cy-y1,z1),(cx+x1,cy+y1,z1),(cx-x1,cy+y1,z1)]
    fs = [(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)]
    if closed_bottom: fs.append((3,2,1,0))
    return mesh_object(name, vs, fs, mat)

def arrow(name, loc, length, width, z, mat='orange'):
    # Flat chevron pointing -Y (game +Z, the item travel direction).
    x, y = loc
    vs = [(x-width/2,y+length/2,z),(x,y+length/2-width*.45,z),(x+width/2,y+length/2,z),(x,y-length/2,z)]
    return mesh_object(name, vs, [(0,3,1),(1,3,2)], mat)

exec(open(os.path.join(os.path.dirname(OUT), 'blender', 'status_parts.py')).read())

def join(group, name, origin=(0,0,0)):
    if not group: return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in group: o.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    if len(group) > 1: bpy.ops.object.join()
    o = bpy.context.object; o.name = name
    scene.cursor.location = origin
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    scene.cursor.location = (0, 0, 0)
    return o

def export_asset(name, builder, location, parts=()):
    """Static geometry merges by material. Each (prefix, origin) part stays a separate, named, pivotable node."""
    global objects
    objects = []; builder()
    result = []
    for prefix, origin in parts:
        if prefix.endswith('*'):
            for o in [o for o in objects if o.name.startswith(prefix[:-1])]:
                center = sum((o.matrix_world @ Vector(c) for c in o.bound_box), Vector()) / 8
                result.append(join([o], o.name.split('.')[0], tuple(center)))
                objects.remove(o)
            continue
        group = [o for o in objects if o.name.startswith(prefix)]
        for o in group: objects.remove(o)
        o = join(group, prefix, origin)
        if o: result.append(o)
    groups = {key: [o for o in objects if o.data.materials[0] == mat] for key, mat in M.items()}
    for key, group in groups.items():
        o = join(group, f'{name}_{key}')
        if o: result.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in result: o.select_set(True)
    if name in EXPORT: bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_apply=True, export_yup=True, export_animations=False)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in result)
    print('LUNAR_ASSET', name, 'triangles', tris, 'nodes', len(result))
    for o in result:
        if o.parent is None: o.location += Vector(location)
    return result

# --- Mining rover: front is -Y. Wheels, drill arm and cargo load are animated at runtime. ---
def rover():
    box('Chassis spine', (0, 0, .58), (1.06, 2.15, .28), 'dark', .05)
    box('Underbody skid', (0, .05, .42), (.8, 1.7, .12), 'metal', .02)
    for x in [-.66, .66]:
        box('Suspension beam', (x, 0, .5), (.12, 1.75, .14), 'metal', .02)
        for y in [-.78, .78]:
            box('Wheel fender', (x * 1.08, y, .78), (.36, .74, .08), 'ivory', .03)
            cyl(f'Wheel_{"L" if x < 0 else "R"}{"F" if y < 0 else "B"}', (x * 1.1, y, .32), .32, .24, 'rubber', 14, (0, math.pi / 2, 0))
            cyl('Wheel hub', (x * 1.24, y, .32), .14, .04, 'orange', 10, (0, math.pi / 2, 0))
    # Forward instrument cab with glazing and sensor mast.
    box('Cab shell', (0, -.62, .98), (1.0, .72, .55), 'ivory', .1)
    box('Cab glazing', (0, -.99, 1.02), (.78, .04, .26), 'glass', .02)
    box('Cab stripe', (0, -.995, .8), (.86, .03, .06), 'orange', .01)
    beam('Sensor mast', (.36, -.45, 1.25), (.36, -.45, 1.75), .05, 'metal')
    box('Sensor head', (.36, -.45, 1.8), (.22, .16, .1), 'dark', .02)
    status_lamp(.36, -.45, 1.85)
    box('Roof solar skin', (0, -.6, 1.27), (.86, .58, .03), 'pv', .005)
    # Open rear cargo bin; the separate Cargo mound scales with load.
    box('Bin floor', (0, .5, .76), (.98, 1.0, .06), 'dark', .01)
    for x in [-.5, .5]: box('Bin side', (x, .5, 1.0), (.06, 1.0, .46), 'ivory', .02)
    box('Bin back', (0, 1.0, 1.0), (1.04, .06, .46), 'ivory', .02)
    box('Bin front', (0, -.01, 1.0), (1.04, .06, .46), 'ivory', .02)
    for x in [-.53, .53]: box('Bin rim', (x, .5, 1.24), (.07, 1.06, .05), 'orange', .01)
    frustum('Cargo regolith mound', 0, .38, .44, .44, .18, .2, 'regolith', 0, 0)
    for o in objects[-1:]: o.location = (0, .5, .79)
    # Excavator arm: pivot at the front of the chassis, auger hanging toward the ground.
    beam('Drill arm', (0, -1.05, .7), (0, -1.55, .55), .14, 'orange')
    for x in [-.2, .2]: beam('Drill arm', (x, -.95, .62), (x, -1.15, .7), .07, 'metal')
    cyl('Drill motor', (0, -1.6, .62), .17, .3, 'dark', 12)
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=.15, radius2=.02, depth=.42, location=(0, -1.6, .28), rotation=(math.pi, 0, 0))
    finish(bpy.context.object, 'Drill auger', 'metal', 0, True)
    for z in [.38, .25]: cyl('Drill flight', (0, -1.6, z), .17 - (.45 - z) * .2, .03, 'metal', 12)

# --- Regolith processor: 4 x 6 m, input chute at back-left (+Y, x=-1), output at front-left. ---
def processor():
    box('Foundation skid', (0, 0, .15), (3.85, 5.85, .3), 'dark', .06)
    for x in [-1.8, 1.8]:
        for y in [-2.75, 0, 2.75]: box('Anchor pad', (x, y, .32), (.32, .32, .08), 'metal', .02)
    # Input feed hopper and rotary kiln running back to front.
    frustum('Feed hopper', 1.35, 2.25, .3, .3, .7, .62, 'ivory', -1, 2.1, False)
    for a, b in [((-1.72,1.46,2.25),(-.28,1.46,2.25)),((-.28,1.46,2.25),(-.28,2.74,2.25)),((-.28,2.74,2.25),(-1.72,2.74,2.25)),((-1.72,2.74,2.25),(-1.72,1.46,2.25))]: beam('Feed rim', a, b, .09, 'orange')
    box('Input chute', (-1, 2.78, .62), (1.0, .4, .62), 'orange', .04)
    box('Input chute mouth', (-1, 2.99, .62), (.78, .04, .4), 'dark', .01)
    for y in [1.1, -1.4]: box('Kiln cradle', (-1, y, .62), (1.2, .4, .64), 'dark', .04)
    cyl('Rotary kiln', (-1, -.1, 1.2), .62, 3.2, 'ivory', 20, (math.pi / 2, 0, 0))
    for y in [-1.3, -.1, 1.1]: cyl('Kiln drive ring', (-1, y, 1.2), .66, .12, 'metal', 20, (math.pi / 2, 0, 0))
    cyl('Kiln end cap', (-1, -1.75, 1.2), .5, .12, 'dark', 20, (math.pi / 2, 0, 0))
    box('Output housing', (-1, -2.35, .78), (1.1, .9, 1.0), 'dark', .05)
    box('Output collar', (-1, -2.86, .62), (1.0, .3, .62), 'orange', .04)
    box('Output chute mouth', (-1, -3.0, .6), (.78, .04, .38), 'dark', .01)
    # Electrolysis tower and oxygen vessel on the right.
    cyl('Electrolysis tower', (.95, .9, 1.9), .72, 3.2, 'ivory', 20)
    for z in [.65, 2.3, 3.35]: cyl('Tower band', (.95, .9, z), .75, .1, 'orange' if z == 2.3 else 'metal', 20)
    cyl('Tower cap', (.95, .9, 3.6), .55, .2, 'dark', 20)
    box('Tower status light', (.95, .16, 2.75), (.32, .04, .12), 'light', .005)
    cyl('Oxygen vessel', (1.05, -1.75, 1.0), .55, 1.1, 'ivory', 18, (math.pi / 2, 0, 0))
    for y in [-2.32, -1.18]: bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=.55, location=(1.05, y, 1.0)); finish(bpy.context.object, 'Oxygen vessel end', 'ivory', 0, True)
    box('Oxygen band', (1.05, -1.75, 1.0), (1.16, .12, 1.16), 'orange', .02)
    for y in [-2.2, -1.3]: box('Vessel saddle', (1.05, y, .5), (.9, .2, .4), 'dark', .02)
    beam('Process pipe', (-.4, -.1, 1.6), (.3, .9, 2.6), .14, 'metal')
    beam('Process pipe', (.95, .2, 1.1), (1.05, -1.2, 1.2), .12, 'metal')
    beam('Process pipe', (-.4, -2.2, 1.0), (.55, -1.75, 1.0), .12, 'metal')
    # Heat-rejection radiator fins.
    for y in [.0, .55, 1.1, 1.65]: box('Radiator fin', (1.85, y, 1.6), (.06, .42, 2.2), 'dark', .01)
    beam('Radiator manifold', (1.8, -.25, 2.75), (1.8, 1.9, 2.75), .1, 'metal')
    status_lamp(.95, .9, 3.7)

def uv_strip(name, rows, mat):
    """Quad strip through `rows` of (left, right) points; UV u runs across, v along the rows (0..1)."""
    vs = [p for row in rows for p in row]
    fs = [(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2) for i in range(len(rows) - 1)]
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs); me.update()
    for f in me.polygons:
        if f.normal.z < 0: f.flip()
    uv = me.uv_layers.new(name='UVMap')
    for loop in me.loops: uv.data[loop.index].uv = (loop.vertex_index % 2, (loop.vertex_index // 2) / (len(rows) - 1))
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    return finish(o, name, mat)

BELT_Z = .38
def belt_frame_side(x, sign):
    box('Side channel', (x, 0, .38), (.08, 1.98, .2), 'metal', 0)
    box('Rail cap', (x, 0, .49), (.12, 1.98, .025), 'orange', 0)
    box('Rubber skirt', (x - sign * .055, 0, .43), (.03, 1.98, .07), 'dark', 0)

def belt_leg(x0, y0, x1, y1):
    beam('Support leg', (x0, y0, .29), (x1, y1, .03), .07, 'dark', False)
    box('Leg foot', (x1, y1, .015), (.18, .16, .03), 'metal', 0)

# --- Conveyor segment: 2 x 2 m. Items travel toward -Y. Kept light; colonies need many. ---
def conveyor():
    # The tread is a separate node; its v coordinate increases toward -Y so scrolling matches the items.
    uv_strip('Belt', [((-.55, y, BELT_Z), (.55, y, BELT_Z)) for y in (.97, 0, -.97)], 'belt')
    box('Bed plate', (0, 0, .31), (1.12, 1.9, .07), 'dark', 0)
    for x, sign in [(-.62, -1), (.62, 1)]:
        belt_frame_side(x, sign)
        for y in [-.62, .62]: belt_leg(x, y, x * 1.12, y)
    for y in [-.62, .62]: beam('Leg brace', (-.68, y, .14), (.68, y, .14), .035, 'metal', False)
    for y in [-.95, .95]: cyl('End roller', (0, y, BELT_Z - .065), .065, 1.14, 'metal', 8, (0, math.pi / 2, 0))
    box('Drive motor', (.75, .1, .3), (.12, .26, .15), 'orange', 0)

# --- Storage crate: 2 x 2 m, belt inlets on every face. ---
def storage():
    box('Crate skid', (0, 0, .1), (1.85, 1.85, .2), 'dark', .04)
    box('Crate body', (0, 0, .85), (1.6, 1.6, 1.3), 'ivory', .08)
    box('Crate lid', (0, 0, 1.55), (1.7, 1.7, .14), 'dark', .04)
    box('Lid hatch', (0, 0, 1.64), (1.0, 1.0, .06), 'metal', .02)
    for x in [-.82, .82]:
        for y in [-.82, .82]: box('Corner post', (x, y, .85), (.14, .14, 1.4), 'orange', .02)
    for rot in range(4):
        a = rot * math.pi / 2; dx, dy = math.sin(a), -math.cos(a)
        box('Inlet slot', (dx * .81, dy * .81, .52), (.7 if dy else .04, .04 if dy else .7, .32), 'dark', .01)
    box('Fill indicator', (0, -.815, 1.15), (.5, .02, .07), 'light', .005)
    status_lamp(-.62, .62, 1.67)

# --- Hopper revision: discharge collar moved over the left cell to meet the belt grid. ---
def hopper():
    box('Base skid', (0, 0, .16), (3.4, 3.4, .3), 'dark', .06)
    for x in [-1.2, 1.2]:
        for y in [-1.2, 1.2]: beam('Hopper leg', (x, y, .3), (x, y, 1.8), .16, 'metal')
    vs = [(-1.4,-1.4,2.2),(1.4,-1.4,2.2),(1.4,1.4,2.2),(-1.4,1.4,2.2),(-.5,-.5,1),(.5,-.5,1),(.5,.5,1),(-.5,.5,1)]
    mesh_object('Open tapered hopper', vs, [(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)], 'ivory')
    for a, b in [((-1.45,-1.45,2.2),(1.45,-1.45,2.2)),((1.45,-1.45,2.2),(1.45,1.45,2.2)),((1.45,1.45,2.2),(-1.45,1.45,2.2)),((-1.45,1.45,2.2),(-1.45,-1.45,2.2))]: beam('Rolled top lip', a, b, .13, 'orange')
    box('Discharge housing', (-.45, -.45, .65), (1.25, 1.45, .6), 'dark', .04)
    box('Conveyor output collar', (-1, -1.4, .62), (1.0, .3, .62), 'orange', .04)
    box('Output mouth', (-1, -1.56, .6), (.78, .04, .38), 'dark', .01)
    for x in [-.4, 0, .4]: beam('Top safety grate', (x, -1.3, 2.19), (x, 1.3, 2.19), .025, 'metal')
    box('Dock charge pad', (1.62, .4, .2), (.14, .9, .3), 'orange', .02)
    box('Dock charge light', (1.70, .4, .3), (.02, .5, .06), 'light', .005)
    # Fill gauge on the front-right leg, and a beacon on a mast at the back corner.
    box('Gauge backplate', (1.2, -1.3, 1.08), (.3, .04, 1.0), 'dark', .01)
    status_level(1.2, -1.335, .66, .84)
    status_lamp(-1.62, 1.62, 2.5, .3)

STATUS = [('Lamp', (0, 0, 0))]
layout = []
layout += export_asset('rover', rover, (-9, 0, 0), parts=[('Wheel_*', None), ('Drill', (0, -1.05, .7)), ('Cargo', (0, .5, .79))] + STATUS)
layout += export_asset('processor', processor, (-3, 0, 0), parts=STATUS)
layout += export_asset('conveyor', conveyor, (3, -2, 0), parts=[('Belt', (0, 0, 0))])
layout += export_asset('storage', storage, (3, 2, 0), parts=STATUS)
layout += export_asset('hopper', hopper, (7.5, 0, 0), parts=STATUS + [('Level', (1.2, -1.335, .66))])

scene.world = bpy.data.worlds.new('Production library environment')
scene.world.use_nodes = True
background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs[0].default_value = (.16, .2, .27, 1); background.inputs[1].default_value = .4
bpy.ops.object.light_add(type='SUN', location=(0, 0, 20)); sun = bpy.context.object; sun.rotation_euler = (.45, -.5, -.55); sun.data.energy = 3
bpy.ops.object.light_add(type='AREA', location=(0, -10, 15)); area = bpy.context.object; area.data.energy = 1800; area.data.shape = 'DISK'; area.data.size = 15
bpy.ops.object.camera_add(location=(18, -24, 19)); camera = bpy.context.object
camera.rotation_euler = (Vector((-1, 0, 1)) - camera.location).to_track_quat('-Z', 'Y').to_euler(); camera.data.type = 'ORTHO'; camera.data.ortho_scale = 24; scene.camera = camera
for o in (sun, area, camera): created['objects'].append(o)
engines = {e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
for engine in ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES']:
    if engine in engines: scene.render.engine = engine; break
scene.render.resolution_x = 1600; scene.render.resolution_y = 1000
scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = os.path.join(OUT, 'production-library.png')
if RENDER: bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(os.path.join(OUT, 'production-library.blend'), {scene}, fake_user=True)

# Leave the user's open file as it was.
if not window: raise SystemExit
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
print('LUNAR_PRODUCTION_LIBRARY_READY', OUT)
