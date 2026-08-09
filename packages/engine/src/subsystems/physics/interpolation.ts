import { PhysicsMotionType, Quaternion, Vector3 } from "@babylonjs/core";
import type { PhysicsBody, Scene } from "@babylonjs/core";

/**
 * Visual interpolation for dynamic bodies under fixed physics stepping
 * (Unity's Rigidbody interpolation).
 *
 * With `GameClock.fixedDeltaSeconds > 0` the simulation advances in constant
 * slices, so on displays faster than the step rate many render frames get no
 * physics substep and dynamic bodies visibly stutter. This subsystem captures
 * each body's pose at the last two physics steps (scene.onAfterPhysicsObservable
 * fires once per substep) and, every render frame, writes
 * `lerp(previous, current, blendAlpha)` into the node — where blendAlpha is
 * the fraction of the next step already accumulated (GameClock.physicsBlendAlpha).
 *
 * Safe to overwrite the node because eligible bodies have
 * `disablePreStep === true` (the Babylon default for dynamics): Havok never
 * reads the node back, and each substep's sync rewrites it with the fresh sim
 * pose before the next capture. Consequence (same as Unity): node transforms
 * show the visual pose, up to one step behind the simulation.
 */
export class PhysicsBodyInterpolation
{
  /**
   * Per-step movement beyond this snaps instead of sweeping — covers
   * teleports (respawns) and floating-origin rebases, whose offsets would
   * otherwise render as a one-step streak across the level.
   */
  private static readonly maxLerpDistanceSquared = 10 * 10;

  private readonly snapshots = new WeakMap<PhysicsBody, BodyPoseSnapshot>();

  private readonly captureObserver: ReturnType<Scene["onAfterPhysicsObservable"]["add"]>;

  constructor(private scene: Scene)
  {
    this.captureObserver = scene.onAfterPhysicsObservable.add(() =>
    {
      this.CaptureStepPoses();
    });
  }

  /** Stop capturing; interpolated nodes keep their last written pose. */
  Dispose(): void
  {
    this.scene.onAfterPhysicsObservable.remove(this.captureObserver);
  }

  /**
   * Write interpolated poses into eligible dynamic-body nodes. Called by
   * Level once per render frame (after the clock tick, before behaviors, so
   * camera followers and gameplay reads see the smooth pose). No-op in
   * variable-stepping mode, where visuals already match the sim 1:1.
   */
  ApplyVisuals(blendAlpha: number): void
  {
    const physicsEngine = this.scene.getPhysicsEngine();
    // Babylon Nullable that can also be undefined at runtime.
    if (!physicsEngine || physicsEngine.getSubTimeStep() === 0)
    {
      return;
    }

    for (const body of this.GetBodies(physicsEngine))
    {
      const snapshot = this.snapshots.get(body);
      if (snapshot === undefined || snapshot.captureCount < 2 || !this.IsEligible(body))
      {
        continue;
      }

      const bodyNode = body.transformNode;
      const stepDistanceSquared = Vector3.DistanceSquared(
        snapshot.previousPosition,
        snapshot.currentPosition
      );

      if (stepDistanceSquared > PhysicsBodyInterpolation.maxLerpDistanceSquared)
      {
        bodyNode.position.copyFrom(snapshot.currentPosition);
        bodyNode.rotationQuaternion!.copyFrom(snapshot.currentRotation);
        continue;
      }

      Vector3.LerpToRef(
        snapshot.previousPosition,
        snapshot.currentPosition,
        blendAlpha,
        bodyNode.position
      );
      Quaternion.SlerpToRef(
        snapshot.previousRotation,
        snapshot.currentRotation,
        blendAlpha,
        bodyNode.rotationQuaternion!
      );
    }
  }

  /** Shift current → previous and read the fresh post-sync sim pose. */
  private CaptureStepPoses(): void
  {
    const physicsEngine = this.scene.getPhysicsEngine();
    // Babylon Nullable that can also be undefined at runtime.
    if (!physicsEngine || physicsEngine.getSubTimeStep() === 0)
    {
      return;
    }

    for (const body of this.GetBodies(physicsEngine))
    {
      if (!this.IsEligible(body))
      {
        continue;
      }

      const bodyNode = body.transformNode;
      let snapshot = this.snapshots.get(body);

      if (snapshot === undefined)
      {
        snapshot = {
          previousPosition: bodyNode.position.clone(),
          currentPosition: bodyNode.position.clone(),
          previousRotation: bodyNode.rotationQuaternion!.clone(),
          currentRotation: bodyNode.rotationQuaternion!.clone(),
          captureCount: 1,
        };
        this.snapshots.set(body, snapshot);
        continue;
      }

      snapshot.previousPosition.copyFrom(snapshot.currentPosition);
      snapshot.previousRotation.copyFrom(snapshot.currentRotation);
      snapshot.currentPosition.copyFrom(bodyNode.position);
      snapshot.currentRotation.copyFrom(bodyNode.rotationQuaternion!);
      snapshot.captureCount++;
    }
  }

  /**
   * All bodies in the world. `scene.getPhysicsEngine()` is typed as the
   * V1-era IPhysicsEngine, which lacks getBodies — the V2 engine (always
   * ours; the kit only boots Havok) provides it.
   */
  private GetBodies(physicsEngine: object): PhysicsBody[]
  {
    return (physicsEngine as { getBodies(): PhysicsBody[] }).getBodies();
  }

  /**
   * Only free-simulated single bodies qualify: DYNAMIC motion, node not
   * feeding back into Havok (disablePreStep — false during e.g. CarController
   * placement windows), plugin sync active, no instanced clones, and a
   * quaternion-driven node (physics sync guarantees one, but guard anyway).
   */
  private IsEligible(body: PhysicsBody): boolean
  {
    if (body.getMotionType() !== PhysicsMotionType.DYNAMIC)
    {
      return false;
    }

    if (body.disablePreStep !== true || body.disableSync)
    {
      return false;
    }

    if (body.numInstances > 0)
    {
      return false;
    }

    return body.transformNode.rotationQuaternion !== null;
  }
}

/** Last two physics-step poses for one body; vectors reused across frames. */
interface BodyPoseSnapshot
{
  previousPosition: Vector3;
  currentPosition: Vector3;
  previousRotation: Quaternion;
  currentRotation: Quaternion;
  /** Steps captured so far — interpolation needs two. */
  captureCount: number;
}
