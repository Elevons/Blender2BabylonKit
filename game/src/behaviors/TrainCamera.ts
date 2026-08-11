import {
  Behavior,
  exposed,
  inputMap,
  CopyLens,
  FindCameraForNode,
  type Entity,
  type InputActionMap,
} from "@bjs/engine";
import {
  ArcRotateCamera,
  PhysicsRaycastResult,
  Tools,
  Vector3,
  type Observer,
  type Scene,
} from "@babylonjs/core";
import { VehicleActions } from "../InputActions";

interface PhysicsRaycastEngine
{
  raycastToRef(
    from: Vector3,
    to: Vector3,
    result: PhysicsRaycastResult | PhysicsRaycastResult[],
  ): void;
}

/** Max radians of alpha/beta change per collision sample — limits fast-orbit tunneling. */
const MAX_ORBIT_STEP_RADIANS = 0.025;

/** Max zoom delta (meters) per collision sample — limits scroll/inertia tunneling. */
const MAX_RADIUS_STEP_METERS = 0.25;

/** Max world-space camera travel (meters) per collision sample — limits arc tunneling. */
const MAX_CAMERA_STEP_METERS = 0.25;

/** Absolute floor for collision pull-in (minRadius only limits free zoom). */
const COLLISION_RADIUS_FLOOR = 0.1;

/** Full-stick Look yaw/pitch rate (radians per second). */
const GAMEPAD_LOOK_RADIANS_PER_SECOND = 2.2;

/** Full-press Zoom rate as a fraction of current radius per second (A in / B out). */
const GAMEPAD_ZOOM_RADIUS_FRACTION_PER_SECOND = 1.25;

/** Lateral proximity samples evenly spaced around the horizontal ring. */
const LATERAL_PROBE_DIRECTIONS = 16;

/** Parallel rays on a ring perpendicular to motion — approximates a sphere sweep. */
const SHAPE_SWEEP_RING_SAMPLES = 16;

/** Outward rays when the lens may already be inside solid geometry. */
const PENETRATION_RECOVERY_DIRECTIONS = 16;

/** Push-out passes per sub-step — corners need more than a single deepest hit. */
const PENETRATION_RECOVERY_PASSES = 3;

/**
 * Manual orbit camera around a target with collision via proximity raycasts.
 *
 * Drag (LMB) or right stick to orbit, scroll or A/B to zoom. Obstacles between
 * the lens and target do not pull the orbit inward — you can orbit behind cover
 * without the view snapping toward the target. Rays from the camera only push it
 * out when it is flush against or inside solid geometry. A ring of lateral probes
 * rejects orbit steps that *worsen* clearance (so you can still slide along or
 * pull away from a wall once flush — isotropic "too close" checks freeze the lens
 * inside the standoff bubble). Motion between frames uses a shape sweep (parallel
 * rays offset by standoff) so tangential approaches cannot tunnel. Approach
 * Slowdown brakes orbit/zoom before hard contact.
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
 * - **Approach Slowdown** is how far ahead of that standoff orbit/zoom begins
 *   braking. Motion eases to a stop instead of hard-clamping on contact; set
 *   to 0 for the old immediate stop.
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

  @exposed({ min: 0, max: 100, label: "Approach Slowdown" })
  approachSlowdown = 4;

  /**
   * Extra radial deadzone for Look (right stick), on top of the input layer's
   * 0.15 stick deadzone. 0 = only the engine deadzone; values near 1 ignore almost
   * all stick travel. Output is rescaled so full deflection still reaches 1.
   */
  @exposed({ min: 0, max: 0.95, step: 0.01, label: "Look Deadzone" })
  lookDeadzone = 0.2;

  /** Vehicle map: Look (right stick) and Zoom (A/B) drive this orbit camera. */
  @inputMap("Vehicle") vehicle!: InputActionMap;

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
  private lateralOffsetScratch = new Vector3();
  private lastBlockingHitNormal = new Vector3();
  private standoffLiftScratch = new Vector3();
  private motionRightScratch = new Vector3();
  private motionUpScratch = new Vector3();
  private shapeSweepOffsetScratch = new Vector3();
  private shapeSweepStartScratch = new Vector3();
  private shapeSweepEndScratch = new Vector3();
  private lateralDirectionScratch = new Vector3();
  private lateralReferenceScratch = new Vector3();
  private penetrationDirectionScratch = new Vector3();
  private penetrationPushScratch = new Vector3();

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
   * Approaching solids scales this frame's orbit/zoom so motion brakes gradually
   * instead of stopping hard at contact.
   */
  private ApplyCameraFrame(): void
  {
    if (this.camera === null || this.target === null)
    {
      return;
    }

    this.camera.setTarget(this.target.node.getAbsolutePosition());
    this.camera.upperRadiusLimit = this.GetMaxDistance();

    // Pointer + inertia already wrote alpha/beta/radius; fold in gamepad Look/Zoom.
    const deltaSeconds = this.scene.getEngine().getDeltaTime() / 1000;
    this.ApplyGamepadOrbitInput(deltaSeconds);
    this.RefreshPreferredRadiusFromUserZoom();

    const desiredAlpha = this.camera.alpha;
    const desiredBeta = this.camera.beta;

    this.camera.alpha = desiredAlpha;
    this.camera.beta = desiredBeta;
    this.camera.radius = this.preferredRadius;
    this.camera.getViewMatrix();
    this.travelEstimateEnd.copyFrom(this.camera.position);
    const travelDistance = Vector3.Distance(this.lastCameraWorldPosition, this.travelEstimateEnd);

    // Restore last accepted pose and push out if we ended inside/flush with solids.
    this.camera.alpha = this.lastOrbitAlpha;
    this.camera.beta = this.lastOrbitBeta;
    this.camera.radius = this.lastAppliedRadius;
    this.camera.getViewMatrix();
    this.RecoverCameraFromPenetration();
    this.ClampCameraGroundStandoff();
    this.camera.getViewMatrix();
    this.lastOrbitAlpha = this.camera.alpha;
    this.lastOrbitBeta = this.camera.beta;
    this.lastAppliedRadius = this.camera.radius;
    this.lastCameraWorldPosition.copyFrom(this.camera.position);
    this.sweepSafePosition.copyFrom(this.camera.position);

    let alphaDelta = desiredAlpha - this.lastOrbitAlpha;
    let betaDelta = desiredBeta - this.lastOrbitBeta;
    let radiusDelta = this.preferredRadius - this.lastAppliedRadius;

    const approachScale = this.ComputeApproachSpeedScale(travelDistance);
    alphaDelta *= approachScale;
    betaDelta *= approachScale;
    radiusDelta *= approachScale;

    const stepCount = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(alphaDelta), Math.abs(betaDelta)) / MAX_ORBIT_STEP_RADIANS),
      Math.ceil(Math.abs(radiusDelta) / MAX_RADIUS_STEP_METERS),
      Math.ceil(travelDistance * approachScale / MAX_CAMERA_STEP_METERS),
      Math.ceil(this.lastAppliedRadius * Math.hypot(alphaDelta, betaDelta) / MAX_CAMERA_STEP_METERS),
    );

    for (let stepIndex = 1; stepIndex <= stepCount; stepIndex++)
    {
      const blend = stepIndex / stepCount;
      this.stepStartPosition.copyFrom(this.sweepSafePosition);
      const startClearance = this.MeasureMinLateralClearance(this.stepStartPosition);

      this.camera.alpha = this.lastOrbitAlpha + alphaDelta * blend;
      this.camera.beta = this.lastOrbitBeta + betaDelta * blend;
      this.camera.radius = this.lastAppliedRadius + radiusDelta * blend;
      this.ClampCameraAgainstObstacles();
      this.camera.getViewMatrix();
      this.stepEndPosition.copyFrom(this.camera.position);

      if (this.DidLateralClearanceWorsen(this.stepEndPosition, startClearance))
      {
        break;
      }

      this.ClampCameraSweep(this.stepStartPosition, this.stepEndPosition);
      this.ClampCameraGroundStandoff();
      this.RecoverCameraFromPenetration();
      this.camera.getViewMatrix();

      if (this.DidLateralClearanceWorsen(this.camera.position, startClearance))
      {
        break;
      }

      this.sweepSafePosition.copyFrom(this.camera.position);
    }

    this.camera.setPosition(this.sweepSafePosition);
    this.lastOrbitAlpha = this.camera.alpha;
    this.lastOrbitBeta = this.camera.beta;
    this.lastAppliedRadius = this.camera.radius;
    this.camera.getViewMatrix();
    this.lastCameraWorldPosition.copyFrom(this.camera.position);
    this.SyncProbeToCamera();
  }

  /**
   * 0..1 multiplier for this frame's orbit/zoom based on how soon the intended
   * path meets solid geometry. Uses the center travel ray only — shape-sweep
   * ring samples graze a wall you are already flush with and would freeze
   * slide-away motion. Returns 1 when clear or when Approach Slowdown is 0.
   */
  private ComputeApproachSpeedScale(travelDistance: number): number
  {
    if (this.camera === null || this.approachSlowdown <= 0.001 || travelDistance <= 0.0001)
    {
      return 1;
    }

    const pathHit = this.FindClosestBlockingHit(
      this.lastCameraWorldPosition,
      this.travelEstimateEnd,
    );
    if (pathHit === null)
    {
      return 1;
    }

    const pathStandoff = this.GetStandoffDistance();
    return this.SmoothApproachScale(pathHit, pathStandoff, pathStandoff + this.approachSlowdown);
  }

  /**
   * Smoothstep from 1 (at slowStartDistance) down to 0 (at stopDistance). Full
   * stop at or inside standoff; no damping beyond the slowdown zone.
   */
  private SmoothApproachScale(
    distance: number,
    stopDistance: number,
    slowStartDistance: number,
  ): number
  {
    if (distance <= stopDistance)
    {
      return 0;
    }

    if (distance >= slowStartDistance)
    {
      return 1;
    }

    const normalized = (distance - stopDistance) / (slowStartDistance - stopDistance);
    return normalized * normalized * (3 - 2 * normalized);
  }

  /**
   * Apply Vehicle Look (right stick) and Zoom (A/B) onto the arc camera before
   * collision clamping. Stick Y is flipped by the input layer; A is zoom-in
   * (closer), B is zoom-out. Look applies an additional radial deadzone from
   * {@link lookDeadzone}.
   */
  private ApplyGamepadOrbitInput(deltaSeconds: number): void
  {
    if (this.camera === null || deltaSeconds <= 0)
    {
      return;
    }

    const look = this.ApplyLookDeadzone(
      this.vehicle.FindAction(VehicleActions.Look)?.ReadVector2() ?? { x: 0, y: 0 },
    );
    if (look.x !== 0 || look.y !== 0)
    {
      const lookStep = GAMEPAD_LOOK_RADIANS_PER_SECOND * deltaSeconds;
      this.camera.alpha -= look.x * lookStep;
      this.camera.beta -= look.y * lookStep;

      const lowerBeta = this.camera.lowerBetaLimit ?? 0.01;
      const upperBeta = this.camera.upperBetaLimit ?? Math.PI - 0.01;
      this.camera.beta = Math.min(upperBeta, Math.max(lowerBeta, this.camera.beta));
    }

    const zoom = this.vehicle.FindAction(VehicleActions.Zoom)?.ReadValue() ?? 0;
    if (zoom !== 0)
    {
      const zoomStep = this.preferredRadius * GAMEPAD_ZOOM_RADIUS_FRACTION_PER_SECOND * zoom * deltaSeconds;
      this.preferredRadius = this.ClampPreferredRadius(this.preferredRadius - zoomStep);
    }
  }

  /**
   * Zero Look input inside the radial deadzone; rescale the remainder so full
   * stick deflection still maps to length 1.
   */
  private ApplyLookDeadzone(look: { x: number; y: number }): { x: number; y: number }
  {
    const deadzone = Math.min(Math.max(this.lookDeadzone, 0), 0.95);
    if (deadzone <= 0)
    {
      return look;
    }

    const magnitude = Math.hypot(look.x, look.y);
    if (magnitude <= deadzone)
    {
      return { x: 0, y: 0 };
    }

    const scale = ((magnitude - deadzone) / (1 - deadzone)) / magnitude;
    return { x: look.x * scale, y: look.y * scale };
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
   * True when origin is inside the lateral standoff bubble and closer to a
   * blocker than previousClearance, or deeper than a hard penetration floor.
   * Outside the bubble this never rejects — otherwise open-space "Infinity"
   * clearance would treat any distant wall as a worsening and freeze approach.
   */
  private DidLateralClearanceWorsen(origin: Vector3, previousClearance: number): boolean
  {
    const clearance = this.MeasureMinLateralClearance(origin);
    const standoff = this.GetLateralStandoffDistance();
    const penetrationFloor = Math.min(standoff * 0.25, Math.max(0.05, this.collisionOffset * 0.5));

    if (clearance < penetrationFloor)
    {
      return true;
    }

    if (clearance >= standoff)
    {
      return false;
    }

    return clearance < previousClearance - 0.001;
  }

  /**
   * Closest blocking hit on the horizontal probe ring around origin, or Infinity
   * when no blocker is within the probe length.
   */
  private MeasureMinLateralClearance(origin: Vector3): number
  {
    const standoff = this.GetLateralStandoffDistance();
    const probeLength = standoff + Math.max(this.preferredRadius * 0.5, 2);
    let minClearance = Infinity;

    for (let directionIndex = 0; directionIndex < LATERAL_PROBE_DIRECTIONS; directionIndex++)
    {
      this.GetLateralProbeDirection(directionIndex, this.lateralDirectionScratch);
      this.rayStart.copyFrom(origin);
      this.lateralDirectionScratch.scaleToRef(probeLength, this.lateralOffsetScratch);
      this.rayEnd.copyFrom(this.rayStart).addInPlace(this.lateralOffsetScratch);

      const hitDistance = this.FindClosestBlockingHit(this.rayStart, this.rayEnd);
      if (hitDistance !== null && hitDistance < minClearance)
      {
        minClearance = hitDistance;
      }
    }

    return minClearance;
  }

  /**
   * Unit probe direction on the horizontal ring around the lens. Uses world-up
   * so walls are caught from every azimuth, not only camera-left/right.
   */
  private GetLateralProbeDirection(directionIndex: number, out: Vector3): void
  {
    if (this.camera === null)
    {
      return;
    }

    this.camera.getDirectionToRef(Vector3.Forward(), this.lateralReferenceScratch);
    this.lateralReferenceScratch.y = 0;
    if (this.lateralReferenceScratch.lengthSquared() < 0.0001)
    {
      this.lateralReferenceScratch.set(1, 0, 0);
    }
    else
    {
      this.lateralReferenceScratch.normalize();
    }

    const angle = (directionIndex / LATERAL_PROBE_DIRECTIONS) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const referenceX = this.lateralReferenceScratch.x;
    const referenceZ = this.lateralReferenceScratch.z;

    out.x = referenceX * cosine - referenceZ * sine;
    out.y = 0;
    out.z = referenceX * sine + referenceZ * cosine;
    out.normalize();
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
   * Shape sweep along the camera's motion segment: a center ray plus a ring of
   * parallel rays offset perpendicular to travel by up to standoff. Catches walls
   * beside the path that a single center ray would miss.
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

    const hitDistance = this.FindClosestShapeSweepHit(from, to);
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
   * Closest blocking hit across a center ray and a standoff-radius ring of
   * parallel rays — approximates sweeping a sphere along the motion segment.
   */
  private FindClosestShapeSweepHit(from: Vector3, to: Vector3): number | null
  {
    let closestDistance: number | null = null;

    const centerHit = this.FindClosestBlockingHit(from, to);
    if (centerHit !== null)
    {
      closestDistance = centerHit;
    }

    this.rayDirectionScratch.copyFrom(to).subtractInPlace(from);
    const rayLength = this.rayDirectionScratch.length();
    if (rayLength < 0.0001)
    {
      return closestDistance;
    }
    this.rayDirectionScratch.scaleInPlace(1 / rayLength);

    const standoff = this.GetStandoffDistance();
    this.BuildMotionPerpendicularBasis(this.rayDirectionScratch, this.motionRightScratch, this.motionUpScratch);

    for (let sampleIndex = 0; sampleIndex < SHAPE_SWEEP_RING_SAMPLES; sampleIndex++)
    {
      const angle = (sampleIndex / SHAPE_SWEEP_RING_SAMPLES) * Math.PI * 2;
      const cosineScale = Math.cos(angle) * standoff;
      const sineScale = Math.sin(angle) * standoff;
      this.shapeSweepOffsetScratch
        .copyFrom(this.motionRightScratch)
        .scaleInPlace(cosineScale);
      this.lateralOffsetScratch.copyFrom(this.motionUpScratch).scaleInPlace(sineScale);
      this.shapeSweepOffsetScratch.addInPlace(this.lateralOffsetScratch);

      this.shapeSweepStartScratch.copyFrom(from).addInPlace(this.shapeSweepOffsetScratch);
      this.shapeSweepEndScratch.copyFrom(to).addInPlace(this.shapeSweepOffsetScratch);

      const offsetHit = this.FindClosestBlockingHit(this.shapeSweepStartScratch, this.shapeSweepEndScratch);
      if (offsetHit !== null && (closestDistance === null || offsetHit < closestDistance))
      {
        closestDistance = offsetHit;
      }
    }

    return closestDistance;
  }

  /**
   * Orthonormal axes spanning the plane perpendicular to motionDirection. Falls
   * back when travel is nearly parallel to world up.
   */
  private BuildMotionPerpendicularBasis(
    motionDirection: Vector3,
    outRight: Vector3,
    outUp: Vector3,
  ): void
  {
    Vector3.CrossToRef(motionDirection, Vector3.Up(), outRight);
    if (outRight.lengthSquared() < 0.0001)
    {
      outRight.set(1, 0, 0);
    }
    else
    {
      outRight.normalize();
    }

    Vector3.CrossToRef(outRight, motionDirection, outUp);
    outUp.normalize();
  }

  /**
   * When the lens is already inside or flush with geometry, cast outward (and
   * inward from outside) and push along the deepest penetrating surface normal.
   * Multiple passes clear tight corners where one push reveals another surface.
   */
  private RecoverCameraFromPenetration(): void
  {
    if (this.camera === null)
    {
      return;
    }

    for (let passIndex = 0; passIndex < PENETRATION_RECOVERY_PASSES; passIndex++)
    {
      if (!this.TryPenetrationPushOut())
      {
        return;
      }
    }
  }

  /**
   * Single deepest-hit push. Returns true when the camera moved (caller may
   * iterate). Outward rays catch flush contact; inward rays run only when the
   * outward cast misses — the usual signal that the lens started inside a solid
   * (Havok often reports no hit for inside→out rays).
   */
  private TryPenetrationPushOut(): boolean
  {
    if (this.camera === null)
    {
      return false;
    }

    const standoff = this.GetStandoffDistance();
    const probeLength = standoff * 3 + Math.max(this.preferredRadius * 0.25, 1);
    let deepestPenetration = 0;

    this.camera.getViewMatrix();
    this.rayStart.copyFrom(this.camera.position);

    for (let directionIndex = 0; directionIndex < PENETRATION_RECOVERY_DIRECTIONS; directionIndex++)
    {
      this.GetPenetrationRecoveryDirection(directionIndex, this.penetrationDirectionScratch);

      this.penetrationDirectionScratch.scaleToRef(probeLength, this.rayEnd);
      this.rayEnd.addInPlace(this.rayStart);
      const outwardHit = this.FindClosestBlockingHit(this.rayStart, this.rayEnd);
      if (outwardHit !== null)
      {
        if (outwardHit < standoff)
        {
          const penetration = standoff - outwardHit;
          if (penetration > deepestPenetration)
          {
            deepestPenetration = penetration;
            this.penetrationPushScratch.copyFrom(this.lastBlockingHitNormal);
          }
        }
        continue;
      }

      // No outward hit — cast from outside toward the lens to find an enclosing face.
      this.penetrationDirectionScratch.scaleToRef(probeLength, this.shapeSweepStartScratch);
      this.shapeSweepStartScratch.addInPlace(this.rayStart);
      this.shapeSweepEndScratch.copyFrom(this.rayStart);
      const inwardHit = this.FindClosestBlockingHit(this.shapeSweepStartScratch, this.shapeSweepEndScratch);
      if (inwardHit === null)
      {
        continue;
      }

      const remainingToCamera = probeLength - inwardHit;
      if (remainingToCamera <= 0.001)
      {
        continue;
      }

      const embedPenetration = remainingToCamera + standoff;
      if (embedPenetration > deepestPenetration)
      {
        deepestPenetration = embedPenetration;
        this.penetrationPushScratch.copyFrom(this.lastBlockingHitNormal);
      }
    }

    if (deepestPenetration <= 0.0001)
    {
      return false;
    }

    // Cap a single pass so a bad inward normal cannot fling the camera across the level.
    const maxPush = standoff * 4 + Math.max(this.preferredRadius * 0.5, 2);
    const pushDistance = Math.min(deepestPenetration, maxPush);
    this.penetrationPushScratch.scaleInPlace(pushDistance);
    this.sweepSafePosition.copyFrom(this.camera.position).addInPlace(this.penetrationPushScratch);
    this.camera.setPosition(this.sweepSafePosition);
    return true;
  }

  /**
   * Evenly distributed outward directions on a sphere (Fibonacci lattice) for
   * penetration recovery casts.
   */
  private GetPenetrationRecoveryDirection(directionIndex: number, out: Vector3): void
  {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const sampleCount = PENETRATION_RECOVERY_DIRECTIONS;
    const normalizedIndex = directionIndex + 0.5;
    const y = 1 - (normalizedIndex / sampleCount) * 2;
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * directionIndex;

    out.x = Math.cos(theta) * ringRadius;
    out.y = y;
    out.z = Math.sin(theta) * ringRadius;
    out.normalize();
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
