import { Behavior, exposed } from "@bjs/engine";
import type { Entity } from "@bjs/engine";

/**
 * TEST/demo for trigger messaging. Attach to the entity a trigger event targets
 * and it logs every message it receives (optionally filtered to one message),
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
