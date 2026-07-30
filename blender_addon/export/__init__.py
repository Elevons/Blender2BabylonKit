"""Export pipeline: .glb + .scene.json manifest, validation, and live link.

- level:      the entry point (export_level) and manifest assembly
- scene:      the manifest `scene` block (environment / fog / post / input)
- components: per-component serialization
- datablocks: native light/camera serialization
- animation:  NLA clip serialization
- assets:     copying authored files next to the export
- validate:   pre-export sanity checks
- live_link:  re-export on save (registers the export Scene props)

Keep this package init light: animator nodes import export.animation, and
eagerly pulling level/validate here re-enters components while they load.
"""

from . import live_link


def export_level(*args, **kwargs):
    """Public API — lazy import to avoid circular loads with components."""
    from .level import export_level as _export_level
    return _export_level(*args, **kwargs)


def validate_scene(*args, **kwargs):
    """Public API — lazy import to avoid circular loads with components."""
    from .validate import validate_scene as _validate_scene
    return _validate_scene(*args, **kwargs)


def register():
    live_link.register()


def unregister():
    live_link.unregister()
