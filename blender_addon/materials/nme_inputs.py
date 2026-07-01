"""Value conversion between NME InputBlock JSON and Blender property rows."""

_INPUT_BLOCK_TYPE = "BABYLON.InputBlock"

_NME_TYPE_FROM_CODE = {
    1: 'FLOAT',
    2: 'INT',
    4: 'VECTOR2',
    8: 'VECTOR3',
    16: 'VECTOR4',
    32: 'COLOR3',
    64: 'COLOR4',
}

_SKIP_INPUT_TYPE_CODES = frozenset({128, 256})


def resolve_nme_input_type(block):
    """Map an NME InputBlock dict to our value_type enum, or None if unsupported."""
    if block.get("customType") != _INPUT_BLOCK_TYPE:
        return None
    if block.get("isBoolean"):
        return 'BOOL'
    code = block.get("type", 0)
    if code in _SKIP_INPUT_TYPE_CODES:
        return None
    return _NME_TYPE_FROM_CODE.get(code)


def read_json_value(block, value_type):
    """Read the NME JSON `value` field into a Python value for `value_type`."""
    raw = block.get("value")
    if value_type == 'FLOAT':
        return float(raw if raw is not None else 0.0)
    if value_type == 'INT':
        return int(raw if raw is not None else 0)
    if value_type == 'BOOL':
        return bool(raw)
    if value_type == 'VECTOR2':
        vals = list(raw or [0.0, 0.0])[:2]
        return vals + [0.0] * (2 - len(vals))
    if value_type == 'VECTOR3':
        vals = list(raw or [0.0, 0.0, 0.0])[:3]
        return vals + [0.0] * (3 - len(vals))
    if value_type == 'VECTOR4':
        vals = list(raw or [0.0, 0.0, 0.0, 0.0])[:4]
        return vals + [0.0] * (4 - len(vals))
    if value_type == 'COLOR3':
        vals = list(raw or [1.0, 1.0, 1.0])[:3]
        return vals + [1.0] * (3 - len(vals))
    if value_type == 'COLOR4':
        vals = list(raw or [1.0, 1.0, 1.0, 1.0])[:4]
        return vals + [1.0] * (4 - len(vals))
    return None


def write_row_value(row, value_type, value):
    """Store a Python value on a BJSNmeInput row."""
    if value_type == 'FLOAT':
        row.f_val = float(value)
    elif value_type == 'INT':
        row.i_val = int(value)
    elif value_type == 'BOOL':
        row.b_val = bool(value)
    elif value_type == 'VECTOR2':
        vals = list(value)[:2]
        row.v2_val = tuple(vals + [0.0] * (2 - len(vals)))
    elif value_type == 'VECTOR3':
        vals = list(value)[:3]
        row.v3_val = tuple(vals + [0.0] * (3 - len(vals)))
    elif value_type == 'VECTOR4':
        vals = list(value)[:4]
        row.v4_val = tuple(vals + [0.0] * (4 - len(vals)))
    elif value_type == 'COLOR3':
        vals = list(value)[:3]
        row.c3_val = tuple(vals + [1.0] * (3 - len(vals)))
    elif value_type == 'COLOR4':
        vals = list(value)[:4]
        row.c4_rgb = tuple(vals[:3] + [1.0, 1.0, 1.0][len(vals[:3]):3])
        row.c4_a = float(vals[3]) if len(vals) > 3 else 1.0


def row_value_to_json(row):
    """Serialize a BJSNmeInput row back to an NME JSON `value`."""
    value_type = row.value_type
    if value_type == 'FLOAT':
        return row.f_val
    if value_type == 'INT':
        return row.i_val
    if value_type == 'BOOL':
        return row.b_val
    if value_type == 'VECTOR2':
        return list(row.v2_val)
    if value_type == 'VECTOR3':
        return list(row.v3_val)
    if value_type == 'VECTOR4':
        return list(row.v4_val)
    if value_type == 'COLOR3':
        return list(row.c3_val)
    if value_type == 'COLOR4':
        return [row.c4_rgb[0], row.c4_rgb[1], row.c4_rgb[2], row.c4_a]
    return None
