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
export default class PlayerVehicleController extends Behavior {
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
  private keys = new Set<string>();
  private kbObs: Observer<KeyboardInfo> | null = null;
  private constraints: PhysicsConstraint[] = [];

  private _fwdLocal = new Vector3(0, 0, 1);
  private _fwd = new Vector3();
  private _vel = new Vector3();
  private _ang = new Vector3();

  onStart() {
    this._fwdLocal = Vector3.FromArray(this.forwardAxis);

    const chassis = this.chassis;
    if (!chassis?.body) {
      console.warn("[PlayerVehicleController] No chassis with a RIGIDBODY assigned — nothing to drive.");
      return;
    }

    // Collect the wheels that are actually usable (assigned + have a body).
    const wheels = [this.wheelFL, this.wheelFR, this.wheelRL, this.wheelRR].filter(
      (w): w is Entity => !!w && !!w.body
    );

    // Size the suspension spring from the chassis mass so it holds the car up
    // regardless of how heavy the body is. Per-wheel spring: k = m*g / sag.
    const g = 9.81;
    const mass = chassis.body.getMassProperties()?.mass;
    const chassisMass = mass && mass > 0 ? mass : 1;
    const perWheelMass = chassisMass / Math.max(1, wheels.length);
    const sag = Math.max(0.005, this.restSag);
    const stiffness = (perWheelMass * g) / sag;
    // Damping relative to critical damping (c_crit = 2*sqrt(k*m)).
    const damping = this.dampingRatio * 2 * Math.sqrt(stiffness * perWheelMass);

    for (const wheel of wheels) {
      this.attachWheel(chassis, wheel, stiffness, damping);
    }

    // WASD via the scene observable (NOT global listeners — see engine gotchas).
    this.kbObs = this.scene.onKeyboardObservable.add((info) => {
      const k = info.event.key.toLowerCase();
      if (info.type === KeyboardEventTypes.KEYDOWN) this.keys.add(k);
      else if (info.type === KeyboardEventTypes.KEYUP) this.keys.delete(k);
    });
  }

  /**
   * 6DOF constraint pinning the wheel to the chassis at its current relative
   * pose. Every axis is locked except LINEAR_Y, which is a spring (suspension):
   *   - minLimit/maxLimit  -> hard travel end-stops (bump/droop stops)
   *   - stiffness/damping  -> spring pulling back toward the as-built rest height
   * Pivots/frames come from the live world transforms so nothing snaps on load.
   */
  private attachWheel(chassis: Entity, wheel: Entity, stiffness: number, damping: number) {
    const cn = chassis.node;
    const wn = wheel.node;
    cn.computeWorldMatrix(true);
    wn.computeWorldMatrix(true);

    const invC = Quaternion.Inverse(cn.absoluteRotationQuaternion);
    const invW = Quaternion.Inverse(wn.absoluteRotationQuaternion);

    // Position: where the wheel sits now, expressed in the chassis' local frame.
    const offset = wn.getAbsolutePosition().subtract(cn.getAbsolutePosition());
    const pivotA = offset.applyRotationQuaternion(invC);
    const pivotB = Vector3.Zero();

    // Orientation: map a shared world frame into each body's local space. Here
    // the constraint's Y axis = world up, so LINEAR_Y is the vertical travel.
    const axisA = Axis.X.applyRotationQuaternion(invC);
    const perpAxisA = Axis.Y.applyRotationQuaternion(invC);
    const axisB = Axis.X.applyRotationQuaternion(invW);
    const perpAxisB = Axis.Y.applyRotationQuaternion(invW);

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

  onUpdate(_dt: number) {
    const body = this.chassis?.body;
    if (!body) return;

    // Throttle / steering from WASD.
    let throttle = 0;
    if (this.keys.has("w")) throttle += 1;
    if (this.keys.has("s")) throttle -= 1;
    let steer = 0;
    if (this.keys.has("a")) steer -= 1;
    if (this.keys.has("d")) steer += 1;

    // World-space forward of the chassis.
    this.chassis!.node.getDirectionToRef(this._fwdLocal, this._fwd);
    this._fwd.normalize();

    // Drive by setting velocity. Velocity is already per-second, so this is
    // frame-rate independent and dt isn't applied. Vertical velocity is kept so
    // gravity (and the suspension bobbing it on the springs) still works.
    body.getLinearVelocityToRef(this._vel);
    const vy = this._vel.y;
    this._fwd.scaleToRef(throttle * this.moveSpeed, this._vel);
    this._vel.y = vy;
    body.setLinearVelocity(this._vel);

    // Yaw around world up; keep current pitch/roll so the body can still settle
    // naturally on uneven ground.
    body.getAngularVelocityToRef(this._ang);
    this._ang.y = steer * this.turnSpeed;
    body.setAngularVelocity(this._ang);
  }

  onDestroy() {
    if (this.kbObs) {
      this.scene.onKeyboardObservable.remove(this.kbObs);
      this.kbObs = null;
    }
    for (const c of this.constraints) c.dispose();
    this.constraints.length = 0;
    this.keys.clear();
  }
}
