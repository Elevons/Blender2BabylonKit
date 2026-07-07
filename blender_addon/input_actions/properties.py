"""Input Actions data model (Unity Input System style), stored on
`Scene.bjs_input_maps`.

Hierarchy: Scene.bjs_input_maps (Action Maps) > actions > bindings. Composite
bindings are stored Unity-style as a flat run of rows: a header row with
`composite` set, followed by part rows (part != 'NONE') that belong to it.

Object-level component data lives in the components package; the Input
Actions panel is ui/input_panel.py and its operators are operators.py here.
Serialization to/from the manifest shape lives in serialize.py.
"""

import bpy
from bpy.props import (
    StringProperty, EnumProperty, FloatProperty, IntProperty, CollectionProperty,
)
from bpy.types import PropertyGroup, Scene

from .defaults import DEFAULT_INPUT_MAP_NAME
from .gamepad_mapping import (
    GAMEPAD_AXIS_ITEMS,
    GAMEPAD_BUTTON_ITEMS,
    GAMEPAD_STICK_ITEMS,
    GAMEPAD_TRIGGER_AXIS_LEFT,
    GAMEPAD_TRIGGER_AXIS_RIGHT,
)


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
    ('BUTTON', "Button", "Digital face, bumper, and menu buttons"),
    ('AXIS',   "Axis",   "Stick axis (-1..1) or trigger (LT/RT, 0..1)"),
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

INPUT_AXIS_HALVES = [
    ('NONE', "Full", "Full axis (-1..1); for direct bindings or both directions"),
    ('POSITIVE', "+ Half", "Only + direction (stick up / right)"),
    ('NEGATIVE', "- Half", "Only - direction (stick down / left, as magnitude)"),
]


def DefaultAxisHalfForPart(part):
    """Default axis-half when adding a composite part row (Unity-style)."""
    part_upper = str(part).upper()
    if part_upper in ('POSITIVE', 'UP', 'RIGHT'):
        return 'POSITIVE'
    if part_upper in ('NEGATIVE', 'DOWN', 'LEFT'):
        return 'NEGATIVE'
    return 'NONE'

_GP_BUTTON_IDS = {item[0] for item in GAMEPAD_BUTTON_ITEMS}
_GP_AXIS_IDS = {item[0] for item in GAMEPAD_AXIS_ITEMS}
_GP_STICK_IDS = {item[0] for item in GAMEPAD_STICK_ITEMS}


def MigrateGamepadTriggerBinding(binding):
    """LT/RT were briefly authored as buttons 6/7; runtime expects axis 4/5."""
    if binding.device != 'GAMEPAD':
        return False

    if binding.gp_control == 'BUTTON' and binding.index == 6:
        binding.gp_control = 'AXIS'
        binding.index = GAMEPAD_TRIGGER_AXIS_LEFT
        SyncGpEnumsFromIndex(binding)
        return True

    if binding.gp_control == 'BUTTON' and binding.index == 7:
        binding.gp_control = 'AXIS'
        binding.index = GAMEPAD_TRIGGER_AXIS_RIGHT
        SyncGpEnumsFromIndex(binding)
        return True

    return False


def SyncGpEnumsFromIndex(binding):
    """Mirror index into the stored pickers (after load/capture)."""
    key = str(binding.index)
    if key in _GP_BUTTON_IDS:
        binding.gp_button = key
    if key in _GP_AXIS_IDS:
        binding.gp_axis = key
    if key in _GP_STICK_IDS:
        binding.gp_stick = key


def _sync_gp_index_from_enums(binding):
    if binding.gp_control == 'BUTTON':
        binding.index = int(binding.gp_button)
    elif binding.gp_control == 'AXIS':
        binding.index = int(binding.gp_axis)
    else:
        binding.index = int(binding.gp_stick)


def _on_gp_button_changed(self, context):
    self.gp_control = 'BUTTON'
    self.index = int(self.gp_button)


def _on_gp_axis_changed(self, context):
    self.gp_control = 'AXIS'
    self.index = int(self.gp_axis)
    if self.part != 'NONE' and self.axis_half == 'NONE':
        self.axis_half = DefaultAxisHalfForPart(self.part)


def _on_gp_stick_changed(self, context):
    self.gp_control = 'STICK'
    self.index = int(self.gp_stick)


def _on_gp_control_changed(self, context):
    _sync_gp_index_from_enums(self)


class BJSInputBinding(PropertyGroup):
    """One binding row: a direct control read (key / pad button / axis /
    stick), a composite header (composite != NONE), or a composite's part row
    (part != NONE, belongs to the composite header above it)."""
    composite:  EnumProperty(name="Composite", items=INPUT_COMPOSITES, default='NONE')
    part:       EnumProperty(name="Part", items=INPUT_COMPOSITE_PARTS, default='NONE')
    device:     EnumProperty(name="Device", items=INPUT_DEVICES, default='KEYBOARD')
    key:        StringProperty(name="Key", default="",
                               description='JS KeyboardEvent.key value ("w", "space", "shift", "arrowup")')
    gp_control: EnumProperty(
        name="Control", items=INPUT_GAMEPAD_CONTROLS, default='BUTTON',
        update=_on_gp_control_changed,
    )
    index:      IntProperty(name="Index", default=0, min=0, max=31,
                            description="W3C standard gamepad index (set via the labeled control picker)")
    scale:      FloatProperty(name="Scale", default=1.0,
                              description="Multiplier for the value (-1 flips an axis)")
    axis_half:  EnumProperty(
        name="Axis Half",
        description="For gamepad axes in a composite: read only + or - direction",
        items=INPUT_AXIS_HALVES,
        default='NONE',
    )

    # Stored pickers — EnumProperty get/set is unreliable on collection items in Blender.
    gp_button: EnumProperty(
        name="Button",
        description="Standard-mapping gamepad button",
        items=GAMEPAD_BUTTON_ITEMS,
        default='0',
        update=_on_gp_button_changed,
    )
    gp_axis: EnumProperty(
        name="Axis",
        description="Standard-mapping gamepad axis",
        items=GAMEPAD_AXIS_ITEMS,
        default='0',
        update=_on_gp_axis_changed,
    )
    gp_stick: EnumProperty(
        name="Stick",
        description="Standard-mapping gamepad stick",
        items=GAMEPAD_STICK_ITEMS,
        default='0',
        update=_on_gp_stick_changed,
    )


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
