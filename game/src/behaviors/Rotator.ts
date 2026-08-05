import { Behavior, exposed } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

/** Spins a node around a fixed axis at a constant rate. */
export default class Rotator extends Behavior
{
  @exposed({ min: 0, max: 720, label: "Speed (deg/s)" })
  speed = 45;

  @exposed({ label: "Axis" })
  axis: [number, number, number] = [0, 1, 0];

  private rotationAxis = new Vector3(0, 1, 0);
  private radiansPerSecond = 0;

  /** Cache the axis vector and angular speed once values are applied. */
  OnStart(): void
  {
    this.rotationAxis = Vector3.FromArray(this.axis);
    this.radiansPerSecond = (this.speed * Math.PI) / 180;
  }

  /** Advance the rotation for this frame. */
  OnUpdate(deltaSeconds: number): void
  {
    this.node.rotate(this.rotationAxis, this.radiansPerSecond * deltaSeconds);
  }
}
