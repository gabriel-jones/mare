"""Author the farm fittings: hydroponic rack, vertical farm, mushroom tray and mill.

Same conventions as build_modular.py: interior objects stand on the floor deck (z=0), front -Y (game +Z), one
two-metre square each (the vertical farm two, along Y). Each grower has a Plants node the runtime scales with
growth. Run with Blender --background --python, or inside Blender: it builds in a temporary scene and removes
everything it made, so the open file is left untouched."""
import bpy, math, os

OUT = '/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('Lunar farm asset library')
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
 'glass': material('Lunar • deep teal glazing', (.025,.14,.18), .55,.2),
 'light': material('Lunar • warm powered emission', (1,.61,.2), .1,.3, 3),
 'leaf': material('Lunar • potato leaf', (.13,.4,.1), 0,.75),
 'soil': material('Lunar • hydroponic substrate', (.11,.075,.05), 0,.95),
 'water': material('Lunar • reclaimed water', (.06,.34,.56), .2,.08),
 'grow': material('Lunar • grow light emission', (1,.5,.82), .1,.3, 2.5),
 'cap': material('Lunar • mushroom cap', (.72,.62,.48), 0,.7),
 'stem': material('Lunar • mushroom stem', (.86,.83,.74), 0,.8),
 'dim': material('Lunar • dim red work light', (1,.12,.05), .1,.3, 1.2),
 'grain': material('Lunar • milled grain', (.82,.66,.38), 0,.85),
 # The runtime renders this material translucent by name.
 'greenglass': material('Lunar • greenhouse glazing', (.5,.78,.76), .1,.06),
 'goo': material('Lunar • black goo', (.006,.006,.008), .2,.06),
 'vein': material('Lunar • goo vein glow', (1,.08,.03), .1,.3, 2.2),
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

def cyl(name, loc, radius, depth, mat='metal', vertices=16, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o = bpy.context.object
    if rotation: o.rotation_euler = rotation
    return finish(o, name, mat, 0, True)

def cone(name, loc, r1, r2, depth, mat, vertices=16, rotation=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=loc)
    o = bpy.context.object
    if rotation: o.rotation_euler = rotation
    return finish(o, name, mat, 0, True)

def blob(name, loc, radius, squash, mat, turn=0):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius, location=loc)
    o = bpy.context.object; o.scale = (1, 1, squash); o.rotation_euler = (0, 0, turn)
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

# --- Hydroponic rack: three shelves of channels under pink light, a reservoir below. ---
SHELVES = [.42, .98, 1.54]
def rack():
    for x in [-.78, .78]:
        for y in [-.42, .42]: box('Rack upright', (x, y, .95), (.06, .06, 1.9), 'metal', .01)
    box('Reservoir', (0, 0, .14), (1.5, .8, .26), 'ivory', .02)
    box('Reservoir window', (0, -.405, .15), (1.1, .01, .12), 'water')
    for z in SHELVES:
        box('Rack shelf', (0, 0, z), (1.62, .9, .04), 'dark')
        for y in [-.25, .05, .35]:
            box('Growing channel', (0, y, z + .06), (1.5, .16, .08), 'ivory', .01)
        for y in [-.25, .35]:
            box('Light bar', (0, y, z + .52), (1.5, .06, .03), 'dark')
            box('Shelf grow light', (0, y, z + .5), (1.46, .04, .015), 'grow')
    cyl('Feed riser', (.7, .44, .9), .03, 1.5, 'orange', 8)
    for y in [-.42, .42]: box('Rack top rail', (0, y, 1.9), (1.62, .06, .06), 'metal', .01)

def rack_plants():
    i = 0
    for z in SHELVES:
        for y in [-.25, .05, .35]:
            for x in [-.55, -.18, .18, .55]:
                blob('Rack seedling', (x, y, z + .2), .13, .8, 'leaf', i * .7); i += 1

# --- Vertical farm: a two-square tower of four tiers, lit from between. ---
TIERS = [.3, .74, 1.18, 1.62]
def tower():
    for x in [-.8, .8]:
        for y in [-1.8, 0, 1.8]: box('Tower frame', (x, y, .98), (.07, .07, 1.96), 'metal', .01)
    box('Tower base', (0, 0, .08), (1.7, 3.7, .16), 'dark')
    for z in TIERS:
        box('Tier tray', (0, 0, z), (1.5, 3.5, .1), 'ivory', .015)
        box('Tier substrate', (0, 0, z + .055), (1.4, 3.4, .02), 'soil')
        for x in [-.5, .5]: box('Tier light', (x, 0, z + .36), (.05, 3.3, .02), 'grow')
    for y in [-1.2, 0, 1.2]: box('Tower side rail', (.82, y, 1.0), (.03, .9, .04), 'orange')
    for x in [-.8, .8]: box('Tower crown rail', (x, 0, 1.98), (.08, 3.68, .07), 'dark', .01)
    for y in [-1.8, 1.8]: box('Tower crown rail', (0, y, 1.98), (1.68, .08, .07), 'dark', .01)
    cyl('Mist manifold', (-.75, 0, 1.9), .035, 3.5, 'metal', 8, (math.pi / 2, 0, 0))

def tower_plants():
    i = 0
    for z in TIERS:
        for y in [-1.45, -.95, -.45, .05, .55, 1.05, 1.5]:
            for x in [-.45, 0, .45]:
                cone('Wheat tuft', (x, y, z + .2), .09, .01, .3, 'leaf', 5, (0, 0, i)); i += 1

# --- Mushroom tray: a squat dark cabinet of damp substrate blocks under a dim red work light. ---
def cabinet():
    box('Tray cabinet', (0, .15, .35), (1.6, 1.0, .7), 'dark', .02)
    box('Tray lip', (0, .15, .71), (1.66, 1.06, .04), 'metal')
    for x in [-.5, 0, .5]:
        for y in [-.12, .42]: box('Substrate block', (x, y, .78), (.42, .42, .12), 'soil', .02)
    box('Humidity hood frame', (0, .62, 1.3), (1.62, .06, 1.2), 'metal')
    box('Hood', (0, .15, 1.88), (1.62, 1.0, .05), 'glass')
    box('Work light', (0, .15, 1.84), (1.0, .08, .03), 'dim')
    for x in [-.6, .6]: cyl('Mister', (x, .55, 1.6), .025, .4, 'orange', 6)
    box('Cabinet vent', (0, -.36, .35), (1.0, .01, .2), 'metal')

def mushrooms():
    i = 0
    for x in [-.5, 0, .5]:
        for y in [-.12, .42]:
            for dx, dy, h in [(-.1, -.06, .12), (.08, .07, .16), (.1, -.1, .09)]:
                cx, cy = x + dx, y + dy
                cyl('Mushroom stem', (cx, cy, .84 + h / 2), .025, h, 'stem', 6)
                blob('Mushroom cap', (cx, cy, .84 + h), .075 + h * .25, .45, 'cap', i); i += 1

# --- Mill: hopper on top, a grinding drum, a chute into a sack. ---
def mill():
    box('Mill plinth', (0, .2, .08), (1.4, 1.1, .16), 'dark')
    box('Mill body', (0, .3, .62), (1.0, .8, .9), 'ivory', .03)
    cone('Grain hopper', (0, .3, 1.42), .2, .48, .55, 'metal', 16)
    cyl('Hopper rim', (0, .3, 1.71), .5, .04, 'dark', 16)
    cyl('Grinding drum', (.56, .3, .8), .3, .14, 'metal', 20, (0, math.pi / 2, 0))
    cyl('Drum hub', (.64, .3, .8), .08, .06, 'orange', 10, (0, math.pi / 2, 0))
    box('Mill stripe', (0, -.105, .78), (1.0, .01, .06), 'orange')
    box('Output chute', (-.25, -.2, .45), (.24, .3, .12), 'metal', .01, (-.5, 0, 0))
    blob('Flour sack', (-.25, -.45, .2), .2, 1.05, 'grain')
    box('Mill screen', (.22, -.105, 1.0), (.34, .01, .2), 'glass')

# --- Goo vat: a sealed glass column on a heavy plinth; the goo inside (Level) rises with the stock. ---
def vat():
    box('Vat plinth', (0, .1, .16), (1.5, 1.4, .32), 'dark', .02)
    box('Plinth stripe', (0, -.605, .2), (1.5, .01, .06), 'orange')
    cyl('Vat glass', (0, .1, .98), .56, 1.3, 'greenglass', 28)
    for z in [.36, 1.6]: cyl('Vat ring', (0, .1, z), .62, .1, 'metal', 28)
    for a in range(4):
        x, y = math.cos(a * math.pi / 2 + .4) * .6, .1 + math.sin(a * math.pi / 2 + .4) * .6
        box('Vat rib', (x, y, .98), (.06, .06, 1.24), 'dark')
    cyl('Vat lid', (0, .1, 1.7), .5, .1, 'dark', 24)
    cone('Vat dome', (0, .1, 1.82), .42, .12, .16, 'metal', 24)
    for a in range(4):
        box('Lid clamp', (math.cos(a * math.pi / 2) * .58, .1 + math.sin(a * math.pi / 2) * .58, 1.68), (.12, .12, .14), 'orange', .01)
    cyl('Vent stack', (.38, .48, 1.92), .06, .3, 'metal', 8)
    cyl('Feed pipe', (-.45, .62, 1.1), .05, 1.4, 'orange', 8)
    box('Vat panel', (.55, -.5, .55), (.3, .06, .3), 'ivory', .01)
    box('Vat screen', (.55, -.535, .58), (.2, .01, .12), 'vein')

def goo_level():
    cyl('Level', (0, .1, .75), .5, 1.5, 'goo', 24)
    for i, (x, y, z) in enumerate([(.3, -.3, .9), (-.35, -.2, 1.15), (.1, -.47, .55)]):
        cyl('Goo vein', (x, y + .1, z), .03, .35, 'vein', 6, (0, .4 * (i - 1), 0))

INTERIOR = {
    'hydrorack': [('Rack', rack), ('Plants', rack_plants), ('Lamp', lambda: status_lamp(.78, -.42, 1.95))],
    'verticalfarm': [('Tower', tower), ('Plants', tower_plants), ('Lamp', lambda: status_lamp(.8, -1.8, 2.0))],
    'mushroomtray': [('Cabinet', cabinet), ('Plants', mushrooms), ('Lamp', lambda: status_lamp(-.72, .62, 1.9))],
    'goovat': [('Vat', vat), ('Level', goo_level), ('Lamp', lambda: status_lamp(.62, .62, 1.5, .32))],
    'mill': [('Mill', mill), ('Lamp', lambda: status_lamp(-.55, .62, 1.3, .16))],
}

def export(name, groups):
    bpy.ops.object.select_all(action='DESELECT')
    for o in groups: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_apply=True, export_yup=True, export_animations=False)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in groups)
    print('LUNAR_ASSET', name, 'triangles', tris, 'nodes', len(groups))

try:
    for asset, parts in INTERIOR.items():
        nodes = []
        for piece, builder in parts:
            objects = []; builder(); nodes.append(join(objects, piece))
        export(asset, nodes)
    if os.environ.get('LUNAR_FARM_LIBRARY'):
        bpy.data.libraries.write(os.environ['LUNAR_FARM_LIBRARY'], {scene}, fake_user=True)
finally:
    bpy.context.window.scene = previous_scene
    for o in list(scene.objects): bpy.data.objects.remove(o, do_unlink=True)
    for me in created['meshes']:
        try:
            if me.users == 0: bpy.data.meshes.remove(me)
        except ReferenceError: pass
    for m in created['materials']:
        if m.users == 0: bpy.data.materials.remove(m)
    bpy.data.scenes.remove(scene)
    print('LUNAR_FARM_RESTORED')
