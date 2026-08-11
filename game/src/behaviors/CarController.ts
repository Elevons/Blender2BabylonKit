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
  type PhysicsBody,
} from "@babylonjs/core";

/** Runtime handle for one wheel's driven 6DoF joint (HINGE or CUSTOM). */
interface WheelDriveBinding
{
  constraint: Physics6DoFConstraint;
  motorAxis: PhysicsConstraintAxis;
}

/** Ground under one car from a world-down Havok ray. */
interface CarGroundHit
{
  car: Entity;
  point: Vector3;
  normal: Vector3;
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
 * (outer + inner per corner) from input, with optional velocity/angular assists
 * and per-wheel ground raycasts that gate motors when airborne. Reset freezes
 * the Body and Other Cars bodies, aligns each to its world-down ground normal,
 * lifts them along that normal, holds for Place Hold, then releases to DYNAMIC.
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

  /**
   * How far to lift each car along its ground-hit normal during Reset, after
   * aligning the body to that surface.
   */
  @exposed({ min: 0, max: 20, label: "Reset Lift (m)" })
  resetLiftMeters = 3;

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
   * Main body of each towed / companion car. Pick the rigid-body entities in
   * Blender; their PhysicsBody is available at runtime via `entity.body`.
   */
  @exposed({ type: "list", of: "entity", label: "Other Cars" })
  otherCars: (Entity | null)[] = [];

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

  /**
   * How far (meters) below each car body to search for ground with a
   * world-down ray. Used for the Body + Other Cars probes, not the wheels.
   */
  @exposed({ min: 1, max: 200, label: "Car Ground Probe Distance (m)" })
  carGroundProbeDistance = 50;

  @inputMap("Vehicle") vehicle!: InputActionMap;

  private static readonly throttleDeadzone = 0.15;
  /** Steer is already deadzoned in bindings; keep a tiny epsilon only. */
  private static readonly steerEpsilon = 0.01;
  /** Max own-body / player / boundary hits the car ground probe steps through. */
  private static readonly carGroundProbeMaxSkips = 8;

  private isPlacing = false;
  private placeTimer = 0;
  private debounceTime = Date.now();
  /** One entry per wheel slot (see CollectWheelEntities); undefined when unassigned or undrivable. */
  private wheelDrives: (WheelDriveBinding | undefined)[] = [];
  /** Current ramped forward speed used by the velocity assist so it doesn't snap. */
  private rampedSpeed = 0;
  /** Per-wheel grounded state aligned with CollectWheelEntities() slot order. */
  private wheelGrounded: boolean[] = [];
  /**
   * Latest world-down ground hit per car (Body + Other Cars), same order as
   * CollectCarEntities(). Undefined when that car's probe misses.
   */
  private carGroundHits: (CarGroundHit | undefined)[] = [];
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
    this.carGroundHits = this.CollectCarEntities().map(() => undefined);

    if (this.debugGroundRay)
    {
      this.CreateDebugLines();
    }
  }

  OnUpdate(deltaSeconds: number): void
  {
    this.UpdateCarGroundHits();

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
   * Car bodies to probe: the exposed Body (main chassis), then every non-null
   * Other Cars pick. The script host is skipped — it is often the player, not
   * a vehicle. Duplicates of Body are skipped.
   */
  private CollectCarEntities(): Entity[]
  {
    const cars: Entity[] = [];
    const seenIds = new Set<string>();

    if (this.body !== null)
    {
      cars.push(this.body);
      seenIds.add(this.body.id);
    }

    for (const otherCar of this.otherCars)
    {
      if (otherCar === null || seenIds.has(otherCar.id))
      {
        continue;
      }
      seenIds.add(otherCar.id);
      cars.push(otherCar);
    }

    return cars;
  }

  /**
   * World-down ground probe for every car in CollectCarEntities(). Writes
   * carGroundHits in the same order — undefined when that car has no ground.
   */
  private UpdateCarGroundHits(): void
  {
    const carEntities = this.CollectCarEntities();
    if (this.carGroundHits.length !== carEntities.length)
    {
      this.carGroundHits = carEntities.map(() => undefined);
    }

    const ignoredBodies = new Set<PhysicsBody>();
    for (const carEntity of carEntities)
    {
      if (carEntity.body !== undefined)
      {
        ignoredBodies.add(carEntity.body);
      }
    }

    for (let carIndex = 0; carIndex < carEntities.length; carIndex++)
    {
      this.carGroundHits[carIndex] = this.ProbeCarGround(
        carEntities[carIndex],
        ignoredBodies
      );
    }
  }

  /**
   * Cast straight down in world space from the car's world position and return
   * the first real ground hit. The physics ray API reports only the closest
   * hit, so car bodies, the player, and level-boundary walls are stepped
   * through by re-casting from just below each ignored hit.
   */
  private ProbeCarGround(
    carEntity: Entity,
    ignoredBodies: Set<PhysicsBody>
  ): CarGroundHit | undefined
  {
    // getPhysicsEngine() is typed as IPhysicsEngine, which omits raycastToRef
    // even though the Havok-backed engine implements it at runtime.
    const physicsEngine = this.scene.getPhysicsEngine() as
      | { raycastToRef: (from: Vector3, to: Vector3, result: PhysicsRaycastResult) => void }
      | null
      | undefined;
    // Babylon Nullable: can be undefined at runtime, so test truthiness.
    if (!physicsEngine)
    {
      return undefined;
    }

    const carWorld = carEntity.node.getWorldMatrix();
    const originX = carWorld.m[12];
    const originY = carWorld.m[13];
    const originZ = carWorld.m[14];

    this.rayStart.set(originX, originY, originZ);
    this.rayEnd.set(originX, originY - this.carGroundProbeDistance, originZ);

    for (let skipCount = 0; skipCount <= CarController.carGroundProbeMaxSkips; skipCount++)
    {
      physicsEngine.raycastToRef(this.rayStart, this.rayEnd, this.raycastResult);
      if (!this.raycastResult.hasHit)
      {
        return undefined;
      }

      const hitBody = this.raycastResult.body;
      const hitPoint = this.raycastResult.hitPointWorld;
      const hitNormal = this.raycastResult.hitNormalWorld;

      const isOwnBody =
        hitBody !== null && hitBody !== undefined && ignoredBodies.has(hitBody);
      const isPlayer =
        this.playerEntity?.body !== undefined && hitBody === this.playerEntity.body;
      const hitMetadata = hitBody?.transformNode?.metadata as { bjsEntity?: Entity } | undefined;
      const isBoundary = hitMetadata?.bjsEntity?.tag === "levelboundary";

      if (!isOwnBody && !isPlayer && !isBoundary)
      {
        return {
          car: carEntity,
          point: new Vector3(hitPoint.x, hitPoint.y, hitPoint.z),
          normal: new Vector3(hitNormal.x, hitNormal.y, hitNormal.z),
        };
      }

      this.rayStart.set(hitPoint.x, hitPoint.y - 0.05, hitPoint.z);
      if (this.rayStart.y <= this.rayEnd.y)
      {
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Begin recover: freeze car bodies, align each to its ground-hit normal, and
   * lift them along that normal. Bodies stay kinematic until EndPlacement.
   */
  private BeginPlacement(): void
  {
    this.isPlacing = true;
    this.placeTimer = 0;
    this.DisableCarRigidBodies();
    this.AlignAndLiftCarsAlongGroundNormals();
  }

  /**
   * End the recover hold: hand every car body back to physics from rest.
   * Order matters — re-enable disablePreStep first so the pre-step stops
   * deriving velocity from any teleport, then DYNAMIC, then zero velocity.
   */
  private EndPlacement(): void
  {
    this.isPlacing = false;
    this.EnableCarRigidBodies();
  }

  /**
   * Freeze each car body (Body + Other Cars) as ANIMATED with
   * disablePreStep = false so later node teleports copy into Havok, and
   * clear linear/angular velocity so nothing keeps drifting.
   */
  private DisableCarRigidBodies(): void
  {
    for (const carEntity of this.CollectCarEntities())
    {
      const physicsBody = carEntity.body;
      if (physicsBody === undefined)
      {
        continue;
      }

      physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
      // disablePreStep = false lets the next pre-step copy the node transform into the body.
      physicsBody.disablePreStep = false;
      physicsBody.setLinearVelocity(Vector3.Zero());
      physicsBody.setAngularVelocity(Vector3.Zero());
    }
  }

  /**
   * Restore each car body to DYNAMIC from rest. disablePreStep is re-enabled
   * first so a prior teleport cannot inject a derived velocity on the next step.
   */
  private EnableCarRigidBodies(): void
  {
    for (const carEntity of this.CollectCarEntities())
    {
      const physicsBody = carEntity.body;
      if (physicsBody === undefined)
      {
        continue;
      }

      physicsBody.disablePreStep = true;
      physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
      physicsBody.setLinearVelocity(Vector3.Zero());
      physicsBody.setAngularVelocity(Vector3.Zero());
    }
  }

  /**
   * For each car with a ground hit: align its up axis to the surface normal
   * (heading preserved), then translate resetLiftMeters along that normal.
   * Cars with no hit are left where they were when frozen.
   */
  private AlignAndLiftCarsAlongGroundNormals(): void
  {
    const carEntities = this.CollectCarEntities();

    for (let carIndex = 0; carIndex < carEntities.length; carIndex++)
    {
      const groundHit = this.carGroundHits[carIndex];
      if (groundHit === undefined)
      {
        continue;
      }

      const carEntity = carEntities[carIndex];
      const carWorld = carEntity.node.computeWorldMatrix(true);

      const worldScale = new Vector3();
      const worldRotation = new Quaternion();
      const worldPosition = new Vector3();
      carWorld.decompose(worldScale, worldRotation, worldPosition);

      const surfaceNormal = groundHit.normal.normalizeToNew();
      const alignedRotation = this.ComputeSurfaceAlignedRotation(
        carWorld,
        surfaceNormal,
        worldRotation
      );

      worldPosition.addInPlace(surfaceNormal.scale(this.resetLiftMeters));
      this.SetCarWorldPose(carEntity, worldScale, alignedRotation, worldPosition);
    }
  }

  /**
   * Rotation whose up axis matches the ground normal while the car keeps its
   * heading: forward is projected onto the surface plane and a right-handed
   * basis is rebuilt around the normal. Falls back to the current rotation
   * for walls/overhangs or when heading is parallel to the normal.
   */
  private ComputeSurfaceAlignedRotation(
    carWorld: Matrix,
    groundNormal: Vector3,
    fallbackRotation: Quaternion
  ): Quaternion
  {
    if (groundNormal.lengthSquared() < 1e-6)
    {
      return fallbackRotation;
    }

    const upAxis = groundNormal.normalizeToNew();
    if (upAxis.y < 0.2)
    {
      return fallbackRotation;
    }

    // This car model uses +Z as forward (see ApplyVelocityAssist).
    const forwardHeading = Vector3.TransformNormal(new Vector3(0, 0, 1), carWorld);
    const projectedForward = forwardHeading.subtract(
      upAxis.scale(Vector3.Dot(forwardHeading, upAxis))
    );
    if (projectedForward.lengthSquared() < 1e-6)
    {
      return fallbackRotation;
    }
    projectedForward.normalize();

    const rightAxis = Vector3.Cross(upAxis, projectedForward);
    rightAxis.normalize();

    return Quaternion.RotationQuaternionFromAxis(rightAxis, upAxis, projectedForward);
  }

  /**
   * Write a world pose onto a car node as a local transform, accounting for
   * a parent when present so nested nodes are not double-transformed.
   */
  private SetCarWorldPose(
    carEntity: Entity,
    worldScale: Vector3,
    worldRotation: Quaternion,
    worldPosition: Vector3
  ): void
  {
    const carNode = carEntity.node;
    let localMatrix = Matrix.Compose(worldScale, worldRotation, worldPosition);

    const parentNode = carNode.parent;
    if (parentNode !== null)
    {
      const parentInverse = new Matrix();
      parentNode.computeWorldMatrix(true).invertToRef(parentInverse);
      localMatrix = localMatrix.multiply(parentInverse);
    }

    const localScale = new Vector3();
    const localRotation = new Quaternion();
    const localPosition = new Vector3();
    localMatrix.decompose(localScale, localRotation, localPosition);

    carNode.position.copyFrom(localPosition);
    // rotationQuaternion overrides Euler rotation for both the renderer and physics.
    carNode.rotationQuaternion = localRotation;
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
}
