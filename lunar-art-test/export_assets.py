"""Run after build_scene.py to refresh previews and GLB exports."""
import bpy, os, io, contextlib
from mathutils import Vector
OUT=os.path.dirname(os.path.abspath(__file__))
s=bpy.context.scene

def export(name, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),use_selection=True,
            export_format='GLB',export_apply=True,export_animations=True)

export('lunar-art-test',[o for o in s.objects if o.type in {'MESH','EMPTY'}])
for prefix,filename in [('ASTRONAUT','astronaut'),('MINER','regolith-miner')]:
    r=next(o for o in s.objects if o.name.startswith(prefix))
    old=r.location.copy()
    try:
        r.location=Vector((0,0,0));bpy.context.view_layer.update()
        export(filename,[r,*r.children_recursive])
    finally:
        r.location=old;bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
s.frame_set(1)
s.render.filepath=os.path.join(OUT,'lunar-art-test.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'lunar-art-test.blend'))
bpy.ops.render.render(write_still=True)
print('Refreshed scene GLB, astronaut GLB, miner GLB, blend and PNG.')
