"""Author the crater expedition assets: the ice melter and the derelict robotic lander. Run inside Blender.

Front is -Y (game +Z). The melter covers a 1x2 cell footprint (2 m x 4 m) centred on the origin, with
its intake at +Y (game -Z, the input port). The lander's core is a separate node the runtime hides once
it is salvaged; the melter's heater is a separate node that glows while it works. Builds in a temporary
scene, writes expedition-library.blend and removes it so the open file is left untouched."""
import bpy, bmesh, math, os
from mathutils import Vector

OUT = '/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
RENDER = os.environ.get('LUNAR_RENDER_PREVIEW', '1') == '1'
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('Lunar expedition asset library')
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

M = {
 'ivory': material('Lunar • ceramic ivory', (.78,.79,.71), .15,.42),
 'dark': material('Lunar • graphite structure', (.045,.065,.08), .45,.45),
 'orange': material('Lunar • burnt orange safety', (.8,.21,.045), .15,.45),
 'metal': material('Lunar • brushed stainless', (.48,.57,.62), .78,.3),
 'water': material('Lunar • reclaimed water', (.06,.34,.56), .2,.08),
 'heat': material('Lunar • heater element glow', (1,.32,.06), .1,.4, 4),
 'foil': material('Lunar • aged gold insulation foil', (.55,.38,.12), .85,.42),
 'old': material('Lunar • sun-bleached old paint', (.55,.53,.47), .2,.7),
 'gouge': material('Lunar • torn metal shadow', (.02,.02,.025), .3,.8),
 'core': material('Lunar • processor core glow', (.25,.85,1), .2,.25, 3.5),
 'pv': material('Lunar • photovoltaic blue black', (.018,.055,.105), .45,.27),
}

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
    created['objects'].append(o); created['meshes'].append(o.data); objects.append(o)
    return o

def box(name, loc, size, mat='ivory', bevel=0, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.scale = size
    if rot: o.rotation_euler = rot
    return finish(o, name, mat, bevel)

def cyl(name, loc, radius, depth, mat='metal', vertices=16, rotation=None, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o = bpy.context.object
    if rotation: o.rotation_euler = rotation
    return finish(o, name, mat, 0, smooth)

def cone(name, loc, r1, r2, depth, mat, vertices=12, rotation=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=loc)
    o = bpy.context.object
    if rotation: o.rotation_euler = rotation
    return finish(o, name, mat)

def strut(name, a, b, radius, mat='metal'):
    """A thin cylinder from point a to point b."""
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=radius, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return finish(o, name, mat)

exec(open(os.path.join(os.path.dirname(OUT), 'blender', 'status_parts.py')).read())

def join(group, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in group: o.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    if len(group) > 1: bpy.ops.object.join()
    o = bpy.context.object; o.name = name
    scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return o

# --- Ice melter: intake chute at +Y (game -Z), insulated melt tank, water line out at -Y. ---
def melter():
    box('Skid', (0, 0, .1), (1.86, 3.86, .2), 'dark', .02)
    for x in (-.86, .86): box('Skid rail', (x, 0, .24), (.1, 3.7, .1), 'orange')
    # Intake: a receiving chute where the belt tips ice in.
    box('Intake chute', (0, 1.45, .62), (1.2, .8, .7), 'metal', .03)
    cone('Intake funnel', (0, 1.45, 1.12), .62, .38, .36, 'metal', 8, (0, 0, math.pi / 8))
    box('Intake lip', (0, 1.88, .5), (1.24, .06, .16), 'orange')
    box('Auger housing', (0, .82, .78), (.42, .7, .34), 'dark', .02)
    # Melt tank, lying along the footprint.
    cyl('Melt tank', (0, -.25, 1.0), .66, 2.0, 'ivory', 20, (math.pi / 2, 0, 0))
    for y in (-1.1, -.25, .6): cyl('Tank band', (0, y, 1.0), .675, .1, 'orange', 20, (math.pi / 2, 0, 0))
    cyl('Tank end cap', (0, -1.27, 1.0), .5, .06, 'metal', 20, (math.pi / 2, 0, 0))
    cyl('Sight glass', (.66, -.25, 1.05), .1, .9, 'water', 10, (math.pi / 2, 0, 0))
    for y in (-1.0, .5):
        box('Tank saddle', (0, y, .45), (1.1, .2, .5), 'dark')
    # Water line to the colony.
    cyl('Water riser', (-.55, -1.55, .7), .07, 1.1, 'metal', 8)
    cyl('Water line', (-.55, -1.82, .2), .07, .6, 'water', 8, (math.pi / 2, 0, 0))
    box('Control box', (.62, -1.62, .65), (.42, .34, .7), 'dark', .02)
    box('Gauge window', (.62, -1.798, .66), (.17, .02, .59), 'dark', 0)
    box('Vent stack', (-.3, .1, 1.82), (.16, .16, .5), 'metal')
    box('Vent cap', (-.3, .1, 2.1), (.28, .28, .05), 'dark')

def heater():
    for y in (-.75, -.25, .25):
        cyl('Heater coil', (0, y, 1.0), .69, .05, 'heat', 20, (math.pi / 2, 0, 0))

# --- Derelict robotic lander, decades old. Panels pried open; the core bay faces -Y (game +Z). ---
TILT = (math.radians(4), math.radians(-6), 0)
def lander():
    body_z = 1.35
    cyl('Lander body', (0, 0, body_z), .92, .95, 'foil', 8, None, False)
    cyl('Lander deck', (0, 0, body_z + .52), .98, .1, 'old', 8, None, False)
    cyl('Lander base', (0, 0, body_z - .52), .8, .12, 'dark', 8, None, False)
    # Legs: struts from the body to footpads; one has buckled and its pad sunk.
    for i, a in enumerate([math.radians(45 + 90 * k) for k in range(4)]):
        reach, drop = (1.65, .05) if i != 2 else (1.45, .35)
        foot = (math.cos(a) * reach, math.sin(a) * reach, .08 - drop * .2)
        top = (math.cos(a) * .7, math.sin(a) * .7, body_z - .3)
        mid = (math.cos(a) * .75, math.sin(a) * .75, body_z - .65)
        strut('Leg', top, foot, .055)
        strut('Leg brace', mid, foot, .04, 'old')
        cyl('Footpad', foot, .24, .07, 'metal', 10)
    # Broken high-gain antenna and a snapped solar wing.
    strut('Antenna mast', (.3, .2, body_z + .55), (.45, .35, body_z + 1.5), .045)
    cone('Antenna dish', (.62, .48, body_z + 1.55), .55, .08, .22, 'old', 14, (math.radians(55), 0, math.radians(30)))
    box('Solar wing', (1.35, -.3, body_z - .1), (1.3, .7, .04), 'pv', 0, (0, math.radians(38), math.radians(-12)))
    box('Wing hinge', (.88, -.2, body_z + .3), (.12, .5, .1), 'metal')
    # Core bay: an open hatch with its panel bent outward.
    box('Bay frame', (0, -.86, body_z), (.7, .14, .66), 'dark')
    box('Bay hatch', (-.62, -1.08, body_z + .05), (.62, .05, .6), 'foil', 0, (0, 0, math.radians(-58)))
    # Gouges: long parallel tears across the foil.
    for k in range(3):
        box('Gouge', (.55 - k * .14, -.62, body_z + .12 - k * .05), (.05, .42, .5), 'gouge', 0, (math.radians(18), 0, math.radians(-38)))
    for k in range(3):
        box('Gouge', (-.72, .3 + k * .14, body_z - .05 + k * .05), (.42, .05, .45), 'gouge', 0, (0, math.radians(15), math.radians(52)))
    # Panels torn off and dropped beside it.
    box('Torn panel', (-1.6, -.9, .03), (.7, .55, .03), 'foil', 0, (math.radians(4), math.radians(-3), math.radians(28)))
    box('Torn panel', (.4, -1.75, .05), (.5, .62, .03), 'foil', 0, (math.radians(10), 0, math.radians(-50)))
    box('Torn panel', (1.7, 1.2, .025), (.45, .4, .03), 'old', 0, (0, 0, math.radians(14)))

def core():
    cyl('Processor core', (0, -.84, 1.35), .2, .44, 'core', 12, (math.pi / 2, 0, 0))
    for y in (-.66, -1.0): cyl('Core collar', (0, y, 1.35), .23, .05, 'metal', 12, (math.pi / 2, 0, 0))

def export(name, groups):
    bpy.ops.object.select_all(action='DESELECT')
    for o in groups: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_apply=True, export_yup=True, export_animations=False)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in groups)
    print('LUNAR_ASSET', name, 'triangles', tris, 'nodes', len(groups))

ASSETS = {'melter': [('Melter', melter), ('Heater', heater), ('Lamp', lambda: status_lamp(-.8, 1.8, 1.95, .2)), ('Level', lambda: status_level(.62, -1.81, .4, .52, window=False))], 'lander': [('Lander', lander), ('Core', core)]}
library = {}
for asset, parts in ASSETS.items():
    nodes = []
    for piece, builder in parts:
        objects = []; builder(); nodes.append(join(objects, piece)); library[piece] = nodes[-1]
    if asset == 'lander':
        for n in nodes: n.rotation_euler = TILT
    export(asset, nodes)

# --- Preview ---
for name in ('Melter', 'Heater'): library[name].location = (-3.2, 0, 0)
for name in ('Lander', 'Core'): library[name].location = (2.2, 0, 0)
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0)); ground = bpy.context.object
ground.data.materials.append(material('Lunar • preview regolith', (.36,.34,.31), 0, .95)); created['objects'].append(ground); created['meshes'].append(ground.data)
scene.world = bpy.data.worlds.new('Expedition library environment')
scene.world.use_nodes = True
background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs[0].default_value = (.05, .06, .09, 1); background.inputs[1].default_value = .5
bpy.ops.object.light_add(type='SUN', location=(0, 0, 20)); sun = bpy.context.object; sun.rotation_euler = (.75, -.35, -.9); sun.data.energy = 4
bpy.ops.object.light_add(type='AREA', location=(0, -10, 12)); area = bpy.context.object; area.data.energy = 900; area.data.shape = 'DISK'; area.data.size = 12
bpy.ops.object.camera_add(location=(9, -13, 9)); camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 1)) - camera.location).to_track_quat('-Z', 'Y').to_euler(); camera.data.type = 'ORTHO'; camera.data.ortho_scale = 10.5; scene.camera = camera
for o in (sun, area, camera): created['objects'].append(o)
engines = {e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
for engine in ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES']:
    if engine in engines: scene.render.engine = engine; break
scene.render.resolution_x = 1400; scene.render.resolution_y = 900
scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = os.path.join(OUT, 'expedition-library.png')
if RENDER: bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(os.path.join(OUT, 'expedition-library.blend'), {scene}, fake_user=True)

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
print('LUNAR_EXPEDITION_LIBRARY_READY', OUT)
