"""Copying authored asset files (audio, GUI json, images, ...) next to the
export, with URL-safe filenames."""

import os
import re
import shutil

import bpy

# Per export_level pass: (dest_dir, filename) -> normalized source key.
_reserved_slots = {}


def begin_asset_export():
    """Reset path reservations. Call once at the start of each export_level."""
    _reserved_slots.clear()


def sanitize_asset_filename(filename):
    """Strip characters that break URL fetch (parens, spaces, …) from copied assets."""
    name, ext = os.path.splitext(filename)
    safe = re.sub(r'[^\w.\-]+', '_', name)
    safe = safe.strip('._') or 'asset'
    return safe + ext.lower()


def _norm_path(path):
    if not path:
        return None
    return os.path.normpath(bpy.path.abspath(path))


def unique_asset_path(dest_dir, filename, src=None):
    """Pick a destination path under dest_dir.

    Re-exports overwrite the stable sanitized name (Live Link safe). Suffix
    _2, _3, … only when two different sources collide in the same export pass.
    """
    dest_dir = _norm_path(dest_dir)
    dest = os.path.join(dest_dir, filename)
    norm_src = _norm_path(src) if src else None

    if norm_src and norm_src == _norm_path(dest):
        return dest, filename

    key = (dest_dir, filename)

    if key in _reserved_slots:
        if _reserved_slots[key] == norm_src:
            return dest, filename
        stem, ext = os.path.splitext(filename)
        n = 2
        while True:
            candidate = f"{stem}_{n}{ext}"
            candidate_key = (dest_dir, candidate)
            if candidate_key not in _reserved_slots:
                _reserved_slots[candidate_key] = norm_src
                return os.path.join(dest_dir, candidate), candidate
            if _reserved_slots[candidate_key] == norm_src:
                return os.path.join(dest_dir, candidate), candidate
            n += 1

    _reserved_slots[key] = norm_src
    return dest, filename


def _image_asset_src_key(image):
    """Stable source key for packed or file-backed images."""
    filepath = bpy.path.abspath(image.filepath) if image.filepath else ""
    if filepath and os.path.isfile(filepath):
        return filepath
    return f"__bpy_image__:{image.name}"


def copy_asset(filepath, output_dir, subdir):
    """Copy an authored asset file into <output_dir>/<subdir>/ (like env textures)
    and return its manifest-relative path, or None if the source is missing."""
    src = bpy.path.abspath(filepath)
    if not os.path.isfile(src):
        return None
    dest_dir = os.path.join(output_dir, subdir)
    os.makedirs(dest_dir, exist_ok=True)
    filename = sanitize_asset_filename(os.path.basename(src))
    dest, filename = unique_asset_path(dest_dir, filename, src)
    if os.path.normpath(src) != os.path.normpath(dest):
        shutil.copy2(src, dest)
    return subdir + "/" + filename


def save_image_asset(image, output_dir, subdir, ext):
    """Save a packed/generated image with a URL-safe filename. Returns manifest path."""
    dest_dir = os.path.join(output_dir, subdir)
    os.makedirs(dest_dir, exist_ok=True)
    filename = sanitize_asset_filename(bpy.path.clean_name(image.name) + ext)
    dest, filename = unique_asset_path(dest_dir, filename, _image_asset_src_key(image))
    orig = image.filepath_raw
    image.filepath_raw = dest
    image.save()
    image.filepath_raw = orig
    return subdir + "/" + filename
