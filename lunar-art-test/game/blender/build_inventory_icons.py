"""Build all 14 carried-item icons using the approved inventory study's studio.

Run with Blender --background --python. Also safe to exec in a separate namespace
inside live Blender: build_inventory(), render_icon(key), cleanup().
"""
from pathlib import Path
import math
import random
import bpy
from mathutils import Vector

ROOT = Path('/Users/gabe/Documents/Playground/lunar-art-test/game')
study = {'__name__': 'lunar_inventory_helpers'}
exec(compile((ROOT / 'blender/build_inventory_study.py').read_text(), 'build_inventory_study.py', 'exec'),study)
study['OUT'] = ROOT / 'assets/inventory'
box, mesh, finish, mat, diamond = (study[k] for k in ['box','mesh','finish','mat','diamond'])


def materials(p):
    if 'red' not in p:
        p.update({
            'red': mat('deep heart crimson', (.8,.018,.006), .18,.32,1.4),
            'violet': mat('rare-earth violet', (.31,.13,.65), .24,.27,.3),
            'violet_light': mat('rare-earth pale facet', (.57,.32,.88), .24,.27,.3),
            'ore': mat('raw titanium matrix', (.16,.14,.12), .42,.6),
            'rust': mat('titanium seam copper', (.60,.29,.11), .5,.4),
            'orange': mat('burnt orange safety', (.8,.21,.045), .15,.45),
            'food': mat('cooked potato', (.65,.40,.14), 0,.85),
            'leaf': mat('green garnish', (.09,.25,.035), 0,.8),
        })
    return p


def beam(name,a,b,width,material):
    a,b = Vector(a),Vector(b)
    o = box(name,(a+b)/2,(width,width,(b-a).length),material,min(width*.2,.025))
    o.rotation_euler = (b-a).to_track_quat('Z','Y').to_euler()
    return o


def cylinder(name,loc,radius,depth,material,vertices=16,rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
    o = bpy.context.object
    if rotation: o.rotation_euler = rotation
    return finish(o,name,material,.012)


def ico(name,loc,scale,material,seed=0):
    rng = random.Random(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=loc)
    o = bpy.context.object
    for v in o.data.vertices: v.co *= rng.uniform(.88,1.12)
    o.scale = scale
    o.rotation_euler = (.25,.14,seed*.5)
    return finish(o,name,material)


def silicon(p):
    for i in range(3):
        x,y,z = -.09+i*.09,.06-i*.08,.08+i*.15
        box('Silicon / wafer edge',(x,y,z),(1.05,.91,.11),p['silver'],.025)
        box('Silicon / polished wafer',(x,y,z+.055),(1.01,.87,.025),p['navy'],.022)
    box('Silicon / wafer reflection',(.02,-.1,.442),(.045,.62,.008),p['cyan'],.003)


def meal(p):
    materials(p)
    box('Meal / tray bottom',(0,0,.08),(1.25,.91,.17),p['dark'],.09)
    box('Meal / ceramic rim',(0,0,.17),(1.29,.94,.12),p['ivory'],.085)
    box('Meal / left compartment',(-.22,0,.235),(.68,.73,.025),p['dark'],.07)
    box('Meal / right compartment',(.41,0,.235),(.37,.73,.025),p['dark'],.05)
    for i,(x,y) in enumerate([(-.37,-.18),(-.1,-.18),(-.37,.14),(-.1,.14)]):
        box('Meal / roast potato',(x,y,.34),(.24,.27,.18),p['food'],.055,angle=(i-1)*.12)
    for i in range(3):
        o = ico('Meal / greens',(.41,(i-1)*.2,.29),(.14,.16,.085),p['leaf'],i+3)
    # Folded utensil along the front edge, kept broad enough to survive downsampling.
    box('Meal / utensil handle',(-.19,-.43,.26),(.51,.035,.025),p['silver'],.01)


def core(p):
    materials(p)
    box('Core / graphite cassette',(0,0,.65),(.77,.47,1.20),p['dark'],.06)
    for x in [-.32,.32]:
        box('Core / ivory armor rail',(x,-.05,.65),(.17,.53,1.15),p['ivory'],.035)
    box('Core / glass module',(0,-.251,.66),(.31,.035,.79),p['navy'],.025)
    for z in [.38,.61,.84]:
        box('Core / active register',(0,-.279,z),(.24,.025,.10),p['cyan'],.012)
    box('Core / extraction latch',(0,0,1.29),(.59,.27,.12),p['orange'],.04)
    for i in range(4):
        box('Core / connector',((i-1.5)*.14,0,.035),(.08,.30,.13),p['gold'],.012)


def frame(p):
    materials(p)
    corners = [(x,y,z) for z in [.1,.99] for y in [-.46,.46] for x in [-.46,.46]]
    for i,a in enumerate(corners):
        for j,b in enumerate(corners):
            if j>i and sum(abs(a[k]-b[k])>.01 for k in range(3))==1:
                beam('Frame / structural beam',a,b,.09,p['silver'])
    for a,b in [(0,3),(4,7),(0,5),(1,7)]:
        beam('Frame / diagonal brace',corners[a],corners[b],.047,p['ivory'])
    for x in [-.46,.46]:
        box('Frame / orange coupling',(x,-.46,.1),(.15,.16,.16),p['orange'],.025)


def panel(p,center,width,height,name='Solar wing'):
    x,y,z = center
    box(name+' / frame',(x,y,z),(width,height,.09),p['ivory'],.025)
    box(name+' / inset',(x,y,z+.052),(width-.07,height-.07,.025),p['dark'],.008)
    cols,rows = 3,2
    gap=.025; cw=(width-.12-gap*(cols-1))/cols; ch=(height-.12-gap)/rows
    for col in range(cols):
        for row in range(rows):
            px=x+(col-1)*(cw+gap); py=y+(row-.5)*(ch+gap)
            box(name+' / photovoltaic cell',(px,py,z+.075),(cw,ch,.025),p['navy'],.009)
            box(name+' / bus bar',(px,py,z+.09),(.012,ch*.87,.004),p['silver'],.001)


def wing(p):
    materials(p)
    panel(p,(0,0,.13),1.5,.9)
    box('Solar wing / hinge',(-.87,0,.12),(.25,.28,.14),p['dark'],.02)
    cylinder('Solar wing / pivot',(-.89,0,.21),.105,.12,p['gold'])


def satellite(p):
    materials(p)
    box('Satellite / foil bus',(0,0,.30),(.55,.55,.53),p['gold'],.04)
    box('Satellite / instrument face',(0,-.29,.35),(.4,.035,.31),p['ivory'],.02)
    box('Satellite / lens',(0,-.32,.36),(.19,.025,.16),p['navy'],.025)
    for side in [-1,1]:
        box('Satellite / wing strut',(side*.48,0,.29),(.49,.07,.06),p['silver'],.01)
        panel(p,(side*.92,0,.30),.73,.64,'Satellite solar wing')
    beam('Satellite / antenna mast',(0,0,.57),(0,0,.93),.035,p['silver'])
    cylinder('Satellite / dish',(0,0,.94),.20,.05,p['ivory'],16,rotation=(.3,0,0))
    beam('Satellite / dish feed',(0,-.02,.96),(0,-.06,1.09),.024,p['gold'])


def titanium(p):
    materials(p)
    for i,(loc,scale) in enumerate([((-.24,.12,.36),(.48,.44,.43)),((.32,-.09,.29),(.38,.35,.31)),((-.12,-.31,.21),(.30,.26,.24))]):
        o=ico('Titanium / ore matrix',loc,scale,p['ore'],i+11)
        o.data.materials.append(p['rust'])
        for face in o.data.polygons:
            if face.index%5==i: face.material_index=1
    beam('Titanium / exposed vein',(-.38,-.24,.49),(-.04,-.27,.66),.055,p['rust'])


def crystal(p,name,loc,radius,height,rotation=0):
    x,y,z=loc
    sides=5
    verts=[]
    for h,r in [(0,radius*.85),(height*.69,radius),(height,radius*.025)]:
        for i in range(sides):
            a=i*math.tau/sides+rotation
            verts.append((x+math.cos(a)*r,y+math.sin(a)*r,z+h))
    faces=[tuple(reversed(range(sides)))]
    for row in range(2):
        for i in range(sides): faces.append((row*sides+i,row*sides+(i+1)%sides,(row+1)*sides+(i+1)%sides,(row+1)*sides+i))
    o=mesh(name,verts,faces,p['violet'])
    o.data.materials.append(p['violet_light'])
    for face in o.data.polygons:
        if face.index%3==0: face.material_index=1
    return o


def rareearth(p):
    materials(p)
    crystal(p,'Rare earth / main crystal',(-.08,.08,.02),.27,1.28,.2)
    crystal(p,'Rare earth / side crystal',(.31,-.13,.02),.19,.82,-.2)
    crystal(p,'Rare earth / small crystal',(-.37,-.19,.02),.15,.59,.7)
    ico('Rare earth / base',(.03,0,.09),(.48,.35,.12),p['ore'],8)


def heart(p):
    materials(p)
    ico('Heart / radiant deep mineral',(0,0,.66),(.45,.36,.56),p['red'],4)
    for i,(loc,scale) in enumerate([((-.31,.02,.72),(.20,.36,.47)),((.30,.09,.75),(.21,.30,.42)),((0,.02,.24),(.33,.31,.22))]):
        ico('Heart / fractured outer shell',loc,scale,p['relic'],i+3)
    # Offset top shards leave a broad red fissure through the center.
    diamond('Heart / upper plate',[(.92,.17,.16),(1.23,.02,.015)],p['relic'],x=-.13,y=.08)
    diamond('Heart / lower red shard',[(.02,.01,.01),(.28,.19,.15),(.50,.08,.06)],p['red'],x=.04,y=-.02)


def flare(p):
    materials(p)
    a,b=Vector((-.20,-.40,.13)),Vector((.17,.30,1.05))
    direction=(b-a).normalized()
    angle=direction.to_track_quat('Z','Y').to_euler()
    cylinder('Flare / orange body',(a+b)/2,.115,(b-a).length,p['orange'],12,angle)
    for t in [.12,.22,.79]:
        cylinder('Flare / ivory identification band',a.lerp(b,t),.12,.07,p['ivory'],12,angle)
    cylinder('Flare / end cap',a,.125,.10,p['dark'],12,angle)
    cylinder('Flare / ignition cap',b,.13,.11,p['dark'],12,angle)
    ico('Flare / burning tip',b+direction*.14,(.095,.095,.17),p['ember'],3)


BUILDERS = [('metal',study['metal']),('silicon',silicon),('crop',study['potatoes']),
            ('meal',meal),('core',core),('frame',frame),('wing',wing),('chip',study['chip']),
            ('satellite',satellite),('titanium',titanium),('rareearth',rareearth),
            ('artifact',study['artifact']),('heart',heart),('flare',flare)]


def build_inventory():
    study['build_study'](BUILDERS,library_name='inventory-library.blend')


render_icon=study['render_icon']
cleanup=study['cleanup']


if __name__=='__main__':
    build_inventory()
    try:
        for key,_ in BUILDERS: render_icon(key)
    finally:
        cleanup()
