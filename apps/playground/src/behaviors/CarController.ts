import { Behavior, exposed, Input } from "@bjs/engine";
import type { Entity } from "@bjs/engine";
import { Vector3, Color3 } from "@babylonjs/core";

/**
 * Arcade car controller — a showcase behavior that leans on most of the kit:
 *
 *   @exposed        chassis + wheel entity lists, tuning floats, an enum, a color
 *   Input map       MoveX/MoveY steer + throttle (keys or gamepad stick),
 *                   Sprint = boost, Jump = handbrake, Interact = horn (edge)
 *   Audio           "engine" loop pitched by speed, "horn" on demand
 *                   (add Audio components whose files are engine.* / horn.*)
 *   Messaging       OnMessage("boost") from trigger pads grants a timed boost;
 *                   OnMessage("reset") respawns at the start pose
 *   Physics         drives the chassis' Havok body by velocity (frame-rate
 *                   independent); suspension can be authored as SPRING
 *                   constraints between chassis and wheels in Blender
 *
 * Blender setup:
 *   - Chassis: COLLIDER (Box/Convex) + RIGIDBODY (Dynamic), this SCRIPT,
 *     optional Audio components (engine loop / horn one-shot).
 *   - Pick the chassis in "Chassis"; pick wheel meshes into the two lists
 *     (fronts steer visually, all spin). Wheels can be plain visuals or real
 *     bodies joined by SPRING constraints — this script only animates nodes.
 *   - Boost pads: a trigger collider with an On Enter event sending "boost"
 *     to the car. A kill volume can send "reset".
 */
export default class CarController extends Behavior
{
  // --- picked objects -------------------------------------------------------
  @exposed({ type: "entity", label: "Chassis (body)" })
  chassis: Entity | null = null;

  @exposed({ type: "list", of: "entity", label: "Front wheels (steer)" })
  frontWheels: (Entity | null)[] = [];

  @exposed({ type: "list", of: "entity", label: "Rear wheels" })
  rearWheels: (Entity | null)[] = [];

  // --- tuning ---------------------------------------------------------------
  @exposed({ min: 1, max: 60, label: "Top speed (m/s)" })
  topSpeed = 18;

  @exposed({ min: 1, max: 60, label: "Acceleration (m/s^2)" })
  acceleration = 14;

  @exposed({ min: 0.1, max: 6, label: "Turn rate (rad/s)" })
  turnRate = 2.2;

  @exposed({ min: 1, max: 3, label: "Boost multiplier" })
  boostMultiplier = 1.6;

  @exposed({ min: 0, max: 10, label: "Pad boost seconds" })
  padBoostSeconds = 2;

  @exposed({ type: "enum", options: ["normal", "drift"], label: "Handling" })
  handling = "normal";

  @exposed({ type: "color", label: "Boost log color" })
  boostLogColor = new Color3(1, 0.5, 0);

  // Local axis that points forward on the chassis; flip if the model faces -Z.
  @exposed({ label: "Forward axis (local)" })
  forwardAxis: [number, number, number] = [0, 0, 1];

  // --- internals ------------------------------------------------------------
  private forwardLocal = new Vector3(0, 0, 1);
  private forwardWorld = new Vector3();
  private linearVelocity = new Vector3();
  private angularVelocity = new Vector3();
  private startPosition = new Vector3();
  private currentSpeed = 0;
  private padBoostRemaining = 0;
  private wheelSpinAngle = 0;

  /** Cache the start pose, enable node->body sync, start the engine loop. */
  OnStart(): void
  {
    this.forwardLocal = Vector3.FromArray(this.forwardAxis);

    const body = this.chassis?.body;
    if (body === undefined)
    {
      console.warn("[CarController] No chassis with a RIGIDBODY assigned — nothing to drive.");
      return;
    }

    // Let node-transform writes reach the body (needed for the reset teleport).
    body.disablePreStep = false;

    this.startPosition = this.chassis!.node.position.clone();

    // The engine loop starts with the level (Audio autoplay also works; doing
    // it here keeps the car self-contained). Pitch follows speed in OnUpdate.
    this.chassis!.GetSound("engine")?.play();
  }

  /** Read the input map, drive the body, animate wheels, pitch the engine. */
  OnUpdate(deltaSeconds: number): void
  {
    const chassis = this.chassis;
    if (chassis === null || chassis.body === undefined)
    {
      return;
    }

    if (Input.WasPressed("Interact"))
    {
      chassis.GetSound("horn")?.play();
    }

    if (this.padBoostRemaining > 0)
    {
      this.padBoostRemaining -= deltaSeconds;
    }

    const throttle = Input.Axis("MoveY");          // w/s, arrows, or stick
    const steer = Input.Axis("MoveX");             // a/d, arrows, or stick
    const boosting = Input.IsDown("Sprint") || this.padBoostRemaining > 0;
    const handbrake = Input.IsDown("Jump");

    this.UpdateSpeed(throttle, boosting, handbrake, deltaSeconds);
    this.ApplyBodyVelocities(chassis, steer, handbrake);
    this.AnimateWheels(steer, deltaSeconds);

    // Engine pitch: idle ~0.8 up to ~2.0 at (boosted) top speed.
    const engineSound = chassis.GetSound("engine");
    if (engineSound !== undefined)
    {
      const speedFraction = Math.min(1, Math.abs(this.currentSpeed) / (this.topSpeed * this.boostMultiplier));
      engineSound.playbackRate = 0.8 + speedFraction * 1.2;
    }
  }

  /** Trigger pads and kill volumes talk to the car through messages. */
  OnMessage(message: string, source: Entity): void
  {
    if (message === "boost")
    {
      this.padBoostRemaining = this.padBoostSeconds;
      console.log(
        `%c[CarController] boost pad "${source.name}"!`,
        `color: ${this.boostLogColor.toHexString()}`
      );
    }
    else if (message === "reset")
    {
      this.ResetToStart();
    }
  }

  /** Accelerate toward the target speed; brake hard with the handbrake. */
  private UpdateSpeed(throttle: number, boosting: boolean, handbrake: boolean, deltaSeconds: number): void
  {
    const maxSpeed = boosting ? this.topSpeed * this.boostMultiplier : this.topSpeed;
    const targetSpeed = handbrake ? 0 : throttle * maxSpeed;

    // Approach the target; the handbrake decelerates 3x faster than throttle.
    const rate = this.acceleration * (handbrake ? 3 : 1) * deltaSeconds;
    const difference = targetSpeed - this.currentSpeed;
    const step = Math.min(Math.abs(difference), rate) * Math.sign(difference);
    this.currentSpeed += step;
  }

  /** Write forward + yaw velocities onto the Havok body (per-second values). */
  private ApplyBodyVelocities(chassis: Entity, steer: number, handbrake: boolean): void
  {
    const body = chassis.body!;

    chassis.node.getDirectionToRef(this.forwardLocal, this.forwardWorld);
    this.forwardWorld.normalize();

    // Keep vertical velocity so gravity (and sprung suspension) still work.
    body.getLinearVelocityToRef(this.linearVelocity);
    const verticalVelocity = this.linearVelocity.y;
    this.forwardWorld.scaleToRef(this.currentSpeed, this.linearVelocity);
    this.linearVelocity.y = verticalVelocity;
    body.setLinearVelocity(this.linearVelocity);

    // Steering only bites when moving (reversed when backing up, like a car).
    // Drift handling steers at full rate even with the handbrake down.
    const speedFactor = Math.min(1, Math.abs(this.currentSpeed) / 3) * Math.sign(this.currentSpeed || 1);
    const driftFactor = handbrake && this.handling !== "drift" ? 0.4 : 1;

    body.getAngularVelocityToRef(this.angularVelocity);
    this.angularVelocity.y = steer * this.turnRate * speedFactor * driftFactor;
    body.setAngularVelocity(this.angularVelocity);
  }

  /** Visual wheel spin (all) + steering yaw (fronts). Wheels are just nodes. */
  private AnimateWheels(steer: number, deltaSeconds: number): void
  {
    // Roughly correct spin for ~0.35 m radius wheels; visual, not simulated.
    this.wheelSpinAngle += (this.currentSpeed / 0.35) * deltaSeconds;
    const steerAngle = steer * 0.5; // ~30 degrees of visual steering lock

    for (const wheel of this.frontWheels)
    {
      if (wheel !== null)
      {
        wheel.node.rotation.set(this.wheelSpinAngle, steerAngle, 0);
      }
    }

    for (const wheel of this.rearWheels)
    {
      if (wheel !== null)
      {
        wheel.node.rotation.set(this.wheelSpinAngle, 0, 0);
      }
    }
  }

  /** Teleport back to the start pose and kill all momentum. */
  private ResetToStart(): void
  {
    const chassis = this.chassis!;
    const body = chassis.body!;

    chassis.node.position.copyFrom(this.startPosition);
    body.setLinearVelocity(Vector3.Zero());
    body.setAngularVelocity(Vector3.Zero());
    this.currentSpeed = 0;
    this.padBoostRemaining = 0;
  }
}
