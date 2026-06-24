"""Per-material Babylon node material (NME) settings on bpy.types.Material."""

from bpy.props import CollectionProperty, StringProperty, IntProperty
from bpy.types import PropertyGroup


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
