"""Export the approved icon meshes as a normalized, reusable game-item GLB.

Copies evaluated geometry from inventory-library.blend into a temporary scene,
merges by material, limits dense bevel geometry, and restores the user's scene.
Every Item_<id> has a centered ground origin and longest dimension of one metre.
"""
from pathlib import Path
import json
import math
import bpy
from mathutils import Vector

ROOT=Path('/Users/gabe/Documents/Playground/lunar-art-test/game')
OUT=ROOT/'assets/inventory'
BUDGETS={'metal':350,'silicon':650,'crop':1600,'meal':1500,'core':1100,
         'frame':1000,'wing':1200,'chip':1600,'satellite':2000,'titanium':300,
         'rareearth':250,'artifact':150,'heart':200,'flare':850,
         'greens':900,'soy':900,'tomato':900,'algae':700,'wheat':700,'mushroom':900,'flour':700,'protein':500,
         'salad':1200,'bread':900,'stew':1000,'broth':1000,'algaecake':900,'pizza':1400,'medkit':800,'regolith':150,'ice':150}


def triangles(o):
    return sum(len(p.vertices)-2 for p in o.data.polygons)


def extra_item(scene,key):
    material=bpy.data.materials.new('Item / '+key)
    material.use_nodes=True
    shader=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value=(*((.34,.31,.27) if key=='regolith' else (.47,.72,.87)),1)
    shader.inputs['Roughness'].default_value=.95 if key=='regolith' else .25
    shader.inputs['Metallic'].default_value=0 if key=='regolith' else .1
    if key=='ice':
        shader.inputs['Emission Color'].default_value=(.08,.22,.30,1)
        shader.inputs['Emission Strength'].default_value=.15
    for i,(loc,scale) in enumerate([((-.22,.06,.24),(.37,.32,.32)),((.24,.06,.18),(.27,.25,.23)),((0,-.23,.15),(.24,.22,.20))]):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=loc)
        o=bpy.context.object; o.scale=scale; o.rotation_euler=(i*.3,i*.5,i*.8)
        o.data.materials.append(material)


def export_models():
    previous=bpy.context.window.scene
    created_scene=bpy.data.scenes.new('Inventory / game export')
    before={name:set(getattr(bpy.data,name)) for name in ['objects','meshes','materials','cameras','lights','worlds','scenes']}
    imported=[]
    report={}
    try:
        with bpy.data.libraries.load(str(OUT/'inventory-library.blend')) as (source,target):
            target.scenes=[n for n in source.scenes if n.startswith('Inventory study / ')]
        imported=list(target.scenes)
        for key,budget in BUDGETS.items():
            source_scene=next((s for s in imported if s.name.split(' / ')[-1].split('.')[0]==key),None)
            source_meshes=[]
            if source_scene:
                bpy.context.window.scene=source_scene
                deps=bpy.context.evaluated_depsgraph_get()
                for obj in source_scene.objects:
                    if obj.type!='MESH': continue
                    evaluated=obj.evaluated_get(deps)
                    data=bpy.data.meshes.new_from_object(evaluated,depsgraph=deps)
                    data.transform(obj.matrix_world)
                    source_meshes.append(bpy.data.objects.new('Game '+key,data))
            bpy.context.window.scene=created_scene
            if not source_scene:
                existing=set(created_scene.objects)
                extra_item(created_scene,key)
                source_meshes=[o for o in created_scene.objects if o not in existing]
            else:
                for obj in source_meshes: created_scene.collection.objects.link(obj)
            bpy.ops.object.select_all(action='DESELECT')
            for obj in source_meshes: obj.select_set(True)
            bpy.context.view_layer.objects.active=source_meshes[0]
            # Bake all transforms, preserving the exact icon silhouettes and material colors.
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
            bpy.ops.object.join()
            obj=bpy.context.object
            raw=triangles(obj)
            if raw>budget:
                mod=obj.modifiers.new('Game bevel simplification','DECIMATE')
                mod.ratio=budget/raw; mod.use_collapse_triangulate=True
                bpy.ops.object.modifier_apply(modifier=mod.name)
            points=[v.co for v in obj.data.vertices]
            low=Vector(tuple(min(v[i] for v in points) for i in range(3)))
            high=Vector(tuple(max(v[i] for v in points) for i in range(3)))
            size=max(high-low)
            origin=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
            for v in obj.data.vertices: v.co=(v.co-origin)/size
            total=triangles(obj)
            # One material part per item: instancing reuses each part across the entire belt network.
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.separate(type='MATERIAL')
            bpy.ops.object.mode_set(mode='OBJECT')
            parts=list(bpy.context.selected_objects)
            parent=bpy.data.objects.new('Item_'+key,None)
            parent['item']=key; parent['normalized']=True
            created_scene.collection.objects.link(parent)
            for index,part in enumerate(parts):
                part.name=f'Item_{key}_part{index:02d}'
                part.parent=parent
            report[key]={'triangles':total,'materialParts':len(parts),'originalTriangles':raw}
            print('GAME_ITEM',key,report[key])
        bpy.ops.object.select_all(action='SELECT')
        # glTF's callback-backed format enum can report an empty RNA list; GLB is
        # the same format used by the project's other Blender export scripts.
        bpy.ops.export_scene.gltf(filepath=str(OUT/'items.glb'),export_format='GLB',use_selection=True,
                                  use_active_scene=True,export_apply=True,export_yup=True,
                                  export_animations=False,export_cameras=False,export_lights=False)
        (OUT/'models.json').write_text(json.dumps(report,indent=2)+'\n')
        print('INVENTORY_MODELS_READY',str(OUT/'items.glb'))
    finally:
        bpy.context.window.scene=previous
        # Remove only data created or loaded by this exporter; leave the open file intact.
        for name in ['objects','scenes','meshes','materials','cameras','lights','worlds']:
            collection=getattr(bpy.data,name)
            for data in list(collection):
                if data not in before[name] or data==created_scene:
                    collection.remove(data,do_unlink=True)


if __name__=='__main__': export_models()
