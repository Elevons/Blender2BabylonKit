"""Collision layers: scene-wide named layers + collision matrix."""

from . import properties, operators


def register():
    properties.register()
    operators.register()


def unregister():
    operators.unregister()
    properties.unregister()
