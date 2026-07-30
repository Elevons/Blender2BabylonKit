"""Walk a BJSAnimationStateTree into a manifest-shaped dict."""


def _linked_from(socket):
    """Nodes linked into this input socket."""
    nodes = []
    for link in socket.links:
        if link.from_node is not None:
            nodes.append(link.from_node)
    return nodes


def _linked_to(socket):
    """Nodes linked from this output socket."""
    nodes = []
    for link in socket.links:
        if link.to_node is not None:
            nodes.append(link.to_node)
    return nodes


def _state_id(node):
    sid = (getattr(node, "state_id", "") or "").strip()
    if sid:
        return sid
    return (node.label or node.name or "State").strip() or "State"


def _serialize_condition(cond):
    kind = cond.kind
    if kind == 'PARAM':
        return {
            "kind": "param",
            "param": cond.param or "",
            "op": cond.op,
            "value": float(cond.value),
            "boolValue": bool(cond.bool_value),
            "intValue": int(cond.int_value),
        }
    if kind == 'CLIP_FINISHED':
        return {"kind": "clipFinished"}
    if kind == 'AFTER_SECONDS':
        return {"kind": "afterSeconds", "seconds": float(cond.seconds)}
    if kind == 'INPUT':
        return {
            "kind": "input",
            "action": (cond.action or "").strip(),
            "phase": cond.phase.lower() if cond.phase else "pressed",
        }
    if kind == 'MESSAGE':
        return {"kind": "message", "message": (cond.message or "").strip()}
    return {"kind": "param", "param": "", "op": "GT", "value": 0.0}


def _serialize_parameters_from_tree(tree):
    """Schema from Parameter nodes (panel vars overlay defaults at component serialize)."""
    params = []
    seen = set()
    for node in tree.nodes:
        if getattr(node, "bl_idname", "") != "BJSAnimParameterNode":
            continue
        name = (node.param_name or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        ptype = node.ptype.lower()
        entry = {"name": name, "type": ptype}
        if node.ptype == 'FLOAT':
            entry["default"] = float(node.f_default)
        elif node.ptype == 'BOOL':
            entry["default"] = bool(node.b_default)
        elif node.ptype == 'INT':
            entry["default"] = int(node.i_default)
        else:
            entry["default"] = False
        params.append(entry)
    return params


def serialize_animator_tree(tree):
    """Return {defaultState, states, transitions, parameters} or empty defaults."""
    if tree is None:
        return {
            "defaultState": "",
            "states": [],
            "transitions": [],
            "parameters": [],
        }

    states = []
    state_nodes = {}
    for node in tree.nodes:
        if getattr(node, "bl_idname", "") != "BJSAnimStateNode":
            continue
        sid = _state_id(node)
        state_nodes[node] = sid
        states.append({
            "id": sid,
            "clip": node.clip or "",
            "loop": bool(node.loop),
            "speed": float(node.speed),
        })

    default_state = ""
    for node in tree.nodes:
        if getattr(node, "bl_idname", "") != "BJSAnimEntryNode":
            continue
        out = node.outputs.get("Default")
        if out is None and len(node.outputs) > 0:
            out = node.outputs[0]
        if out is None:
            continue
        for target in _linked_to(out):
            if target in state_nodes:
                default_state = state_nodes[target]
                break
        if default_state:
            break

    if not default_state and states:
        default_state = states[0]["id"]

    transitions = []
    for node in tree.nodes:
        if getattr(node, "bl_idname", "") != "BJSAnimTransitionNode":
            continue
        from_sock = node.inputs.get("From")
        to_sock = node.outputs.get("To")
        if from_sock is None and len(node.inputs) > 0:
            from_sock = node.inputs[0]
        if to_sock is None and len(node.outputs) > 0:
            to_sock = node.outputs[0]
        from_ids = []
        to_ids = []
        if from_sock is not None:
            for source in _linked_from(from_sock):
                if source in state_nodes:
                    from_ids.append(state_nodes[source])
        if to_sock is not None:
            for target in _linked_to(to_sock):
                if target in state_nodes:
                    to_ids.append(state_nodes[target])
        conditions = [_serialize_condition(c) for c in node.conditions]
        for from_id in from_ids:
            for to_id in to_ids:
                transitions.append({
                    "from": from_id,
                    "to": to_id,
                    "duration": float(node.duration),
                    "conditions": conditions,
                })

    return {
        "defaultState": default_state,
        "states": states,
        "transitions": transitions,
        "parameters": _serialize_parameters_from_tree(tree),
    }
