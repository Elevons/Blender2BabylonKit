"""Babylon Level Kit - a small Unity-style ECS / level-editor layer for Blender
that exports scenes to Babylon.js.

Packaged as a Blender extension (blender_manifest.toml). Install via
Preferences > Get Extensions > Install from Disk. A "Babylon" tab appears in the
3D viewport N-panel (press N). Metadata (incl. version) lives in the manifest.
"""

# Re-import submodules cleanly on addon reload.
if "properties" in locals():
    import importlib
    for _m in (script_parse, properties, scene_properties, scene_export,  # noqa: F821
               anim_export, validate, live_link, operators, ui, scene_ui,  # noqa: F821
               export, collider_preview):  # noqa: F821
        importlib.reload(_m)
else:
    from . import (script_parse, properties, scene_properties, scene_export,
                   anim_export, validate, live_link, operators, ui, scene_ui,
                   export, collider_preview)

# Modules with register()/unregister(). scene_export is pure functions (no UI),
# so it isn't registered. Order: properties before the panels that read them.
_modules = (properties, scene_properties, live_link, operators, ui, scene_ui,
            collider_preview)


def register():
    for m in _modules:
        m.register()


def unregister():
    for m in reversed(_modules):
        m.unregister()


if __name__ == "__main__":
    register()
