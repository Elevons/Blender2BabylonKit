import { Behavior, exposed, inputMap, type Entity } from "@bjs/engine";
import type { InputActionMap } from "@bjs/engine";
import {
  HavokPlugin,
  Physics6DoFConstraint,
  PhysicsBody,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  Quaternion,
  Vector3,
  type IPhysicsCollisionEvent,
  type Observer,
} from "@babylonjs/core";

/** One driven wheel: hinge motor + optional ground-contact tracking for anti-slip. */
interface WheelSlot
{
  entity: Entity;
  hinge: Physics6DoFConstraint;
  /** Index into the 8-wheel speed layout (0–7). */
  layoutIndex: number;
  contactCount: number;
}

/**
 * CarController drives wheel hinge motors from input, and provides a
 * one-shot "recover" maneuver on the Reset action: it lifts the body,
 * straightens it to zero rotation, holds briefly, then automatically hands
 * control back to physics so the car drops upright from rest.
 *
 * Wheel layout indices (outer + inner per corner):
 *   0 FL outer, 1 FL inner, 2 FR outer, 3 FR inner,
 *   4 RL outer, 5 RL inner, 6 RR outer, 7 RR inner.
 * Inner wheel refs are optional — assign only the outers for a 4-wheel rig.
 */
export default class CarController extends Behavior
{
  @exposed({ label: "Front Left Outer", type: "entity" })
  frontLeftWheel: Entity | null = null;

  @exposed({ label: "Front Left Inner", type: "entity" })
  frontLeftInner: Entity | null = null;

  @exposed({ label: "Front Right Outer", type: "entity" })
  frontRightWheel: Entity | null = null;

  @exposed({ label: "Front Right Inner", type: "entity" })
  frontRightInner: Entity | null = null;

  @exposed({ label: "Rear Left Outer", type: "entity" })
  rearLeftWheel: Entity | null = null;

  @exposed({ label: "Rear Left Inner", type: "entity" })
  rearLeftInner: Entity | null = null;

  @exposed({ label: "Rear Right Outer", type: "entity" })
  rearRightWheel: Entity | null = null;

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

  @exposed({ label: "Anti-Slip" })
  antiSlip = true;

  @exposed({ min: 0, max: 1, label: "Grounded Power" })
  groundedGrip = 1;

  @exposed({ min: 0, max: 1, label: "Airborne Power" })
  airborneGrip = 0;

  @exposed({ label: "Body", type: "entity" })
  body: Entity | null = null;

  @inputMap("Player") player!: InputActionMap;

  private isPlacing = false;
  private placeTimer = 0;
  private wheelSlots: WheelSlot[] = [];
  private carEntityIds = new Set<string>();
  private debounceTime = Date.now();
  private collisionObserver: Observer<IPhysicsCollisionEvent> | null = null;
  private collisionEndedObserver: Observer<IPhysicsCollisionEvent> | null = null;

  OnStart(): void
  {
    this.BuildCarEntityIds();
    this.BuildWheelSlots();
    this.WireGroundContactTracking();
  }

  OnDestroy(): void
  {
    this.collisionObserver?.remove();
    this.collisionEndedObserver?.remove();
    this.collisionObserver = null;
    this.collisionEndedObserver = null;
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

    const speeds = this.isPlacing
      ? new Array(8).fill(0)
      : this.ComputeWheelSpeeds(forward, backward, left, right);

    for (const slot of this.wheelSlots)
    {
      const grip = this.GetWheelGrip(slot);
      const targetSpeed = speeds[slot.layoutIndex] * grip;
      this.SetWheelMotor(slot.hinge, targetSpeed, grip);
    }
  }

  /** Register every entity that should not count as "ground" for anti-slip. */
  private BuildCarEntityIds(): void
  {
    this.carEntityIds.clear();
    this.carEntityIds.add(this.entity.id);

    if (this.body !== null)
    {
      this.carEntityIds.add(this.body.id);
    }

    for (const wheelEntity of this.CollectWheelEntities())
    {
      if (wheelEntity !== null)
      {
        this.carEntityIds.add(wheelEntity.id);
      }
    }
  }

  /** Resolve hinges for every assigned wheel in layout order. */
  private BuildWheelSlots(): void
  {
    this.wheelSlots = [];

    const wheelEntities = this.CollectWheelEntities();
    for (let layoutIndex = 0; layoutIndex < wheelEntities.length; layoutIndex++)
    {
      const wheelEntity = wheelEntities[layoutIndex];
      if (wheelEntity === null)
      {
        continue;
      }

      const hinge = this.ResolveWheelHinge(wheelEntity);
      if (hinge === undefined)
      {
        continue;
      }

      this.wheelSlots.push({
        entity: wheelEntity,
        hinge,
        layoutIndex,
        contactCount: 0,
      });
    }
  }

  /** Enable Havok collision callbacks on wheels and track non-car contacts. */
  private WireGroundContactTracking(): void
  {
    if (!this.antiSlip)
    {
      return;
    }

    const physicsEngine = this.scene.getPhysicsEngine();
    const plugin = physicsEngine?.getPhysicsPlugin();
    if (!(plugin instanceof HavokPlugin))
    {
      console.warn(`[${this.entity.name}] Anti-slip needs Havok physics`);
      return;
    }

    for (const slot of this.wheelSlots)
    {
      const wheelBody = slot.entity.body;
      if (wheelBody === undefined)
      {
        continue;
      }

      wheelBody.setCollisionCallbackEnabled(true);
      wheelBody.setCollisionEndedCallbackEnabled(true);
    }

    this.collisionObserver = plugin.onCollisionObservable.add((collisionEvent) =>
    {
      if (collisionEvent.type === "COLLISION_STARTED")
      {
        this.AdjustWheelContact(collisionEvent.collider, collisionEvent.collidedAgainst, 1);
        this.AdjustWheelContact(collisionEvent.collidedAgainst, collisionEvent.collider, 1);
      }
    });

    this.collisionEndedObserver = plugin.onCollisionEndedObservable.add((collisionEvent) =>
    {
      this.AdjustWheelContact(collisionEvent.collider, collisionEvent.collidedAgainst, -1);
      this.AdjustWheelContact(collisionEvent.collidedAgainst, collisionEvent.collider, -1);
    });
  }

  /** Wheel layout order: outer and inner per corner (nulls allowed). */
  private CollectWheelEntities(): (Entity | null)[]
  {
    return [
      this.frontLeftWheel,
      this.frontLeftInner,
      this.frontRightWheel,
      this.frontRightInner,
      this.rearLeftWheel,
      this.rearLeftInner,
      this.rearRightWheel,
      this.rearRightInner,
    ];
  }

  /**
   * Compute per-wheel motor speeds for the 8-wheel layout from pressed directions.
   * Corner speeds follow the 4-wheel differential model; each corner's inner
   * wheel scales by turnRatio while turning.
   */
  private ComputeWheelSpeeds(
    forward: boolean,
    backward: boolean,
    left: boolean,
    right: boolean
  ): number[]
  {
    const cornerSpeeds = this.ComputeCornerSpeeds(forward, backward, left, right);
    const turning = left || right;
    const innerScale = turning ? this.turnRatio : 1;

    return [
      cornerSpeeds[0], cornerSpeeds[0] * innerScale,
      cornerSpeeds[1], cornerSpeeds[1] * innerScale,
      cornerSpeeds[2], cornerSpeeds[2] * innerScale,
      cornerSpeeds[3], cornerSpeeds[3] * innerScale,
    ];
  }

  /**
   * Four-corner differential [FL, FR, RL, RR]. Outer wheels on a turn side
   * spin at full speed; the opposite side uses turnRatio. Left/Right alone
   * gives tank controls.
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
    const outerSpeed = (direction !== 0 ? direction : 1) * this.speed;

    if (!turning)
    {
      if (direction === 0)
      {
        return [0, 0, 0, 0];
      }

      return [outerSpeed, outerSpeed, outerSpeed, outerSpeed];
    }

    const innerSpeed = direction !== 0
      ? outerSpeed * this.turnRatio
      : -outerSpeed * this.turnRatio;

    if (left)
    {
      return [innerSpeed, outerSpeed, innerSpeed, outerSpeed];
    }
    return [outerSpeed, innerSpeed, outerSpeed, innerSpeed];
  }

  /** Grip multiplier from ground contact when anti-slip is enabled. */
  private GetWheelGrip(slot: WheelSlot): number
  {
    if (!this.antiSlip)
    {
      return 1;
    }

    const grounded = slot.contactCount > 0;
    return grounded ? this.groundedGrip : this.airborneGrip;
  }

  /** Bump ground-contact count when a wheel touches something outside the car. */
  private AdjustWheelContact(
    wheelBody: PhysicsBody,
    otherBody: PhysicsBody,
    delta: number
  ): void
  {
    const wheelEntity = this.EntityFromPhysicsBody(wheelBody);
    const otherEntity = this.EntityFromPhysicsBody(otherBody);
    if (wheelEntity === null || otherEntity === null)
    {
      return;
    }

    if (this.carEntityIds.has(otherEntity.id))
    {
      return;
    }

    const slot = this.wheelSlots.find((candidate) => candidate.entity.id === wheelEntity.id);
    if (slot === undefined)
    {
      return;
    }

    slot.contactCount = Math.max(0, slot.contactCount + delta);
  }

  private EntityFromPhysicsBody(body: PhysicsBody): Entity | null
  {
    const metadata = body.transformNode?.metadata as { bjsEntity?: Entity } | undefined;
    return metadata?.bjsEntity ?? null;
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
    hinge: Physics6DoFConstraint,
    speedDegreesPerSecond: number,
    grip: number
  ): void
  {
    const motorAxis = PhysicsConstraintAxis.ANGULAR_X;
    const maxForce = this.force * grip;

    if (speedDegreesPerSecond === 0 || maxForce === 0)
    {
      hinge.setAxisMotorTarget(motorAxis, 0);
      return;
    }

    hinge.setAxisMotorType(motorAxis, PhysicsConstraintMotorType.VELOCITY);
    hinge.setAxisMotorTarget(motorAxis, speedDegreesPerSecond * (Math.PI / 180));
    hinge.setAxisMotorMaxForce(motorAxis, maxForce);
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
