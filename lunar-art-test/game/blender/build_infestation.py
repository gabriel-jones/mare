"""Author the infestation kit that replaces the caves' ruins: wall burrow nests sealed in silk, black goo with red veins,
coral blooms and glassy shards growing out of it, cobwebs, and the old builders' machinery half-digested by the goo.

Every piece stands on its foot at the origin, faces -Y in Blender (+Z in glTF, out of the wall into the room) and has
its back on the wall plane where it is a wall piece. Materials are named for their role (Goo, Glow, Maw, Silk, Gauze,
Coral, Crystal, Alloy, Chitin); the game swaps in its own. Builds in a temporary scene, exports infestation.glb, writes
infestation-library.blend and a preview render, then removes only what it made."""
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix, noise

OUT = '/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('Cave • infestation')
bpy.context.window.scene = scene
made = {'meshes': [], 'materials': [], 'lights': [], 'cameras': [], 'worlds': []}

def material(name, color, rough=.5, metal=0., emit=None, alpha=1.):
    m = bpy.data.materials.new(name); made['materials'].append(m); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (*emit[0], 1); b.inputs['Emission Strength'].default_value = emit[1]
    if alpha < 1: b.inputs['Alpha'].default_value = alpha
    return m
MATS = {
    'Goo': material('Goo', (.008, .006, .007), .12),
    'Glow': material('Glow', (.6, .04, .02), .4, emit=((1, .09, .03), 6)),
    'Maw': material('Maw', (.02, .004, .004), .5, emit=((.6, .03, .01), .6)),
    'Silk': material('Silk', (.62, .6, .57), .8),
    'Gauze': material('Gauze', (.7, .68, .64), .9, alpha=.45),
    'Coral': material('Coral', (.78, .66, .6), .65),
    'Crystal': material('Crystal', (.35, .02, .02), .08, emit=((.8, .05, .02), 1.2)),
    'Alloy': material('Alloy', (.16, .14, .12), .32, .85),
    'Chitin': material('Chitin', (.02, .02, .025), .3),
}

class Piece:
    """One mesh object, built from parts that each carry a material."""
    def __init__(self, name): self.name = name; self.bm = bmesh.new(); self.used = []
    def part(self, mat, fn, *a, **k):
        before = set(self.bm.faces); out = fn(self.bm, *a, **k)
        if mat not in self.used: self.used.append(mat)
        for f in self.bm.faces:
            if f not in before: f.material_index = self.used.index(mat)
        return out
    def finish(self, parent=None, origin=(0, 0, 0)):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        if origin != (0, 0, 0): bmesh.ops.translate(self.bm, verts=self.bm.verts, vec=-Vector(origin))
        me = bpy.data.meshes.new(self.name); self.bm.to_mesh(me); self.bm.free(); made['meshes'].append(me)
        for p in me.polygons: p.use_smooth = True
        for m in self.used: me.materials.append(MATS[m])
        o = bpy.data.objects.new(self.name, me); scene.collection.objects.link(o)
        if parent: o.parent = parent; o.location = Vector(origin)
        return o

def empty(name):
    o = bpy.data.objects.new(name, None); scene.collection.objects.link(o); return o

# ---- Shape helpers ----
def blob(bm, c, r, seed, amp=.22, sub=3, floor=None, squash_below=None):
    """A lumpy body. Anything below `floor` is pressed flat onto it."""
    ret = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1)
    for v in ret['verts']:
        n = v.co.normalized()
        d = 1 + amp * (noise.noise(n * 1.6 + Vector((seed, 0, 0))) + .5 * noise.noise(n * 3.7 + Vector((0, seed, 0))) + .2 * noise.noise(n * 8 + Vector((0, 0, seed))))
        p = Vector((n.x * r[0] * d, n.y * r[1] * d, n.z * r[2] * d)) + Vector(c)
        if floor is not None and p.z < floor: p.z = floor
        v.co = p
    return ret['verts']

def tube(bm, pts, radius, segs=6, flat=None):
    """Sweep a ring along a polyline; radius may be a function of 0..1 along it. Ends taper shut."""
    pts = [Vector(p) for p in pts]; n = len(pts); rings = []; a = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        if a is None: a = t.orthogonal().normalized()
        a = (a - t * a.dot(t)).normalized(); b = t.cross(a)
        r = radius(i / (n - 1)) if callable(radius) else radius
        ring = []
        for k in range(segs):
            ang = k / segs * math.tau; off = a * math.cos(ang) + b * math.sin(ang)
            if flat is not None: off = Vector((off.x, off.y * flat, off.z)) if abs(t.y) < .7 else off
            ring.append(bm.verts.new(p + off * r))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(segs): bm.faces.new((rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]))
    for ring, p, rev in ((rings[0], pts[0], True), (rings[-1], pts[-1], False)):
        c = bm.verts.new(p)
        for k in range(segs):
            f = (ring[k], ring[(k + 1) % segs], c)
            bm.faces.new(f[::-1] if rev else f)

def wander(start, direction, length, steps, rng, jitter=.35, plane=None, lift=0.):
    """A path that wanders as it goes. `plane` keeps it on a wall (y fixed) or the floor (z fixed)."""
    p = Vector(start); d = Vector(direction).normalized(); out = [p.copy()]
    for i in range(steps):
        d = (d + Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * jitter).normalized()
        if plane == 'wall': d.y = 0; d.normalize()
        if plane == 'floor': d.z = 0; d.normalize()
        p = p + d * (length / steps); p.z += lift; out.append(p.copy())
    return out

def branches(start, direction, length, depth, rng, plane=None, spread=.7, out=None, width=.04):
    """A branching growth (veins, coral): each branch forks into two thinner, shorter ones."""
    if out is None: out = []
    path = wander(start, direction, length, max(3, int(length / .08)), rng, .3, plane)
    out.append((path, width))
    if depth > 0:
        for side in (-1, 1):
            if rng.random() < .85:
                at = path[rng.randint(len(path) // 2, len(path) - 1)]
                d = (path[-1] - path[-2]).normalized()
                axis = Vector((0, 1, 0)) if plane == 'wall' else Vector((0, 0, 1)) if plane == 'floor' else Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized()
                nd = (Matrix.Rotation(side * spread * rng.uniform(.6, 1.2), 3, axis) @ d)
                branches(at, nd, length * rng.uniform(.5, .72), depth - 1, rng, plane, spread, out, width * .68)
    return out

def strand(bm, a, b, sag, r, steps=10, segs=4):
    a, b = Vector(a), Vector(b)
    pts = [a.lerp(b, i / steps) - Vector((0, 0, sag * 4 * (i / steps) * (1 - i / steps))) for i in range(steps + 1)]
    tube(bm, pts, r, segs)

def veins(piece, start, direction, length, depth, seed, plane, width=.035, hug=None):
    """Branching red veins. `hug` = (centre, radii) presses them onto the surface of a lump instead of a plane."""
    rng = random.Random(seed)
    for path, w in branches(start, direction, length, depth, rng, plane, width=width):
        if callable(hug): path = [hug(p) for p in path]
        elif hug:
            c, r = Vector(hug[0]), Vector(hug[1])
            def onto(p):
                d = p - c; n = Vector((d.x / r.x, d.y / r.y, d.z / r.z))
                if n.length < 1e-6: return p
                n.normalize(); q = c + Vector((n.x * r.x, n.y * r.y, n.z * r.z)) * 1.04
                return Vector((q.x, q.y, max(.02, q.z)))
            path = [onto(p) for p in path]
        piece.part('Glow', tube, path, lambda t, w=w: w * (1 - .7 * t) + .004, 5)

# ---- The nest: a burrow in the wall ----
def facing_out(bm, faces, centre_of):
    """Turn every face so it points away from the axis it was built round."""
    for f in faces:
        c = f.calc_center_median()
        if f.normal.dot(c - centre_of(c)) < 0: f.normal_flip()

D = -1.0   # the burrow's mouth stands this far out of the wall; the mound fills the space behind it

def nest():
    """A mound of goo bulging out of the wall with a burrow sunk into it: a lumpy lip at the mouth, a throat that
    narrows back toward the rock and burns red deep inside, silk guy-lines to the wall, legs feeling out of the dark."""
    root = empty('Nest'); rng = random.Random(4)
    rim = Piece('Nest_Rim'); CZ = .72
    axis = lambda c: Vector((0, c.y, CZ - .1 * max(0, (c.y - D) / -D)))
    def lip(bm):
        R, r = .62, .24; rows = []
        for i in range(36):
            u = i / 36 * math.tau; row = []
            for j in range(12):
                v = j / 12 * math.tau
                lump = 1 + .3 * noise.noise(Vector((math.cos(u) * 2, math.sin(u) * 2, v * .4))) + .15 * noise.noise(Vector((u * 3, v * 2, 1)))
                rr = r * lump * (1.3 if math.sin(u) < -.6 else 1)
                x = (R + rr * math.cos(v)) * math.cos(u); z = (R + rr * math.cos(v)) * math.sin(u) * 1.05 + CZ
                row.append(bm.verts.new((x, D - rr * math.sin(v) * 1.2, max(0, z))))
            rows.append(row)
        for i in range(36):
            for j in range(12): bm.faces.new((rows[i][j], rows[(i + 1) % 36][j], rows[(i + 1) % 36][(j + 1) % 12], rows[i][(j + 1) % 12]))
    rim.part('Goo', lip)
    def mound(bm):
        """The hood behind the lip, swelling as it meets the wall."""
        rows = []; n = 30
        for i in range(9):
            t = i / 8; y = D + .1 + t * (-D - .08); row = []
            for k in range(n):
                a = k / n * math.tau
                r = (.88 + .45 * t ** 1.4) * (1 + .16 * noise.noise(Vector((math.cos(a) * 1.8, math.sin(a) * 1.8, t * 2.2))))
                row.append(bm.verts.new((math.cos(a) * r * 1.08, y, max(0, CZ - .1 * t + math.sin(a) * r))))
            rows.append(row)
        made = []
        for i in range(8):
            for k in range(n): made.append(bm.faces.new((rows[i][k], rows[i][(k + 1) % n], rows[i + 1][(k + 1) % n], rows[i + 1][k])))
        facing_out(bm, made, axis)
    rim.part('Goo', mound)
    def on_mound(p):
        t = min(1, max(0, (p.y - D - .1) / (-D - .18))); cz = CZ - .1 * t
        a = math.atan2(p.z - cz, p.x / 1.08)
        r = (.88 + .45 * t ** 1.4) * (1 + .16 * noise.noise(Vector((math.cos(a) * 1.8, math.sin(a) * 1.8, t * 2.2)))) + .02
        return Vector((math.cos(a) * r * 1.08, D + .1 + t * (-D - .18), max(.02, cz + math.sin(a) * r)))
    rim.part('Goo', blob, (0, D - .5, 0), (.9, .6, .14), 2.1, floor=0)             # the spill at its lip
    for side in (-1, 1): rim.part('Goo', blob, (side * .95, D * .45, .25), (.35, .45, .4), 5.3 + side, floor=0)
    for k in range(6):                                                         # drips off the lip
        x = rng.uniform(-.55, .55); top = CZ + math.sqrt(max(0, .45 - x * x)) * 1.1
        rim.part('Goo', tube, [(x, D - .2, top), (x * 1.02, D - .25, top - .25), (x * 1.05, D - .26, top - .4 - rng.random() * .25)], lambda t: .07 * (1 - .5 * t) + .02 * (t > .9), 6)
    veins(rim, (0, D - .4, .05), (0, -1, 0), .9, 3, 11, 'floor', .03)
    for side in (-1, 1): veins(rim, (side * 1.2, -.04, .5), (side, 0, .6), .9, 3, 17 + side, 'wall', .028)
    for k in range(8):                                                         # veins over the mound
        a = k / 8 * math.pi + .2
        veins(rim, (math.cos(a) * .85, D + .1, CZ + math.sin(a) * .85), (math.cos(a) * .4, 1, math.sin(a) * .4), .7, 2, 60 + k, None, .022, on_mound)
    for k in range(9):                                                         # pustules round the lip
        a = rng.uniform(0, math.tau); rim.part('Glow', blob, (math.cos(a) * .66, D - .26, CZ + math.sin(a) * .7), (.045, .04, .045), k, .3, 1)
    rim.finish(root)
    # The throat: narrowing back toward the wall, shaded by depth in the game (dark at the mouth, red deep inside).
    maw = Piece('Nest_Maw')
    def throat(bm):
        rows = []; n = 18
        for i in range(10):
            t = i / 9; y = D + t * (-D - .05); r = .6 * (1 - .78 * t ** .8); cz = CZ - .18 * t
            row = []
            for k in range(n):
                a = k / n * math.tau; w = 1 + .12 * noise.noise(Vector((a, t * 3, 2)))
                row.append(bm.verts.new((math.cos(a) * r * w, y, cz + math.sin(a) * r * w * 1.05)))
            rows.append(row)
        for i in range(9):
            for k in range(n): bm.faces.new((rows[i][k], rows[i + 1][k], rows[i + 1][(k + 1) % n], rows[i][(k + 1) % n]))
        end = bm.verts.new((0, -.02, CZ - .2))
        for k in range(n): bm.faces.new((rows[-1][k], end, rows[-1][(k + 1) % n]))
    maw.part('Maw', throat); maw.finish(root)
    # Silk: guy-lines from the lip back to the wall, and a few across the mouth.
    silk = Piece('Nest_Silk')
    for k in range(18):
        a = k / 18 * math.tau + rng.uniform(-.15, .15)
        p0 = (math.cos(a) * .8, D + .05, max(.05, CZ + math.sin(a) * .8)); r1 = rng.uniform(1.4, 2.1)
        p1 = (math.cos(a) * r1, -.02, max(.02, CZ + math.sin(a) * r1 * .8))
        silk.part('Silk', strand, p0, p1, .05, .008, 8, 4)
    for k in range(5):
        a = rng.uniform(0, math.pi); b = a + math.pi + rng.uniform(-.6, .6)
        silk.part('Silk', strand, (math.cos(a) * .55, D - .1, CZ + math.sin(a) * .55), (math.cos(b) * .55, D - .1, CZ + math.sin(b) * .55), .12, .006, 10, 4)
    silk.finish(root)
    # Legs feeling out of the dark: separate so the game can twitch each about its root (deep in the throat).
    for k, (x, z, spread) in enumerate([(-.2, .55, -.6), (.2, .6, .55), (.0, .95, .1)]):
        leg = Piece(f'Nest_Leg{k}')
        root_at = Vector((x * .4, D + .55, z)); knee = Vector((x + spread * .45, D - .05, z + .45)); tip = Vector((x + spread * .85, D - .55, max(.04, z - .5)))
        pts = [root_at.lerp(knee, i / 5) for i in range(5)] + [knee.lerp(tip, i / 6) for i in range(1, 7)]
        leg.part('Chitin', tube, pts, lambda t: .04 * (1 - .8 * t) + .006, 6)
        leg.part('Chitin', blob, knee, (.05, .05, .05), k, .1, 1)
        leg.finish(root, tuple(root_at))
    return root

# ---- Silk: a wall sealing an opening, and cobwebs ----
def silk_wall():
    """Seals a 2 m opening between cells (the doorway runs along X, the room on -Y): a billowing sheet of silk on an
    arch of strands. The game tears holes in the sheet with a shader."""
    rng = random.Random(9); p = Piece('Silk_Wall')
    W = 1.1
    height = lambda x: 1.2 + 1.25 * math.sqrt(max(0, 1 - (x / W) ** 2))           # a doorway: straight sides, round top
    def sheet(bm):
        n, m = 26, 22; grid = []
        for i in range(m + 1):
            t = i / m; row = []
            for j in range(n + 1):
                u = j / n * 2 - 1; x = u * W; z = t * height(x)
                billow = .3 * (1 - u * u) * math.sin(t * math.pi) * (.8 + .4 * noise.noise(Vector((u * 2, t * 3, 4))))
                row.append(bm.verts.new((x, -billow, z)))
            grid.append(row)
        for i in range(m):
            for j in range(n): bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    arch = lambda u: Vector((math.cos(u) * W, 0, height(math.cos(u) * W) if 0 <= u <= math.pi else 0))
    p.part('Gauze', sheet)
    # The frame: strands from the arch inward and across, sagging toward the room.
    rim = [Vector((-W, 0, z)) for z in (.1, .6, 1.1)] + [arch(math.pi - math.pi * k / 16) for k in range(17)] + [Vector((W, 0, z)) for z in (1.1, .6, .1)]
    for k, a in enumerate(rim):
        b = Vector((rng.uniform(-.35, .35), -.2, rng.uniform(.6, 1.3)))
        p.part('Silk', strand, a, b, .1, .009, 10, 4)
    for k in range(len(rim) - 1): p.part('Silk', strand, rim[k], rim[k + 1], .03, .012, 4, 4)
    for k in range(14):
        a, b = rng.sample(rim, 2)
        if (a - b).length > 1: p.part('Silk', strand, a + Vector((0, -.05, 0)), b + Vector((0, -.05, 0)), rng.uniform(.15, .4), .006, 12, 4)
    p.part('Goo', blob, (-1.05, -.08, 0), (.35, .22, .2), 3, floor=0)
    p.part('Goo', blob, (1.08, -.08, 0), (.3, .2, .28), 4, floor=0)
    return p.finish()

def web_drape():
    """Cobwebs strung under the roof along a wall, with threads hanging into the room."""
    rng = random.Random(21); p = Piece('Web_Drape')
    tops = [Vector((x, rng.uniform(-.05, .05), 2.2 + rng.uniform(-.1, .2))) for x in (-.9, -.35, .3, .85)]
    for i in range(len(tops) - 1):
        for k in range(4): p.part('Silk', strand, tops[i] + Vector((0, -k * .08, 0)), tops[i + 1] + Vector((0, -k * .1, 0)), .15 + k * .1, .006, 10, 4)
    for k in range(7):
        a = tops[0].lerp(tops[-1], rng.random()) + Vector((0, -.1, -.2)); length = rng.uniform(.4, 1.2)
        p.part('Silk', tube, wander(a, (0, -.1, -1), length, 6, rng, .08), .005, 4)
        p.part('Goo', blob, a - Vector((0, 0, length)), (.025, .025, .035), k, .2, 1)
    for i in range(len(tops)):
        for k in range(3): p.part('Silk', strand, tops[i], tops[i] + Vector((rng.uniform(-.4, .4), -.9, -rng.uniform(.4, 1.1))), .1, .005, 8, 4)
    return p.finish()

# ---- Goo ----
def goo_pool():
    rng = random.Random(3); p = Piece('Goo_Pool')
    p.part('Goo', blob, (0, 0, 0), (1, .8, .07), 1.3, .3, 3, floor=0)
    for k in range(4):
        a = rng.uniform(0, math.tau); p.part('Goo', blob, (math.cos(a) * .95, math.sin(a) * .75, 0), (.3, .24, .05), k + 2, .3, 2, floor=0)
    veins(p, (0, 0, .06), (1, .3, 0), .85, 3, 5, 'floor', .022)
    veins(p, (0, 0, .06), (-1, -.4, 0), .75, 3, 6, 'floor', .02)
    for k in range(7):
        a = rng.uniform(0, math.tau); r = rng.uniform(.1, .6); p.part('Glow', blob, (math.cos(a) * r, math.sin(a) * r * .8, .06), (.04, .04, .03), k, .3, 1)
    return p.finish()

def goo_wall():
    """Goo poured down a wall (the wall at y = 0, the room on -Y): one bulging sheet, ragged at the top and sides,
    pooling at the foot, with red veins pressed into it."""
    rng = random.Random(8); p = Piece('Goo_Wall')
    top = lambda u: 2.0 + .35 * noise.noise(Vector((u * 2.2, 3, 1))) + .25 * math.cos(u * 1.4)
    width = lambda z: .62 + .14 * noise.noise(Vector((z * 1.8, 1, 4))) + .2 * max(0, .5 - z)
    def thick(u, z): return (.06 + .09 * (1 - u * u)) * (.7 + .5 * abs(noise.noise(Vector((u * 3, z * 2.5, 2))))) * (1 + 1.2 * max(0, .35 - z))
    def sheet(bm):
        cols, rows = 24, 30; grid = []
        for i in range(rows + 1):
            row = []
            for j in range(cols + 1):
                u = j / cols * 2 - 1; zt = top(u); z = zt * (1 - i / rows); w = width(z)
                row.append(bm.verts.new((u * w, -thick(u, z) * (1 - u ** 8), z)))
            grid.append(row)
        for i in range(rows):
            for j in range(cols): bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    p.part('Goo', sheet)
    for k in range(4):                                                        # runs spilling past the sheet's edges
        u = rng.choice((-1, 1)) * rng.uniform(.6, .95); z0 = rng.uniform(.8, 1.8)
        p.part('Goo', tube, [(u * .66, -.05, z0), (u * .7, -.07, z0 * .6), (u * .72, -.08, z0 * .3), (u * .74, -.1, .02)], lambda t: .035 + .03 * t, 6)
    p.part('Goo', blob, (0, -.32, 0), (.85, .45, .06), 4, .3, 3, floor=0)
    rngv = random.Random(13)
    for path, w in branches((0, -.2, .15), (0, 0, 1), 1.5, 4, rngv, 'wall', width=.03):
        pts = []
        for q in path:
            z = min(max(.05, q.z), 1.85); u = max(-.8, min(.8, q.x / max(.3, width(z))))
            pts.append(Vector((u * width(z), -thick(u, z) * (1 - u ** 8) - .012, z)))
        p.part('Glow', tube, pts, lambda t, w=w: w * (1 - .7 * t) + .004, 5)
    return p.finish()

# ---- Growths ----
def coral_bloom():
    """Lichen-coral spreading out of the goo: ruffled cups on knobbly stalks, crowding in rings, red at the lips."""
    rng = random.Random(14); p = Piece('Coral_Bloom')
    p.part('Goo', blob, (0, 0, 0), (.55, .45, .1), 1, .3, 3, floor=0)
    def cup(bm, c, r, tilt, seed, lip):
        """A ruffled cup: a wavy-edged dish with a thickened rim, opened toward `tilt`."""
        q = Vector((0, 0, 1)).rotation_difference(Vector(tilt).normalized()).to_matrix(); n, rings = 28, 6; rows = []
        waves = 5 + int(seed * 3) % 4
        for i in range(rings + 1):
            s = i / rings; row = []
            for k in range(n):
                a = k / n * math.tau; rr = r * s * (1 + .18 * s * math.sin(a * waves + seed) + .1 * noise.noise(Vector((a, s * 2, seed))))
                z = r * (.55 * s * s + .22 * s * math.sin(a * waves + seed) * s)
                row.append(bm.verts.new(Vector(c) + q @ Vector((math.cos(a) * rr, math.sin(a) * rr, z))))
            rows.append(row)
        made = []
        for i in range(rings):
            for k in range(n): made.append(bm.faces.new((rows[i][k], rows[i][(k + 1) % n], rows[i + 1][(k + 1) % n], rows[i + 1][k])))
        return rows[-1]
    stalks = []
    for k in range(17):
        a = rng.uniform(0, math.tau); d = rng.uniform(0, .45); h = rng.uniform(.05, .45) * (1.2 - d)
        foot = Vector((math.cos(a) * d, math.sin(a) * d * .85, .04)); top = foot + Vector((math.cos(a) * .12 * d, math.sin(a) * .12 * d, h))
        r = rng.uniform(.07, .19) * (1.1 - d * .6)
        p.part('Coral', tube, wander(foot, top - foot, (top - foot).length, 5, rng, .25), lambda t, r=r: r * .28 * (1 - .4 * t) + .012, 7)
        rim = p.part('Coral', cup, top, r, (math.cos(a) * d * .9, math.sin(a) * d * .9, 1), rng.random() * 9, True)
        stalks.append((top, r))
    for k, (top, r) in enumerate(stalks[:9]):                               # beads of red at the lips
        a = rng.uniform(0, math.tau); p.part('Glow', blob, top + Vector((math.cos(a) * r, math.sin(a) * r, r * .55)), (.018, .018, .018), k, .2, 1)
    for k in range(6):                                                       # brain-coral lumps at the foot
        a = rng.uniform(0, math.tau); p.part('Coral', blob, (math.cos(a) * .45, math.sin(a) * .38, .03), (.1, .09, .07), k * 1.7, .45, 2, floor=0)
    return p.finish()

def shard_cluster():
    rng = random.Random(6); p = Piece('Shard_Cluster')
    p.part('Goo', blob, (0, 0, 0), (.4, .36, .14), 2, .3, 3, floor=0)
    def shard(bm, at, direction, length, r):
        d = Vector(direction).normalized(); q = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
        m = Matrix.Translation(Vector(at) + d * length * .4) @ q
        bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r, radius2=r * .85, depth=length * .8, matrix=m)
        bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r * .85, radius2=0, depth=length * .3, matrix=Matrix.Translation(Vector(at) + d * length * .95) @ q)
    for k in range(8):
        a = rng.uniform(0, math.tau); tilt = rng.uniform(.15, .8)
        p.part('Crystal', shard, (math.cos(a) * .12, math.sin(a) * .12, .05), (math.cos(a) * tilt, math.sin(a) * tilt, 1), rng.uniform(.3, .85), rng.uniform(.035, .08))
    return p.finish()

# ---- The old builders' machinery, swallowed ----
def ring(bm, c, R, r, axis, segs=36, sides=8):
    q = Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized()).to_matrix()
    rows = []
    for i in range(segs):
        u = i / segs * math.tau; row = []
        for j in range(sides):
            v = j / sides * math.tau
            row.append(bm.verts.new(Vector(c) + q @ Vector(((R + r * math.cos(v)) * math.cos(u), (R + r * math.cos(v)) * math.sin(u), r * math.sin(v)))))
        rows.append(row)
    for i in range(segs):
        for j in range(sides): bm.faces.new((rows[i][j], rows[(i + 1) % segs][j], rows[(i + 1) % segs][(j + 1) % sides], rows[i][(j + 1) % sides]))

def box(bm, c, size, rot=0.):
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation(Vector(c)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((*size, 1)))

def relic_artifact():
    root = empty('Relic_Artifact'); p = Piece('Relic_Artifact_Body')
    p.part('Glow', bmesh.ops.create_icosphere, subdivisions=1, radius=.1, matrix=Matrix.Translation((0, 0, .3)))
    p.part('Alloy', ring, (0, 0, .3), .2, .018, (1, .2, .4))
    p.part('Alloy', ring, (0, 0, .3), .16, .015, (-.3, 1, .2))
    for k in range(4):
        a = k / 4 * math.tau + .4; p.part('Alloy', box, (math.cos(a) * .25, math.sin(a) * .25, .3), (.16, .02, .06), a)
    # The tar has most of it: a lump over one side and down into a puddle.
    p.part('Goo', blob, (.08, .02, .16), (.26, .22, .2), 3.3, .3, 3, floor=0)
    p.part('Goo', blob, (0, 0, 0), (.42, .36, .04), 5.1, .3, 2, floor=0)
    for k, x in enumerate((-.05, .14)): p.part('Goo', tube, [(x, -.18, .38), (x, -.21, .25), (x, -.22, .1)], lambda t: .03 + .015 * t, 6)
    veins(p, (.1, -.16, .05), (.2, -.3, 1), .35, 2, 31, None, .012, ((.08, .02, .16), (.26, .22, .2)))
    p.finish(root); return root

def relic_schematic():
    root = empty('Relic_Schematic'); p = Piece('Relic_Schematic_Body'); rng = random.Random(12)
    tilt = Matrix.Translation((0, .05, .26)) @ Matrix.Rotation(1.05, 4, 'X')
    p.part('Alloy', bmesh.ops.create_cube, size=1, matrix=tilt @ Matrix.Diagonal((.58, .38, .035, 1)))
    # Etched lines: a circuit of right-angled runs, still lit.
    for k in range(9):
        x, y = rng.uniform(-.24, .24), rng.uniform(-.15, .15); horiz = rng.random() < .5; L = rng.uniform(.08, .22)
        size = (L, .008, .006) if horiz else (.008, L, .006)
        p.part('Glow', bmesh.ops.create_cube, size=1, matrix=tilt @ Matrix.Translation((x, y, .019)) @ Matrix.Diagonal((*size, 1)))
    p.part('Glow', ring, tuple(tilt @ Vector((.12, .04, .019))), .06, .005, tuple(tilt.to_3x3() @ Vector((0, 0, 1))), 24, 4)
    # Tar eating the lower corner and holding it up.
    p.part('Goo', blob, (-.2, .02, .12), (.22, .2, .2), 2.2, .35, 3, floor=0)
    p.part('Goo', blob, (.05, .15, .05), (.4, .3, .07), 4.4, .3, 2, floor=0)
    p.part('Goo', tube, [(.18, -.06, .4), (.19, -.1, .25), (.2, -.12, .08)], lambda t: .022 + .01 * t, 6)
    p.finish(root); return root

def relic_heart():
    """An engine core of the old builders, fused into a nest mass: caged, still burning, pulsing."""
    root = empty('Relic_Heart'); rng = random.Random(2)
    mass = Piece('Relic_Heart_Mass')
    mass.part('Goo', blob, (0, 0, 0), (1.05, .95, .45), 1.1, .3, 3, floor=0)
    for k in range(5):
        a = k / 5 * math.tau; mass.part('Goo', blob, (math.cos(a) * .55, math.sin(a) * .5, .5), (.2, .2, .45), k + 3, .35, 2)
    for k in range(6):
        a = k / 6 * math.tau + .3; veins(mass, (math.cos(a) * .9, math.sin(a) * .8, .1), (-math.cos(a) * .3, -math.sin(a) * .3, 1), .9, 3, 40 + k, None, .03, ((0, 0, 0), (1.05, .95, .5)))
    for k in range(12):
        a = rng.uniform(0, math.tau); mass.part('Glow', blob, (math.cos(a) * rng.uniform(.4, .9), math.sin(a) * rng.uniform(.4, .8), rng.uniform(.25, .45)), (.05, .05, .05), k, .3, 1)
    mass.finish(root)
    cage = Piece('Relic_Heart_Cage')
    for z, R in ((.55, .42), (1.55, .3)): cage.part('Alloy', ring, (0, 0, z), R, .045, (0, 0, 1), 40, 8)
    for k in range(6):
        a = k / 6 * math.tau
        pts = [(math.cos(a) * (.42 + .14 * math.sin(t * math.pi)), math.sin(a) * (.42 + .14 * math.sin(t * math.pi)), .55 + t) for t in [i / 8 for i in range(9)]]
        pts = [(x * (1 - .28 * (z - .55)), y * (1 - .28 * (z - .55)), z) for x, y, z in pts]
        cage.part('Alloy', tube, pts, .035, 6)
    cage.part('Alloy', bmesh.ops.create_cone, cap_ends=True, segments=8, radius1=.14, radius2=.05, depth=.3, matrix=Matrix.Translation((0, 0, 1.72)))
    cage.finish(root)
    core = Piece('Relic_Heart_Core')
    core.part('Glow', blob, (0, 0, 1.05), (.2, .2, .42), 7, .12, 3)
    core.finish(root, (0, 0, 1.05))
    return root

# ---- Build, export, preview ----
roots = [nest(), silk_wall(), web_drape(), goo_pool(), goo_wall(), coral_bloom(), shard_cluster(), relic_artifact(), relic_schematic(), relic_heart()]
bpy.ops.object.select_all(action='DESELECT')
for o in scene.collection.objects: o.select_set(True)
bpy.context.view_layer.objects.active = roots[0]
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'infestation.glb'), export_format='GLB', use_selection=True, use_active_scene=True,
                          export_apply=True, export_yup=True, export_animations=False, export_materials='EXPORT')
tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in scene.collection.objects if o.type == 'MESH'}

for i, o in enumerate(roots): o.location = ((i % 5 - 2) * 3.1, (i // 5) * 3.6, 0)
world = bpy.data.worlds.new('Infestation studio'); made['worlds'].append(world); world.use_nodes = True; scene.world = world
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (.03, .03, .04, 1); bg.inputs[1].default_value = .5
def aim(o, target): o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()
for name, loc, power in [('Key', (-4, -7, 7), 1600), ('Rim', (5, 6, 4), 700)]:
    d = bpy.data.lights.new(name, 'AREA'); made['lights'].append(d); d.energy = power; d.size = 4
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.location = loc; aim(o, (0, 1.5, .8))
cd = bpy.data.cameras.new('Infestation'); made['cameras'].append(cd); cam = bpy.data.objects.new('Infestation', cd); scene.collection.objects.link(cam)
cd.lens = 30; cam.location = (0, -12.5, 8.5); aim(cam, (0, 1.9, .5)); scene.camera = cam
engines = {e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
for engine in ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES']:
    if engine in engines: scene.render.engine = engine; break
scene.render.resolution_x = 1600; scene.render.resolution_y = 900; scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(OUT, 'infestation.png'); bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(os.path.join(OUT, 'infestation-library.blend'), {scene}, fake_user=True)

bpy.context.window.scene = previous_scene
for o in list(scene.collection.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.data.scenes.remove(scene)
for kind, coll in (('meshes', bpy.data.meshes), ('lights', bpy.data.lights), ('cameras', bpy.data.cameras), ('worlds', bpy.data.worlds), ('materials', bpy.data.materials)):
    for d in made[kind]:
        if d.users == 0: coll.remove(d)
print('LUNAR_INFESTATION_READY', tris)
