"""Input Actions (Unity Input System style): data model, defaults,
serialization, and operators. The panel lives in ui/input_panel.py."""

import bpy
from . import properties, operators
from .properties import SyncGpEnumsFromIndex


@bpy.app.handlers.persistent
def _sync_gamepad_pickers_on_load(_dummy):
    """Mirror index into stored pickers for older .blend data."""
    # bpy.data is restricted during addon register — only run when scenes exist.
    scenes = getattr(bpy.data, "scenes", None)
    if scenes is None:
        return

    for scene in scenes:
        for input_map in scene.bjs_input_maps:
            for action in input_map.actions:
                for row in action.bindings:
                    if row.device == 'GAMEPAD':
                        from .properties import MigrateGamepadTriggerBinding
                        MigrateGamepadTriggerBinding(row)
                        SyncGpEnumsFromIndex(row)


def _sync_gamepad_pickers_deferred():
    _sync_gamepad_pickers_on_load(None)
    return None


def register():
    properties.register()
    operators.register()
    if _sync_gamepad_pickers_on_load not in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.append(_sync_gamepad_pickers_on_load)
    bpy.app.timers.register(_sync_gamepad_pickers_deferred, first_interval=0)


def unregister():
    if _sync_gamepad_pickers_on_load in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.remove(_sync_gamepad_pickers_on_load)
    operators.unregister()
    properties.unregister()
