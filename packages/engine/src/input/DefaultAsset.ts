import type { InputActionAssetData, InputBindingData } from "../core/types";

/**
 * The engine's built-in Input Actions asset, used when a manifest carries no
 * `inputActions` block. One "Player" map mirroring the kit's classic bindings:
 * WASD/arrows + left stick to Move, right stick to Look, Space/A to Jump, etc.
 *
 * Blender's "Load Default Asset" operator seeds the panel with this same data
 * (see blender_addon/operators.py) — keep the two in sync.
 */

function Key(control: string): InputBindingData
{
  return { device: "KEYBOARD", control };
}

function PadButton(index: number): InputBindingData
{
  return { device: "GAMEPAD", control: "button", index };
}

function Stick(index: number): InputBindingData
{
  return { device: "GAMEPAD", control: "stick", index };
}

function Vector2Composite(up: string, down: string, left: string, right: string): InputBindingData
{
  return {
    composite: "2DVECTOR",
    parts: { up: Key(up), down: Key(down), left: Key(left), right: Key(right) },
  };
}

export const DEFAULT_INPUT_ASSET: InputActionAssetData = {
  maps: [
    {
      name: "Player",
      actions: [
        {
          name: "Move",
          type: "VALUE",
          controlType: "VECTOR2",
          bindings: [
            Vector2Composite("w", "s", "a", "d"),
            Vector2Composite("arrowup", "arrowdown", "arrowleft", "arrowright"),
            Stick(0),
          ],
        },
        {
          name: "Look",
          type: "VALUE",
          controlType: "VECTOR2",
          bindings: [Stick(1)],
        },
        { name: "Jump",     type: "BUTTON", controlType: "BUTTON", bindings: [Key("space"), PadButton(0)] },
        { name: "Interact", type: "BUTTON", controlType: "BUTTON", bindings: [Key("e"), PadButton(2)] },
        { name: "Sprint",   type: "BUTTON", controlType: "BUTTON", bindings: [Key("shift"), PadButton(10)] },
        { name: "Crouch",   type: "BUTTON", controlType: "BUTTON", bindings: [Key("c"), PadButton(1)] },
      ],
    },
  ],
};
