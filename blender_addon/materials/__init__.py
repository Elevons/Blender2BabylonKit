"""Per-material Babylon node material (NME) data on bpy.types.Material."""

import bpy
from bpy.props import CollectionProperty, StringProperty
from bpy.types import Material

from .properties import BJSNmeTexture, BJSNmeInput

classes = (
    BJSNmeTexture,
    BJSNmeInput,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)

    Material.bjs_nme_file = StringProperty(
        name="Node Material JSON",
        subtype='FILE_PATH',
        default="",
        description=".json exported from the Babylon Node Material Editor — "
                    "copied next to the level export",
    )
    Material.bjs_nme_textures = CollectionProperty(type=BJSNmeTexture)
    Material.bjs_nme_inputs = CollectionProperty(type=BJSNmeInput)


def unregister():
    del Material.bjs_nme_inputs
    del Material.bjs_nme_textures
    del Material.bjs_nme_file
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
