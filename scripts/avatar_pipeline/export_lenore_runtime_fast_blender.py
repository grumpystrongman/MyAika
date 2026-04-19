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
    world = bpy.data.worlds.new("LenoreRuntimeFastWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.12, 0.05, 0.07, 1)
    bg.inputs[1].default_value = 0.42

    cam_data = bpy.data.cameras.new("LenoreRuntimeFastCam")
    cam = bpy.data.objects.new("LenoreRuntimeFastCam", cam_data)
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


def find_armature():
    return next((obj for obj in bpy.data.objects if obj.type == "ARMATURE"), None)


def reset_armature_to_neutral_pose(armature):
    if armature.animation_data is None:
        armature.animation_data_create()
    armature.animation_data.action = None
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")
    for pose_bone in armature.pose.bones:
        if pose_bone.rotation_mode != "QUATERNION":
            pose_bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")


def reset_shape_keys_to_neutral():
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.data.shape_keys:
            continue
        for key_block in obj.data.shape_keys.key_blocks:
            if key_block.name == "Basis":
                continue
            key_block.value = 0.0


def apply_conversation_rest_pose(armature):
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")
    overrides = {
        "CC_Base_L_Clavicle": (-0.01, -0.003, -0.05),
        "CC_Base_R_Clavicle": (-0.01, 0.003, 0.05),
        "CC_Base_L_Upperarm": (0.06, -0.02, -0.16),
        "CC_Base_R_Upperarm": (0.06, 0.02, 0.16),
        "CC_Base_L_Forearm": (0.14, 0.02, 0.03),
        "CC_Base_R_Forearm": (0.14, -0.02, -0.03),
        "CC_Base_NeckTwist01": (0.008, 0.004, 0.0),
        "CC_Base_NeckTwist02": (0.008, 0.004, 0.0),
        "CC_Base_Head": (0.02, 0.006, 0.0),
    }
    for bone_name, rotation in overrides.items():
        pose_bone = armature.pose.bones.get(bone_name)
        if not pose_bone:
            continue
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = rotation
    bpy.ops.object.mode_set(mode="OBJECT")


def create_pose_clip(name: str, start_frame: int = 1, end_frame: int = 2):
    armature = find_armature()
    if not armature:
        raise RuntimeError("armature_not_found")
    reset_armature_to_neutral_pose(armature)
    apply_conversation_rest_pose(armature)
    action = bpy.data.actions.new(name)
    armature.animation_data.action = action
    scene = bpy.context.scene
    for frame in (start_frame, end_frame):
        scene.frame_set(frame)
        for pose_bone in armature.pose.bones:
            if pose_bone.rotation_mode == "QUATERNION":
                pose_bone.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            else:
                pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame)
            pose_bone.keyframe_insert(data_path="location", frame=frame)
            pose_bone.keyframe_insert(data_path="scale", frame=frame)
    scene.frame_start = start_frame
    scene.frame_end = end_frame
    scene.frame_set(start_frame)
    return action


def is_normal_like(image: bpy.types.Image) -> bool:
    name = str(image.name or "").lower()
    filepath = str(image.filepath or "").lower()
    return "normal" in name or "normal" in filepath


def clamp_power_of_two(value: int, max_size: int) -> int:
    target = min(value, max_size)
    size = 1
    while size < target:
        size *= 2
    prev_size = max(1, size // 2)
    if abs(prev_size - target) < abs(size - target):
        size = prev_size
    return min(size, max_size)


def optimize_images(max_size: int, normal_max_size: int):
    optimized = []
    for image in bpy.data.images:
        if image.source != "FILE":
            continue
        if image.size[0] <= 0 or image.size[1] <= 0:
            continue
        if image.type not in {"IMAGE", "MULTILAYER"}:
            continue
        source_max = normal_max_size if is_normal_like(image) else max_size
        width, height = int(image.size[0]), int(image.size[1])
        longest = max(width, height)
        if longest <= source_max:
            optimized.append((image.name, width, height, width, height))
            continue
        scale = source_max / float(longest)
        next_width = max(1, clamp_power_of_two(int(round(width * scale)), source_max))
        next_height = max(1, clamp_power_of_two(int(round(height * scale)), source_max))
        image.scale(next_width, next_height)
        optimized.append((image.name, width, height, next_width, next_height))
    return optimized


def export_glb(output_path: Path, use_draco: bool = False):
    export_props = bpy.ops.export_scene.gltf.get_rna_type().properties
    args = dict(
        filepath=str(output_path),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_skins=True,
        export_morph=True,
        export_animations=True,
        export_yup=True,
    )
    if "export_image_format" in export_props:
        formats = {item.identifier for item in export_props["export_image_format"].enum_items}
        args["export_image_format"] = "WEBP" if "WEBP" in formats else "AUTO"
    if "export_image_quality" in export_props:
        args["export_image_quality"] = 72
    if use_draco and "export_draco_mesh_compression_enable" in export_props:
        args["export_draco_mesh_compression_enable"] = True
        if "export_draco_mesh_compression_level" in export_props:
            args["export_draco_mesh_compression_level"] = 6
        if "export_draco_position_quantization" in export_props:
            args["export_draco_position_quantization"] = 12
        if "export_draco_normal_quantization" in export_props:
            args["export_draco_normal_quantization"] = 10
        if "export_draco_texcoord_quantization" in export_props:
            args["export_draco_texcoord_quantization"] = 12
        if "export_draco_color_quantization" in export_props:
            args["export_draco_color_quantization"] = 10
        if "export_draco_generic_quantization" in export_props:
            args["export_draco_generic_quantization"] = 12
    bpy.ops.export_scene.gltf(**args)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-blend", required=True)
    parser.add_argument("--output-glb", required=True)
    parser.add_argument("--preview-png", required=True)
    parser.add_argument("--max-size", type=int, default=1024)
    parser.add_argument("--normal-max-size", type=int, default=1024)
    parser.add_argument("--draco", action="store_true")
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
    bpy.context.scene.frame_set(1)
    reset_shape_keys_to_neutral()
    action = create_pose_clip("LenoreRuntimePose", 1, 2)
    armature = find_armature()
    if armature and armature.animation_data:
        armature.animation_data.action = action
    bpy.context.scene.frame_set(1)
    optimize_images(args.max_size, args.normal_max_size)
    export_glb(output_glb, use_draco=args.draco)
    setup_render(preview_png)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
