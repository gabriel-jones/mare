"""Author the Phase E space kit: fabricator, satellite assembler, electrolyser, propellant tank, robot
dock, rover bay, hauler robot and satellite. Run inside Blender. Builds in a temporary scene, writes only
that scene to space-library.blend, and removes it again so the open file is left untouched."""
import bpy, bmesh, math, os
from mathutils import Vector

OUT = '/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
RENDER = os.environ.get('LUNAR_RENDER_PREVIEW', '1') == '1'
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('Lunar space asset library')
bpy.context.window.scene = scene
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
 'gold': material('Lunar • gold thermal foil', (.85,.55,.16), .9,.32),
 'cyan': material('Lunar • electrolysis glow', (.25,.8,1), .1,.25, 2.5),
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

def beam(name, a, b, width, mat='dark'):
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(a + b) / 2)
    o = bpy.context.object; o.scale = (width, width, (b - a).length)
    o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return finish(o, name, mat, min(width * .15, .025))

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
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_apply=True, export_yup=True, export_animations=False)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in result)
    print('LUNAR_ASSET', name, 'triangles', tris, 'nodes', len(result))
    for o in result:
        if o.parent is None: o.location += Vector(location)
    return result


def dome(name, loc, radius, mat='ivory', rings=6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=rings * 2, radius=radius, location=loc)
    o = bpy.context.object
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS'); bm.to_mesh(o.data); bm.free()
    return finish(o, name, mat, 0, True)

# --- Fabricator: 4 x 4 m. Materials in at back-left (+Y, x=-1), parts out at front-right (-Y, x=+1). ---
def fabricator():
    box('Foundation skid', (0, 0, .15), (3.85, 3.85, .3), 'dark', .06)
    box('Work cell', (.15, .1, 1.15), (3.2, 2.9, 1.7), 'ivory', .1)
    box('Work cell roof', (.15, .1, 2.06), (3.35, 3.05, .14), 'dark', .04)
    box('Inspection window', (.35, -1.36, 1.25), (2.1, .06, .9), 'glass', .03)
    box('Window frame', (.35, -1.34, 1.25), (2.3, .04, 1.1), 'dark', .02)
    # Gantry arm visible through the window and rising above the roof.
    for x in [-.9, 1.4]: beam('Gantry post', (x, -.2, 2.1), (x, -.2, 2.75), .12, 'metal')
    beam('Gantry rail', (-1.0, -.2, 2.75), (1.5, -.2, 2.75), .16, 'orange')
    box('Gantry carriage', (.4, -.2, 2.6), (.42, .42, .3), 'dark', .04)
    beam('Tool head', (.4, -.2, 2.45), (.4, -.2, 2.15), .08, 'metal')
    # Feed hopper over the input chute.
    frustum('Feed hopper', 1.6, 2.5, .25, .25, .55, .5, 'ivory', -1, 1.45, False)
    for a, b in [((-1.57,.93,2.5),(-.43,.93,2.5)),((-.43,.93,2.5),(-.43,1.97,2.5)),((-.43,1.97,2.5),(-1.57,1.97,2.5)),((-1.57,1.97,2.5),(-1.57,.93,2.5))]: beam('Feed rim', a, b, .08, 'orange')
    box('Input chute', (-1, 1.8, .62), (1.0, .4, .62), 'orange', .04)
    box('Input chute mouth', (-1, 2.0, .62), (.78, .04, .4), 'dark', .01)
    box('Output collar', (1, -1.75, .62), (1.0, .4, .62), 'orange', .04)
    box('Output chute mouth', (1, -1.96, .6), (.78, .04, .38), 'dark', .01)
    box('Recipe display', (-1.0, -1.36, 1.55), (.5, .05, .3), 'light', .01)
    for z in [.55, .75]: box('Vent slat', (1.76, .3, z), (.04, 1.6, .08), 'dark', .005)
    status_lamp(1.55, 1.5, 2.15)

# --- Satellite assembler: 4 x 6 m clean hall. Parts in at back-left (+Y, x=-1), satellite out at front-right. ---
def assembler():
    box('Foundation skid', (0, 0, .15), (3.85, 5.85, .3), 'dark', .06)
    box('Hall body', (0, .1, 1.45), (3.5, 5.0, 2.3), 'ivory', .12)
    box('Hall roof band', (0, .1, 2.66), (3.65, 5.15, .16), 'dark', .04)
    for y in [-1.7, -.6, .5, 1.6]: box('Roof rib', (0, y, 2.78), (3.4, .12, .1), 'metal', .02)
    # Big front bay door with safety chevrons, left of the output collar.
    box('Bay door frame', (-.55, -2.42, 1.3), (2.0, .1, 2.0), 'dark', .04)
    box('Bay door', (-.55, -2.47, 1.25), (1.75, .05, 1.8), 'metal', .02)
    for i in range(5): box('Door chevron', (-1.35 + i * .4, -2.5, .48), (.18, .02, .14), 'orange', 0)
    for y in [-1.2, 0, 1.2]:
        box('Clean-room window', (1.76, y, 1.7), (.06, .75, .5), 'glass', .02)
        box('Clean-room window', (-1.76, y + .3, 1.7), (.06, .75, .5), 'glass', .02)
    box('Gold foil test rig', (1.2, -1.2, 3.05), (.5, .5, .4), 'gold', .03)
    beam('Rig mast', (1.2, -1.2, 2.8), (1.2, -1.2, 3.6), .06, 'metal')
    cyl('Rig dish', (1.2, -1.2, 3.65), .32, .05, 'ivory', 16)
    box('Input chute', (-1, 2.78, .62), (1.0, .4, .62), 'orange', .04)
    box('Input chute mouth', (-1, 2.99, .62), (.78, .04, .4), 'dark', .01)
    box('Output collar', (1, -2.78, .62), (1.0, .4, .62), 'orange', .04)
    box('Output chute mouth', (1, -2.99, .6), (.78, .04, .38), 'dark', .01)
    box('Hall light strip', (0, -2.48, 2.45), (2.6, .03, .07), 'light', .005)
    status_lamp(-1.55, 2.4, 2.9)

# --- Electrolyser: 2 x 4 m. Cell stack splitting water, hydrogen and oxygen bottles. ---
def electrolyser():
    box('Foundation skid', (0, 0, .12), (1.85, 3.85, .24), 'dark', .05)
    box('Cell stack', (0, -.9, .85), (1.3, 1.5, 1.2), 'ivory', .08)
    for i in range(6): box('Stack plate', (0, -1.55 + i * .26, .85), (1.36, .05, 1.26), 'dark', .005)
    box('Stack window', (0, -1.66, .9), (.8, .03, .5), 'cyan', .01)
    cyl('Hydrogen bottle', (-.35, .75, 1.25), .42, 1.9, 'ivory', 18)
    dome('Hydrogen dome', (-.35, .75, 2.2), .42)
    cyl('Hydrogen band', (-.35, .75, 1.6), .44, .1, 'orange', 18)
    cyl('Oxygen bottle', (.45, 1.45, .95), .32, 1.3, 'ivory', 16)
    dome('Oxygen dome', (.45, 1.45, 1.6), .32)
    cyl('Oxygen band', (.45, 1.45, 1.2), .34, .08, 'metal', 16)
    beam('Gas line', (-.2, -.2, 1.25), (-.3, .4, 1.25), .1, 'metal')
    beam('Gas line', (.3, -.2, 1.05), (.45, 1.15, 1.05), .08, 'metal')
    beam('Water inlet', (.7, -1.6, .35), (.7, 1.8, .35), .1, 'metal')
    status_lamp(-.7, -1.6, 1.65, .25)

# --- Propellant tank: 4 x 4 m. Two hydrolox spheres on a skid, with a fill gauge. ---
def tank():
    box('Foundation skid', (0, 0, .15), (3.85, 3.85, .3), 'dark', .06)
    for x, r in [(-.85, .95), (.95, .78)]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=22, ring_count=12, radius=r, location=(x, .25, r + .65)); finish(bpy.context.object, 'Propellant sphere', 'ivory', 0, True)
        cyl('Equator band', (x, .25, r + .65), r + .03, .1, 'orange', 22)
        for a in range(4):
            ang = a * math.pi / 2 + math.pi / 4
            beam('Sphere leg', (x + math.cos(ang) * r * .7, .25 + math.sin(ang) * r * .7, .3), (x + math.cos(ang) * r * .7, .25 + math.sin(ang) * r * .7, r + .5), .1, 'metal')
    beam('Feed manifold', (-1.7, -1.1, .55), (1.7, -1.1, .55), .16, 'metal')
    for x in [-.85, .95]: beam('Feed drop', (x, -1.1, .55), (x, .25, .75), .1, 'metal')
    box('Valve block', (-1.55, -1.1, .55), (.34, .34, .38), 'orange', .03)
    box('Gauge backplate', (1.45, -1.55, 1.05), (.3, .04, 1.0), 'dark', .01)
    status_level(1.45, -1.585, .63, .84)
    status_lamp(-1.55, 1.55, 2.4, .3)

# --- Robot dock: 4 x 4 m charging pad with arch and maintenance cabinet. ---
def dock():
    box('Pad slab', (0, 0, .1), (3.85, 3.85, .2), 'dark', .05)
    box('Pad deck', (.25, -.2, .22), (2.6, 2.6, .05), 'floor', .01)
    for i in range(6): box('Deck chevron', (-.9 + i * .45, -1.45, .26), (.22, .16, .02), 'orange', 0)
    for x in [-1.05, 1.55]: beam('Charge arch post', (x, .9, .2), (x, .9, 2.1), .16, 'ivory')
    beam('Charge arch beam', (-1.15, .9, 2.12), (1.65, .9, 2.12), .2, 'ivory')
    box('Charge head', (.25, .9, 1.9), (.7, .4, .2), 'dark', .03)
    box('Charge glow', (.25, .9, 1.79), (.5, .3, .02), 'light', .005)
    box('Maintenance cabinet', (-1.5, -.6, .85), (.6, 1.6, 1.3), 'ivory', .06)
    box('Cabinet screen', (-1.19, -.6, 1.15), (.03, .7, .35), 'glass', .01)
    box('Parts rack', (-1.5, 1.2, .6), (.6, .9, .8), 'dark', .04)
    for z in [.4, .7]: box('Rack shelf', (-1.5, 1.2, z), (.65, .95, .04), 'metal', .005)
    status_lamp(1.55, .9, 2.25)

# --- Rover bay: 4 x 4 m assembly garage, open toward -Y. ---
def roverbay():
    box('Foundation skid', (0, 0, .12), (3.85, 3.85, .24), 'dark', .05)
    for x in [-1.75, 1.75]: box('Side wall', (x, .2, 1.3), (.25, 3.3, 2.1), 'ivory', .08)
    box('Back wall', (0, 1.75, 1.3), (3.75, .25, 2.1), 'ivory', .08)
    vs = [(-1.95, -1.6, 2.35), (1.95, -1.6, 2.35), (1.95, 1.95, 2.35), (-1.95, 1.95, 2.35), (-1.95, -1.6, 2.6), (1.95, -1.6, 2.6), (1.95, 1.95, 2.6), (-1.95, 1.95, 2.6), (0, -1.6, 2.95), (0, 1.95, 2.95)]
    mesh_object('Arched roof', vs, [(0,1,2,3), (0,4,8,5,1), (3,2,6,9,7), (4,7,9,8), (5,8,9,6), (0,3,7,4), (1,5,6,2)], 'dark')
    box('Door header', (0, -1.62, 2.2), (3.75, .3, .35), 'orange', .03)
    box('Rolled door', (0, -1.55, 2.0), (3.1, .2, .14), 'metal', .02)
    box('Assembly lift', (0, .2, .3), (2.2, 2.4, .1), 'metal', .02)
    for x in [-.8, .8]: beam('Lift arm', (x, 1.2, .35), (x, 1.2, 1.4), .1, 'orange')
    beam('Hoist rail', (-1.6, .2, 2.15), (1.6, .2, 2.15), .1, 'metal')
    box('Hoist block', (.4, .2, 1.95), (.3, .3, .3), 'dark', .03)
    box('Bay floodlight', (0, 1.55, 2.0), (1.4, .04, .08), 'light', .005)
    status_lamp(1.6, -1.4, 2.4)

# --- Hauler: logistics robot with a flatbed; Cargo crate shows a load. Front is -Y. ---
def hauler():
    box('Chassis', (0, 0, .5), (1.0, 1.9, .26), 'dark', .05)
    for x in [-.6, .6]:
        for y in [-.65, .65]:
            cyl(f'Wheel_{"L" if x < 0 else "R"}{"F" if y < 0 else "B"}', (x * 1.05, y, .28), .28, .2, 'rubber', 14, (0, math.pi / 2, 0))
            cyl('Wheel hub', (x * 1.2, y, .28), .12, .04, 'orange', 10, (0, math.pi / 2, 0))
            box('Wheel fender', (x * 1.03, y, .66), (.3, .62, .06), 'ivory', .02)
    box('Sensor nose', (0, -.82, .78), (.9, .36, .32), 'ivory', .08)
    box('Nose stripe', (0, -1.0, .7), (.8, .03, .06), 'orange', .005)
    box('Sensor eye', (0, -1.0, .86), (.5, .03, .08), 'cyan', .005)
    box('Flatbed', (0, .2, .68), (1.0, 1.35, .08), 'metal', .02)
    for x in [-.5, .5]: box('Bed rail', (x, .2, .78), (.05, 1.35, .14), 'orange', .01)
    box('Cargo crate', (0, .25, 1.0), (.75, .9, .5), 'ivory', .05)
    box('Cargo crate lid', (0, .25, 1.27), (.8, .95, .05), 'gold', .01)
    beam('Antenna', (.38, -.75, .95), (.38, -.75, 1.4), .04, 'metal')
    status_lamp(.38, -.75, 1.42)

# --- Satellite: compact bus, two solar wings and a dish. Built along +Z so it reads in orbit. ---
def satellite():
    box('Bus', (0, 0, 0), (.9, .9, 1.1), 'gold', .05)
    box('Bus deck', (0, 0, .58), (.95, .95, .06), 'dark', .02)
    beam('Wing boom', (-1.6, 0, 0), (1.6, 0, 0), .06, 'metal')
    for s in [-1, 1]:
        box('Solar wing', (s * 1.55, 0, 0), (1.9, .04, .8), 'pv', .01)
        for i in range(4): box('Wing frame', (s * (.75 + i * .53), 0, 0), (.03, .06, .82), 'metal', 0)
    beam('Dish mast', (0, 0, .6), (0, 0, .9), .05, 'metal')
    bpy.ops.mesh.primitive_cone_add(vertices=18, radius1=.42, radius2=.05, depth=.18, location=(0, 0, 1.0), rotation=(math.pi, 0, 0))
    finish(bpy.context.object, 'Dish', 'ivory', 0, True)
    box('Thruster block', (0, 0, -.6), (.35, .35, .12), 'dark', .02)

STATUS = [('Lamp', (0, 0, 0))]
layout = []
layout += export_asset('fabricator', fabricator, (-10, 0, 0), parts=STATUS)
layout += export_asset('assembler', assembler, (-5, 0, 0), parts=STATUS)
layout += export_asset('electrolyser', electrolyser, (-1, 0, 0), parts=STATUS)
layout += export_asset('tank', tank, (3, 0, 0), parts=STATUS + [('Level', (1.45, -1.585, .63))])
layout += export_asset('dock', dock, (8, 0, 0), parts=STATUS)
layout += export_asset('roverbay', roverbay, (-8, 6, 0), parts=STATUS)
layout += export_asset('hauler', hauler, (-3, 6, 0), parts=[('Wheel_*', None), ('Cargo', (0, .25, .75))] + STATUS)
layout += export_asset('satellite', satellite, (1, 6, 1.5))

scene.world = bpy.data.worlds.new('Space library environment')
scene.world.use_nodes = True
background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs[0].default_value = (.16, .2, .27, 1); background.inputs[1].default_value = .4
bpy.ops.object.light_add(type='SUN', location=(0, 0, 20)); sun = bpy.context.object; sun.rotation_euler = (.45, -.5, -.55); sun.data.energy = 3
bpy.ops.object.light_add(type='AREA', location=(0, -10, 15)); area = bpy.context.object; area.data.energy = 1800; area.data.shape = 'DISK'; area.data.size = 15
bpy.ops.object.camera_add(location=(16, -26, 22)); camera = bpy.context.object
camera.rotation_euler = (Vector((-1, 3, 1)) - camera.location).to_track_quat('-Z', 'Y').to_euler(); camera.data.type = 'ORTHO'; camera.data.ortho_scale = 28; scene.camera = camera
for o in (sun, area, camera): created['objects'].append(o)
engines = {e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
for engine in ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES']:
    if engine in engines: scene.render.engine = engine; break
scene.render.resolution_x = 1600; scene.render.resolution_y = 1000
scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = os.path.join(OUT, 'space-library.png')
if RENDER: bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(os.path.join(OUT, 'space-library.blend'), {scene}, fake_user=True)

# Leave the user's open file as it was.
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
print('LUNAR_SPACE_LIBRARY_READY', OUT)
