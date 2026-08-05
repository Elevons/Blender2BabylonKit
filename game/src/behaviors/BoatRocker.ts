import { Behavior, exposed } from "@bjs/engine";
import { PhysicsMotionType, Quaternion, Vector3 } from "@babylonjs/core";

/**
 * Rocks an entity on pitch, roll, and heave like a boat on open water.
 * Expects a RIGIDBODY authored as DYNAMIC or KINEMATIC; switches it to ANIMATED
 * so the collider follows the driven transform each physics step.
 */
export default class BoatRocker extends Behavior
{
  @exposed({ min: 0, max: 45, label: "Pitch (deg)" })
  pitchAmplitude = 6;

  @exposed({ min: 0, max: 45, label: "Roll (deg)" })
  rollAmplitude = 10;

  @exposed({ min: 0, max: 2, label: "Heave (u)" })
  heaveAmplitude = 0.15;

  @exposed({ min: 0.5, label: "Swell period (s)" })
  swellPeriod = 5;

  @exposed({ min: 0.2, label: "Chop period (s)" })
  chopPeriod = 1.8;

  @exposed({ min: 0, max: 1, label: "Chop mix" })
  chopMix = 0.35;

  private elapsedSeconds = 0;
  private restPosition = new Vector3();
  private restRotation = new Quaternion();
  private pitchOffset = new Quaternion();
  private rollOffset = new Quaternion();
  private composedRotation = new Quaternion();

  /** Capture the rest pose and sync any physics body for scripted motion. */
  OnStart(): void
  {
    this.restPosition = this.node.position.clone();

    if (this.node.rotationQuaternion !== null)
    {
      this.restRotation = this.node.rotationQuaternion.clone();
    }
    else
    {
      Quaternion.FromEulerVectorToRef(this.node.rotation, this.restRotation);
      this.node.rotationQuaternion = this.restRotation.clone();
    }

    if (this.entity.body !== undefined)
    {
      this.entity.body.setMotionType(PhysicsMotionType.ANIMATED);
      this.entity.body.disablePreStep = false;
    }
  }

  /** Layer slow swell and faster chop into pitch, roll, and vertical bob. */
  OnUpdate(deltaSeconds: number): void
  {
    this.elapsedSeconds += deltaSeconds;

    const swellAngle = (this.elapsedSeconds / this.swellPeriod) * Math.PI * 2;
    const chopAngle = (this.elapsedSeconds / this.chopPeriod) * Math.PI * 2;
    const chopBlend = this.chopMix;

    const pitchDegrees =
      Math.sin(swellAngle) * this.pitchAmplitude +
      Math.sin(chopAngle * 1.37 + 0.6) * this.pitchAmplitude * chopBlend;

    const rollDegrees =
      Math.sin(swellAngle * 0.83 + 1.1) * this.rollAmplitude +
      Math.sin(chopAngle * 1.91 + 2.4) * this.rollAmplitude * chopBlend;

    const heave =
      Math.sin(swellAngle * 0.67 + 0.3) * this.heaveAmplitude +
      Math.sin(chopAngle * 2.13 + 1.7) * this.heaveAmplitude * chopBlend;

    const pitchRadians = (pitchDegrees * Math.PI) / 180;
    const rollRadians = (rollDegrees * Math.PI) / 180;

    // These offsets multiply on the right of restRotation, so they act in the node's
    // LOCAL space — and the glTF import bakes Blender's axis conversion into that rest
    // quaternion, so local axes are Blender's: X = lateral (pitch), Y = forward (roll),
    // Z = up (yaw, unused).
    Quaternion.RotationAxisToRef(Vector3.Right(), pitchRadians, this.pitchOffset);
    Quaternion.RotationAxisToRef(Vector3.Up(), rollRadians, this.rollOffset);
    this.restRotation.multiplyToRef(this.pitchOffset, this.composedRotation);
    this.composedRotation.multiplyToRef(this.rollOffset, this.node.rotationQuaternion!);

    this.node.position.copyFrom(this.restPosition);
    this.node.position.y += heave;
  }
}
