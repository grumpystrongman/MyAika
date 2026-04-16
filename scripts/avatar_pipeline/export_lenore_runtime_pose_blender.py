import argparse
import math
import sys
from pathlib import Path

import bpy


def setup_render(preview_path: Path):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    world = bpy.data.worlds.new("LenoreRuntimeWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.12, 0.05, 0.07, 1)
    bg.inputs[1].default_value = 0.42

    cam_data = bpy.data.cameras.new("LenoreRuntimeCam")
    cam = bpy.data.objects.new("LenoreRuntimeCam", cam_data)
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

    add_area("Key", 1400, (0.85, -1.1, 1.6), (58, 0, 26))
    add_area("Fill", 520, (-0.9, -1.3, 1.4), (61, 0, -28))
    add_area("Rim", 320, (0.0, 1.35, 1.5), (-62, 0, 180))
    scene.render.filepath = str(preview_path)


def find_armature():
    return next((obj for obj in bpy.data.objects if obj.type == "ARMATURE"), None)


def apply_current_pose_as_rest():
    armature = find_armature()
    if not armature:
        raise RuntimeError("armature_not_found")
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def export_glb(output_path: Path):
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
        export_skins=True,
        export_morph=True,
        export_animations=False,
        export_yup=True,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-blend", required=True)
    parser.add_argument("--output-glb", required=True)
    parser.add_argument("--preview-png", required=True)
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = argv[1:]
    args = parser.parse_args(argv)

    source_blend = Path(args.source_blend)
    output_glb = Path(args.output_glb)
    preview_png = Path(args.preview_png)
    output_glb.parent.mkdir(parents=True, exist_ok=True)
    preview_png.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=str(source_blend))
    bpy.context.scene.frame_set(bpy.context.scene.frame_current)
    apply_current_pose_as_rest()
    export_glb(output_glb)
    setup_render(preview_png)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
