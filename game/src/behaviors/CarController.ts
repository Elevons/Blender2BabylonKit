import { Behavior, exposed, inputMap, type Entity } from "@bjs/engine";
import type { ConstraintAxisName, ConstraintComponent, InputActionMap } from "@bjs/engine";
import {
  Color3,
  LinesMesh,
  Matrix,
  MeshBuilder,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  PhysicsRaycastResult,
  Quaternion,
  Vector3,
  type Node,
  type PhysicsBody,
} from "@babylonjs/core";

/** Runtime handle for one wheel's driven 6DoF joint (HINGE or CUSTOM). */
interface WheelDriveBinding
{
  constraint: Physics6DoFConstraint;
  motorAxis: PhysicsConstraintAxis;
}

const CONSTRAINT_AXIS_MAP: Record<ConstraintAxisName, PhysicsConstraintAxis> = {
  LINEAR_X: PhysicsConstraintAxis.LINEAR_X,
  LINEAR_Y: PhysicsConstraintAxis.LINEAR_Y,
  LINEAR_Z: PhysicsConstraintAxis.LINEAR_Z,
  ANGULAR_X: PhysicsConstraintAxis.ANGULAR_X,
  ANGULAR_Y: PhysicsConstraintAxis.ANGULAR_Y,
  ANGULAR_Z: PhysicsConstraintAxis.ANGULAR_Z,
};

/**
 * CarController drives up to eight wheel motors on HINGE or CUSTOM 6DoF joints
 * (outer + inner per corner) from input, and provides a one-shot "recover"
 * maneuver on the Reset action: it rebuilds the ENTIRE constraint island
 * (body, arms, wheels, and any towed trailers) in its authored formation at
 * the body's current position and heading — lifted, pitch/roll zeroed, yaw
 * preserved — holds briefly, then hands control back to physics so everything
 * drops upright from rest. Each car is placed individually from a load-time
 * snapshot, so a jack-knifed train straightens out, and because the authored
 * poses are the ones the constraints were built in, the solver never fires
 * the huge corrective impulses that used to send wheels and trailers flying.
 */
export default class CarController extends Behavior
{
  @exposed({ label: "Front Left Outer", type: "entity" })
  frontLeftWheel: Entity | null = null;

  @exposed({ label: "Front Right Outer", type: "entity" })
  frontRightWheel: Entity | null = null;

  @exposed({ label: "Rear Left Outer", type: "entity" })
  rearLeftWheel: Entity | null = null;

  @exposed({ label: "Rear Right Outer", type: "entity" })
  rearRightWheel: Entity | null = null;

  @exposed({ label: "Front Left Inner", type: "entity" })
  frontLeftInner: Entity | null = null;

  @exposed({ label: "Front Right Inner", type: "entity" })
  frontRightInner: Entity | null = null;

  @exposed({ label: "Rear Left Inner", type: "entity" })
  rearLeftInner: Entity | null = null;

  @exposed({ label: "Rear Right Inner", type: "entity" })
  rearRightInner: Entity | null = null;

  @exposed({ min: 0, max: 100, label: "Motor Speed" })
  speed = 10;

  @exposed({ min: 0, label: "Motor Force" })
  force = 100;

  @exposed({ min: 0, max: 5, label: "Place Hold (s)" })
  holdSeconds = 0.5;

  @exposed({ min: 0, max: 1, label: "Turn Ratio" })
  turnRatio = 0.5;

  @exposed({ label: "Swap Movement" })
  swapMovement = false;

  @exposed({ label: "Swap Steering" })
  swapSteering = false;

  @exposed({ min: 0, max: 1, label: "Steer Zone Width" })
  steerZoneWidth = 0.6;

  @exposed({ min: 0, max: 1, label: "Steer Zone Priority" })
  steerZonePriority = 0.9;

  /**
   * When > 0, directly set the body's forward/backward linear velocity each
   * frame proportional to throttle.  Bypasses the slow wheel-friction → ground
   * reaction chain so the car accelerates instantly.  Leave at 0 for pure
   * physics; crank to 30+ for arcadey response.
   */
  @exposed({ min: 0, max: 100, label: "Velocity Assist (units/s)" })
  velocityAssist = 0;

  /**
   * Time (seconds) to ramp the velocity assist toward its target.  Smaller =
   * snappier; larger = smoother but feels like gentle acceleration.  Zero
   * snaps instantly (original behavior).
   */
  @exposed({ min: 0, max: 2, label: "Velocity Ramp (s)" })
  velocityRampSeconds = 0.15;

  /**
   * When > 0, directly set the body's yaw angular velocity each frame
   * proportional to steer input.  Makes the car point where the stick aims
   * instead of waiting for wheels to push it around.
   */
  @exposed({ min: 0, max: 180, label: "Angular Assist (deg/s)" })
  angularAssist = 0;

  @exposed({ label: "Body", type: "entity" })
  body: Entity | null = null;

  /**
   * Player entity to exclude from the ground raycast.  Prevents the car's
   * grounded check from treating the player's own collider as ground.
   */
  @exposed({ label: "Player Entity", type: "entity" })
  playerEntity: Entity | null = null;

  /**
   * Distance (meters) below each wheel to raycast each frame.  When a wheel's
   * ray misses (wheel is in the air) that wheel's motor is skipped and the
   * body velocity/angular assists are withheld until at least one wheel hits
   * ground again.
   */
  @exposed({ min: 0.05, max: 5, label: "Ground Raycast Distance (m)" })
  groundRaycastDistance = 0.5;

  /**
   * Draw each wheel's ground raycast as a colored line (green = grounded,
   * red = airborne).  Leave off in shipping builds.
   */
  @exposed({ label: "Debug Ground Ray" })
  debugGroundRay = false;

  @inputMap("Vehicle") vehicle!: InputActionMap;

  private static readonly throttleDeadzone = 0.15;
  /** Steer is already deadzoned in bindings; keep a tiny epsilon only. */
  private static readonly steerEpsilon = 0.01;
  /** How high the recover maneuver lifts the assembly before dropping it. */
  private static readonly resetLiftMeters = 3;
  /** Ground probe span around a car's reset spot (up to catch uphill terrain). */
  private static readonly groundProbeUpMeters = 15;
  private static readonly groundProbeDownMeters = 60;
  /** Max own-body/player/boundary hits the ground probe steps through. */
  private static readonly groundProbeMaxSkips = 8;

  private isPlacing = false;
  private placeTimer = 0;
  /**
   * Every dynamic entity joined to the chassis through the constraint graph
   * (chassis included) — wheels, suspension arms, and towed trailers with
   * their own wheel stacks. Discovered once in OnStart; the recover maneuver
   * teleports and freezes all of them together.
   */
  private resetGroup: Entity[] = [];
  /**
   * Each reset-group node's authored (level-load) world pose expressed
   * relative to the chassis. Reset rebuilds this formation at the chassis's
   * current position and heading, so a jack-knifed train straightens out
   * instead of being carried over in its tangled world arrangement.
   */
  private resetFormation = new Map<Entity, Matrix>();
  /**
   * Which car each reset-group entity belongs to: the chassis or a towed
   * trailer body. Reset raises each car individually to its local ground
   * height, and a car's arms/wheels ride along with their own car.
   */
  private carRootByEntity = new Map<Entity, Entity>();
  /** One entry per wheel slot (see CollectWheelEntities); undefined when unassigned or undrivable. */
  private wheelDrives: (WheelDriveBinding | undefined)[] = [];
  private debounceTime = Date.now();
  /** Current ramped forward speed used by the velocity assist so it doesn't snap. */
  private rampedSpeed = 0;
  /** Per-wheel grounded state aligned with CollectWheelEntities() slot order. */
  private wheelGrounded: boolean[] = [];
  /** Reusable raycast result — must be pooled between calls (BJS V2 physics). */
  private raycastResult = new PhysicsRaycastResult();
  /** Debug line per wheel slot; null entries when debug is off or unassigned. */
  private debugLines: (LinesMesh | null)[] = [];
  /** Scratch vectors and matrix so the per-frame raycast doesn't allocate. */
  private rayStart = new Vector3();
  private rayEnd = new Vector3();
  private rayDirection = new Vector3();
  private rayWorldMatrix = Matrix.Identity();
  /** Reused point array for the CreateLines instance update. */
  private debugPoints: Vector3[] = [new Vector3(), new Vector3()];

  OnStart(): void
  {
    const wheelEntities = this.CollectWheelEntities();
    this.wheelDrives = wheelEntities.map(
      (wheelEntity) => this.ResolveWheelDrive(wheelEntity)
    );
    this.wheelGrounded = wheelEntities.map(() => false);
    this.debugLines = wheelEntities.map(() => null);
    this.resetGroup = this.DiscoverResetGroup();
    this.CaptureResetFormation();
    this.ComputeCarPartition();

    if (this.debugGroundRay)
    {
      this.CreateDebugLines();
    }
  }

  OnUpdate(deltaSeconds: number): void
  {
    const reset = this.vehicle.FindAction("Reset")?.IsPressed() === true;

    // Reset starts the recover sequence (debounced, and ignored while already placing).
    if (reset && !this.isPlacing && Date.now() - this.debounceTime >= 1000)
    {
      this.debounceTime = Date.now();
      this.BeginPlacement();
    }
    // Hold for holdSeconds (always at least one physics step), then switch back to DYNAMIC.
    else if (this.isPlacing)
    {
      this.placeTimer += deltaSeconds;
      if (this.placeTimer >= this.holdSeconds)
      {
        this.EndPlacement();
      }
    }

    const control = this.vehicle.FindAction("Main Control")?.ReadVector2() ?? { x: 0, y: 0 };
    let throttle = control.y;
    let steer = control.x;

    if (this.swapMovement)
    {
      throttle = -throttle;
    }

    if (this.swapSteering)
    {
      steer = -steer;
    }

    // When reversing, steering is relative to the rear of the car — flip sign so
    // the stick still steers toward the direction the front points.
    if (throttle < 0)
    {
      steer = -steer;
    }

    const remapped = this.ApplySteerZone(throttle, steer);
    throttle = remapped.throttle;
    steer = remapped.steer;

    const speeds = this.isPlacing
      ? this.CollectWheelEntities().map(() => 0)
      : this.ComputeWheelSpeeds(throttle, steer);

    // Per-wheel ground rays update debug lines and wheelGrounded[] even while placing.
    const anyWheelGrounded = this.UpdateWheelGroundStates();

    for (let slotIndex = 0; slotIndex < this.wheelDrives.length; slotIndex++)
    {
      const drive = this.wheelDrives[slotIndex];
      if (drive !== undefined)
      {
        const wheelSpeed = this.wheelGrounded[slotIndex] ? speeds[slotIndex] : 0;
        this.SetWheelMotor(drive, wheelSpeed);
      }
    }

    // Cheat: directly nudge the body so the car feels instant rather than
    // waiting for wheel friction → ground reaction → body movement.
    // Only apply assists when at least one wheel is grounded.
    if (!this.isPlacing && anyWheelGrounded)
    {
      this.ApplyVelocityAssist(throttle, steer, deltaSeconds);
    }
  }

  OnDestroy(): void
  {
    for (const debugLine of this.debugLines)
    {
      debugLine?.dispose();
    }
    this.debugLines = [];
  }

  /** Wheel entity slots in hinge order: four corners, outer then inner per corner. */
  private CollectWheelEntities(): (Entity | null)[]
  {
    return [
      this.frontLeftWheel,
      this.frontRightWheel,
      this.rearLeftWheel,
      this.rearRightWheel,
      this.frontLeftInner,
      this.frontRightInner,
      this.rearLeftInner,
      this.rearRightInner,
    ];
  }

  /**
   * In wide left/right stick wedges, bleed throttle and ramp steer toward ±1 so
   * input favors turning over forward/back (tank-style at full lateral).
   */
  private ApplySteerZone(throttle: number, steer: number): { throttle: number; steer: number }
  {
    const steerAbs = Math.abs(steer);
    const axisSum = steerAbs + Math.abs(throttle);
    if (axisSum <= CarController.steerEpsilon)
    {
      return { throttle: 0, steer: 0 };
    }

    const lateralRatio = steerAbs / axisSum;
    const zoneStart = 1 - this.steerZoneWidth;
    if (lateralRatio <= zoneStart)
    {
      return { throttle, steer };
    }

    const zoneBlend = Math.min(1, (lateralRatio - zoneStart) / (1 - zoneStart));
    const priority = zoneBlend * this.steerZonePriority;
    const steerSign = Math.sign(steer);

    return {
      throttle: throttle * (1 - priority),
      steer: steerSign * Math.min(1, steerAbs + priority * (1 - steerAbs)),
    };
  }

  /**
   * Per-wheel motor speeds [FL, FR, RL, RR, FLi, FRi, RLi, RRi]. Each inner/outer
   * pair on a corner shares the same corner speed from ComputeCornerSpeeds().
   */
  private ComputeWheelSpeeds(throttle: number, steer: number): number[]
  {
    const cornerSpeeds = this.ComputeCornerSpeeds(throttle, steer);
    return [
      cornerSpeeds[0],
      cornerSpeeds[1],
      cornerSpeeds[2],
      cornerSpeeds[3],
      cornerSpeeds[0],
      cornerSpeeds[1],
      cornerSpeeds[2],
      cornerSpeeds[3],
    ];
  }

  /**
   * Differential speeds for the four corners [FL, FR, RL, RR]. The outside track
   * spins at full speed; the inside track spins at turnRatio × speed (turnRatio =
   * 1 → all equal, wide arc; 0 → inside locked, sharp pivot). Left/Right alone
   * gives tank controls: inside track spins opposite.
   */
  private ComputeCornerSpeeds(throttle: number, steer: number): number[]
  {
    const throttleDeadzone = CarController.throttleDeadzone;
    const steerEpsilon = CarController.steerEpsilon;
    let direction = 0;
    if (throttle > throttleDeadzone)
    {
      direction = 1;
    }
    else if (throttle < -throttleDeadzone)
    {
      direction = -1;
    }

    const throttleMagnitude = direction !== 0 ? Math.min(1, Math.abs(throttle)) : 0;
    const steerMagnitude = Math.abs(steer);
    const steerSign = steerMagnitude > steerEpsilon ? Math.sign(steer) : 0;
    const turning = steerSign !== 0;
    const turnStrength = Math.min(1, steerMagnitude);

    // Outside track at full speed; direction defaults to +1 for tank-turning.
    const outsideSpeed = (direction !== 0 ? direction : 1)
      * this.speed
      * (direction !== 0 ? throttleMagnitude : 1);

    if (!turning)
    {
      if (direction === 0)
      {
        return [0, 0, 0, 0];
      }

      return [outsideSpeed, outsideSpeed, outsideSpeed, outsideSpeed];
    }

    // Forward/back + turn → inside track same direction, slower (scaled by steer).
    // Turn alone → tank controls: inside track spins opposite.
    const innerScale = direction !== 0
      ? 1 - turnStrength * (1 - this.turnRatio)
      : this.turnRatio * turnStrength;

    const insideSpeed = direction !== 0
      ? outsideSpeed * innerScale
      : -outsideSpeed * innerScale;

    if (steerSign < 0)
    {
      return [insideSpeed, outsideSpeed, insideSpeed, outsideSpeed];
    }
    return [outsideSpeed, insideSpeed, outsideSpeed, insideSpeed];
  }

  /**
   * Resolve the wheel joint: HINGE or CUSTOM 6DoF constraint on the wheel
   * entity (built at load time). CUSTOM wheels must leave one angular axis free
   * (or limited/spring) for the drive motor — typically ANGULAR_X (frame X).
   */
  private ResolveWheelDrive(wheelEntity: Entity | null): WheelDriveBinding | undefined
  {
    if (wheelEntity === null)
    {
      return undefined;
    }

    const constraintRows = wheelEntity.GetAttachmentsOfType("CONSTRAINT");
    let hasNonDrivableConstraint = false;

    for (const row of constraintRows)
    {
      if (!(row.constraint instanceof Physics6DoFConstraint))
      {
        continue;
      }

      const motorAxis = this.ResolveMotorAxis(row.data);
      if (motorAxis === undefined)
      {
        hasNonDrivableConstraint = true;
        continue;
      }

      return { constraint: row.constraint, motorAxis };
    }

    if (hasNonDrivableConstraint)
    {
      console.warn(
        `[${this.entity.name}] "${wheelEntity.name}" has a constraint but no free ` +
        `angular axis for driving (HINGE, or CUSTOM with an unlocked ANGULAR_* axis)`
      );
    }
    else
    {
      console.warn(
        `[${this.entity.name}] "${wheelEntity.name}" has no drivable HINGE/CUSTOM constraint`
      );
    }
    return undefined;
  }

  /** Map authored constraint data to the Physics6DoF motor axis. */
  private ResolveMotorAxis(component: ConstraintComponent): PhysicsConstraintAxis | undefined
  {
    if (component.constraintType === "HINGE")
    {
      return PhysicsConstraintAxis.ANGULAR_X;
    }

    if (component.constraintType !== "CUSTOM")
    {
      return undefined;
    }

    const drivableAngularAxes = (component.axes ?? []).filter(
      (axisConfig) =>
        axisConfig.axis.startsWith("ANGULAR_")
        && axisConfig.mode !== "locked"
    );

    if (drivableAngularAxes.length === 0)
    {
      return undefined;
    }

    const preferred = drivableAngularAxes.find(
      (axisConfig) => axisConfig.axis === "ANGULAR_X"
    );
    const chosen = preferred ?? drivableAngularAxes[0];
    return CONSTRAINT_AXIS_MAP[chosen.axis];
  }

  /** Drive a 6DoF joint motor at the given speed (degrees per second). */
  private SetWheelMotor(
    drive: WheelDriveBinding,
    speedDegreesPerSecond: number
  ): void
  {
    const { constraint, motorAxis } = drive;

    if (speedDegreesPerSecond === 0)
    {
      constraint.setAxisMotorTarget(motorAxis, 0);
      return;
    }

    constraint.setAxisMotorType(motorAxis, PhysicsConstraintMotorType.VELOCITY);
    constraint.setAxisMotorTarget(motorAxis, speedDegreesPerSecond * (Math.PI / 180));
    constraint.setAxisMotorMaxForce(motorAxis, this.force);
  }

  /**
   * Begin the recover maneuver: freeze the whole constraint island as ANIMATED
   * (kinematic) bodies, then rebuild the authored formation at the chassis's
   * current position and heading — every trailer, arm, and wheel gets its own
   * individual target pose from the load-time snapshot, so a tangled train
   * straightens out instead of teleporting in its current world arrangement.
   * The authored poses are the ones the constraints were built in, so they
   * see ~zero error and never fire corrective impulses. Kinematic bodies
   * ignore gravity, so the island holds until EndPlacement.
   */
  private BeginPlacement(): void
  {
    const chassisEntity = this.body;
    if (chassisEntity === null || chassisEntity.body === undefined)
    {
      return;
    }

    this.isPlacing = true;
    this.placeTimer = 0;

    const placementGroup = this.resetGroup.length > 0 ? this.resetGroup : [chassisEntity];
    const chassisTargetWorld = this.ComputeChassisTargetWorld(chassisEntity);

    for (const groupEntity of placementGroup)
    {
      const groupBody = groupEntity.body;
      if (groupBody === undefined)
      {
        continue;
      }

      groupBody.setMotionType(PhysicsMotionType.ANIMATED);
      // disablePreStep = false lets the next pre-step copy each node transform into its body.
      groupBody.disablePreStep = false;
      groupBody.setLinearVelocity(Vector3.Zero());
      groupBody.setAngularVelocity(Vector3.Zero());
    }

    this.ApplyResetFormation(placementGroup, chassisTargetWorld);
  }

  /**
   * Snapshot every reset-group node's world pose relative to the chassis at
   * level load, when the train sits in its authored (untangled) formation.
   */
  private CaptureResetFormation(): void
  {
    const chassisEntity = this.body;
    if (chassisEntity === null || this.resetGroup.length === 0)
    {
      return;
    }

    const chassisWorldInverse = new Matrix();
    chassisEntity.node.computeWorldMatrix(true).invertToRef(chassisWorldInverse);

    this.resetFormation.clear();
    for (const groupEntity of this.resetGroup)
    {
      this.resetFormation.set(
        groupEntity,
        groupEntity.node.computeWorldMatrix(true).multiply(chassisWorldInverse)
      );
    }
  }

  /**
   * The chassis's reset pose: lifted resetLiftMeters straight up from its
   * current position, pitch/roll zeroed, yaw preserved so the car keeps its
   * heading. The captured formation is rebuilt around this pose.
   */
  private ComputeChassisTargetWorld(chassisEntity: Entity): Matrix
  {
    const chassisWorld = chassisEntity.node.computeWorldMatrix(true);

    const worldScale = new Vector3();
    const worldRotation = new Quaternion();
    const worldPosition = new Vector3();
    chassisWorld.decompose(worldScale, worldRotation, worldPosition);

    // This car model uses +Z as forward (see ApplyVelocityAssist). Flatten the
    // forward vector onto the ground plane to keep only the heading; when the
    // car points straight up/down the heading is undefined — fall back to identity.
    const forward = Vector3.TransformNormal(new Vector3(0, 0, 1), chassisWorld);
    forward.y = 0;
    const yawRotation = forward.lengthSquared() > 1e-6
      ? Quaternion.RotationAxis(Vector3.Up(), Math.atan2(forward.x, forward.z))
      : Quaternion.Identity();

    const targetPosition = worldPosition.add(
      new Vector3(0, CarController.resetLiftMeters, 0)
    );
    return Matrix.Compose(worldScale, yawRotation, targetPosition);
  }

  /**
   * Place every group node at its authored chassis-relative pose, re-rooted on
   * the chassis target, in two phases: compute all target world matrices
   * first, then write them back as local transforms against each parent's
   * predicted (or unchanged) world matrix. Nodes missing from the formation
   * snapshot fall back to riding along rigidly at the chassis target.
   */
  private ApplyResetFormation(placementGroup: Entity[], chassisTargetWorld: Matrix): void
  {
    const newWorldByNode = new Map<Node, Matrix>();
    for (const groupEntity of placementGroup)
    {
      const relativeToChassis = this.resetFormation.get(groupEntity) ?? Matrix.Identity();
      newWorldByNode.set(
        groupEntity.node,
        relativeToChassis.multiply(chassisTargetWorld)
      );
    }

    const localScale = new Vector3();
    const localPosition = new Vector3();

    for (const groupEntity of placementGroup)
    {
      const groupNode = groupEntity.node;
      const newWorld = newWorldByNode.get(groupNode) as Matrix;

      const parentNode = groupNode.parent;
      if (parentNode !== null)
      {
        const parentWorld = newWorldByNode.get(parentNode) ?? parentNode.getWorldMatrix();
        const parentInverse = new Matrix();
        parentWorld.invertToRef(parentInverse);
        newWorld.multiplyToRef(parentInverse, newWorld);
      }

      // Fresh quaternion per node — the node keeps the reference we hand it.
      // rotationQuaternion overrides Euler rotation for both the renderer and physics.
      const localRotation = new Quaternion();
      newWorld.decompose(localScale, localRotation, localPosition);
      groupNode.position.copyFrom(localPosition);
      groupNode.rotationQuaternion = localRotation;
    }
  }

  /**
   * Flood-fill the constraint graph outward from the chassis to find every
   * dynamic body transitively joined to it. Constraint rows live on their
   * owner entity with the target stored as an entity id, so edges are walked
   * in both directions. Non-dynamic bodies (static anchors) are never entered
   * or crossed — teleporting those would move world geometry.
   */
  private DiscoverResetGroup(): Entity[]
  {
    const chassisEntity = this.body;
    if (chassisEntity === null || chassisEntity.body === undefined)
    {
      return [];
    }

    const entitiesById = this.CollectPhysicsEntities();
    const neighborsById = this.BuildConstraintAdjacency(entitiesById);

    const visitedIds = new Set<string>([chassisEntity.id]);
    const group: Entity[] = [chassisEntity];
    const frontier: string[] = [chassisEntity.id];

    while (frontier.length > 0)
    {
      const currentId = frontier.pop() as string;
      for (const neighborId of neighborsById.get(currentId) ?? [])
      {
        if (visitedIds.has(neighborId))
        {
          continue;
        }
        visitedIds.add(neighborId);

        const neighborEntity = entitiesById.get(neighborId);
        if (neighborEntity === undefined || neighborEntity.body === undefined)
        {
          continue;
        }
        if (neighborEntity.body.getMotionType() !== PhysicsMotionType.DYNAMIC)
        {
          continue;
        }

        group.push(neighborEntity);
        frontier.push(neighborId);
      }
    }

    return group;
  }

  /** Every entity in the scene that owns a physics body, keyed by entity id. */
  private CollectPhysicsEntities(): Map<string, Entity>
  {
    const entitiesById = new Map<string, Entity>();
    const sceneNodes = [...this.scene.transformNodes, ...this.scene.meshes];

    for (const sceneNode of sceneNodes)
    {
      const metadata = sceneNode.metadata as { bjsEntity?: Entity } | null | undefined;
      const nodeEntity = metadata?.bjsEntity;
      if (nodeEntity !== undefined && nodeEntity !== null && nodeEntity.body !== undefined)
      {
        entitiesById.set(nodeEntity.id, nodeEntity);
      }
    }

    return entitiesById;
  }

  /** Undirected adjacency (entity id → neighbor ids) built from CONSTRAINT attachments. */
  private BuildConstraintAdjacency(entitiesById: Map<string, Entity>): Map<string, string[]>
  {
    const neighborsById = new Map<string, string[]>();
    const addEdge = (fromId: string, toId: string): void => {
      const neighbors = neighborsById.get(fromId);
      if (neighbors !== undefined)
      {
        neighbors.push(toId);
      }
      else
      {
        neighborsById.set(fromId, [toId]);
      }
    };

    for (const physicsEntity of entitiesById.values())
    {
      for (const constraintRow of physicsEntity.GetAttachmentsOfType("CONSTRAINT"))
      {
        const targetId = constraintRow.data.target;
        if (targetId === null || targetId === undefined)
        {
          continue;
        }
        addEdge(physicsEntity.id, targetId);
        addEdge(targetId, physicsEntity.id);
      }
    }

    return neighborsById;
  }

  /**
   * Cheat layer: directly override the body's forward and yaw velocity so the
   * car responds instantly to input instead of waiting for wheel friction to
   * push it.  Only the forward/back component of linear velocity and the yaw
   * (Y) component of angular velocity are overridden — other components
   * (sideways drift, pitch/roll from terrain) are left alone.
   */
  private ApplyVelocityAssist(throttle: number, steer: number, deltaSeconds: number): void
  {
    if (!this.body || this.velocityAssist === 0 && this.angularAssist === 0)
    {
      return;
    }

    const physicsBody = this.body.body;
    if (!physicsBody)
    {
      return;
    }

    const currentLinear = physicsBody.getLinearVelocity();
    const currentAngular = physicsBody.getAngularVelocity();

    // Forward direction in world space — this car model uses +Z as forward.
    const forward = new Vector3(0, 0, 1);
    Vector3.TransformNormalToRef(forward, this.body.node.getWorldMatrix(), forward);

    // Throttle direction respects swapMovement (already flipped in caller).
    const throttleDeadzone = CarController.throttleDeadzone;
    let direction = 0;
    if (throttle > throttleDeadzone) direction = 1;
    else if (throttle < -throttleDeadzone) direction = -1;

    if (this.velocityAssist > 0)
    {
      const magnitude = direction !== 0 ? Math.min(1, Math.abs(throttle)) : 0;
      const targetSpeed = direction * this.velocityAssist * magnitude;

      // Ramp the desired forward speed smoothly toward the target.
      if (this.velocityRampSeconds > 0)
      {
        const blendFactor = 1 - Math.exp(-deltaSeconds / this.velocityRampSeconds);
        this.rampedSpeed += (targetSpeed - this.rampedSpeed) * blendFactor;
      }
      else
      {
        this.rampedSpeed = targetSpeed;
      }

      // Strip the existing forward component, then add the ramped one.
      const currentForward = Vector3.Dot(currentLinear, forward);
      const assistDelta = this.rampedSpeed - currentForward;
      currentLinear.x += assistDelta * forward.x;
      currentLinear.y += assistDelta * forward.y;
      currentLinear.z += assistDelta * forward.z;

      physicsBody.setLinearVelocity(currentLinear);
    }

    if (this.angularAssist > 0)
    {
      const steerEpsilon = CarController.steerEpsilon;
      if (Math.abs(steer) > steerEpsilon)
      {
        // Override yaw (Y) angular velocity; keep pitch/roll untouched.
        const targetYawRad = steer * this.angularAssist * (Math.PI / 180);
        currentAngular.y = targetYawRad;
        physicsBody.setAngularVelocity(currentAngular);
      }
    }
  }

  /**
   * Raycast each assigned wheel from its world position along the body mesh's
   * local down axis and refresh wheelGrounded[]. Returns true when at least
   * one wheel hits ground.
   */
  private UpdateWheelGroundStates(): boolean
  {
    const wheelEntities = this.CollectWheelEntities();
    let anyWheelGrounded = false;

    for (let slotIndex = 0; slotIndex < wheelEntities.length; slotIndex++)
    {
      const wheelEntity = wheelEntities[slotIndex];
      if (wheelEntity === null)
      {
        this.wheelGrounded[slotIndex] = false;
        continue;
      }

      const grounded = this.RaycastWheelGround(wheelEntity);
      this.wheelGrounded[slotIndex] = grounded;
      if (grounded)
      {
        anyWheelGrounded = true;
      }

      if (this.debugGroundRay)
      {
        this.UpdateDebugLine(slotIndex, grounded);
      }
    }

    return anyWheelGrounded;
  }

  /**
   * Cast a ray from the wheel's world position along the body mesh's local down
   * axis so spinning wheels don't skew the direction. Returns true when the
   * ray intersects any collider within groundRaycastDistance.
   */
  private RaycastWheelGround(wheelEntity: Entity): boolean
  {
    const wheelMatrix = wheelEntity.node.getWorldMatrix();
    this.rayStart.set(
      wheelMatrix.m[12],
      wheelMatrix.m[13],
      wheelMatrix.m[14]
    );

    const orientationNode = this.body?.node ?? this.node;
    this.rayWorldMatrix.copyFrom(orientationNode.getWorldMatrix());
    this.rayDirection.set(0, -1, 0);
    Vector3.TransformNormalToRef(this.rayDirection, this.rayWorldMatrix, this.rayDirection);
    this.rayEnd.copyFrom(this.rayStart);
    this.rayEnd.addInPlace(this.rayDirection.scale(this.groundRaycastDistance));

    // getPhysicsEngine() is typed as IPhysicsEngine, which omits raycastToRef
    // even though the Havok-backed engine implements it at runtime.
    const physicsEngine = this.scene.getPhysicsEngine() as
      | { raycastToRef: (from: Vector3, to: Vector3, result: PhysicsRaycastResult) => void }
      | null
      | undefined;
    physicsEngine?.raycastToRef(
      this.rayStart,
      this.rayEnd,
      this.raycastResult
    );

    let grounded = this.raycastResult.hasHit;

    if (grounded)
    {
      const hitBody = this.raycastResult.body;

      // The player can't count as ground.  Note this is a post-hit rejection, not a
      // true exclusion: raycastToRef's 4th argument is an IRaycastQuery of collision
      // bitmasks, not a body list, so there's no way to skip a specific body without
      // putting the player in its own filter group.  If the player is standing
      // between the car and the ground this will read as airborne for a frame.
      if (this.playerEntity?.body && hitBody === this.playerEntity.body)
      {
        grounded = false;
      }

      // Level boundary colliders are invisible walls — treat them as a miss.
      if (grounded && hitBody !== null && hitBody !== undefined)
      {
        const metadata = hitBody.transformNode?.metadata as { bjsEntity?: Entity } | undefined;
        const hitEntity = metadata?.bjsEntity;
        if (hitEntity !== null && hitEntity !== undefined && hitEntity.tag === "levelboundary")
        {
          grounded = false;
        }
      }
    }

    return grounded;
  }

  /**
   * Create one debug line per wheel slot.  Two details matter here:
   *  - `updatable: true` is required for the CreateLines instance update below.
   *  - `alwaysSelectAsActiveMesh` skips frustum culling.  The mesh's bounding
   *    info is computed at creation and never refreshed when we move the
   *    vertices, so without this it gets culled the moment the car leaves the
   *    area the bounding box was built around.
   */
  private CreateDebugLines(): void
  {
    const wheelEntities = this.CollectWheelEntities();

    for (let slotIndex = 0; slotIndex < wheelEntities.length; slotIndex++)
    {
      if (wheelEntities[slotIndex] === null || this.debugLines[slotIndex] !== null)
      {
        continue;
      }

      const debugLine = MeshBuilder.CreateLines(
        `groundRaycastDebug_${slotIndex}`,
        {
          points: [Vector3.Zero(), Vector3.Zero()],
          updatable: true,
        },
        this.scene
      );

      debugLine.alwaysSelectAsActiveMesh = true;
      debugLine.isPickable = false;
      // NOTE: isEnabled is a *method* on Node — `mesh.isEnabled = true` shadows it
      // with a boolean and Babylon throws when it later calls mesh.isEnabled().
      // Use setEnabled() if you ever need to toggle it.
      debugLine.setEnabled(true);
      this.debugLines[slotIndex] = debugLine;
    }
  }

  /**
   * Move one wheel's debug line onto the current ray and recolor it.  Uses the
   * CreateLines `instance` overload rather than setVerticesData so Babylon
   * updates the vertex buffer through its own path.  Color comes from
   * LinesMesh.color, not a vertex-color buffer — LinesMesh bakes its
   * useVertexColor define at construction, so a colors buffer added afterwards
   * is ignored by the shader.
   */
  private UpdateDebugLine(slotIndex: number, grounded: boolean): void
  {
    if (this.debugLines[slotIndex] === null)
    {
      this.CreateDebugLines();
    }

    let debugLine = this.debugLines[slotIndex];
    if (debugLine === null)
    {
      return;
    }

    const endPoint = grounded ? this.raycastResult.hitPointWorld : this.rayEnd;
    this.debugPoints[0].copyFrom(this.rayStart);
    this.debugPoints[1].copyFrom(endPoint);

    debugLine = MeshBuilder.CreateLines(
      `groundRaycastDebug_${slotIndex}`,
      {
        points: this.debugPoints,
        instance: debugLine,
      },
      this.scene
    );

    debugLine.color = grounded ? Color3.Green() : Color3.Red();
    this.debugLines[slotIndex] = debugLine;
  }

  /**
   * End the recover maneuver: hand the whole island back to physics from rest.
   * The per-body order matters — re-enable disablePreStep FIRST so the
   * pre-step stops deriving a velocity from the teleport, then switch to
   * DYNAMIC, then zero velocity last so everything falls from rest in
   * formation instead of slamming.
   */
  private EndPlacement(): void
  {
    const chassisEntity = this.body;
    if (chassisEntity === null || chassisEntity.body === undefined)
    {
      return;
    }

    this.isPlacing = false;

    const placementGroup = this.resetGroup.length > 0 ? this.resetGroup : [chassisEntity];

    for (const groupEntity of placementGroup)
    {
      const groupBody = groupEntity.body;
      if (groupBody === undefined)
      {
        continue;
      }

      groupBody.disablePreStep = true;
      groupBody.setMotionType(PhysicsMotionType.DYNAMIC);
      groupBody.setLinearVelocity(Vector3.Zero());
      groupBody.setAngularVelocity(Vector3.Zero());
    }
  }
}
