"""Keep the collision matrix rows/cells in sync with the layer list."""

from ..core.prop_copy import remove_collection_item

MAX_COLLISION_LAYERS = 32


def resize_matrix_for_layer_count(scene):
    """Ensure matrix rows match layer count and each row has one cell per layer."""
    layers = scene.bjs_collision_layers
    matrix = scene.bjs_collision_matrix
    n = len(layers)

    while len(matrix) < n:
        row = matrix.add()
        for _ in range(n):
            row.cells.add().collide = True

    while len(matrix) > n:
        remove_collection_item(matrix, len(matrix) - 1)

    for row in matrix:
        while len(row.cells) < n:
            row.cells.add().collide = True
        while len(row.cells) > n:
            remove_collection_item(row.cells, len(row.cells) - 1)


def set_matrix_cell(scene, row_index, col_index, value, symmetric=True):
    """Set one matrix cell; optionally mirror across the diagonal."""
    matrix = scene.bjs_collision_matrix
    if row_index < 0 or col_index < 0:
        return
    if row_index >= len(matrix) or col_index >= len(matrix):
        return
    if col_index >= len(matrix[row_index].cells):
        return

    matrix[row_index].cells[col_index].collide = value
    if symmetric and row_index != col_index:
        if row_index < len(matrix[col_index].cells):
            matrix[col_index].cells[row_index].collide = value


def layer_names(scene):
    """Non-empty trimmed layer names in list order."""
    return [layer.name.strip() for layer in scene.bjs_collision_layers if layer.name.strip()]
