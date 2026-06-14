"""Input Actions <-> manifest serialization.

One module owns both directions:
  serialize_input_asset(scene)      scene props -> manifest-shaped dict
  apply_input_asset(scene, data)    manifest-shaped dict -> scene props

plus the friendly-key-alias table shared by both, and
ensure_scene_input_maps() which seeds the panel with the built-in asset.
"""

# Friendly aliases -> real JS KeyboardEvent.key values, applied to authored
# key tokens at export so the runtime gets the real key ("space" -> " ").
KEY_ALIASES = {
    "space": " ", "comma": ",", "period": ".", "semicolon": ";",
    "quote": "'", "backquote": "`", "minus": "-", "equals": "=",
    "slash": "/", "backslash": "\\", "bracketleft": "[", "bracketright": "]",
}

_ACTION_TYPES = {'BUTTON', 'VALUE', 'PASSTHROUGH'}
_CONTROL_TYPES = {'BUTTON', 'AXIS', 'VECTOR2'}
_GP_CONTROLS = {'BUTTON', 'AXIS', 'STICK'}
_COMPOSITES = {'1DAXIS', '2DVECTOR'}
COMPOSITE_PART_ORDER = {
    '1DAXIS': ("negative", "positive"),
    '2DVECTOR': ("up", "down", "left", "right"),
}


# ── scene props -> manifest ──

def _serialize_binding(row):
    """One direct binding row -> manifest data (keyboard key or gamepad control)."""
    if row.device == 'KEYBOARD':
        key = row.key.strip().lower()
        data = {"device": "KEYBOARD", "control": KEY_ALIASES.get(key, key)}
    else:
        data = {"device": "GAMEPAD", "control": row.gp_control.lower(),
                "index": row.index}
    if row.scale != 1.0:
        data["scale"] = row.scale
    return data


def _serialize_bindings(action):
    """An action's flat binding rows -> manifest bindings. Composite headers
    (composite != NONE) swallow the part rows (part != NONE) that follow them
    into a `parts` dict, mirroring Unity's serialized composite layout."""
    bindings = []
    open_composite = None
    for row in action.bindings:
        if row.composite != 'NONE':
            open_composite = {"composite": row.composite, "parts": {}}
            bindings.append(open_composite)
        elif row.part != 'NONE':
            if open_composite is not None:
                open_composite["parts"][row.part.lower()] = _serialize_binding(row)
        else:
            open_composite = None
            bindings.append(_serialize_binding(row))
    return bindings


def serialize_input_asset(scene):
    """The scene's Input Actions asset (maps > actions > bindings) -> manifest
    data. When the panel is empty, the built-in default asset is serialized so
    the runtime always receives the scene-level input set."""
    from .defaults import DEFAULT_INPUT_ASSET

    if len(scene.bjs_input_maps) == 0:
        return DEFAULT_INPUT_ASSET

    return {
        "maps": [{
            "name": m.name,
            "actions": [{
                "name": a.name,
                "type": a.action_type,
                "controlType": a.control_type,
                "bindings": _serialize_bindings(a),
            } for a in m.actions],
        } for m in scene.bjs_input_maps],
    }


# ── manifest -> scene props ──

def _apply_binding_fields(row, data):
    """Fill one binding row's control fields from manifest-shaped data."""
    js_to_alias = {real: alias for alias, real in KEY_ALIASES.items()}

    device = str(data.get("device", "KEYBOARD")).upper()
    row.device = device if device in ('KEYBOARD', 'GAMEPAD') else 'KEYBOARD'
    if row.device == 'KEYBOARD':
        key = str(data.get("control", ""))
        row.key = js_to_alias.get(key, key)
    else:
        control = str(data.get("control", "button")).upper()
        row.gp_control = control if control in _GP_CONTROLS else 'BUTTON'
        row.index = max(0, int(data.get("index", 0) or 0))
    try:
        row.scale = float(data.get("scale", 1.0))
    except (TypeError, ValueError):
        row.scale = 1.0


def apply_input_asset(scene, data):
    """Replace the scene's Input Actions with manifest-shaped asset data."""
    from .defaults import DEFAULT_INPUT_MAP_NAME

    scene.bjs_input_maps.clear()

    for map_data in data.get("maps", []):
        m = scene.bjs_input_maps.add()
        m.name = map_data.get("name", "Map")

        for action_data in map_data.get("actions", []):
            a = m.actions.add()
            a.name = action_data.get("name", "Action")
            atype = str(action_data.get("type", "BUTTON")).upper()
            a.action_type = atype if atype in _ACTION_TYPES else 'BUTTON'
            ctype = str(action_data.get("controlType", "BUTTON")).upper()
            a.control_type = ctype if ctype in _CONTROL_TYPES else 'BUTTON'

            for binding_data in action_data.get("bindings", []):
                composite = str(binding_data.get("composite") or "").upper()
                if composite in _COMPOSITES:
                    header = a.bindings.add()
                    header.composite = composite
                    parts = binding_data.get("parts", {})
                    for part in COMPOSITE_PART_ORDER[composite]:
                        if part in parts:
                            row = a.bindings.add()
                            row.part = part.upper()
                            _apply_binding_fields(row, parts[part])
                else:
                    row = a.bindings.add()
                    _apply_binding_fields(row, binding_data)

        m.active_action = 0 if len(m.actions) else -1

    scene.bjs_input_map_active = 0 if len(scene.bjs_input_maps) else -1
    if scene.bjs_input_default_map not in {m.name for m in scene.bjs_input_maps}:
        scene.bjs_input_default_map = (
            scene.bjs_input_maps[0].name if len(scene.bjs_input_maps) else DEFAULT_INPUT_MAP_NAME
        )


def ensure_scene_input_maps(scene):
    """Seed the panel with the built-in asset when empty so the scene always
    has an authored input set visible in the Input Actions view."""
    from .defaults import DEFAULT_INPUT_ASSET, DEFAULT_INPUT_MAP_NAME

    if len(scene.bjs_input_maps) > 0:
        return False
    apply_input_asset(scene, DEFAULT_INPUT_ASSET)
    scene.bjs_input_default_map = DEFAULT_INPUT_MAP_NAME
    return True
