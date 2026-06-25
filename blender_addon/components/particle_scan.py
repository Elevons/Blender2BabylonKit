"""Scan a Node Particle Editor JSON for texture-bearing blocks."""

import json
import os

import bpy

_TEXTURE_BLOCK = "BABYLON.ParticleTextureSourceBlock"


def _block_type_label(custom_type):
    if not custom_type:
        return ""
    return custom_type.rsplit(".", 1)[-1]


def _url_is_embedded(url):
    url = (url or "").strip()
    return bool(url) and url.startswith("data:")


def enumerate_particle_texture_slots(particle_path):
    """Return texture slot descriptors from a particle JSON file.

    Each entry: block_id, block_name, block_type, match_url, has_embedded,
    needs_file.
    """
    path = bpy.path.abspath(particle_path)
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
        if block.get("customType") != _TEXTURE_BLOCK:
            continue

        url = (block.get("url") or "").strip()
        embedded = _url_is_embedded(url)
        slots.append({
            "block_id": int(block.get("id", 0)),
            "block_name": block.get("name") or f"Block {block.get('id', '?')}",
            "block_type": _block_type_label(block.get("customType")),
            "match_url": url if url and not url.startswith("data:") else "",
            "has_embedded": embedded,
            "needs_file": not embedded and not url,
        })
    return slots


def sync_component_particle_textures(comp):
    """Rebuild particle_textures from the assigned particle JSON, keeping image picks."""
    particle_file = getattr(comp, "particle_file", "") or ""
    if not particle_file:
        return 0

    slots = enumerate_particle_texture_slots(particle_file)
    existing = {
        tex.block_id: tex
        for tex in comp.particle_textures
        if tex.block_id
    }

    comp.particle_textures.clear()
    for slot in slots:
        row = comp.particle_textures.add()
        row.block_id = slot["block_id"]
        row.block_name = slot["block_name"]
        row.block_type = slot["block_type"]
        row.match_url = slot["match_url"]
        prev = existing.get(slot["block_id"])
        if prev is not None:
            row.image_file = prev.image_file
            row.json_url = prev.json_url

    return len(slots)
