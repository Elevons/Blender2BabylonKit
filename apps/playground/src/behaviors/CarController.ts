import { Behavior, exposed, inputMap, type Entity } from "@bjs/engine";
import type { InputActionMap } from "@bjs/engine";
import {
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
} from "@babylonjs/core";

/**
 * CarController applies motor speeds to wheels based on input.
 * Finds the HINGE constraint attachment on each wheel entity and drives its motor.
 */
export default class CarController extends Behavior
{
  @exposed({ label: "Front Left Wheel", type: "entity" })
  frontLeftWheel: Entity | null = null;

  @exposed({ label: "Front Right Wheel", type: "entity" })
  frontRightWheel: Entity | null = null;

  @exposed({ label: "Rear Left Wheel", type: "entity" })
  rearLeftWheel: Entity | null = null;

  @exposed({ label: "Rear Right Wheel", type: "entity" })
  rearRightWheel: Entity | null = null;

  @exposed({ min: 0, max: 100, label: "Motor Speed" })
  speed = 10;

  @exposed({ min: 0, max: 1000, label: "Motor Force" })
  force = 100;

  @inputMap("Player") player!: InputActionMap;

  private frontLeftHinge?: Physics6DoFConstraint;
  private frontRightHinge?: Physics6DoFConstraint;
  private rearLeftHinge?: Physics6DoFConstraint;
  private rearRightHinge?: Physics6DoFConstraint;

  OnStart(): void
  {
    this.frontLeftHinge = this.ResolveWheelHinge(this.frontLeftWheel);
    this.frontRightHinge = this.ResolveWheelHinge(this.frontRightWheel);
    this.rearLeftHinge = this.ResolveWheelHinge(this.rearLeftWheel);
    this.rearRightHinge = this.ResolveWheelHinge(this.rearRightWheel);
  }

  OnUpdate(_deltaSeconds: number): void
  {
    // These actions are added to the input system by the user.
    const forward = this.player.FindAction("Forward")?.IsPressed() === true;
    const backward = this.player.FindAction("Backward")?.IsPressed() === true;
    const left = this.player.FindAction("Left")?.IsPressed() === true;
    const right = this.player.FindAction("Right")?.IsPressed() === true;

    let flSpeed = 0;
    let frSpeed = 0;
    let rlSpeed = 0;
    let rrSpeed = 0;

    if (forward)
    {
      flSpeed = -this.speed;
      frSpeed = -this.speed;
      rlSpeed = -this.speed;
      rrSpeed = -this.speed;
    }
    else if (backward)
    {
      flSpeed = this.speed;
      frSpeed = this.speed;
      rlSpeed = this.speed;
      rrSpeed = this.speed;
    }
    else if (left)
    {
      // Tank turn left
      flSpeed = this.speed;
      rlSpeed = this.speed;
      frSpeed = -this.speed;
      rrSpeed = -this.speed;
    }
    else if (right)
    {
      // Tank turn right
      flSpeed = -this.speed;
      rlSpeed = -this.speed;
      frSpeed = this.speed;
      rrSpeed = this.speed;
    }

    this.SetWheelMotor(this.frontLeftHinge, flSpeed);
    this.SetWheelMotor(this.frontRightHinge, frSpeed);
    this.SetWheelMotor(this.rearLeftHinge, rlSpeed);
    this.SetWheelMotor(this.rearRightHinge, rrSpeed);
  }

  /** Resolve the HINGE constraint attachment on a wheel entity (built at load time). */
  private ResolveWheelHinge(wheelEntity: Entity | null): Physics6DoFConstraint | undefined
  {
    if (wheelEntity === null)
    {
      return undefined;
    }

    for (const row of wheelEntity.GetAttachmentsOfType("CONSTRAINT"))
    {
      if (row.data.constraintType !== "HINGE")
      {
        continue;
      }

      if (row.constraint instanceof Physics6DoFConstraint)
      {
        return row.constraint;
      }
    }

    console.warn(`[${this.entity.name}] "${wheelEntity.name}" has no HINGE constraint`);
    return undefined;
  }

  /** Drive a hinge motor at the given speed (degrees per second). */
  private SetWheelMotor(
    hinge: Physics6DoFConstraint | undefined,
    speedDegreesPerSecond: number
  ): void
  {
    if (hinge === undefined)
    {
      return;
    }

    const motorAxis = PhysicsConstraintAxis.ANGULAR_X;

    if (speedDegreesPerSecond === 0)
    {
      hinge.setAxisMotorTarget(motorAxis, 0);
      return;
    }

    hinge.setAxisMotorType(motorAxis, PhysicsConstraintMotorType.VELOCITY);
    hinge.setAxisMotorTarget(motorAxis, speedDegreesPerSecond * (Math.PI / 180));
    hinge.setAxisMotorMaxForce(motorAxis, this.force);
  }
}
