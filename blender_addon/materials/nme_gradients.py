"""Value conversion between NME GradientBlock JSON and Blender property rows."""

import re

import bpy

_GRADIENT_BLOCK_TYPE = "BABYLON.GradientBlock"

_DEFAULT_STOPS = (
    {"step": 0.0, "color": [0.0, 0.0, 0.0]},
    {"step": 1.0, "color": [1.0, 1.0, 1.0]},
)

_pending_ramp_keys = set()
_ramp_sync_timer_registered = False


def sort_color_steps(steps):
    """Return color steps sorted by position — GradientBlock shaders assume ascending order."""
    return sorted(steps, key=lambda entry: float(entry["step"]))


def _sanitize_texture_name(label):
    cleaned = re.sub(r"[^\w.\-]+", "_", label).strip("._")
    return cleaned or "Gradient"


def _gradient_row_key(material, row):
    return (material.name, int(row.block_id))


def _steps_dict_from_row(row):
    """Read serialized color stops from a BJSNmeGradient row."""
    steps = []
    for stop in row.steps:
        steps.append({
            "step": float(stop.step_value),
            "color": [
                float(stop.color[0]),
                float(stop.color[1]),
                float(stop.color[2]),
            ],
        })
    return sort_color_steps(steps)


def _create_gradient_ramp_texture(material, row):
    """Create or relink the hidden BLEND texture that hosts the ColorRamp."""
    block_label = _sanitize_texture_name(row.block_name or "Gradient")
    material_label = _sanitize_texture_name(material.name)
    block_key = row.block_id or 0
    texture_name = f"BJS_NME_Ramp.{material_label}.{block_key}.{block_label}"

    existing = bpy.data.textures.get(texture_name)
    if existing is not None:
        existing.use_color_ramp = True
        row.ramp_texture = existing
        return existing

    texture = bpy.data.textures.new(name=texture_name, type='BLEND')
    texture.use_color_ramp = True
    row.ramp_texture = texture
    return texture


def get_gradient_ramp_texture(row):
    """Read-only lookup for panel draw — never creates or mutates ID data-blocks."""
    texture = row.ramp_texture
    if texture is None or texture.name not in bpy.data.textures:
        return None
    if not texture.use_color_ramp:
        return None
    return texture


def setup_gradient_ramp(material, row):
    """Create the ColorRamp texture and seed it from serialized steps (Scan NME / export prep)."""
    texture = _create_gradient_ramp_texture(material, row)
    sync_steps_to_ramp(row, texture)


def schedule_ramp_to_steps_sync(material, row):
    """Defer ramp → steps sync until after the panel draw finishes (Blender 5+ restriction)."""
    global _ramp_sync_timer_registered

    _pending_ramp_keys.add(_gradient_row_key(material, row))
    if _ramp_sync_timer_registered:
        return

    bpy.app.timers.register(_flush_ramp_to_steps_sync, first_interval=0.0)
    _ramp_sync_timer_registered = True


def _flush_ramp_to_steps_sync():
    """Timer callback: copy edited ColorRamp elements back onto property rows."""
    global _ramp_sync_timer_registered

    keys = list(_pending_ramp_keys)
    _pending_ramp_keys.clear()

    for material_name, block_id in keys:
        material = bpy.data.materials.get(material_name)
        if material is None:
            continue
        for row in material.bjs_nme_gradients:
            if int(row.block_id) != block_id:
                continue
            texture = get_gradient_ramp_texture(row)
            if texture is not None:
                sync_ramp_to_steps(row, texture)
            break

    if _pending_ramp_keys:
        bpy.app.timers.register(_flush_ramp_to_steps_sync, first_interval=0.0)
    else:
        _ramp_sync_timer_registered = False

    return None


def sync_steps_to_ramp(row, texture):
    """Copy serialized steps onto the Blender ColorRamp (linear RGB)."""
    ramp = texture.color_ramp
    ramp.color_mode = 'RGB'
    ramp.interpolation = 'LINEAR'

    steps = _steps_dict_from_row(row)
    if len(steps) < 2:
        steps = list(_DEFAULT_STOPS)

    while len(ramp.elements) > 1:
        ramp.elements.remove(ramp.elements[-1])

    first = steps[0]
    ramp.elements[0].position = float(first["step"])
    ramp.elements[0].color = (
        float(first["color"][0]),
        float(first["color"][1]),
        float(first["color"][2]),
        1.0,
    )

    for stop in steps[1:]:
        element = ramp.elements.new(float(stop["step"]))
        element.position = float(stop["step"])
        element.color = (
            float(stop["color"][0]),
            float(stop["color"][1]),
            float(stop["color"][2]),
            1.0,
        )


def sync_ramp_to_steps(row, texture):
    """Copy Blender ColorRamp elements back onto serialized steps."""
    if not texture.use_color_ramp:
        return

    ramp = texture.color_ramp
    row.steps.clear()
    for element in ramp.elements:
        item = row.steps.add()
        item.step_value = float(element.position)
        item.color = (
            float(element.color[0]),
            float(element.color[1]),
            float(element.color[2]),
        )


def read_color_steps(block):
    """Read colorSteps from an NME GradientBlock dict."""
    raw_steps = block.get("colorSteps")
    if not isinstance(raw_steps, list):
        return []

    steps = []
    for entry in raw_steps:
        if not isinstance(entry, dict):
            continue
        color = entry.get("color")
        if not isinstance(color, dict):
            continue
        steps.append({
            "step": float(entry.get("step", 0.0)),
            "color": [
                float(color.get("r", 0.0)),
                float(color.get("g", 0.0)),
                float(color.get("b", 0.0)),
            ],
        })
    return sort_color_steps(steps)


def snapshot_row_steps(row):
    """Capture gradient stops and ramp texture as plain data (safe across collection clear)."""
    return _steps_dict_from_row(row), row.ramp_texture


def copy_row_steps(src_row, dst_row):
    """Copy serialized color stops from one BJSNmeGradient row to another."""
    write_row_steps(dst_row, _steps_dict_from_row(src_row))


def write_row_steps(row, steps):
    """Store parsed color steps on a BJSNmeGradient row."""
    row.steps.clear()
    for step in steps:
        item = row.steps.add()
        item.step_value = float(step["step"])
        color = step["color"]
        item.color = (
            float(color[0]),
            float(color[1]),
            float(color[2]),
        )


def row_steps_to_json(row):
    """Serialize a BJSNmeGradient row back to NME colorSteps JSON."""
    texture = get_gradient_ramp_texture(row)
    if texture is not None:
        sync_ramp_to_steps(row, texture)

    steps = []
    for stop in row.steps:
        steps.append({
            "step": stop.step_value,
            "color": {
                "r": stop.color[0],
                "g": stop.color[1],
                "b": stop.color[2],
            },
        })
    return sort_color_steps(steps)
