import { Behavior, exposed, type Entity } from "@bjs/engine";
import { Vector3, Matrix, PhysicsRaycastResult } from "@babylonjs/core";

interface PhysicsRaycastEngine
{
  raycastToRef(from: Vector3, to: Vector3, result: PhysicsRaycastResult): void;
}

/**
 * Drives a fish-like entity: random swimming with obstacle avoidance via a cone
 * of forward physics raycasts.
 *
 * Obstacle avoidance:
 * - Fires a 2D grid of Havok raycasts spread across a cone along the travel
 *   direction, covering both horizontal (left/right) and vertical (up/down) angles.
 * - When the center ray is blocked, steers toward the nearest clear side ray.
 * - If every ray is blocked, picks a random fallback direction.
 */
export default class FishNavigator extends Behavior
{
  @exposed({ min: 0.1, max: 20, label: "Min Speed (u/s)" })
  speedMin = 1;

  @exposed({ min: 0.1, max: 20, label: "Max Speed (u/s)" })
  speedMax = 4;

  @exposed({ min: 1, max: 50, label: "Raycast Count" })
  raycastCount = 3;

  @exposed({ min: 0.1, max: 100, label: "Raycast Length (u)" })
  raycastLength = 5;

  @exposed({ min: 1, max: 180, label: "Cone Angle (deg)" })
  coneAngle = 60;

  @exposed({ min: 1, max: 20, label: "Vertical Raycast Count" })
  verticalRaycastCount = 3;

  @exposed({ min: 1, max: 180, label: "Vertical Cone Angle (deg)" })
  verticalConeAngle = 30;

  @exposed({ min: 0.5, max: 10, label: "Direction Change Interval (s)" })
  directionChangeInterval = 3;

  @exposed({ type: "entity", label: "Ignore Collider" })
  ignoreCollider: Entity | null = null;

  @exposed({ min: 0.1, max: 5, label: "Turn Smoothness" })
  turnSmoothness = 1.5;

  private currentDirection = new Vector3(1, 0, 0);
  private targetDirection = new Vector3(1, 0, 0);
  private currentSpeed = 0;
  private directionTimer = 0;

  private readonly raycastResult = new PhysicsRaycastResult();
  private readonly rayStart = new Vector3();
  private readonly rayEnd = new Vector3();
  private readonly rayOffset = new Vector3();
  private readonly travelForward = new Vector3();
  private readonly rayDirection = new Vector3();
  private readonly bestClearDirection = new Vector3();
  private readonly movementDelta = new Vector3();

  OnStart(): void
  {
    this.currentSpeed = this.RandomInRange(this.speedMin, this.speedMax);
    this.InitializeTravelDirection();
    this.directionTimer = this.directionChangeInterval;
  }

  OnUpdate(deltaSeconds: number): void
  {
    this.directionTimer -= deltaSeconds;
    if (this.directionTimer <= 0)
    {
      this.SetRandomTargetDirection();
      this.currentSpeed = this.RandomInRange(this.speedMin, this.speedMax);
      this.directionTimer = this.RandomInRange(
        this.directionChangeInterval * 0.5,
        this.directionChangeInterval * 1.5
      );
    }

    this.SteerAroundObstacles();

    this.currentDirection = Vector3.Lerp(
      this.currentDirection,
      this.targetDirection,
      this.turnSmoothness * deltaSeconds
    );
    this.currentDirection.normalize();

    this.currentDirection.scaleToRef(this.currentSpeed * deltaSeconds, this.movementDelta);
    this.node.position.addInPlace(this.movementDelta);

    const targetPosition = this.node.position.add(this.currentDirection);
    this.node.lookAt(targetPosition);
    const euler = this.node.rotation.clone();
    euler.x = 0;
    euler.z = 0;
    this.node.rotation = euler;
  }

  /**
   * Fires a 2D grid of physics raycasts along the travel direction, spread across
   * both horizontal (left/right) and vertical (up/down) angles. When the center
   * ray hits a solid collider, steers toward the nearest clear side direction.
   */
  private SteerAroundObstacles(): void
  {
    const physicsEngine = this.scene.getPhysicsEngine() as PhysicsRaycastEngine | null;
    if (physicsEngine === null || physicsEngine === undefined)
    {
      return;
    }

    this.GetTravelForward(this.travelForward);

    this.rayStart.copyFrom(this.node.position);

    const halfAngleRad = (this.coneAngle * 0.5) * Math.PI / 180;
    const halfVerticalAngleRad = (this.verticalConeAngle * 0.5) * Math.PI / 180;
    const centerRayIndex = Math.floor((this.raycastCount - 1) * 0.5);
    const centerVerticalIndex = Math.floor((this.verticalRaycastCount - 1) * 0.5);

    // Local horizontal axis used to tilt rays up and down.
    const rightVector = Vector3.Cross(this.travelForward, Vector3.Up());
    rightVector.normalize();

    let travelDirectionBlocked = false;
    let bestClearAngle = Number.MAX_VALUE;
    let hasClearDirection = false;

    for (let verticalIndex = 0; verticalIndex < this.verticalRaycastCount; verticalIndex++)
    {
      const verticalParameter = this.verticalRaycastCount > 1
        ? verticalIndex / (this.verticalRaycastCount - 1)
        : 0.5;
      const verticalSpread = (verticalParameter - 0.5) * 2;
      const verticalAngle = verticalSpread * halfVerticalAngleRad;

      for (let index = 0; index < this.raycastCount; index++)
      {
        const parameter = this.raycastCount > 1 ? index / (this.raycastCount - 1) : 0.5;
        const spread = (parameter - 0.5) * 2;
        const angle = spread * halfAngleRad;

        const horizontalMatrix = Matrix.RotationAxis(Vector3.Up(), angle);
        Vector3.TransformNormalToRef(this.travelForward, horizontalMatrix, this.rayDirection);

        const verticalMatrix = Matrix.RotationAxis(rightVector, verticalAngle);
        Vector3.TransformNormalToRef(this.rayDirection, verticalMatrix, this.rayDirection);
        this.rayDirection.normalize();

        this.rayDirection.scaleToRef(this.raycastLength, this.rayOffset);
        this.rayEnd.copyFrom(this.rayStart);
        this.rayEnd.addInPlace(this.rayOffset);

        physicsEngine.raycastToRef(this.rayStart, this.rayEnd, this.raycastResult);

        const blocked = this.raycastResult.hasHit && this.IsBlockingRayHit();
        if (blocked)
        {
          if (index === centerRayIndex && verticalIndex === centerVerticalIndex)
          {
            travelDirectionBlocked = true;
          }
          continue;
        }

        const dot = Vector3.Dot(this.travelForward, this.rayDirection);
        const clearAngle = Math.acos(Math.min(Math.max(dot, -1.0), 1.0));
        if (clearAngle < bestClearAngle)
        {
          bestClearAngle = clearAngle;
          this.bestClearDirection.copyFrom(this.rayDirection);
          hasClearDirection = true;
        }
      }
    }

    if (!travelDirectionBlocked)
    {
      return;
    }

    if (hasClearDirection)
    {
      this.targetDirection.copyFrom(this.bestClearDirection);
      this.targetDirection.y = 0;
      this.targetDirection.normalize();
      return;
    }

    this.SetRandomTargetDirection();
  }

  /** Seed travel direction from the node's yaw so raycasts match initial motion. */
  private InitializeTravelDirection(): void
  {
    this.GetTravelForward(this.currentDirection);
    if (this.currentDirection.lengthSquared() > 1e-8)
    {
      this.targetDirection.copyFrom(this.currentDirection);
      return;
    }

    this.SetRandomTargetDirection();
  }

  /** Flatten the current travel direction onto the XZ plane, falling back to node forward. */
  private GetTravelForward(outDirection: Vector3): void
  {
    outDirection.copyFrom(this.currentDirection);
    outDirection.y = 0;

    if (outDirection.lengthSquared() > 1e-8)
    {
      outDirection.normalize();
      return;
    }

    const nodeForward = Vector3.TransformNormal(Vector3.Forward(true), this.node.getWorldMatrix());
    nodeForward.y = 0;

    if (nodeForward.lengthSquared() > 1e-8)
    {
      outDirection.copyFrom(nodeForward);
      outDirection.normalize();
      return;
    }

    outDirection.set(1, 0, 0);
  }

  /**
   * Return true when the latest raycast hit should count as an obstacle
   * (solid colliders only; skips self, triggers, and the ignored entity).
   */
  private IsBlockingRayHit(): boolean
  {
    const hitBody = this.raycastResult.body;
    if (hitBody === null || hitBody === undefined)
    {
      return true;
    }

    if (this.entity.body !== undefined && hitBody === this.entity.body)
    {
      return false;
    }

    const metadata = hitBody.transformNode?.metadata as { bjsEntity?: Entity } | undefined;
    const hitEntity = metadata?.bjsEntity;
    if (hitEntity === null || hitEntity === undefined)
    {
      return true;
    }

    if (this.ignoreCollider !== null && hitEntity.id === this.ignoreCollider.id)
    {
      return false;
    }

    const collider = hitEntity.GetAttachment("COLLIDER");
    if (collider !== undefined && collider.data.isTrigger)
    {
      return false;
    }

    return true;
  }

  /** Set a new random target direction on the XZ plane. */
  private SetRandomTargetDirection(): void
  {
    const angle = Math.random() * Math.PI * 2;
    this.targetDirection.set(Math.cos(angle), 0, Math.sin(angle));
  }

  /** Return a random float within [min, max]. */
  private RandomInRange(min: number, max: number): number
  {
    return min + Math.random() * (max - min);
  }
}
