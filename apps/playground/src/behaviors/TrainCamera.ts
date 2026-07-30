import { Behavior, exposed, CopyLens, FindCameraForNode, type Entity } from "@bjs/engine";
import {
  ArcRotateCamera,
  PhysicsRaycastResult,
  Tools,
  Vector3,
  type Observer,
  type Scene,
} from "@babylonjs/core";

interface PhysicsRaycastEngine
{
  raycastToRef(
    from: Vector3,
    to: Vector3,
    result: PhysicsRaycastResult | PhysicsRaycastResult[],
  ): void;
}

/** Max radians of alpha/beta change per collision sample — limits fast-orbit tunneling. */
const MAX_ORBIT_STEP_RADIANS = 0.05;

/** Max zoom delta (meters) per collision sample — limits scroll/inertia tunneling. */
const MAX_RADIUS_STEP_METERS = 0.5;

/** Max world-space camera travel (meters) per collision sample — limits arc tunneling. */
const MAX_CAMERA_STEP_METERS = 0.5;

/** Absolute floor for collision pull-in (minRadius only limits free zoom). */
const COLLISION_RADIUS_FLOOR = 0.1;

/**
 * Manual orbit camera around a target with collision via proximity raycasts.
 *
 * Drag to orbit, scroll to zoom. Obstacles between the lens and target do not
 * pull the orbit inward — you can orbit behind cover without the view snapping
 * toward the target. Rays from the camera only push it out when it is flush
 * against or inside solid geometry. Left/right lateral probes block orbit rotation
 * that would swing the lens into a nearby wall.
 *
 * Blender setup:
 * - Attach this script to an empty (the camera pivot).
 * - Pick a **Target** entity to orbit around.
 * - Optional **Ignore Colliders**: entities whose bodies should never pull the
 *   camera in (e.g. the train or large parent meshes the ray would otherwise hit).
 * - Optional **Collider Probe**: a child collider used by other scripts (e.g.
 *   FogChanger) that should track the camera. Collision itself does not use it.
 * - **Min Distance** / **Max Distance** clamp scroll zoom; collision may still
 *   pull in below Min Distance when a wall is closer than that floor.
 * - **Collision Offset** is standoff from surfaces (plus near-plane padding). A
 *   downward probe keeps the camera above ground even when the target→camera
 *   ray misses the floor (common when the target is elevated).
 * - FOV / clip planes come from the Blender camera on this entity — copied with
 *   `FindCameraForNode` + `CopyLens` (do not re-author FOV in the script).
 */
export default class TrainCamera extends Behavior
{
  @exposed({ type: "entity", label: "Target" })
  target: Entity | null = null;

  @exposed({ type: "list", of: "entity", label: "Ignore Colliders" })
  ignoreColliders: (Entity | null)[] = [];

  @exposed({ type: "entity", label: "Collider Probe" })
  colliderProbe: Entity | null = null;

  @exposed({ min: 0.1, max: 10000, label: "Radius" })
  radius = 10;

  @exposed({ min: -89, max: 89, label: "Pitch (deg)" })
  pitch = 30;

  @exposed({ min: 0.1, max: 10000, label: "Min Distance" })
  minRadius = 1;

  @exposed({ min: 0.1, max: 10000, label: "Max Distance" })
  maxDistance = 10000;

  @exposed({ min: 0, max: 100, label: "Collision Offset" })
  collisionOffset = 0.5;

  private camera: ArcRotateCamera | null = null;
  private preferredRadius = 10;
  private lastAppliedRadius = 10;
  private lastOrbitAlpha = 0;
  private lastOrbitBeta = 0;
  private beforeRenderObserver: Observer<Scene> | null = null;
  private raycastHits: PhysicsRaycastResult[] = [];
  private rayStart = new Vector3();
  private rayEnd = new Vector3();
  private lastCameraWorldPosition = new Vector3();
  private stepStartPosition = new Vector3();
  private stepEndPosition = new Vector3();
  private sweepSafePosition = new Vector3();
  private travelEstimateEnd = new Vector3();
  private probeSyncPosition = new Vector3();
  private rayDirectionScratch = new Vector3();
  private cameraRightScratch = new Vector3();
  private lateralOffsetScratch = new Vector3();
  private lastBlockingHitNormal = new Vector3();
  private standoffLiftScratch = new Vector3();

  /** Create the arc camera and wire collision clamping after pointer input. */
  OnStart(): void
  {
    const position = this.node.getAbsolutePosition();
    this.preferredRadius = this.ClampPreferredRadius(this.radius);
    this.lastAppliedRadius = this.preferredRadius;

    // Capture lens from the exported Blender camera before we replace activeCamera.
    const authoredCamera = FindCameraForNode(this.scene, this.node);

    this.camera = new ArcRotateCamera(
      this.node.name,
      0,
      Tools.ToRadians(this.pitch),
      this.radius,
      Vector3.Zero(),
      this.scene,
    );
    if (authoredCamera !== null)
    {
      CopyLens(authoredCamera, this.camera);
    }
    this.camera.lowerRadiusLimit = COLLISION_RADIUS_FLOOR;
    this.camera.upperRadiusLimit = this.GetMaxDistance();
    this.scene.activeCamera = this.camera;
    this.camera.attachControl(this.scene.getEngine().getRenderingCanvas(), false);

    if (this.target !== null)
    {
      this.camera.setTarget(this.target.node.getAbsolutePosition());
    }

    this.camera.setPosition(position);
    this.preferredRadius = this.ClampPreferredRadius(this.camera.radius);
    this.camera.radius = this.preferredRadius;
    this.lastAppliedRadius = this.camera.radius;
    this.lastOrbitAlpha = this.camera.alpha;
    this.lastOrbitBeta = this.camera.beta;
    this.camera.getViewMatrix();
    this.lastCameraWorldPosition.copyFrom(this.camera.position);

    if (this.colliderProbe !== null)
    {
      this.colliderProbe.node.parent = null;
      this.SyncProbeToCamera();
    }

    // Scene updates cameras (pointer + inertia) before onBeforeRender — clamp here.
    this.beforeRenderObserver = this.scene.onBeforeRenderObservable.add(() =>
    {
      this.ApplyCameraFrame();
    });
  }

  /** Release canvas controls and the before-render observer. */
  OnDestroy(): void
  {
    this.beforeRenderObserver?.remove();
    this.beforeRenderObserver = null;
    this.camera?.detachControl();
  }

  /**
   * Follow the target, step large orbit deltas so rays cannot skip walls, push
   * the camera out when it touches geometry, and sync the optional probe.
   */
  private ApplyCameraFrame(): void
  {
    if (this.camera === null || this.target === null)
    {
      return;
    }

    this.camera.setTarget(this.target.node.getAbsolutePosition());
    this.camera.upperRadiusLimit = this.GetMaxDistance();
    this.RefreshPreferredRadiusFromUserZoom();

    const desiredAlpha = this.camera.alpha;
    const desiredBeta = this.camera.beta;
    const alphaDelta = desiredAlpha - this.lastOrbitAlpha;
    const betaDelta = desiredBeta - this.lastOrbitBeta;
    const radiusDelta = this.preferredRadius - this.lastAppliedRadius;

    this.camera.alpha = desiredAlpha;
    this.camera.beta = desiredBeta;
    this.camera.radius = this.preferredRadius;
    this.camera.getViewMatrix();
    this.travelEstimateEnd.copyFrom(this.camera.position);
    const travelDistance = Vector3.Distance(this.lastCameraWorldPosition, this.travelEstimateEnd);

    this.camera.alpha = this.lastOrbitAlpha;
    this.camera.beta = this.lastOrbitBeta;
    this.camera.radius = this.lastAppliedRadius;

    const stepCount = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(alphaDelta), Math.abs(betaDelta)) / MAX_ORBIT_STEP_RADIANS),
      Math.ceil(Math.abs(radiusDelta) / MAX_RADIUS_STEP_METERS),
      Math.ceil(travelDistance / MAX_CAMERA_STEP_METERS),
    );

    for (let stepIndex = 1; stepIndex <= stepCount; stepIndex++)
    {
      const blend = stepIndex / stepCount;
      this.stepStartPosition.copyFrom(this.camera.position);
      this.camera.alpha = this.lastOrbitAlpha + alphaDelta * blend;
      this.camera.beta = this.lastOrbitBeta + betaDelta * blend;
      this.camera.radius = this.lastAppliedRadius + radiusDelta * blend;
      this.ClampCameraAgainstObstacles();
      this.camera.getViewMatrix();
      this.stepEndPosition.copyFrom(this.camera.position);

      if (this.IsCameraTooCloseLaterally())
      {
        this.camera.setPosition(this.stepStartPosition);
      }
      else
      {
        this.ClampCameraSweep(this.stepStartPosition, this.stepEndPosition);
      }

      this.ClampCameraGroundStandoff();
    }

    this.lastOrbitAlpha = this.camera.alpha;
    this.lastOrbitBeta = this.camera.beta;
    this.lastAppliedRadius = this.camera.radius;
    this.camera.getViewMatrix();
    this.lastCameraWorldPosition.copyFrom(this.camera.position);
    this.SyncProbeToCamera();
  }

  /**
   * ArcRotateCamera scroll writes camera.radius directly. When that differs from
   * the radius we applied last frame, treat it as the user's new preferred zoom.
   * Min/Max Distance limit free zoom — collision may still pull in below Min Distance.
   */
  private RefreshPreferredRadiusFromUserZoom(): void
  {
    if (this.camera === null)
    {
      return;
    }

    if (Math.abs(this.camera.radius - this.lastAppliedRadius) > 0.001)
    {
      this.preferredRadius = this.ClampPreferredRadius(this.camera.radius);
    }
  }

  /** Clamp a free-zoom radius into [Min Distance, Max Distance]. */
  private ClampPreferredRadius(radius: number): number
  {
    return Math.min(this.GetMaxDistance(), Math.max(this.minRadius, radius));
  }

  /** Effective zoom-out ceiling (never below Min Distance). */
  private GetMaxDistance(): number
  {
    return Math.max(this.minRadius, this.maxDistance);
  }

  /**
   * Raycast from the camera toward the orbit target. Line-of-sight occlusion
   * (geometry between lens and target but not touching the camera) is ignored
   * so the user can orbit behind obstacles. Only push the lens out when a hit
   * lies within standoff distance — i.e. the camera is against or inside a surface.
   */
  private ClampCameraAgainstObstacles(): void
  {
    if (this.camera === null || this.target === null)
    {
      return;
    }

    this.camera.getViewMatrix();
    this.rayStart.copyFrom(this.camera.position);
    this.rayEnd.copyFrom(this.camera.getTarget());

    const hitDistance = this.FindClosestBlockingHit(this.rayStart, this.rayEnd);
    if (hitDistance === null)
    {
      return;
    }

    const standoff = this.GetStandoffDistance();
    if (hitDistance >= standoff)
    {
      return;
    }

    this.rayDirectionScratch.copyFrom(this.rayEnd).subtractInPlace(this.rayStart);
    const rayLength = this.rayDirectionScratch.length();
    if (rayLength < 0.0001)
    {
      return;
    }
    this.rayDirectionScratch.scaleInPlace(1 / rayLength);

    const towardCamera = this.rayDirectionScratch.scale(-1);
    const pullback = this.ComputeRayPullback(towardCamera, this.lastBlockingHitNormal);
    const safeDistance = Math.max(0, hitDistance - pullback);
    Vector3.LerpToRef(this.rayStart, this.rayEnd, safeDistance / rayLength, this.sweepSafePosition);
    this.camera.setPosition(this.sweepSafePosition);
  }

  /**
   * Left/right rays from the lens. Returns true when either side hits solid
   * geometry within lateral standoff — the current orbit step should be reverted.
   */
  private IsCameraTooCloseLaterally(): boolean
  {
    if (this.camera === null)
    {
      return false;
    }

    this.camera.getViewMatrix();
    const standoff = this.GetLateralStandoffDistance();
    const probeLength = standoff + Math.max(this.preferredRadius * 0.5, 2);

    this.GetCameraWorldRight(this.cameraRightScratch);

    if (this.IsLateralRayBlocked(this.cameraRightScratch, probeLength, standoff))
    {
      return true;
    }

    this.cameraRightScratch.scaleInPlace(-1);
    return this.IsLateralRayBlocked(this.cameraRightScratch, probeLength, standoff);
  }

  /** World-space camera +X (view-right) unit vector. */
  private GetCameraWorldRight(out: Vector3): void
  {
    if (this.camera === null)
    {
      return;
    }

    this.camera.getDirectionToRef(Vector3.Right(), out);
    out.normalize();
  }

  /** Whether a lateral probe from the lens hits blocking geometry within standoff. */
  private IsLateralRayBlocked(direction: Vector3, probeLength: number, standoff: number): boolean
  {
    if (this.camera === null)
    {
      return false;
    }

    this.rayStart.copyFrom(this.camera.position);
    direction.scaleToRef(probeLength, this.lateralOffsetScratch);
    this.rayEnd.copyFrom(this.rayStart).addInPlace(this.lateralOffsetScratch);

    const hitDistance = this.FindClosestBlockingHit(this.rayStart, this.rayEnd);
    return hitDistance !== null && hitDistance < standoff;
  }

  /**
   * World-space standoff for lateral probes: authored offset, near plane, and
   * the side edge of the near frustum so wide FOV views do not clip corners in.
   */
  private GetLateralStandoffDistance(): number
  {
    if (this.camera === null)
    {
      return this.collisionOffset;
    }

    const halfVerticalFov = this.camera.fov * 0.5;
    const aspectRatio = this.scene.getEngine().getRenderWidth() / this.scene.getEngine().getRenderHeight();
    const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * aspectRatio);
    const nearHalfWidth = this.camera.minZ * Math.tan(halfHorizontalFov);
    return this.collisionOffset + this.camera.minZ + nearHalfWidth;
  }

  /**
   * Raycast along the camera's actual motion segment (not just target→camera).
   * Catches geometry beside the look ray that arc-orbit sub-steps would otherwise skip.
   */
  private ClampCameraSweep(from: Vector3, to: Vector3): void
  {
    if (this.camera === null)
    {
      return;
    }

    const travel = Vector3.Distance(from, to);
    if (travel < 0.0001)
    {
      return;
    }

    const hitDistance = this.FindClosestBlockingHit(from, to);
    if (hitDistance === null)
    {
      return;
    }

    this.rayDirectionScratch.copyFrom(to).subtractInPlace(from);
    const rayLength = this.rayDirectionScratch.length();
    if (rayLength < 0.0001)
    {
      return;
    }
    this.rayDirectionScratch.scaleInPlace(1 / rayLength);

    const pullback = this.ComputeRayPullback(this.rayDirectionScratch, this.lastBlockingHitNormal);
    const safeDistance = Math.max(0, hitDistance - pullback);
    const blend = safeDistance / rayLength;
    Vector3.LerpToRef(from, to, blend, this.sweepSafePosition);
    this.camera.setPosition(this.sweepSafePosition);
  }

  /**
   * Probe straight down from the camera. The target→camera ray often misses the
   * floor when the target is elevated; this keeps the lens above terrain.
   */
  private ClampCameraGroundStandoff(): void
  {
    if (this.camera === null)
    {
      return;
    }

    const standoff = this.GetStandoffDistance();
    const probeLength = standoff + Math.max(this.preferredRadius, 50);

    this.camera.getViewMatrix();
    this.rayStart.copyFrom(this.camera.position);
    this.rayEnd.copyFrom(this.rayStart);
    this.rayEnd.y -= probeLength;

    const hitDistance = this.FindClosestBlockingHit(this.rayStart, this.rayEnd);
    if (hitDistance === null || hitDistance >= standoff)
    {
      return;
    }

    const lift = standoff - hitDistance;
    this.standoffLiftScratch.copyFrom(this.lastBlockingHitNormal).scaleInPlace(lift);
    this.sweepSafePosition.copyFrom(this.camera.position).addInPlace(this.standoffLiftScratch);
    this.camera.setPosition(this.sweepSafePosition);
  }

  /**
   * World-space standoff from geometry: authored offset, near plane, and the
   * bottom edge of the near frustum (so pitched-down views do not clip).
   */
  private GetStandoffDistance(): number
  {
    if (this.camera === null)
    {
      return this.collisionOffset;
    }

    const halfVerticalFov = this.camera.fov * 0.5;
    const nearHalfHeight = this.camera.minZ * Math.tan(halfVerticalFov);
    return this.collisionOffset + this.camera.minZ + nearHalfHeight;
  }

  /**
   * How far to pull the camera toward the ray origin so surface standoff along
   * the hit normal is satisfied. Shallow grazes (ground, low orbit) need more
   * pullback than minZ + offset measured only along the ray.
   */
  private ComputeRayPullback(rayDirection: Vector3, surfaceNormal: Vector3): number
  {
    const standoff = this.GetStandoffDistance();
    const normalAlignment = -Vector3.Dot(rayDirection, surfaceNormal);
    if (normalAlignment <= 0.001)
    {
      return standoff / 0.001;
    }

    return standoff / normalAlignment;
  }

  /**
   * Multi-hit raycast; returns distance to the nearest solid hit, skipping ignored
   * bodies and triggers. Writes the hit normal into {@link lastBlockingHitNormal}.
   */
  private FindClosestBlockingHit(from: Vector3, to: Vector3): number | null
  {
    const physicsEngine = this.scene.getPhysicsEngine() as PhysicsRaycastEngine | null;
    if (physicsEngine === null || physicsEngine === undefined)
    {
      return null;
    }

    this.raycastHits.length = 0;
    physicsEngine.raycastToRef(from, to, this.raycastHits);

    let closestDistance = Infinity;
    let foundHit = false;
    for (const hit of this.raycastHits)
    {
      if (!hit.hasHit || !this.IsBlockingRayHit(hit))
      {
        continue;
      }

      const distance = Vector3.Distance(from, hit.hitPointWorld);
      if (distance < closestDistance)
      {
        closestDistance = distance;
        this.lastBlockingHitNormal.copyFrom(hit.hitNormalWorld);
        foundHit = true;
      }
    }

    if (!foundHit)
    {
      return null;
    }

    return closestDistance;
  }

  /**
   * Ignore hits on the orbit target, authored Ignore Colliders, the optional
   * probe, and trigger volumes — those should not pull the camera in.
   */
  private IsBlockingRayHit(raycastResult: PhysicsRaycastResult): boolean
  {
    const hitBody = raycastResult.body;
    if (hitBody === null || hitBody === undefined)
    {
      return true;
    }

    if (this.IsIgnoredBody(hitBody))
    {
      return false;
    }

    const metadata = hitBody.transformNode?.metadata as { bjsEntity?: Entity } | undefined;
    const hitEntity = metadata?.bjsEntity;
    if (hitEntity === null || hitEntity === undefined)
    {
      return true;
    }

    if (this.IsIgnoredEntity(hitEntity))
    {
      return false;
    }

    const collider = hitEntity.GetAttachment("COLLIDER");
    if (collider !== undefined && collider.data.isTrigger)
    {
      return false;
    }

    return true;
  }

  /** Whether this physics body belongs to Target, Ignore Colliders, or Collider Probe. */
  private IsIgnoredBody(hitBody: NonNullable<PhysicsRaycastResult["body"]>): boolean
  {
    if (this.target?.body !== undefined && hitBody === this.target.body)
    {
      return true;
    }

    if (this.colliderProbe?.body !== undefined && hitBody === this.colliderProbe.body)
    {
      return true;
    }

    for (const ignored of this.ignoreColliders)
    {
      if (ignored !== null && ignored.body !== undefined && hitBody === ignored.body)
      {
        return true;
      }
    }

    return false;
  }

  /** Whether the hit entity was authored in Ignore Colliders. */
  private IsIgnoredEntity(hitEntity: Entity): boolean
  {
    for (const ignored of this.ignoreColliders)
    {
      if (ignored !== null && hitEntity.id === ignored.id)
      {
        return true;
      }
    }

    return false;
  }

  /** Copy the ArcRotateCamera's world position onto the optional probe entity. */
  private SyncProbeToCamera(): void
  {
    if (this.colliderProbe === null || this.camera === null)
    {
      return;
    }

    this.camera.getViewMatrix();
    this.probeSyncPosition.copyFrom(this.camera.position);
    this.colliderProbe.node.setAbsolutePosition(this.probeSyncPosition);
  }
}
