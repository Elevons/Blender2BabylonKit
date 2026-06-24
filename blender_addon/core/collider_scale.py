"""Scale manual collider dimensions by the owning object's scale."""

from mathutils import Matrix, Vector

_SCALE_EPSILON = 1e-6


def local_object_scale(obj):
    """Per-axis absolute local scale on this object (not parents)."""
    s = obj.scale
    return Vector((abs(s.x), abs(s.y), abs(s.z)))


def _has_local_scale(obj):
    sc = local_object_scale(obj)
    return any(abs(v - 1.0) > _SCALE_EPSILON for v in sc)


def manual_collider_dimensions(obj, comp, eval_obj):
    """Return center, size, radius, height in object local space.

    When ``collider_apply_scale`` is on, dimensions are multiplied by this
    object's **local** scale only. Parent scale is already applied via the
    world matrix on the physics body (same rule as the runtime).
    """
    center = Vector(comp.collider_center)
    size = Vector(comp.collider_size)
    radius = comp.collider_radius
    height = comp.collider_height

    if not comp.collider_apply_scale:
        return center, size, radius, height

    sc = local_object_scale(obj)
    center = Vector((center.x * sc.x, center.y * sc.y, center.z * sc.z))
    size = Vector((size.x * sc.x, size.y * sc.y, size.z * sc.z))

    shape = comp.collider_shape
    if shape == 'SPHERE':
        radius *= max(sc)
    elif shape in {'CAPSULE', 'CYLINDER'}:
        radius *= max(sc.x, sc.y)
        height *= sc.z

    return center, size, radius, height


def scaled_fit_bounds(obj, comp, center, size, eval_obj):
    """Scale auto-fit AABB center/size when ``collider_apply_scale`` is on."""
    if not comp.collider_apply_scale:
        return center, size
    sc = local_object_scale(obj)
    return (
        Vector((center.x * sc.x, center.y * sc.y, center.z * sc.z)),
        Vector((size.x * sc.x, size.y * sc.y, size.z * sc.z)),
    )


def object_world_matrix_for_collider(obj, eval_obj, apply_object_scale):
    """World matrix used to draw a collider preview.

    When local scale is baked into the dimensions, omit only this object's
    scale from the matrix — parent scale still applies.
    """
    if apply_object_scale and _has_local_scale(obj):
        loc, rot, _scale = eval_obj.matrix_world.decompose()
        return Matrix.Translation(loc) @ rot.to_matrix().to_4x4()
    return eval_obj.matrix_world
