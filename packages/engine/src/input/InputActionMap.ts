import type { InputActionMapData } from "../core/types";
import { InputAction } from "./InputAction";
import type { DeviceState } from "./Devices";

/**
 * A named group of actions ("Player", "UI") that is enabled and disabled as a
 * unit — the per-context toggle. Behaviors usually receive a map handle via
 * the @inputMap("Name") decorator and read actions off it.
 */
export class InputActionMap
{
  readonly name: string;
  readonly actions: InputAction[] = [];

  private byName = new Map<string, InputAction>();
  private isEnabled = false;

  constructor(data: InputActionMapData)
  {
    this.name = data.name;
    for (const actionData of data.actions)
    {
      const action = new InputAction(actionData);
      this.actions.push(action);
      this.byName.set(action.name, action);
    }
  }

  get enabled(): boolean
  {
    return this.isEnabled;
  }

  /** Enable every action in the map (they start processing next frame). */
  Enable(): void
  {
    this.isEnabled = true;
    for (const action of this.actions)
    {
      action.Enable();
    }
  }

  /** Disable every action (in-progress actions are canceled and reset). */
  Disable(): void
  {
    this.isEnabled = false;
    for (const action of this.actions)
    {
      action.Disable();
    }
  }

  /** Look up an action by name (warns and returns undefined when missing). */
  FindAction(name: string): InputAction | undefined
  {
    const action = this.byName.get(name);
    if (action === undefined)
    {
      console.warn(`[bjs] input: no action named "${name}" in map "${this.name}"`);
    }
    return action;
  }

  /** @internal Per-frame evaluation of every action while the map is enabled. */
  Process(devices: DeviceState): void
  {
    if (!this.isEnabled)
    {
      return;
    }

    for (const action of this.actions)
    {
      action.Process(devices);
    }
  }
}
