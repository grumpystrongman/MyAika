import argparse
import math
import sys
from pathlib import Path

import bpy


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block_collection in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.actions, bpy.data.cameras, bpy.data.lights):
        for block in list(block_collection):
            if block.users == 0:
                block_collection.remove(block)


def setup_render(preview_path: Path):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    world = bpy.data.worlds.new("LenoreImportedWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.12, 0.05, 0.07, 1)
    bg.inputs[1].default_value = 0.42

    cam_data = bpy.data.cameras.new("LenoreImportedCam")
    cam = bpy.data.objects.new("LenoreImportedCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (0.0, -2.2, 1.3)
    cam.rotation_euler = (math.radians(87.5), 0.0, 0.0)
    cam.data.lens = 58

    def add_area(name, energy, location, rotation_deg):
        light = bpy.data.lights.new(name=name, type="AREA")
        light.energy = energy
        light.shape = "RECTANGLE"
        light.size = 1.2
        light.size_y = 1.7
        obj = bpy.data.objects.new(name=name, object_data=light)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = tuple(math.radians(v) for v in rotation_deg)

    add_area("Key", 1300, (0.8, -1.2, 1.6), (58, 0, 25))
    add_area("Fill", 450, (-0.9, -1.35, 1.42), (60, 0, -25))
    add_area("Rim", 320, (0.0, 1.35, 1.5), (-62, 0, 180))
    scene.render.filepath = str(preview_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-glb", required=True)
    parser.add_argument("--preview-png", required=True)
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = argv[1:]
    args = parser.parse_args(argv)

    source_glb = Path(args.source_glb)
    preview_png = Path(args.preview_png)
    preview_png.parent.mkdir(parents=True, exist_ok=True)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source_glb))
    bpy.context.scene.frame_set(1)
    setup_render(preview_png)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
