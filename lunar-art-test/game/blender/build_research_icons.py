"""Render one card image per research tech in the inventory icon studio.

Techs that unlock a building show that building's game model; crop and recipe techs show the item they
unlock. Run with Blender --background --python; writes assets/research/<tech>.png, rendered at 512 px and
shrunk to 192 px for the 64 px research cards. Builds in temporary scenes and removes them, leaving the open file untouched.
"""
from pathlib import Path
import os
import subprocess
import bpy

ROOT = Path('/Users/gabe/Documents/Playground/lunar-art-test/game')
OUT = ROOT / 'assets/research'
icons = {'__name__': 'lunar_research_icons'}
exec(compile((ROOT / 'blender/build_inventory_icons.py').read_text(), 'build_inventory_icons.py', 'exec'), icons)
study = icons['study']
study['OUT'] = OUT


def building(name):
    """Import a game model, flatten its hierarchy and keep only meshes so the studio camera can frame it."""
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


def item(key):
    builders = dict(icons['BUILDERS'])
    return builders[key]


TECHS = [('hydroponics', building('hydrorack')), ('soy', item('soy')), ('tomato', item('tomato')),
         ('algae', item('algae')), ('mycology', building('mushroomtray')), ('processing', building('mill')),
         ('medicine', item('medkit')), ('vertical', building('verticalfarm')), ('wheat', item('wheat')),
         ('roverbay', building('roverbay')), ('reactor', building('reactor'))]
TECHS.append(('containment', building('goovat')))


def android_figure(p):
    building('android')(p)
    for o in list(bpy.context.scene.objects):
        if o.name.split('.')[0] in ('Gun', 'Pistol', 'Blade'): bpy.data.objects.remove(o, do_unlink=True)
        else: o.scale = [v * 1.9 for v in o.scale]


def fence_run(p):
    building('fence')(p)
    for o in list(bpy.context.scene.objects):
        if o.name.split('.')[0].startswith(('Span1', 'Span3')): bpy.data.objects.remove(o, do_unlink=True)


TECHS.append(('androids', android_figure))
TECHS += [('turret', building('turret')), ('fence', fence_run)]
def hohmann(p):
    """Two circular orbits round a small sun and the half ellipse between them, the craft partway along."""
    icons['materials'](p)
    p.setdefault('orbit', study['mat']('orbit line', (.48, .57, .62), .7, .3))
    p.setdefault('arc_glow', study['mat']('transfer arc', (1., .55, .18), .1, .3, 4))
    p.setdefault('sun', study['mat']('sun', (1., .78, .35), 0, .4, 6))
    p.setdefault('mars_red', study['mat']('mars', (.62, .2, .08), 0, .7))
    p.setdefault('earth_blue', study['mat']('earth', (.12, .32, .7), .1, .4))
    import math
    for r in (.42, .9):
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=.012, major_segments=64, minor_segments=6, location=(0, 0, .05))
        study['finish'](bpy.context.object, 'Hohmann / orbit', p['orbit'])
    a, e = (.42 + .9) / 2, (.9 - .42) / (.9 + .42)
    for k in range(18):
        t = math.pi * (k + .5) / 18
        r = a * (1 - e * e) / (1 + e * math.cos(t))
        x, y = math.cos(t + math.pi) * r, math.sin(t + math.pi) * r
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=4, radius=.026, location=(x, y, .05))
        study['finish'](bpy.context.object, 'Hohmann / arc', p['arc_glow'])
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=.13, location=(0, 0, .13))
    study['finish'](bpy.context.object, 'Hohmann / sun', p['sun'], 0, True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=.075, location=(-.42, 0, .1))
    study['finish'](bpy.context.object, 'Hohmann / earth', p['earth_blue'], 0, True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=.06, location=(.9, 0, .09))
    study['finish'](bpy.context.object, 'Hohmann / mars', p['mars_red'], 0, True)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=.05, depth=.14, location=(.2, -.61, .08), rotation=(0, math.pi / 2, .35))
    study['finish'](bpy.context.object, 'Hohmann / craft', p['silver'])


def aerocapture(p):
    """A blunt capsule nose-first into a sheath of glowing plasma."""
    icons['materials'](p)
    p.setdefault('plasma', study['mat']('entry plasma', (1., .3, .04), 0, .3, 1.6))
    p.setdefault('shield', study['mat']('ablative shield', (.18, .1, .06), .1, .8))
    import math
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=.42, radius2=.2, depth=.5, location=(0, 0, .55))
    study['finish'](bpy.context.object, 'Aero / capsule', p['ivory'], .02)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.45, depth=.07, location=(0, 0, .28))
    study['finish'](bpy.context.object, 'Aero / heat shield', p['shield'], .02)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=.5, location=(0, 0, .22))
    o = bpy.context.object; o.scale = (1.12, 1.12, .32)
    study['finish'](o, 'Aero / plasma', p['plasma'], 0, True)
    for k in range(5):
        a = k * math.tau / 5
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=.06, depth=.45, location=(math.cos(a) * .5, math.sin(a) * .5, .45), rotation=(math.cos(a + math.pi / 2) * .5, math.sin(a + math.pi / 2) * -.5, 0))
        study['finish'](bpy.context.object, 'Aero / streak', p['plasma'])
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=.09, depth=.05, location=(0, -.31, .6), rotation=(math.radians(70), 0, 0))
    study['finish'](bpy.context.object, 'Aero / window', p['navy'])


TECHS += [('escape', building('starship')), ('hohmann', hohmann), ('aerocapture', aerocapture), ('edl', building('drill'))]
TECHS += [('pistol', item('pistol')), ('smg', item('smg')), ('katana', item('katana')), ('rifle', item('rifle')), ('flamethrower', item('flamethrower')), ('arc', item('arc')), ('railgun', item('railgun'))]


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    study['build_study'](TECHS, library_name='research-library.blend')
    try:
        only = [k for k in os.environ.get('LUNAR_ICONS', '').split(',') if k]
        for key, _ in TECHS:
            if not only or key in only:
                study['render_icon'](key)
                subprocess.run(['sips', '-Z', '192', str(OUT / (key + '.png'))], check=True, capture_output=True)
    finally:
        study['cleanup']()
        (OUT / 'research-library.blend').unlink(missing_ok=True)
