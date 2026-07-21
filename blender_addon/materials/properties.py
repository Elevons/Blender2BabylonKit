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

# UI labels for NME InputBlock kinds. value_type is stored as a string id (see
# BJSNmeInput below), so this list can be reordered freely.
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
    # String id ('FLOAT', 'VECTOR3', …) — not EnumProperty. Set by Scan NME from
    # the JSON block type; artists never pick it from a dropdown.
    value_type: StringProperty(default='FLOAT')
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


DETAIL_NORMAL_BLEND_METHODS = [
    ('WHITEOUT', "Whiteout", "Standard whiteout normal blend (Babylon default)"),
    ('RNM', "RNM", "Reoriented normal mapping blend"),
]


class BJSDetailMapSettings(PropertyGroup):
    """Babylon DetailMapConfiguration overrides for glTF PBR materials."""

    is_enabled: BoolProperty(
        name="Enable Detail Map",
        default=False,
        description="Tile a secondary detail texture over the base glTF material at runtime",
    )
    texture_file: StringProperty(
        name="Packed Detail Map",
        subtype='FILE_PATH',
        default="",
        description="Pre-packed detail map (R=albedo, G=normal G, B=roughness, A=normal R). "
                    "Optional when separate channel images are assigned — those are packed on export",
    )
    albedo_file: StringProperty(
        name="Albedo",
        subtype='FILE_PATH',
        default="",
        description="Greyscale albedo detail — packed into the red channel on export",
    )
    normal_file: StringProperty(
        name="Normal",
        subtype='FILE_PATH',
        default="",
        description="Tangent-space normal map — green → G channel, red → A channel on export",
    )
    roughness_file: StringProperty(
        name="Roughness",
        subtype='FILE_PATH',
        default="",
        description="Roughness detail — packed into the blue channel on export (PBR only)",
    )
    uv_scale: FloatProperty(
        name="UV Scale",
        min=0.01,
        default=1.0,
        description="Tile the detail map this many times over the chosen UV layer (uScale / vScale)",
    )
    uv_set: IntProperty(
        name="UV Set",
        min=0,
        max=7,
        default=0,
        description="UV layer index for the detail map (0 = first UV / UVMap, 1 = second UV — "
                    "matches glTF TEXCOORD_0, TEXCOORD_1, … and Babylon coordinatesIndex)",
    )
    diffuse_blend_level: FloatProperty(
        name="Diffuse Blend",
        min=0.0,
        max=1.0,
        default=1.0,
        description="How strongly the detail albedo blends with the base albedo (0–1)",
    )
    roughness_blend_level: FloatProperty(
        name="Roughness Blend",
        min=0.0,
        max=1.0,
        default=1.0,
        description="How strongly the detail roughness blends with the base roughness (0–1, PBR only)",
    )
    bump_level: FloatProperty(
        name="Bump Level",
        min=0.0,
        default=1.0,
        description="Strength of the detail normal bump effect (0–1)",
    )
    normal_blend_method: EnumProperty(
        name="Normal Blend",
        items=DETAIL_NORMAL_BLEND_METHODS,
        default='WHITEOUT',
        description="Method used to blend base and detail normals",
    )
