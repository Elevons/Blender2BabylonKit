import {
  Behavior,
  exposed,
  IsEntityInsideColliderVolume,
  IsPointInsideColliderVolume,
  type AttachmentOfType,
  type Entity,
} from "@bjs/engine";
import {
  Frustum,
  HavokPlugin,
  Matrix,
  PhysicsRaycastResult,
  Quaternion,
  TransformNode,
  Vector3,
  type IBasePhysicsCollisionEvent,
  type Observer,
  type PhysicsBody,
} from "@babylonjs/core";

interface PhysicsBodyQueryEngine
{
  getBodies(): PhysicsBody[];
}

/**
 * Maintains a fixed pool of prefab instances inside a spawn volume. Each fish
 * swims via fishNavigator; this behavior tracks lifetimes, shrinks expired
 * instances, disposes them, and spawns replacements to keep the count steady.
 *
 * Spawn positions are sampled in world space from the volume collider, outside a
 * optional inner exclusion radius, outside an optional exclusion volume collider,
 * and outside the active camera frustum. Instances
 * are parented to the scene root so they do not follow the spawner or train.
 */
export default class animalSpawner extends Behavior
{
  @exposed({ type: "list", of: "entity", label: "Prefabs", spawnTemplate: true })
  prefabs: (Entity | null)[] = [];

  @exposed({ type: "entity", label: "Spawn volume (collider)" })
  spawnVolume: Entity | null = null;

  @exposed({ type: "entity", label: "Exclusion volume (collider)" })
  exclusionVolume: Entity | null = null;

  @exposed({ type: "entity", label: "Train Collider" })
  trainCollider: Entity | null = null;

  @exposed({ type: "entity", label: "Water Collider" })
  waterCollider: Entity | null = null;

  @exposed({ min: 1, step: 1, label: "Spawn count" })
  spawnCount = 10;

  @exposed({ min: 0, step: 0.1, label: "Spawn interval (s)" })
  spawnInterval = 0.5;

  @exposed({ min: 0, max: 360, label: "Random yaw range (deg)" })
  randomYawRange = 360;

  @exposed({ min: 0.1, max: 300, label: "Min lifetime (s)" })
  lifetimeMin = 60;

  @exposed({ min: 0.1, max: 600, label: "Max lifetime (s)" })
  lifetimeMax = 120;

  @exposed({ min: 0.1, max: 30, step: 0.1, label: "Grow duration (s)" })
  growDuration = 3;

  @exposed({ min: 0.1, max: 30, step: 0.1, label: "Shrink duration (s)" })
  shrinkDuration = 3;

  @exposed({ min: 0, step: 0.1, label: "Water entry delay (s)" })
  waterEntryDelay = 3;

  @exposed({ step: 0.1, label: "Spawn below world Y (m)" })
  minimumDepth = 0;

  @exposed({ min: 0, step: 0.1, label: "Min spawn distance from center" })
  minSpawnDistance = 0;

  @exposed({ min: 0.05, max: 10, step: 0.05, label: "Spawn clearance radius (m)" })
  spawnClearanceRadius = 0.5;

  private livePrefabs: Entity[] = [];
  private readonly trackedFish: TrackedFish[] = [];
  private readonly zeroScale = new Vector3(0, 0, 0);
  private readonly growScaleScratch = new Vector3();
  private initialSpawnStarted = false;
  private setupComplete = false;
  private trainInsideWater = false;
  private spawnDelayRemaining: number | null = null;
  private triggerObserver: Observer<IBasePhysicsCollisionEvent> | null = null;
  private exclusionVolumeAttachment: AttachmentOfType<"COLLIDER"> | undefined;
  private readonly clearanceRayResult = new PhysicsRaycastResult();
  private readonly clearanceRayEnd = new Vector3();
  private readonly interiorRayResult = new PhysicsRaycastResult();
  private readonly interiorRayStart = new Vector3();
  private readonly interiorRayEnd = new Vector3();

  /** Per-segment length for the interior parity ray (meters). Effectively infinite for level-scale geometry. */
  private static readonly INTERIOR_RAY_SEGMENT_LENGTH = 1e9;

  private static readonly CLEARANCE_DIRECTIONS: readonly Vector3[] = [
    new Vector3(1, 0, 0),
    new Vector3(-1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, -1, 0),
    new Vector3(0, 0, 1),
    new Vector3(0, 0, -1),
  ];

  OnStart(): void
  {
    this.livePrefabs = this.prefabs.filter((prefab): prefab is Entity => prefab !== null);
    if (this.livePrefabs.length === 0)
    {
      console.warn("[animalSpawner] no prefabs assigned");
      return;
    }

    if (this.spawnVolume === null)
    {
      console.warn("[animalSpawner] spawn volume not assigned");
      return;
    }

    const collider = this.spawnVolume.GetAttachment("COLLIDER");
    if (collider === undefined)
    {
      console.warn(`[animalSpawner] "${this.spawnVolume.name}" has no collider`);
      return;
    }

    if (this.trainCollider === null)
    {
      console.warn("[animalSpawner] train collider not assigned");
      return;
    }

    if (this.waterCollider === null)
    {
      console.warn("[animalSpawner] water collider not assigned");
      return;
    }

    const waterAttachment = this.waterCollider.GetAttachment("COLLIDER");
    if (waterAttachment === undefined)
    {
      console.warn(`[animalSpawner] "${this.waterCollider.name}" has no collider`);
      return;
    }

    if (!waterAttachment.data.isTrigger)
    {
      console.warn(
        `[animalSpawner] "${this.waterCollider.name}" collider is not a trigger — assign the water volume trigger`
      );
      return;
    }

    const trainAttachment = this.trainCollider.GetAttachment("COLLIDER");
    if (trainAttachment === undefined)
    {
      console.warn(`[animalSpawner] "${this.trainCollider.name}" has no collider`);
      return;
    }

    if (trainAttachment.data.isTrigger)
    {
      console.warn(
        `[animalSpawner] "${this.trainCollider.name}" collider is a trigger — use a solid train collider`
      );
      return;
    }

    if (this.trainCollider.body === undefined)
    {
      console.warn(
        `[animalSpawner] "${this.trainCollider.name}" has no physics body — add RIGIDBODY (DYNAMIC or ANIMATED)`
      );
      return;
    }

    if (this.exclusionVolume !== null)
    {
      this.exclusionVolumeAttachment = this.exclusionVolume.GetAttachment("COLLIDER");

      if (this.exclusionVolumeAttachment === undefined)
      {
        console.warn(
          `[animalSpawner] exclusion volume "${this.exclusionVolume.name}" has no collider`
        );
      }
      else if (!this.exclusionVolumeAttachment.data.isTrigger)
      {
        console.warn(
          `[animalSpawner] exclusion volume "${this.exclusionVolume.name}" is not a trigger — `
          + "use a BOX or SPHERE trigger with auto-fit or manual size for reliable polling"
        );
      }
    }

    this.setupComplete = true;
    this.WireWaterTriggerTracking();
  }

  OnDestroy(): void
  {
    this.triggerObserver?.remove();
    this.triggerObserver = null;
  }

  OnUpdate(deltaSeconds: number): void
  {
    if (!this.setupComplete || this.spawnVolume === null || this.livePrefabs.length === 0)
    {
      return;
    }

    if (!this.initialSpawnStarted && this.trainInsideWater && this.spawnDelayRemaining !== null)
    {
      if (this.spawnDelayRemaining > 0)
      {
        this.spawnDelayRemaining -= deltaSeconds;
      }

      if (this.spawnDelayRemaining <= 0 && this.IsTrainAtMinimumDepth())
      {
        this.initialSpawnStarted = true;
        void this.SpawnInitialPool().catch((error) =>
        {
          console.error("[animalSpawner] initial spawn failed", error);
        });
      }
    }

    for (let index = this.trackedFish.length - 1; index >= 0; index--)
    {
      const tracked = this.trackedFish[index];

      if (tracked.entity.node.isDisposed())
      {
        this.trackedFish.splice(index, 1);
        continue;
      }

      if (this.IsEntityInsideExclusionVolume(tracked.entity))
      {
        tracked.entity.node.dispose();
        this.trackedFish.splice(index, 1);

        if (this.CanSpawn())
        {
          void this.SpawnOne().catch((error) =>
          {
            console.error("[animalSpawner] replacement spawn after exclusion failed", error);
          });
        }
        continue;
      }

      if (tracked.isGrowing)
      {
        this.UpdateGrow(tracked, deltaSeconds);
        continue;
      }

      if (tracked.isShrinking)
      {
        this.UpdateShrink(tracked, deltaSeconds, index);
        continue;
      }

      tracked.lifetimeRemaining -= deltaSeconds;
      if (tracked.lifetimeRemaining <= 0)
      {
        this.BeginShrink(tracked);
      }
    }
  }

  /** Fill the pool up to spawnCount once the train enters the water trigger. */
  private async SpawnInitialPool(): Promise<void>
  {
    let spawnedCount = 0;
    let consecutiveFailures = 0;

    while (spawnedCount < this.spawnCount && this.CanSpawn())
    {
      if (spawnedCount > 0 && this.spawnInterval > 0)
      {
        await Sleep(this.spawnInterval);
      }

      if (!this.CanSpawn())
      {
        return;
      }

      const spawned = await this.SpawnOne();
      if (spawned)
      {
        spawnedCount++;
        consecutiveFailures = 0;
      }
      else
      {
        consecutiveFailures++;
        if (consecutiveFailures >= 64)
        {
          break;
        }
      }
    }
  }

  /** Sample the spawn volume in current world space (follows parent motion each call). */
  private GetSpawnBounds(): WorldBounds | null
  {
    if (this.spawnVolume === null)
    {
      return null;
    }

    const collider = this.spawnVolume.GetAttachment("COLLIDER");
    if (collider === undefined)
    {
      return null;
    }

    return ComputeWorldBounds(collider, this.spawnVolume.node);
  }

  /** Spawn one fish inside the volume and begin tracking its lifetime. */
  private async SpawnOne(): Promise<boolean>
  {
    if (!this.CanSpawn())
    {
      return false;
    }

    const bounds = this.GetSpawnBounds();
    if (bounds === null)
    {
      return false;
    }

    const worldPosition = this.SampleSpawnPosition(bounds);
    if (worldPosition === null)
    {
      return false;
    }

    if (this.IsPointInsideExclusionVolume(worldPosition))
    {
      return false;
    }

    if (this.IsPointOverlappingSolidHavokCollider(worldPosition))
    {
      return false;
    }

    const template = this.livePrefabs[Math.floor(Math.random() * this.livePrefabs.length)];
    const targetScale = template.node.scaling.clone();

    const handle = await this.spawner.Spawn(template, {
      position: worldPosition,
      rotationQuaternion: this.ComputeYaw(),
      parent: null,
      scaling: this.zeroScale,
    });

    if (this.spawnVolume !== null)
    {
      this.spawnVolume.node.computeWorldMatrix(true);
      const spawnerWorldPosition = this.spawnVolume.node.getAbsolutePosition();
      console.log(
        `[animalSpawner] spawned "${template.name}" at world (${worldPosition.x.toFixed(2)}, ${worldPosition.y.toFixed(2)}, ${worldPosition.z.toFixed(2)}) | spawner world position (${spawnerWorldPosition.x.toFixed(2)}, ${spawnerWorldPosition.y.toFixed(2)}, ${spawnerWorldPosition.z.toFixed(2)})`
      );
    }

    this.trackedFish.push({
      entity: handle.rootEntity,
      lifetimeRemaining: RandomInRange(this.lifetimeMin, this.lifetimeMax),
      isGrowing: true,
      growElapsed: 0,
      targetScale,
      isShrinking: false,
      shrinkElapsed: 0,
      startScale: targetScale,
    });
    return true;
  }

  /** Start the shrink phase for one tracked fish. */
  private BeginShrink(tracked: TrackedFish): void
  {
    tracked.isShrinking = true;
    tracked.shrinkElapsed = 0;
    tracked.startScale = tracked.entity.node.scaling.clone();
  }

  /** Grow a newly spawned fish from zero scale to its authored size. */
  private UpdateGrow(tracked: TrackedFish, deltaSeconds: number): void
  {
    tracked.growElapsed += deltaSeconds;
    const progress = Math.min(tracked.growElapsed / this.growDuration, 1.0);
    Vector3.LerpToRef(this.zeroScale, tracked.targetScale, progress, this.growScaleScratch);
    tracked.entity.node.scaling.copyFrom(this.growScaleScratch);

    if (progress >= 1.0)
    {
      tracked.isGrowing = false;
      tracked.entity.node.scaling.copyFrom(tracked.targetScale);
    }
  }

  /** Shrink one fish; dispose and respawn when the animation completes. */
  private UpdateShrink(tracked: TrackedFish, deltaSeconds: number, index: number): void
  {
    tracked.shrinkElapsed += deltaSeconds;
    const progress = Math.min(tracked.shrinkElapsed / this.shrinkDuration, 1.0);
    tracked.entity.node.scaling = tracked.startScale.scale(1.0 - progress);

    if (progress < 1.0)
    {
      return;
    }

    tracked.entity.node.dispose();
    this.trackedFish.splice(index, 1);

    void this.SpawnOne().catch((error) =>
    {
      console.error("[animalSpawner] replacement spawn failed", error);
    });
  }

  /** Listen for Havok trigger overlap between the train and water bodies. */
  private WireWaterTriggerTracking(): void
  {
    const plugin = this.scene.getPhysicsEngine()?.getPhysicsPlugin();
    if (!(plugin instanceof HavokPlugin))
    {
      console.warn("[animalSpawner] Havok physics is required for water-entry detection");
      return;
    }

    this.triggerObserver = plugin.onTriggerCollisionObservable.add((collisionEvent) =>
    {
      const entityA = EntityFromBody(collisionEvent.collider);
      const entityB = EntityFromBody(collisionEvent.collidedAgainst);
      if (entityA === null || entityB === null)
      {
        return;
      }

      if (!this.IsTrainWaterPair(entityA, entityB))
      {
        return;
      }

      if (collisionEvent.type === "TRIGGER_ENTERED")
      {
        this.trainInsideWater = true;

        if (!this.initialSpawnStarted)
        {
          this.spawnDelayRemaining = this.waterEntryDelay;
        }
      }
      else if (collisionEvent.type === "TRIGGER_EXITED")
      {
        this.trainInsideWater = false;
        this.spawnDelayRemaining = null;
      }
    });
  }

  /** Whether the train is inside the water trigger and deep enough to spawn. */
  private CanSpawn(): boolean
  {
    return this.trainInsideWater && this.IsTrainAtMinimumDepth();
  }

  /**
   * Whether the train collider has descended to the authored spawn depth.
   * minimumDepth is a Babylon world Y coordinate — negative below sea level —
   * so it is compared against the train's world Y directly rather than
   * against a distance from world zero.
   */
  private IsTrainAtMinimumDepth(): boolean
  {
    if (this.trainCollider === null)
    {
      return false;
    }

    this.trainCollider.node.computeWorldMatrix(true);

    return this.trainCollider.node.getAbsolutePosition().y <= this.minimumDepth;
  }

  /** Whether a trigger event involves the assigned train and water entities. */
  private IsTrainWaterPair(entityA: Entity, entityB: Entity): boolean
  {
    if (this.trainCollider === null || this.waterCollider === null)
    {
      return false;
    }

    return (entityA === this.trainCollider && entityB === this.waterCollider)
      || (entityA === this.waterCollider && entityB === this.trainCollider);
  }

  private ComputeYaw(): Quaternion
  {
    if (this.randomYawRange <= 0)
    {
      return Quaternion.Identity();
    }

    const yawRadians = (Math.random() * 2 - 1) * (this.randomYawRange * Math.PI) / 180;
    return Quaternion.RotationAxis(Vector3.Up(), yawRadians);
  }

  /**
   * Sample a random point inside the spawn bounds, excluding a spherical region
   * around the volume center, points inside the exclusion volume, points visible
   * to the active camera, and points overlapping any solid Havok collider (the
   * spawn volume and triggers are ignored).
   */
  private SampleSpawnPosition(bounds: WorldBounds): Vector3 | null
  {
    const center = new Vector3(
      (bounds.min.x + bounds.max.x) * 0.5,
      (bounds.min.y + bounds.max.y) * 0.5,
      (bounds.min.z + bounds.max.z) * 0.5
    );
    const minDistanceSquared = this.minSpawnDistance * this.minSpawnDistance;
    const maxAttempts = 64;

    const sampleUniform = (): Vector3 =>
    {
      return new Vector3(
        bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x),
        bounds.min.y + Math.random() * (bounds.max.y - bounds.min.y),
        bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z)
      );
    };

    const isValidCandidate = (candidate: Vector3): boolean =>
    {
      if (this.minSpawnDistance > 0 && Vector3.DistanceSquared(candidate, center) < minDistanceSquared)
      {
        return false;
      }

      if (this.IsPointVisibleToCamera(candidate))
      {
        return false;
      }

      if (this.IsPointInsideExclusionVolume(candidate))
      {
        return false;
      }

      return !this.IsPointOverlappingSolidHavokCollider(candidate);
    };

    for (let attempt = 0; attempt < maxAttempts; attempt++)
    {
      const candidate = sampleUniform();
      if (isValidCandidate(candidate))
      {
        return candidate;
      }
    }

    if (this.minSpawnDistance <= 0)
    {
      return null;
    }

    const direction = new Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    );
    if (direction.lengthSquared() < 0.0001)
    {
      direction.set(1, 0, 0);
    }
    direction.normalize();

    const fallback = center.add(direction.scale(this.minSpawnDistance));
    fallback.x = Math.max(bounds.min.x, Math.min(bounds.max.x, fallback.x));
    fallback.y = Math.max(bounds.min.y, Math.min(bounds.max.y, fallback.y));
    fallback.z = Math.max(bounds.min.z, Math.min(bounds.max.z, fallback.z));

    if (isValidCandidate(fallback))
    {
      return fallback;
    }

    return null;
  }

  /**
   * Whether a world point overlaps any solid Havok collider. Uses an odd-count
   * interior ray to reject enclosed points, then six axis-aligned clearance
   * rays to enforce standoff from nearby surfaces. The spawn volume and trigger
   * volumes are ignored.
   */
  private IsPointOverlappingSolidHavokCollider(worldPoint: Vector3): boolean
  {
    const plugin = this.scene.getPhysicsEngine()?.getPhysicsPlugin();
    if (plugin instanceof HavokPlugin)
    {
      // Parity first: rejects points fully enclosed by a closed mesh.
      if (this.IsPointInsideClosedSolid(worldPoint, plugin))
      {
        return true;
      }

      // Then require clearance along all six axes.
      return !this.HasClearanceInAllDirections(worldPoint, plugin);
    }

    return this.IsPointOverlappingViaPhysicsBodies(worldPoint);
  }

  /**
   * Whether all six axis-aligned rays from the point are clear of solid
   * colliders within spawnClearanceRadius. Ignorable bodies (triggers,
   * spawn volume, water) are marched past rather than treated as hits.
   */
  private HasClearanceInAllDirections(worldPoint: Vector3, plugin: HavokPlugin): boolean
  {
    const epsilon = 0.001;

    for (const direction of animalSpawner.CLEARANCE_DIRECTIONS)
    {
      this.interiorRayStart.copyFrom(worldPoint);
      this.clearanceRayEnd.set(
        worldPoint.x + direction.x * this.spawnClearanceRadius,
        worldPoint.y + direction.y * this.spawnClearanceRadius,
        worldPoint.z + direction.z * this.spawnClearanceRadius
      );

      let remaining = this.spawnClearanceRadius;

      for (let step = 0; step < 16 && remaining > 0; step++)
      {
        this.clearanceRayResult.reset();
        plugin.raycast(this.interiorRayStart, this.clearanceRayEnd, this.clearanceRayResult, {
          shouldHitTriggers: false,
        });

        if (!this.clearanceRayResult.hasHit || this.clearanceRayResult.body === undefined)
        {
          break; // clear along this axis
        }

        const body = this.clearanceRayResult.body;
        const hitEntity = EntityFromBody(body);
        const ignorable =
          body.shape?.isTrigger === true
          || (hitEntity !== null && this.ShouldIgnoreOverlapEntity(hitEntity));

        if (!ignorable)
        {
          return false; // solid surface within the clearance radius
        }

        // March past the ignorable hit and keep looking.
        const advance = Vector3.Distance(this.interiorRayStart, this.clearanceRayResult.hitPointWorld) + epsilon;
        if (advance <= epsilon)
        {
          break; // no forward progress
        }
        remaining -= advance;
        this.interiorRayStart.copyFrom(this.clearanceRayResult.hitPointWorld);
        this.interiorRayStart.addInPlace(direction.scale(epsilon));
      }
    }

    return true;
  }

  /**
   * Whether the point is inside any closed solid collider. Casts an upward
   * ray in marched segments, counting surface crossings per body; an odd
   * count means the point is enclosed. Each segment extends far enough to
   * treat the cast as infinite for level-scale geometry. Relies on Havok
   * reporting both front and back faces of mesh shapes.
   */
  private IsPointInsideClosedSolid(worldPoint: Vector3, plugin: HavokPlugin): boolean
  {
    const hitCounts = new Map<PhysicsBody, number>();
    const epsilon = 0.001;

    this.interiorRayStart.copyFrom(worldPoint);

    for (let step = 0; step < 64; step++)
    {
      this.interiorRayEnd.set(
        this.interiorRayStart.x,
        this.interiorRayStart.y + animalSpawner.INTERIOR_RAY_SEGMENT_LENGTH,
        this.interiorRayStart.z
      );

      this.interiorRayResult.reset();
      plugin.raycast(this.interiorRayStart, this.interiorRayEnd, this.interiorRayResult, {
        shouldHitTriggers: false,
      });

      if (!this.interiorRayResult.hasHit || this.interiorRayResult.body === undefined)
      {
        break;
      }

      const body = this.interiorRayResult.body;
      const hitEntity = EntityFromBody(body);
      const ignorable =
        body.shape?.isTrigger === true
        || (hitEntity !== null && this.ShouldIgnoreOverlapEntity(hitEntity));

      if (!ignorable)
      {
        hitCounts.set(body, (hitCounts.get(body) ?? 0) + 1);
      }

      const hitY = this.interiorRayResult.hitPointWorld.y;
      if (hitY + epsilon <= this.interiorRayStart.y)
      {
        break; // no forward progress
      }
      this.interiorRayStart.y = hitY + epsilon;
    }

    for (const count of hitCounts.values())
    {
      if (count % 2 === 1)
      {
        return true;
      }
    }

    return false;
  }

  /**
   * Fallback when Havok is unavailable: test registered physics
   * bodies using their Havok-built world bounding boxes.
   */
  private IsPointOverlappingViaPhysicsBodies(worldPoint: Vector3): boolean
  {
    const physicsEngine = this.scene.getPhysicsEngine() as PhysicsBodyQueryEngine | null;
    if (physicsEngine === null || physicsEngine === undefined)
    {
      return false;
    }

    for (const body of physicsEngine.getBodies())
    {
      if (body.shape?.isTrigger === true)
      {
        continue;
      }

      const hitEntity = EntityFromBody(body);
      if (hitEntity !== null && this.ShouldIgnoreOverlapEntity(hitEntity))
      {
        continue;
      }

      if (body.getBoundingBox().intersectsPoint(worldPoint))
      {
        return true;
      }
    }

    return false;
  }

  /** Whether a tracked entity's world position lies inside the exclusion volume. */
  private IsEntityInsideExclusionVolume(entity: Entity): boolean
  {
    if (this.exclusionVolume === null)
    {
      return false;
    }

    const collider = this.exclusionVolumeAttachment;
    if (collider === undefined)
    {
      return false;
    }

    if (collider.data.isTrigger)
    {
      return IsEntityInsideColliderVolume(entity, this.exclusionVolume, collider);
    }

    entity.node.computeWorldMatrix(true);
    return IsPointInsideManualCollider(
      collider,
      this.exclusionVolume.node,
      entity.node.getAbsolutePosition()
    );
  }

  /** Whether a world point lies inside the optional exclusion volume collider. */
  private IsPointInsideExclusionVolume(worldPoint: Vector3): boolean
  {
    if (this.exclusionVolume === null)
    {
      return false;
    }

    const collider = this.exclusionVolumeAttachment;
    if (collider === undefined)
    {
      return false;
    }

    if (collider.data.isTrigger)
    {
      return IsPointInsideColliderVolume(worldPoint, this.exclusionVolume, collider);
    }

    return IsPointInsideManualCollider(collider, this.exclusionVolume.node, worldPoint);
  }

  /** Entities whose colliders should not block spawn sampling. */
  private ShouldIgnoreOverlapEntity(entity: Entity): boolean
  {
    if (entity === this.spawnVolume)
    {
      return true;
    }

    if (this.exclusionVolume !== null && entity === this.exclusionVolume)
    {
      return true;
    }

    if (this.waterCollider !== null && entity === this.waterCollider)
    {
      return true;
    }

    const collider = entity.GetAttachment("COLLIDER");
    if (collider !== undefined && collider.data.isTrigger)
    {
      return true;
    }

    return false;
  }

  /** Whether a world point lies inside the active camera frustum. */
  private IsPointVisibleToCamera(worldPosition: Vector3): boolean
  {
    // activeCamera is Nullable but can be undefined at runtime.
    if (!this.scene.activeCamera)
    {
      return false;
    }

    const camera = this.scene.activeCamera;
    const frustumPlanes = Frustum.GetPlanes(camera.getTransformationMatrix());
    return Frustum.IsPointInFrustum(worldPosition, frustumPlanes);
  }
}

interface TrackedFish
{
  entity: Entity;
  lifetimeRemaining: number;
  isGrowing: boolean;
  growElapsed: number;
  targetScale: Vector3;
  isShrinking: boolean;
  shrinkElapsed: number;
  startScale: Vector3;
}

interface WorldBounds
{
  min: Vector3;
  max: Vector3;
}

/** Expand a local AABB by the node's world transform. */
function ExpandToWorld(localMin: Vector3, localMax: Vector3, node: TransformNode): WorldBounds
{
  const corners = [
    new Vector3(localMin.x, localMin.y, localMin.z),
    new Vector3(localMax.x, localMin.y, localMin.z),
    new Vector3(localMin.x, localMax.y, localMin.z),
    new Vector3(localMax.x, localMax.y, localMin.z),
    new Vector3(localMin.x, localMin.y, localMax.z),
    new Vector3(localMax.x, localMin.y, localMax.z),
    new Vector3(localMin.x, localMax.y, localMax.z),
    new Vector3(localMax.x, localMax.y, localMax.z),
  ];

  node.computeWorldMatrix(true);
  const worldMatrix = node.getWorldMatrix();

  let worldMin = Vector3.TransformCoordinates(corners[0], worldMatrix);
  let worldMax = worldMin.clone();

  for (let index = 1; index < corners.length; index++)
  {
    const corner = Vector3.TransformCoordinates(corners[index], worldMatrix);
    worldMin = Vector3.Minimize(worldMin, corner);
    worldMax = Vector3.Maximize(worldMax, corner);
  }

  return { min: worldMin, max: worldMax };
}

function ComputeWorldBounds(
  collider: AttachmentOfType<"COLLIDER">,
  node: TransformNode
): WorldBounds
{
  const { shape, size, radius, height, center } = collider.data;
  const half = (vector: Vector3): Vector3 => vector.scale(0.5);

  const localCenter = new Vector3(center[0], center[1], center[2]);

  let localMin: Vector3;
  let localMax: Vector3;

  switch (shape)
  {
    case "BOX":
    {
      const halfSize = half(new Vector3(size[0], size[1], size[2]));
      localMin = localCenter.subtract(halfSize);
      localMax = localCenter.add(halfSize);
      break;
    }

    case "SPHERE":
    {
      localMin = localCenter.subtract(new Vector3(radius, radius, radius));
      localMax = localCenter.add(new Vector3(radius, radius, radius));
      break;
    }

    case "CAPSULE":
    {
      localMin = localCenter.subtract(new Vector3(radius, height * 0.5, radius));
      localMax = localCenter.add(new Vector3(radius, height * 0.5, radius));
      break;
    }

    case "CYLINDER":
    {
      localMin = localCenter.subtract(new Vector3(radius, height * 0.5, radius));
      localMax = localCenter.add(new Vector3(radius, height * 0.5, radius));
      break;
    }

    default:
      throw new Error(`[animalSpawner] unsupported collider shape "${shape}"`);
  }

  return ExpandToWorld(localMin, localMax, node);
}

/** Whether a world-space point lies inside a manual (non-trigger) collider shape. */
function IsPointInsideManualCollider(
  collider: AttachmentOfType<"COLLIDER">,
  node: TransformNode,
  worldPoint: Vector3
): boolean
{
  const { shape, size, radius, height, center } = collider.data;
  const localCenter = new Vector3(center[0], center[1], center[2]);

  node.computeWorldMatrix(true);
  const inverseWorldMatrix = Matrix.Invert(node.getWorldMatrix());
  const localPoint = Vector3.TransformCoordinates(worldPoint, inverseWorldMatrix);
  const offset = localPoint.subtract(localCenter);

  switch (shape)
  {
    case "BOX":
    {
      const halfSize = new Vector3(size[0], size[1], size[2]).scale(0.5);
      return Math.abs(offset.x) <= halfSize.x
        && Math.abs(offset.y) <= halfSize.y
        && Math.abs(offset.z) <= halfSize.z;
    }

    case "SPHERE":
    {
      return offset.length() <= radius;
    }

    case "CAPSULE":
    {
      const halfHeight = height * 0.5;
      const xzDistance = Math.sqrt(offset.x * offset.x + offset.z * offset.z);

      if (Math.abs(offset.y) <= halfHeight)
      {
        return xzDistance <= radius;
      }

      const capCenterY = offset.y > 0 ? halfHeight : -halfHeight;
      const capOffset = new Vector3(offset.x, offset.y - capCenterY, offset.z);
      return capOffset.length() <= radius;
    }

    case "CYLINDER":
    {
      const halfHeight = height * 0.5;
      const xzDistance = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
      return xzDistance <= radius && Math.abs(offset.y) <= halfHeight;
    }

    default:
      return false;
  }
}

/** Resolve a physics body back to its owning entity. */
function EntityFromBody(body: PhysicsBody): Entity | null
{
  const metadata = body.transformNode?.metadata as { bjsEntity?: Entity } | undefined;
  return metadata?.bjsEntity ?? null;
}

function RandomInRange(min: number, max: number): number
{
  return min + Math.random() * (max - min);
}

function Sleep(seconds: number): Promise<void>
{
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
