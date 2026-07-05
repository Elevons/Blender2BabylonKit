"""Scan a Node Material Editor JSON for texture-bearing blocks and inspector inputs."""

import json
import os

import bpy

from .nme_inputs import (
    read_json_value,
    resolve_nme_input_type,
    snapshot_row_value,
    write_row_value,
)
from .nme_gradients import (
    read_color_steps,
    setup_gradient_ramp,
    snapshot_row_steps,
    write_row_steps,
)
from .nme_textures import texture_is_embedded

_TEXTURE_BLOCK_TYPES = frozenset({
    "BABYLON.ImageSourceBlock",
    "BABYLON.TextureBlock",
})

_INPUT_BLOCK_TYPE = "BABYLON.InputBlock"
_GRADIENT_BLOCK_TYPE = "BABYLON.GradientBlock"


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
        tex.block_id: (tex.image_file, tex.json_url)
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
            row.image_file, row.json_url = prev

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
        row.block_id: snapshot_row_value(row)
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
        if prev is not None:
            prev_type, prev_value = prev
            if prev_type == slot["value_type"] and prev_value is not None:
                write_row_value(row, row.value_type, prev_value)
            else:
                write_row_value(row, row.value_type, slot["value"])
        else:
            write_row_value(row, row.value_type, slot["value"])

    return len(slots)


def enumerate_nme_gradient_slots(nme_path):
    """Return inspector-visible GradientBlock descriptors from an NME JSON file.

    Each entry: block_id, block_name, group_in_inspector, color_steps.
    """
    blocks = _load_nme_blocks(nme_path)
    slots = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if block.get("customType") != _GRADIENT_BLOCK_TYPE:
            continue
        if not block.get("visibleInInspector"):
            continue

        slots.append({
            "block_id": int(block.get("id", 0)),
            "block_name": block.get("name") or f"Block {block.get('id', '?')}",
            "group_in_inspector": (block.get("groupInInspector") or "").strip(),
            "color_steps": read_color_steps(block),
        })
    return slots


def sync_material_nme_gradients(material):
    """Rebuild bjs_nme_gradients from the assigned NME JSON, keeping edited stops."""
    nme_file = getattr(material, "bjs_nme_file", "") or ""
    if not nme_file:
        return 0

    slots = enumerate_nme_gradient_slots(nme_file)
    existing = {
        row.block_id: snapshot_row_steps(row)
        for row in material.bjs_nme_gradients
        if row.block_id
    }

    material.bjs_nme_gradients.clear()
    for slot in slots:
        row = material.bjs_nme_gradients.add()
        row.block_id = slot["block_id"]
        row.block_name = slot["block_name"]
        row.group_in_inspector = slot["group_in_inspector"]
        prev = existing.get(slot["block_id"])
        if prev is not None:
            prev_steps, prev_ramp = prev
            if prev_steps:
                write_row_steps(row, prev_steps)
            else:
                write_row_steps(row, slot["color_steps"])
            row.ramp_texture = prev_ramp
        else:
            write_row_steps(row, slot["color_steps"])
        setup_gradient_ramp(material, row)

    return len(slots)


def sync_material_nme(material):
    """Rescan textures, inspector inputs, and gradients from the assigned NME JSON."""
    texture_count = sync_material_nme_textures(material)
    input_count = sync_material_nme_inputs(material)
    gradient_count = sync_material_nme_gradients(material)
    return texture_count, input_count, gradient_count
