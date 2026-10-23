"""Build every carried-item icon using the approved inventory study's studio.

Run with Blender --background --python. Also safe to exec in a separate namespace
inside live Blender: build_inventory(), render_icon(key), cleanup().
"""
from pathlib import Path
import math
import os
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
            'lettuce': mat('crisp lettuce', (.22,.48,.07), 0,.7),
            'lettuce_pale': mat('lettuce heart', (.55,.72,.25), 0,.7),
            'pod': mat('soy pod', (.42,.5,.17), 0,.8),
            'bean': mat('soybean', (.78,.64,.32), 0,.6),
            'tomato': mat('ripe tomato', (.72,.06,.02), 0,.28),
            'calyx': mat('tomato calyx', (.07,.22,.04), 0,.8),
            'algae': mat('algae culture', (.08,.42,.24), .05,.2,.25),
            'wheat': mat('ripe wheat', (.78,.55,.18), 0,.7),
            'wheat_head': mat('wheat ear', (.86,.66,.27), 0,.65),
            'cap': mat('mushroom cap', (.55,.38,.24), 0,.6),
            'stem': mat('mushroom stem', (.86,.83,.74), 0,.75),
            'gill': mat('mushroom gills', (.42,.33,.26), 0,.9),
            'sack': mat('flour sack', (.82,.76,.6), 0,.9),
            'tofu': mat('pressed soy protein', (.6,.4,.17), 0,.65),
            'crust': mat('baked crust', (.36,.14,.035), 0,.75),
            'crumb': mat('bread crumb', (.93,.83,.6), 0,.9),
            'broth': mat('amber broth', (.5,.22,.02), .1,.15),
            'stew': mat('thick stew', (.2,.06,.015), 0,.5),
            'sauce': mat('tomato sauce', (.6,.08,.02), 0,.45),
            'cheese': mat('melted cheese', (.98,.82,.42), 0,.5),
            'goo': mat('black goo', (.008,.008,.01), .25,.05),
            'olive': mat('rifle olive ceramic', (.13,.15,.11), .15,.55),
            'brass': mat('cartridge brass', (.72,.48,.16), .85,.3),
            'gunmetal': mat('blued gunmetal', (.035,.042,.05), .7,.38),
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


def regolith(p):
    materials(p)
    p.setdefault('regolith', mat('lunar regolith', (.11,.1,.088), 0,.97))
    p.setdefault('regolith_dark', mat('regolith shadow grit', (.05,.046,.04), 0,1))
    rng=random.Random(5)
    for i,(loc,scale) in enumerate([((-.2,.1,.24),(.36,.33,.26)),((.24,.06,.2),(.3,.28,.21)),((.02,-.24,.17),(.27,.24,.18)),((-.02,.18,.42),(.22,.2,.17))]):
        ico('Regolith / clod',loc,scale,p['regolith'],i+21)
    for i in range(14):
        a=rng.uniform(0,math.tau); r=rng.uniform(.32,.6)
        ico('Regolith / grit',(math.cos(a)*r,math.sin(a)*r,.05),(rng.uniform(.05,.09),)*2+(.05,),p['regolith_dark' if i%2 else 'regolith'],i+40)


def ice(p):
    materials(p)
    p.setdefault('ice', mat('water ice', (.12,.42,.75), .05,.1,.25))
    p.setdefault('ice_frost', mat('frosted ice face', (.55,.8,.95), 0,.45))
    for i,(loc,scale) in enumerate([((-.16,.06,.3),(.38,.33,.32)),((.27,-.04,.23),(.3,.27,.25)),((0,-.27,.17),(.24,.22,.19))]):
        o=ico('Ice / chunk',loc,scale,p['ice'],i+31)
        o.data.materials.append(p['ice_frost'])
        for face in o.data.polygons:
            if face.index%4==i: face.material_index=1


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


def sphere(name,loc,scale,material,rotation=(0,0,0),segments=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=max(6,segments//2),radius=1,location=loc)
    o=bpy.context.object; o.scale=scale; o.rotation_euler=rotation
    return finish(o,name,material,smooth=True)


def tapered(name,loc,r1,r2,depth,material,vertices=24):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth,location=loc)
    return finish(bpy.context.object,name,material,.015)


def bowl(p,name,radius=.52,height=.34,fill=None):
    tapered(name+' / bowl',(0,0,height/2),radius*.62,radius,height,p['ivory'])
    tapered(name+' / foot',(0,0,.02),radius*.5,radius*.55,.04,p['dark'])
    if fill: cylinder(name+' / surface',(0,0,height+.005),radius*.9,.02,p[fill],24)


def greens(p):
    materials(p)
    for ring,(r,z,n,tilt,shade) in enumerate([(.36,.2,8,.9,'lettuce'),(.2,.34,6,.6,'lettuce'),(.06,.44,4,.3,'lettuce_pale')]):
        for i in range(n):
            a=i*math.tau/n+ring*.4
            sphere('Greens / leaf',(math.cos(a)*r,math.sin(a)*r,z),(.34-ring*.06,.2-ring*.03,.07),p[shade],(0,-tilt,a))


def soy(p):
    materials(p)
    for i,(x,y,a) in enumerate([(-.3,.05,.4),(0,-.05,-.1),(.3,.1,.3)]):
        sphere('Soy / pod',(x,y,.14+i*.02),(.13,.46,.09),p['pod'],(0,0,a))
        for t in [-.25,0,.25]:
            sphere('Soy / bean bulge',(x-math.sin(a)*t,y+math.cos(a)*t,.2+i*.02),(.1,.11,.07),p['pod'],(0,0,a),10)
    for x,y in [(-.05,-.48),(.15,-.42),(.32,-.52)]:
        sphere('Soy / loose bean',(x,y,.07),(.09,.11,.075),p['bean'],segments=10)


def tomato(p):
    materials(p)
    for x,y,r in [(-.2,.08,.4),(.34,-.2,.27)]:
        sphere('Tomato / fruit',(x,y,r*.82),(r,r,r*.82),p['tomato'],segments=20)
        star=[(x,y,r*1.66)]
        for i in range(10):
            a=i*math.tau/10; q=r*(.42 if i%2==0 else .14)
            star.append((x+math.cos(a)*q,y+math.sin(a)*q,r*1.6))
        mesh('Tomato / calyx',star,[(0,i+1,(i+1)%10+1) for i in range(10)],p['calyx'])
        cylinder('Tomato / stem',(x,y,r*1.72),.03,.12,p['calyx'],6)


def algae(p):
    materials(p)
    cylinder('Algae / culture vessel',(0,0,.55),.3,.8,p['algae'],24)
    for z in [.12,.98]: cylinder('Algae / cap',(0,0,z),.33,.12,p['dark'],24)
    for z in [.4,.7]: cylinder('Algae / band',(0,0,z),.315,.05,p['ivory'],24)
    cylinder('Algae / valve',(0,0,1.1),.08,.12,p['orange'],10)
    for i,(x,y,z) in enumerate([(.12,-.24,.5),(-.05,-.27,.68),(.08,-.25,.82)]):
        sphere('Algae / bubble',(x,y,z),(.04,.03,.04),p['lettuce_pale'],segments=8)


def wheat(p):
    materials(p)
    for i in range(7):
        a=(i-3)*.13; b=(i%3-1)*.12
        top=Vector((math.sin(a)*.9,math.sin(b)*.5,1.0)); base=Vector((math.sin(a)*.05,math.sin(b)*.04,0))
        beam('Wheat / stalk',base,top,.03,p['wheat'])
        d=(top-base).normalized()
        o=ico('Wheat / ear',top+d*.17,(.06,.06,.22),p['wheat_head'],i)
        o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    cylinder('Wheat / binding',(0,0,.35),.12,.09,p['orange'],12)


def mushroom(p):
    materials(p)
    for x,y,h,r in [(-.22,.1,.5,.36),(.3,-.05,.34,.26),(.05,-.35,.22,.18)]:
        cylinder('Mushroom / stem',(x,y,h/2),r*.32,h,p['stem'],12)
        sphere('Mushroom / cap',(x,y,h),(r,r,r*.55),p['cap'],segments=18)
        cylinder('Mushroom / gills',(x,y,h-.01),r*.92,.02,p['gill'],18)


def flour(p):
    materials(p)
    box('Flour / sack',(0,0,.42),(.82,.56,.84),p['sack'],.16)
    tapered('Flour / gathered neck',(0,0,.95),.2,.08,.22,p['sack'],12)
    sphere('Flour / tuft',(0,0,1.08),(.14,.12,.08),p['sack'],segments=10)
    cylinder('Flour / tie',(0,0,.97),.11,.05,p['orange'],10)
    box('Flour / label',(0,-.29,.45),(.5,.02,.32),p['orange'],.03)
    box('Flour / label mark',(0,-.305,.45),(.24,.01,.06),p['ivory'],.01)


def protein(p):
    materials(p)
    for i,(x,y,z,a) in enumerate([(-.1,.05,.12,.1),(.12,-.08,.36,-.12),(-.04,.04,.6,.25)]):
        box('Protein / pressed block',(x,y,z),(.78,.42,.22),p['tofu'],.05,a)
        box('Protein / wrapper band',(x,y,z),(.2,.44,.235),p['ivory'],.02,a)


def salad(p):
    materials(p)
    bowl(p,'Salad')
    for i in range(7):
        a=i*math.tau/7
        sphere('Salad / leaf',(math.cos(a)*.26,math.sin(a)*.26,.4),(.2,.12,.06),p['lettuce'],(0,-.5,a),12)
    for i,(x,y) in enumerate([(-.1,-.12),(.16,.05),(-.05,.2)]):
        sphere('Salad / tomato wedge',(x,y,.45),(.1,.1,.08),p['tomato'],segments=12)


def bread(p):
    materials(p)
    sphere('Bread / loaf',(0,.12,.28),(.62,.34,.3),p['crust'],segments=20)
    for i in range(3):
        sphere('Bread / score',(-.3+i*.3,.12,.55),(.06,.2,.03),p['crumb'],(0,0,.6),10)
    box('Bread / slice crust',(.22,-.4,.04),(.5,.42,.07),p['crust'],.05)
    box('Bread / slice',(.22,-.4,.08),(.44,.36,.02),p['crumb'],.02)


def stew(p):
    materials(p)
    bowl(p,'Stew',fill='stew')
    for i,(x,y,m) in enumerate([(-.18,.05,'food'),(.14,.16,'tofu'),(.05,-.18,'food'),(.22,-.05,'tofu')]):
        box('Stew / chunk',(x,y,.38),(.13,.13,.1),p[m],.03,i)
    beam('Stew / spoon',(.15,-.1,.32),(.62,-.45,.62),.04,p['silver'])


def broth(p):
    materials(p)
    bowl(p,'Broth',fill='broth')
    for x,y in [(-.15,.05),(.12,.15),(.08,-.16)]:
        sphere('Broth / mushroom slice',(x,y,.36),(.1,.1,.03),p['cap'],segments=12)
    for x,y in [(-.05,-.2),(.22,-.02)]:
        sphere('Broth / greens',(x,y,.36),(.08,.05,.02),p['lettuce'],segments=8)


def algaecake(p):
    materials(p)
    cylinder('Algae cakes / plate',(0,0,.03),.62,.05,p['ivory'],28)
    for i,(x,y,z) in enumerate([(-.2,.1,.1),(.22,.05,.1),(0,-.02,.24)]):
        cylinder('Algae cakes / patty',(x,y,z),.25,.12,p['algae'],20)
        cylinder('Algae cakes / seared edge',(x,y,z),.255,.05,p['crust'],20)


def pizza(p):
    materials(p)
    cylinder('Pizza / crust',(0,0,.05),.62,.09,p['crust'],32)
    cylinder('Pizza / sauce',(0,0,.1),.54,.02,p['sauce'],32)
    rng=random.Random(5)
    for i in range(9):
        a=rng.uniform(0,math.tau); r=rng.uniform(.05,.42)
        sphere('Pizza / cheese',(math.cos(a)*r,math.sin(a)*r,.115),(.11,.09,.025),p['cheese'],(0,0,a),10)
    for a in [.4,1.9,3.3,4.6]:
        sphere('Pizza / mushroom',(math.cos(a)*.3,math.sin(a)*.3,.13),(.07,.07,.02),p['cap'],segments=10)
    for a in [1.1,2.6,5.4]:
        sphere('Pizza / tomato',(math.cos(a)*.2,math.sin(a)*.2,.13),(.07,.07,.02),p['tomato'],segments=10)
    for i in range(3):
        box('Pizza / cut',(0,0,.125),(1.18,.012,.012),p['dark'],0,i*math.pi/3)


def medkit(p):
    materials(p)
    box('Medkit / case',(0,0,.3),(1.0,.62,.56),p['ivory'],.06)
    box('Medkit / seam',(0,0,.4),(1.02,.64,.03),p['dark'],.01)
    box('Medkit / cross',(0,-.315,.28),(.28,.02,.09),p['orange'],.01)
    box('Medkit / cross',(0,-.315,.28),(.09,.02,.28),p['orange'],.01)
    box('Medkit / lid cross',(0,0,.585),(.34,.11,.02),p['orange'],.01)
    box('Medkit / lid cross',(0,0,.585),(.11,.34,.02),p['orange'],.01)
    beam('Medkit / handle',(-.2,0,.62),(.2,0,.62),.06,p['dark'])
    for x in [-.36,.36]: box('Medkit / latch',(x,-.32,.42),(.1,.03,.1),p['silver'],.01)


def goo(p):
    materials(p)
    cylinder('Goo / sample vial',(0,0,.55),.3,.78,p['goo'],24)
    for z in [.12,.98]: cylinder('Goo / cap',(0,0,z),.33,.14,p['ivory'],24)
    cylinder('Goo / seal band',(0,0,.55),.315,.08,p['orange'],24)
    for i,(x,z) in enumerate([(.12,.38),(-.08,.72),(.18,.82)]):
        sphere('Goo / lit pustule',(x,-.27,z),(.05,.04,.05),p['red'],segments=10)



def along_x(name,x0,x1,z,radius,material,vertices=16):
    return cylinder(name,((x0+x1)/2,0,z),radius,x1-x0,material,vertices,(0,math.pi/2,0))


def pistol(p):
    materials(p)
    beam('Pistol / grip',(-.22,0,.5),(-.4,0,.02),.24,p['dark'])
    box('Pistol / backstrap',(-.36,0,.28),(.05,.18,.32),p['orange'],.01)
    box('Pistol / frame',(.06,0,.5),(.86,.22,.16),p['gunmetal'],.03)
    box('Pistol / slide',(.12,0,.7),(1.0,.27,.25),p['gunmetal'],.04)
    box('Pistol / rib',(.12,0,.84),(.8,.08,.03),p['ivory'],.01)
    for y in [-.137,.137]: box('Pistol / power cell',(.12,y,.5),(.44,.01,.05),p['cyan'],0)
    box('Pistol / ejection port',(.05,-.137,.72),(.22,.01,.1),p['dark'],0)
    along_x('Pistol / muzzle',.62,.72,.7,.075,p['dark'])
    box('Pistol / guard',(-.02,0,.36),(.3,.12,.04),p['gunmetal'],.01)
    box('Pistol / front sight',(.54,0,.86),(.05,.04,.06),p['orange'],.01)


def rifle(p):
    materials(p)
    box('Rifle / body',(0,0,.5),(.9,.2,.24),p['olive'],.04)
    box('Rifle / butt',(-.52,0,.47),(.16,.21,.34),p['dark'],.03)
    box('Rifle / butt plate',(-.61,0,.47),(.03,.17,.3),p['orange'],.01)
    beam('Rifle / grip',(.0,0,.4),(-.1,0,.06),.17,p['dark'])
    beam('Rifle / magazine',(-.26,0,.4),(-.3,0,.12),.18,p['gunmetal'])
    box('Rifle / handguard',(.56,0,.52),(.42,.21,.2),p['ivory'],.03)
    for y in [-.107,.107]: box('Rifle / vent',(.56,y,.52),(.3,.01,.04),p['dark'],0)
    beam('Rifle / fore-grip',(.48,0,.42),(.45,0,.22),.11,p['dark'])
    along_x('Rifle / barrel',.77,1.05,.52,.04,p['silver'])
    along_x('Rifle / muzzle brake',1.0,1.12,.52,.065,p['dark'])
    box('Rifle / rail',(.12,0,.64),(.7,.08,.04),p['gunmetal'],.01)
    along_x('Rifle / scope',-.05,.38,.75,.075,p['dark'])
    along_x('Rifle / scope lens',.37,.4,.75,.06,p['cyan'])
    for x in [.04,.28]: box('Rifle / scope mount',(x,0,.68),(.06,.06,.08),p['dark'],.01)
    for y in [-.105,.105]: box('Rifle / power cell',(.0,y,.55),(.42,.01,.04),p['cyan'],0)


def flamethrower(p):
    materials(p)
    along_x('Flamethrower / body',-.42,.55,.55,.17,p['dark'],20)
    along_x('Flamethrower / cap',-.52,-.4,.55,.19,p['orange'],20)
    along_x('Flamethrower / nozzle',.55,.92,.55,.08,p['silver'])
    along_x('Flamethrower / nozzle bell',.9,1.0,.55,.11,p['dark'])
    box('Flamethrower / heat shield',(.2,0,.76),(.72,.3,.05),p['ivory'],.02)
    for x in [.0,.12,.24,.36]: box('Flamethrower / shield slot',(x,0,.79),(.04,.22,.02),p['dark'],0)
    beam('Flamethrower / grip',(-.2,0,.42),(-.3,0,.02),.18,p['dark'])
    beam('Flamethrower / handle',(.38,0,.42),(.34,0,.08),.13,p['dark'])
    box('Flamethrower / fuel cell',(.06,0,.32),(.3,.24,.2),p['orange'],.03)
    along_x('Flamethrower / gauge',-.06,-.02,.76,.07,p['cyan'])
    box('Flamethrower / pilot',(.86,0,.43),(.1,.06,.05),p['ember'],.01)


def rounds(p):
    materials(p)
    box('Rounds / clip',(0,0,.06),(.92,.4,.12),p['dark'],.03)
    box('Rounds / clip stripe',(0,-.205,.07),(.92,.01,.04),p['orange'],0)
    for i in range(5):
        for j,y in enumerate([-.09,.09]):
            x=-.32+i*.16+j*.04
            cylinder('Rounds / brass case',(x,y,.38),.065,.52,p['brass'],12)
            tapered('Rounds / tip',(x,y,.7),.065,.02,.14,p['silver'],12)


def fuel(p):
    materials(p)
    cylinder('Fuel cell / canister',(0,0,.5),.3,.8,p['orange'],24)
    for z in [.08,.94]: cylinder('Fuel cell / cap',(0,0,z),.32,.12,p['dark'],24)
    box('Fuel cell / window',(0,-.29,.5),(.2,.04,.42),p['goo'],.02)
    for z in [.36,.5,.64]: sphere('Fuel cell / glow',(0,-.31,z),(.05,.03,.05),p['red'],segments=10)
    box('Fuel cell / valve',(0,0,1.04),(.12,.12,.1),p['silver'],.02)
    for z in [.24,.76]: cylinder('Fuel cell / band',(0,0,z),.31,.05,p['dark'],24)


BUILDERS = [('metal',study['metal']),('silicon',silicon),('regolith',regolith),('ice',ice),('crop',study['potatoes']),('greens',greens),
            ('soy',soy),('tomato',tomato),('algae',algae),('wheat',wheat),('mushroom',mushroom),
            ('flour',flour),('protein',protein),('meal',meal),('salad',salad),('bread',bread),('stew',stew),
            ('broth',broth),('algaecake',algaecake),('pizza',pizza),('medkit',medkit),('core',core),
            ('frame',frame),('wing',wing),('chip',study['chip']),('satellite',satellite),('titanium',titanium),
            ('rareearth',rareearth),('artifact',study['artifact']),('heart',heart),('goo',goo),('flare',flare),('rounds',rounds),('fuel',fuel),('pistol',pistol),('rifle',rifle),('flamethrower',flamethrower)]


def build_inventory():
    study['build_study'](BUILDERS,library_name='inventory-library.blend')


render_icon=study['render_icon']
cleanup=study['cleanup']


if __name__=='__main__':
    build_inventory()
    try:
        # LUNAR_ICONS=greens,soy renders just those; the library always holds every item.
        only=[k for k in os.environ.get('LUNAR_ICONS','').split(',') if k]
        for key,_ in BUILDERS:
            if not only or key in only: render_icon(key)
    finally:
        cleanup()
