"""PBR detail-map export for the manifest `detailMaps` block."""

import os

import bpy

from .assets import copy_asset, sanitize_asset_filename, unique_asset_path
from .materials_common import materials_in_use
from ..materials.detail_pack import (
    detail_has_separate_channels,
    detail_map_has_sources,
    is_supported_detail_image,
    pack_detail_map,
)


def _detail_export_failure_reason(detail):
    """Human-readable reason when a enabled detail map could not be exported."""
    has_separate = detail_has_separate_channels(detail)
    if has_separate:
        for label, path in (
            ("albedo", detail.albedo_file),
            ("normal", detail.normal_file),
            ("roughness", detail.roughness_file),
        ):
            if not path:
                continue
            if not os.path.isfile(bpy.path.abspath(path)):
                return f"detail {label} image not found: {path}"
            if not is_supported_detail_image(path):
                return (
                    f"detail {label} uses unsupported format (PNG/JPG/WEBP only): "
                    f"{path}")
        return "failed to pack separate detail channels"

    if not detail.texture_file:
        return "no detail texture assigned"

    if not os.path.isfile(bpy.path.abspath(detail.texture_file)):
        return f"detail map texture not found: {detail.texture_file}"

    if not is_supported_detail_image(detail.texture_file):
        return (
            f"packed detail map uses unsupported format (PNG/JPG/WEBP only): "
            f"{detail.texture_file}")

    return "detail map export failed"


def _export_detail_texture(detail, material_name, output_dir):
    """Copy or pack the detail map into materials/ and return a manifest-relative path."""
    has_separate = detail_has_separate_channels(detail)
    if has_separate:
        for path in (detail.albedo_file, detail.normal_file, detail.roughness_file):
            if path and not is_supported_detail_image(path):
                return None
        dest_dir = os.path.join(output_dir, "materials")
        os.makedirs(dest_dir, exist_ok=True)
        filename = sanitize_asset_filename(f"{material_name}_detail.png")
        dest, filename = unique_asset_path(dest_dir, filename)
        if not pack_detail_map(
            detail.albedo_file,
            detail.normal_file,
            detail.roughness_file,
            dest,
        ):
            return None
        return f"materials/{filename}"

    if detail.texture_file:
        if not is_supported_detail_image(detail.texture_file):
            return None
        return copy_asset(detail.texture_file, output_dir, "materials")

    return None


def serialize_detail_maps(context, output_dir):
    """Build the manifest `detailMaps` block for PBR detail texture overrides.

    Returns (entries, warnings) where warnings lists materials that were enabled
    but could not be exported (missing files, unreadable images, pack failure).
    """
    used = materials_in_use(context)
    detail_maps = []
    export_warnings = []
    for mat in bpy.data.materials:
        detail = mat.bjs_detail_map
        if not detail.is_enabled:
            continue
        if mat not in used:
            export_warnings.append(
                f"Material '{mat.name}': detail map enabled but not "
                f"used by any exportable mesh")
            continue
        if not detail_map_has_sources(detail):
            export_warnings.append(
                f"Material '{mat.name}': detail map enabled but no texture assigned")
            continue
        rel_path = _export_detail_texture(detail, mat.name, output_dir)
        if rel_path is None:
            export_warnings.append(
                f"Material '{mat.name}': {_detail_export_failure_reason(detail)}")
            continue
        entry = {
            "name": mat.name,
            "file": rel_path,
            "coordinatesIndex": detail.uv_set,
            "uvScale": detail.uv_scale,
            "diffuseBlendLevel": detail.diffuse_blend_level,
            "roughnessBlendLevel": detail.roughness_blend_level,
            "bumpLevel": detail.bump_level,
            "normalBlendMethod": detail.normal_blend_method,
        }
        detail_maps.append(entry)
    return detail_maps, export_warnings
