import argparse
import bmesh
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def find_image_node(material, image_name):
    for node in material.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and getattr(node, 'image', None) and node.image.name == image_name:
            return node
    return None


def load_image(path: Path):
    existing = bpy.data.images.get(path.name)
    if existing:
        existing.filepath = str(path)
        existing.reload()
        return existing
    return bpy.data.images.load(str(path), check_existing=True)


def replace_material_images(textures_dir: Path):
    replacements = [
        ('Head', 'Image_11', textures_dir / 'head_basecolor.png'),
        ('Body', 'Image_1', textures_dir / 'body_basecolor.png'),
        ('avaturn_hair_0_material', 'Image_17', textures_dir / 'hair_basecolor.png'),
        ('avaturn_hair_1_material', 'Image_17', textures_dir / 'hair_basecolor.png'),
        ('avaturn_look_0_material', 'Image_24', textures_dir / 'outfit_basecolor.png'),
        ('avaturn_shoes_0_material', 'Image_20', textures_dir / 'shoes_basecolor.png'),
    ]
    for mat_name, image_name, path in replacements:
        material = bpy.data.materials.get(mat_name)
        if not material or not material.node_tree:
            continue
        node = find_image_node(material, image_name)
        if node:
            node.image = load_image(path)


def configure_materials():
    for material in bpy.data.materials:
        if not material.node_tree:
            continue
        bsdf = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue
        name = material.name.lower()
        if 'head' in name or name == 'body':
            bsdf.inputs['Roughness'].default_value = 0.82
            bsdf.inputs['Metallic'].default_value = 0.0
            bsdf.inputs['Specular IOR Level'].default_value = 0.24
        elif 'hair' in name:
            bsdf.inputs['Roughness'].default_value = 0.74
            bsdf.inputs['Metallic'].default_value = 0.0
            bsdf.inputs['Specular IOR Level'].default_value = 0.22
        elif 'look' in name:
            bsdf.inputs['Roughness'].default_value = 0.97
            bsdf.inputs['Metallic'].default_value = 0.0
            bsdf.inputs['Specular IOR Level'].default_value = 0.12
        elif 'shoes' in name:
            bsdf.inputs['Roughness'].default_value = 0.9
            bsdf.inputs['Metallic'].default_value = 0.0
            bsdf.inputs['Specular IOR Level'].default_value = 0.18


def gaussian(value, center, scale):
    return math.exp(-(((value - center) / scale) ** 2))


def deform_object(obj_name, transform_fn):
    obj = bpy.data.objects.get(obj_name)
    if not obj or obj.type != 'MESH':
        return
    mesh = obj.data
    matrix = obj.matrix_world.copy()
    inverse = matrix.inverted()
    for vertex in mesh.vertices:
        world = matrix @ vertex.co
        updated = transform_fn(world.copy())
        vertex.co = inverse @ updated
    mesh.update()


def delete_outfit_center_faces(obj_name: str):
    obj = bpy.data.objects.get(obj_name)
    if not obj or obj.type != 'MESH':
        return
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    world_matrix = obj.matrix_world.copy()
    faces_to_delete = []
    for face in bm.faces:
        center = world_matrix @ face.calc_center_median()
        if center.y < -0.06 or center.z < 0.88 or center.z > 1.24:
            continue
        threshold = max(0.08, 0.31 - ((1.24 - center.z) * 0.34))
        if abs(center.x) < threshold:
            faces_to_delete.append(face)
    if faces_to_delete:
        bmesh.ops.delete(bm, geom=faces_to_delete, context='FACES')
        bm.to_mesh(mesh)
        mesh.update()
    print(f'delete_outfit_center_faces: {len(faces_to_delete)} faces removed')
    bm.free()


def body_transform(world: Vector) -> Vector:
    for center_x in (-0.17, 0.17):
        influence = gaussian(world.x, center_x, 0.12) * gaussian(max(world.y, 0.0), 0.03, 0.08) * gaussian(world.z, 0.95, 0.17)
        side = -1.0 if center_x < 0 else 1.0
        world.y += 0.05 * influence
        world.z += 0.024 * influence
        world.x += side * 0.014 * influence

    if world.y > -0.01 and 0.72 < world.z < 1.02 and 0.12 < abs(world.x) < 0.34:
        tuck = gaussian(abs(world.x), 0.22, 0.09) * gaussian(world.z, 0.83, 0.16)
        world.x -= math.copysign(0.018 * tuck, world.x)
        world.y -= 0.01 * tuck
    return world


def outfit_transform(world: Vector) -> Vector:
    world = body_transform(world)
    if world.y > -0.02 and 0.93 < world.z < 1.17 and abs(world.x) < 0.24:
        center = max(0.0, 1.0 - (abs(world.x) / 0.24))
        vertical = gaussian(world.z, 1.04, 0.13)
        plunge = center * vertical
        world.z -= 0.12 * plunge
        world.y -= 0.028 * plunge
    return world


def hair_transform(world: Vector) -> Vector:
    if world.z > 1.67:
        crown = gaussian(world.x, 0.0, 0.18) * gaussian(max(world.y, 0.0), 0.03, 0.12) * gaussian(world.z, 1.77, 0.12)
        world.z += 0.04 * crown
        world.y += 0.008 * crown
    if world.y > 0.035 and world.z > 1.56:
        fringe = gaussian(world.x, 0.0, 0.2) * gaussian(world.y, 0.09, 0.05) * gaussian(world.z, 1.66, 0.11)
        world.z -= 0.03 * fringe
        world.y += 0.025 * fringe
    if abs(world.x) > 0.13 and world.z > 1.56:
        side_sweep = gaussian(abs(world.x), 0.16, 0.07) * gaussian(world.z, 1.66, 0.12)
        world.x += math.copysign(0.016 * side_sweep, world.x)
    return world


def setup_stage_render(render_path: Path):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.12, 0.03, 0.05, 1)
    bg.inputs[1].default_value = 0.36
    cam_data = bpy.data.cameras.new('NocturneCam')
    cam = bpy.data.objects.new('NocturneCam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (0.0, -2.05, 1.2)
    cam.rotation_euler = (math.radians(87.5), 0.0, 0.0)
    cam.data.lens = 60
    def add_area(name, energy, location, rotation_deg, size=(1.4, 2.0)):
        light = bpy.data.lights.new(name=name, type='AREA')
        light.energy = energy
        light.shape = 'RECTANGLE'
        light.size = size[0]
        light.size_y = size[1]
        obj = bpy.data.objects.new(name=name, object_data=light)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = tuple(math.radians(v) for v in rotation_deg)
    add_area('Key', 1250, (0.85, -1.15, 1.58), (58, 0, 25), (1.2, 1.6))
    add_area('Fill', 420, (-0.9, -1.35, 1.45), (60, 0, -25), (1.4, 1.8))
    rim = bpy.data.lights.new(name='Rim', type='SPOT')
    rim.energy = 620
    rim.spot_size = math.radians(52)
    rim_obj = bpy.data.objects.new(name='Rim', object_data=rim)
    scene.collection.objects.link(rim_obj)
    rim_obj.location = (0.0, 0.85, 1.8)
    rim_obj.rotation_euler = (math.radians(-114), 0, 0)
    scene.render.filepath = str(render_path)


def export_glb(output_path: Path):
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format='GLB',
        export_image_format='AUTO',
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_skins=True,
        export_morph=True,
        export_animations=True,
        export_cameras=False,
        export_yup=True,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-glb', required=True)
    parser.add_argument('--textures-dir', required=True)
    parser.add_argument('--output-glb', required=True)
    parser.add_argument('--render-path', required=True)
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1 :]
    else:
        argv = argv[1:]
    args = parser.parse_args(argv)

    source_glb = Path(args.source_glb)
    textures_dir = Path(args.textures_dir)
    output_glb = Path(args.output_glb)
    render_path = Path(args.render_path)
    output_glb.parent.mkdir(parents=True, exist_ok=True)
    render_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source_glb))
    replace_material_images(textures_dir)
    configure_materials()
    deform_object('Body_Mesh', body_transform)
    deform_object('avaturn_look_0', outfit_transform)
    delete_outfit_center_faces('avaturn_look_0')
    deform_object('avaturn_hair_0', hair_transform)
    deform_object('avaturn_hair_1', hair_transform)
    export_glb(output_glb)
    setup_stage_render(render_path)
    bpy.ops.render.render(write_still=True)
    report = {
        'source_glb': str(source_glb),
        'output_glb': str(output_glb),
        'render_path': str(render_path),
        'textures_dir': str(textures_dir),
    }
    (render_path.parent / 'build-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
