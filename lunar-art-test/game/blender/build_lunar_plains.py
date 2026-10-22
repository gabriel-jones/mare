"""Concept-guided lunar rock kit. Run in Blender; preserves existing scenes.
Reference: art-direction/lunar-voxel-plains-concept.png (built-in image generation).
"""
import bpy, math, random, os
from mathutils import Vector
OUT='/Users/gabe/Documents/Playground/lunar-art-test/game/assets'
scene=bpy.data.scenes.new('Lunar plains • beveled voxel terrain kit')
bpy.context.window.scene=scene
rng=random.Random(1847)
mat=bpy.data.materials.new('Plains • painted basalt and pale regolith');mat.use_nodes=True
bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bsdf.inputs['Roughness'].default_value=.97
paint=mat.node_tree.nodes.new('ShaderNodeVertexColor');paint.layer_name='Paint';mat.node_tree.links.new(paint.outputs['Color'],bsdf.inputs['Base Color'])
all_assets=[]
def mesh(name,vs,fs,bevel=0):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);me.materials.append(mat)
 if bevel:
  bpy.context.view_layer.objects.active=o;o.select_set(True);mod=o.modifiers.new('Soft chipped rock edges','BEVEL');mod.width=bevel;mod.segments=1
  bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
 me=o.data;colors=me.color_attributes.new(name='Paint',type='FLOAT_COLOR',domain='CORNER');me.color_attributes.active_color=colors
 for p in me.polygons:
  p.use_smooth=True
  for li in p.loop_indices:
   v=me.vertices[me.loops[li].vertex_index].co;top=max(0,p.normal.z)
   wash=(math.sin(v.x*1.8+v.y*.9)+math.sin(v.z*2.1-v.y))*.023
   dust=min(.8,max(0,.14+top*.65+v.z*.008));base=(.205,.19,.245);pale=(.47,.425,.355)
   colors.data[li].color=tuple(base[k]*(1-dust)+pale[k]*dust+wash for k in range(3))+(1,)
 try:
  mod=o.modifiers.new('Broad sculpted plane normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=40;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 except Exception:pass
 return o

def stone(name,w,d,h,seed,loc=(0,0,0),lean=.1):
 r=random.Random(seed);n=10;angles=[i*math.tau/n+r.uniform(-.1,.1) for i in range(n)];outline=[r.uniform(.84,1.12) for _ in range(n)]
 vs=[];rings=[(0,.86),(.12,1),(.56,.92),(1,.66)]
 for j,(z,scale) in enumerate(rings):
  for i,a in enumerate(angles):
   shift=.07*math.sin(i*2.3+j*1.7);vs.append((loc[0]+math.cos(a)*w*.5*outline[i]*(scale+shift)+z*h*lean,loc[1]+math.sin(a)*d*.5*outline[i]*(scale+shift),loc[2]+h*z+(r.uniform(-.07,.07)*h if j==3 else 0)))
 fs=[tuple(reversed(range(n)))];
 for j in range(3):
  for i in range(n):a=j*n+i;b=j*n+(i+1)%n;fs.append((a,b,b+n,a+n))
 # Uneven plateau with a sloping top, rather than a conical low-poly boulder.
 fs.append(tuple(3*n+i for i in range(n)))
 return mesh(name,vs,fs,min(w,d,h)*.028)

def join(objects,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name;scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');return o

def export(name,objects,gallery):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False,export_yup=True,export_apply=True)
 for o in objects:o.location+=Vector(gallery)
 all_assets.extend(objects)
 print(name, 'triangles',sum(len(p.vertices)-2 for o in objects for p in o.data.polygons))

for i,(name,w,d,h) in enumerate([('rock-a',2,1.65,2.2),('rock-b',2.5,1.9,1.25),('rock-c',1.5,1.8,2.8)]):
 pieces=[stone(name+' • core',w,d,h,300+i*7),stone(name+' • broken shelf',w*.65,d*.6,h*.55,304+i*7,(w*.5,d*.2,-.04),-.12)]
 o=join(pieces,name);export(name,[o],(i*5-7,0,0))

# A proper hollow arch with extruded, hand-shaped rock planes and separate roof.
left=stone('CavePillarLeft',3.4,5,5.8,512,(-4.1,1.3,-.15),.05)
right=stone('CavePillarRight',3.7,5.4,5.3,514,(4.3,1.5,-.15),-.06)
vs=[];n=12
for y in [-.7,3.8]:
 for outer in [0,1]:
  for i in range(n+1):
   a=i/n*math.pi;w=2.65+outer*1.7;h=4.6+outer*1.45
   vs.append((math.cos(a)*w,y+.18*math.sin(a*5),math.sin(a)*h))
fs=[];stride=n+1
for i in range(n):
 a=i;b=i+stride;c=i+stride*2;d=i+stride*3
 fs.extend([(a,a+1,b+1,b),(c,d,d+1,c+1),(a,c,c+1,a+1),(b,b+1,d+1,d)])
fs.extend([(0,stride,stride*3,stride*2),(n,n+stride*2,n+stride*3,n+stride)])
roof=mesh('ArchRoof',vs,fs,.08)
for v in roof.data.vertices:
 a=math.atan2(v.co.z/5.2,v.co.x/3.5);v.co.x*=1+.07*math.sin(a*3+.4);v.co.z*=1+.08*math.sin(a*5+.7)
roof.data.update()
rubble=[stone('Talus'+str(i),1.1+i*.25,1.3,.5+i*.12,900+i,((-1 if i%2 else 1)*(3.1+i*.45),-1-i*.25,-.06)) for i in range(4)]
body=join([left,right]+rubble,'CaveShoulders');export('cave-mouth',[body,roof],(0,10,0))

# Keep the actual concept in the editable Blender project as a packed reference.
reference=bpy.data.images.load('/Users/gabe/Documents/Playground/lunar-art-test/game/art-direction/lunar-voxel-plains-concept.png',check_existing=True);reference.pack()
scene['art_direction']='Open rolling lunar plains; hand-painted basalt; layered shelves; isolated cave hills. Concept packed in this file.'
world=bpy.data.worlds.new('Plains studio');world.use_nodes=True;next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs[0].default_value=(.12,.14,.20,1);scene.world=world
bpy.ops.object.light_add(type='AREA',location=(-8,-6,18));bpy.context.object.data.energy=2200;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=9
bpy.ops.object.light_add(type='AREA',location=(8,7,12));bpy.context.object.data.energy=1600;bpy.context.object.data.size=7
bpy.ops.object.camera_add(location=(22,-31,25));camera=bpy.context.object;camera.rotation_euler=(Vector((0,5,2))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=33;scene.camera=camera
scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'lunar-plains-kit.blend'))
print('Saved lunar-plains-kit.blend with concept reference and authored assets')
