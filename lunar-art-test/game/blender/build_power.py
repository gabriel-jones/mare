"""Author the night-power kit: fuel cell stack, thermal regolith store, RTG and goo bioreactor. Reuses the space
kit's helpers and palette. Run headless (blender -b --factory-startup --python blender/build_power.py): it builds
in the throwaway startup scene and only writes the GLBs. Inside a live Blender it builds in a temporary scene
and removes it again, so the open file is left untouched."""
import bpy
_source = open('/Users/gabe/Documents/Playground/lunar-art-test/game/blender/build_space.py').read()
_source = _source[:_source.index('# --- Fabricator')]
HEADLESS = bpy.context.window is None
if HEADLESS:
    _source = (_source.replace('previous_scene = bpy.context.window.scene', 'previous_scene = bpy.context.scene')
               .replace("scene = bpy.data.scenes.new('Lunar space asset library')", 'scene = bpy.context.scene')
               .replace('bpy.context.window.scene = scene', 'for _o in list(scene.objects): bpy.data.objects.remove(_o, do_unlink=True)'))
exec(_source)
if not HEADLESS: scene.name = 'Lunar power asset library'

M['violet'] = material('Lunar • resonant crystal glow', (.62, .32, 1), .1, .2, 4)
M['ember'] = material('Lunar • alien relic ember', (1, .28, .12), .1, .3, 2.5)


def ring(name, z, r, minor, mat, x=0, y=0, seg=28):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=minor, major_segments=seg, minor_segments=6, location=(x, y, z))
    return finish(bpy.context.object, name, mat, 0, True)


def sphere(name, loc, r, mat, seg=18):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=loc)
    return finish(bpy.context.object, name, mat, 0, True)


# --- Fuel cell stack: 4 x 4 m. Hydrogen and oxygen spheres feed a plate stack glowing at its seams. ---
def fuelcell():
    box('Foundation skid', (0, 0, .12), (3.85, 3.85, .24), 'dark', .05)
    for x, r, band in [(-.95, .78, 'metal'), (.95, .62, 'orange')]:
        cyl('Tank saddle', (x, .9, .45), .55, .42, 'dark', 16)
        sphere('Gas sphere', (x, .9, .55 + r), r, 'ivory')
        ring('Sphere band', .55 + r, r + .015, .045, band, x, .9)
        beam('Feed line', (x, .9 - r * .6, .55 + r * .4), (x * .4, -.35, 1.0), .09, 'metal')
    # The stack: alternating bipolar plates, lit where the membranes react.
    box('Stack end plate', (0, -.75, .55), (2.1, 1.25, .2), 'dark', .03)
    for i in range(9):
        y = -1.25 + i * .12
        box('Bipolar plate', (0, y, 1.05), (1.9, .07, .8), 'metal' if i % 2 else 'dark', .01)
        if i % 2: box('Membrane seam', (0, y - .06, 1.05), (1.75, .02, .66), 'cyan', 0)
    box('Stack end plate', (0, -.2, 1.05), (2.1, .14, 1.0), 'ivory', .03)
    box('Stack end plate', (0, -1.38, 1.05), (2.1, .14, 1.0), 'ivory', .03)
    for x in [-.95, .95]:
        for z in [.68, 1.42]: beam('Tie rod', (x, -1.48, z), (x, -.12, z), .06, 'dark')
    box('Hazard band', (0, -1.46, .62), (2.0, .03, .12), 'orange', 0)
    box('Inverter cabinet', (1.45, -1.35, .7), (.7, .7, .9), 'ivory', .05)
    box('Inverter screen', (1.45, -1.71, .85), (.45, .03, .25), 'glass', .01)
    status_level(-1.55, -1.585, .45, .9)
    box('Water drain', (-1.5, -.6, .4), (.3, .3, .3), 'metal', .03)
    beam('Product water', (-1.5, -.6, .55), (-.95, -.75, .9), .07, 'metal')
    status_lamp(1.45, -1.35, 1.15)


# --- Thermal regolith store: 4 x 4 m. An insulated bin of packed regolith with a Stirling engine on its flank. ---
def thermal():
    box('Foundation skid', (0, 0, .12), (3.85, 3.85, .24), 'dark', .05)
    cyl('Bin wall', (-.3, .3, 1.15), 1.35, 1.8, 'gold', 8)
    for z in [.35, 1.15, 1.95]: cyl('Bin hoop', (-.3, .3, z), 1.39, .12, 'dark', 8)
    cyl('Bin lid', (-.3, .3, 2.1), 1.2, .12, 'ivory', 8)
    cyl('Packed regolith', (-.3, .3, 2.18), .95, .06, 'regolith', 8)
    frustum('Fill chute', 2.15, 2.65, .35, .35, .6, .6, 'ivory', -.3, .3, False)
    for a in range(6):
        x, y = -.3 + math.cos(a * 1.047) * 1.15, .3 + math.sin(a * 1.047) * 1.15
        box('Heat vent', (x, y, .5), (.32, .32, .1), 'ember', 0, (0, 0, a * 1.047))
    # Stirling engine: hot head into the bin, flywheel and alternator out front.
    beam('Heat pipe', (-.3, -.6, 1.1), (1.15, -1.0, .95), .14, 'orange')
    cyl('Displacer cylinder', (1.25, -1.05, 1.0), .3, .9, 'metal', 16, (0, math.pi / 2, 0))
    cyl('Flywheel', (1.25, -1.45, 1.0), .5, .1, 'dark', 20, (math.pi / 2, 0, 0))
    cyl('Flywheel hub', (1.25, -1.52, 1.0), .14, .1, 'orange', 12, (math.pi / 2, 0, 0))
    box('Alternator', (1.25, -.55, .55), (.6, .5, .55), 'ivory', .04)
    for k in range(5): box('Cooler fin', (1.65, -.3 + k * .14, 1.25), (.5, .04, .7), 'metal', .005)
    box('Gauge housing', (-1.4, -1.25, .9), (.35, .3, 1.3), 'ivory', .03)
    status_level(-1.4, -1.41, .4, 1.0)
    status_lamp(-1.4, -1.25, 1.6)


# --- RTG: 2 x 2 m. A finned isotope core on a tripod, with nothing to feed and nothing to break. ---
def rtg():
    cyl('Foundation pad', (0, 0, .08), .92, .16, 'dark', 12)
    for a in [0, 2.09, 4.19]:
        beam('Tripod leg', (math.cos(a) * .75, math.sin(a) * .75, .16), (math.cos(a) * .3, math.sin(a) * .3, .65), .08, 'metal')
    cyl('Core housing', (0, 0, 1.15), .32, 1.05, 'dark', 16)
    for i in range(8):
        a = i * math.pi / 4
        box('Radiator fin', (math.cos(a) * .48, math.sin(a) * .48, 1.15), (.32, .035, .95), 'metal', .004, (0, 0, a))
    for z in [.66, 1.64]: cyl('Fin collar', (0, 0, z), .38, .08, 'orange', 16)
    cyl('Isotope cap', (0, 0, 1.73), .24, .1, 'ivory', 16)
    cyl('Isotope glow', (0, 0, 1.8), .14, .04, 'ember', 12)
    box('Trefoil plate', (0, -.66, .45), (.42, .03, .3), 'orange', .005)
    box('Trefoil', (0, -.68, .45), (.14, .02, .14), 'dark', 0)
    box('Junction box', (.55, -.35, .35), (.3, .25, .3), 'ivory', .03)
    status_lamp(-.6, -.45, 1.0, base=.16)


# --- Goo bioreactor: 4 x 4 m. A caged column of living black goo, digested into power; feed hopper on the side. ---
def bioreactor():
    box('Foundation skid', (0, 0, .12), (3.85, 3.85, .24), 'dark', .05)
    cyl('Column plinth', (-.3, .2, .42), 1.15, .36, 'ivory', 24)
    ring('Plinth band', .6, 1.16, .06, 'orange', -.3, .2)
    cyl('Level', (-.3, .2, 1.65), .8, 2.1, 'gauge', 20)
    for z in [.72, 1.65, 2.6]: ring('Containment hoop', z, .9, .07, 'metal', -.3, .2)
    for i in range(8):
        a = i * math.pi / 4
        beam('Cage bar', (-.3 + math.cos(a) * .9, .2 + math.sin(a) * .9, .62), (-.3 + math.cos(a) * .9, .2 + math.sin(a) * .9, 2.72), .07, 'dark')
    cyl('Column crown', (-.3, .2, 2.8), .95, .18, 'ivory', 24)
    cyl('Vent stack', (-.3, .2, 3.05), .22, .35, 'dark', 12)
    # Feed hopper and the digester that turns goo into current.
    frustum('Feed hopper', .95, 1.6, .25, .25, .45, .45, 'ivory', 1.35, .95, True)
    box('Hopper legs', (1.35, .95, .6), (.4, .4, .7), 'dark', .02)
    beam('Feed pipe', (1.2, .8, 1.3), (.45, .45, 1.9), .12, 'violet')
    box('Digester', (1.3, -1.0, .7), (.95, .9, .95), 'ivory', .05)
    box('Digester window', (1.3, -1.46, .75), (.55, .03, .35), 'violet', .005)
    beam('Bus bar', (.85, -1.0, .45), (-.3, -.75, .5), .12, 'orange')
    box('Hazard band', (-.3, -.98, .3), (1.6, .03, .14), 'orange', 0)
    status_lamp(1.65, -1.35, 1.25)


STATUS = [('Lamp', (0, 0, 0))]
export_asset('fuelcell', fuelcell, (-6, 0, 0), parts=STATUS + [('Level', (-1.55, -1.585, .45))])
export_asset('thermal', thermal, (-1.5, 0, 0), parts=STATUS + [('Level', (-1.4, -1.41, .4))])
export_asset('rtg', rtg, (2, 0, 0), parts=STATUS)
export_asset('bioreactor', bioreactor, (5.5, 0, 0), parts=STATUS + [('Level', (-.3, .2, .6))])

if not HEADLESS:
    bpy.context.window.scene = previous_scene
    for o in list(scene.collection.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(scene)
    for me in created['meshes']:
        try:
            if me.users == 0: bpy.data.meshes.remove(me)
        except ReferenceError:
            pass
    for m in created['materials']:
        if m.users == 0: bpy.data.materials.remove(m)
print('LUNAR_POWER_KIT_READY', OUT)
