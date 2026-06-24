"""Which Material datablock Babylon material UI and operators target."""


def panel_material(context):
    """The material being edited: Properties › Material uses context.material;
    fall back to the active object's active slot elsewhere."""
    mat = getattr(context, "material", None)
    if mat is not None:
        return mat
    obj = context.object
    if obj is not None and obj.active_material is not None:
        return obj.active_material
    return None
