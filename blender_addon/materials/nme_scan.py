"""Scan a Node Material Editor JSON for texture-bearing blocks and inspector inputs."""

import json
import os

import bpy

from .nme_inputs import (
    read_json_value,
    resolve_nme_input_type,
    row_value_to_json,
    write_row_value,
)
from .nme_textures import texture_is_embedded

_TEXTURE_BLOCK_TYPES = frozenset({
    "BABYLON.ImageSourceBlock",
    "BABYLON.TextureBlock",
})

_INPUT_BLOCK_TYPE = "BABYLON.InputBlock"


def _block_type_label(custom_type):
    if not custom_type:
        return ""
    return custom_type.rsplit(".", 1)[-1]


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
        embedded = texture_is_embedded(tex)
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


def _load_nme_blocks(nme_path):
    path = bpy.path.abspath(nme_path)
    if not os.path.isfile(path):
        return []

    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)

    blocks = data.get("blocks")
    if not isinstance(blocks, list):
        return []
    return blocks


def enumerate_nme_input_slots(nme_path):
    """Return inspector-visible InputBlock descriptors from an NME JSON file.

    Each entry: block_id, block_name, value_type, group_in_inspector, value.
    """
    blocks = _load_nme_blocks(nme_path)
    slots = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if block.get("customType") != _INPUT_BLOCK_TYPE:
            continue
        if not block.get("visibleInInspector"):
            continue
        if block.get("systemValue") is not None:
            continue

        value_type = resolve_nme_input_type(block)
        if value_type is None:
            continue

        slots.append({
            "block_id": int(block.get("id", 0)),
            "block_name": block.get("name") or f"Block {block.get('id', '?')}",
            "value_type": value_type,
            "group_in_inspector": (block.get("groupInInspector") or "").strip(),
            "value": read_json_value(block, value_type),
        })
    return slots


def sync_material_nme_inputs(material):
    """Rebuild bjs_nme_inputs from the assigned NME JSON, keeping edited values."""
    nme_file = getattr(material, "bjs_nme_file", "") or ""
    if not nme_file:
        return 0

    slots = enumerate_nme_input_slots(nme_file)
    existing = {
        row.block_id: row
        for row in material.bjs_nme_inputs
        if row.block_id
    }

    material.bjs_nme_inputs.clear()
    for slot in slots:
        row = material.bjs_nme_inputs.add()
        row.block_id = slot["block_id"]
        row.block_name = slot["block_name"]
        row.value_type = slot["value_type"]
        row.group_in_inspector = slot["group_in_inspector"]
        prev = existing.get(slot["block_id"])
        if prev is not None and prev.value_type == slot["value_type"]:
            write_row_value(row, row.value_type, row_value_to_json(prev))
        else:
            write_row_value(row, row.value_type, slot["value"])

    return len(slots)


def sync_material_nme(material):
    """Rescan textures and inspector inputs from the assigned NME JSON."""
    texture_count = sync_material_nme_textures(material)
    input_count = sync_material_nme_inputs(material)
    return texture_count, input_count
