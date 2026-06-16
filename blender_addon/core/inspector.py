"""Resolves which object the Components inspector is editing.

Normally that's the active object, but the panel can be PINNED to one object
(``WindowManager.bjs_pinned_object``) so the user can freely change the viewport
selection — e.g. to batch-add objects into an entity list — without the
inspector switching away. Panels and every component-stack operator go through
``inspector_object`` so they all agree on the same target.
"""


def inspector_object(context):
    """The object the Components panel is showing: the pinned object if a pin
    is set (Blender nulls the pointer if it's deleted), else the active object."""
    pinned = getattr(context.window_manager, "bjs_pinned_object", None)
    if pinned is not None:
        return pinned
    return context.object
