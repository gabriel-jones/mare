"""Mockups of the second launch site: three ground treatments (painted square, beacon ring, corner curbs), each
with the same fuelling tower and lines. Writes launchpad-v2a/b/c.glb beside the current pad without replacing it.

Run headless: Blender --background --factory-startup --python build_launch_site.py. Builds in a scene of its
own and removes it again, leaving any open file untouched."""
import bpy, math, os
from mathutils import Vector

OUT = '/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
window = bpy.context.window
previous_scene = window.scene if window else None
scene = bpy.data.scenes.new('Lunar launch site mockup')
if window: window.scene = scene
objects = []
created = {'objects': [], 'meshes': [], 'materials': []}


def material(name, color, metallic=0, roughness=.5, emission=0):
    if name in bpy.data.materials: return bpy.data.materials[name]
    m = bpy.data.materials.new(name); created['materials'].append(m)
    m.diffuse_color = (*color, 1); m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m


# The colony palette, by the same material names the other kits use.
M = {
    'ivory': material('Lunar • ceramic ivory', (.78, .79, .71), .15, .42),
    'dark': material('Lunar • graphite structure', (.045, .065, .08), .45, .45),
    'orange': material('Lunar • burnt orange safety', (.8, .21, .045), .15, .45),
    'metal': material('Lunar • brushed stainless', (.48, .57, .62), .78, .3),
    'glass': material('Lunar • deep teal glazing', (.025, .14, .18), .55, .2),
    'light': material('Lunar • warm powered emission', (1, .61, .2), .1, .3, 3),
    'paint': material('Lunar • pad paint white', (.86, .85, .78), 0, .8),
    'scorch': material('Lunar • scorched regolith', (.2, .19, .175), 0, .95),
    'gold': material('Lunar • gold thermal foil', (.85, .55, .16), .9, .32),
}


def finish(o, name, mat, bevel=0, smooth=False):
    o.name = name
    o.data.materials.append(M[mat])
    if bevel:
        mod = o.modifiers.new('Precision edge highlights', 'BEVEL'); mod.width = bevel; mod.segments = 1
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for f in o.data.polygons: f.use_smooth = smooth
    objects.append(o); created['objects'].append(o); created['meshes'].append(o.data)
    return o


def link(name, vs, fs):
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs); me.update()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    return o


def box(name, loc, size, mat='ivory', bevel=.03, rot=None):
    sx, sy, sz = (s / 2 for s in size)
    vs = [(x, y, z) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
    fs = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    o = link(name, vs, fs)
    if rot: o.rotation_euler = rot
    o.location = loc
    bpy.context.view_layer.update()
    o.data.transform(o.matrix_world); o.matrix_world.identity()
    return finish(o, name, mat, bevel if min(size) > bevel * 2.5 else 0)


def beam(name, a, b, width, mat='dark'):
    a, b = Vector(a), Vector(b)
    o = box(name, (0, 0, 0), (width, width, (b - a).length), mat, 0)
    q = (b - a).to_track_quat('Z', 'Y')
    o.data.transform(q.to_matrix().to_4x4()); o.data.transform(__import__('mathutils').Matrix.Translation((a + b) / 2))
    return o


def profile(name, rings, mat='ivory', sides=16, smooth=False, cx=0, cy=0, angle=0):
    """A turned shape from (z, radius) rings; flat faces keep the colony's faceted look."""
    vs = [(cx + r * math.cos(angle + i * math.tau / sides), cy + r * math.sin(angle + i * math.tau / sides), z) for z, r in rings for i in range(sides)]
    fs = [(j * sides + i, j * sides + (i + 1) % sides, (j + 1) * sides + (i + 1) % sides, (j + 1) * sides + i) for j in range(len(rings) - 1) for i in range(sides)]
    if rings[0][1] > 0: fs.append(tuple(reversed(range(sides))))
    if rings[-1][1] > 0: fs.append(tuple((len(rings) - 1) * sides + i for i in range(sides)))
    return finish(link(name, vs, fs), name, mat, 0, smooth)


def sector(name, r0, r1, a0, a1, z0, z1, mat, steps=4):
    """A flat ring sector between radii r0..r1 and angles a0..a1, from z0 to z1."""
    pts = [(r, a0 + (a1 - a0) * i / steps) for i in range(steps + 1) for r in (r0,)] + [(r1, a1 - (a1 - a0) * i / steps) for i in range(steps + 1)]
    n = len(pts)
    vs = [(r * math.cos(a), r * math.sin(a), z) for z in (z0, z1) for r, a in pts]
    fs = [tuple(reversed(range(n))), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    return finish(link(name, vs, fs), name, mat)


def paint(name, x, y, w, d, mat='paint', angle=0):
    """A painted line on the ground: thin enough to read as paint, thick enough not to flicker."""
    return box(name, (x, y, .025), (w, d, .03), mat, 0, (0, 0, angle) if angle else None)


def join_group(group, name):
    if not group: return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in group: o.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    bpy.ops.object.join(); o = bpy.context.object; o.name = name
    scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return o


# Moving parts join one node each with its origin at the pivot, so the game can swing them.
PIVOTS = {'Umbilical': (4.8, 0, 0)}


def export_asset(name, builder):
    global objects
    objects = []; builder()
    movers = {part: [o for o in objects if o.name.startswith(part + ' ')] for part in PIVOTS}
    moving = [o for g in movers.values() for o in g]
    regular = [o for o in objects if o not in moving]
    result = []
    for part, g in movers.items():
        o = join_group(g, part)
        if not o: continue
        scene.cursor.location = PIVOTS[part]; bpy.ops.object.origin_set(type='ORIGIN_CURSOR'); scene.cursor.location = (0, 0, 0)
        result.append(o)
    groups = {key: [o for o in regular if o.data.materials[0] == mat] for key, mat in M.items()}
    for key, g in groups.items():
        o = join_group(g, name + '_' + key)
        if o: result.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in result: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_apply=True, export_yup=True, export_animations=False)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in result)
    print('LUNAR_ASSET', name, 'triangles', tris, 'mesh_objects', len(result))
    for o in result:
        data = o.data; bpy.data.objects.remove(o, do_unlink=True)
        if data.users == 0: bpy.data.meshes.remove(data)


# ------------------------------------------------------------------ the pad: paint, lights and the fuel tower
W, D = 17.7, 13.7   # the reserved 9 x 7 cells; front is -Y


def puck(x, y, big=False):
    r = .2 if big else .16
    profile('Light puck', [(0, r), (.09, r), (.11, r * .75)], 'dark', 8, cx=x, cy=y)
    profile('Light lens', [(.11, r * .65), (.16, r * .5), (.17, 0)], 'light', 8, cx=x, cy=y)


def mast(x, y, sx, sy, height=3.0):
    box('Mast footing', (x, y, .1), (.5, .5, .2), 'dark', .04)
    profile('Mast pole', [(.2, .07), (height, .055)], 'metal', 8, cx=x, cy=y)
    profile('Mast collar', [(1.0, .085), (1.2, .085)], 'orange', 8, cx=x, cy=y)
    box('Mast head', (x, y, height + .12), (.42, .28, .26), 'dark', .04)
    box('Mast lamp', (x - sx * .12, y - sy * .08, height + .06), (.24, .16, .08), 'light', 0)


def pad_field():
    """A: a painted landing square on bare regolith, ground lights on its edge, lamp masts at the corners."""
    S = 4.6
    for sx in (-1, 1):
        for sy in (-1, 1):
            paint('Corner bracket', sx * (S - .9), sy * S, 1.9, .26, 'orange')
            paint('Corner bracket', sx * S, sy * (S - .9), .26, 1.9, 'orange')
    for t in [-1.6, 0, 1.6]:
        for sy in (-1, 1): paint('Square dash', t, sy * S, .9, .14, 'paint')
        for sx in (-1, 1): paint('Square dash', sx * S, t, .14, .9, 'paint')
    sector('Aim ring', 1.15, 1.32, 0, math.tau, .01, .04, 'orange', 40)
    paint('Aim cross', 0, 0, 1.4, .14); paint('Aim cross', 0, 0, .14, 1.4)
    for t in [-3.8, -2.3, 2.3, 3.8]:
        for sy in (-1, 1): puck(t, sy * (S + .45))
        for sx in (-1, 1): puck(sx * (S + .45), t)
    for i, y in enumerate([-5.6, -6.25]): paint('Approach chevron', -.25, y, .6, .16, 'orange', .6); paint('Approach chevron', .25, y, .6, .16, 'orange', -.6)
    for sx in (-1, 1):
        for sy in (-1, 1): mast(sx * (W / 2 - .7), sy * (D / 2 - .7), sx, sy)


def pad_beacons():
    """B: no paint at all, just scorched regolith and a ring of beacon bollards with an approach line."""
    for i in range(10):
        a = i * math.tau / 10 + math.tau / 20
        x, y = math.cos(a) * 5.9, math.sin(a) * 5.9
        if x > 3.6 and abs(y) < 1.8: continue
        profile('Bollard', [(0, .2), (.75, .17)], 'ivory', 8, cx=x, cy=y)
        profile('Bollard band', [(.45, .175), (.6, .175)], 'orange', 8, cx=x, cy=y)
        profile('Bollard cap', [(.75, .2), (.82, .2)], 'dark', 8, cx=x, cy=y)
        profile('Bollard lamp', [(.82, .13), (.95, .1), (.98, 0)], 'light', 8, cx=x, cy=y)
    for y in [-6.4, -5.5, -4.6]: puck(0, y - .1, True)


def pad_curbs():
    """C: four low L-shaped blast curbs at the corners with lamps set in them, a painted ring, floodlights behind."""
    sector('Aim ring', 3.3, 3.5, 0, math.tau, .01, .04, 'paint', 56)
    for i in range(12):
        a = i * math.tau / 12
        sector('Aim tick', 3.6, 4.1, a - .04, a + .04, .01, .04, 'orange', 1)
    S = 5.2
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('Blast curb', (sx * (S - .9), sy * S, .22), (2.2, .4, .44), 'ivory', .05)
            box('Blast curb', (sx * S, sy * (S - .9), .22), (.4, 2.2, .44), 'ivory', .05)
            box('Curb cap', (sx * (S - .9), sy * S, .46), (2.2, .42, .05), 'dark', 0)
            box('Curb cap', (sx * S, sy * (S - .9), .46), (.42, 2.2, .05), 'dark', 0)
            box('Curb stripe', (sx * (S - .9), sy * (S + .21), .3), (2.0, .02, .1), 'orange', 0)
            box('Curb lamp', (sx * S, sy * S, .48), (.3, .3, .05), 'light', 0)
    # Two floodlight masts behind the pad.
    for sx in (-1, 1):
        x, y = sx * 6.6, 5.8
        box('Flood footing', (x, y, .12), (.8, .8, .24), 'dark', .04)
        profile('Flood pole', [(.24, .12), (5.2, .09)], 'metal', 8, cx=x, cy=y)
        box('Flood bar', (x, y, 5.3), (1.5, .2, .12), 'dark', .02)
        for dx in (-.5, 0, .5):
            box('Flood housing', (x + dx, y - .1, 5.5), (.4, .28, .3), 'dark', .03)
            box('Flood lamp', (x + dx, y - .25, 5.48), (.32, .02, .22), 'light', 0)


def fuelling():
    """Shared by every pad: the manifold the tank lines feed, insulated lines to the tower, the tower and its arm."""
    box('Fuel manifold', (W / 2 - .9, 1.5, .45), (.8, 2.6, .5), 'ivory', .05)
    box('Manifold plinth', (W / 2 - .9, 1.5, .1), (1.0, 2.9, .2), 'dark', .04)
    for y in [.6, 1.5, 2.4]: box('Fuel coupling', (W / 2 - .42, y, .5), (.26, .34, .3), 'orange', .025)
    run = [(W / 2 - 1.3, 1.6), (6.6, 1.6), (5.6, .5)]
    for (ax, ay), (bx, by) in zip(run, run[1:]):
        for h, r, m, dy in [(.62, .12, 'ivory', 0), (.42, .085, 'metal', -.28)]:
            beam('Fuel line', (ax, ay + dy, h), (bx, by + dy, h), r * 2, m)
    for x in [7.6, 6.9]:
        box('Line trestle', (x, 1.5, .3), (.12, .7, .6), 'dark', 0)
        box('Line band', (x + .2, 1.6, .62), (.06, .27, .27), 'orange', 0)
    # Umbilical tower: a square lattice mast with a platform; its arm reaches the ship's hull above the aft flaps.
    tx, ty, top = 4.8, 0, 7.6
    box('Tower footing', (tx, ty, .12), (1.3, 1.3, .24), 'dark', .05)
    for cx in (-.42, .42):
        for cy in (-.42, .42): box('Tower post', (tx + cx, ty + cy, top / 2 + .2), (.12, .12, top), 'ivory', .02)
    levels = [1.5, 3.0, 4.5, 6.0]
    for z in levels:
        for cx, cy, w, d in [(0, -.42, .96, .08), (0, .42, .96, .08), (-.42, 0, .08, .96), (.42, 0, .08, .96)]:
            box('Tower ring', (tx + cx, ty + cy, z), (w, d, .08), 'dark', 0)
    for z0 in [.24] + levels:
        z1 = min(z0 + 1.5, top)
        for a, b in [((-.42, -.42), (.42, -.42)), ((.42, .42), (-.42, .42)), ((-.42, .42), (-.42, -.42)), ((.42, -.42), (.42, .42))]:
            beam('Tower brace', (tx + a[0], ty + a[1], z0), (tx + b[0], ty + b[1], z1), .05, 'dark')
    box('Tower platform', (tx, ty, top + .25), (1.25, 1.25, .1), 'dark', .02)
    for cx, cy, w, d in [(0, -.6, 1.25, .04), (0, .6, 1.25, .04), (.6, 0, .04, 1.25)]:
        box('Tower rail', (tx + cx, ty + cy, top + .55), (w, d, .04), 'orange', 0)
    profile('Tower beacon', [(top + .3, .1), (top + .5, .1), (top + .56, 0)], 'light', 8, cx=tx, cy=ty)
    box('Tower cabinet', (tx + .45, ty + .1, .65), (.35, .6, .8), 'ivory', .04)
    box('Cabinet stripe', (tx + .63, ty + .1, .9), (.02, .5, .08), 'orange', 0)
    az, reach = 6.2, tx - 1.55
    box('Umbilical arm', (tx - reach / 2, ty, az), (reach, .26, .22), 'ivory', .03)
    box('Umbilical underside', (tx - reach / 2, ty, az - .17), (reach - .2, .16, .1), 'dark', 0)
    box('Umbilical hinge', (tx - .5, ty, az), (.3, .4, .5), 'dark', .04)
    box('Umbilical coupler', (tx - reach - .05, ty, az - .05), (.18, .42, .4), 'orange', .03)
    for i in range(5):
        beam('Umbilical hose', (tx - .7 - i * .5, ty + .16, az - .1 - (.08 if i % 2 else 0)), (tx - 1.2 - i * .5, ty + .16, az - .1 - (.08 if i % 2 == 0 else 0)), .09, 'dark')
    box('Terminal pedestal', (6.6, -4.6, .5), (.45, .45, 1.0), 'dark', .05)
    box('Terminal housing', (6.6, -4.6, 1.17), (.8, .5, .4), 'ivory', .06)
    box('Terminal screen', (6.6, -4.86, 1.2), (.6, .02, .23), 'glass', 0)
    box('Terminal stripe', (6.6, -4.86, .99), (.62, .02, .05), 'orange', 0)


try:
    for key, ground in [('a', pad_field), ('b', pad_beacons), ('c', pad_curbs)]:
        export_asset('launchpad-v2' + key, lambda: (ground(), fuelling()))
finally:
    for m in created['materials']:
        if m.users == 0: bpy.data.materials.remove(m)
    if window and previous_scene: window.scene = previous_scene
    bpy.data.scenes.remove(scene)
