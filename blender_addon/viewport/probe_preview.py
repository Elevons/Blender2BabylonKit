"""Viewport preview of reflection probe influence volumes.

Draws a wireframe box or sphere in the object's local space (Blender Z-up).
Authored offset/size convert to Babylon Y-up at export; the preview matches
the runtime influence volume.
"""

import math

import bpy
import gpu
from gpu_extras.batch import batch_for_shader
from mathutils import Vector

_handle = None
_COLOR = (1.0, 0.85, 0.2, 0.85)   # warm yellow
_SEGMENTS = 24


def _box_edges(center, size):
    """Twelve edges of an axis-aligned box."""
    hx, hy, hz = size.x / 2, size.y / 2, size.z / 2
    corners = [
        center + Vector((-hx, -hy, -hz)),
        center + Vector(( hx, -hy, -hz)),
        center + Vector(( hx,  hy, -hz)),
        center + Vector((-hx,  hy, -hz)),
        center + Vector((-hx, -hy,  hz)),
        center + Vector(( hx, -hy,  hz)),
        center + Vector(( hx,  hy,  hz)),
        center + Vector((-hx,  hy,  hz)),
    ]
    edges = (
        (0, 1), (1, 2), (2, 3), (3, 0),
        (4, 5), (5, 6), (6, 7), (7, 4),
        (0, 4), (1, 5), (2, 6), (3, 7),
    )
    pts = []
    for a, b in edges:
        pts.append(corners[a])
        pts.append(corners[b])
    return pts


def _circle(center, radius, axis):
    """Circle line-segments around `axis` ('x'/'y'/'z')."""
    pts, prev = [], None
    for index in range(_SEGMENTS + 1):
        angle = (index / _SEGMENTS) * math.tau
        cosine, sine = math.cos(angle) * radius, math.sin(angle) * radius
        if axis == 'z':
            point = center + Vector((cosine, sine, 0.0))
        elif axis == 'y':
            point = center + Vector((cosine, 0.0, sine))
        else:
            point = center + Vector((0.0, cosine, sine))
        if prev is not None:
            pts.append(prev)
            pts.append(point)
        prev = point
    return pts


def _sphere(center, radius):
    pts = []
    for axis in ('x', 'y', 'z'):
        pts += _circle(center, radius, axis)
    return pts


def _local_geometry(comp):
    """Local-space line segments for the influence volume."""
    center = Vector(comp.probe_influence_offset)
    size = Vector(comp.probe_influence_size)
    if comp.probe_influence_shape == 'SPHERE':
        return _sphere(center, max(size.x, 0.0) / 2)
    return _box_edges(center, size)


def _draw():
    ctx = bpy.context
    selected = getattr(ctx, "selected_objects", None)
    if not selected:
        return

    points = []
    for obj in selected:
        for comp in obj.bjs_components:
            if (comp.comp_type != 'REFLECTION_PROBE'
                    or not comp.enabled
                    or not comp.probe_show_preview):
                continue
            local = _local_geometry(comp)
            matrix = obj.matrix_world
            points.extend(matrix @ point for point in local)

    if not points:
        return

    shader = gpu.shader.from_builtin('UNIFORM_COLOR')
    gpu.state.blend_set('ALPHA')
    gpu.state.line_width_set(1.5)
    gpu.state.depth_test_set('LESS_EQUAL')
    batch = batch_for_shader(shader, 'LINES', {"pos": [(p.x, p.y, p.z) for p in points]})
    shader.bind()
    shader.uniform_float("color", _COLOR)
    batch.draw(shader)
    gpu.state.depth_test_set('NONE')
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
