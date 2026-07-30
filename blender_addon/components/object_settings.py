"""Per-object settings that aren't components: Babylon shadow controls for
lights, and NLA playback settings. Both attach as PointerProperties on Object."""

from bpy.types import PropertyGroup

from ..core.props import (
    StringProperty, EnumProperty, FloatProperty, BoolProperty, IntProperty,
)

from .constants import SHADOW_FILTERS


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
        name="Map Size", default=0, min=0, max=8192,
        description="Shadow map resolution for this light. 0 = use the loader default (1024)")
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
