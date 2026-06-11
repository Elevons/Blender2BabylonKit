import type { InputBindingData } from "../core/types";
import { NormalizeKey } from "./Devices";
import type { DeviceState } from "./Devices";

/**
 * Binding resolution: turn one InputBindingData record into a live value by
 * reading the device state. Direct bindings read a single control (a keyboard
 * key, a gamepad button, a gamepad axis, or a whole stick); composite bindings
 * combine their part bindings into an axis (1DAXIS) or a 2D vector (2DVECTOR).
 *
 * Raw tokens (browser-native, no Unity control paths):
 *   KEYBOARD: control = KeyboardEvent.key value ("w", "space", "shift")
 *   GAMEPAD:  control = "button" | "axis" | "stick", index = standard-mapping
 *             index (stick 0 = left, 1 = right). Sticks report Unity-style
 *             up = +1 (the browser's raw Y is flipped here).
 */

export interface Vector2Value {
  x: number;
  y: number;
}

/** The value one binding (or one action) produces. */
export type InputValue = number | Vector2Value;

/** Magnitude of a binding/action value (used for actuation + disambiguation). */
export function ValueMagnitude(value: InputValue): number
{
  if (typeof value === "number")
  {
    return Math.abs(value);
  }
  return Math.hypot(value.x, value.y);
}

/** Read a direct (non-composite) binding's scalar value from the devices. */
function ResolveDirectScalar(binding: InputBindingData, devices: DeviceState): number
{
  const scale = binding.scale ?? 1;

  if (binding.device === "KEYBOARD")
  {
    const key = NormalizeKey(binding.control ?? "");
    return devices.keyboard.IsHeld(key) ? scale : 0;
  }

  if (binding.device === "GAMEPAD")
  {
    const index = binding.index ?? 0;
    if (binding.control === "axis")
    {
      return devices.gamepad.Axis(index) * scale;
    }
    // Default gamepad control is a button.
    return devices.gamepad.Button(index) * scale;
  }

  return 0;
}

/** Read a whole gamepad stick (two axes) as a vector; up is +1 like Unity. */
function ResolveStick(binding: InputBindingData, devices: DeviceState): Vector2Value
{
  const stickIndex = binding.index ?? 0;
  const scale = binding.scale ?? 1;
  return {
    x: devices.gamepad.Axis(stickIndex * 2) * scale,
    y: -devices.gamepad.Axis(stickIndex * 2 + 1) * scale,
  };
}

/** Combine 1DAXIS parts (negative/positive) into a -1..1 scalar. */
function ResolveAxisComposite(binding: InputBindingData, devices: DeviceState): number
{
  const parts = binding.parts ?? {};
  const negative = parts.negative !== undefined ? ResolveDirectScalar(parts.negative, devices) : 0;
  const positive = parts.positive !== undefined ? ResolveDirectScalar(parts.positive, devices) : 0;
  return positive - negative;
}

/** Combine 2DVECTOR parts (up/down/left/right), normalized like Unity's default. */
function ResolveVectorComposite(binding: InputBindingData, devices: DeviceState): Vector2Value
{
  const parts = binding.parts ?? {};
  const read = (part: string): number =>
    parts[part] !== undefined ? ResolveDirectScalar(parts[part], devices) : 0;

  let x = read("right") - read("left");
  let y = read("up") - read("down");

  const magnitude = Math.hypot(x, y);
  if (magnitude > 1)
  {
    x /= magnitude;
    y /= magnitude;
  }

  return { x, y };
}

/** Resolve one binding to its current value (scalar or vector). */
export function ResolveBinding(binding: InputBindingData, devices: DeviceState): InputValue
{
  if (binding.composite === "1DAXIS")
  {
    return ResolveAxisComposite(binding, devices);
  }
  if (binding.composite === "2DVECTOR")
  {
    return ResolveVectorComposite(binding, devices);
  }
  if (binding.device === "GAMEPAD" && binding.control === "stick")
  {
    return ResolveStick(binding, devices);
  }

  return ResolveDirectScalar(binding, devices);
}
