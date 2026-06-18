"""Copying authored asset files (audio, GUI json, images, ...) next to the
export, with URL-safe filenames."""

import os
import re
import shutil

import bpy


def sanitize_asset_filename(filename):
    """Strip characters that break URL fetch (parens, spaces, …) from copied assets."""
    name, ext = os.path.splitext(filename)
    safe = re.sub(r'[^\w.\-]+', '_', name)
    safe = safe.strip('._') or 'asset'
    return safe + ext.lower()


def unique_asset_path(dest_dir, filename, src=None):
    """Pick a destination path under dest_dir, suffixing _2, _3, … on collision."""
    dest = os.path.join(dest_dir, filename)
    if src and os.path.normpath(src) == os.path.normpath(dest):
        return dest, filename
    if not os.path.isfile(dest):
        return dest, filename
    stem, ext = os.path.splitext(filename)
    n = 2
    while os.path.isfile(dest):
        filename = f"{stem}_{n}{ext}"
        dest = os.path.join(dest_dir, filename)
        n += 1
    return dest, filename


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
    dest, filename = unique_asset_path(dest_dir, filename)
    orig = image.filepath_raw
    image.filepath_raw = dest
    image.save()
    image.filepath_raw = orig
    return subdir + "/" + filename
