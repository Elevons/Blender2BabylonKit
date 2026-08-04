"""Viewport preview of rigid-body center of mass.

Draws a small 3-axis cross (and ring) at each selected object's enabled
RIGIDBODY CoM as a GPU overlay, in the object's local space (Blender Z-up).
Auto-fit uses the same owned-mesh bounds as collider preview and runtime
``ComputeLocalBounds``; manual offsets use ``cog_center`` directly.
"""

import math

import bpy
from mathutils import Vector

from ..core.bounds import compute_local_bounds, BoundsInputSignature
from .gpu_cache import GetOverlayShader, LineBatchCache, MatrixSignature

_handle = None
_batch_cache = LineBatchCache()
_COLOR = (1.0, 0.55, 0.1, 0.95)   # amber — distinct from collider cyan
_SEGMENTS = 16


def _cross_arm_from_size(size):
    """Local cross half-length — proportional to owned-mesh bounds."""
    longest = max(size.x, size.y, size.z)
    if longest <= 1e-6:
        return 0.05
    # ~10% of the longest axis (full cross ≈ 20%); floor for degenerate meshes.
    return max(longest * 0.10, 0.05)


def _circle(center, radius, axis):
    pts, prev = [], None
    for i in range(_SEGMENTS + 1):
        a = (i / _SEGMENTS) * math.tau
        c, s = math.cos(a) * radius, math.sin(a) * radius
        if axis == 'z':
            p = center + Vector((c, s, 0.0))
        elif axis == 'y':
            p = center + Vector((c, 0.0, s))
        else:
            p = center + Vector((0.0, c, s))
        if prev is not None:
            pts.append(prev)
            pts.append(p)
        prev = p
    return pts


def _local_geometry(obj, comp, depsgraph):
    bounds_center, bounds_size = compute_local_bounds(obj, depsgraph)
    center = bounds_center if comp.cog_auto_fit else Vector(comp.cog_center)
    arm = _cross_arm_from_size(bounds_size)
    ring_r = arm * 0.35
    pts = []
    for axis in ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)):
        direction = Vector(axis) * arm
        pts.append(center - direction)
        pts.append(center + direction)
    pts += _circle(center, ring_r, 'z')
    pts += _circle(center, ring_r, 'x')
    pts += _circle(center, ring_r, 'y')
    return pts


def _wants_preview(comp):
    if comp.comp_type != 'RIGIDBODY' or not comp.enabled:
        return False
    # Default True — older .blend rows may predate cog_show.
    return bool(getattr(comp, 'cog_show', True))


def _cog_comp_signature(comp_index, comp):
    """Hashable preview state for one rigid-body component."""
    return (
        comp_index,
        comp.cog_auto_fit,
        tuple(comp.cog_center),
        bool(getattr(comp, 'cog_show', True)),
    )


def _draw_signature(selected, depsgraph):
    """Hashable state for the full CoM overlay draw pass."""
    parts = []
    for obj in sorted(selected, key=lambda item: item.as_pointer()):
        eval_obj = obj.evaluated_get(depsgraph)
        parts.append((
            obj.as_pointer(),
            MatrixSignature(eval_obj.matrix_world),
            BoundsInputSignature(obj, depsgraph),
        ))
        for comp_index, comp in enumerate(obj.bjs_components):
            if not _wants_preview(comp):
                continue
            parts.append(_cog_comp_signature(comp_index, comp))
    return tuple(parts)


def _build_points(selected, depsgraph):
    """World-space line endpoints for all visible CoM previews."""
    points = []
    for obj in selected:
        eval_obj = obj.evaluated_get(depsgraph)
        matrix = eval_obj.matrix_world
        for comp in obj.bjs_components:
            if not _wants_preview(comp):
                continue
            local = _local_geometry(obj, comp, depsgraph)
            points.extend(matrix @ point for point in local)
    return points


def _draw():
    ctx = bpy.context
    selected = getattr(ctx, "selected_objects", None)
    if not selected:
        return

    depsgraph = bpy.context.evaluated_depsgraph_get()
    draw_key = _draw_signature(selected, depsgraph)
    shader = GetOverlayShader()
    positions = None
    if not _batch_cache.HasKey(draw_key):
        positions = [(point.x, point.y, point.z) for point in _build_points(selected, depsgraph)]
        if not positions:
            _batch_cache.Clear()
            return

    _batch_cache.Draw(draw_key, positions, shader, _COLOR, line_width=2.5, depth_test='NONE')


def register():
    global _handle
    if _handle is None:
        _handle = bpy.types.SpaceView3D.draw_handler_add(_draw, (), 'WINDOW', 'POST_VIEW')


def unregister():
    global _handle
    if _handle is not None:
        bpy.types.SpaceView3D.draw_handler_remove(_handle, 'WINDOW')
        _handle = None
    _batch_cache.Clear()
