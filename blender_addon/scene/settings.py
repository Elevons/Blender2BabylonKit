"""Scene-wide Babylon render settings, stored on `scene.bjs_scene`.

Object-level component data lives in the components package; this module is
only the scene-global render block (environment, fog, post-processing)."""

import bpy
from bpy.props import (
    BoolProperty, FloatProperty, EnumProperty, FloatVectorProperty, PointerProperty,
)
from bpy.types import PropertyGroup, Scene

from .post_processing import BJSPostProcessingSettings


class BJSSceneSettings(PropertyGroup):
    # Clear / ambient
    clear_color: FloatVectorProperty(
        name="Clear Color", subtype='COLOR', size=3,
        default=(0.05, 0.05, 0.08), min=0.0, max=1.0)
    ambient_color: FloatVectorProperty(
        name="Ambient Color", subtype='COLOR', size=3,
        default=(0.0, 0.0, 0.0), min=0.0, max=1.0)

    # Environment (texture from World nodes, or bundled default when enabled).
    use_default_environment: BoolProperty(
        name="Default Environment", default=False,
        description="Use Babylon's built-in studio environment for IBL at runtime "
                    "(loaded from the Babylon CDN when the level loads). Used when "
                    "the World has no environment texture. Ignored when a World "
                    "texture is present")
    create_skybox: BoolProperty(
        name="Show Skybox", default=True,
        description="Display the environment as a visible skybox. Turn off to keep "
                    "IBL lighting on materials without showing the background image")
    skybox_ignore_fog: BoolProperty(
        name="Skybox Ignores Fog", default=True,
        description="Keep the skybox visible when scene fog is enabled "
                    "(Babylon mesh.applyFog = false)")

    # Shadows
    freeze_shadows: BoolProperty(
        name="Freeze Shadows", default=False,
        description="Render each shadow map once and freeze it. Big performance "
                    "win for a fully static level, but moving objects won't update "
                    "their shadows (call level.RefreshShadows() after moving one)")

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

    # Default rendering pipeline + SSAO (see post_processing.py for fields).
    post: PointerProperty(type=BJSPostProcessingSettings)


def register():
    from . import post_processing
    post_processing.register()
    bpy.utils.register_class(BJSSceneSettings)
    Scene.bjs_scene = bpy.props.PointerProperty(type=BJSSceneSettings)


def unregister():
    del Scene.bjs_scene
    bpy.utils.unregister_class(BJSSceneSettings)
    from . import post_processing
    post_processing.unregister()
