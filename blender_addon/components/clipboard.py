"""Deep-copy of components (duplicate, and the cut/copy/paste clipboard).

The generic RNA walk lives in core/prop_copy.py so new component fields are
copied without maintenance."""

import uuid
from collections import Counter

import bpy

from ..core.prop_copy import copy_props


def assign_component_row_name(comp):
    """Give ``comp`` a unique PropertyGroup ``name``.

    Blender library-override ``INSERT_AFTER`` ops identify collection items by
    name. Unnamed rows only get fragile index-based insert ops, so additional
    unnamed inserts on an override are dropped on file/library reload.
    """
    comp.name = uuid.uuid4().hex
    return comp.name


def ensure_component_collection_names(components, obj=None):
    """Name every unnamed row in ``components`` (in place, stable order).

    Mixing unnamed index-based inserts with a newly named insert makes Blender
    re-diff the override on save and reshuffle row order on reload. Naming the
    existing rows first keeps INSERT_AFTER anchors unambiguous.

    When ``obj`` is a library override, do **not** rename rows. Linked base
    rows share the library's PropertyGroup ``name`` (often empty). Assigning a
    local hex name makes Blender re-record those rows as ``INSERT_AFTER`` ops;
    on reload the linked copies come back too and the stack duplicates
    (scripts, colliders, everything). New local inserts still get a name via
    ``assign_component_row_name`` after ``.add()``. Prefer naming rows in the
    prefab library file so override inserts can anchor to them.
    """
    if obj is not None and getattr(obj, "override_library", None) is not None:
        return

    used = {comp.name for comp in components if comp.name}
    for comp in components:
        if comp.name:
            continue
        row_name = uuid.uuid4().hex
        while row_name in used:
            row_name = uuid.uuid4().hex
        comp.name = row_name
        used.add(row_name)


def copy_component(src, dst):
    """Deep-copy a BJSComponent (including exposed vars and their list items).

    Always assigns a fresh row name so paste/duplicate on a library override
    records a distinct insert op instead of colliding with the source name.
    """
    copy_props(src, dst)
    assign_component_row_name(dst)


def _component_stack_key(comp):
    """Identity used to compare override rows against the prefab source stack."""
    if comp.comp_type == 'SCRIPT':
        return (comp.comp_type, comp.script_name or "")
    return (comp.comp_type, "")


def OverrideLibraryComponentRowsNamed(obj):
    """True when every linked prefab component row already has a PropertyGroup name.

    Unnamed library rows force index-based override paths like
    ``bjs_components[3].exposed_vars["swapSteering"].b_val``. Local INSERT ops
    then reshuffle indices on reload and Blender drops those REPLACE ops — instance
    @exposed edits look fine until you reopen the file.
    """
    override = getattr(obj, "override_library", None)
    if override is None or override.reference is None:
        return True

    source_comps = getattr(override.reference, "bjs_components", None)
    if not source_comps:
        return True

    return all(bool(comp.name) for comp in source_comps)


def LibraryComponentRowsUnnamedWarning(obj):
    """User-facing warning when instance @exposed overrides may not survive reload."""
    if OverrideLibraryComponentRowsNamed(obj):
        return None
    return (
        "Prefab component rows are unnamed — instance script settings may reset "
        "on reload. Open the prefab .blend and run Ensure Component Row Names "
        "(or add/move a component once)."
    )


def OverrideComponentStackLooksDuplicated(obj):
    """True when a library override has roughly twice the prefab's components.

    Typical fallout from renaming linked base rows: INSERT copies stack on top
    of the linked originals, and neither remove() nor clear() can drop them.
    """
    override = getattr(obj, "override_library", None)
    if override is None or override.reference is None:
        return False

    source_comps = getattr(override.reference, "bjs_components", None)
    if not source_comps:
        return False

    return len(obj.bjs_components) >= len(source_comps) * 2


def _SnapshotObjectPlacement(obj):
    """Capture transform / parenting / visibility so reset() can be undone."""
    return {
        "location": obj.location.copy(),
        "rotation_mode": obj.rotation_mode,
        "rotation_euler": obj.rotation_euler.copy(),
        "rotation_quaternion": obj.rotation_quaternion.copy(),
        "rotation_axis_angle": tuple(obj.rotation_axis_angle),
        "scale": obj.scale.copy(),
        "delta_location": obj.delta_location.copy(),
        "delta_rotation_euler": obj.delta_rotation_euler.copy(),
        "delta_rotation_quaternion": obj.delta_rotation_quaternion.copy(),
        "delta_scale": obj.delta_scale.copy(),
        "matrix_parent_inverse": obj.matrix_parent_inverse.copy(),
        "parent": obj.parent,
        "parent_type": obj.parent_type,
        "parent_bone": obj.parent_bone,
        "hide_viewport": obj.hide_viewport,
        "hide_render": obj.hide_render,
        "hide_get": obj.hide_get(),
        "visible_camera": getattr(obj, "visible_camera", True),
        "visible_shadow": getattr(obj, "visible_shadow", True),
    }


def _RestoreObjectPlacement(obj, snapshot):
    """Re-apply placement after override_library.reset() cleared transform ops."""
    obj.parent = snapshot["parent"]
    obj.parent_type = snapshot["parent_type"]
    obj.parent_bone = snapshot["parent_bone"]
    obj.matrix_parent_inverse = snapshot["matrix_parent_inverse"]

    obj.rotation_mode = snapshot["rotation_mode"]
    obj.location = snapshot["location"]
    obj.rotation_euler = snapshot["rotation_euler"]
    obj.rotation_quaternion = snapshot["rotation_quaternion"]
    obj.rotation_axis_angle = snapshot["rotation_axis_angle"]
    obj.scale = snapshot["scale"]

    obj.delta_location = snapshot["delta_location"]
    obj.delta_rotation_euler = snapshot["delta_rotation_euler"]
    obj.delta_rotation_quaternion = snapshot["delta_rotation_quaternion"]
    obj.delta_scale = snapshot["delta_scale"]

    obj.hide_viewport = snapshot["hide_viewport"]
    obj.hide_render = snapshot["hide_render"]
    obj.hide_set(snapshot["hide_get"])
    if hasattr(obj, "visible_camera"):
        obj.visible_camera = snapshot["visible_camera"]
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = snapshot["visible_shadow"]


def RepairOverrideComponentStack(obj):
    """Drop stuck override component duplicates; keep true instance-only extras.

    Renamed linked-base rows become hybrid inserts that Blender will not
    ``remove()`` or ``clear()``. ``override_library.reset()`` restores the
    prefab component stack; placement (location / rotation / scale / parent /
    visibility) is snapshotted and written back so the instance does not jump
    to the library pose. Named surplus rows — scripts the prefab does not own,
    or a second copy of one it does — are staged and re-inserted afterward.
    Returns ``(extra_count, message)``.
    """
    override = getattr(obj, "override_library", None)
    if override is None or override.reference is None:
        return 0, "Not a library override"

    source_comps = getattr(override.reference, "bjs_components", None)
    if source_comps is None:
        return 0, "Override has no prefab reference components"

    source_counts = Counter(_component_stack_key(comp) for comp in source_comps)
    placement = _SnapshotObjectPlacement(obj)
    temp = bpy.data.objects.new("__bjs_override_repair__", None)

    try:
        seen = Counter()
        for comp in obj.bjs_components:
            if not comp.name:
                continue
            key = _component_stack_key(comp)
            seen[key] += 1
            if seen[key] > source_counts.get(key, 0):
                copy_component(comp, temp.bjs_components.add())

        extra_count = len(temp.bjs_components)
        override.reset()
        _RestoreObjectPlacement(obj, placement)

        for staged in temp.bjs_components:
            copy_component(staged, obj.bjs_components.add())
    finally:
        bpy.data.objects.remove(temp, do_unlink=True)

    if extra_count:
        return (
            extra_count,
            f"Restored prefab stack and re-added {extra_count} local component(s). "
            f"Re-check script entity references if needed.",
        )
    return (
        0,
        "Restored prefab component stack (removed stuck local duplicates).",
    )
