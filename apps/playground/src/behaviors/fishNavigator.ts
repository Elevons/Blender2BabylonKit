import { Behavior, exposed } from "@bjs/engine";
import { Vector3, Ray, Matrix } from "@babylonjs/core";

/**
 * Drives a fish-like entity: random swimming with obstacle avoidance via a cone
 * of forward raycasts, followed by a shrink-and-destroy after a random lifetime.
 *
 * Obstacle avoidance:
 * - Fires a fan of raycasts spread across a cone in front of the node.
 * - If any ray hits, the behavior steers toward the nearest clear (unblocked) ray direction.
 * - If all rays are blocked, it picks a random fallback direction.
 *
 * Lifecycle:
 * - Swims for a random number of seconds (within Lifetime range).
 * - Shrinks uniformly to zero scale over 3 seconds.
 * - Destroys itself by disposing the node.
 */
export default class FishNavigator extends Behavior
{
  @exposed({ min: 0.1, max: 20, label: "Min Speed (u/s)" })
  speedMin = 1;

  @exposed({ min: 0.1, max: 20, label: "Max Speed (u/s)" })
  speedMax = 4;

  @exposed({ min: 0.1, max: 10, label: "Min Lifetime (s)" })
  lifetimeMin = 5;

  @exposed({ min: 0.1, max: 30, label: "Max Lifetime (s)" })
  lifetimeMax = 15;

  @exposed({ min: 1, max: 50, label: "Raycast Count" })
  raycastCount = 7;

  @exposed({ min: 0.1, max: 100, label: "Raycast Length (u)" })
  raycastLength = 5;

  @exposed({ min: 1, max: 180, label: "Cone Angle (deg)" })
  coneAngle = 60;

  @exposed({ min: 0.5, max: 10, label: "Direction Change Interval (s)" })
  directionChangeInterval = 3;

  @exposed({ type: "entity", label: "Ignore Collider" })
  ignoreCollider: Entity | null = null;

  // --- runtime state ---
  private currentDirection = new Vector3(1, 0, 0);
  private targetDirection = new Vector3(1, 0, 0);
  private currentSpeed = 0;
  private lifetimeRemaining = 0;
  private directionTimer = 0;

  @exposed({ min: 0.1, max: 5, label: "Turn Smoothness" })
  turnSmoothness = 1.5;

  // Shrink phase
  private isShrinking = false;
  private shrinkElapsed = 0;
  private shrinkDuration = 3;
  private startScale = new Vector3(1, 1, 1);

  OnStart(): void
  {
    this.startScale.set(this.node.scaling.x, this.node.scaling.y, this.node.scaling.z);
    this.currentSpeed = this.randomInRange(this.speedMin, this.speedMax);
    this.lifetimeRemaining = this.randomInRange(this.lifetimeMin, this.lifetimeMax);
    this.setRandomTargetDirection();
    this.directionTimer = this.directionChangeInterval; // change immediately on first frame
  }

  OnUpdate(deltaSeconds: number): void
  {
    if (this.isShrinking)
    {
      this.handleShrinkPhase(deltaSeconds);
      return;
    }

    // Count down lifetime
    this.lifetimeRemaining -= deltaSeconds;
    if (this.lifetimeRemaining <= 0)
    {
      this.beginShrink();
      return;
    }

    // Periodically pick a new random target direction
    this.directionTimer -= deltaSeconds;
    if (this.directionTimer <= 0)
    {
      this.setRandomTargetDirection();
      this.currentSpeed = this.randomInRange(this.speedMin, this.speedMax);
      this.directionTimer = this.randomInRange(
        this.directionChangeInterval * 0.5,
        this.directionChangeInterval * 1.5
      );
    }

    // Smoothly lerp toward the target direction (both random changes and avoidance)
    this.currentDirection = Vector3.Lerp(this.currentDirection, this.targetDirection, this.turnSmoothness * deltaSeconds);
    this.currentDirection.normalize();

    // Obstacle avoidance via cone raycasts (may update targetDirection)
    this.steerAroundObstacles();

    // Move forward along current direction
    this.node.position.addInPlace(this.currentDirection.scale(this.currentSpeed * deltaSeconds));

    // Face movement direction (horizontal only — keep pitch at 0)
    const targetPosition = this.node.position.add(this.currentDirection);
    this.node.lookAt(targetPosition);
    // Lock pitch so the fish stays horizontal
    const euler = this.node.rotation.clone();
    euler.x = 0;
    euler.z = 0;
    this.node.rotation = euler;
  }

  OnDestroy(): void
  {
    // Ensure node is fully cleaned up if shrink didn't finish
    // (e.g. level unload during shrink phase)
  }

  // --- private helpers ---

  /** Start the shrink-and-destroy sequence. */
  private beginShrink(): void
  {
    this.isShrinking = true;
    this.shrinkElapsed = 0;
  }

  /** Shrink uniformly to zero over shrinkDuration seconds, then dispose. */
  private handleShrinkPhase(deltaSeconds: number): void
  {
    this.shrinkElapsed += deltaSeconds;
    const progress = Math.min(this.shrinkElapsed / this.shrinkDuration, 1.0);
    const scale = this.startScale.scale(1.0 - progress);
    this.node.scaling = scale;

    if (progress >= 1.0)
    {
      this.node.dispose();
    }
  }

  /**
   * Fires a cone of raycasts forward. If any are blocked, steers toward the
   * nearest clear ray direction. Falls back to a random direction if all blocked.
   */
  private steerAroundObstacles(): void
  {
    const forward = Vector3.TransformNormal(Vector3.Forward(true), this.node.getWorldMatrix());
    const up = Vector3.Up(true);

    const halfAngleRad = (this.coneAngle * 0.5) * Math.PI / 180;
    const origin = this.node.position.clone();

    let bestClearDirection: Vector3 | null = null;
    let bestClearAngle = Number.MAX_VALUE;

    for (let index = 0; index < this.raycastCount; index++)
    {
      const t = this.raycastCount > 1 ? index / (this.raycastCount - 1) : 0.5;
      const spread = (t - 0.5) * 2; // -1 to 1
      const angle = spread * halfAngleRad;

      // Rotate forward around up axis to get ray direction
      const rotationMatrix = Matrix.RotationAxis(up, angle);
      const rayDirection = Vector3.TransformCoordinates(forward, rotationMatrix);
      rayDirection.normalize();

      // Cast ray into the scene
      const hit = this.scene.pickWithRay(new Ray(origin, rayDirection, this.raycastLength), (mesh) => {
        // Ignore the mesh belonging to the picked-out collider
        if (this.ignoreCollider?.node === mesh || this.ignoreCollider?.node?.containsDescendant(mesh)) {
          return false;
        }
        return true;
      });

      if (!hit.hit)
      {
        // This ray is clear — how close is it to our current direction?
        const dot = Vector3.Dot(this.currentDirection, rayDirection);
        const angle = Math.acos(Math.min(Math.max(dot, -1.0), 1.0));
        if (angle < bestClearAngle)
        {
          bestClearAngle = angle;
          bestClearDirection = rayDirection;
        }
      }
    }

    // If we found a clear ray, steer toward it by updating the target
    if (bestClearDirection !== null)
    {
      // Only update target if the clear direction is significantly different from current heading
      const dot = Vector3.Dot(this.currentDirection, bestClearDirection);
      if (dot < 0.95) // roughly 18° threshold
      {
        this.targetDirection = bestClearDirection;
      }
    }
    else
    {
      // All rays blocked — set a random fallback target
      this.setRandomTargetDirection();
    }
  }

  /** Set a new random target direction (on the XZ plane). The fish will lerp toward it. */
  private setRandomTargetDirection(): void
  {
    const angle = Math.random() * Math.PI * 2;
    this.targetDirection = new Vector3(Math.cos(angle), 0, Math.sin(angle));
  }

  /** Return a random float within [min, max]. */
  private randomInRange(min: number, max: number): number
  {
    return min + Math.random() * (max - min);
  }
}
