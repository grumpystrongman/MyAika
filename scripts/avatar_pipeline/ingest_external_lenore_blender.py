import argparse
import math
import sys
from pathlib import Path

import bpy

HUMANOID_BONE_RENAMES = {
    "CC_Base_Hip": "Hips",
    "CC_Base_Waist": "Spine",
    "CC_Base_Spine01": "Spine1",
    "CC_Base_Spine02": "Spine2",
    "CC_Base_NeckTwist02": "Neck",
    "CC_Base_Head": "Head",
    "CC_Base_L_Eye": "LeftEye",
    "CC_Base_R_Eye": "RightEye",
    "CC_Base_L_Clavicle": "LeftShoulder",
    "CC_Base_L_Upperarm": "LeftArm",
    "CC_Base_L_Forearm": "LeftForeArm",
    "CC_Base_L_Hand": "LeftHand",
    "CC_Base_L_Thumb1": "LeftHandThumb1",
    "CC_Base_L_Thumb2": "LeftHandThumb2",
    "CC_Base_L_Thumb3": "LeftHandThumb3",
    "CC_Base_L_Index1": "LeftHandIndex1",
    "CC_Base_L_Index2": "LeftHandIndex2",
    "CC_Base_L_Index3": "LeftHandIndex3",
    "CC_Base_L_Mid1": "LeftHandMiddle1",
    "CC_Base_L_Mid2": "LeftHandMiddle2",
    "CC_Base_L_Mid3": "LeftHandMiddle3",
    "CC_Base_L_Ring1": "LeftHandRing1",
    "CC_Base_L_Ring2": "LeftHandRing2",
    "CC_Base_L_Ring3": "LeftHandRing3",
    "CC_Base_L_Pinky1": "LeftHandPinky1",
    "CC_Base_L_Pinky2": "LeftHandPinky2",
    "CC_Base_L_Pinky3": "LeftHandPinky3",
    "CC_Base_R_Clavicle": "RightShoulder",
    "CC_Base_R_Upperarm": "RightArm",
    "CC_Base_R_Forearm": "RightForeArm",
    "CC_Base_R_Hand": "RightHand",
    "CC_Base_R_Thumb1": "RightHandThumb1",
    "CC_Base_R_Thumb2": "RightHandThumb2",
    "CC_Base_R_Thumb3": "RightHandThumb3",
    "CC_Base_R_Index1": "RightHandIndex1",
    "CC_Base_R_Index2": "RightHandIndex2",
    "CC_Base_R_Index3": "RightHandIndex3",
    "CC_Base_R_Mid1": "RightHandMiddle1",
    "CC_Base_R_Mid2": "RightHandMiddle2",
    "CC_Base_R_Mid3": "RightHandMiddle3",
    "CC_Base_R_Ring1": "RightHandRing1",
    "CC_Base_R_Ring2": "RightHandRing2",
    "CC_Base_R_Ring3": "RightHandRing3",
    "CC_Base_R_Pinky1": "RightHandPinky1",
    "CC_Base_R_Pinky2": "RightHandPinky2",
    "CC_Base_R_Pinky3": "RightHandPinky3",
    "CC_Base_L_Thigh": "LeftUpLeg",
    "CC_Base_L_Calf": "LeftLeg",
    "CC_Base_L_Foot": "LeftFoot",
    "CC_Base_L_ToeBase": "LeftToeBase",
    "CC_Base_R_Thigh": "RightUpLeg",
    "CC_Base_R_Calf": "RightLeg",
    "CC_Base_R_Foot": "RightFoot",
    "CC_Base_R_ToeBase": "RightToeBase",
}


def normalize_humanoid_rig():
    armature = next((obj for obj in bpy.data.objects if obj.type == "ARMATURE"), None)
    if not armature:
        return
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    for old_name, new_name in HUMANOID_BONE_RENAMES.items():
        bone = armature.data.edit_bones.get(old_name)
        if bone:
            bone.name = new_name
    bpy.ops.object.mode_set(mode="OBJECT")


def setup_render(preview_path: Path):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.1, 0.04, 0.05, 1)
    bg.inputs[1].default_value = 0.35

    cam_data = bpy.data.cameras.new('Cam')
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (0.0, -2.3, 1.28)
    cam.rotation_euler = (math.radians(87.5), 0.0, 0.0)
    cam.data.lens = 58

    def add_area(name, energy, location, rotation_deg):
        light = bpy.data.lights.new(name=name, type='AREA')
        light.energy = energy
        light.shape = 'RECTANGLE'
        light.size = 1.2
        light.size_y = 1.7
        obj = bpy.data.objects.new(name=name, object_data=light)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = tuple(math.radians(v) for v in rotation_deg)

    add_area('Key', 1300, (0.8, -1.2, 1.6), (58, 0, 25))
    add_area('Fill', 450, (-0.9, -1.35, 1.42), (60, 0, -25))
    scene.render.filepath = str(preview_path)


def export_glb(output_path: Path):
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format='GLB',
        export_image_format='AUTO',
        export_texcoords=True,
        export_normals=True,
        export_skins=True,
        export_morph=True,
        export_animations=True,
        export_yup=True,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-path', required=True)
    parser.add_argument('--source-type', required=True, choices=['fbx', 'blend'])
    parser.add_argument('--output-glb', required=True)
    parser.add_argument('--preview-png', required=True)
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1 :]
    else:
        argv = argv[1:]
    args = parser.parse_args(argv)

    source_path = Path(args.source_path)
    output_glb = Path(args.output_glb)
    preview_png = Path(args.preview_png)
    output_glb.parent.mkdir(parents=True, exist_ok=True)
    preview_png.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    if args.source_type == 'fbx':
        bpy.ops.import_scene.fbx(filepath=str(source_path))
    else:
        bpy.ops.wm.open_mainfile(filepath=str(source_path))

    normalize_humanoid_rig()
    export_glb(output_glb)
    setup_render(preview_png)
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
