"""Builds the manifest `scene` block (environment, fog, post-processing, input)
and copies the World environment texture next to the export. Pure
serialization — no UI, no registration."""

import os
import shutil

import bpy

from ..input_actions.serialize import serialize_input_asset


def _round3(c):
    return [round(c[0], 4), round(c[1], 4), round(c[2], 4)]


# ── environment texture discovery (from the World node tree) ──

def _find_env_node(world):
    if not world or not world.use_nodes:
        return None
    nodes = world.node_tree.nodes
    for n in nodes:
        if n.type in ('TEX_ENVIRONMENT', 'TEX_IMAGE') and n.image:
            return n
    for n in nodes:
        if n.type == 'BACKGROUND':
            for link in n.inputs['Color'].links:
                src = link.from_node
                if src.type in ('TEX_ENVIRONMENT', 'TEX_IMAGE') and src.image:
                    return src
    return None


def _image_ext(image):
    return {'OPEN_EXR': '.exr', 'OPEN_EXR_MULTILAYER': '.exr',
            'HDR': '.hdr', 'JPEG': '.jpg'}.get(image.file_format, '.png')


def _env_rotation_y(node):
    for inp in node.inputs:
        if inp.name == 'Vector':
            for link in inp.links:
                if link.from_node.type == 'MAPPING':
                    return link.from_node.inputs['Rotation'].default_value[2]
    return 0.0


def _env_intensity(node):
    for out in node.outputs:
        for link in out.links:
            if link.to_node.type == 'BACKGROUND':
                return link.to_node.inputs['Strength'].default_value
    return 1.0


def _copy_environment(node, output_dir):
    """Copy/save the env image into <output_dir>/env/ and return its filename."""
    image = node.image
    env_dir = os.path.join(output_dir, "env")
    os.makedirs(env_dir, exist_ok=True)

    src = bpy.path.abspath(image.filepath)
    if src and os.path.exists(src):
        name = os.path.basename(src)
        dest = os.path.join(env_dir, name)
        if os.path.normpath(src) != os.path.normpath(dest):
            shutil.copy2(src, dest)
        return name
    # Packed / generated image: save it out.
    name = bpy.path.clean_name(image.name) + _image_ext(image)
    orig = image.filepath_raw
    image.filepath_raw = os.path.join(env_dir, name)
    image.save()
    image.filepath_raw = orig
    return name


def _serialize_environment(context, output_dir):
    s = context.scene.bjs_scene
    node = _find_env_node(context.scene.world)
    if not node:
        return None
    filename = _copy_environment(node, output_dir)
    return {
        "file": "env/" + filename,
        "intensity": _env_intensity(node),
        "rotationY": _env_rotation_y(node),
        "createSkybox": s.create_skybox,
    }


# ── the scene block ──

def serialize_scene(context, output_dir):
    s = context.scene.bjs_scene
    data = {
        "clearColor": _round3(s.clear_color) + [1.0],
        "ambientColor": _round3(s.ambient_color),
        "environment": _serialize_environment(context, output_dir),
        "fog": None,
        "postProcessing": None,
    }

    if s.use_fog:
        data["fog"] = {
            "mode": s.fog_mode, "color": _round3(s.fog_color),
            "density": s.fog_density, "start": s.fog_start, "end": s.fog_end,
        }

    if s.use_pipeline:
        data["postProcessing"] = {
            "defaultPipeline": True,
            "fxaa": s.use_fxaa,
            "bloom": {"enabled": s.use_bloom,
                      "threshold": s.bloom_threshold,
                      "intensity": s.bloom_intensity},
            "ssao": s.use_ssao,
            "toneMapping": s.use_tone_mapping,
            "exposure": s.exposure,
            "contrast": s.contrast,
        }
    data["inputActions"] = serialize_input_asset(context.scene)
    data["defaultInputMap"] = context.scene.bjs_input_default_map

    return data
