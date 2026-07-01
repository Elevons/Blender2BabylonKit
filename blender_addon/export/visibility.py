"""Render and viewport visibility rules shared by export, validation, and materials."""


def is_renderable(obj, context=None):
    """True when the object participates in renders (camera icon on, collections
    included). Matches the intent of glTF ``use_renderable=True`` — not just the
    per-object ``hide_render`` flag."""
    if obj.hide_render:
        return False
    visible_get = getattr(obj, "visible_get", None)
    if visible_get is None:
        return True
    try:
        if context is not None:
            return visible_get(viewport=False, view_layer=context.view_layer)
        return visible_get(viewport=False)
    except TypeError:
        return True


def is_viewport_hidden(obj):
    """True when the eye icon is off, including collection / hierarchy visibility."""
    visible_get = getattr(obj, "visible_get", None)
    if visible_get is not None:
        return not visible_get()
    return obj.hide_viewport


def unlink_scene_objects(objects):
    """Remove objects from their collections for one glTF export pass."""
    saved = []
    for obj in objects:
        collections = tuple(obj.users_collection)
        if not collections:
            continue
        saved.append((obj, collections))
        for coll in collections:
            coll.objects.unlink(obj)
    return saved


def relink_scene_objects(saved):
    """Restore objects unlinked by ``unlink_scene_objects``."""
    for obj, collections in saved:
        for coll in collections:
            if obj.name not in coll.objects:
                coll.objects.link(obj)


def nonrenderable_gltf_lights(context):
    """Punctual lights that must not appear in the glb (manifest already skips them).

    Blender's glTF exporter can still emit ``KHR_lights_punctual`` entries even
    when ``use_renderable=True`` — unlink them for the export call."""
    return [
        obj for obj in context.scene.objects
        if obj.type == 'LIGHT' and not is_renderable(obj, context)
    ]
