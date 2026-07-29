import { Behavior, exposed, CopyLens, FindCameraForNode, type Entity } from "@bjs/engine";
import {
  ArcRotateCamera,
  PhysicsRaycastResult,
  Tools,
  Vector3,
  type Observer,
} from "@babylonjs/core";

/** Max radians of alpha/beta change per collision sample — limits fast-orbit tunneling. */
const MAX_ORBIT_STEP_RADIANS = 0.05;

/** Absolute floor for collision pull-in (minRadius only limits free zoom). */
const COLLISION_RADIUS_FLOOR = 0.1;

/**
 * Manual orbit camera around a target with collision via line-of-sight raycast.
 *
 * Drag to orbit, scroll to zoom. Each frame a ray is cast from the target toward
 * the camera; if it hits solid geometry the camera radius is pulled in so the
 * view sits just in front of the obstacle instead of clipping through it.
 *
 * Blender setup:
 * - Attach this script to an empty (the camera pivot).
 * - Pick a **Target** entity to orbit around.
 * - Optional **Ignore Colliders**: entities whose bodies should never pull the
 *   camera in (e.g. the train or large parent meshes the ray would otherwise hit).
 * - Optional **Collider Probe**: a child collider used by other scripts (e.g.
 *   FogChanger) that should track the camera. Collision itself does not use it.
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

  @exposed({ min: 0.1, max: 10000, label: "Min Radius" })
  minRadius = 1;

  @exposed({ min: 0.1, max: 10000, label: "Max Radius" })
  maxRadius = 10000;

  @exposed({ min: 0, max: 100, label: "Collision Offset" })
  collisionOffset = 0.5;

  private camera: ArcRotateCamera | null = null;
  private preferredRadius = 10;
  private lastAppliedRadius = 10;
  private lastOrbitAlpha = 0;
  private lastOrbitBeta = 0;
  private beforeRenderObserver: Observer<unknown> | null = null;
  private raycastResult = new PhysicsRaycastResult();
  private rayStart = new Vector3();
  private rayEnd = new Vector3();
  private probeSyncPosition = new Vector3();

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
    this.camera.upperRadiusLimit = this.GetMaxRadius();
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
   * Follow the target, step large orbit deltas so rays cannot skip walls, pull
   * the camera in along the look ray when blocked, and sync the optional probe.
   */
  private ApplyCameraFrame(): void
  {
    if (this.camera === null || this.target === null)
    {
      return;
    }

    this.camera.setTarget(this.target.node.getAbsolutePosition());
    this.camera.upperRadiusLimit = this.GetMaxRadius();
    this.RefreshPreferredRadiusFromUserZoom();

    const desiredAlpha = this.camera.alpha;
    const desiredBeta = this.camera.beta;
    const alphaDelta = desiredAlpha - this.lastOrbitAlpha;
    const betaDelta = desiredBeta - this.lastOrbitBeta;
    const stepCount = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(alphaDelta), Math.abs(betaDelta)) / MAX_ORBIT_STEP_RADIANS)
    );

    for (let stepIndex = 1; stepIndex <= stepCount; stepIndex++)
    {
      const blend = stepIndex / stepCount;
      this.camera.alpha = this.lastOrbitAlpha + alphaDelta * blend;
      this.camera.beta = this.lastOrbitBeta + betaDelta * blend;
      this.camera.radius = this.preferredRadius;
      this.ClampRadiusAgainstObstacles();
    }

    this.lastOrbitAlpha = this.camera.alpha;
    this.lastOrbitBeta = this.camera.beta;
    this.lastAppliedRadius = this.camera.radius;
    this.SyncProbeToCamera();
  }

  /**
   * ArcRotateCamera scroll writes camera.radius directly. When that differs from
   * the radius we applied last frame, treat it as the user's new preferred zoom.
   * Min/Max Radius limit free zoom — collision may still pull in below Min Radius.
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

  /** Clamp a free-zoom radius into [Min Radius, Max Radius]. */
  private ClampPreferredRadius(radius: number): number
  {
    return Math.min(this.GetMaxRadius(), Math.max(this.minRadius, radius));
  }

  /** Effective zoom-out ceiling (never below Min Radius). */
  private GetMaxRadius(): number
  {
    return Math.max(this.minRadius, this.maxRadius);
  }

  /**
   * Raycast from the orbit target toward the ideal camera position. On a solid
   * hit, shrink radius so the camera sits in front of the surface.
   *
   * Clearance is collisionOffset plus the camera near plane (minZ). Collision
   * may pull below Min Radius — otherwise a high Min Radius forces the camera
   * through walls that are closer than that floor.
   */
  private ClampRadiusAgainstObstacles(): void
  {
    if (this.camera === null || this.target === null)
    {
      return;
    }

    this.camera.getViewMatrix();
    this.rayStart.copyFrom(this.camera.getTarget());
    this.rayEnd.copyFrom(this.camera.position);

    const physicsEngine = this.scene.getPhysicsEngine();
    if (physicsEngine === null || physicsEngine === undefined)
    {
      return;
    }

    physicsEngine.raycastToRef(this.rayStart, this.rayEnd, this.raycastResult);
    if (!this.raycastResult.hasHit)
    {
      return;
    }

    if (!this.IsBlockingRayHit())
    {
      return;
    }

    const hitDistance = Vector3.Distance(this.rayStart, this.raycastResult.hitPointWorld);
    const clearance = this.camera.minZ + this.collisionOffset;
    this.camera.radius = Math.max(COLLISION_RADIUS_FLOOR, hitDistance - clearance);
  }

  /**
   * Ignore hits on the orbit target, authored Ignore Colliders, the optional
   * probe, and trigger volumes — those should not pull the camera in.
   */
  private IsBlockingRayHit(): boolean
  {
    const hitBody = this.raycastResult.body;
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
  private IsIgnoredBody(hitBody: NonNullable<typeof this.raycastResult.body>): boolean
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
