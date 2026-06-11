"""Input Actions data model (Unity Input System style), stored on
`Scene.bjs_input_maps`.

Hierarchy: Scene.bjs_input_maps (Action Maps) > actions > bindings. Composite
bindings are stored Unity-style as a flat run of rows: a header row with
`composite` set, followed by part rows (part != 'NONE') that belong to it.

Object-level component data lives in properties.py; the Input Actions panel is
input_ui.py and its operators are input_ops.py. Serialization to the manifest
shape lives in scene_export.py.
"""

import bpy
from bpy.props import (
    StringProperty, EnumProperty, FloatProperty, IntProperty, CollectionProperty,
)
from bpy.types import PropertyGroup, Scene

from .input_defaults import DEFAULT_INPUT_MAP_NAME


INPUT_ACTION_TYPES = [
    ('BUTTON',      "Button",       "Performed once on press, canceled on release"),
    ('VALUE',       "Value",        "Performed on every change while actuated (axes, sticks)"),
    ('PASSTHROUGH', "Pass-Through", "Performed on any value change, no disambiguation"),
]

INPUT_CONTROL_TYPES = [
    ('BUTTON',  "Button",   "A 0/1 (or analog 0..1) value"),
    ('AXIS',    "Axis",     "A -1..1 scalar value"),
    ('VECTOR2', "Vector 2", "A 2D vector (move / look)"),
]

INPUT_DEVICES = [
    ('KEYBOARD', "Keyboard", "A keyboard key (JS KeyboardEvent.key value)"),
    ('GAMEPAD',  "Gamepad",  "A standard-mapping gamepad control"),
]

INPUT_GAMEPAD_CONTROLS = [
    ('BUTTON', "Button", "Button by index (0=A/Cross, 1=B/Circle, 2=X/Square, 3=Y/Triangle...)"),
    ('AXIS',   "Axis",   "Single analog axis by index (0=LX, 1=LY, 2=RX, 3=RY)"),
    ('STICK',  "Stick",  "Whole stick as a 2D vector (0=left, 1=right; up is +1)"),
]

INPUT_COMPOSITES = [
    ('NONE',     "Binding",   "A direct binding to one control"),
    ('1DAXIS',   "1D Axis",   "Negative/positive parts composed into a -1..1 axis"),
    ('2DVECTOR', "2D Vector", "Up/down/left/right parts composed into a vector (WASD)"),
]

INPUT_COMPOSITE_PARTS = [
    ('NONE',     "—",        "Not a composite part"),
    ('UP',       "Up",       "2D Vector: +Y"),
    ('DOWN',     "Down",     "2D Vector: -Y"),
    ('LEFT',     "Left",     "2D Vector: -X"),
    ('RIGHT',    "Right",    "2D Vector: +X"),
    ('NEGATIVE', "Negative", "1D Axis: toward -1"),
    ('POSITIVE', "Positive", "1D Axis: toward +1"),
]


class BJSInputBinding(PropertyGroup):
    """One binding row: a direct control read (key / pad button / axis /
    stick), a composite header (composite != NONE), or a composite's part row
    (part != NONE, belongs to the composite header above it)."""
    composite:  EnumProperty(name="Composite", items=INPUT_COMPOSITES, default='NONE')
    part:       EnumProperty(name="Part", items=INPUT_COMPOSITE_PARTS, default='NONE')
    device:     EnumProperty(name="Device", items=INPUT_DEVICES, default='KEYBOARD')
    key:        StringProperty(name="Key", default="",
                               description='JS KeyboardEvent.key value ("w", "space", "shift", "arrowup")')
    gp_control: EnumProperty(name="Control", items=INPUT_GAMEPAD_CONTROLS, default='BUTTON')
    index:      IntProperty(name="Index", default=0, min=0, max=31,
                            description="Gamepad button/axis/stick index (standard mapping)")
    scale:      FloatProperty(name="Scale", default=1.0,
                              description="Multiplier for the value (-1 flips an axis)")


class BJSInputAction(PropertyGroup):
    """One named action ("Jump", "Move"): what scripts talk to. Its bindings
    decide which physical controls drive it."""
    name:           StringProperty(name="Action", default="Action")
    action_type:    EnumProperty(name="Type", items=INPUT_ACTION_TYPES, default='BUTTON')
    control_type:   EnumProperty(name="Control Type", items=INPUT_CONTROL_TYPES, default='BUTTON')
    bindings:       CollectionProperty(type=BJSInputBinding)
    active_binding: IntProperty(default=-1)


class BJSInputActionMap(PropertyGroup):
    """A named group of actions ("Player", "UI"), enabled/disabled as a unit
    at runtime. Scripts receive a handle via @inputMap("Name")."""
    name:          StringProperty(name="Map", default="Map")
    actions:       CollectionProperty(type=BJSInputAction)
    active_action: IntProperty(default=-1)


classes = (
    BJSInputBinding,
    BJSInputAction,
    BJSInputActionMap,
)


def register():
    for c in classes:
        bpy.utils.register_class(c)
    # Scene-level Input Actions asset (the "Input Actions" panel): Action Maps
    # > Actions > Bindings, exported into the manifest's scene block.
    Scene.bjs_input_maps = CollectionProperty(type=BJSInputActionMap)
    Scene.bjs_input_map_active = IntProperty(default=-1)
    # Which map scripts without @inputMap (or with @inputMap("")) receive.
    Scene.bjs_input_default_map = StringProperty(
        name="Default Map", default=DEFAULT_INPUT_MAP_NAME,
        description="Action Map injected when a script has no @inputMap decorator "
                    "(or uses @inputMap with no name)")


def unregister():
    del Scene.bjs_input_default_map
    del Scene.bjs_input_map_active
    del Scene.bjs_input_maps
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
