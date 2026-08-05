import { Behavior, exposed } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

/**
 * Demonstrates the enum and list @exposed types. Moves the node through a set of
 * waypoints; the easing mode is chosen from a dropdown in Blender.
 */
export default class Waypoints extends Behavior
{
  // enum -> a dropdown in Blender; a plain string at runtime.
  @exposed({ type: "enum", options: ["linear", "easeInOut", "snap"] })
  easing = "easeInOut";

  // list of vector3 -> element arrays become Vector3 instances at runtime.
  @exposed({ type: "list", of: "vector3", label: "Waypoints" })
  points: Vector3[] = [];

  @exposed({ min: 0.1, label: "Seconds per leg" })
  legDuration = 2;

  private elapsedSeconds = 0;

  /** Interpolate along the current leg using the chosen easing. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.points.length < 2)
    {
      return;
    }

    this.elapsedSeconds += deltaSeconds;
    const totalDuration = this.legDuration * (this.points.length - 1);
    const phase = (this.elapsedSeconds % totalDuration) / this.legDuration;
    const legIndex = Math.floor(phase);

    let blend = phase - legIndex;
    if (this.easing === "snap")
    {
      blend = blend < 0.5 ? 0 : 1;
    }
    else if (this.easing === "easeInOut")
    {
      blend = blend * blend * (3 - 2 * blend);
    }

    this.node.position = Vector3.Lerp(this.points[legIndex], this.points[legIndex + 1], blend);
  }
}
