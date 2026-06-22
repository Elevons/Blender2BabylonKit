import { Behavior, exposed, inputMap, type Entity } from "@bjs/engine";
import type { InputActionMap } from "@bjs/engine";
import {
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  Vector3,
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

  @exposed({ label: "Body", type: "entity" })
  body: Entity | null = null;

  @inputMap("Player") player!: InputActionMap;

  private isActive = false;
  private hinges: Physics6DoFConstraint[] = [];
  private lastResetTime = Date.now();

  OnStart(): void
  {
    // Collect all exposed wheel entities, resolve hinges, keep them in array order
    const entities = [this.frontLeftWheel, this.frontRightWheel, this.rearLeftWheel, this.rearRightWheel];
    for (const ent of entities)
    {
      const hinge = this.ResolveWheelHinge(ent);
      if (hinge) this.hinges.push(hinge);
    }
  }

  OnUpdate(_deltaSeconds: number): void
  {
    const forward = this.player.FindAction("Forward")?.IsPressed() === true;
    const backward = this.player.FindAction("Backward")?.IsPressed() === true;
    const left = this.player.FindAction("Left")?.IsPressed() === true;
    const right = this.player.FindAction("Right")?.IsPressed() === true;
    const reset = this.player.FindAction("Reset")?.IsPressed() === true;

    // Toggle between DYNAMIC and ANIMATED body mode on reset press (debounced to 1s).
    if (reset && Date.now() - this.lastResetTime >= 1000)
    {
      this.lastResetTime = Date.now();
      this.isActive = !this.isActive;
      if (this.body)
      {
        const body = this.body.body;
        if (body)
        {
          const motionType = this.isActive ? PhysicsMotionType.ANIMATED : PhysicsMotionType.DYNAMIC;
          body.setMotionType(motionType);
          body.setLinearVelocity(Vector3.Zero());
          body.setAngularVelocity(Vector3.Zero());
          console.log(`[${this.entity.name}] Body mode: ${motionType}, isActive=${this.isActive}`);
        }
      }
    }

    // Speeds per wheel: [FL, FR, RL, RR]
    // Each active input contributes its direction vector, then we average.
    const s = this.speed;
    const contributions: number[] = [0, 0, 0, 0];
    let active = 0;

    if (forward)  { contributions[0] += s; contributions[1] += s; contributions[2] += s; contributions[3] += s; active++; }
    if (backward) { contributions[0] -= s; contributions[1] -= s; contributions[2] -= s; contributions[3] -= s; active++; }
    if (left)     { contributions[1] += backward ? -s : s; contributions[3] += backward ? -s : s; active++; }
    if (right)    { contributions[0] += backward ? -s : s; contributions[2] += backward ? -s : s; active++; }

    const speeds = active > 0
      ? contributions.map(v => Math.round(v / active * 100) / 100)
      : [0, 0, 0, 0];

    // Apply each wheel's speed
    for (let i = 0; i < this.hinges.length; i++)
    {
      this.SetWheelMotor(this.hinges[i], speeds[i]);
    }
  }

  /** Resolve the HINGE constraint attachment on a wheel entity (built at load time). */
  private ResolveWheelHinge(wheelEntity: Entity | null): Physics6DoFConstraint | undefined
  {
    if (wheelEntity === null) return undefined;

    for (const row of wheelEntity.GetAttachmentsOfType("CONSTRAINT"))
    {
      if (row.data.constraintType !== "HINGE") continue;
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
    hinge: Physics6DoFConstraint,
    speedDegreesPerSecond: number
  ): void
  {
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
