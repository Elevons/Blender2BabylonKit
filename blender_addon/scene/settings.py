"""Scene-wide Babylon render settings, stored on `scene.bjs_scene`.

Object-level component data lives in the components package; this module is
only the scene-global render block (environment, fog, post-processing)."""

import bpy
from bpy.props import (
    BoolProperty, FloatProperty, EnumProperty, FloatVectorProperty, IntProperty, PointerProperty,
)
from bpy.types import PropertyGroup, Scene

from .post_processing import BJSPostProcessingSettings
from .atmosphere import BJSAtmosphereSettings


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
    environment_intensity: FloatProperty(
        name="Intensity", default=1.0, min=0.0, soft_max=10.0,
        description="IBL strength for the default environment at runtime")
    environment_rotation_y: FloatProperty(
        name="Rotation Y", default=0.0, subtype='ANGLE',
        description="Y-axis rotation of the default environment skybox and IBL")
    skybox_color: FloatVectorProperty(
        name="Skybox Color", subtype='COLOR', size=3,
        default=(0.2, 0.2, 0.3), min=0.0, max=1.0,
        description="Tint mixed into the default environment skybox texture at runtime "
                    "(Babylon EnvironmentHelper skyboxColor)")
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

    # Punctual light clustering (Babylon ClusteredLightContainer at runtime).
    cluster_punctual_lights: BoolProperty(
        name="Cluster Punctual Lights", default=True,
        description="When the scene exceeds the light budget, move eligible "
                    "point/spot lights into Babylon's clustered lighting path. "
                    "Turn off to keep every light in the forward shader (slower "
                    "when over budget)")
    light_budget: IntProperty(
        name="Light Budget", default=8, min=1, max=64,
        description="Maximum forward scene lights before clustering (or the UBO "
                    "fallback when clustering is off). Directional sun lights "
                    "always stay forward for shadow maps")

    # Large world / floating origin (Babylon useLargeWorldRendering + Havok multi-region).
    use_large_world_rendering: BoolProperty(
        name="Large World Rendering", default=False,
        description="Eliminate jitter at large world coordinates by offsetting "
                    "shader uniforms relative to the active camera and simulating "
                    "Havok physics in regional floating-origin worlds. Recommended "
                    "for geospatial globes, flight sims, and open worlds")
    floating_origin_world_radius: FloatProperty(
        name="Physics Region Radius", default=100000.0, min=1000.0,
        description="Havok multi-region radius in Babylon scene units when Large "
                    "World Rendering is on (default 100000)")

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

    # Physically based sky / aerial perspective (Babylon Atmosphere addon).
    atmosphere: PointerProperty(type=BJSAtmosphereSettings)


def register():
    from . import post_processing, atmosphere
    post_processing.register()
    atmosphere.register()
    bpy.utils.register_class(BJSSceneSettings)
    Scene.bjs_scene = bpy.props.PointerProperty(type=BJSSceneSettings)


def unregister():
    del Scene.bjs_scene
    bpy.utils.unregister_class(BJSSceneSettings)
    from . import post_processing, atmosphere
    atmosphere.unregister()
    post_processing.unregister()
