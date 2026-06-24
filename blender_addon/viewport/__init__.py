"""Viewport overlays (GPU drawing) — collider wireframe and CoM preview."""

from . import collider_preview, cog_preview


def register():
    collider_preview.register()
    cog_preview.register()


def unregister():
    cog_preview.unregister()
    collider_preview.unregister()
