"""Input Actions (Unity Input System style): data model, defaults,
serialization, and operators. The panel lives in ui/input_panel.py."""

from . import properties, operators


def register():
    properties.register()
    operators.register()


def unregister():
    operators.unregister()
    properties.unregister()
