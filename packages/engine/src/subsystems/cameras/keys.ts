import type { FreeCamera, ArcRotateCamera } from "@babylonjs/core";
import type { CameraKeys } from "../../core/types";

/**
 * Camera key schemes: translate the authored scheme (ARROWS / WASD / BOTH /
 * CUSTOM) into the keycode arrays Babylon's camera inputs expect. These stay
 * native keycodes by design — Babylon cameras consume keycode arrays, not the
 * engine's Input Actions.
 */

interface KeyCodeSet {
  up: number[];
  down: number[];
  left: number[];
  right: number[];
}

const ARROW_KEYS: KeyCodeSet = { up: [38], down: [40], left: [37], right: [39] };
const WASD_KEYS: KeyCodeSet = { up: [87], down: [83], left: [65], right: [68] };

/** Resolve a key scheme to the keycode arrays Babylon's camera inputs expect. */
function ResolveKeys(keys: CameraKeys): KeyCodeSet
{
  switch (keys.scheme)
  {
    case "WASD":
      return WASD_KEYS;

    case "BOTH":
      return {
        up: [...ARROW_KEYS.up, ...WASD_KEYS.up],
        down: [...ARROW_KEYS.down, ...WASD_KEYS.down],
        left: [...ARROW_KEYS.left, ...WASD_KEYS.left],
        right: [...ARROW_KEYS.right, ...WASD_KEYS.right],
      };

    case "CUSTOM":
    {
      const toKeyCode = (character: string): number[] =>
        character.length > 0 ? [character.toUpperCase().charCodeAt(0)] : [];

      return {
        up: toKeyCode(keys.up),
        down: toKeyCode(keys.down),
        left: toKeyCode(keys.left),
        right: toKeyCode(keys.right),
      };
    }

    case "ARROWS":
    default:
      return ARROW_KEYS;
  }
}

/** Apply key bindings to a keyboard-driven camera (Free / Universal / ArcRotate). */
export function ApplyCameraKeys(camera: FreeCamera | ArcRotateCamera, keys: CameraKeys): void
{
  const keyCodes = ResolveKeys(keys);
  camera.keysUp = keyCodes.up;
  camera.keysDown = keyCodes.down;
  camera.keysLeft = keyCodes.left;
  camera.keysRight = keyCodes.right;
}
