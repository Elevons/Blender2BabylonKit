"""Viewport overlays (GPU drawing) — collider wireframe, probe influence, CoM preview."""

from ..core.bounds import ClearBoundsCache
from . import collider_preview, cog_preview, probe_preview
from .gpu_cache import ClearOverlayCaches


def register():
    collider_preview.register()
    cog_preview.register()
    probe_preview.register()


def unregister():
    probe_preview.unregister()
    cog_preview.unregister()
    collider_preview.unregister()
    ClearBoundsCache()
    ClearOverlayCaches()
