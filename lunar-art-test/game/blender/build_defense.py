"""Author the defence kit: a twin-cannon sentry turret and an electric fence segment. Reuses the space kit's helpers
and palette. Run headless (blender -b --factory-startup --python blender/build_defense.py): it builds in the
throwaway startup scene and only writes the GLBs.

The turret's moving parts stay separate, pivotable nodes: Head (turns about its bearing), Cradle (pitches about its
trunnions) and BarrelL / BarrelR (recoil back along their bores, pivots at the breech). The runtime parents them
Head > Cradle > barrels. The fence is one post with four half-spans of wire, Span0..Span3 toward game +Z, +X, -Z, -X
(Blender -Y, +X, +Y, -X); the runtime shows a span only where another fence stands next door, so neighbours' halves
meet at the shared edge. Front is -Y (game +Z)."""
import bpy, math
_source = open('/Users/gabe/Documents/Playground/lunar-art-test/game/blender/build_space.py').read()
_source = _source[:_source.index('# --- Fabricator')]
_source = (_source.replace('previous_scene = bpy.context.window.scene', 'previous_scene = bpy.context.scene')
           .replace("scene = bpy.data.scenes.new('Lunar space asset library')", 'scene = bpy.context.scene')
           .replace('bpy.context.window.scene = scene', 'for _o in list(scene.objects): bpy.data.objects.remove(_o, do_unlink=True)'))
exec(_source)

M['wire'] = material('Lunar • live fence wire', (.35, .85, 1), .6, .25, 1.2)
M['ceramic'] = material('Lunar • insulator ceramic', (.62, .5, .38), .05, .3)
M['sensor'] = material('Lunar • sentry sensor glow', (1, .25, .12), .1, .25, 3)


def sphere(name, loc, r, mat, seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=loc)
    return finish(bpy.context.object, name, mat, 0, True)


# --- Sentry turret: 4 x 4 m. An armoured head on a bearing ring over an octagonal plinth; two cannons side by side. ---
HEAD_Z, BORE_Z, BORE_X = 1.2, 1.62, .3


def turret():
    box('Foundation skid', (0, 0, .12), (3.85, 3.85, .24), 'dark', .05)
    for x, y in [(-1.6, -1.6), (1.6, -1.6), (-1.6, 1.6), (1.6, 1.6)]: box('Skid foot', (x, y, .2), (.42, .42, .16), 'metal', .02)
    cyl('Plinth', (0, 0, .62), 1.15, .76, 'ivory', 8)
    cyl('Plinth band', (0, 0, .82), 1.17, .12, 'orange', 8)
    cyl('Plinth skirt', (0, 0, .3), 1.3, .14, 'dark', 8)
    cyl('Bearing ring', (0, 0, 1.06), .9, .14, 'metal', 24)
    # Rounds box on the flank with a feed chute up into the head, and the power junction behind.
    box('Rounds box', (1.35, .75, .62), (.85, 1.2, .76), 'dark', .04)
    box('Rounds box lid', (1.35, .75, 1.02), (.9, 1.25, .06), 'ivory', .02)
    box('Rounds box stripe', (1.79, .75, .62), (.02, 1.0, .14), 'orange', 0)
    beam('Feed chute', (1.05, .5, .95), (.55, .25, 1.38), .16, 'metal')
    box('Power junction', (-1.35, 1.2, .55), (.6, .5, .62), 'ivory', .04)
    box('Junction window', (-1.35, .94, .62), (.36, .02, .2), 'glass', 0)
    beam('Power cable', (-1.1, 1.0, .35), (-.55, .45, .35), .12, 'orange')
    status_lamp(-1.35, 1.2, .9)
    # Head: an angular armoured housing that turns on the ring.
    box('Head drum', (0, 0, HEAD_Z + .1), (1.25, 1.25, .2), 'dark', .03)
    box('Head housing', (0, .15, HEAD_Z + .45), (1.35, 1.25, .62), 'ivory', .07)
    box('Head brow', (0, -.42, HEAD_Z + .72), (1.2, .4, .14), 'ivory', .04, (math.radians(-14), 0, 0))
    for x in [-.7, .7]:
        box('Head cheek', (x, .05, HEAD_Z + .42), (.08, 1.15, .56), 'dark', .02)
        box('Head stripe', (x * 1.03, .4, HEAD_Z + .42), (.02, .32, .5), 'orange', 0)
    box('Head back', (0, .8, HEAD_Z + .4), (1.05, .12, .5), 'metal', .02)
    box('Head vent', (0, .87, HEAD_Z + .42), (.7, .02, .22), 'dark', 0)
    cyl('Head sensor mast', (.38, .45, HEAD_Z + .9), .05, .3, 'dark', 8)
    box('Head sensor', (.38, .38, HEAD_Z + 1.08), (.26, .2, .14), 'dark', .02)
    box('Head sensor eye', (.38, .27, HEAD_Z + 1.08), (.14, .02, .07), 'sensor', 0)
    # Cradle: the gun block, pitched about trunnions through the cheeks.
    cyl('Cradle trunnion', (0, -.25, BORE_Z), .1, 1.5, 'metal', 12, (0, math.pi / 2, 0))
    box('Cradle block', (0, -.45, BORE_Z), (.92, .55, .44), 'dark', .04)
    box('Cradle mantlet', (0, -.74, BORE_Z), (.98, .1, .5), 'metal', .02)
    # The cannons: jacketed barrels with a slotted muzzle brake, pivoting at the breech.
    for side, x in [('L', -BORE_X), ('R', BORE_X)]:
        cyl(f'Barrel{side} breech', (x, -.72, BORE_Z), .13, .3, 'metal', 14, (math.pi / 2, 0, 0))
        cyl(f'Barrel{side} jacket', (x, -1.12, BORE_Z), .12, .55, 'dark', 14, (math.pi / 2, 0, 0))
        for k in range(3): cyl(f'Barrel{side} fin', (x, -.95 - k * .14, BORE_Z), .145, .035, 'metal', 14, (math.pi / 2, 0, 0))
        cyl(f'Barrel{side} bore', (x, -1.75, BORE_Z), .075, .9, 'metal', 12, (math.pi / 2, 0, 0))
        box(f'Barrel{side} brake', (x, -2.25, BORE_Z), (.2, .22, .2), 'dark', .02)
        for k in range(2): box(f'Barrel{side} brake slot', (x, -2.2 - k * .08, BORE_Z), (.22, .025, .08), 'orange', 0)


# --- Electric fence: 2 x 2 m. A post with ceramic insulators; three live wires run out to each neighbour. ---
WIRES = [.5, .95, 1.4]


def fence():
    box('Footing', (0, 0, .07), (.5, .5, .14), 'dark', .03)
    box('Post', (0, 0, .92), (.14, .14, 1.62), 'metal', .015)
    box('Post cap', (0, 0, 1.76), (.2, .2, .07), 'orange', .01)
    box('Hazard plate', (0, -.085, 1.12), (.22, .015, .2), 'orange', .005, (0, 0, 0))
    box('Hazard glyph', (0, -.094, 1.12), (.07, .01, .13), 'dark', 0, (0, math.radians(18), 0))
    for z in WIRES:
        cyl('Insulator', (0, 0, z), .1, .09, 'ceramic', 10)
        cyl('Insulator', (0, 0, z + .07), .085, .04, 'ceramic', 10)
    status_lamp(0, 0, 1.8)
    for i, (dx, dy) in enumerate([(0, -1), (1, 0), (0, 1), (-1, 0)]):
        for z in WIRES:
            beam(f'Span{i} wire', (dx * .08, dy * .08, z), (dx * 1.0, dy * 1.0, z - .03), .028, 'wire')
        # A spacer clip midway keeps the three apart.
        box(f'Span{i} spacer', (dx * .55, dy * .55, .95), (.05 if dx else .03, .03 if dx else .05, 1.0), 'dark', 0)


STATUS = [('Lamp', (0, 0, 0))]
export_asset('turret', turret, (0, 0, 0), parts=[('Head', (0, 0, HEAD_Z)), ('Cradle', (0, -.25, BORE_Z)), ('BarrelL', (-BORE_X, -.6, BORE_Z)), ('BarrelR', (BORE_X, -.6, BORE_Z))] + STATUS)
for o in list(bpy.context.scene.objects): bpy.data.objects.remove(o, do_unlink=True)
export_asset('fence', fence, (0, 0, 0), parts=[(f'Span{i}', (0, 0, 0)) for i in range(4)] + STATUS)
print('LUNAR_DEFENSE_KIT_READY', OUT)
