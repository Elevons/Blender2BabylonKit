"""Shared helpers for manifest material export."""

import bpy

from .visibility import is_renderable


def materials_in_use(context):
    """Materials assigned to exportable mesh objects."""
    used = set()
    for obj in context.scene.objects:
        if not is_renderable(obj, context):
            continue
        if obj.type != 'MESH':
            continue
        for slot in obj.material_slots:
            if slot.material is not None:
                used.add(slot.material)
    return used
