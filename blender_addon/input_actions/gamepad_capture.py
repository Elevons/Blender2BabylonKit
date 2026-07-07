"""Poll a locally connected gamepad for the Input Actions capture operator.

Linux reads /dev/input/js* (kernel joystick API). Button indices from common
xpad/Xbox layouts are remapped to the W3C standard mapping the runtime uses.
Triggers are captured as axis bindings (LT=4, RT=5).
"""

import os
import struct

from .gamepad_mapping import (
    GAMEPAD_TRIGGER_AXIS_LEFT,
    GAMEPAD_TRIGGER_AXIS_RIGHT,
    GamepadAxisLabel,
    GamepadButtonLabel,
)

JS_EVENT_FORMAT = "IhBB"
JS_EVENT_SIZE = struct.calcsize(JS_EVENT_FORMAT)
JS_EVENT_BUTTON = 0x01
JS_EVENT_AXIS = 0x02
AXIS_CAPTURE_THRESHOLD = 0.45
JS_EVENT_SIZE = struct.calcsize(JS_EVENT_FORMAT)
JS_EVENT_BUTTON = 0x01
JS_EVENT_AXIS = 0x02

# Linux xpad face buttons and bumpers match W3C; menu / stick-click indices differ.
XPAD_BUTTON_TO_W3C = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 8,
    7: 9,
    8: 10,
    9: 11,
    10: 16,
    13: 12,
    14: 13,
    15: 14,
    16: 15,
}

# Linux xpad: LT/RT are analog axes 2 and 5 (0..32767), not W3C buttons.
XPAD_AXIS_TO_AUTHORING = {
    0: 0,
    1: 1,
    2: GAMEPAD_TRIGGER_AXIS_LEFT,
    3: 2,
    4: 3,
    5: GAMEPAD_TRIGGER_AXIS_RIGHT,
}


class GamepadCaptureResult:
    """One captured binding: control kind + W3C standard index."""

    __slots__ = ("control", "index", "label")

    def __init__(self, control, index, label):
        self.control = control
        self.index = index
        self.label = label


class _LinuxGamepadReader:
    """Non-blocking reader for the first /dev/input/js* device."""

    def __init__(self):
        self._fd = None
        self._path = None

    def open(self):
        if self._fd is not None:
            return True

        for candidate in range(16):
            path = f"/dev/input/js{candidate}"
            if not os.path.exists(path):
                continue
            try:
                fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
            except OSError:
                continue
            self._fd = fd
            self._path = path
            return True

        return False

    def close(self):
        if self._fd is not None:
            os.close(self._fd)
            self._fd = None
            self._path = None

    @property
    def device_path(self):
        return self._path

    def poll(self):
        if self._fd is None:
            return None

        while True:
            try:
                chunk = os.read(self._fd, JS_EVENT_SIZE)
            except BlockingIOError:
                return None
            except OSError:
                self.close()
                return None

            if len(chunk) < JS_EVENT_SIZE:
                return None

            _time_ms, value, event_type, number = struct.unpack(JS_EVENT_FORMAT, chunk)
            event_type = event_type & ~0x80

            if event_type == JS_EVENT_BUTTON and value == 1:
                w3c_index = XPAD_BUTTON_TO_W3C.get(number, number)
                return GamepadCaptureResult("BUTTON", w3c_index, GamepadButtonLabel(w3c_index))

            if event_type == JS_EVENT_AXIS:
                axis_index = XPAD_AXIS_TO_AUTHORING.get(number)
                if axis_index is None:
                    continue

                threshold = int(AXIS_CAPTURE_THRESHOLD * 32767)
                is_trigger = axis_index in (GAMEPAD_TRIGGER_AXIS_LEFT, GAMEPAD_TRIGGER_AXIS_RIGHT)
                if is_trigger:
                    if value < threshold:
                        continue
                elif abs(value) < threshold:
                    continue

                return GamepadCaptureResult("AXIS", axis_index, GamepadAxisLabel(axis_index))

        return None


_reader = _LinuxGamepadReader()


def BeginGamepadCapture():
    """Open the poll device; returns False when no gamepad is available."""
    return _reader.open()


def EndGamepadCapture():
    _reader.close()


def PollGamepadCapture():
    """Return a capture result when the player actuates a control, else None."""
    return _reader.poll()


def CaptureDeviceDescription():
    return _reader.device_path
