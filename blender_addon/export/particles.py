"""Particle system export: copy the JSON, copy texture images, patch texture URLs."""

import json
import os
import shutil

import bpy

from .assets import copy_asset, sanitize_asset_filename, unique_asset_path

_TEXTURE_BLOCK = "BABYLON.ParticleTextureSourceBlock"


def _resolve_json_url(image_file, json_url):
    url = (json_url or os.path.basename(image_file)).strip().replace("\\", "/")
    if not url:
        url = sanitize_asset_filename(os.path.basename(image_file))
    return url


def copy_particle_texture(image_file, output_dir, json_url=""):
    """Copy an image into particles/ (optionally a subpath) and return the URL for the JSON."""
    src = bpy.path.abspath(image_file)
    if not os.path.isfile(src):
        return None

    url = _resolve_json_url(image_file, json_url)
    parts = url.split("/")
    filename = sanitize_asset_filename(parts[-1])
    if len(parts) > 1:
        dest_dir = os.path.join(output_dir, "particles", *parts[:-1])
        rel_prefix = "/".join(parts[:-1])
    else:
        dest_dir = os.path.join(output_dir, "particles")
        rel_prefix = ""

    os.makedirs(dest_dir, exist_ok=True)
    dest, filename = unique_asset_path(dest_dir, filename, src)
    rel_url = f"{rel_prefix}/{filename}" if rel_prefix else filename

    if os.path.normpath(src) != os.path.normpath(dest):
        shutil.copy2(src, dest)

    return rel_url


def _texture_blocks(data):
    blocks = data.get("blocks")
    if not isinstance(blocks, list):
        return []
    return [
        block for block in blocks
        if isinstance(block, dict) and block.get("customType") == _TEXTURE_BLOCK
    ]


def patch_particle_json_textures(json_abs, assignments):
    """Write rel_url onto matching ParticleTextureSourceBlock rows in the exported JSON."""
    if not assignments:
        return

    with open(json_abs, encoding="utf-8") as handle:
        data = json.load(handle)

    texture_blocks = _texture_blocks(data)
    if not texture_blocks:
        return

    blocks_by_id = {
        block["id"]: block
        for block in texture_blocks
        if isinstance(block.get("id"), int)
    }
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
                if (block.get("url") or "") == match_url
            ]
        elif len(assignments) == 1:
            empty = [
                block for block in texture_blocks
                if not (block.get("url") or "").strip()
            ]
            targets = empty if empty else [texture_blocks[0]]
        else:
            for block in texture_blocks:
                if id(block) in patched_ids:
                    continue
                targets = [block]
                break

        for block in targets:
            block["url"] = rel_url
            patched_ids.add(id(block))

    with open(json_abs, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def export_particle_system(particle_file, textures, output_dir):
    """Copy the particle JSON and any authored texture overrides next to the export."""
    manifest_path = copy_asset(particle_file, output_dir, "particles")
    if manifest_path is None:
        return None

    assignments = []
    for texture in textures:
        if not texture.image_file:
            continue
        rel_url = copy_particle_texture(texture.image_file, output_dir, texture.json_url)
        if rel_url is None:
            continue
        assignments.append({
            "block_id": texture.block_id,
            "rel_url": rel_url,
            "match_url": texture.match_url,
        })

    if assignments:
        json_abs = os.path.join(output_dir, *manifest_path.split("/"))
        patch_particle_json_textures(json_abs, assignments)

    return manifest_path
