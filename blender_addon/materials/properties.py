"""Per-material Babylon node material (NME) settings on bpy.types.Material."""

from bpy.props import (
    BoolProperty,
    CollectionProperty,
    EnumProperty,
    FloatProperty,
    FloatVectorProperty,
    IntProperty,
    PointerProperty,
    StringProperty,
)
from bpy.types import PropertyGroup, Texture

NME_INPUT_TYPES = [
    ('FLOAT', "Float", ""),
    ('INT', "Int", ""),
    ('BOOL', "Boolean", ""),
    ('VECTOR2', "Vector2", ""),
    ('VECTOR3', "Vector3", ""),
    ('VECTOR4', "Vector4", ""),
    ('COLOR3', "Color3", ""),
    ('COLOR4', "Color4", ""),
]


class BJSNmeTexture(PropertyGroup):
    """One texture image copied on export and wired into the node material JSON."""

    block_id: IntProperty(
        name="Block ID",
        default=0,
        description="NME block id used to patch the correct texture slot",
    )
    block_name: StringProperty(
        name="Block",
        default="",
        description="NME block name (display label)",
    )
    block_type: StringProperty(
        name="Type",
        default="",
        description="NME block class (ImageSourceBlock / TextureBlock)",
    )
    image_file: StringProperty(
        name="Image",
        subtype='FILE_PATH',
        default="",
        description="Source image copied into the level's materials/ folder on export",
    )
    json_url: StringProperty(
        name="URL in JSON",
        default="",
        description="Filename the node material JSON references. "
                    "Empty = use the exported image filename",
    )
    match_url: StringProperty(
        name="Replace URL",
        default="",
        description="Only patch blocks whose current URL equals this "
                    "(empty = match by block id)",
    )


class BJSNmeGradientStep(PropertyGroup):
    """One color stop on an inspector-visible GradientBlock."""

    step_value: FloatProperty(
        name="Step",
        min=0.0,
        max=1.0,
        default=0.0,
        precision=3,
        step=1,
        description="Position along the gradient (0–1)",
    )
    color: FloatVectorProperty(
        name="Color",
        size=3,
        subtype='COLOR',
        min=0.0,
        max=1.0,
        default=(1.0, 1.0, 1.0),
    )


class BJSNmeGradient(PropertyGroup):
    """One inspector-visible GradientBlock patched into the node material JSON."""

    block_id: IntProperty(
        name="Block ID",
        default=0,
        description="NME GradientBlock id used to patch the correct colorSteps",
    )
    block_name: StringProperty(
        name="Block",
        default="",
        description="NME GradientBlock name (display label)",
    )
    group_in_inspector: StringProperty(
        name="Group",
        default="",
        description="NME inspector group label, when set",
    )
    steps: CollectionProperty(type=BJSNmeGradientStep)
    ramp_texture: PointerProperty(
        type=Texture,
        name="Gradient Ramp",
        description="Internal BLEND texture used only to host a ColorRamp for the UI",
    )


class BJSNmeInput(PropertyGroup):
    """One inspector-visible InputBlock value patched into the node material JSON."""

    block_id: IntProperty(
        name="Block ID",
        default=0,
        description="NME InputBlock id used to patch the correct value slot",
    )
    block_name: StringProperty(
        name="Block",
        default="",
        description="NME InputBlock name (display label)",
    )
    value_type: EnumProperty(
        name="Type",
        items=NME_INPUT_TYPES,
        default='FLOAT',
    )
    group_in_inspector: StringProperty(
        name="Group",
        default="",
        description="NME inspector group label, when set",
    )
    f_val: FloatProperty(name="Value")
    i_val: IntProperty(name="Value")
    b_val: BoolProperty(name="Value")
    v2_val: FloatVectorProperty(name="Value", size=2)
    v3_val: FloatVectorProperty(name="Value", size=3, subtype='XYZ')
    v4_val: FloatVectorProperty(name="Value", size=4)
    c3_val: FloatVectorProperty(
        name="Value", size=3, subtype='COLOR', min=0.0, max=1.0,
        default=(1.0, 1.0, 1.0),
    )
    c4_rgb: FloatVectorProperty(
        name="RGB", size=3, subtype='COLOR', min=0.0, max=1.0,
        default=(1.0, 1.0, 1.0),
    )
    c4_a: FloatProperty(name="Alpha", min=0.0, max=1.0, default=1.0)
