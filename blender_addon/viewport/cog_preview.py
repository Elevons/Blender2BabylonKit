"""Viewport preview of rigid-body center of mass.

Draws a small 3-axis cross (and ring) at each selected object's enabled
RIGIDBODY CoM as a GPU overlay, in the object's local space (Blender Z-up).
Auto-fit uses the same owned-mesh bounds as collider preview and runtime
``ComputeLocalBounds``; manual offsets use ``cog_center`` directly.
"""

import math

import bpy
import gpu
from gpu_extras.batch import batch_for_shader
from mathutils import Vector

from ..core.bounds import compute_local_bounds

_handle = None
_COLOR = (1.0, 0.55, 0.1, 0.95)   # amber — distinct from collider cyan
_SEGMENTS = 16


def _cross_arm(obj, depsgraph):
    """Local cross half-length — proportional to owned-mesh bounds."""
    _, size = compute_local_bounds(obj, depsgraph)
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


def _local_cog(obj, comp, depsgraph):
    if comp.cog_auto_fit:
        center, _size = compute_local_bounds(obj, depsgraph)
        return center
    return Vector(comp.cog_center)


def _local_geometry(obj, comp, depsgraph):
    center = _local_cog(obj, comp, depsgraph)
    arm = _cross_arm(obj, depsgraph)
    ring_r = arm * 0.35
    pts = []
    for axis in ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)):
        d = Vector(axis) * arm
        pts.append(center - d)
        pts.append(center + d)
    pts += _circle(center, ring_r, 'z')
    pts += _circle(center, ring_r, 'x')
    pts += _circle(center, ring_r, 'y')
    return pts


def _wants_preview(comp):
    if comp.comp_type != 'RIGIDBODY' or not comp.enabled:
        return False
    # Default True — older .blend rows may predate cog_show.
    return bool(getattr(comp, 'cog_show', True))


def _draw():
    ctx = bpy.context
    selected = getattr(ctx, "selected_objects", None)
    if not selected:
        return

    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in selected:
        eval_obj = obj.evaluated_get(depsgraph)
        mw = eval_obj.matrix_world
        for comp in obj.bjs_components:
            if not _wants_preview(comp):
                continue
            local = _local_geometry(obj, comp, depsgraph)
            points.extend(mw @ p for p in local)

    if not points:
        return

    shader = gpu.shader.from_builtin('UNIFORM_COLOR')
    gpu.state.blend_set('ALPHA')
    gpu.state.line_width_set(2.5)
    # CoM sits inside the mesh; depth-tested lines are hidden behind faces.
    gpu.state.depth_test_set('NONE')
    batch = batch_for_shader(shader, 'LINES', {"pos": [(p.x, p.y, p.z) for p in points]})
    shader.bind()
    shader.uniform_float("color", _COLOR)
    batch.draw(shader)
    gpu.state.line_width_set(1.0)
    gpu.state.blend_set('NONE')


def register():
    global _handle
    if _handle is None:
        _handle = bpy.types.SpaceView3D.draw_handler_add(_draw, (), 'WINDOW', 'POST_VIEW')


def unregister():
    global _handle
    if _handle is not None:
        bpy.types.SpaceView3D.draw_handler_remove(_handle, 'WINDOW')
        _handle = None
