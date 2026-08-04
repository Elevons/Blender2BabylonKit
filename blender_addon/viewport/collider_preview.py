"""Viewport preview of collider shapes.

Draws a wireframe of each selected object's enabled COLLIDER components as a GPU
overlay, in the object's local space (Blender Z-up). Authored collider
center/size are in Blender space and converted to Babylon Y-up at export, so what
you see here matches the runtime body.
"""

import math

import bpy
from mathutils import Vector, Euler

from ..core.bounds import compute_local_bounds, BoundsInputSignature
from ..core.collider_scale import (
    manual_collider_dimensions,
    object_world_matrix_for_collider,
    scaled_fit_bounds,
)
from .gpu_cache import GetOverlayShader, LineBatchCache, MatrixSignature

_handle = None
_batch_cache = LineBatchCache()
_COLOR = (0.3, 0.9, 1.0, 0.9)   # cyan
_SEGMENTS = 24                  # circle resolution
_ARC = 12                       # hemisphere arc resolution


def _circle(center, radius, axis):
    """Circle line-segments around `axis` ('x'/'y'/'z'), centered at `center`."""
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


def _vert_arc(center, radius, plane, start, end):
    """Arc in a vertical plane ('xz'/'yz'); angle measured from +Z (the pole)."""
    pts, prev = [], None
    for i in range(_ARC + 1):
        a = start + (end - start) * (i / _ARC)
        up, side = math.cos(a) * radius, math.sin(a) * radius
        p = center + (Vector((side, 0.0, up)) if plane == 'xz' else Vector((0.0, side, up)))
        if prev is not None:
            pts.append(prev)
            pts.append(p)
        prev = p
    return pts


def _box_edges(center, size):
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    corners = [center + Vector((sx * hx, sy * hy, sz * hz))
               for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    i = lambda x, y, z: x * 4 + y * 2 + z
    edges = []
    for y in (0, 1):
        for z in (0, 1):
            edges.append((i(0, y, z), i(1, y, z)))
    for x in (0, 1):
        for z in (0, 1):
            edges.append((i(x, 0, z), i(x, 1, z)))
    for x in (0, 1):
        for y in (0, 1):
            edges.append((i(x, y, 0), i(x, y, 1)))
    pts = []
    for a, b in edges:
        pts.append(corners[a])
        pts.append(corners[b])
    return pts


def _sphere(center, radius):
    return (_circle(center, radius, 'z')
            + _circle(center, radius, 'y')
            + _circle(center, radius, 'x'))


def _ring_and_sides(top, bot, radius):
    pts = _circle(top, radius, 'z') + _circle(bot, radius, 'z')
    for ang in (0.0, math.pi / 2, math.pi, 3 * math.pi / 2):
        o = Vector((math.cos(ang) * radius, math.sin(ang) * radius, 0.0))
        pts.append(top + o)
        pts.append(bot + o)
    return pts


def _cylinder(center, radius, height):
    h = height / 2
    return _ring_and_sides(center + Vector((0, 0, h)), center + Vector((0, 0, -h)), radius)


def _capsule(center, radius, height):
    h = max(height - 2 * radius, 0.0) / 2   # half of the cylindrical middle
    top = center + Vector((0, 0, h))
    bot = center + Vector((0, 0, -h))
    pts = _ring_and_sides(top, bot, radius)
    # Domed caps: half-circle arcs over each pole, in both vertical planes.
    pts += _vert_arc(top, radius, 'xz', -math.pi / 2, math.pi / 2)
    pts += _vert_arc(top, radius, 'yz', -math.pi / 2, math.pi / 2)
    pts += _vert_arc(bot, radius, 'xz', math.pi / 2, 3 * math.pi / 2)
    pts += _vert_arc(bot, radius, 'yz', math.pi / 2, 3 * math.pi / 2)
    return pts


def _needs_bounds(comp):
    if comp.collider_shape in {'CONVEX', 'MESH'}:
        return True
    return comp.auto_fit


def _local_geometry(obj, comp, eval_obj, depsgraph, mesh_bounds=None):
    """Local-space line segments for a collider, or None if the mesh is the shape."""
    shape = comp.collider_shape
    if shape in {'CONVEX', 'MESH'}:
        # Hull/mesh colliders use geometry at runtime; preview with a scaled AABB.
        if mesh_bounds is None:
            center, size = compute_local_bounds(obj, depsgraph)
        else:
            center, size = mesh_bounds
        center, size = scaled_fit_bounds(obj, comp, center, size, eval_obj)
        return _box_edges(center, size)

    if comp.auto_fit:
        if mesh_bounds is None:
            center, size = compute_local_bounds(obj, depsgraph)
        else:
            center, size = mesh_bounds
        center, size = scaled_fit_bounds(obj, comp, center, size, eval_obj)
        if shape == 'SPHERE':
            return _sphere(center, max(size) / 2)
        if shape == 'CYLINDER':
            return _cylinder(center, max(size.x, size.y) / 2, size.z)
        if shape == 'CAPSULE':
            return _capsule(center, max(size.x, size.y) / 2, size.z)
        return _box_edges(center, size)

    # Manual: build around the origin, then rotate and offset (matches the runtime
    # shape, which is centered at `center` with the collider's rotation).
    center, size, radius, height = manual_collider_dimensions(obj, comp, eval_obj)
    origin = Vector((0.0, 0.0, 0.0))
    if shape == 'SPHERE':
        pts = _sphere(origin, radius)
    elif shape == 'CYLINDER':
        pts = _cylinder(origin, radius, height)
    elif shape == 'CAPSULE':
        pts = _capsule(origin, radius, height)
    else:
        pts = _box_edges(origin, size)
    rot = Euler(comp.collider_rotation, 'XYZ').to_matrix()
    return [(rot @ p) + center for p in pts]


def _collider_comp_signature(comp_index, comp):
    """Hashable preview state for one collider component."""
    return (
        comp_index,
        comp.collider_shape,
        comp.auto_fit,
        comp.collider_apply_scale,
        tuple(comp.collider_center),
        tuple(comp.collider_size),
        comp.collider_radius,
        comp.collider_height,
        tuple(comp.collider_rotation),
    )


def _draw_signature(selected, depsgraph):
    """Hashable state for the full collider overlay draw pass."""
    parts = []
    for obj in sorted(selected, key=lambda item: item.as_pointer()):
        eval_obj = obj.evaluated_get(depsgraph)
        parts.append((
            obj.as_pointer(),
            MatrixSignature(eval_obj.matrix_world),
            tuple(obj.scale),
            BoundsInputSignature(obj, depsgraph),
        ))
        for comp_index, comp in enumerate(obj.bjs_components):
            if comp.comp_type != 'COLLIDER' or not comp.enabled or not comp.collider_show:
                continue
            parts.append(_collider_comp_signature(comp_index, comp))
    return tuple(parts)


def _build_points(selected, depsgraph):
    """World-space line endpoints for all visible collider previews."""
    mesh_bounds_by_object = {}
    points = []
    for obj in selected:
        eval_obj = obj.evaluated_get(depsgraph)
        obj_key = obj.as_pointer()
        mesh_bounds = None
        for comp in obj.bjs_components:
            if comp.comp_type != 'COLLIDER' or not comp.enabled or not comp.collider_show:
                continue
            if _needs_bounds(comp):
                mesh_bounds = mesh_bounds_by_object.get(obj_key)
                if mesh_bounds is None:
                    mesh_bounds = compute_local_bounds(obj, depsgraph)
                    mesh_bounds_by_object[obj_key] = mesh_bounds
                break

        for comp in obj.bjs_components:
            if comp.comp_type != 'COLLIDER' or not comp.enabled or not comp.collider_show:
                continue
            bounds = mesh_bounds_by_object.get(obj_key) if _needs_bounds(comp) else None
            local = _local_geometry(obj, comp, eval_obj, depsgraph, bounds)
            if not local:
                continue
            matrix = object_world_matrix_for_collider(obj, eval_obj, comp.collider_apply_scale)
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

    _batch_cache.Draw(draw_key, positions, shader, _COLOR, line_width=1.5, depth_test='LESS_EQUAL')


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
