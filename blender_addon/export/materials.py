"""Node material export: copy the JSON, copy texture images, patch texture URLs."""

import json
import os
import shutil

import bpy

from .assets import copy_asset, sanitize_asset_filename, unique_asset_path

_TEXTURE_BLOCK_TYPES = frozenset({
    "BABYLON.ImageSourceBlock",
    "BABYLON.TextureBlock",
})


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
    name = tex.get("name") or ""
    if isinstance(name, str) and name.startswith("data:"):
        tex["name"] = rel_url


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


def export_node_material(nme_file, textures, output_dir):
    """Copy the node material JSON and any texture overrides next to the export.

    Returns (manifest_path, texture_entries) where texture_entries lists patched
    textures for the manifest runtime fallback.
    """
    manifest_path = copy_asset(nme_file, output_dir, "materials")
    if manifest_path is None:
        return None, []

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

    if assignments:
        json_abs = os.path.join(output_dir, *manifest_path.split("/"))
        patch_nme_json_textures(json_abs, assignments)

    return manifest_path, texture_entries


def _materials_in_use(context):
    """Materials assigned to exportable mesh objects."""
    used = set()
    for obj in context.scene.objects:
        if obj.hide_render:
            continue
        if obj.type != 'MESH':
            continue
        for slot in obj.material_slots:
            if slot.material is not None:
                used.add(slot.material)
    return used


def serialize_materials(context, output_dir):
    """Build the manifest `materials` block for node material overrides."""
    used = _materials_in_use(context)
    materials = []
    for mat in bpy.data.materials:
        if not mat.bjs_nme_file or mat not in used:
            continue
        path, textures = export_node_material(
            mat.bjs_nme_file, mat.bjs_nme_textures, output_dir)
        if path is None:
            continue
        entry = {"name": mat.name, "file": path}
        if textures:
            entry["textures"] = textures
        materials.append(entry)
    return materials
