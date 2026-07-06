"""The Collision Layers editor — named layers and a Unity-style collision matrix.

Lives in the Babylon Scene N-panel. Per-object layer assignment uses the
COLLISION_LAYER component on the Babylon Object panel.
"""

import bpy
from bpy.types import Panel

from ..collision_layers.properties import ensure_collision_layers


class BJS_PT_collision_layers(Panel):
    bl_label = "Collision Layers"
    bl_idname = "BJS_PT_collision_layers"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon Scene"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        scene = context.scene
        ensure_collision_layers(scene)

        row = layout.row(align=True)
        row.operator("bjs.collision_layer_load_defaults", icon='FILE_REFRESH')
        row.label(text="Layer list + matrix", icon='MOD_PHYSICS')

        box = layout.box()
        header = box.row()
        header.label(text="Layers", icon='OUTLINER_COLLECTION')
        add = header.operator("bjs.collision_layer_edit", text="", icon='ADD')
        add.action = "add"

        layers = scene.bjs_collision_layers
        box.template_list(
            "UI_UL_list", "bjs_collision_layers", scene, "bjs_collision_layers",
            scene, "bjs_collision_layer_active", rows=3,
        )

        if 0 <= scene.bjs_collision_layer_active < len(layers):
            active = layers[scene.bjs_collision_layer_active]
            row = box.row(align=True)
            row.prop(active, "name", text="")
            rem = row.operator("bjs.collision_layer_edit", text="", icon='X')
            rem.action = "remove"
            rem.index = scene.bjs_collision_layer_active

        if len(layers) == 0:
            layout.label(text="No layers — click Load Default Layers", icon='ERROR')
            return

        matrix_box = layout.box()
        matrix_box.label(text="Collision Matrix", icon='GRID')
        matrix_box.label(text="Row collides with column when checked", icon='INFO')

        n = len(layers)
        col_header = matrix_box.row()
        col_header.label(text="")
        for col_index in range(n):
            name = layers[col_index].name[:10] or "?"
            col_header.label(text=name)

        for row_index in range(n):
            row = matrix_box.row(align=True)
            row.label(text=(layers[row_index].name[:12] or "?"))
            matrix = scene.bjs_collision_matrix
            if row_index >= len(matrix):
                continue
            matrix_row = matrix[row_index]
            for col_index in range(n):
                if col_index >= len(matrix_row.cells):
                    continue
                cell = matrix_row.cells[col_index]
                if row_index == col_index:
                    icon = 'CHECKBOX_HLT' if cell.collide else 'CHECKBOX_DEHLT'
                    row.label(text="", icon=icon)
                else:
                    op = row.operator(
                        "bjs.collision_layer_toggle",
                        text="",
                        icon='CHECKBOX_HLT' if cell.collide else 'CHECKBOX_DEHLT',
                        depress=cell.collide,
                    )
                    op.row = row_index
                    op.col = col_index


classes = (
    BJS_PT_collision_layers,
)
