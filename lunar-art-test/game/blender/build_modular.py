"""Author the modular habitat kit and the curved conveyor corner. Run inside Blender.

Habitat pieces tile on the two-metre grid so joined modules read as one building: walls come in
one-metre segments centred on grid lines, exterior facing -Y (game +Z). Floor, roof and roof edge
tiles have no side bevels so neighbours meet without seams. Builds in a temporary scene, writes it
to modular-library.blend and removes it so the open file is left untouched."""
import bpy, bmesh, math, os
from mathutils import Vector

OUT = '/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
RENDER = os.environ.get('LUNAR_RENDER_PREVIEW', '1') == '1'
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('Lunar modular asset library')
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
 'pv': material('Lunar • photovoltaic blue black', (.018,.055,.105), .45,.27),
 'glass': material('Lunar • deep teal glazing', (.025,.14,.18), .55,.2),
 'light': material('Lunar • warm powered emission', (1,.61,.2), .1,.3, 3),
 'floor': material('Lunar • regolith composite', (.19,.22,.24), .1,.75),
 # The runtime renders this material translucent by name.
 'greenglass': material('Lunar • greenhouse glazing', (.5,.78,.76), .1,.06),
 'leaf': material('Lunar • potato leaf', (.13,.4,.1), 0,.75),
 'soil': material('Lunar • hydroponic substrate', (.11,.075,.05), 0,.95),
 'water': material('Lunar • reclaimed water', (.06,.34,.56), .2,.08),
 'grow': material('Lunar • grow light emission', (1,.5,.82), .1,.3, 2.5),
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

def mesh_object(name, vs, fs, mat):
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    return finish(o, name, mat)

def sector(name, center, r0, r1, z0, z1, a0, a1, mat, steps=10):
    """Annular prism between radii r0..r1 sweeping a0..a1 radians around `center` (X/Y)."""
    cx, cy = center; vs = []
    for i in range(steps + 1):
        a = a0 + (a1 - a0) * i / steps; c, s = math.cos(a), math.sin(a)
        vs += [(cx + r0 * c, cy + r0 * s, z0), (cx + r1 * c, cy + r1 * s, z0), (cx + r1 * c, cy + r1 * s, z1), (cx + r0 * c, cy + r0 * s, z1)]
    fs = []
    for i in range(steps):
        a, b = i * 4, (i + 1) * 4
        fs += [(a+3, a+2, b+2, b+3), (a, b, b+1, a+1), (a+1, b+1, b+2, a+2), (a, a+3, b+3, b)]
    fs += [(0, 1, 2, 3), (steps*4+3, steps*4+2, steps*4+1, steps*4)]
    return mesh_object(name, vs, fs, mat)

def join(group, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in group: o.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    if len(group) > 1: bpy.ops.object.join()
    o = bpy.context.object; o.name = name
    scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return o

# --- Habitat kit. Wall pieces span x -0.5..0.5 on the grid line y=0. ---
WALL_TOP = 2.12

def floor_tile():
    box('Foundation', (0, 0, -.25), (2.0, 2.0, .7), 'dark')
    box('Floor deck', (0, 0, .115), (2.0, 2.0, .03), 'floor')
    box('Floor grate', (0, 0, .132), (.62, .62, .006), 'metal')

def wall_base():
    box('Exterior base trim', (0, -.125, .27), (1.0, .03, .3), 'dark')
    box('Interior wainscot', (0, .122, .45), (1.0, .02, .62), 'floor')

def wall():
    box('Wall panel', (0, 0, 1.12), (1.0, .23, 2.0), 'ivory')
    box('Exterior seam', (0, -.118, 1.48), (1.0, .012, .04), 'dark')
    wall_base()

def window():
    box('Window sill wall', (0, 0, .48), (1.0, .23, .72), 'ivory')
    box('Window lintel', (0, 0, 1.93), (1.0, .23, .38), 'ivory')
    for z in [.87, 1.71]: box('Window frame', (0, 0, z), (1.0, .26, .06), 'dark')
    for x in [-.48, .48]: box('Window mullion', (x, 0, 1.29), (.04, .26, .8), 'dark')
    box('Pressure glazing', (0, 0, 1.29), (.92, .04, .78), 'glass')
    wall_base()

def airlock():
    """Two-metre airlock frame: 1.3 m clear opening between orange jambs."""
    for x in [-.825, .825]:
        box('Airlock jamb wall', (x, 0, 1.12), (.35, .23, 2.0), 'ivory')
        box('Exterior base trim', (x, -.125, .27), (.35, .03, .3), 'dark')
    box('Airlock lintel', (0, 0, 1.98), (1.3, .23, .28), 'ivory')
    for x in [-.68, .68]:
        box('Airlock jamb', (x, -.05, 1.0), (.1, .36, 1.76), 'orange', .01)
        box('Interior jamb', (x, .13, 1.0), (.08, .04, 1.76), 'dark')
    box('Airlock header', (0, -.17, 1.97), (1.6, .1, .24), 'orange', .01)
    box('Airlock light', (0, -.225, 1.97), (.9, .02, .06), 'light')
    box('Airlock threshold', (0, -.12, .125), (1.36, .64, .03), 'metal')
    box('Airlock canopy', (0, -.32, 2.2), (1.8, .52, .08), 'dark', .01)

def airlock_door():
    """One sliding panel, origin at its bottom centre; the runtime mirrors it for the right leaf."""
    box('Door panel', (0, 0, .98), (.66, .06, 1.72), 'metal', .008)
    box('Door stripe', (0, -.035, .95), (.66, .01, .08), 'orange')
    box('Door porthole', (-.04, -.035, 1.45), (.28, .01, .28), 'glass')
    box('Door seal', (.31, 0, .98), (.04, .07, 1.72), 'dark')

def corner_post():
    box('Structural spine', (0, 0, 1.12), (.28, .28, 2.0), 'metal', .03)

def roof_tile():
    box('Roof slab', (0, 0, 2.22), (2.0, 2.0, .2), 'ivory')

def roof_edge():
    box('Roof lip', (0, -.06, 2.28), (2.0, .36, .34), 'ivory', .04)
    box('Roof gutter', (0, -.245, 2.2), (2.0, .02, .08), 'dark')

def roof_corner():
    box('Roof corner cap', (0, 0, 2.29), (.5, .5, .36), 'ivory', .05)

def roof_module():
    """Rooftop services centred on each module."""
    box('Roof service panel', (0, .25, 2.37), (2.6, 2.3, .1), 'dark', .02)
    box('Roof ventilation', (0, 1.0, 2.48), (1.2, .62, .14), 'metal', .02)
    for x in [-.42, -.14, .14, .42]: box('Roof vent rib', (x, 1.0, 2.56), (.07, .5, .04), 'dark')
    box('Roof solar skin', (-.55, -.05, 2.43), (1.2, .8, .03), 'pv')
    box('Roof stripe', (0, -1.25, 2.33), (2.6, .12, .02), 'orange')

def cabinet():
    """Interior utility wall unit; back edge of the piece sits on the wall line, room side +Y."""
    box('Utility cabinet', (0, .3, .72), (.9, .32, 1.16), 'ivory', .03)
    box('Cabinet screen', (0, .465, 1.0), (.42, .02, .24), 'glass')
    box('Cabinet status', (.3, .465, .62), (.1, .02, .04), 'light')
    box('Service conduit', (0, .17, 1.86), (1.9, .055, .055), 'orange')

def glass_wall():
    """Greenhouse glazing segment: low plinth, slim graphite frame, tall pane."""
    box('Glass plinth', (0, 0, .3), (1.0, .23, .36), 'ivory')
    box('Glass head rail', (0, 0, 2.06), (1.0, .2, .12), 'dark')
    box('Glass transom', (0, 0, 1.3), (1.0, .2, .04), 'dark')
    for x in [-.48, .48]: box('Glass mullion', (x, 0, 1.26), (.05, .2, 1.62), 'dark')
    box('Greenhouse pane', (0, 0, 1.28), (.92, .03, 1.5), 'greenglass')

def glass_roof():
    box('Glass roof pane', (0, 0, 2.18), (2.0, 2.0, .04), 'greenglass')
    box('Glass roof rib', (0, 0, 2.22), (2.0, .08, .1), 'dark')
    box('Glass roof rib', (0, 0, 2.22), (.08, 2.0, .1), 'dark')

def glass_roof_edge():
    box('Glass roof beam', (0, -.02, 2.17), (2.0, .22, .2), 'dark')

def airlock_floor():
    """Hazard markings and a drain grate laid over an airlock square's floor."""
    for y in [-.78, .78]: box('Airlock floor stripe', (0, y, .136), (1.7, .1, .008), 'orange')
    box('Airlock drain grate', (0, 0, .136), (1.1, .9, .008), 'metal')

PIECES = [('Floor', floor_tile), ('Wall', wall), ('Window', window), ('Airlock', airlock), ('AirlockDoor', airlock_door),
          ('Corner', corner_post), ('Roof', roof_tile), ('RoofEdge', roof_edge), ('RoofCorner', roof_corner),
          ('RoofModule', roof_module), ('Cabinet', cabinet), ('GlassWall', glass_wall), ('GlassRoof', glass_roof),
          ('GlassRoofEdge', glass_roof_edge), ('AirlockFloor', airlock_floor)]

# --- Interior objects: one grid square each, standing on the floor deck (z=0), front -Y (game +Z). ---
def grow_bed():
    box('Planter', (0, 0, .24), (1.62, 1.3, .48), 'ivory', .03)
    box('Planter rim', (0, 0, .49), (1.68, 1.36, .03), 'dark')
    box('Substrate', (0, 0, .47), (1.48, 1.16, .04), 'soil')
    for x in [-.78, .78]: box('Grow light post', (x, .58, .9), (.06, .06, 1.8), 'dark')
    box('Grow light housing', (0, .1, 1.82), (1.66, .9, .06), 'dark', .01)
    for y in [-.18, .1, .38]: box('Grow light strip', (0, y, 1.785), (1.5, .08, .02), 'grow')
    box('Irrigation line', (0, -.62, .55), (1.5, .04, .04), 'orange')

def plants():
    """Potato plants; the runtime scales this node with growth."""
    for i, (x, y) in enumerate([(-.5, -.35), (0, -.35), (.5, -.35), (-.5, .35), (0, .35), (.5, .35)]):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.24, location=(x, y, .66))
        o = bpy.context.object; o.scale = (1, 1, .75); o.rotation_euler = (0, 0, i * .9)
        finish(o, 'Potato plant', 'leaf')

def galley():
    box('Galley counter', (0, .5, .45), (1.7, .7, .9), 'ivory', .02)
    box('Galley worktop', (0, .48, .92), (1.78, .78, .05), 'metal')
    box('Hob', (-.42, .48, .953), (.62, .46, .016), 'dark')
    cyl('Cooking pot', (-.42, .48, 1.05), .15, .18, 'metal', 14)
    box('Galley splashback', (0, .86, 1.3), (1.7, .04, .7), 'dark')
    box('Galley screen', (.38, .835, 1.36), (.6, .01, .32), 'glass')
    box('Extractor hood', (-.42, .64, 1.86), (.78, .44, .14), 'metal', .02)
    box('Galley stripe', (0, .143, .78), (1.7, .01, .05), 'orange')
    for x in [-.43, .43]: box('Cupboard seam', (x, .143, .42), (.012, .01, .6), 'dark')

def meal_tray():
    box('Meal tray', (.42, .42, .955), (.52, .36, .02), 'orange')
    cyl('Meal bowl', (.32, .42, 1.0), .11, .07, 'ivory', 12)
    cyl('Meal cup', (.56, .44, 1.0), .05, .1, 'metal', 8)

def recycler():
    box('Recycler plinth', (0, .3, .06), (1.6, 1.1, .12), 'dark')
    for x in [-.42, .42]:
        cyl('Water tank', (x, .42, .82), .32, 1.4, 'metal', 16)
        cyl('Tank sight band', (x, .42, .72), .328, .55, 'water', 16)
        cyl('Tank cap', (x, .42, 1.55), .22, .08, 'dark', 12)
    box('Filter stack', (0, .02, .6), (.46, .34, .96), 'ivory', .02)
    box('Filter status', (0, -.155, .9), (.2, .01, .05), 'light')
    cyl('Manifold', (0, .42, 1.42), .05, 1.0, 'orange', 8, (0, math.pi / 2, 0))

INTERIOR = {'growbed': [('GrowBed', grow_bed), ('Plants', plants)], 'galley': [('Galley', galley), ('MealTray', meal_tray)], 'recycler': [('Recycler', recycler)]}

# --- Conveyor corner: enters from +X, turns 90 degrees and leaves toward -Y (game +Z). ---
def conveyor_corner():
    c, a0, a1 = (1, -1), math.pi / 2, math.pi
    sector('Belt bed', c, .35, 1.65, .25, .35, a0, a1, 'dark')
    sector('Belt surface', c, .42, 1.58, .35, .37, a0, a1, 'floor')
    for r0, r1 in [(.21, .35), (1.65, 1.79)]: sector('Side rail', c, r0, r1, .28, .48, a0, a1, 'metal')
    for r in [.28, 1.72]:
        a = math.radians(135); box('Belt leg', (c[0] + r * math.cos(a), c[1] + r * math.sin(a), .14), (.1, .1, .28), 'dark')
    cyl('End roller', (.92, 0, .33), .07, 1.2, 'metal', 8, (math.pi / 2, 0, 0))
    cyl('End roller', (0, -.92, .33), .07, 1.2, 'metal', 8, (0, math.pi / 2, 0))
    # Chevron at mid-arc, pointing along the direction of travel.
    a = math.radians(135); mx, my = c[0] + math.cos(a), c[1] + math.sin(a)
    t, n = Vector((-math.sin(a), math.cos(a))), Vector((math.cos(a), math.sin(a)))
    length, width, z = .9, .6, .375
    tip = Vector((mx, my)) + t * length / 2; back = Vector((mx, my)) - t * length / 2
    pts = [back + n * width / 2, back + t * width * .45, back - n * width / 2, tip]
    mesh_object('Travel chevron', [(p.x, p.y, z) for p in pts], [(0, 3, 1), (1, 3, 2)], 'orange')

def export(name, groups):
    bpy.ops.object.select_all(action='DESELECT')
    for o in groups: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_apply=True, export_yup=True, export_animations=False)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in groups)
    print('LUNAR_ASSET', name, 'triangles', tris, 'nodes', len(groups))

kit = {}
for piece, builder in PIECES:
    objects = []; builder(); kit[piece] = join(objects, piece)
export('habitat-kit', list(kit.values()))
interior = {}
for asset, parts in INTERIOR.items():
    nodes = []
    for piece, builder in parts:
        objects = []; builder(); nodes.append(join(objects, piece)); interior[piece] = nodes[-1]
    export(asset, nodes)

objects = []; conveyor_corner()
corner_groups = {key: [o for o in objects if o.data.materials[0] == mat] for key, mat in M.items()}
corner_parts = [join(group, f'conveyor_corner_{key}') for key, group in corner_groups.items() if group]
export('conveyor-corner', corner_parts)

# --- Preview: an L-shaped joined complex assembled from the kit, plus the corner belt. ---
library = {**kit, **interior}
def place(piece, x, y, rot=0, mirror=False, z=0):
    o = library[piece].copy(); scene.collection.objects.link(o); created['objects'].append(o)
    o.location = (x, y, z); o.rotation_euler = (0, 0, rot)
    if mirror: o.scale.x = -1
    return o
for piece in library.values(): piece.location = (0, 0, -50)
greenhouse = {(2, 0), (3, 0), (2, 1), (3, 1)}
cells = [(0, 0), (1, 0), (0, 1), (1, 1), (2, 0), (3, 0), (2, 1), (3, 1), (0, 2), (1, 2), (0, 3), (1, 3)]
cellset = set(cells)
dirs = [(0, -1), (1, 0), (0, 1), (-1, 0)]
for cx, cy in cells:
    place('Floor', cx * 2, cy * 2)
    for d, (dx, dy) in enumerate(dirs):
        if (cx + dx, cy + dy) in cellset: continue
        rot = [0, math.pi / 2, math.pi, -math.pi / 2][d]
        mx, my = cx * 2 + dx, cy * 2 + dy
        px, py = -dy, dx
        door = d == 0 and cx in (0, 2) and cy == 0
        if door:
            if cx in (0, 2): place('Airlock', mx + 1, my, rot)
        elif not (d == 0 and cx in (1, 3) and cy == 0):
            for s in (-.5, .5): place('GlassWall' if (cx, cy) in greenhouse else 'Window' if d in (1, 3) else 'Wall', mx + px * s, my + py * s, rot)
for door_x in (1, 5):
    place('AirlockDoor', door_x - .33, -1); place('AirlockDoor', door_x + .33, -1, 0, True)
for x, y in [(-1, -1), (7, -1), (7, 3), (3, 3), (3, 7), (-1, 7)]: place('Corner', x, y)
# Glaze the greenhouse wing; the habitat stays open so its interior reads in the preview.
for cx, cy in greenhouse:
    place('GlassRoof', cx * 2, cy * 2)
    for d, (dx, dy) in enumerate(dirs):
        if (cx + dx, cy + dy) not in cellset: place('GlassRoofEdge', cx * 2 + dx, cy * 2 + dy, [0, math.pi / 2, math.pi, -math.pi / 2][d])
for cx, cy in [(2, 0), (3, 0), (2, 1), (3, 1)]:
    place('GrowBed', cx * 2, cy * 2, 0, False, .13); place('Plants', cx * 2, cy * 2, 0, False, .13)
place('Galley', 0, 6, 0, False, .13); place('MealTray', 0, 6, 0, False, .13)
place('Recycler', 2, 6, 0, False, .13)
place('AirlockFloor', 0, 0)
belt = [o for o in corner_parts]
for o in belt: o.location = (-6, -2, 0)

scene.world = bpy.data.worlds.new('Modular library environment')
scene.world.use_nodes = True
background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs[0].default_value = (.16, .2, .27, 1); background.inputs[1].default_value = .4
bpy.ops.object.light_add(type='SUN', location=(0, 0, 20)); sun = bpy.context.object; sun.rotation_euler = (.45, -.5, -.55); sun.data.energy = 3
bpy.ops.object.light_add(type='AREA', location=(0, -10, 15)); area = bpy.context.object; area.data.energy = 1800; area.data.shape = 'DISK'; area.data.size = 15
bpy.ops.object.camera_add(location=(16, -22, 18)); camera = bpy.context.object
camera.rotation_euler = (Vector((1, 2, 0)) - camera.location).to_track_quat('-Z', 'Y').to_euler(); camera.data.type = 'ORTHO'; camera.data.ortho_scale = 17; scene.camera = camera
for o in (sun, area, camera): created['objects'].append(o)
engines = {e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
for engine in ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES']:
    if engine in engines: scene.render.engine = engine; break
scene.render.resolution_x = 1600; scene.render.resolution_y = 1000
scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = os.path.join(OUT, 'modular-library.png')
if RENDER: bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(os.path.join(OUT, 'modular-library.blend'), {scene}, fake_user=True)

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
print('LUNAR_MODULAR_LIBRARY_READY', OUT)
