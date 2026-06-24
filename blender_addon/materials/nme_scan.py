"""Scan a Node Material Editor JSON for texture-bearing blocks."""

import json
import os

import bpy

_TEXTURE_BLOCK_TYPES = frozenset({
    "BABYLON.ImageSourceBlock",
    "BABYLON.TextureBlock",
})


def _block_type_label(custom_type):
    if not custom_type:
        return ""
    return custom_type.rsplit(".", 1)[-1]


def _texture_is_embedded(tex):
    if not isinstance(tex, dict):
        return False
    url = (tex.get("url") or "").strip()
    name = (tex.get("name") or "").strip()
    if tex.get("base64String"):
        return True
    if url.startswith("data:"):
        return True
    if name.startswith("data:"):
        return True
    return False


def enumerate_nme_texture_slots(nme_path):
    """Return texture slot descriptors from an NME JSON file.

    Each entry: block_id, block_name, block_type, match_url, has_embedded,
    needs_file.
    """
    path = bpy.path.abspath(nme_path)
    if not os.path.isfile(path):
        return []

    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)

    blocks = data.get("blocks")
    if not isinstance(blocks, list):
        return []

    slots = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if block.get("customType") not in _TEXTURE_BLOCK_TYPES:
            continue
        tex = block.get("texture")
        if not isinstance(tex, dict):
            continue

        url = (tex.get("url") or "").strip()
        embedded = _texture_is_embedded(tex)
        slots.append({
            "block_id": int(block.get("id", 0)),
            "block_name": block.get("name") or f"Block {block.get('id', '?')}",
            "block_type": _block_type_label(block.get("customType")),
            "match_url": url if url and not url.startswith("data:") else "",
            "has_embedded": embedded,
            "needs_file": not embedded,
        })
    return slots


def sync_material_nme_textures(material):
    """Rebuild bjs_nme_textures from the assigned NME JSON, keeping image picks."""
    nme_file = getattr(material, "bjs_nme_file", "") or ""
    if not nme_file:
        return 0

    slots = enumerate_nme_texture_slots(nme_file)
    existing = {
        tex.block_id: tex
        for tex in material.bjs_nme_textures
        if tex.block_id
    }

    material.bjs_nme_textures.clear()
    for slot in slots:
        row = material.bjs_nme_textures.add()
        row.block_id = slot["block_id"]
        row.block_name = slot["block_name"]
        row.block_type = slot["block_type"]
        row.match_url = slot["match_url"]
        prev = existing.get(slot["block_id"])
        if prev is not None:
            row.image_file = prev.image_file
            row.json_url = prev.json_url

    return len(slots)
