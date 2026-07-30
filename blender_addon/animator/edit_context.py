"""Resolve which Object owns the Animator graph currently being edited.

Clip dropdowns and seed ops must follow the open NodeTree, not a sticky
WindowManager name — otherwise editing Whale then opening Shark's graph still
lists WhaleSwim.
"""

import bpy


def objects_owning_animator_tree(tree):
    """Objects whose ANIMATOR component points at `tree`."""
    if tree is None:
        return []

    owners = []
    for obj in bpy.data.objects:
        for comp in getattr(obj, "bjs_components", []):
            if getattr(comp, "comp_type", "") != "ANIMATOR":
                continue
            if getattr(comp, "animator_tree", None) == tree:
                owners.append(obj)
                break
    return owners


def resolve_animator_object(context, tree=None):
    """Object whose NLA Actions feed Animator clip enums.

    Prefer the owner of `tree` (the open graph). Fall back to the WindowManager
    flag set by Edit Animator when the tree is unassigned or context has no tree.
    """
    owners = objects_owning_animator_tree(tree)
    if len(owners) == 1:
        return owners[0]

    ctx = context if context is not None else bpy.context
    wm = getattr(ctx, "window_manager", None) if ctx is not None else None
    wm_name = ""
    if wm is not None:
        wm_name = getattr(wm, "bjs_animator_edit_object", "") or ""

    if len(owners) > 1 and wm_name:
        for obj in owners:
            if obj.name == wm_name:
                return obj
        return owners[0]

    if len(owners) > 1:
        return owners[0]

    if wm_name:
        return bpy.data.objects.get(wm_name)

    return None


def set_animator_edit_object(context, obj):
    """Remember which object Edit Animator opened (sidebar / seed fallback)."""
    if context is None or obj is None:
        return
    context.window_manager.bjs_animator_edit_object = obj.name
