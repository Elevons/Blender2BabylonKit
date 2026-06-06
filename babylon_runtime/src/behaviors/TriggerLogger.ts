import { Behavior, exposed } from "../engine";

/** Logs when a trigger collider is overlapped (needs a trigger COLLIDER). */
export default class TriggerLogger extends Behavior {
  @exposed({ label: "Message" })
  message = "";

  onStart() {
    const body = this.entity.body;
    if (!body) return;
    body.setCollisionCallbackEnabled(true);
    body.getCollisionObservable().add((ev) => {
      console.log(`[trigger] ${this.message || this.entity.name}`, ev.type);
    });
  }
}
