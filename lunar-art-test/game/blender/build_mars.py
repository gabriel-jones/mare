"""Author the Martian ore kit: a mining drill and a smelting furnace. Reuses the space kit's helpers and palette. Run
headless (blender -b --factory-startup --python blender/build_mars.py): it builds in the throwaway startup scene and
only writes the GLBs.

Both are 4 x 4 m (2 x 2 cells), front -Y (game +Z). The drill's Bit (drill string and auger) is a separate node that
the runtime spins about its vertical axis and works up and down; its ore chute leaves at the front right, over the
drill's belt output. An android stands at the console on the drill's left. The furnace takes ore in a hopper at the
back left (its belt input) and pours at the front right (its output); Glow is the molten window and pour, an emissive
node the runtime brightens while it smelts."""
import bpy, math
_source = open('/Users/gabe/Documents/Playground/lunar-art-test/game/blender/build_space.py').read()
_source = _source[:_source.index('# --- Fabricator')]
_source = (_source.replace('previous_scene = bpy.context.window.scene', 'previous_scene = bpy.context.scene')
           .replace("scene = bpy.data.scenes.new('Lunar space asset library')", 'scene = bpy.context.scene')
           .replace('bpy.context.window.scene = scene', 'for _o in list(scene.objects): bpy.data.objects.remove(_o, do_unlink=True)'))
exec(_source)

M['oxide'] = material('Mars • oxide red paint', (.42, .1, .05), .25, .55)
M['brick'] = material('Mars • refractory brick', (.2, .12, .09), .02, .9)
M['molten'] = material('Mars • molten metal', (1, .2, .015), 0, .3, 1.1)
M['ore'] = material('Mars • raw ore', (.28, .1, .06), .2, .8)


# --- Mining drill ----------------------------------------------------------------------------------------------
TOWER = 4.6


def drill():
    box('Skid', (0, 0, .12), (3.9, 3.9, .24), 'dark', .05)
    for x, y in [(-1.7, -1.7), (1.7, -1.7), (-1.7, 1.7), (1.7, 1.7)]:
        box('Outrigger', (x, y, .22), (.5, .5, .2), 'metal', .02)
        box('Outrigger stripe', (x, y, .33), (.52, .52, .03), 'orange', 0)
    # Collar over the bore, and the turntable it turns in.
    cyl('Bore collar', (0, 0, .4), .78, .32, 'oxide', 12)
    cyl('Turntable', (0, 0, .62), .62, .12, 'metal', 20)
    # A four-legged lattice derrick, tapering to a crown block.
    legs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for dx, dy in legs:
        beam('Derrick leg', (dx * 1.15, dy * 1.15, .25), (dx * .42, dy * .42, TOWER), .13, 'oxide')
    for k, z in enumerate([1.1, 2.1, 3.1, 4.0]):
        s = 1.15 - (1.15 - .42) * (z - .25) / (TOWER - .25)
        for i in range(4):
            (ax, ay), (bx, by) = legs[i], legs[(i + 1) % 4]
            beam('Derrick rung', (ax * s, ay * s, z), (bx * s, by * s, z), .06, 'dark')
            if k < 3:
                s2 = 1.15 - (1.15 - .42) * (z + 1 - .25) / (TOWER - .25)
                beam('Derrick brace', (ax * s, ay * s, z), (bx * s2, by * s2, z + .95), .045, 'dark')
    box('Crown block', (0, 0, TOWER + .12), (1.05, 1.05, .26), 'dark', .03)
    box('Crown sheave', (0, 0, TOWER + .38), (.3, .7, .3), 'metal', .03)
    # Top drive: the motor that turns the string, hung in the derrick.
    box('Top drive', (0, 0, 3.35), (.7, .62, .8), 'ivory', .05)
    box('Top drive stripe', (0, -.32, 3.35), (.72, .02, .14), 'orange', 0)
    beam('Hoist line', (0, 0, 3.75), (0, 0, TOWER + .2), .04, 'metal')
    # The string and auger (the Bit node), down through the collar.
    cyl('Bit kelly', (0, 0, 1.9), .14, 2.2, 'metal', 8)
    cyl('Bit coupling', (0, 0, 2.95), .2, .18, 'dark', 8)
    for k in range(6):
        z = .55 + k * .22
        bpy.ops.mesh.primitive_cylinder_add(vertices=4, radius=.42, depth=.04, location=(0, 0, z))
        o = bpy.context.object; o.rotation_euler = (math.radians(14), 0, k * math.pi / 3)
        finish(o, 'Bit flight', 'metal', .01)
    # Ore bin and chute at the front right, over the belt output.
    box('Ore bin', (1.1, -.7, 1.0), (1.2, 1.0, .9), 'oxide', .05)
    box('Ore bin rim', (1.1, -.7, 1.48), (1.26, 1.06, .08), 'dark', .02)
    box('Ore heap', (1.1, -.7, 1.48), (.95, .75, .12), 'ore', .04)
    beam('Ore chute', (1.1, -1.15, 1.0), (1.0, -1.95, .45), .42, 'metal')
    box('Chute lip', (1.0, -1.98, .42), (.5, .12, .08), 'orange', .01)
    beam('Ore conveyor', (.35, -.3, .75), (.75, -.55, 1.35), .22, 'dark')
    # Operator console on the left, angled toward where the android stands.
    box('Console pedestal', (-1.45, -.6, .7), (.5, .5, .95), 'ivory', .04)
    box('Console desk', (-1.52, -.6, 1.22), (.62, .78, .1), 'dark', .02, (0, math.radians(-18), 0))
    box('Console screen', (-1.62, -.6, 1.42), (.06, .5, .32), 'glass', 0, (0, math.radians(-18), 0))
    box('Console lever', (-1.4, -.85, 1.32), (.05, .05, .22), 'orange', .01)
    # Power cabinet behind, cabled to the top drive.
    box('Power cabinet', (-1.2, 1.35, .75), (1.0, .7, 1.05), 'ivory', .05)
    box('Cabinet vent', (-1.2, 1.0, .85), (.7, .02, .3), 'dark', 0)
    beam('Drive cable', (-.8, 1.1, 1.25), (-.3, .25, 3.0), .09, 'orange')
    status_lamp(-1.2, 1.35, 1.32)


# --- Furnace ---------------------------------------------------------------------------------------------------
def furnace():
    box('Plinth', (0, 0, .14), (3.9, 3.9, .28), 'dark', .05)
    # The kiln: a squat refractory drum, banded, under a domed hood.
    cyl('Kiln body', (0, .15, 1.15), 1.25, 1.75, 'brick', 16)
    for z in [.45, 1.15, 1.85]: cyl('Kiln band', (0, .15, z), 1.29, .14, 'oxide', 16)
    cyl('Kiln hood', (0, .15, 2.15), 1.1, .25, 'dark', 16)
    dome('Kiln dome', (0, .15, 2.27), 1.0, 'oxide', 5)
    # Chimney with a spark guard.
    cyl('Chimney', (.65, .85, 3.3), .26, 2.2, 'dark', 10)
    cyl('Chimney cap', (.65, .85, 4.45), .36, .1, 'metal', 10)
    for k in range(3): cyl('Chimney ring', (.65, .85, 2.6 + k * .55), .3, .06, 'oxide', 10)
    # Feed hopper at the back left over the belt input, chuting into the kiln's flank.
    frustum('Feed hopper', 1.15, 2.05, .48, .48, .78, .78, 'metal', -1.05, 1.35)
    box('Feed hopper rim', (-1.05, 1.35, 2.08), (1.6, 1.6, .07), 'orange', .01)
    box('Hopper ore', (-1.05, 1.35, 1.98), (1.2, 1.2, .1), 'ore', .03)
    box('Hopper legs', (-1.05, 1.35, .7), (.5, .5, .9), 'dark', .02)
    beam('Feed screw', (-.85, 1.05, 1.35), (-.55, .5, 1.6), .26, 'dark')
    # Molten window and pour (Glow), with the spout over the ingot tray at the front right.
    box('Glow window', (0, -1.2, 1.2), (.7, .06, .42), 'molten', 0)
    box('Window frame', (0, -1.14, 1.2), (.9, .08, .6), 'dark', .01)
    beam('Pour spout', (.55, -.8, 1.0), (1.05, -1.45, .78), .22, 'oxide')
    beam('Glow pour', (1.07, -1.5, .74), (1.1, -1.55, .5), .07, 'molten')
    box('Ingot tray', (1.1, -1.55, .36), (1.0, .7, .16), 'metal', .02)
    for k in range(3): box('Glow ingot', (.8 + k * .3, -1.55, .45), (.22, .5, .06), 'molten', .01)
    # Control box and power on the left flank.
    box('Control box', (-1.55, -.75, .85), (.45, .7, 1.1), 'ivory', .04)
    box('Control gauge', (-1.55, -1.11, 1.05), (.3, .02, .22), 'glass', 0)
    beam('Power cable', (-1.4, -.3, .4), (-.95, .1, .55), .1, 'orange')
    status_lamp(-1.55, -.75, 1.48)


STATUS = [('Lamp', (0, 0, 0))]
export_asset('drill', drill, (0, 0, 0), parts=[('Bit', (0, 0, 0))] + STATUS)
for o in list(bpy.context.scene.objects): bpy.data.objects.remove(o, do_unlink=True)
export_asset('furnace', furnace, (0, 0, 0), parts=[('Glow', (0, -1.1, 1.0))] + STATUS)
print('MARS_ORE_KIT_READY', OUT)
