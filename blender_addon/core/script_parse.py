"""Parse `@exposed(...)` decorated fields out of a TypeScript behavior file.

Blender can't run TypeScript, so we scan the source for the documented
decorator convention to learn which variables a script exposes, their types,
defaults, and UI hints. This is intentionally conservative: anything it can't
parse is simply not shown (the runtime still uses the field's code default).

Supported forms (one field per match):
    @exposed() speed = 45;
    @exposed({ min: 0, max: 360, label: "Speed" }) speed = 45;
    @exposed() axis: [number, number, number] = [0, 1, 0];
    @exposed({ type: "color" }) tint = [1, 0, 0];
    @exposed({ type: "vector2" }) range = [10, 100];
    @exposed() enabled = true;
    @exposed() title = "hello";
    @exposed({ type: "enum", options: ["a", "b"] }) mode = "a";
    @exposed({ type: "file" }) lut = "post/grade.cube";
    @exposed({ type: "list", of: "float" }) speeds = [1, 2, 3];
    @exposed({ type: "list", of: "vector3" }) points = [[0,0,0],[1,1,1]];

Defaults must be a single-line literal. List element types: float, int,
string, bool, vector3, color, entity (entity lists start empty — objects are
picked in Blender).
"""

import os
import re

# Matches the field declaration that follows an @exposed(...) decorator.
_FIELD = re.compile(
    r'\s*(?:(?:public|private|protected|readonly|declare)\s+)*'
    r'([A-Za-z_]\w*)\s*'       # field name
    r'(?::[^=;]+)?'            # optional type annotation
    r'=\s*'
    r'([^;\n]+)'              # default value literal
)


def _scan_decorators(src):
    """Yield (args_src, index_after_close_paren) for each @exposed(...).

    Scans parentheses with string-literal awareness so labels/values containing
    '(' or ')' (e.g. label: "Speed (deg/s)") don't break parsing — which a
    naive regex would."""
    token = "@exposed"
    i = 0
    while True:
        idx = src.find(token, i)
        if idx == -1:
            return
        j = idx + len(token)
        while j < len(src) and src[j].isspace():
            j += 1
        if j >= len(src) or src[j] != '(':
            i = idx + len(token)
            continue
        depth, k, in_str = 0, j, None
        while k < len(src):
            c = src[k]
            if in_str:
                if c == '\\':
                    k += 2
                    continue
                if c == in_str:
                    in_str = None
            elif c in "\"'`":
                in_str = c
            elif c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    break
            k += 1
        yield (src[j + 1:k], k + 1)
        i = k + 1


def _parse_options(arg_src):
    opts = {}
    for key in ("min", "max", "step"):
        m = re.search(rf'{key}\s*:\s*(-?\d+(?:\.\d+)?)', arg_src)
        if m:
            opts[key] = float(m.group(1))
    m = re.search(r'type\s*:\s*["\'](\w+)["\']', arg_src)
    if m:
        opts["type"] = m.group(1).lower()
    m = re.search(r'label\s*:\s*["\']([^"\']+)["\']', arg_src)
    if m:
        opts["label"] = m.group(1)
    # enum: options: ["a", "b", "c"]
    m = re.search(r'options\s*:\s*\[([^\]]*)\]', arg_src)
    if m:
        opts["options"] = re.findall(r'["\']([^"\']*)["\']', m.group(1))
    # list: of: "float" | "vector3" | ...
    m = re.search(r'\bof\s*:\s*["\'](\w+)["\']', arg_src)
    if m:
        opts["of"] = m.group(1).lower()
    return opts


def _parse_string_literal(lit):
    lit = lit.strip()
    if lit and lit[0] in "\"'`":
        return lit.strip("\"'`")
    return None


def _parse_list_default(literal, elem_type):
    """Parse a one-line array literal into a Python list, per element type."""
    if elem_type == "entity":
        return []  # entity references are picked in Blender, never from a literal
    lit = literal.strip()
    if not lit.startswith("["):
        return []
    inner = lit[1:lit.rfind("]")] if "]" in lit else lit[1:]
    if elem_type in ("vector3", "color"):
        groups = re.findall(r'\[([^\[\]]*)\]', inner)
        out = []
        for g in groups:
            nums = [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', g)][:3]
            nums += [0.0] * (3 - len(nums))
            out.append(nums[:3])
        return out
    if elem_type == "string":
        return re.findall(r'["\']([^"\']*)["\']', inner)
    if elem_type == "bool":
        return [t == "true" for t in re.findall(r'\b(true|false)\b', inner)]
    # float / int
    return [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', inner)]


def _parse_default(literal, type_hint):
    """Return (vtype, value) or None if unparseable."""
    lit = literal.strip()

    # Object references default to null; the type hint is required to know it's
    # an entity (a bare `= null` carries no type information on its own).
    if type_hint in ("entity", "node", "object"):
        return ("ENTITY", None)

    if lit in ("true", "false"):
        return ("BOOL", lit == "true")

    if lit.startswith("["):
        nums = [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', lit)]
        if type_hint == "vector2":
            vals = nums[:2]
            vals += [0.0] * (2 - len(vals))
            return ("VECTOR2", vals[:2])
        vals = nums[:3]
        vals += [0.0] * (3 - len(vals))
        return ("COLOR" if type_hint == "color" else "VECTOR3", vals[:3])

    if lit and lit[0] in "\"'`":
        return ("STRING", lit.strip("\"'`"))

    num = lit.split("//")[0].strip()
    try:
        return ("FLOAT", float(num))
    except ValueError:
        return None


# Matches the whole @inputMap("Name") decorator plus the field it precedes,
# e.g.: @inputMap("Player") player!: InputActionMap;
_INPUT_MAP = re.compile(
    r'@inputMap\s*\(\s*["\']([^"\']+)["\']\s*\)'  # map name
    r'\s*(?:(?:public|private|protected|readonly|declare)\s+)*'
    r'([A-Za-z_]\w*)?'                            # field name (optional)
)


def parse_input_maps(filepath):
    """Return a list of dicts {map, field} for each @inputMap("Name") found in
    a behavior source file. Used by the Input Actions panel to validate map
    references and create maps that scripts ask for."""
    if not filepath or not os.path.isfile(filepath):
        return []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            src = f.read()
    except OSError:
        return []

    return [{"map": m.group(1), "field": m.group(2) or ""}
            for m in _INPUT_MAP.finditer(src)]


def parse_exposed(filepath):
    """Return a list of dicts: {name, vtype, default, min, max, label}."""
    if not filepath or not os.path.isfile(filepath):
        return []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            src = f.read()
    except OSError:
        return []

    fields = []
    seen = set()
    for arg_src, after in _scan_decorators(src):
        m = _FIELD.match(src, after)
        if not m:
            continue
        name, default = m.group(1), m.group(2)
        if name in seen:
            continue
        opts = _parse_options(arg_src)
        type_hint = opts.get("type")
        elem_type = ""
        options = None

        if type_hint == "enum":
            options = opts.get("options", [])
            value = _parse_string_literal(default)
            if value is None:
                value = options[0] if options else ""
            vtype = "ENUM"
        elif type_hint == "file":
            value = _parse_string_literal(default)
            if value is None:
                value = ""
            vtype = "FILE"
        elif type_hint == "list":
            elem_type = opts.get("of", "float")
            value = _parse_list_default(default, elem_type)
            vtype = "LIST"
        else:
            parsed = _parse_default(default, type_hint)
            if parsed is None:
                continue
            vtype, value = parsed

        seen.add(name)
        fields.append({
            "name": name,
            "vtype": vtype,
            "default": value,
            "elem_type": elem_type.upper(),  # list element type (LIST only)
            "options": options,              # enum choices (ENUM only)
            "min": opts.get("min"),
            "max": opts.get("max"),
            "label": opts.get("label", ""),
        })
    return fields
