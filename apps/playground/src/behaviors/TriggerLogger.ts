import { Behavior, exposed } from "@bjs/engine";

/** Logs when a trigger collider is overlapped (needs a trigger COLLIDER). */
export default class TriggerLogger extends Behavior
{
  @exposed({ label: "Message" })
  message = "";

  /** Subscribe to the body's collision observable and log overlaps. */
  OnStart(): void
  {
    const body = this.entity.body;
    if (body === undefined)
    {
      return;
    }

    body.setCollisionCallbackEnabled(true);
    body.getCollisionObservable().add((collisionEvent) =>
    {
      console.log(`[trigger] ${this.message.length > 0 ? this.message : this.entity.name}`, collisionEvent.type);
    });
  }
}
