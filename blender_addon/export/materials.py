"""Manifest material export — re-exports NME and detail-map serializers."""

from .detail_maps import serialize_detail_maps
from .materials_common import materials_in_use
from .nme_materials import (
    copy_nme_texture,
    export_node_material,
    normalize_nme_json_embedded_textures,
    patch_nme_json_gradients,
    patch_nme_json_inputs,
    patch_nme_json_textures,
    serialize_materials,
)

# Backward-compatible alias for validate.py lazy imports.
_materials_in_use = materials_in_use

__all__ = [
    "copy_nme_texture",
    "export_node_material",
    "materials_in_use",
    "normalize_nme_json_embedded_textures",
    "patch_nme_json_gradients",
    "patch_nme_json_inputs",
    "patch_nme_json_textures",
    "serialize_detail_maps",
    "serialize_materials",
    "_materials_in_use",
]
