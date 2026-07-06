"""Operators for the Collision Layers panel: edit layers and matrix cells."""

import bpy
from bpy.props import BoolProperty, IntProperty, StringProperty
from bpy.types import Operator

from ..core.prop_copy import remove_collection_item
from .defaults import DEFAULT_LAYER_NAME
from .matrix import MAX_COLLISION_LAYERS, resize_matrix_for_layer_count, set_matrix_cell
from .properties import ensure_collision_layers


class BJS_OT_collision_layer_edit(Operator):
    """Add or remove a named collision layer."""
    bl_idname = "bjs.collision_layer_edit"
    bl_label = "Edit Collision Layer"
    bl_options = {'REGISTER', 'UNDO'}

    action: StringProperty()
    index: IntProperty(default=-1)

    def execute(self, context):
        scene = context.scene
        layers = scene.bjs_collision_layers

        if self.action == "add":
            if len(layers) >= MAX_COLLISION_LAYERS:
                self.report({'WARNING'}, f"Maximum {MAX_COLLISION_LAYERS} collision layers")
                return {'CANCELLED'}
            layer = layers.add()
            layer.name = f"Layer{len(layers)}"
            scene.bjs_collision_layer_active = len(layers) - 1
            resize_matrix_for_layer_count(scene)
            return {'FINISHED'}

        if self.action == "remove" and 0 <= self.index < len(layers):
            if len(layers) <= 1:
                self.report({'WARNING'}, "At least one collision layer is required")
                return {'CANCELLED'}
            remove_collection_item(layers, self.index)
            scene.bjs_collision_layer_active = min(scene.bjs_collision_layer_active, len(layers) - 1)
            resize_matrix_for_layer_count(scene)
            return {'FINISHED'}

        return {'CANCELLED'}


class BJS_OT_collision_layer_toggle(Operator):
    """Toggle one cell in the collision matrix (symmetric)."""
    bl_idname = "bjs.collision_layer_toggle"
    bl_label = "Toggle Collision Matrix Cell"
    bl_options = {'REGISTER', 'UNDO'}

    row: IntProperty()
    col: IntProperty()

    def execute(self, context):
        scene = context.scene
        resize_matrix_for_layer_count(scene)
        matrix = scene.bjs_collision_matrix
        if self.row >= len(matrix) or self.col >= len(matrix):
            return {'CANCELLED'}
        if self.col >= len(matrix[self.row].cells):
            return {'CANCELLED'}

        current = matrix[self.row].cells[self.col].collide
        set_matrix_cell(scene, self.row, self.col, not current, symmetric=True)
        return {'FINISHED'}


class BJS_OT_collision_layer_load_defaults(Operator):
    """Reset collision layers to a single Default layer that collides with itself."""
    bl_idname = "bjs.collision_layer_load_defaults"
    bl_label = "Load Default Layers"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        scene = context.scene
        scene.bjs_collision_layers.clear()
        scene.bjs_collision_matrix.clear()
        ensure_collision_layers(scene)
        self.report({'INFO'}, "Collision layers reset to Default")
        return {'FINISHED'}


classes = (
    BJS_OT_collision_layer_edit,
    BJS_OT_collision_layer_toggle,
    BJS_OT_collision_layer_load_defaults,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
