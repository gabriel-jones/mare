"""Render the HUD kit: console hardware, HUD button objects, resource objects and build-menu thumbnails.

Isometric objects share the inventory icon studio (same camera, lights and materials), so they sit with
the carried items. Flat console parts (keycaps, bezels, LCD glass, rack trays, work-order tags, armour
plates, the ration tube and status pips) are rendered straight down under the same lights, at their own
pixel sizes, for CSS border-image and layering.

Run with Blender --background --python. LUNAR_UI=key,key renders a subset. Builds in temporary scenes
and removes them, leaving any open file untouched.
"""
from pathlib import Path
import math
import os
import subprocess
import bpy
from mathutils import Vector

ROOT = Path('/Users/gabe/Documents/Playground/lunar-art-test/game')
UI = ROOT / 'assets/ui'
icons = {'__name__': 'lunar_ui_icons'}
exec(compile((ROOT / 'blender/build_inventory_icons.py').read_text(), 'build_inventory_icons.py', 'exec'), icons)
study = icons['study']
box, mesh, mat, area = (study[k] for k in ['box', 'mesh', 'mat', 'area'])
materials, beam, cylinder, sphere, tapered, ico = (icons[k] for k in ['materials', 'beam', 'cylinder', 'sphere', 'tapered', 'ico'])
ONLY = [k for k in os.environ.get('LUNAR_UI', '').split(',') if k]


def wanted(key):
    return not ONLY or key in ONLY


def extras(p):
    materials(p)
    p.setdefault('water', mat('water canister blue', (.06, .3, .62), .05, .25))
    p.setdefault('flask', mat('reagent teal', (.1, .55, .58), .05, .12, .35))
    p.setdefault('glass', mat('greenhouse glass', (.42, .62, .66), .1, .12))
    p.setdefault('ivory_shade', mat('ceramic ivory shade', (.6, .61, .55), .15, .5))
    p.setdefault('slate', mat('console slate', (.05, .062, .075), .35, .55))
    p.setdefault('regolith', mat('lunar regolith', (.11, .1, .088), 0, .97))
    return p


def prism(name, pts, z0, z1, material):
    """A flat outline (x, y) extruded upward from z0 to z1."""
    n = len(pts)
    verts = [(x, y, z0) for x, y in pts] + [(x, y, z1) for x, y in pts]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return mesh(name, verts, faces, material)


def upright_prism(name, pts, y0, y1, material):
    """An outline drawn in (x, z), extruded along y: badges on camera-facing faces."""
    n = len(pts)
    verts = [(x, y0, z) for x, z in pts] + [(x, y1, z) for x, z in pts]
    faces = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))] + [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)]
    return mesh(name, verts, faces, material)


# ---------------------------------------------------------------- isometric objects

def build_tool(p):
    extras(p)
    hx, hy = -.28, .42
    sphere('Build / hard hat shell', (hx, hy, .24), (.36, .38, .34), p['orange'], segments=28)
    cylinder('Build / hard hat brim', (hx, hy, .24), .46, .05, p['orange'], 32)
    cylinder('Build / hat band', (hx, hy, .3), .37, .06, p['ivory'], 32)
    box('Build / hat ridge', (hx, hy, .56), (.09, .5, .08), p['orange'], .035)
    box('Build / lamp', (hx, hy - .36, .42), (.14, .05, .09), p['cyan'], .02)
    beam('Build / wrench handle', (-.55, -.55, .09), (.36, .02, .09), .17, p['silver'])
    a = math.atan2(.57, .91)
    for side in [-1, 1]:
        box('Build / wrench jaw', (.47 + side * math.sin(a) * -.13 + math.cos(a) * .12, .09 + side * math.cos(a) * .13 + math.sin(a) * .12, .09),
            (.3, .1, .16), p['silver'], .03, a)
    box('Build / jaw root', (.43, .07, .09), (.12, .36, .16), p['silver'], .03, a)
    box('Build / grip', (-.36, -.43, .1), (.4, .21, .19), p['orange'], .03, a)


def crate_stack(p):
    extras(p)
    for i, (x, y, z, a) in enumerate([(-.31, .02, .26, 0), (.33, .06, .26, .07), (.02, .04, .78, -.09)]):
        box('Stock / crate', (x, y, z), (.58, .58, .52), p['ivory'], .045, a)
        box('Stock / crate band', (x, y, z), (.6, .6, .07), p['dark'], .02, a)
        box('Stock / crate lid', (x, y, z + .255), (.5, .5, .03), p['dark'], .02, a)
        box('Stock / label', (x + math.sin(a) * .3, y - math.cos(a) * .3, z - .1), (.24, .02, .12), p['orange'], .01, a)


def flask_rig(p):
    extras(p)
    box('Research / bench plate', (0, 0, .04), (1.05, .62, .08), p['dark'], .03)
    sphere('Research / flask body', (-.08, -.02, .38), (.33, .33, .3), p['flask'], segments=24)
    cylinder('Research / flask neck', (-.08, -.02, .78), .1, .34, p['flask'], 16)
    cylinder('Research / stopper', (-.08, -.02, .98), .12, .1, p['orange'], 16)
    cylinder('Research / label band', (-.08, -.02, .4), .335, .07, p['ivory'], 24)
    beam('Research / stand rod', (.36, .16, .08), (.36, .16, 1.08), .05, p['silver'])
    box('Research / clamp', (.16, .07, .82), (.38, .07, .06), p['silver'], .01, -.4)
    for i, (x, m) in enumerate([(-.45, 'cyan'), (-.32, 'orange')]):
        cylinder('Research / test tube', (x, .2, .26), .055, .38, p[m], 12)
        cylinder('Research / tube cap', (x, .2, .47), .06, .05, p['ivory'], 12)


def oxygen(p):
    extras(p)
    cylinder('Oxygen / tank', (0, 0, .5), .27, .86, p['ivory'], 28)
    sphere('Oxygen / dome', (0, 0, .93), (.27, .27, .16), p['ivory'], segments=28)
    cylinder('Oxygen / band', (0, 0, .62), .275, .12, p['cyan'], 28)
    cylinder('Oxygen / foot ring', (0, 0, .09), .28, .1, p['dark'], 28)
    cylinder('Oxygen / valve', (0, 0, 1.12), .06, .16, p['silver'], 12)
    cylinder('Oxygen / handwheel', (0, 0, 1.2), .14, .04, p['dark'], 16)


def water(p):
    extras(p)
    box('Water / canister', (0, 0, .45), (.66, .34, .86), p['water'], .07)
    box('Water / label band', (0, 0, .4), (.67, .35, .16), p['ivory'], .02)
    beam('Water / handle', (-.22, 0, .96), (.12, 0, .96), .08, p['dark'])
    for x in [-.22, .12]: box('Water / handle post', (x, 0, .9), (.06, .08, .1), p['dark'], .01)
    cylinder('Water / spout', (.24, 0, .94), .07, .12, p['ivory'], 12)
    cylinder('Water / cap', (.24, 0, 1.01), .08, .05, p['orange'], 12)


def power(p):
    extras(p)
    cylinder('Power / cell', (0, 0, .4), .38, .7, p['dark'], 6)
    cylinder('Power / top cap', (0, 0, .78), .34, .06, p['ivory'], 6)
    cylinder('Power / contact', (0, 0, .84), .12, .06, p['silver'], 12)
    bolt = [(.07, .3), (-.15, -.02), (-.01, -.02), (-.08, -.3), (.15, .04), (.01, .04)]
    upright_prism('Power / bolt', [(x, z + .4) for x, z in bolt], -.345, -.38, p['orange'])


def battery(p):
    extras(p)
    box('Battery / pack', (0, 0, .3), (1.0, .52, .56), p['dark'], .05)
    for x in [-.48, .48]: box('Battery / end cap', (x, 0, .3), (.1, .56, .6), p['ivory'], .03)
    for x in [-.25, .25]: cylinder('Battery / terminal', (x, 0, .62), .07, .08, p['silver'] if x < 0 else p['orange'], 12)
    for i in range(4): box('Battery / charge cell', (-.27 + i * .18, -.265, .3), (.13, .02, .28), p['cyan'] if i < 3 else p['navy'], .01)


def helmet(p):
    extras(p)
    sphere('Suit / helmet', (0, 0, .52), (.46, .46, .48), p['ivory'], segments=28)
    sphere('Suit / visor', (0, -.22, .5), (.36, .3, .3), p['gold'], segments=24)
    box('Suit / visor glint', (-.14, -.5, .6), (.14, .03, .04), p['ivory'], .01, .3)
    box('Suit / crest', (0, .02, .98), (.12, .62, .08), p['orange'], .03)
    cylinder('Suit / neck ring', (0, 0, .07), .37, .14, p['dark'], 28)


def ration(p):
    extras(p)
    box('Ration / foil pouch', (0, 0, .16), (.78, 1.02, .3), p['silver'], .12)
    box('Ration / label', (0, -.05, .32), (.56, .6, .02), p['orange'], .02)
    box('Ration / label stripe', (0, -.05, .335), (.56, .1, .01), p['ivory'], .005)
    box('Ration / tear strip', (0, .44, .2), (.8, .08, .26), p['ivory'], .02)


def comms(p):
    extras(p)
    box('Comms / body', (0, 0, .42), (.82, .56, .72), p['ivory'], .07)
    box('Comms / screen', (0, -.285, .48), (.62, .03, .42), p['dark'], .03)
    box('Comms / eye', (0, -.305, .52), (.38, .02, .08), p['cyan'], .01)
    for i in range(3): box('Comms / grille', (0, -.29, .2 + i * .045), (.42, .03, .018), p['dark'], 0)
    box('Comms / foot', (0, 0, .03), (.66, .46, .06), p['dark'], .02)
    beam('Comms / antenna', (.28, .12, .76), (.42, .18, 1.28), .04, p['silver'])
    sphere('Comms / beacon', (.43, .18, 1.31), (.06, .06, .06), p['orange'], segments=12)


def mine(p):
    extras(p)
    for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]:
        box('Mine / corner marker', (sx * .55, sy * .55 - sy * .14, .02), (.06, .3, .04), p['orange'], .01)
        box('Mine / corner marker', (sx * .55 - sx * .14, sy * .55, .02), (.3, .06, .04), p['orange'], .01)
    beam('Mine / survey stake', (.55, .55, 0), (.55, .55, .9), .04, p['silver'])
    box('Mine / flag', (.4, .55, .78), (.28, .02, .18), p['orange'], .01)
    for i, (loc, scale) in enumerate([((-.12, .05, .14), (.26, .24, .17)), ((.15, -.1, .12), (.22, .2, .14)), ((-.02, -.22, .1), (.18, .16, .11))]):
        ico('Mine / regolith clod', loc, scale, p['regolith'], i + 21)


def dismantle(p):
    extras(p)
    box('Dismantle / panel', (.05, .18, .12), (.9, .7, .1), p['ivory'], .04, .25)
    box('Dismantle / panel inset', (.05, .18, .18), (.66, .46, .03), p['dark'], .02, .25)
    for x, y in [(-.3, .5), (.42, .3), (-.3, -.1), (.42, -.2)]: cylinder('Dismantle / panel screw', (x * .9, y * .9, .2), .04, .03, p['silver'], 8)
    beam('Dismantle / crowbar', (-.66, -.5, .25), (.42, .18, .45), .12, p['dark'])
    beam('Dismantle / crowbar claw', (.42, .18, .45), (.58, .16, .22), .12, p['dark'])
    box('Dismantle / grip', (-.52, -.41, .28), (.34, .15, .15), p['orange'], .02, .56)
    for i, (x, y) in enumerate([(-.4, .3), (-.25, .42), (.5, -.3)]):
        cylinder('Dismantle / loose bolt', (x, y, .05), .06, .1, p['silver'], 6)


def greenhouse(p):
    extras(p)
    cylinder('Greenhouse / ring', (0, 0, .07), .66, .14, p['ivory'], 32)
    sphere('Greenhouse / dome', (0, 0, .14), (.6, .6, .55), p['glass'], segments=12)
    for a in range(4): box('Greenhouse / rib', (0, 0, .5), (.05, 1.22, .05), p['ivory'], .01, a * math.pi / 4)
    box('Greenhouse / planter', (.2, -.72, .1), (.6, .2, .2), p['dark'], .03)
    for i in range(3): sphere('Greenhouse / leaf', (-.02 + i * .2, -.72, .25), (.11, .08, .08), p['lettuce'], segments=10)


def airlock(p):
    extras(p)
    box('Airlock / frame', (0, 0, .55), (.92, .42, 1.1), p['ivory'], .05)
    box('Airlock / door', (0, -.215, .5), (.56, .02, .86), p['dark'], .02)
    cylinder('Airlock / porthole', (0, -.23, .72), .1, .02, p['navy'], 16, (math.pi / 2, 0, 0))
    for x in [-.38, .38]:
        for z in [.25, .5, .75]: box('Airlock / hazard stripe', (x, -.215, z), (.08, .02, .1), p['orange'], 0, 0)
    box('Airlock / lamp', (0, -.215, 1.0), (.24, .03, .06), p['cyan'], .01)


def padlock(p):
    extras(p)
    box('Lock / body', (0, 0, .32), (.7, .36, .56), p['orange'], .07)
    box('Lock / face plate', (0, -.185, .3), (.5, .02, .36), p['ivory'], .02)
    cylinder('Lock / keyhole', (0, -.2, .34), .05, .02, p['dark'], 12, (math.pi / 2, 0, 0))
    box('Lock / key slot', (0, -.2, .25), (.035, .02, .1), p['dark'], 0)
    for x in [-.22, .22]: beam('Lock / shackle leg', (x, 0, .58), (x, 0, .86), .09, p['silver'])
    beam('Lock / shackle top', (-.26, 0, .9), (.26, 0, .9), .09, p['silver'])


def building(name):
    def build(p):
        scene = bpy.context.scene
        before = set(scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(ROOT / 'assets' / (name + '.glb')))
        new = [o for o in scene.objects if o not in before]
        for o in new:
            if o.type == 'MESH':
                world = o.matrix_world.copy(); o.parent = None; o.matrix_world = world
        for o in new:
            if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
    return build


def android_figure(p):
    # The android in its rest pose, without the weapon meshes that ride on its hand.
    building('android')(p)
    for o in list(bpy.context.scene.objects):
        if o.name.split('.')[0] in ('Gun', 'Pistol', 'Blade'): bpy.data.objects.remove(o, do_unlink=True)
        else: o.scale = [v * 1.9 for v in o.scale]


def open_tray(p):
    # The grow bed in game is an open tray: drop the canopy, its posts and the status lamp.
    building('growbed')(p)
    import bmesh
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH' or o.name.startswith('Plants'): continue
        if o.name.startswith('Lamp'): bpy.data.objects.remove(o, do_unlink=True); continue
        bm = bmesh.new(); bm.from_mesh(o.data)
        high = [v for v in bm.verts if (o.matrix_world @ v.co).z > .62]
        bmesh.ops.delete(bm, geom=high, context='VERTS'); bm.to_mesh(o.data); bm.free()

def fence_run(p):
    building('fence')(p)
    for o in list(bpy.context.scene.objects):
        if o.name.split('.')[0].startswith(('Span1', 'Span3')): bpy.data.objects.remove(o, do_unlink=True)


HUD = [('build', build_tool), ('robots', building('rover')), ('stock', crate_stack), ('orbit', icons['satellite']),
       ('research', flask_rig), ('oxygen', oxygen), ('water', water), ('power', power), ('battery', battery),
       ('suit', helmet), ('food', ration), ('comms', comms), ('lock', padlock)]
GLB_BUILDINGS = ['solar', 'battery', 'hopper', 'habitat', 'growbed', 'hydrorack', 'verticalfarm', 'mushroomtray', 'galley',
                 'armory', 'goovat', 'mill', 'recycler', 'conveyor', 'processor', 'melter', 'storage', 'fabricator',
                 'assembler', 'electrolyser', 'tank', 'dock', 'roverbay', 'hauler', 'rover', 'xenolab', 'reactor', 'fuelcell', 'thermal', 'rtg', 'bioreactor', 'foundry', 'chargepad', 'turret']
BUILD = [(k, open_tray if k == 'growbed' else building(k)) for k in GLB_BUILDINGS] + [('fence', fence_run), ('android', android_figure), ('greenhouse', greenhouse), ('airlock', airlock), ('mine', mine), ('dismantle', dismantle)]


def studio_batch(entries, out, size):
    entries = [(k, b) for k, b in entries if wanted(k)]
    if not entries: return
    out.mkdir(parents=True, exist_ok=True)
    study['OUT'] = out
    study['build_study'](entries, library_name='ui-library.blend')
    try:
        for key, _ in entries:
            study['render_icon'](key)
            subprocess.run(['sips', '-Z', str(size), str(out / (key + '.png'))], check=True, capture_output=True)
    finally:
        study['cleanup']()
        study['CREATED'].clear()
        (out / 'ui-library.blend').unlink(missing_ok=True)


# ---------------------------------------------------------------- flat console parts (seen from straight above)

def palette():
    p = {
        'silver': mat('brushed lunar alloy', (.57, .65, .71), .78, .27),
        'ivory': mat('ceramic ivory', (.78, .79, .71), .15, .42),
        'dark': mat('graphite structure', (.045, .065, .08), .45, .45),
        'navy': mat('blue silicon package', (.022, .058, .105), .42, .25),
        'cyan': mat('status cyan', (.13, .61, .76), .1, .3, 1),
        'gold': mat('gold contacts', (.83, .52, .16), .72, .27),
        'relic': mat('ancient mineral shell', (.095, .07, .065), .32, .36),
        'ember': mat('alien relic ember', (1, .16, .025), .15, .3, 1.8),
    }
    extras(p)
    p['cyan_off'] = mat('unlit status glass', (.02, .07, .085), .2, .35)
    p['amber_lit'] = mat('lit amber lamp', (1, .36, .05), .1, .3, .9)
    p['amber_off'] = mat('unlit amber lamp', (.2, .08, .03), .2, .4)
    p['lcd'] = mat('readout glass', (.018, .05, .06), .25, .16)
    p['paste'] = mat('nutrient paste', (.33, .52, .12), 0, .32)
    p['tube_dark'] = mat('empty tube interior', (.03, .04, .045), .2, .3)
    p['highlight'] = mat('glass highlight', (.9, .95, .95), 0, .2, .4)
    return p


def screw(p, x, y, z):
    cylinder('Screw head', (x, y, z), .055, .03, p['silver'], 12)
    box('Screw slot', (x, y, z + .016), (.08, .014, .01), p['dark'], 0, .7)


def key(lit):
    def build(p):
        box('Key / well', (0, 0, 0), (1.0, 1.0, .08), p['slate'], .08)
        box('Key / cap', (0, 0, .11), (.9, .9, .16), p['ivory'], .1)
        box('Key / face', (0, .03, .195), (.72, .66, .01), p['navy'], .05)
        box('Key / status strip', (0, -.37, .2), (.32, .045, .015), p['cyan' if lit else 'cyan_off'], .01)
    return build


def bezel(p):
    box('Bezel / frame', (0, 0, 0), (2, 2, .16), p['ivory'], .07)
    box('Bezel / window lip', (0, 0, .08), (1.68, 1.68, .02), p['ivory_shade'], .03)
    box('Bezel / window', (0, 0, .09), (1.6, 1.6, .02), p['slate'], .03)
    for x in [-.88, .88]:
        for y in [-.88, .88]: screw(p, x, y, .085)


def lcd(p):
    box('Readout / rim', (0, 0, 0), (1, .75, .06), p['dark'], .04)
    box('Readout / glass', (0, 0, .035), (.86, .61, .01), p['lcd'], .02)


def tray(lit):
    def build(p):
        box('Rack / back plate', (0, 0, -.04), (1.0, 1.15, .05), p['slate'], 0)
        for y in [.51, -.51]: box('Rack / rail', (0, y, 0), (1.0, .13, .14), p['ivory'], .02)
        box('Rack / tray', (0, 0, .0), (.86, .84, .05), p['dark'], .05)
        box('Rack / tray floor', (0, .01, .03), (.76, .74, .01), p['navy'], .04)
        box('Rack / tray lip', (0, -.4, .05), (.84, .05, .05), p['ivory_shade'], .015)
        box('Rack / lip lamp', (0, -.4, .078), (.5, .022, .008), p['cyan' if lit else 'cyan_off'], .004)
        box('Rack / number tab', (-.3, .51, .085), (.24, .1, .03), p['dark'], .015)
    return build


def rail_end(p):
    box('Rack / back plate', (0, 0, -.04), (.3, 1.15, .05), p['slate'], 0)
    box('Rack / end block', (-.02, 0, .02), (.24, 1.15, .18), p['ivory'], .04)
    box('Rack / end cap', (-.09, 0, .12), (.06, .8, .03), p['orange'], .015)
    screw(p, .04, .4, .115); screw(p, .04, -.4, .115)


def tag(p):
    box('Work order / tag', (0, 0, 0), (4, 1.25, .08), p['orange'], .1)
    cylinder('Work order / grommet', (-1.66, 0, .05), .18, .03, p['silver'], 24)
    cylinder('Work order / hole', (-1.66, 0, .068), .09, .01, p['dark'], 20)
    box('Work order / card', (.4, 0, .05), (3.0, .95, .02), p['ivory'], .02)
    box('Work order / perforation', (-1.2, 0, .05), (.02, 1.0, .01), p['dark'], 0)


SHIELD = [(-.3, .36), (.3, .36), (.34, .08), (0, -.38), (-.34, .08)]


def plate(state):
    def build(p):
        if state == 'empty':
            prism('Plate / socket', [(x * 1.06, y * 1.06) for x, y in SHIELD], 0, .02, p['slate'])
            prism('Plate / socket floor', [(x * .86, y * .86) for x, y in SHIELD], .02, .03, p['dark'])
            return
        prism('Plate / armour', SHIELD, 0, .1, p['ivory'])
        prism('Plate / face', [(x * .78, y * .78 - .02) for x, y in SHIELD], .1, .115, p['ivory_shade'])
        box('Plate / stripe', (0, .29, .12), (.46, .05, .012), p['orange'], .005)
        if state == 'cracked':
            for a, b in [((-.2, .3), (-.05, .1)), ((-.05, .1), (-.12, -.06)), ((-.05, .1), (.14, -.02)), ((.14, -.02), (.08, -.22))]:
                beam('Plate / crack', (a[0], a[1], .125), (b[0], b[1], .125), .022, p['dark'])
            prism('Plate / chip', [(.34, .08), (.18, .2), (.26, -.06)], .1, .13, p['slate'])
    return build


def tube(full):
    def build(p):
        along = (0, math.pi / 2, 0)
        cylinder('Tube / fill' if full else 'Tube / interior', (0, 0, 0), .27, 3.1, p['paste' if full else 'tube_dark'], 24, along)
        box('Tube / glare', (0, .13, .27), (3.0, .035, .01), p['highlight'], 0)
        for x in [-1.7, 1.7]: cylinder('Tube / end cap', (x, 0, 0), .33, .3, p['dark'], 24, along)
        for x in [-.52, .52]: cylinder('Tube / band', (x, 0, 0), .285, .05, p['ivory'], 24, along)
        cylinder('Tube / nozzle', (-1.92, 0, 0), .12, .16, p['silver'], 16, along)
        box('Tube / crimp', (1.93, 0, 0), (.12, .56, .08), p['orange'], .02)
    return build


def pip(lit):
    def build(p):
        cylinder('Pip / bezel', (0, 0, 0), .21, .06, p['dark'], 24)
        sphere('Pip / lens', (0, 0, .03), (.14, .14, .06), p['amber_lit' if lit else 'amber_off'], segments=16)
    return build


# key, builder, width in units, height in units, pixels wide, pixels high
KIT = [('key', key(False), 1, 1, 128, 128), ('key-on', key(True), 1, 1, 128, 128), ('bezel', bezel, 2, 2, 256, 256),
       ('lcd', lcd, 1, .75, 128, 96), ('tray', tray(False), 1, 1.15, 128, 148), ('tray-on', tray(True), 1, 1.15, 128, 148),
       ('rail-end', rail_end, .3, 1.15, 40, 148), ('tag', tag, 4, 1.25, 512, 160),
       ('plate', plate('whole'), .75, .875, 96, 112), ('plate-cracked', plate('cracked'), .75, .875, 96, 112),
       ('plate-empty', plate('empty'), .75, .875, 96, 112), ('tube-full', tube(True), 4, .875, 512, 112),
       ('tube-empty', tube(False), 4, .875, 512, 112), ('pip-on', pip(True), .5, .5, 48, 48), ('pip-off', pip(False), .5, .5, 48, 48)]


def kit_batch():
    entries = [e for e in KIT if wanted(e[0])]
    if not entries: return
    out = UI / 'kit'; out.mkdir(parents=True, exist_ok=True)
    previous = bpy.context.window.scene
    scenes = []
    try:
        p = palette()
        for key_name, builder, w, h, px, py in entries:
            scene = bpy.data.scenes.new('UI kit / ' + key_name); scenes.append(scene)
            bpy.context.window.scene = scene
            builder(p)
            scene.world = bpy.data.worlds.new('UI kit / studio')
            scene.world.use_nodes = True
            bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
            # A dark sky: flat faces seen head-on would otherwise mirror the backdrop and wash out.
            bg.inputs[0].default_value = (.05, .06, .08, 1); bg.inputs[1].default_value = .35
            # No light overhead: a top-down camera would see it mirrored across every flat face.
            area(scene, 'large warm key', (-3.5, 4, 3.5), 210, 3, (1, .92, .82))
            area(scene, 'cool fill', (4, -3, 2.5), 55, 3, (.74, .85, 1))
            cam = bpy.data.cameras.new('UI kit / camera'); cam.type = 'ORTHO'; cam.ortho_scale = max(w, h)
            o = bpy.data.objects.new(cam.name, cam); scene.collection.objects.link(o)
            o.location = (0, 0, 10); o.rotation_euler = (0, 0, 0); scene.camera = o
            scene.render.engine = 'CYCLES'; scene.cycles.samples = 40; scene.cycles.use_denoising = True
            scene.render.resolution_x = px; scene.render.resolution_y = py; scene.render.resolution_percentage = 100
            scene.render.film_transparent = True
            scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
            scene.view_settings.view_transform = 'AgX'
            scene.render.filepath = str(out / (key_name + '.png'))
            bpy.ops.render.render(write_still=True, scene=scene.name)
            print('UI_KIT_RENDERED', key_name)
    finally:
        bpy.context.window.scene = previous
        for scene in scenes:
            for o in list(scene.objects):
                data = o.data; bpy.data.objects.remove(o, do_unlink=True)
                if data and data.users == 0:
                    if isinstance(data, bpy.types.Mesh): bpy.data.meshes.remove(data)
                    elif isinstance(data, bpy.types.Camera): bpy.data.cameras.remove(data)
                    elif isinstance(data, bpy.types.Light): bpy.data.lights.remove(data)
            world = scene.world; bpy.data.scenes.remove(scene)
            if world and world.users == 0: bpy.data.worlds.remove(world)
        for m in study['CREATED']:
            try:
                if m.users == 0: bpy.data.materials.remove(m)
            except ReferenceError:
                pass
        study['CREATED'].clear()


if __name__ == '__main__':
    studio_batch(HUD, UI / 'icons', 160)
    studio_batch(BUILD, UI / 'build', 160)
    kit_batch()
