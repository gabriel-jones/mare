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


TECHS.append(('androids', android_figure))
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
