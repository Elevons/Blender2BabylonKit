import { Behavior, exposed } from "../engine";
import { Vector3, PhysicsMotionType } from "@babylonjs/core";

/** Eases a node back and forth between its start and start + offset. */
export default class Patrol extends Behavior {
  @exposed({ label: "Offset" })
  offset: [number, number, number] = [5, 0, 0];

  @exposed({ min: 0.1, label: "Period (s)" })
  period = 4;

  private from = new Vector3();
  private to = new Vector3();
  private t = 0;

  onStart() {
    this.from = this.node.position.clone();
    this.to = this.from.add(Vector3.FromArray(this.offset));
    if (this.entity.body) this.entity.body.setMotionType(PhysicsMotionType.ANIMATED);
  }

  onUpdate(dt: number) {
    this.t += dt;
    const k = (Math.sin((this.t / this.period) * Math.PI * 2) + 1) / 2;
    this.node.position = Vector3.Lerp(this.from, this.to, k);
  }
}
