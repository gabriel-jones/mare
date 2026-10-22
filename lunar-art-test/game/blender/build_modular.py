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

PIECES = [('Floor', floor_tile), ('Wall', wall), ('Window', window), ('Airlock', airlock), ('AirlockDoor', airlock_door),
          ('Corner', corner_post), ('Roof', roof_tile), ('RoofEdge', roof_edge), ('RoofCorner', roof_corner),
          ('RoofModule', roof_module), ('Cabinet', cabinet)]

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

objects = []; conveyor_corner()
corner_groups = {key: [o for o in objects if o.data.materials[0] == mat] for key, mat in M.items()}
corner_parts = [join(group, f'conveyor_corner_{key}') for key, group in corner_groups.items() if group]
export('conveyor-corner', corner_parts)

# --- Preview: an L-shaped joined complex assembled from the kit, plus the corner belt. ---
def place(piece, x, y, rot=0, mirror=False):
    o = kit[piece].copy(); scene.collection.objects.link(o); created['objects'].append(o)
    o.location = (x, y, 0); o.rotation_euler = (0, 0, rot)
    if mirror: o.scale.x = -1
    return o
for piece in kit.values(): piece.location = (0, 0, -50)
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
            for s in (-.5, .5): place('Window' if d in (1, 3) else 'Wall', mx + px * s, my + py * s, rot)
for door_x in (1, 5):
    place('AirlockDoor', door_x - .33, -1); place('AirlockDoor', door_x + .33, -1, 0, True)
for x, y in [(-1, -1), (7, -1), (7, 3), (3, 3), (3, 7), (-1, 7)]: place('Corner', x, y)
# Roof one module so both the open interior and the finished shell read in the preview.
for cx, cy in [(2, 0), (3, 0), (2, 1), (3, 1)]:
    place('Roof', cx * 2, cy * 2)
    for d, (dx, dy) in enumerate(dirs):
        if (cx + dx, cy + dy) not in cellset: place('RoofEdge', cx * 2 + dx, cy * 2 + dy, [0, math.pi / 2, math.pi, -math.pi / 2][d])
place('RoofModule', 5, 1)
for x, y in [(7, -1), (7, 3)]: place('RoofCorner', x, y)
place('Cabinet', 1, 7, math.pi)
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
