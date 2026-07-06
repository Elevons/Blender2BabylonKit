"""Collision layer data model on Scene: named layers + NxN collision matrix."""

import bpy
from bpy.props import BoolProperty, CollectionProperty, IntProperty, StringProperty
from bpy.types import PropertyGroup, Scene

from .defaults import DEFAULT_LAYER_NAME
from .matrix import MAX_COLLISION_LAYERS, resize_matrix_for_layer_count


class BJSCollisionMatrixCell(PropertyGroup):
    collide: BoolProperty(
        name="Collide",
        default=True,
        description="When enabled, the row layer collides with the column layer",
    )


class BJSCollisionMatrixRow(PropertyGroup):
    cells: CollectionProperty(type=BJSCollisionMatrixCell)


class BJSCollisionLayer(PropertyGroup):
    name: StringProperty(name="Name", default=DEFAULT_LAYER_NAME)


classes = (
    BJSCollisionMatrixCell,
    BJSCollisionMatrixRow,
    BJSCollisionLayer,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    Scene.bjs_collision_layers = CollectionProperty(type=BJSCollisionLayer)
    Scene.bjs_collision_layer_active = IntProperty(default=0, min=0)
    Scene.bjs_collision_matrix = CollectionProperty(type=BJSCollisionMatrixRow)


def unregister():
    del Scene.bjs_collision_matrix
    del Scene.bjs_collision_layer_active
    del Scene.bjs_collision_layers
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


def ensure_collision_layers(scene):
    """Seed Default layer + full matrix when the panel is empty."""
    if len(scene.bjs_collision_layers) > 0:
        resize_matrix_for_layer_count(scene)
        return False

    layer = scene.bjs_collision_layers.add()
    layer.name = DEFAULT_LAYER_NAME
    scene.bjs_collision_layer_active = 0
    resize_matrix_for_layer_count(scene)
    return True
