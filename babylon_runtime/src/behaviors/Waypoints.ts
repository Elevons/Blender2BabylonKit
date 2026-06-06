import { Behavior, exposed } from "../engine";
import { Vector3 } from "@babylonjs/core";

/**
 * Demonstrates the enum and list @exposed types. Moves the node through a set of
 * waypoints; the easing mode is chosen from a dropdown in Blender.
 */
export default class Waypoints extends Behavior {
  // enum → a dropdown in Blender; a plain string at runtime.
  @exposed({ type: "enum", options: ["linear", "easeInOut", "snap"] })
  easing = "easeInOut";

  // list of vector3 → element arrays become Vector3 instances at runtime.
  @exposed({ type: "list", of: "vector3", label: "Waypoints" })
  points: Vector3[] = [];

  @exposed({ min: 0.1, label: "Seconds per leg" })
  legDuration = 2;

  private t = 0;

  onUpdate(dt: number) {
    if (this.points.length < 2) return;
    this.t += dt;
    const total = this.legDuration * (this.points.length - 1);
    const phase = (this.t % total) / this.legDuration;
    const i = Math.floor(phase);
    let k = phase - i;

    if (this.easing === "snap") k = k < 0.5 ? 0 : 1;
    else if (this.easing === "easeInOut") k = k * k * (3 - 2 * k);

    this.node.position = Vector3.Lerp(this.points[i], this.points[i + 1], k);
  }
}
