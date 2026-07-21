"""Builds the manifest `scene` block (environment, fog, post-processing, input)
and copies the World environment texture next to the export. Pure
serialization — no UI, no registration."""

import os

import bpy

from ..input_actions.serialize import serialize_input_asset
from ..collision_layers.serialize import serialize_collision_layers
from ..scene.environment import find_world_env_node, world_background_strength
from .assets import copy_asset, save_image_asset
from .post_processing import serialize_post_processing
from .atmosphere import serialize_atmosphere


def _round3(c):
    return [round(c[0], 4), round(c[1], 4), round(c[2], 4)]


def _image_ext(image):
    return {'OPEN_EXR': '.exr', 'OPEN_EXR_MULTILAYER': '.exr',
            'HDR': '.hdr', 'JPEG': '.jpg'}.get(image.file_format, '.png')


def _env_rotation_y(node):
    for inp in node.inputs:
        if inp.name == 'Vector':
            for link in inp.links:
                if link.from_node.type == 'MAPPING':
                    # Mapping yaw is around Blender Z (Z-up); Babylon rotates around Y.
                    return -link.from_node.inputs['Rotation'].default_value[2]
    return 0.0


def _copy_environment(node, output_dir):
    """Copy/save the World env image into env/ with a URL-safe name. Returns manifest path."""
    image = node.image
    src = bpy.path.abspath(image.filepath) if image.filepath else ""
    if src and os.path.isfile(src):
        return copy_asset(image.filepath, output_dir, "env")
    return save_image_asset(image, output_dir, "env", _image_ext(image))


def _environment_skybox_flags(s):
    """Manifest keys shared by World-texture and useDefault environment blocks."""
    flags = {"createSkybox": s.create_skybox}
    if s.create_skybox:
        flags["skyboxIgnoreFog"] = s.skybox_ignore_fog
        flags["skyboxColor"] = _round3(s.skybox_color)
    return flags


def _serialize_environment(context, output_dir):
    s = context.scene.bjs_scene
    # Atmosphere renders its own sky — skip the environment skybox.
    skybox_flags = _environment_skybox_flags(s)
    if s.atmosphere.use_atmosphere:
        skybox_flags = {"createSkybox": False}
    node = find_world_env_node(context.scene.world)
    if node:
        env_path = _copy_environment(node, output_dir)
        if not env_path:
            return None
        return {
            "file": env_path,
            "intensity": world_background_strength(context.scene.world),
            "rotationY": _env_rotation_y(node),
            **skybox_flags,
        }
    if s.use_default_environment:
        return {
            "useDefault": True,
            "intensity": s.environment_intensity,
            "rotationY": s.environment_rotation_y,
            **skybox_flags,
        }
    return None


# ── the scene block ──

def serialize_scene(context, output_dir):
    s = context.scene.bjs_scene
    data = {
        "clearColor": _round3(s.clear_color) + [1.0],
        "ambientColor": _round3(s.ambient_color),
        "environment": _serialize_environment(context, output_dir),
        "freezeShadows": bool(s.freeze_shadows),
        "fog": None,
        "atmosphere": None,
        "postProcessing": None,
    }

    if s.use_fog:
        data["fog"] = {
            "mode": s.fog_mode, "color": _round3(s.fog_color),
            "density": s.fog_density, "start": s.fog_start, "end": s.fog_end,
        }

    data["atmosphere"] = serialize_atmosphere(context)
    data["postProcessing"] = serialize_post_processing(s, output_dir)
    data["inputActions"] = serialize_input_asset(context.scene)
    data["defaultInputMap"] = context.scene.bjs_input_default_map
    data["collisionLayers"] = serialize_collision_layers(context.scene)

    if s.use_large_world_rendering:
        data["largeWorldRendering"] = True
        data["floatingOriginWorldRadius"] = s.floating_origin_world_radius

    data["clusterPunctualLights"] = bool(s.cluster_punctual_lights)
    data["lightBudget"] = s.light_budget

    return data
