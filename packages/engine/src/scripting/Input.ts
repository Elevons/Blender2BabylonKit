import { Scene, KeyboardEventTypes } from "@babylonjs/core";
import type { Observer, KeyboardInfo } from "@babylonjs/core";

/**
 * Input action mapping: behaviors read named actions ("Jump", "Interact") and
 * axes ("MoveX", "MoveY") instead of raw key codes, so bindings live in ONE
 * place and gamepad support comes for free.
 *
 * Usage in a behavior:
 *   if (Input.WasPressed("Jump")) { ... }       // edge: true for one frame
 *   if (Input.IsDown("Sprint"))   { ... }       // level: true while held
 *   const move = Input.Axis("MoveX");           // -1..1 (keys or stick)
 *
 * The Level attaches/updates/detaches this automatically (Begin/RunFrame/
 * Dispose) — behaviors just read it. Rebind at startup with Input.BindAction /
 * Input.BindAxis, e.g. in main.ts before loading the level.
 *
 * Gamepad: the first connected pad is polled each frame; sticks get a deadzone
 * and buttons map by index (standard layout: 0 = A/Cross, 1 = B/Circle, ...).
 * NOTE (browser policy): pads appear only after the user presses a button.
 */

/** Keys are KeyboardEvent.key values, lower-cased ("w", " ", "shift", "e"). */
interface ActionBinding {
  keys: string[];
  gamepadButtons: number[];
}

/** An axis built from a negative/positive key pair and/or a gamepad stick axis. */
interface AxisBinding {
  negativeKeys: string[];
  positiveKeys: string[];
  /** Standard-mapping axis index (0 = left stick X, 1 = left stick Y). */
  gamepadAxis: number | null;
  /** Multiply the pad value (Y sticks report up as -1, so MoveY uses -1). */
  gamepadScale: number;
}

const GAMEPAD_DEADZONE = 0.15;

/** Default bindings — the single place to change the control scheme. */
const DEFAULT_ACTIONS: Record<string, ActionBinding> =
{
  Jump:     { keys: [" "], gamepadButtons: [0] },
  Interact: { keys: ["e"], gamepadButtons: [2] },
  Sprint:   { keys: ["shift"], gamepadButtons: [10] },
  Crouch:   { keys: ["c"], gamepadButtons: [1] },
};

const DEFAULT_AXES: Record<string, AxisBinding> =
{
  MoveX: { negativeKeys: ["a", "arrowleft"], positiveKeys: ["d", "arrowright"], gamepadAxis: 0, gamepadScale: 1 },
  MoveY: { negativeKeys: ["s", "arrowdown"], positiveKeys: ["w", "arrowup"], gamepadAxis: 1, gamepadScale: -1 },
  LookX: { negativeKeys: [], positiveKeys: [], gamepadAxis: 2, gamepadScale: 1 },
  LookY: { negativeKeys: [], positiveKeys: [], gamepadAxis: 3, gamepadScale: -1 },
};

export class Input
{
  private static actions: Record<string, ActionBinding> = { ...DEFAULT_ACTIONS };
  private static axes: Record<string, AxisBinding> = { ...DEFAULT_AXES };

  private static heldKeys = new Set<string>();
  private static pressedThisFrame = new Set<string>();
  private static keyboardObserver: Observer<KeyboardInfo> | null = null;
  private static gamepad: Gamepad | null = null;

  /** True while any of the action's keys/buttons are held. */
  static IsDown(actionName: string): boolean
  {
    const binding = Input.actions[actionName];
    if (binding === undefined)
    {
      console.warn(`[bjs] input: no action named "${actionName}"`);
      return false;
    }

    const keyHeld = binding.keys.some((key) => Input.heldKeys.has(key));
    const buttonHeld = Input.gamepad !== null
      && binding.gamepadButtons.some((index) => Input.gamepad!.buttons[index]?.pressed === true);

    return keyHeld || buttonHeld;
  }

  /** True only on the frame a key for the action went down (keyboard edge). */
  static WasPressed(actionName: string): boolean
  {
    const binding = Input.actions[actionName];
    if (binding === undefined)
    {
      console.warn(`[bjs] input: no action named "${actionName}"`);
      return false;
    }

    return binding.keys.some((key) => Input.pressedThisFrame.has(key));
  }

  /** Combined axis value in -1..1 (keys are digital; the stick is analog). */
  static Axis(axisName: string): number
  {
    const binding = Input.axes[axisName];
    if (binding === undefined)
    {
      console.warn(`[bjs] input: no axis named "${axisName}"`);
      return 0;
    }

    let value = 0;
    if (binding.negativeKeys.some((key) => Input.heldKeys.has(key)))
    {
      value -= 1;
    }
    if (binding.positiveKeys.some((key) => Input.heldKeys.has(key)))
    {
      value += 1;
    }

    if (value === 0 && Input.gamepad !== null && binding.gamepadAxis !== null)
    {
      const stickValue = Input.gamepad.axes[binding.gamepadAxis] ?? 0;
      if (Math.abs(stickValue) > GAMEPAD_DEADZONE)
      {
        value = stickValue * binding.gamepadScale;
      }
    }

    return value;
  }

  /** Replace an action's bindings (keys lower-cased; e.g. " " for Space). */
  static BindAction(actionName: string, keys: string[], gamepadButtons: number[] = []): void
  {
    Input.actions[actionName] = { keys: keys.map((key) => key.toLowerCase()), gamepadButtons };
  }

  /** Replace an axis's bindings. */
  static BindAxis(
    axisName: string,
    negativeKeys: string[],
    positiveKeys: string[],
    gamepadAxis: number | null = null,
    gamepadScale = 1
  ): void
  {
    Input.axes[axisName] = {
      negativeKeys: negativeKeys.map((key) => key.toLowerCase()),
      positiveKeys: positiveKeys.map((key) => key.toLowerCase()),
      gamepadAxis,
      gamepadScale,
    };
  }

  /** Start listening on a scene's keyboard. Called by Level.Begin. */
  static Attach(scene: Scene): void
  {
    if (Input.keyboardObserver !== null)
    {
      return; // already attached (one global input state is intentional)
    }

    Input.keyboardObserver = scene.onKeyboardObservable.add((keyboardInfo) =>
    {
      const key = keyboardInfo.event.key.toLowerCase();

      if (keyboardInfo.type === KeyboardEventTypes.KEYDOWN)
      {
        if (!Input.heldKeys.has(key))
        {
          Input.pressedThisFrame.add(key);
        }
        Input.heldKeys.add(key);
      }
      else if (keyboardInfo.type === KeyboardEventTypes.KEYUP)
      {
        Input.heldKeys.delete(key);
      }
    });
  }

  /**
   * Per-frame bookkeeping: refresh the gamepad snapshot and clear key edges.
   * Called by Level.RunFrame AFTER behaviors update, so WasPressed edges are
   * visible to every behavior for exactly one frame.
   */
  static Update(): void
  {
    Input.pressedThisFrame.clear();

    // getGamepads returns snapshots in some browsers, so re-read every frame.
    const pads = typeof navigator !== "undefined" && navigator.getGamepads
      ? navigator.getGamepads()
      : [];
    Input.gamepad = pads.find((pad) => pad !== null) ?? null;
  }

  /** Stop listening and clear all state. Called by Level.Dispose. */
  static Detach(scene: Scene): void
  {
    if (Input.keyboardObserver !== null)
    {
      scene.onKeyboardObservable.remove(Input.keyboardObserver);
      Input.keyboardObserver = null;
    }

    Input.heldKeys.clear();
    Input.pressedThisFrame.clear();
    Input.gamepad = null;
  }
}
