import { Behavior, exposed } from "b2bkit";
import type { Entity } from "b2bkit";

/**
 * TEST/demo for Event Message delivery. Attach to the entity an Event Message
 * targets and it logs every message it receives (optionally filtered to one message),
 * and can play one of this entity's sounds in response — wire a door creak to a
 * doorway trigger with zero custom code.
 */
export default class MessageLogger extends Behavior
{
  @exposed({ label: "Only message (empty = all)" })
  onlyMessage = "";

  @exposed({ label: "Play sound (name, optional)" })
  playSound = "";

  /** Log the message (and optionally trigger a sound) when one arrives. */
  OnMessage(message: string, source: Entity): void
  {
    if (this.onlyMessage.length > 0 && message !== this.onlyMessage)
    {
      return;
    }

    console.log(`[MessageLogger:${this.entity.name}] "${message}" from "${source.name}" (tag ${source.tag})`);

    if (this.playSound.length > 0)
    {
      this.entity.GetSound(this.playSound)?.play();
    }
  }
}
