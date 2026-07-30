"""Node material (NME) export: copy JSON, patch textures/inputs/gradients."""

import json
import os
import shutil

import bpy

from .assets import copy_asset, sanitize_asset_filename, unique_asset_path
from .materials_common import materials_in_use
from ..materials.nme_inputs import row_value_to_json
from ..materials.nme_gradients import row_steps_to_json
from ..materials.nme_textures import texture_is_embedded

_TEXTURE_BLOCK_TYPES = frozenset({
    "BABYLON.ImageSourceBlock",
    "BABYLON.TextureBlock",
})

_INPUT_BLOCK_TYPE = "BABYLON.InputBlock"
_GRADIENT_BLOCK_TYPE = "BABYLON.GradientBlock"


def _resolve_json_url(image_file, json_url):
    url = (json_url or os.path.basename(image_file)).strip().replace("\\", "/")
    if not url:
        url = sanitize_asset_filename(os.path.basename(image_file))
    return url


def copy_nme_texture(image_file, output_dir, json_url=""):
    """Copy an image into materials/ (optionally a subpath) and return the URL for the JSON."""
    src = bpy.path.abspath(image_file)
    if not os.path.isfile(src):
        return None

    url = _resolve_json_url(image_file, json_url)
    parts = url.split("/")
    filename = sanitize_asset_filename(parts[-1])
    if len(parts) > 1:
        dest_dir = os.path.join(output_dir, "materials", *parts[:-1])
        rel_prefix = "/".join(parts[:-1])
    else:
        dest_dir = os.path.join(output_dir, "materials")
        rel_prefix = ""

    os.makedirs(dest_dir, exist_ok=True)
    dest, filename = unique_asset_path(dest_dir, filename, src)
    rel_url = f"{rel_prefix}/{filename}" if rel_prefix else filename

    if os.path.normpath(src) != os.path.normpath(dest):
        shutil.copy2(src, dest)

    return rel_url


def _nme_texture_blocks(data):
    blocks = data.get("blocks")
    if not isinstance(blocks, list):
        return []
    return [
        block for block in blocks
        if isinstance(block, dict)
        and block.get("customType") in _TEXTURE_BLOCK_TYPES
        and isinstance(block.get("texture"), dict)
    ]


def _apply_texture_url(tex, rel_url):
    tex["url"] = rel_url
    tex["name"] = rel_url
    tex.pop("base64String", None)
    tex.pop("internalTextureLabel", None)
    name = tex.get("name") or ""
    if isinstance(name, str) and name.startswith("data:"):
        tex["name"] = rel_url


def _normalize_nme_embedded_texture_urls(data):
    """Copy data: URIs from texture.name onto texture.url when url is empty."""
    blocks = data.get("blocks")
    if not isinstance(blocks, list):
        return False

    changed = False
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if block.get("customType") not in _TEXTURE_BLOCK_TYPES:
            continue
        tex = block.get("texture")
        if not isinstance(tex, dict):
            continue
        url = (tex.get("url") or "").strip()
        if url:
            continue
        name = tex.get("name") or ""
        if isinstance(name, str) and name.startswith("data:"):
            tex["url"] = name.strip()
            changed = True
    return changed


def normalize_nme_json_embedded_textures(json_abs):
    """Ensure embedded NME textures load at runtime (name-only data URIs → url)."""
    with open(json_abs, encoding="utf-8") as handle:
        data = json.load(handle)
    if not _normalize_nme_embedded_texture_urls(data):
        return
    with open(json_abs, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def patch_nme_json_textures(json_abs, assignments):
    """Write rel_url onto matching texture blocks in the exported node material JSON."""
    if not assignments:
        return

    with open(json_abs, encoding="utf-8") as handle:
        data = json.load(handle)

    blocks_by_id = {
        block["id"]: block
        for block in _nme_texture_blocks(data)
        if isinstance(block.get("id"), int)
    }
    texture_blocks = _nme_texture_blocks(data)
    patched_ids = set()

    for assignment in assignments:
        rel_url = assignment["rel_url"]
        block_id = assignment.get("block_id")
        match_url = (assignment.get("match_url") or "").strip()

        targets = []
        if block_id and block_id in blocks_by_id:
            targets = [blocks_by_id[block_id]]
        elif match_url:
            targets = [
                block for block in texture_blocks
                if (block.get("texture") or {}).get("url") == match_url
            ]
        elif len(assignments) == 1:
            empty = [
                block for block in texture_blocks
                if not ((block.get("texture") or {}).get("url") or "").strip()
                and not texture_is_embedded(block.get("texture") or {})
            ]
            targets = empty if empty else [texture_blocks[0]]
        else:
            for block in texture_blocks:
                if id(block) in patched_ids:
                    continue
                targets = [block]
                break

        for block in targets:
            _apply_texture_url(block["texture"], rel_url)
            patched_ids.add(id(block))

    with open(json_abs, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def _nme_input_blocks(data):
    blocks = data.get("blocks")
    if not isinstance(blocks, list):
        return []
    return [
        block for block in blocks
        if isinstance(block, dict)
        and block.get("customType") == _INPUT_BLOCK_TYPE
    ]


def patch_nme_json_inputs(json_abs, assignments):
    """Write authored values onto matching InputBlock entries in the exported JSON."""
    if not assignments:
        return

    with open(json_abs, encoding="utf-8") as handle:
        data = json.load(handle)

    blocks_by_id = {
        block["id"]: block
        for block in _nme_input_blocks(data)
        if isinstance(block.get("id"), int)
    }

    for assignment in assignments:
        block_id = assignment.get("block_id")
        if not block_id or block_id not in blocks_by_id:
            continue
        blocks_by_id[block_id]["value"] = assignment["value"]

    with open(json_abs, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def _nme_gradient_blocks(data):
    blocks = data.get("blocks")
    if not isinstance(blocks, list):
        return []
    return [
        block for block in blocks
        if isinstance(block, dict)
        and block.get("customType") == _GRADIENT_BLOCK_TYPE
    ]


def patch_nme_json_gradients(json_abs, assignments):
    """Write authored colorSteps onto matching GradientBlock entries."""
    if not assignments:
        return

    with open(json_abs, encoding="utf-8") as handle:
        data = json.load(handle)

    blocks_by_id = {
        block["id"]: block
        for block in _nme_gradient_blocks(data)
        if isinstance(block.get("id"), int)
    }

    for assignment in assignments:
        block_id = assignment.get("block_id")
        if not block_id or block_id not in blocks_by_id:
            continue
        blocks_by_id[block_id]["colorSteps"] = assignment["color_steps"]

    with open(json_abs, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def export_node_material(nme_file, textures, inputs, gradients, output_dir, exported_nme_json=None):
    """Copy the node material JSON and any texture / input / gradient overrides next to the export.

    Returns (manifest_path, texture_entries, input_entries, gradient_entries) where
    texture_entries lists patched textures, input_entries lists patched inspector inputs,
    and gradient_entries lists patched GradientBlocks for the manifest runtime fallback.

    When several Blender materials share one NME source file, only the first copy
    writes the JSON; later materials patch the exported copy in place.
    """
    nme_abs = os.path.normpath(bpy.path.abspath(nme_file))
    if not os.path.isfile(nme_abs):
        return None, [], [], []

    manifest_path = None
    if exported_nme_json is not None:
        manifest_path = exported_nme_json.get(nme_abs)

    if manifest_path is None:
        manifest_path = copy_asset(nme_file, output_dir, "materials")
        if manifest_path is None:
            return None, [], [], []
        if exported_nme_json is not None:
            exported_nme_json[nme_abs] = manifest_path

    assignments = []
    texture_entries = []
    for texture in textures:
        if not texture.image_file:
            continue
        rel_url = copy_nme_texture(texture.image_file, output_dir, texture.json_url)
        if rel_url is None:
            continue
        assignments.append({
            "block_id": texture.block_id,
            "rel_url": rel_url,
            "match_url": texture.match_url,
        })
        texture_entries.append({
            "blockId": texture.block_id,
            "blockName": texture.block_name,
            "file": f"materials/{rel_url}",
        })

    input_assignments = []
    input_entries = []
    for row in inputs:
        if not row.block_id:
            continue
        value = row_value_to_json(row)
        if value is None:
            continue
        input_assignments.append({
            "block_id": row.block_id,
            "value": value,
        })
        input_entries.append({
            "blockId": row.block_id,
            "blockName": row.block_name,
            "type": row.value_type,
            "value": value,
        })

    gradient_assignments = []
    gradient_entries = []
    for row in gradients:
        if not row.block_id or len(row.steps) == 0:
            continue
        color_steps = row_steps_to_json(row)
        gradient_assignments.append({
            "block_id": row.block_id,
            "color_steps": color_steps,
        })
        gradient_entries.append({
            "blockId": row.block_id,
            "blockName": row.block_name,
            "colorSteps": color_steps,
        })

    json_abs = os.path.join(output_dir, *manifest_path.split("/"))
    normalize_nme_json_embedded_textures(json_abs)
    if assignments:
        patch_nme_json_textures(json_abs, assignments)
    if input_assignments:
        patch_nme_json_inputs(json_abs, input_assignments)
    if gradient_assignments:
        patch_nme_json_gradients(json_abs, gradient_assignments)

    return manifest_path, texture_entries, input_entries, gradient_entries


def serialize_materials(context, output_dir):
    """Build the manifest `materials` block for node material overrides."""
    used = materials_in_use(context)
    materials = []
    exported_nme_json = {}
    for mat in bpy.data.materials:
        if not mat.bjs_nme_file or mat not in used:
            continue
        path, textures, inputs, gradients = export_node_material(
            mat.bjs_nme_file,
            mat.bjs_nme_textures,
            mat.bjs_nme_inputs,
            mat.bjs_nme_gradients,
            output_dir,
            exported_nme_json,
        )
        if path is None:
            continue
        entry = {"name": mat.name, "file": path}
        if textures:
            entry["textures"] = textures
        if inputs:
            entry["inputs"] = inputs
        if gradients:
            entry["gradients"] = gradients
        materials.append(entry)
    return materials
