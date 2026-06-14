"""Viewport overlays (GPU drawing) — currently the collider wireframe preview."""

from . import collider_preview


def register():
    collider_preview.register()


def unregister():
    collider_preview.unregister()
