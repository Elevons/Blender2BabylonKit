import { Behavior, exposed } from "b2bkit";
import type { Entity } from "b2bkit";

/** Logs when a trigger collider is overlapped. Attach to the entity that owns the trigger body. */
export default class TriggerLogger extends Behavior
{
  @exposed({ label: "Message" })
  message = "";

  private LogLabel(): string
  {
    return this.message.length > 0 ? this.message : this.entity.name;
  }

  /** Log the first trigger overlap with another entity. */
  OnTriggerEnter(other: Entity): void
  {
    console.log(`[trigger] ${this.LogLabel()} enter "${other.name}"`);
  }

  /** Log when a trigger overlap ends. */
  OnTriggerExit(other: Entity): void
  {
    console.log(`[trigger] ${this.LogLabel()} exit "${other.name}"`);
  }
}
