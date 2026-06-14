"""Scene-wide Babylon render settings (scene.bjs_scene)."""

from . import settings


def register():
    settings.register()


def unregister():
    settings.unregister()
