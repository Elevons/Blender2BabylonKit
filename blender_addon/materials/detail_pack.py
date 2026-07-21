"""Pack separate detail channels into Babylon's Unity-layout detail map."""

import os
import uuid

import bpy

# Mid-gray disables a channel's effect in Babylon's detail-map shader.
_NEUTRAL = 128 / 255.0

# Browser-safe formats for packed detail maps (copied as-is on export).
_DETAIL_IMAGE_EXTS = frozenset({".png", ".jpg", ".jpeg", ".webp"})


def _path_set(path):
    """True when a FILE_PATH string is non-empty after trimming."""
    return bool(path and str(path).strip())


def _abs_image(path):
    if not _path_set(path):
        return None
    abs_path = os.path.normpath(bpy.path.abspath(str(path).strip()))
    if not os.path.isfile(abs_path):
        return None
    return abs_path


def _luminance(red, green, blue):
    return red * 0.299 + green * 0.587 + blue * 0.114


def _load_image(abs_path):
    """Load a file-backed image for export-time packing (temporary datablock)."""
    image = bpy.data.images.load(abs_path, check_existing=False)
    image.name = f"__bjs_detail_src_{uuid.uuid4().hex[:8]}__"
    if image.size[0] <= 0 or image.size[1] <= 0:
        _remove_image(image)
        return None
    if not image.has_data:
        image.reload()
    if not image.has_data:
        _remove_image(image)
        return None
    return image


def _remove_image(image):
    if image is not None and image.name in bpy.data.images:
        bpy.data.images.remove(image)


def _scaled_pixels(image, width, height):
    """Return RGBA floats for an image scaled to width x height."""
    if image.size[0] != width or image.size[1] != height:
        scaled = image.copy()
        scaled.scale(width, height)
        try:
            return list(scaled.pixels)
        finally:
            _remove_image(scaled)

    return list(image.pixels)


def is_supported_detail_image(path):
    """True when path points to a PNG/JPG/WEBP file the runtime can load."""
    abs_path = _abs_image(path)
    if abs_path is None:
        return False
    return os.path.splitext(abs_path)[1].lower() in _DETAIL_IMAGE_EXTS


def detail_has_separate_channels(detail):
    """True when any separate albedo/normal/roughness path is assigned."""
    return any(
        _path_set(path)
        for path in (detail.albedo_file, detail.normal_file, detail.roughness_file)
    )


def detail_map_has_sources(detail):
    """True when a packed map or at least one separate channel is assigned."""
    if _path_set(detail.texture_file):
        return True
    return any(
        _path_set(path)
        for path in (detail.albedo_file, detail.normal_file, detail.roughness_file)
    )


def pack_detail_map(albedo_file, normal_file, roughness_file, dest_abs):
    """Write an RGBA PNG using Babylon's detail-map channel layout.

    R = greyscale albedo, G = normal green, B = roughness, A = normal red.
    Missing channels are filled with 0.5 (128) so the shader ignores them.
    Uses Blender's image API — no Pillow dependency.
    """
    loaded = []
    try:
        sources = []
        for path in (albedo_file, normal_file, roughness_file):
            abs_path = _abs_image(path)
            if abs_path is None:
                sources.append(None)
                continue
            image = _load_image(abs_path)
            if image is None:
                return False
            loaded.append(image)
            sources.append(image)

        present = [image for image in sources if image is not None]
        if not present:
            return False

        width = max(image.size[0] for image in present)
        height = max(image.size[1] for image in present)
        pixel_count = width * height

        albedo_pixels = _scaled_pixels(sources[0], width, height) if sources[0] else None
        normal_pixels = _scaled_pixels(sources[1], width, height) if sources[1] else None
        roughness_pixels = _scaled_pixels(sources[2], width, height) if sources[2] else None

        output_pixels = [0.0] * (pixel_count * 4)
        for index in range(pixel_count):
            offset = index * 4

            if albedo_pixels is not None:
                output_pixels[offset] = _luminance(
                    albedo_pixels[offset],
                    albedo_pixels[offset + 1],
                    albedo_pixels[offset + 2],
                )
            else:
                output_pixels[offset] = _NEUTRAL

            if normal_pixels is not None:
                output_pixels[offset + 1] = normal_pixels[offset + 1]
                output_pixels[offset + 3] = normal_pixels[offset]
            else:
                output_pixels[offset + 1] = _NEUTRAL
                output_pixels[offset + 3] = _NEUTRAL

            if roughness_pixels is not None:
                output_pixels[offset + 2] = _luminance(
                    roughness_pixels[offset],
                    roughness_pixels[offset + 1],
                    roughness_pixels[offset + 2],
                )
            else:
                output_pixels[offset + 2] = _NEUTRAL

        os.makedirs(os.path.dirname(dest_abs), exist_ok=True)
        packed = bpy.data.images.new(
            f"__bjs_detail_pack_{uuid.uuid4().hex[:8]}__",
            width=width,
            height=height,
            alpha=True,
        )
        try:
            packed.pixels = output_pixels
            packed.filepath_raw = dest_abs
            packed.file_format = 'PNG'
            packed.save()
        finally:
            _remove_image(packed)

        return os.path.isfile(dest_abs)
    finally:
        for image in loaded:
            _remove_image(image)
