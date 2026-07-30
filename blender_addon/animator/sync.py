"""Reconcile Parameter nodes in a tree with ANIMATOR component animator_vars."""


def _param_fields_from_tree(tree):
    """List of {name, ptype, default} from Parameter nodes (first wins on dupes)."""
    fields = []
    seen = set()
    for node in tree.nodes:
        if getattr(node, "bl_idname", "") != "BJSAnimParameterNode":
            continue
        name = (node.param_name or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        ptype = node.ptype
        if ptype == 'FLOAT':
            default = float(node.f_default)
        elif ptype == 'BOOL':
            default = bool(node.b_default)
        elif ptype == 'INT':
            default = int(node.i_default)
        else:
            default = False
        fields.append({"name": name, "ptype": ptype, "default": default})
    return fields


def _init_param_value(row, field):
    ptype = field["ptype"]
    default = field["default"]
    row.ptype = ptype
    if ptype == 'FLOAT':
        row.f_val = float(default)
    elif ptype == 'BOOL':
        row.b_val = bool(default)
    elif ptype == 'INT':
        row.i_val = int(default)
    else:
        row.b_val = False


def sync_animator_params(comp, tree):
    """Reconcile comp.animator_vars with Parameter nodes in `tree`.

    Updates rows in place (never clear()+rebuild) so library overrides stay sane.
    Existing values are preserved when name and type still match.
    """
    if tree is None:
        return 0

    fields = _param_fields_from_tree(tree)
    by_name = {f["name"]: f for f in fields}

    # Drop rows whose parameter was removed from the graph.
    for index in range(len(comp.animator_vars) - 1, -1, -1):
        row = comp.animator_vars[index]
        if row.name not in by_name:
            comp.animator_vars.remove(index)

    existing = {row.name: row for row in comp.animator_vars}

    for field in fields:
        row = existing.get(field["name"])
        if row is None:
            row = comp.animator_vars.add()
            row.name = field["name"]
            row.label = field["name"]
            _init_param_value(row, field)
        elif row.ptype != field["ptype"]:
            _init_param_value(row, field)
        # else: keep panel-edited value

    return len(fields)


def write_param_defaults_to_tree(comp, tree):
    """Push panel default values back onto matching Parameter nodes."""
    if tree is None:
        return
    by_name = {row.name: row for row in comp.animator_vars}
    for node in tree.nodes:
        if getattr(node, "bl_idname", "") != "BJSAnimParameterNode":
            continue
        name = (node.param_name or "").strip()
        row = by_name.get(name)
        if row is None:
            continue
        if row.ptype == 'FLOAT':
            node.f_default = row.f_val
        elif row.ptype == 'BOOL':
            node.b_default = row.b_val
        elif row.ptype == 'INT':
            node.i_default = row.i_val
