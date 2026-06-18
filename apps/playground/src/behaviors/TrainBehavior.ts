import { Behavior, exposed, type Entity } from "@bjs/engine";
import { Path3D, Quaternion, Vector3, PhysicsMotionType } from "@babylonjs/core";

/**
 * Moves the node along a Path3D built from waypoint entities.
 * The easing mode is chosen from a dropdown in Blender.
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

  @exposed({ min: 0.1, label: "Acceleration (units/s²)" })
  acceleration = 5;

  @exposed({ min: 0.1, label: "Deceleration (units/s²)" })
  deceleration = 8;

  private path: Path3D | null = null;
  private currentProgress = 0;
  private maxDuration = 0;
  private currentThrottle = 0;

  // Current quaternion used as the source for SmoothToRef each frame.
  private _currentQuat = new Quaternion();

  /** Build the Path3D and ensure any attached physics body is kinematic. */
  OnStart(): void
  {
    const points: Vector3[] = [];
    for (const target of this.targets)
    {
      if (target !== null)
      {
        points.push(target.node.getAbsolutePosition());
      }
    }

    if (points.length >= 2)
    {
      this.path = new Path3D(points);
      this.maxDuration = this.path.length();

      // Snap to the path start immediately so the train doesn't jump on the
      // first OnUpdate / first Havok solve step.
      this.node.position = this.path.getPointAt(0);
      const forward = this.path.getTangentAt(0, true);
      this._currentQuat = Quaternion.FromLookDirectionRH(forward, Vector3.Up());
      this.node.rotationQuaternion = this._currentQuat;
    }

    // Havok ANIMATED bodies read their transform from the node each frame
    // (pre-step). KINEMATIC bodies do NOT read from the node and will
    // snap back to their internal rest state when you stop driving them.
    // disablePreStep lets the physics plugin copy node -> body on every
    // solve step, so the Havok internal state stays in sync with our path
    // animation.
    if (this.entity.body !== undefined)
    {
      this.entity.body.setMotionType(PhysicsMotionType.ANIMATED);
      this.entity.body.disablePreStep = false;
    }
  }

  /** Interpolate along the Path3D using the chosen easing. */
  OnUpdate(deltaSeconds: number): void
  {
    if (!this.path)
    {
      return;
    }

    // Handle Throttle using the scene default input map (this.input)
    let targetThrottle = 0;
    if (this.input?.FindAction("Throttle Up")?.IsPressed() && this.currentProgress < this.maxDuration)
    {
      targetThrottle += 1;
    }
    if (this.input?.FindAction("Throttle Down")?.IsPressed() && this.currentProgress > 0)
    {
      targetThrottle -= 1;
    }

    // Smoothly ramp currentThrottle toward targetThrottle
    const accelerating = targetThrottle > this.currentThrottle;
    const rate = accelerating ? this.acceleration : this.deceleration;
    const step = rate * deltaSeconds;
    if (Math.abs(targetThrottle - this.currentThrottle) <= step)
    {
      this.currentThrottle = targetThrottle;
    }
    else if (accelerating)
    {
      this.currentThrottle += step;
    }
    else
    {
      this.currentThrottle -= step;
    }

    this.currentProgress += this.currentThrottle * this.throttleSpeed * deltaSeconds;

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

    // Apply easing to the global progress
    if (this.easing === "snap")
    {
      t = t < 0.5 ? 0 : 1;
    }
    else if (this.easing === "easeInOut")
    {
      t = t * t * (3 - 2 * t);
    }

    // Position: Path3D gives an interpolated point at the given [0..1] progress.
    this.node.position = this.path.getPointAt(t);

    // Orientation: use the interpolated tangent for smooth rotation.
    const forward = this.path.getTangentAt(t, true);
    Quaternion.FromRotationMatrixToRef(this.node.getWorldMatrix(), this._currentQuat);
    const targetQuat = Quaternion.FromLookDirectionRH(forward, Vector3.Up());
    Quaternion.SmoothToRef(this._currentQuat, targetQuat, deltaSeconds, 0.1, this._currentQuat);
    this.node.rotationQuaternion = this._currentQuat;
  }
}
