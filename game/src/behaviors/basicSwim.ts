import { Behavior, exposed } from "b2bkit";
import { Vector3 } from "@babylonjs/core";

/** Moves a node forward at a configurable speed with a gentle bobbing wobble. */
export default class BasicSwim extends Behavior
{
  @exposed({ min: 0.01, max: 50, label: "Pace (u/s)" })
  pace = 2;

  @exposed({ min: 0, label: "Bob height" })
  bobHeight = 0.3;

  @exposed({ min: 0.1, label: "Bob period (s)" })
  bobPeriod = 2;

  private bobOffset = 0;
  private initialY = 0;
  private forwardDir = new Vector3();

  OnStart(): void
  {
    this.initialY = this.node.position.y;
    // Capture the node's local forward direction (negative Z — the kit loads
    // scenes right-handed). TransformNormal ignores translation, which would
    // otherwise corrupt the direction vector.
    this.forwardDir = Vector3.TransformNormal(Vector3.Forward(true), this.node.getWorldMatrix()).normalize();
  }

  OnUpdate(deltaSeconds: number): void
  {
    this.bobOffset += deltaSeconds;
    const bobY = Math.sin((this.bobOffset / this.bobPeriod) * Math.PI * 2) * this.bobHeight;

    // Move forward along the node's facing direction.
    this.node.position.addInPlace(this.forwardDir.scale(this.pace * deltaSeconds));
    // Apply gentle sine-wave bobbing along the up axis.
    this.node.position.y = this.initialY + bobY;
  }
}
