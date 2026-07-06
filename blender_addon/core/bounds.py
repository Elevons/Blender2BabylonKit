"""Local-space bounding boxes for collider preview and fit-to-bounds.

Mirrors ``ComputeLocalBounds`` in ``packages/engine/src/subsystems/physics/geometry.ts``:
own mesh + owned child meshes (excluding separate child entities), with modifiers
applied via the evaluated depsgraph (matching glTF ``export_apply=True``).
"""

import math

import bpy
from mathutils import Vector

from .ids import ID_KEY


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
    """Return ``(center, size)`` AABB in ``obj`` local space, or zeros if empty."""
    if depsgraph is None:
        depsgraph = bpy.context.evaluated_depsgraph_get()

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
