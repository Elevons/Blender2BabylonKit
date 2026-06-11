import type { Scene } from "@babylonjs/core";
import type { InputActionAssetData } from "../core/types";
import { KeyboardState, GamepadState } from "./Devices";
import type { DeviceState } from "./Devices";
import { InputActionAsset } from "./InputActionAsset";
import { InputActionMap } from "./InputActionMap";
import type { InputAction } from "./InputAction";
import { DEFAULT_INPUT_ASSET } from "./DefaultAsset";

/**
 * The input system's entry point (Unity's `InputSystem`): owns the device
 * states and the project-wide InputActionAsset (`InputManager.actions`,
 * mirroring `InputSystem.actions`).
 *
 * Lifecycle (driven by Level / LevelLoader — behaviors never call these):
 *   LoadAsset(data, defaultMap)  manifest's inputActions + scene default map name
 *   Attach(scene)    start listening; enables every map
 *   Process()        top of frame: read devices, evaluate actions, fire callbacks
 *   EndFrame()       bottom of frame: clear per-frame device edges
 *   Detach(scene)    stop listening, reset all state
 *
 * Behaviors get a map handle via @inputMap("Player") and use the InputAction
 * polling/callback API; one global input state is intentional.
 */
export class InputManager
{
  private static keyboard = new KeyboardState();
  private static gamepad = new GamepadState();
  private static asset = new InputActionAsset(DEFAULT_INPUT_ASSET);
  private static defaultMapName = "Player";
  private static attached = false;

  /** The project-wide actions asset (Unity's InputSystem.actions). */
  static get actions(): InputActionAsset
  {
    return InputManager.asset;
  }

  /** Replace the asset (called by the loader with the manifest's data). */
  static LoadAsset(data: InputActionAssetData, defaultMapName = "Player"): void
  {
    InputManager.asset.Disable();
    InputManager.asset = new InputActionAsset(data);
    InputManager.defaultMapName = defaultMapName;
    if (InputManager.attached)
    {
      InputManager.asset.Enable();
    }
  }

  /** Look up a map on the current asset (used by @inputMap injection). */
  static GetMap(name: string): InputActionMap | undefined
  {
    return InputManager.asset.FindMap(name);
  }

  /**
   * The scene's default Action Map (Blender "Scene Default" in Input Actions).
   * Falls back to the first map in the asset when the named map is missing.
   */
  static GetDefaultMap(): InputActionMap | undefined
  {
    return InputManager.GetMap(InputManager.defaultMapName)
      ?? InputManager.asset.maps[0];
  }

  /** Shorthand for InputManager.actions.FindAction("Map/Action"). */
  static FindAction(path: string): InputAction | undefined
  {
    return InputManager.asset.FindAction(path);
  }

  /** Start listening on the scene and enable every map. Called by Level.Begin. */
  static Attach(scene: Scene): void
  {
    if (InputManager.attached)
    {
      return; // already attached (one global input state is intentional)
    }

    InputManager.attached = true;
    InputManager.keyboard.Attach(scene);
    InputManager.asset.Enable();
  }

  /**
   * Top of frame: snapshot the gamepad and evaluate every enabled map's
   * actions (firing started/performed/canceled). Runs BEFORE behaviors, so
   * callbacks and WasPressedThisFrame edges are visible to every OnUpdate.
   */
  static Process(): void
  {
    InputManager.gamepad.Poll();
    InputManager.asset.Process(InputManager.Devices());
  }

  /** Bottom of frame: clear per-frame device edges. Called by Level.RunFrame. */
  static EndFrame(): void
  {
    InputManager.keyboard.EndFrame();
  }

  /** Stop listening and reset all state. Called by Level.Dispose. */
  static Detach(scene: Scene): void
  {
    if (!InputManager.attached)
    {
      return;
    }

    InputManager.attached = false;
    InputManager.asset.Disable();
    InputManager.keyboard.Detach(scene);
    InputManager.gamepad.Reset();
  }

  private static Devices(): DeviceState
  {
    return { keyboard: InputManager.keyboard, gamepad: InputManager.gamepad };
  }
}
