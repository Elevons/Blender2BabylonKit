"""All UI: menus, the viewport "Babylon Object" N-panel (per-object inspector),
and the viewport "Babylon Scene" N-panel (all scene-wide settings).

Pure presentation — data lives in components/, scene/ and input_actions/;
behavior lives in operators/.
"""

import bpy

from . import menus, view3d_panels, scene_panels, material_panels

# Parents must register before children (bl_parent_id).
classes = (
    menus.classes
    + view3d_panels.classes
    + scene_panels.classes
    + material_panels.classes
)


def register():
    for c in classes:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
