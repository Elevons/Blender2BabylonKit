import { Behavior, exposed, inputMap, type Entity } from "@bjs/engine";
import type { InputActionMap } from "@bjs/engine";
import {
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  Quaternion,
  Vector3,
} from "@babylonjs/core";

/**
 * CarController drives the wheel hinge motors from input, and provides a
 * one-shot "recover" maneuver on the Reset action: it lifts the body,
 * straightens it to zero rotation, holds briefly, then automatically hands
 * control back to physics so the car drops upright from rest.
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

  @exposed({ min: 0, max: 5, label: "Place Hold (s)" })
  holdSeconds = 0.5;

  @exposed({ label: "Body", type: "entity" })
  body: Entity | null = null;

  @inputMap("Player") player!: InputActionMap;

  private isPlacing = false;
  private placeTimer = 0;
  private hinges: Physics6DoFConstraint[] = [];
  private debounceTime = Date.now();

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

    const forward = this.player.FindAction("Forward")?.IsPressed() === true;
    const backward = this.player.FindAction("Backward")?.IsPressed() === true;
    const left = this.player.FindAction("Left")?.IsPressed() === true;
    const right = this.player.FindAction("Right")?.IsPressed() === true;

    // Speeds per wheel: [FL, FR, RL, RR]
    // Each active input contributes its direction vector, then we average.
    const s = this.speed;
    const contributions: number[] = [0, 0, 0, 0];
    let active = 0;

    if (forward)  { contributions[0] += s; contributions[1] += s; contributions[2] += s; contributions[3] += s; active++; }
    if (backward) { contributions[0] -= s; contributions[1] -= s; contributions[2] -= s; contributions[3] -= s; active++; }
    if (left)     { contributions[1] += backward ? -s : s; contributions[3] += backward ? -s : s; active++; }
    if (right)    { contributions[0] += backward ? -s : s; contributions[2] += backward ? -s : s; active++; }

    // Wheels are held still while placing so they don't spin mid-air.
    const speeds = this.isPlacing
      ? [0, 0, 0, 0]
      : active > 0
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

  /**
   * Begin the recover maneuver: switch the body to ANIMATED (kinematic), lift it
   * 10 units, and reset all rotations to zero so it will drop upright. Kinematic
   * bodies ignore gravity, so it holds in place until EndPlacement runs.
   */
  private BeginPlacement(): void
  {
    const body = this.body?.body;
    if (body === undefined || this.body === null) return;

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
    if (body === undefined || this.body === null) return;

    this.isPlacing = false;

    body.disablePreStep = true;
    body.setMotionType(PhysicsMotionType.DYNAMIC);
    body.setLinearVelocity(Vector3.Zero());
    body.setAngularVelocity(Vector3.Zero());
  }
}
