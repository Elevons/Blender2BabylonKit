"""Scene-wide Babylon render settings, stored on `scene.bjs_scene`.

Object-level component data lives in properties.py; this module is only the
scene-global render block (environment, fog, post-processing). Kept separate so
neither file grows into a catch-all.
"""

import bpy
from bpy.props import (
    BoolProperty, FloatProperty, EnumProperty, FloatVectorProperty,
)
from bpy.types import PropertyGroup, Scene


class BJSSceneSettings(PropertyGroup):
    # Clear / ambient
    clear_color: FloatVectorProperty(
        name="Clear Color", subtype='COLOR', size=3,
        default=(0.05, 0.05, 0.08), min=0.0, max=1.0)
    ambient_color: FloatVectorProperty(
        name="Ambient Color", subtype='COLOR', size=3,
        default=(0.0, 0.0, 0.0), min=0.0, max=1.0)

    # Environment / skybox (the texture itself is read from the World nodes).
    create_skybox: BoolProperty(
        name="Create Skybox", default=True,
        description="Build a skybox from the World environment texture")

    # Fog
    use_fog: BoolProperty(name="Enable Fog", default=False)
    fog_mode: EnumProperty(name="Mode", items=[
        ('LINEAR', "Linear", ""), ('EXP', "Exponential", ""), ('EXP2', "Exp²", "")],
        default='EXP2')
    fog_color: FloatVectorProperty(
        name="Fog Color", subtype='COLOR', size=3,
        default=(0.5, 0.6, 0.7), min=0.0, max=1.0)
    fog_density: FloatProperty(name="Density", default=0.01, min=0.0, soft_max=0.5)
    fog_start: FloatProperty(name="Start", default=10.0, min=0.0)
    fog_end: FloatProperty(name="End", default=100.0, min=0.0)

    # Post-processing (default rendering pipeline + SSAO)
    use_pipeline: BoolProperty(name="Default Pipeline", default=False)
    use_fxaa: BoolProperty(name="FXAA", default=True)
    use_bloom: BoolProperty(name="Bloom", default=False)
    bloom_threshold: FloatProperty(name="Bloom Threshold", default=0.9, min=0.0, max=2.0)
    bloom_intensity: FloatProperty(name="Bloom Intensity", default=0.5, min=0.0, max=5.0)
    use_ssao: BoolProperty(name="SSAO", default=False)
    use_tone_mapping: BoolProperty(name="Tone Mapping", default=True)
    exposure: FloatProperty(name="Exposure", default=1.0, min=0.0, max=10.0)
    contrast: FloatProperty(name="Contrast", default=1.0, min=0.0, max=5.0)


def register():
    bpy.utils.register_class(BJSSceneSettings)
    Scene.bjs_scene = bpy.props.PointerProperty(type=BJSSceneSettings)


def unregister():
    del Scene.bjs_scene
    bpy.utils.unregister_class(BJSSceneSettings)
