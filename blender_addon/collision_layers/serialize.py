"""Collision layers <-> manifest serialization."""

from .defaults import DEFAULT_COLLISION_LAYERS
from .matrix import layer_names, resize_matrix_for_layer_count


def serialize_collision_layers(scene):
    """Named layers + symmetric matrix -> manifest collisionLayers block."""
    if len(scene.bjs_collision_layers) == 0:
        return {
            "layers": list(DEFAULT_COLLISION_LAYERS["layers"]),
            "matrix": [list(row) for row in DEFAULT_COLLISION_LAYERS["matrix"]],
        }

    resize_matrix_for_layer_count(scene)
    names = layer_names(scene)
    if len(names) == 0:
        return {
            "layers": list(DEFAULT_COLLISION_LAYERS["layers"]),
            "matrix": [list(row) for row in DEFAULT_COLLISION_LAYERS["matrix"]],
        }

    matrix = []
    for row_index, _name in enumerate(names):
        row = scene.bjs_collision_matrix[row_index]
        matrix.append([
            bool(row.cells[col_index].collide)
            for col_index in range(len(names))
        ])

    return {
        "layers": names,
        "matrix": matrix,
    }
