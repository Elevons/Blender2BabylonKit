// src/behaviors/PlayerVehicleController.ts
import { Behavior, exposed, type Entity } from "../engine";
import {
  Vector3,
  Quaternion,
  Axis,
  KeyboardEventTypes,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
} from "@babylonjs/core";
import type { KeyboardInfo, Observer, PhysicsConstraint } from "@babylonjs/core";

/**
 * PlayerVehicleController
 *
 * Attach (via a SCRIPT component) to a controller object — or to the body
 * itself. Pick the chassis and up to four wheels in Blender. Each assigned
 * wheel is attached to the chassis with a 6DOF constraint that is locked on
 * every axis except vertical, which is a spring — giving suspension travel.
 * WASD drives the chassis.
 *
 * Blender setup (all bodies must be physics-enabled):
 *   - Chassis  : COLLIDER + RIGIDBODY (DYNAMIC)
 *   - Each wheel: COLLIDER + RIGIDBODY (DYNAMIC)   <- wheels are the ground contact
 *
 * Controls: W/S = forward/back, A/D = turn. (Click the viewport once so the
 * canvas has keyboard focus.)
 */
export default class PlayerVehicleController extends Behavior
{
  // --- picked objects -------------------------------------------------------
  @exposed({ type: "entity", label: "Chassis (body)" }) chassis: Entity | null = null;
  @exposed({ type: "entity", label: "Wheel FL" }) wheelFL: Entity | null = null;
  @exposed({ type: "entity", label: "Wheel FR" }) wheelFR: Entity | null = null;
  @exposed({ type: "entity", label: "Wheel RL" }) wheelRL: Entity | null = null;
  @exposed({ type: "entity", label: "Wheel RR" }) wheelRR: Entity | null = null;

  // --- driving --------------------------------------------------------------
  @exposed({ min: 0, max: 40, label: "Move speed (m/s)" }) moveSpeed = 8;
  @exposed({ min: 0, max: 10, label: "Turn speed (rad/s)" }) turnSpeed = 2.5;
  // Local axis that points "forward" on the chassis. Flip (e.g. [0,0,-1]) if
  // your model faces the other way.
  @exposed({ label: "Forward axis (local)" }) forwardAxis: [number, number, number] = [0, 0, 1];

  // --- suspension -----------------------------------------------------------
  // Hard travel range each wheel can move up/down from its rest position (m).
  @exposed({ min: 0, max: 1, step: 0.01, label: "Suspension travel (m)" }) maxTravel = 0.15;
  // How far the suspension compresses at rest under the chassis' own weight (m).
  // Smaller = stiffer ride. Stiffness is auto-derived from this and the mass.
  @exposed({ min: 0.005, max: 0.5, step: 0.005, label: "Rest sag (m)" }) restSag = 0.06;
  // 0 = bouncy, 1 = critically damped (no bounce). ~0.3-0.6 feels car-like.
  @exposed({ min: 0, max: 1.5, step: 0.05, label: "Damping ratio" }) dampingRatio = 0.4;

  // --- internals ------------------------------------------------------------
  private pressedKeys = new Set<string>();
  private keyboardObserver: Observer<KeyboardInfo> | null = null;
  private constraints: PhysicsConstraint[] = [];

  private forwardLocal = new Vector3(0, 0, 1);
  private forwardWorld = new Vector3();
  private linearVelocity = new Vector3();
  private angularVelocity = new Vector3();

  /** Size the suspension springs from the chassis mass, then attach the wheels. */
  OnStart(): void
  {
    this.forwardLocal = Vector3.FromArray(this.forwardAxis);

    const chassis = this.chassis;
    if (chassis === null || chassis.body === undefined)
    {
      console.warn("[PlayerVehicleController] No chassis with a RIGIDBODY assigned — nothing to drive.");
      return;
    }

    // Collect the wheels that are actually usable (assigned + have a body).
    const wheels = [this.wheelFL, this.wheelFR, this.wheelRL, this.wheelRR].filter(
      (wheelEntity): wheelEntity is Entity => wheelEntity !== null && wheelEntity.body !== undefined
    );

    // Size the suspension spring from the chassis mass so it holds the car up
    // regardless of how heavy the body is. Per-wheel spring: k = m*g / sag.
    const gravity = 9.81;
    const reportedMass = chassis.body.getMassProperties()?.mass;
    const chassisMass = reportedMass !== undefined && reportedMass > 0 ? reportedMass : 1;
    const perWheelMass = chassisMass / Math.max(1, wheels.length);
    const sag = Math.max(0.005, this.restSag);
    const stiffness = (perWheelMass * gravity) / sag;
    // Damping relative to critical damping (c_crit = 2*sqrt(k*m)).
    const damping = this.dampingRatio * 2 * Math.sqrt(stiffness * perWheelMass);

    for (const wheel of wheels)
    {
      this.AttachWheel(chassis, wheel, stiffness, damping);
    }

    // WASD via the scene observable (NOT global listeners — see engine gotchas).
    this.keyboardObserver = this.scene.onKeyboardObservable.add((keyboardInfo) =>
    {
      const key = keyboardInfo.event.key.toLowerCase();
      if (keyboardInfo.type === KeyboardEventTypes.KEYDOWN)
      {
        this.pressedKeys.add(key);
      }
      else if (keyboardInfo.type === KeyboardEventTypes.KEYUP)
      {
        this.pressedKeys.delete(key);
      }
    });
  }

  /**
   * 6DOF constraint pinning the wheel to the chassis at its current relative
   * pose. Every axis is locked except LINEAR_Y, which is a spring (suspension):
   *   - minLimit/maxLimit  -> hard travel end-stops (bump/droop stops)
   *   - stiffness/damping  -> spring pulling back toward the as-built rest height
   * Pivots/frames come from the live world transforms so nothing snaps on load.
   */
  private AttachWheel(chassis: Entity, wheel: Entity, stiffness: number, damping: number): void
  {
    const chassisNode = chassis.node;
    const wheelNode = wheel.node;
    chassisNode.computeWorldMatrix(true);
    wheelNode.computeWorldMatrix(true);

    const inverseChassisRotation = Quaternion.Inverse(chassisNode.absoluteRotationQuaternion);
    const inverseWheelRotation = Quaternion.Inverse(wheelNode.absoluteRotationQuaternion);

    // Position: where the wheel sits now, expressed in the chassis' local frame.
    const offset = wheelNode.getAbsolutePosition().subtract(chassisNode.getAbsolutePosition());
    const pivotA = offset.applyRotationQuaternion(inverseChassisRotation);
    const pivotB = Vector3.Zero();

    // Orientation: map a shared world frame into each body's local space. Here
    // the constraint's Y axis = world up, so LINEAR_Y is the vertical travel.
    const axisA = Axis.X.applyRotationQuaternion(inverseChassisRotation);
    const perpAxisA = Axis.Y.applyRotationQuaternion(inverseChassisRotation);
    const axisB = Axis.X.applyRotationQuaternion(inverseWheelRotation);
    const perpAxisB = Axis.Y.applyRotationQuaternion(inverseWheelRotation);

    const lock = (axis: PhysicsConstraintAxis) => ({ axis, minLimit: 0, maxLimit: 0 });
    const joint = new Physics6DoFConstraint(
      { pivotA, pivotB, axisA, axisB, perpAxisA, perpAxisB, collision: false },
      [
        lock(PhysicsConstraintAxis.LINEAR_X),
        lock(PhysicsConstraintAxis.LINEAR_Z),
        // Vertical = suspension: free within +/- travel, sprung back to rest.
        {
          axis: PhysicsConstraintAxis.LINEAR_Y,
          minLimit: -this.maxTravel,
          maxLimit: this.maxTravel,
          stiffness,
          damping,
        },
        lock(PhysicsConstraintAxis.ANGULAR_X),
        lock(PhysicsConstraintAxis.ANGULAR_Y),
        lock(PhysicsConstraintAxis.ANGULAR_Z),
      ],
      this.scene
    );

    chassis.body!.addConstraint(wheel.body!, joint);
    this.constraints.push(joint);
  }

  /** Drive the chassis from WASD by setting linear/angular velocity each frame. */
  OnUpdate(deltaSeconds: number): void
  {
    const chassis = this.chassis;
    if (chassis === null || chassis.body === undefined)
    {
      return;
    }
    const body = chassis.body;

    // Throttle / steering from WASD.
    let throttle = 0;
    if (this.pressedKeys.has("w"))
    {
      throttle += 1;
    }
    if (this.pressedKeys.has("s"))
    {
      throttle -= 1;
    }

    let steer = 0;
    if (this.pressedKeys.has("a"))
    {
      steer -= 1;
    }
    if (this.pressedKeys.has("d"))
    {
      steer += 1;
    }

    // World-space forward of the chassis.
    chassis.node.getDirectionToRef(this.forwardLocal, this.forwardWorld);
    this.forwardWorld.normalize();

    // Drive by setting velocity. Velocity is already per-second, so this is
    // frame-rate independent and deltaSeconds isn't applied. Vertical velocity
    // is kept so gravity (and suspension bobbing on the springs) still works.
    body.getLinearVelocityToRef(this.linearVelocity);
    const verticalVelocity = this.linearVelocity.y;
    this.forwardWorld.scaleToRef(throttle * this.moveSpeed, this.linearVelocity);
    this.linearVelocity.y = verticalVelocity;
    body.setLinearVelocity(this.linearVelocity);

    // Yaw around world up; keep current pitch/roll so the body can still settle
    // naturally on uneven ground.
    body.getAngularVelocityToRef(this.angularVelocity);
    this.angularVelocity.y = steer * this.turnSpeed;
    body.setAngularVelocity(this.angularVelocity);
  }

  /** Detach the keyboard observable and dispose the suspension constraints. */
  OnDestroy(): void
  {
    if (this.keyboardObserver !== null)
    {
      this.scene.onKeyboardObservable.remove(this.keyboardObserver);
      this.keyboardObserver = null;
    }

    for (const constraint of this.constraints)
    {
      constraint.dispose();
    }
    this.constraints.length = 0;
    this.pressedKeys.clear();
  }
}
