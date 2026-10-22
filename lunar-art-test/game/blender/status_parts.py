"""Status hardware shared by the kit scripts; exec it after a script defines M, material, box and cyl.

The runtime recolours every mesh using "Lunar • status lamp" by machine state (steady, pulse, blink,
dark), lights Cell1..Cell5 by charge and scales the Level node from its base by fill. Front is -Y."""
M['lamp'] = material('Lunar • status lamp', (.86, .9, .88), 0, .3)
M['gauge'] = material('Lunar • gauge fluid', (.45, .8, .95), 0, .25)

def status_lamp(x, y, top, base=None):
    """A beacon whose bulb is named Lamp, optionally on a thin mast rising from `base`."""
    if base is not None: cyl('Status mast', (x, y, (base + top) / 2), .04, top - base, 'dark', 6)
    cyl('Status housing', (x, y, top + .03), .1, .06, 'dark', 8)
    cyl('Lamp', (x, y, top + .11), .075, .1, 'lamp', 8)
    cyl('Status cap', (x, y, top + .175), .09, .03, 'dark', 8)

def status_cells(x, y, z, count=5, width=.11, gap=.025):
    """A row of charge cells, Cell1 on the left, set into a -Y face at depth y."""
    box('Cell bezel', (x, y + .012, z), (count * (width + gap) + .05, .02, .12), 'dark', 0)
    for i in range(count):
        box(f'Cell{i + 1}', (x + (i - (count - 1) / 2) * (width + gap), y, z), (width, .02, .07), 'lamp', 0)

def status_level(x, y, z, height, width=.1, window=True):
    """A vertical sight glass on a -Y face; `z` is its base. Build the window separately (window=False)
    when the script joins each part into its own node, so only the fluid scales."""
    if window: box('Gauge window', (x, y + .012, z + height / 2), (width + .07, .02, height + .07), 'dark', 0)
    box('Level', (x, y, z + height / 2), (width, .02, height), 'gauge', 0)
