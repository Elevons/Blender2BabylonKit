"""All UI: menus, the viewport "Babylon" N-panel (per-object inspector), and
the Properties > Scene "Babylon" panel (all scene-wide settings).

Pure presentation — data lives in components/, scene/ and input_actions/;
behavior lives in operators/.
"""

import bpy

from . import menus, view3d_panels, scene_panels, input_panel

# Parents must register before children (bl_parent_id).
classes = (
    menus.classes
    + view3d_panels.classes
    + scene_panels.classes
    + input_panel.classes
)


def register():
    for c in classes:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
