import { Behavior, exposed, inputMap, type Entity } from "@bjs/engine";
import type { ConstraintAxisName, ConstraintComponent, InputActionMap } from "@bjs/engine";
import {
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  Quaternion,
  Vector3,
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
 * maneuver on the Reset action: it lifts the body, straightens it to zero
 * rotation, holds briefly, then automatically hands control back to physics so
 * the car drops upright from rest.
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

  @exposed({ label: "Body", type: "entity" })
  body: Entity | null = null;

  @inputMap("Player") player!: InputActionMap;

  private isPlacing = false;
  private placeTimer = 0;
  /** One entry per wheel slot (see CollectWheelEntities); undefined when unassigned or undrivable. */
  private wheelDrives: (WheelDriveBinding | undefined)[] = [];
  private debounceTime = Date.now();

  OnStart(): void
  {
    this.wheelDrives = this.CollectWheelEntities().map(
      (wheelEntity) => this.ResolveWheelDrive(wheelEntity)
    );
  }

  OnUpdate(deltaSeconds: number): void
  {
    const reset = this.player.FindAction("Reset")?.IsPressed() === true;

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

    let forward = this.player.FindAction("Forward")?.IsPressed() === true;
    let backward = this.player.FindAction("Backward")?.IsPressed() === true;
    let left = this.player.FindAction("Left")?.IsPressed() === true;
    let right = this.player.FindAction("Right")?.IsPressed() === true;

    if (this.swapMovement)
    {
      const swapForward = forward;
      forward = backward;
      backward = swapForward;
    }

    if (this.swapSteering)
    {
      const swapLeft = left;
      left = right;
      right = swapLeft;
    }

    const speeds = this.isPlacing
      ? this.CollectWheelEntities().map(() => 0)
      : this.ComputeWheelSpeeds(forward, backward, left, right);

    for (let slotIndex = 0; slotIndex < this.wheelDrives.length; slotIndex++)
    {
      const drive = this.wheelDrives[slotIndex];
      if (drive !== undefined)
      {
        this.SetWheelMotor(drive, speeds[slotIndex]);
      }
    }
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
   * Per-wheel motor speeds [FL, FR, RL, RR, FLi, FRi, RLi, RRi]. Each inner/outer
   * pair on a corner shares the same corner speed from ComputeCornerSpeeds().
   */
  private ComputeWheelSpeeds(
    forward: boolean,
    backward: boolean,
    left: boolean,
    right: boolean
  ): number[]
  {
    const cornerSpeeds = this.ComputeCornerSpeeds(forward, backward, left, right);
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
  private ComputeCornerSpeeds(
    forward: boolean,
    backward: boolean,
    left: boolean,
    right: boolean
  ): number[]
  {
    let direction = 0;
    if (forward)
    {
      direction = 1;
    }
    else if (backward)
    {
      direction = -1;
    }

    const turning = left || right;

    // Outside track at full speed; direction defaults to +1 for tank-turning.
    const outsideSpeed = (direction !== 0 ? direction : 1) * this.speed;

    if (!turning)
    {
      if (direction === 0)
      {
        return [0, 0, 0, 0];
      }

      return [outsideSpeed, outsideSpeed, outsideSpeed, outsideSpeed];
    }

    // Forward/back + turn → inside track same direction, slower.
    // Turn alone → tank controls: inside track spins opposite.
    const insideSpeed = direction !== 0
      ? outsideSpeed * this.turnRatio
      : -outsideSpeed * this.turnRatio;

    if (left)
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
   * Begin the recover maneuver: switch the body to ANIMATED (kinematic), lift it
   * 10 units, and reset all rotations to zero so it will drop upright. Kinematic
   * bodies ignore gravity, so it holds in place until EndPlacement runs.
   */
  private BeginPlacement(): void
  {
    const body = this.body?.body;
    if (body === undefined || this.body === null)
    {
      return;
    }

    this.isPlacing = true;
    this.placeTimer = 0;

    const target = this.body.node.position.add(new Vector3(0, 3, 0));

    body.setMotionType(PhysicsMotionType.ANIMATED);
    // disablePreStep = false lets the next pre-step copy the node transform into the body.
    body.disablePreStep = false;

    // Lift, and zero all rotations (identity quaternion = no rotation).
    // rotationQuaternion overrides Euler rotation for both the renderer and physics.
    this.body.node.position.copyFrom(target);
    this.body.node.rotationQuaternion = Quaternion.Identity();

    body.setLinearVelocity(Vector3.Zero());
    body.setAngularVelocity(Vector3.Zero());
  }

  /**
   * End the recover maneuver: hand control back to physics from rest. The order
   * matters — re-enable disablePreStep FIRST so the pre-step stops deriving a
   * velocity from the teleport, then switch to DYNAMIC, then zero velocity last
   * so the car falls from rest instead of slamming.
   */
  private EndPlacement(): void
  {
    const body = this.body?.body;
    if (body === undefined || this.body === null)
    {
      return;
    }

    this.isPlacing = false;

    body.disablePreStep = true;
    body.setMotionType(PhysicsMotionType.DYNAMIC);
    body.setLinearVelocity(Vector3.Zero());
    body.setAngularVelocity(Vector3.Zero());
  }
}
