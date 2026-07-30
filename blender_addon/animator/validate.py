"""Validate an ANIMATOR graph before export."""

from ..export.animation import nla_clip_names
from .serialize import serialize_animator_tree


def validate_animator_component(obj, comp, warnings):
    """Append human-readable warnings for one ANIMATOR component."""
    label = obj.name
    tree = comp.animator_tree
    if tree is None:
        warnings.append(f"{label}: ANIMATOR has no node graph — click Edit Animator")
        return

    entry_nodes = [n for n in tree.nodes if getattr(n, "bl_idname", "") == "BJSAnimEntryNode"]
    if len(entry_nodes) == 0:
        warnings.append(f"{label}: ANIMATOR graph needs an Entry node")
    elif len(entry_nodes) > 1:
        warnings.append(f"{label}: ANIMATOR graph has multiple Entry nodes (use one)")

    param_names = []
    for node in tree.nodes:
        if getattr(node, "bl_idname", "") != "BJSAnimParameterNode":
            continue
        pname = (node.param_name or "").strip()
        if not pname:
            warnings.append(f"{label}: Parameter node has empty name")
            continue
        if pname in param_names:
            warnings.append(f"{label}: duplicate animator parameter '{pname}'")
        else:
            param_names.append(pname)

    graph = serialize_animator_tree(tree)
    state_ids = {s["id"] for s in graph["states"]}
    if not graph["defaultState"]:
        warnings.append(f"{label}: ANIMATOR has no default state (wire Entry → State)")
    elif graph["defaultState"] not in state_ids:
        warnings.append(
            f"{label}: ANIMATOR default state '{graph['defaultState']}' is missing")

    clips = set(nla_clip_names(obj))
    for state in graph["states"]:
        clip = state.get("clip") or ""
        if not clip:
            warnings.append(f"{label}: ANIMATOR state '{state['id']}' has no clip")
        elif clips and clip not in clips:
            warnings.append(
                f"{label}: ANIMATOR state '{state['id']}' clip '{clip}' "
                f"won't match a glTF animation — pick the Action name "
                f"(or rename the NLA track to override)")

    for transition in graph["transitions"]:
        if transition["from"] not in state_ids:
            warnings.append(
                f"{label}: ANIMATOR transition from unknown state '{transition['from']}'")
        if transition["to"] not in state_ids:
            warnings.append(
                f"{label}: ANIMATOR transition to unknown state '{transition['to']}'")
        for condition in transition.get("conditions") or []:
            if condition.get("kind") == "param":
                pname = condition.get("param") or ""
                if pname and pname not in param_names:
                    warnings.append(
                        f"{label}: ANIMATOR condition references unknown "
                        f"parameter '{pname}'")
            if condition.get("kind") == "input":
                action = condition.get("action") or ""
                if not action:
                    warnings.append(
                        f"{label}: ANIMATOR input condition has empty action name")
            if condition.get("kind") == "message":
                if not (condition.get("message") or "").strip():
                    warnings.append(
                        f"{label}: ANIMATOR message condition has empty message")

    if len(graph["states"]) == 0:
        warnings.append(f"{label}: ANIMATOR graph has no State nodes")
