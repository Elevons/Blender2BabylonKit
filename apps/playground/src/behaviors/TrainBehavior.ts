import { Behavior, exposed, type Entity } from "@bjs/engine";
import { Vector3, Curve3 } from "@babylonjs/core";

/**
 * Demonstrates the enum and list @exposed types. Moves the node through a set of
 * waypoints; the easing mode is chosen from a dropdown in Blender.
 */
export default class TrainBehavior extends Behavior
{
  // enum -> a dropdown in Blender; a plain string at runtime.
  @exposed({ type: "enum", options: ["linear", "easeInOut", "snap"] })
  easing = "easeInOut";

  // list of entity -> element arrays become Entity instances at runtime.
  @exposed({ type: "list", of: "entity", label: "Waypoints" })
  targets: (Entity | null)[] = [];

  @exposed({ min: 0.1, label: "Speed (units/s)" })
  throttleSpeed = 1;

  private createSpline(nbPoints: number = 10, closed: boolean = false): Curve3
  {
    return Curve3.CreateCatmullRomSpline(this.points, nbPoints, closed);
  }

  private points: Vector3[] = [];
  private splinePoints: Vector3[] = [];
  private currentProgress = 0;
  private maxDuration = 0;

  OnStart(): void
  {
    this.points = [];
    for (const target of this.targets)
    {
      if (target !== null)
      {
        this.points.push(target.node.getAbsolutePosition());
      }
    }

    if (this.points.length >= 2)
    {
      // Target approx 100 points total for higher visual smoothness.
      // nbPoints is points per segment. Segments = points.length - 1.
      const nbPoints = Math.max(1, Math.floor(100 / Math.max(1, this.points.length - 1)));
      const spline = this.createSpline(nbPoints);
      this.splinePoints = spline.getPoints();
      this.maxDuration = spline.length();
    }
  }

  /** Interpolate along the current leg using the chosen easing. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.splinePoints.length < 2)
    {
      return;
    }

    // Handle Throttle using the scene default input map (this.input)
    let throttle = 0;
    if (this.input.FindAction("Throttle Up")?.IsPressed() && this.currentProgress < this.maxDuration)
    {
      throttle += 1;
    }
    if (this.input.FindAction("Throttle Down")?.IsPressed() && this.currentProgress > 0)
    {
      throttle -= 1;
    }

    this.currentProgress += throttle * this.throttleSpeed * deltaSeconds;

    // Clamp progress to [0, maxDuration]
    if (this.currentProgress < 0)
    {
      this.currentProgress = 0;
    }
    else if (this.currentProgress > this.maxDuration)
    {
      this.currentProgress = this.maxDuration;
    }

    if (this.maxDuration <= 0)
    {
      return;
    }

    let t = this.currentProgress / this.maxDuration;
    t = Math.max(0, Math.min(1, t));

    // Apply easing to the global progress rather than the local segment blend
    if (this.easing === "snap")
    {
      t = t < 0.5 ? 0 : 1;
    }
    else if (this.easing === "easeInOut")
    {
      t = t * t * (3 - 2 * t);
    }

    const rawIndex = t * (this.splinePoints.length - 1);
    const index = Math.floor(rawIndex);
    const blend = rawIndex - index;

    if (index >= this.splinePoints.length - 1)
    {
      this.node.position = this.splinePoints[this.splinePoints.length - 1];
      return;
    }

    const p0 = this.splinePoints[index];
    const p1 = this.splinePoints[index + 1];

    this.node.position = Vector3.Lerp(p0, p1, blend);

    // Look at the next point on the spline to align orientation
    this.node.lookAt(p1);
  }
}
