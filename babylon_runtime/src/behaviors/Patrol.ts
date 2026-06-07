import { Behavior, exposed } from "../engine";
import { Vector3, PhysicsMotionType } from "@babylonjs/core";

/** Eases a node back and forth between its start and start + offset. */
export default class Patrol extends Behavior
{
  @exposed({ label: "Offset" })
  offset: [number, number, number] = [5, 0, 0];

  @exposed({ min: 0.1, label: "Period (s)" })
  period = 4;

  private startPosition = new Vector3();
  private endPosition = new Vector3();
  private elapsedSeconds = 0;

  /** Capture the endpoints and make any physics body kinematic. */
  OnStart(): void
  {
    this.startPosition = this.node.position.clone();
    this.endPosition = this.startPosition.add(Vector3.FromArray(this.offset));

    if (this.entity.body !== undefined)
    {
      this.entity.body.setMotionType(PhysicsMotionType.ANIMATED);
    }
  }

  /** Lerp between the endpoints on a sine ease. */
  OnUpdate(deltaSeconds: number): void
  {
    this.elapsedSeconds += deltaSeconds;
    const blend = (Math.sin((this.elapsedSeconds / this.period) * Math.PI * 2) + 1) / 2;
    this.node.position = Vector3.Lerp(this.startPosition, this.endPosition, blend);
  }
}
