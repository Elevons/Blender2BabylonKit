import type { InputActionData, InputControlType, InputActionType } from "../core/types";
import { ResolveBinding, ValueMagnitude } from "./InputBinding";
import type { InputValue, Vector2Value } from "./InputBinding";
import type { DeviceState } from "./Devices";

/**
 * One named action ("Jump", "Move"): the thing behaviors talk to. Each frame
 * the action resolves all of its bindings, keeps the most-actuated value
 * (Unity's disambiguation rule), advances its phase state machine, and fires
 * started / performed / canceled callbacks. Behaviors can subscribe to those
 * callbacks or poll (ReadValue / IsPressed / WasPressedThisFrame / ...).
 *
 * Phase semantics mirror Unity:
 *   BUTTON:      started + performed on press; canceled on release.
 *   VALUE:       started when leaving default; performed on every change while
 *                actuated; canceled when returning to default.
 *   PASSTHROUGH: performed on any value change; no started/canceled.
 */

export type InputActionPhase = "DISABLED" | "WAITING" | "STARTED" | "PERFORMED" | "CANCELED";

export type InputActionCallback = (action: InputAction) => void;

/** Unity's default button press point. */
const PRESS_POINT = 0.5;

/** A tiny observable: add/remove callbacks, invoked with the action. */
export class InputActionEvent
{
  private callbacks: InputActionCallback[] = [];

  /** Subscribe a callback. Lowercase to mirror Babylon/Unity observable naming. */
  add(callback: InputActionCallback): void
  {
    this.callbacks.push(callback);
  }

  /** Unsubscribe a previously added callback. */
  remove(callback: InputActionCallback): void
  {
    const index = this.callbacks.indexOf(callback);
    if (index >= 0)
    {
      this.callbacks.splice(index, 1);
    }
  }

  /** @internal Fire every callback (errors are logged, never propagated). */
  Invoke(action: InputAction): void
  {
    for (const callback of this.callbacks)
    {
      try
      {
        callback(action);
      }
      catch (error)
      {
        console.error(`[bjs] input action "${action.name}" callback`, error);
      }
    }
  }
}

/**
 * One named action ("Jump", "Move") behaviors poll or subscribe to. See the
 * file-level comment for the phase semantics each action type follows.
 */
export class InputAction
{
  readonly name: string;
  readonly type: InputActionType;
  readonly controlType: InputControlType;

  /** Subscribe with action.started.add((action) => ...). */
  readonly started = new InputActionEvent();
  readonly performed = new InputActionEvent();
  readonly canceled = new InputActionEvent();

  phase: InputActionPhase = "DISABLED";

  private data: InputActionData;
  private value: InputValue;
  private actuated = false;
  private pressedThisFrame = false;
  private releasedThisFrame = false;
  private performedThisFrame = false;

  constructor(data: InputActionData)
  {
    this.name = data.name;
    this.type = data.type;
    this.controlType = data.controlType;
    this.data = data;
    this.value = data.controlType === "VECTOR2" ? { x: 0, y: 0 } : 0;
  }

  // ---- Polling API ----

  /** The current value as a scalar (VECTOR2 actions return their magnitude). */
  ReadValue(): number
  {
    return typeof this.value === "number" ? this.value : ValueMagnitude(this.value);
  }

  /** The current value as a vector (scalar actions return {value, 0}). */
  ReadVector2(): Vector2Value
  {
    if (typeof this.value === "number")
    {
      return { x: this.value, y: 0 };
    }
    return { x: this.value.x, y: this.value.y };
  }

  /** True while the action is actuated past the press point. */
  IsPressed(): boolean
  {
    return this.actuated;
  }

  /** True only on the frame the action became actuated. */
  WasPressedThisFrame(): boolean
  {
    return this.pressedThisFrame;
  }

  /** True only on the frame the action stopped being actuated. */
  WasReleasedThisFrame(): boolean
  {
    return this.releasedThisFrame;
  }

  /** True only on a frame where the action performed (fired `performed`). */
  WasPerformedThisFrame(): boolean
  {
    return this.performedThisFrame;
  }

  // ---- Lifecycle (driven by the owning map / InputManager) ----

  /** @internal Enable: start participating in Process(). */
  Enable(): void
  {
    if (this.phase === "DISABLED")
    {
      this.phase = "WAITING";
    }
  }

  /** @internal Disable and reset to the default value (cancels if in progress). */
  Disable(): void
  {
    if (this.phase === "STARTED" || this.phase === "PERFORMED")
    {
      this.canceled.Invoke(this);
    }
    this.phase = "DISABLED";
    this.value = this.controlType === "VECTOR2" ? { x: 0, y: 0 } : 0;
    this.actuated = false;
    this.pressedThisFrame = false;
    this.releasedThisFrame = false;
    this.performedThisFrame = false;
  }

  /** @internal Resolve bindings, advance the phase machine, fire callbacks. */
  Process(devices: DeviceState): void
  {
    if (this.phase === "DISABLED")
    {
      return;
    }

    const previousValue = this.value;
    const wasActuated = this.actuated;

    this.value = this.ResolveValue(devices);
    const threshold = this.type === "BUTTON" ? PRESS_POINT : 0;
    this.actuated = ValueMagnitude(this.value) > threshold;

    this.pressedThisFrame = this.actuated && !wasActuated;
    this.releasedThisFrame = !this.actuated && wasActuated;
    this.performedThisFrame = false;

    if (this.type === "BUTTON")
    {
      this.ProcessButton();
    }
    else if (this.type === "VALUE")
    {
      this.ProcessValue(previousValue, wasActuated);
    }
    else
    {
      this.ProcessPassThrough(previousValue);
    }
  }

  /** Most-actuated binding wins (Unity's disambiguation between controls). */
  private ResolveValue(devices: DeviceState): InputValue
  {
    let best: InputValue = this.controlType === "VECTOR2" ? { x: 0, y: 0 } : 0;
    let bestMagnitude = 0;

    for (const binding of this.data.bindings)
    {
      const candidate = ResolveBinding(binding, devices);
      const magnitude = ValueMagnitude(candidate);
      if (magnitude > bestMagnitude)
      {
        best = candidate;
        bestMagnitude = magnitude;
      }
    }

    return this.CoerceToControlType(best);
  }

  /** Make the binding's value match the action's declared control type. */
  private CoerceToControlType(value: InputValue): InputValue
  {
    if (this.controlType === "VECTOR2")
    {
      return typeof value === "number" ? { x: value, y: 0 } : value;
    }
    return typeof value === "number" ? value : ValueMagnitude(value);
  }

  private ProcessButton(): void
  {
    if (this.pressedThisFrame)
    {
      this.phase = "STARTED";
      this.started.Invoke(this);
      this.phase = "PERFORMED";
      this.performedThisFrame = true;
      this.performed.Invoke(this);
    }
    else if (this.releasedThisFrame)
    {
      this.phase = "CANCELED";
      this.canceled.Invoke(this);
      this.phase = "WAITING";
    }
  }

  private ProcessValue(previousValue: InputValue, wasActuated: boolean): void
  {
    if (this.pressedThisFrame)
    {
      this.phase = "STARTED";
      this.started.Invoke(this);
    }

    if (this.actuated && (!wasActuated || !ValuesEqual(previousValue, this.value)))
    {
      this.phase = "PERFORMED";
      this.performedThisFrame = true;
      this.performed.Invoke(this);
    }

    if (this.releasedThisFrame)
    {
      this.phase = "CANCELED";
      this.canceled.Invoke(this);
      this.phase = "WAITING";
    }
  }

  private ProcessPassThrough(previousValue: InputValue): void
  {
    if (!ValuesEqual(previousValue, this.value))
    {
      this.phase = "PERFORMED";
      this.performedThisFrame = true;
      this.performed.Invoke(this);
    }
  }
}

function ValuesEqual(a: InputValue, b: InputValue): boolean
{
  if (typeof a === "number" && typeof b === "number")
  {
    return a === b;
  }
  if (typeof a !== "number" && typeof b !== "number")
  {
    return a.x === b.x && a.y === b.y;
  }
  return false;
}
