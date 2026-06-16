"""The per-component dropdown menu (Duplicate / Copy / Cut / Paste / Move /
Delete), opened from each component header in the inspector."""

import bpy
from bpy.types import Menu

from ..core.inspector import inspector_object


class BJS_MT_component_menu(Menu):
    """Per-component actions (opened from the header dropdown)."""
    bl_idname = "BJS_MT_component_menu"
    bl_label = "Component"

    def draw(self, context):
        layout = self.layout
        obj = inspector_object(context)
        idx = obj.bjs_components_index if obj else 0
        n = len(obj.bjs_components) if obj else 0

        dup = layout.operator("bjs.duplicate_component", text="Duplicate", icon='DUPLICATE')
        dup.index = idx

        layout.separator()
        layout.operator("bjs.copy_component", text="Copy", icon='COPYDOWN').index = idx
        layout.operator("bjs.cut_component", text="Cut", icon='X').index = idx
        layout.operator("bjs.paste_component", text="Paste", icon='PASTEDOWN')

        layout.separator()
        row = layout.row()
        row.enabled = idx > 0
        up = row.operator("bjs.move_component", text="Move Up", icon='TRIA_UP')
        up.index = idx
        up.direction = 'UP'

        row = layout.row()
        row.enabled = idx < n - 1
        down = row.operator("bjs.move_component", text="Move Down", icon='TRIA_DOWN')
        down.index = idx
        down.direction = 'DOWN'

        layout.separator()
        rm = layout.operator("bjs.remove_component", text="Delete", icon='TRASH')
        rm.index = idx


classes = (
    BJS_MT_component_menu,
)
