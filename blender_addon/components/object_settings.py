"""Per-object settings that aren't components: Babylon shadow controls for
lights, and NLA playback settings. Both attach as PointerProperties on Object."""

from bpy.types import PropertyGroup

from ..core.props import (
    StringProperty, EnumProperty, FloatProperty, BoolProperty, IntProperty,
)

from .constants import SHADOW_FILTERS, SHADOW_MAP_SIZE_PRESETS, SHADOW_MAP_SIZE_PRESET_VALUES


def _map_size_preset_get(shadow):
    if shadow.map_size == 0:
        return 'DEFAULT'
    if shadow.map_size in SHADOW_MAP_SIZE_PRESET_VALUES:
        return str(shadow.map_size)
    return 'CUSTOM'


def _map_size_preset_set(shadow, value):
    if value == 'DEFAULT':
        shadow.map_size = 0
    elif value == 'CUSTOM':
        if shadow.map_size == 0:
            shadow.map_size = 1024
    else:
        shadow.map_size = int(value)


class BJSLightSettings(PropertyGroup):
    """Per-light Babylon export settings beyond native Blender lamp fields."""
    use_clustered: BoolProperty(
        name="Cluster When Over Budget", default=True,
        description="When the scene exceeds the light budget, include this "
                    "point/spot light in Babylon's clustered lighting path. "
                    "Disable for hero lights that must stay in the forward shader")


class BJSLightShadow(PropertyGroup):
    """Babylon shadow controls for a light. These are Babylon concepts (they
    don't map onto Blender's renderer-specific shadow settings), so they live in
    the Babylon panel and are applied to the ShadowGenerator / light at load."""
    map_size: IntProperty(
        name="Custom Map Size", default=0, min=0, max=8192,
        description="Shadow map resolution when Map Size preset is Custom (256–8192). "
                    "Runtime clamps to the nearest power of two")
    map_size_preset: EnumProperty(
        name="Map Size",
        items=SHADOW_MAP_SIZE_PRESETS,
        get=_map_size_preset_get,
        set=_map_size_preset_set,
        overridable=False,
    )
    bias: FloatProperty(
        name="Bias", default=0.00005, min=0.0, soft_max=0.01, precision=5,
        description="Depth bias to fight shadow acne (self-shadowing artifacts)")
    normal_bias: FloatProperty(
        name="Normal Bias", default=0.02, min=0.0, soft_max=0.1, precision=4,
        description="Offset along the surface normal; helps on steep angles "
                    "and is the main fix for sun/directional shadow acne")
    darkness: FloatProperty(
        name="Darkness", default=0.0, min=0.0, max=1.0,
        description="0 = fully black shadow, 1 = invisible")
    min_z: FloatProperty(
        name="Clip Start", default=0.0, min=0.0,
        description="Near plane of the shadow frustum. 0 = let Babylon auto-fit")
    max_z: FloatProperty(
        name="Clip End", default=0.0, min=0.0,
        description="Far plane of the shadow frustum. 0 = let Babylon auto-fit")
    filter: EnumProperty(name="Filter", items=SHADOW_FILTERS, default='PCF')
    frustum_edge_falloff: FloatProperty(
        name="Edge Falloff", default=0.0, min=0.0, max=1.0,
        description="Fade shadows out toward the edge of the frustum instead of "
                    "clipping them hard. 0 = off, 1 = full fade (directional/spot only)")
    force_back_faces: BoolProperty(
        name="Back Faces Only", default=False,
        description="Render only back faces into the shadow map. Strongly "
                    "reduces self-shadowing acne, but can leak light "
                    "(peter-panning) on thin or open/single-sided meshes")


class BJSAnimationSettings(PropertyGroup):
    """Per-object NLA playback settings. Clip data itself rides in the glb as
    Babylon AnimationGroups; this only controls autoplay."""
    auto_play: BoolProperty(name="Auto Play", default=False)
    default_clip: StringProperty(
        name="Clip", default="",
        description="glTF / Action name to auto-play (blank = first). "
                    "Rename the NLA track to override the Action name.")
    loop: BoolProperty(name="Loop", default=True)
    speed: FloatProperty(name="Speed", default=1.0, min=0.0, soft_max=10.0)
