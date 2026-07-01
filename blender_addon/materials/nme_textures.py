"""Decode and extract embedded textures from NME JSON files."""

import base64
import json
import os
import re

import bpy

_TEXTURE_BLOCK_TYPES = frozenset({
    "BABYLON.ImageSourceBlock",
    "BABYLON.TextureBlock",
})

_DATA_URI_RE = re.compile(r"^data:([^;]+);base64,(.+)$", re.DOTALL)


def _sanitize_filename(label):
    cleaned = re.sub(r"[^\w.\-]+", "_", (label or "").strip())
    return cleaned.strip("._") or "Texture"


def texture_is_embedded(tex):
    """Return True when texture bytes live inside the JSON (not an external path)."""
    if not isinstance(tex, dict):
        return False
    url = (tex.get("url") or "").strip()
    if tex.get("base64String"):
        return True
    return url.startswith("data:")


def _ext_from_mime(mime, raw):
    mime = (mime or "").lower()
    if "png" in mime:
        return "png"
    if "jpeg" in mime or "jpg" in mime:
        return "jpg"
    if "webp" in mime:
        return "webp"
    return _ext_from_bytes(raw)


def _ext_from_bytes(raw):
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if raw[:3] == b"\xff\xd8\xff":
        return "jpg"
    if raw[:4] == b"RIFF" and len(raw) > 12 and raw[8:12] == b"WEBP":
        return "webp"
    return "png"


def decode_texture_payload(tex):
    """Return (raw_bytes, extension) for an embedded NME texture dict, or None."""
    if not isinstance(tex, dict):
        return None

    b64 = tex.get("base64String")
    if b64:
        raw = base64.b64decode(b64)
        return raw, _ext_from_bytes(raw)

    url = (tex.get("url") or "").strip()
    if not url.startswith("data:"):
        return None
    match = _DATA_URI_RE.match(url)
    if match is None:
        return None
    mime, payload = match.group(1), match.group(2)
    raw = base64.b64decode(payload)
    return raw, _ext_from_mime(mime, raw)


def _texture_blocks(data):
    blocks = data.get("blocks")
    if not isinstance(blocks, list):
        return []
    return [
        block for block in blocks
        if isinstance(block, dict)
        and block.get("customType") in _TEXTURE_BLOCK_TYPES
        and isinstance(block.get("texture"), dict)
    ]


def load_nme_json(nme_path):
    path = bpy.path.abspath(nme_path)
    if not os.path.isfile(path):
        return None, path
    with open(path, encoding="utf-8") as handle:
        return json.load(handle), path


def extract_nme_textures(nme_path, dest_dir):
    """Write each embedded texture block to dest_dir.

    Returns a list of dicts: block_id, block_name, block_type, filename, abs_path.
    """
    data, _path = load_nme_json(nme_path)
    if data is None:
        return []

    dest_abs = os.path.normpath(bpy.path.abspath(dest_dir))
    os.makedirs(dest_abs, exist_ok=True)

    extracted = []
    for block in _texture_blocks(data):
        tex = block["texture"]
        if not texture_is_embedded(tex):
            continue
        decoded = decode_texture_payload(tex)
        if decoded is None:
            continue

        raw, ext = decoded
        block_id = int(block.get("id", 0))
        block_name = block.get("name") or "Texture"
        label = _sanitize_filename(block_name)
        filename = f"{label}_{block_id}.{ext}"
        out_path = os.path.join(dest_abs, filename)
        with open(out_path, "wb") as handle:
            handle.write(raw)

        extracted.append({
            "block_id": block_id,
            "block_name": block_name,
            "block_type": block.get("customType", "").rsplit(".", 1)[-1],
            "filename": filename,
            "abs_path": out_path,
        })

    return extracted
