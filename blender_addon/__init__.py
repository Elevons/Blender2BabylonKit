"""Babylon Level Kit - a small Unity-style ECS / level-editor layer for Blender
that exports scenes to Babylon.js.

Packaged as a Blender extension (blender_manifest.toml). Install via
Preferences > Get Extensions > Install from Disk. A "Babylon" tab appears in the
3D viewport N-panel (press N). Metadata (incl. version) lives in the manifest.
"""

# Re-import submodules cleanly on addon reload.
if "properties" in locals():
    import importlib
    for _m in (script_parse, properties, operators, ui, export):  # noqa: F821
        importlib.reload(_m)
else:
    from . import script_parse, properties, operators, ui, export

_modules = (properties, operators, ui)


def register():
    for m in _modules:
        m.register()


def unregister():
    for m in reversed(_modules):
        m.unregister()


if __name__ == "__main__":
    register()
