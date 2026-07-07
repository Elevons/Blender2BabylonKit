"""W3C Standard Gamepad mapping labels for the Input Actions editor.

Indices match the browser Gamepad API standard mapping used at runtime
(packages/engine/src/input/Devices.ts, DefaultAsset.ts).

Triggers (LT/RT) are authored as axis indices 4/5; the runtime reads W3C
gamepad buttons 6/7 as analog 0..1 values.
"""

GAMEPAD_TRIGGER_AXIS_LEFT = 4
GAMEPAD_TRIGGER_AXIS_RIGHT = 5

GAMEPAD_BUTTONS = (
    (0,  "A / Cross",         "South face button (standard index 0)"),
    (1,  "B / Circle",        "East face button"),
    (2,  "X / Square",        "West face button"),
    (3,  "Y / Triangle",      "North face button"),
    (4,  "LB / L1",           "Left bumper"),
    (5,  "RB / R1",           "Right bumper"),
    (8,  "Back / Select",     "Back / Share"),
    (9,  "Start / Options",   "Start / Menu"),
    (10, "L3",                "Left stick press"),
    (11, "R3",                "Right stick press"),
    (12, "D-pad Up",          ""),
    (13, "D-pad Down",        ""),
    (14, "D-pad Left",        ""),
    (15, "D-pad Right",       ""),
    (16, "Guide / Home",      "Xbox / PS button"),
)

# Sticks use axes 0–3; triggers are analog 0..1 on virtual axis indices 4/5
# (resolved at runtime from W3C gamepad buttons 6/7).
GAMEPAD_AXES = (
    (0, "Left Stick X",  "Horizontal left stick (-1..1)"),
    (1, "Left Stick Y",  "Vertical left stick (-1..1)"),
    (2, "Right Stick X", "Horizontal right stick (-1..1)"),
    (3, "Right Stick Y", "Vertical right stick (-1..1)"),
    (4, "LT / L2",       "Left trigger (analog 0..1)"),
    (5, "RT / R2",       "Right trigger (analog 0..1)"),
)

GAMEPAD_STICKS = (
    (0, "Left Stick",  "Left analog stick as a 2D vector"),
    (1, "Right Stick", "Right analog stick as a 2D vector"),
)


def _enum_items(table):
    return [(str(index), name, description) for index, name, description in table]


GAMEPAD_BUTTON_ITEMS = _enum_items(GAMEPAD_BUTTONS)
GAMEPAD_AXIS_ITEMS = _enum_items(GAMEPAD_AXES)
GAMEPAD_STICK_ITEMS = _enum_items(GAMEPAD_STICKS)


def GamepadButtonLabel(index):
    for candidate, name, _description in GAMEPAD_BUTTONS:
        if candidate == index:
            return name
    return f"Button {index}"


def GamepadAxisLabel(index):
    for candidate, name, _description in GAMEPAD_AXES:
        if candidate == index:
            return name
    return f"Axis {index}"


def GamepadStickLabel(index):
    for candidate, name, _description in GAMEPAD_STICKS:
        if candidate == index:
            return name
    return f"Stick {index}"


def GamepadBindingLabel(control, index):
    control_upper = str(control).upper()
    if control_upper == "BUTTON":
        return GamepadButtonLabel(index)
    if control_upper == "AXIS":
        return GamepadAxisLabel(index)
    if control_upper == "STICK":
        return GamepadStickLabel(index)
    return f"{control_upper} {index}"
