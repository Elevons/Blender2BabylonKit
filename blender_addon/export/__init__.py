"""Export pipeline: .glb + .scene.json manifest, validation, and live link.

- level:      the entry point (export_level) and manifest assembly
- scene:      the manifest `scene` block (environment / fog / post / input)
- components: per-component serialization
- datablocks: native light/camera serialization
- animation:  NLA clip serialization
- assets:     copying authored files next to the export
- validate:   pre-export sanity checks
- live_link:  re-export on save (registers the export Scene props)
"""

from . import live_link
from .level import export_level  # noqa: F401  (public API)
from .validate import validate_scene  # noqa: F401  (public API)


def register():
    live_link.register()


def unregister():
    live_link.unregister()
