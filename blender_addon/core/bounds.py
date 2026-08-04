"""Local-space bounding boxes for collider preview and fit-to-bounds.

Mirrors ``ComputeLocalBounds`` in ``packages/engine/src/subsystems/physics/geometry.ts``:
own mesh + owned child meshes (excluding separate child entities), with modifiers
applied via the evaluated depsgraph (matching glTF ``export_apply=True``).
"""

import math

import bpy
from mathutils import Vector

from .ids import ID_KEY

_bounds_cache = {}


def ClearBoundsCache():
    """Drop cached bounds (addon unload)."""
    _bounds_cache.clear()


def _matrix_signature(matrix):
    """Compact, hashable matrix fingerprint for cache keys."""
    return tuple(
        matrix[row_index][column_index]
        for row_index in range(4)
        for column_index in range(4)
    )


def _bounds_cache_bypass(obj):
    """True while owned mesh data is being edited — bounds must stay live."""
    if obj.mode == 'EDIT':
        return True
    for mesh_obj in _owned_mesh_objects(obj):
        if mesh_obj.mode == 'EDIT':
            return True
    return False


def _bounds_input_signature(obj, depsgraph):
    """Hashable inputs that affect ``compute_local_bounds`` for ``obj``."""
    mesh_parts = []
    for mesh_obj in _owned_mesh_objects(obj):
        mesh_eval = mesh_obj.evaluated_get(depsgraph)
        mesh_data = mesh_eval.data
        relative = obj.matrix_world.inverted() @ mesh_eval.matrix_world
        vertex_count = 0
        if mesh_data is not None and getattr(mesh_data, "vertices", None) is not None:
            vertex_count = len(mesh_data.vertices)
        mesh_parts.append((
            mesh_obj.as_pointer(),
            mesh_data.as_pointer() if mesh_data is not None else 0,
            vertex_count,
            _matrix_signature(relative),
        ))
    return (obj.as_pointer(), tuple(mesh_parts))


def BoundsInputSignature(obj, depsgraph):
    """Public wrapper — hashable bounds inputs for viewport draw-cache keys."""
    return _bounds_input_signature(obj, depsgraph)


def _compute_local_bounds(obj, depsgraph):
    """Uncached bounds pass — see ``compute_local_bounds``."""
    local_min = Vector((math.inf, math.inf, math.inf))
    local_max = Vector((-math.inf, -math.inf, -math.inf))
    found = False

    for mesh_obj in _owned_mesh_objects(obj):
        if _expand_from_mesh(mesh_obj, obj, depsgraph, local_min, local_max):
            found = True

    if not found:
        for corner in obj.bound_box:
            co = Vector(corner)
            local_min.x = min(local_min.x, co.x)
            local_min.y = min(local_min.y, co.y)
            local_min.z = min(local_min.z, co.z)
            local_max.x = max(local_max.x, co.x)
            local_max.y = max(local_max.y, co.y)
            local_max.z = max(local_max.z, co.z)
        if local_min.x == math.inf:
            return Vector((0.0, 0.0, 0.0)), Vector((0.0, 0.0, 0.0))

    return (local_min + local_max) / 2, local_max - local_min


def _belongs_to_child_entity(descendant, root):
    """True when ``descendant`` is (or sits under) its own exported entity.

    Mirrors ``OwnedColliderMeshes`` in physics.ts: walk from the descendant up
    to (but not including) ``root`` and exclude if any node carries ``bjs_id``.
    """
    ancestor = descendant
    while ancestor is not None and ancestor != root:
        if ancestor.get(ID_KEY):
            return True
        ancestor = ancestor.parent
    return False


def _owned_mesh_objects(obj):
    """Meshes whose geometry a collider on ``obj`` should span at runtime."""
    meshes = []
    if obj.type == 'MESH':
        meshes.append(obj)
    for desc in obj.children_recursive:
        if desc.type == 'MESH' and not _belongs_to_child_entity(desc, obj):
            meshes.append(desc)
    return meshes


def _expand_from_mesh(mesh_obj, root_obj, depsgraph, local_min, local_max):
    """Pull evaluated mesh vertices into ``root_obj`` local space."""
    root_inv = root_obj.matrix_world.inverted()
    mesh_eval = mesh_obj.evaluated_get(depsgraph)
    mesh = mesh_eval.to_mesh()
    try:
        mesh_mw = mesh_eval.matrix_world
        found = False
        for vert in mesh.vertices:
            local = root_inv @ (mesh_mw @ vert.co)
            local_min.x = min(local_min.x, local.x)
            local_min.y = min(local_min.y, local.y)
            local_min.z = min(local_min.z, local.z)
            local_max.x = max(local_max.x, local.x)
            local_max.y = max(local_max.y, local.y)
            local_max.z = max(local_max.z, local.z)
            found = True
        return found
    finally:
        mesh_eval.to_mesh_clear()


def compute_local_bounds(obj, depsgraph=None):
    """Return ``(center, size)`` AABB in ``obj`` local space, or zeros if empty.

    Results are cached per object until mesh data or relative transforms change.
    Camera-only redraws reuse the cache.
    """
    if depsgraph is None:
        depsgraph = bpy.context.evaluated_depsgraph_get()

    if not _bounds_cache_bypass(obj):
        cache_key = _bounds_input_signature(obj, depsgraph)
        cached = _bounds_cache.get(cache_key)
        if cached is not None:
            center, size = cached
            return center.copy(), size.copy()
    else:
        cache_key = None

    center, size = _compute_local_bounds(obj, depsgraph)
    if cache_key is not None:
        _bounds_cache[cache_key] = (center, size)
    return center.copy(), size.copy()
