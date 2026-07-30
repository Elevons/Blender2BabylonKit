"""Operator registration for the component stack, script syncing, and export.
Input Actions operators register from the input_actions package."""

import bpy

from . import components, scripts, export_ops, launcher_ops, material_ops, prefab_ops, animator_ops

_all_classes = (
    components.classes
    + scripts.classes
    + export_ops.classes
    + launcher_ops.classes
    + material_ops.classes
    + prefab_ops.classes
    + animator_ops.classes
)


def register():
    for c in _all_classes:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(_all_classes):
        bpy.utils.unregister_class(c)
