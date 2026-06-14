"""Copying authored asset files (audio, GUI json, images, ...) next to the
export, with URL-safe filenames."""

import os
import re
import shutil

import bpy


def _sanitize_asset_filename(filename):
    """Strip characters that break URL fetch (parens, spaces, …) from copied assets."""
    name, ext = os.path.splitext(filename)
    safe = re.sub(r'[^\w.\-]+', '_', name)
    safe = safe.strip('._') or 'asset'
    return safe + ext.lower()


def copy_asset(filepath, output_dir, subdir):
    """Copy an authored asset file into <output_dir>/<subdir>/ (like env textures)
    and return its manifest-relative path, or None if the source is missing."""
    src = bpy.path.abspath(filepath)
    if not os.path.isfile(src):
        return None
    dest_dir = os.path.join(output_dir, subdir)
    os.makedirs(dest_dir, exist_ok=True)
    filename = _sanitize_asset_filename(os.path.basename(src))
    dest = os.path.join(dest_dir, filename)
    # Two different sources can sanitize to the same name — pick a free variant.
    if os.path.isfile(dest) and os.path.abspath(src) != os.path.abspath(dest):
        stem, ext = os.path.splitext(filename)
        n = 2
        while os.path.isfile(dest):
            filename = f"{stem}_{n}{ext}"
            dest = os.path.join(dest_dir, filename)
            n += 1
    if os.path.abspath(src) != os.path.abspath(dest):
        shutil.copy2(src, dest)
    return subdir + "/" + filename
