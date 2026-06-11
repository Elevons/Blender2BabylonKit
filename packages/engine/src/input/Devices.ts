import { KeyboardEventTypes } from "@babylonjs/core";
import type { Scene, Observer, KeyboardInfo } from "@babylonjs/core";

/**
 * Device state — the "native backend" of the input system. The browser is our
 * platform layer: KeyboardEvent streams and the Gamepad API snapshot. These
 * classes hold an always-up-to-date state representation that bindings read;
 * they know nothing about actions or maps.
 */

/** Friendly aliases accepted in authored bindings -> KeyboardEvent.key values. */
const KEY_ALIASES: Record<string, string> = {
  space: " ",
  comma: ",",
};

/** Normalize an authored key token to the KeyboardEvent.key value we store. */
export function NormalizeKey(key: string): string
{
  const lowered = key.toLowerCase();
  return KEY_ALIASES[lowered] ?? lowered;
}

/** Keyboard state: which keys are held, and which went down this frame. */
export class KeyboardState
{
  private held = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private observer: Observer<KeyboardInfo> | null = null;

  /** Start listening on a scene's keyboard observable. Idempotent. */
  Attach(scene: Scene): void
  {
    if (this.observer !== null)
    {
      return;
    }

    this.observer = scene.onKeyboardObservable.add((keyboardInfo) =>
    {
      const key = keyboardInfo.event.key.toLowerCase();

      if (keyboardInfo.type === KeyboardEventTypes.KEYDOWN)
      {
        if (!this.held.has(key))
        {
          this.pressedThisFrame.add(key);
        }
        this.held.add(key);
      }
      else if (keyboardInfo.type === KeyboardEventTypes.KEYUP)
      {
        this.held.delete(key);
      }
    });
  }

  /** Stop listening and clear all state. */
  Detach(scene: Scene): void
  {
    if (this.observer !== null)
    {
      scene.onKeyboardObservable.remove(this.observer);
      this.observer = null;
    }

    this.held.clear();
    this.pressedThisFrame.clear();
  }

  /** Clear the per-frame edge set. Called once at the end of every frame. */
  EndFrame(): void
  {
    this.pressedThisFrame.clear();
  }

  /** True while the (already normalized) key is held. */
  IsHeld(key: string): boolean
  {
    return this.held.has(key);
  }

  /** True only on the frame the key went down. */
  WasPressed(key: string): boolean
  {
    return this.pressedThisFrame.has(key);
  }
}

const GAMEPAD_DEADZONE = 0.15;

/**
 * Gamepad state: a per-frame snapshot of the first connected standard-mapping
 * pad. NOTE (browser policy): pads appear only after the user presses a button.
 */
export class GamepadState
{
  private pad: Gamepad | null = null;

  /** Re-read the pad snapshot (getGamepads returns snapshots in some browsers). */
  Poll(): void
  {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads
      ? navigator.getGamepads()
      : [];
    this.pad = pads.find((candidate) => candidate !== null) ?? null;
  }

  /** Forget the pad snapshot. */
  Reset(): void
  {
    this.pad = null;
  }

  /** The button's analog value in 0..1 (0 when no pad / out of range). */
  Button(index: number): number
  {
    const button = this.pad?.buttons[index];
    if (button === undefined)
    {
      return 0;
    }
    return button.pressed ? 1 : button.value;
  }

  /** The axis value in -1..1 with the deadzone applied (0 when no pad). */
  Axis(index: number): number
  {
    const value = this.pad?.axes[index] ?? 0;
    return Math.abs(value) > GAMEPAD_DEADZONE ? value : 0;
  }
}

/** The device set every binding resolves against. */
export interface DeviceState {
  keyboard: KeyboardState;
  gamepad: GamepadState;
}
