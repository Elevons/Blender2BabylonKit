import {
  Behavior,
  exposed,
  inputMap,
  ReadSceneLevel,
  type Entity,
} from "@bjs/engine";
import type { ConstraintAxisName, ConstraintComponent, InputActionMap } from "@bjs/engine";
import {
  Color3,
  LinesMesh,
  Matrix,
  MeshBuilder,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  PhysicsRaycastResult,
  Quaternion,
  Vector3,
  type PhysicsBody,
} from "@babylonjs/core";

/** Runtime handle for one wheel's driven 6DoF joint (HINGE or CUSTOM). */
interface WheelDriveBinding
{
  constraint: Physics6DoFConstraint;
  motorAxis: PhysicsConstraintAxis;
}

/** Ground under one car from a world-down Havok ray. */
interface CarGroundHit
{
  car: Entity;
  point: Vector3;
  normal: Vector3;
}

/** Havok raycast surface; IPhysicsEngine omits raycastToRef at the type level. */
type RaycastPhysicsEngine = {
  raycastToRef: (from: Vector3, to: Vector3, result: PhysicsRaycastResult) => void;
};

const CONSTRAINT_AXIS_MAP: Record<ConstraintAxisName, PhysicsConstraintAxis> = {
  LINEAR_X: PhysicsConstraintAxis.LINEAR_X,
  LINEAR_Y: PhysicsConstraintAxis.LINEAR_Y,
  LINEAR_Z: PhysicsConstraintAxis.LINEAR_Z,
  ANGULAR_X: PhysicsConstraintAxis.ANGULAR_X,
  ANGULAR_Y: PhysicsConstraintAxis.ANGULAR_Y,
  ANGULAR_Z: PhysicsConstraintAxis.ANGULAR_Z,
};

/**
 * Drives up to eight HINGE/CUSTOM wheel motors from Vehicle input, with optional
 * velocity/angular assists and Reset placement (freeze, align to ground, lift, hold).
 */
export default class CarController extends Behavior
{
  @exposed({ label: "Front Left Outer", type: "entity" })
  frontLeftWheel: Entity | null = null;

  @exposed({ label: "Front Right Outer", type: "entity" })
  frontRightWheel: Entity | null = null;

  @exposed({ label: "Rear Left Outer", type: "entity" })
  rearLeftWheel: Entity | null = null;

  @exposed({ label: "Rear Right Outer", type: "entity" })
  rearRightWheel: Entity | null = null;

  @exposed({ label: "Front Left Inner", type: "entity" })
  frontLeftInner: Entity | null = null;

  @exposed({ label: "Front Right Inner", type: "entity" })
  frontRightInner: Entity | null = null;

  @exposed({ label: "Rear Left Inner", type: "entity" })
  rearLeftInner: Entity | null = null;

  @exposed({ label: "Rear Right Inner", type: "entity" })
  rearRightInner: Entity | null = null;

  @exposed({ min: 0, max: 100, label: "Motor Speed" })
  speed = 10;

  @exposed({ min: 0, label: "Motor Force" })
  force = 100;

  @exposed({ min: 0, max: 5, label: "Place Hold (s)" })
  holdSeconds = 0.5;

  /** Lift along the ground-hit normal after Reset alignment. */
  @exposed({ min: 0, max: 20, label: "Reset Lift (m)" })
  resetLiftMeters = 3;

  @exposed({ min: 0, max: 1, label: "Turn Ratio" })
  turnRatio = 0.5;

  @exposed({ label: "Swap Movement" })
  swapMovement = false;

  @exposed({ label: "Swap Steering" })
  swapSteering = false;

  @exposed({ min: 0, max: 1, label: "Steer Zone Width" })
  steerZoneWidth = 0.6;

  @exposed({ min: 0, max: 1, label: "Steer Zone Priority" })
  steerZonePriority = 0.9;

  /** Direct forward speed cheat; 0 keeps pure wheel physics. */
  @exposed({ min: 0, max: 100, label: "Velocity Assist (units/s)" })
  velocityAssist = 0;

  @exposed({ min: 0, max: 2, label: "Velocity Ramp (s)" })
  velocityRampSeconds = 0.15;

  @exposed({ min: 0, max: 180, label: "Angular Assist (deg/s)" })
  angularAssist = 0;

  @exposed({ label: "Body", type: "entity" })
  body: Entity | null = null;

  @exposed({ type: "list", of: "entity", label: "Other Cars" })
  otherCars: (Entity | null)[] = [];

  /** Excluded from ground rays so the player collider is never treated as ground. */
  @exposed({ label: "Player Entity", type: "entity" })
  playerEntity: Entity | null = null;

  /** Wheel motors and assists are withheld when every wheel ray misses. */
  @exposed({ min: 0.05, max: 5, label: "Ground Raycast Distance (m)" })
  groundRaycastDistance = 0.5;

  @exposed({ label: "Debug Ground Ray" })
  debugGroundRay = false;

  @exposed({ min: 1, max: 200, label: "Car Ground Probe Distance (m)" })
  carGroundProbeDistance = 50;

  @inputMap("Vehicle") vehicle!: InputActionMap;

  private static readonly throttleDeadzone = 0.15;
  /** Steer is already deadzoned in bindings; keep a tiny epsilon only. */
  private static readonly steerEpsilon = 0.01;
  /** Max own-body / player / boundary hits the car ground probe steps through. */
  private static readonly carGroundProbeMaxSkips = 32;
  /** How far to step along the probe after skipping an ignorable hit. */
  private static readonly carGroundProbeSkipMeters = 0.25;

  private isPlacing = false;
  private placeTimer = 0;
  /** One entry per wheel slot; undefined when unassigned or undrivable. */
  private wheelDrives: (WheelDriveBinding | undefined)[] = [];
  private rampedSpeed = 0;
  /** Per-wheel grounded state aligned with CollectWheelEntities() slot order. */
  private wheelGrounded: boolean[] = [];
  /** Latest world-down hit per car, same order as CollectCarEntities(). */
  private carGroundHits: (CarGroundHit | undefined)[] = [];
  /** Pooled — BJS V2 physics requires reuse between raycastToRef calls. */
  private raycastResult = new PhysicsRaycastResult();
  private debugLines: (LinesMesh | null)[] = [];
  private rayStart = new Vector3();
  private rayEnd = new Vector3();
  private rayDirection = new Vector3();
  private rayWorldMatrix = Matrix.Identity();
  private debugPoints: Vector3[] = [new Vector3(), new Vector3()];
  /** Frozen during Reset: car roots plus constraint-linked satellites. */
  private placementBodies: Entity[] = [];
  /** Per-car satellites; other car roots are excluded so each chassis aligns independently. */
  private satellitesByCarId = new Map<string, Entity[]>();

  OnStart(): void
  {
    const wheelEntities = this.CollectWheelEntities();
    this.wheelDrives = wheelEntities.map(
      (wheelEntity) => this.ResolveWheelDrive(wheelEntity)
    );
    this.wheelGrounded = wheelEntities.map(() => false);
    this.debugLines = wheelEntities.map(() => null);
    this.carGroundHits = this.CollectCarEntities().map(() => undefined);

    if (this.debugGroundRay)
    {
      this.CreateDebugLines();
    }
  }

  OnUpdate(deltaSeconds: number): void
  {
    this.UpdatePlacementState(deltaSeconds);

    const { throttle, steer } = this.ReadVehicleControls();
    const wheelEntities = this.CollectWheelEntities();
    const speeds = this.isPlacing
      ? wheelEntities.map(() => 0)
      : this.ComputeWheelSpeeds(throttle, steer);

    const anyWheelGrounded = this.UpdateWheelGroundStates();

    for (let slotIndex = 0; slotIndex < this.wheelDrives.length; slotIndex++)
    {
      const drive = this.wheelDrives[slotIndex];
      if (drive !== undefined)
      {
        const wheelSpeed = this.wheelGrounded[slotIndex] ? speeds[slotIndex] : 0;
        this.SetWheelMotor(drive, wheelSpeed);
      }
    }

    if (!this.isPlacing && anyWheelGrounded)
    {
      this.ApplyVelocityAssist(throttle, steer, deltaSeconds);
    }
  }

  OnDestroy(): void
  {
    for (const debugLine of this.debugLines)
    {
      debugLine?.dispose();
    }
    this.debugLines = [];
  }

  /** Edge-triggered Reset starts recover; after holdSeconds the cluster is released. */
  private UpdatePlacementState(deltaSeconds: number): void
  {
    const resetPressed = this.vehicle.FindAction("Reset")?.WasPressedThisFrame() === true;

    if (resetPressed && !this.isPlacing)
    {
      this.BeginPlacement();
    }
    else if (this.isPlacing)
    {
      this.placeTimer += deltaSeconds;
      if (this.placeTimer >= this.holdSeconds)
      {
        this.EndPlacement();
      }
    }
  }

  /**
   * Stick axes after swap flags, reverse-steer flip, and steer-zone remap.
   */
  private ReadVehicleControls(): { throttle: number; steer: number }
  {
    const control = this.vehicle.FindAction("Main Control")?.ReadVector2() ?? { x: 0, y: 0 };
    let throttle = control.y;
    let steer = control.x;

    if (this.swapMovement)
    {
      throttle = -throttle;
    }

    if (this.swapSteering)
    {
      steer = -steer;
    }

    // Reverse: steering is relative to the rear — flip so the stick still aims the front.
    if (throttle < 0)
    {
      steer = -steer;
    }

    return this.ApplySteerZone(throttle, steer);
  }

  /** Wheel entity slots in hinge order: four corners, outer then inner per corner. */
  private CollectWheelEntities(): (Entity | null)[]
  {
    return [
      this.frontLeftWheel,
      this.frontRightWheel,
      this.rearLeftWheel,
      this.rearRightWheel,
      this.frontLeftInner,
      this.frontRightInner,
      this.rearLeftInner,
      this.rearRightInner,
    ];
  }

  /**
   * Exposed Body then Other Cars. The script host is skipped — it is often the
   * player, not a vehicle. Duplicates of Body are skipped.
   */
  private CollectCarEntities(): Entity[]
  {
    const cars: Entity[] = [];
    const seenIds = new Set<string>();

    if (this.body !== null)
    {
      cars.push(this.body);
      seenIds.add(this.body.id);
    }

    for (const otherCar of this.otherCars)
    {
      if (otherCar === null || seenIds.has(otherCar.id))
      {
        continue;
      }
      seenIds.add(otherCar.id);
      cars.push(otherCar);
    }

    return cars;
  }

  /**
   * World-down ground probe for every car. Writes carGroundHits in the same
   * order — undefined when that car has no ground. Ignores the full placement
   * cluster (chassis, wheels, arms) so flipped suspension cannot eat the ray.
   */
  private UpdateCarGroundHits(): void
  {
    const carEntities = this.CollectCarEntities();
    if (this.carGroundHits.length !== carEntities.length)
    {
      this.carGroundHits = carEntities.map(() => undefined);
    }

    const ignoredBodies = this.CollectOwnPhysicsBodies();

    for (let carIndex = 0; carIndex < carEntities.length; carIndex++)
    {
      this.carGroundHits[carIndex] = this.ProbeCarGround(
        carEntities[carIndex],
        ignoredBodies
      );
    }
  }

  /**
   * Physics bodies that belong to this controller's cars, wheels, or the
   * current placement cluster — never treated as ground.
   */
  private CollectOwnPhysicsBodies(): Set<PhysicsBody>
  {
    const ignoredBodies = new Set<PhysicsBody>();

    const AddEntityBody = (entity: Entity | null | undefined): void =>
    {
      if (entity === null || entity === undefined || entity.body === undefined)
      {
        return;
      }

      ignoredBodies.add(entity.body);
    };

    for (const carEntity of this.CollectCarEntities())
    {
      AddEntityBody(carEntity);
    }

    for (const wheelEntity of this.CollectWheelEntities())
    {
      AddEntityBody(wheelEntity);
    }

    for (const placementEntity of this.placementBodies)
    {
      AddEntityBody(placementEntity);
    }

    AddEntityBody(this.playerEntity);

    return ignoredBodies;
  }

  /**
   * Cast world-down from the car and return the first real ground hit. The
   * physics ray reports only the closest hit, so own bodies, the player, and
   * level-boundary walls are stepped through.
   */
  private ProbeCarGround(
    carEntity: Entity,
    ignoredBodies: Set<PhysicsBody>
  ): CarGroundHit | undefined
  {
    const physicsEngine = this.GetRaycastPhysicsEngine();
    if (physicsEngine === undefined)
    {
      return undefined;
    }

    const carWorld = carEntity.node.getWorldMatrix();
    const originX = carWorld.m[12];
    const originY = carWorld.m[13];
    const originZ = carWorld.m[14];

    this.rayStart.set(originX, originY, originZ);
    // Probe at least past the authored reset hover so a car sitting on its
    // post-reset lift still finds the same ground on the next press.
    const probeDistance = Math.max(
      this.carGroundProbeDistance,
      this.resetLiftMeters + 10
    );
    this.rayEnd.set(originX, originY - probeDistance, originZ);

    for (let skipCount = 0; skipCount <= CarController.carGroundProbeMaxSkips; skipCount++)
    {
      physicsEngine.raycastToRef(this.rayStart, this.rayEnd, this.raycastResult);
      if (!this.raycastResult.hasHit)
      {
        return undefined;
      }

      const hitBody = this.raycastResult.body;
      const hitPoint = this.raycastResult.hitPointWorld;
      const hitNormal = this.raycastResult.hitNormalWorld;
      const isOwnBody =
        hitBody !== null && hitBody !== undefined && ignoredBodies.has(hitBody);

      if (!isOwnBody && !this.IsIgnorableGroundHit(hitBody))
      {
        return {
          car: carEntity,
          point: new Vector3(hitPoint.x, hitPoint.y, hitPoint.z),
          normal: new Vector3(hitNormal.x, hitNormal.y, hitNormal.z),
        };
      }

      this.rayStart.set(
        hitPoint.x,
        hitPoint.y - CarController.carGroundProbeSkipMeters,
        hitPoint.z
      );
      if (this.rayStart.y <= this.rayEnd.y)
      {
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Freeze the constraint cluster, probe ground (ignoring that cluster), then
   * right each car — onto the ground hit when found, world-up in place otherwise.
   */
  private BeginPlacement(): void
  {
    this.isPlacing = true;
    this.placeTimer = 0;
    this.rampedSpeed = 0;
    this.PreparePlacementClusters();
    this.UpdateCarGroundHits();
    this.DisablePlacementBodies();
    this.AlignAndLiftCarsAlongGroundNormals();
  }

  /**
   * Hand every placement body back to physics from rest. disablePreStep first
   * so a teleport cannot inject derived velocity, then DYNAMIC, then zero.
   */
  private EndPlacement(): void
  {
    this.isPlacing = false;
    this.EnablePlacementBodies();
    this.placementBodies = [];
    this.satellitesByCarId.clear();
  }

  /**
   * Build per-car constraint clusters for freeze / teleport / restore.
   * After the graph walk, every body/wheel CONSTRAINT partner is force-included
   * so arms (target=body) and wheel hinges are never left DYNAMIC during Reset.
   */
  private PreparePlacementClusters(): void
  {
    const carEntities = this.CollectCarEntities();
    const { adjacency, entitiesById } = this.BuildConstraintGraph();

    // Seed car roots so a missed graph hit cannot drop the chassis.
    for (const carEntity of carEntities)
    {
      entitiesById.set(carEntity.id, carEntity);
    }

    this.satellitesByCarId.clear();
    this.placementBodies = [];
    const seenIds = new Set<string>();

    for (const carEntity of carEntities)
    {
      const cluster = this.WalkConstraintCluster(
        carEntity.id,
        carEntities,
        adjacency,
        entitiesById
      );
      const satellites: Entity[] = [];

      for (const entity of cluster)
      {
        if (entity.id !== carEntity.id)
        {
          satellites.push(entity);
        }

        if (seenIds.has(entity.id))
        {
          continue;
        }

        seenIds.add(entity.id);
        this.placementBodies.push(entity);
      }

      this.satellitesByCarId.set(carEntity.id, satellites);
    }

    // Guarantee every physics partner of the main body or any authored wheel is
    // frozen/restored — arms constrain TO the body; wheels constrain TO arms.
    if (this.body !== null)
    {
      this.EnqueueConstraintReferencedPartners(
        this.body,
        entitiesById
      );
    }
  }

  /**
   * Disable/enable coverage for Reset: include every non-static physics entity
   * that shares a CONSTRAINT with the body or any wheel (as owner or target).
   */
  private EnqueueConstraintReferencedPartners(
    bodyEntity: Entity,
    entitiesById: Map<string, Entity>
  ): void
  {
    const anchorIds = new Set<string>([bodyEntity.id]);
    for (const wheelEntity of this.CollectWheelEntities())
    {
      if (wheelEntity !== null)
      {
        anchorIds.add(wheelEntity.id);
        entitiesById.set(wheelEntity.id, wheelEntity);
      }
    }

    const mainSatellites = this.satellitesByCarId.get(bodyEntity.id) ?? [];
    const mainSatelliteIds = new Set(mainSatellites.map((entity) => entity.id));
    const placementIds = new Set(this.placementBodies.map((entity) => entity.id));

    const EnqueueSatellite = (entity: Entity): void =>
    {
      if (
        entity.id === bodyEntity.id
        || entity.body === undefined
        || entity.body.getMotionType() === PhysicsMotionType.STATIC
      )
      {
        return;
      }

      if (!mainSatelliteIds.has(entity.id))
      {
        mainSatellites.push(entity);
        mainSatelliteIds.add(entity.id);
      }

      if (!placementIds.has(entity.id))
      {
        this.placementBodies.push(entity);
        placementIds.add(entity.id);
      }
    };

    // Body and wheels themselves must always participate in freeze/restore.
    if (
      bodyEntity.body !== undefined
      && bodyEntity.body.getMotionType() !== PhysicsMotionType.STATIC
      && !placementIds.has(bodyEntity.id)
    )
    {
      this.placementBodies.push(bodyEntity);
      placementIds.add(bodyEntity.id);
    }

    for (const wheelEntity of this.CollectWheelEntities())
    {
      if (wheelEntity !== null)
      {
        EnqueueSatellite(wheelEntity);
      }
    }

    for (const entity of entitiesById.values())
    {
      for (const constraintRow of entity.GetAttachmentsOfType("CONSTRAINT"))
      {
        const targetId = constraintRow.data.target;
        if (targetId === null)
        {
          continue;
        }

        const ownerIsAnchor = anchorIds.has(entity.id);
        const targetIsAnchor = anchorIds.has(targetId);
        if (!ownerIsAnchor && !targetIsAnchor)
        {
          continue;
        }

        EnqueueSatellite(entity);

        const targetEntity = entitiesById.get(targetId);
        if (targetEntity !== undefined)
        {
          EnqueueSatellite(targetEntity);
        }
      }
    }

    this.satellitesByCarId.set(bodyEntity.id, mainSatellites);
  }

  /**
   * Undirected CONSTRAINT adjacency over every level entity. ReadSceneLevel
   * includes mesh entities that walking scene.transformNodes would miss.
   */
  private BuildConstraintGraph(): {
    adjacency: Map<string, string[]>;
    entitiesById: Map<string, Entity>;
  }
  {
    const adjacency = new Map<string, string[]>();
    const entitiesById = new Map<string, Entity>();

    const AddLink = (leftId: string, rightId: string): void =>
    {
      let leftNeighbors = adjacency.get(leftId);
      if (leftNeighbors === undefined)
      {
        leftNeighbors = [];
        adjacency.set(leftId, leftNeighbors);
      }
      if (!leftNeighbors.includes(rightId))
      {
        leftNeighbors.push(rightId);
      }

      let rightNeighbors = adjacency.get(rightId);
      if (rightNeighbors === undefined)
      {
        rightNeighbors = [];
        adjacency.set(rightId, rightNeighbors);
      }
      if (!rightNeighbors.includes(leftId))
      {
        rightNeighbors.push(leftId);
      }
    };

    const level = ReadSceneLevel(this.scene);
    if (level === undefined)
    {
      return { adjacency, entitiesById };
    }

    for (const entity of level.entities.values())
    {
      entitiesById.set(entity.id, entity);

      for (const constraintRow of entity.GetAttachmentsOfType("CONSTRAINT"))
      {
        const targetId = constraintRow.data.target;
        if (targetId !== null)
        {
          AddLink(entity.id, targetId);
        }
      }
    }

    return { adjacency, entitiesById };
  }

  /**
   * BFS from one car through CONSTRAINT links. Stops at other car roots so each
   * authored car keeps an independent ground-aligned teleport.
   */
  private WalkConstraintCluster(
    rootId: string,
    carRoots: Entity[],
    adjacency: Map<string, string[]>,
    entitiesById: Map<string, Entity>
  ): Entity[]
  {
    const otherCarIds = new Set<string>();
    for (const carRoot of carRoots)
    {
      if (carRoot.id !== rootId)
      {
        otherCarIds.add(carRoot.id);
      }
    }

    const cluster: Entity[] = [];
    const seenIds = new Set<string>([rootId]);
    const pendingIds = [rootId];

    while (pendingIds.length > 0)
    {
      const currentId = pendingIds.shift();
      if (currentId === undefined)
      {
        break;
      }

      const currentEntity = entitiesById.get(currentId);
      if (
        currentEntity !== undefined
        && currentEntity.body !== undefined
        && currentEntity.body.getMotionType() !== PhysicsMotionType.STATIC
      )
      {
        cluster.push(currentEntity);
      }

      const neighborIds = adjacency.get(currentId);
      if (neighborIds === undefined)
      {
        continue;
      }

      for (const neighborId of neighborIds)
      {
        if (seenIds.has(neighborId) || otherCarIds.has(neighborId))
        {
          continue;
        }

        seenIds.add(neighborId);
        pendingIds.push(neighborId);
      }
    }

    return cluster;
  }

  /**
   * Freeze every placement body as ANIMATED with disablePreStep = false so
   * later node teleports copy into Havok.
   */
  private DisablePlacementBodies(): void
  {
    for (const entity of this.placementBodies)
    {
      const physicsBody = entity.body;
      if (physicsBody === undefined)
      {
        continue;
      }

      physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
      // disablePreStep = false lets the next pre-step copy the node transform into the body.
      physicsBody.disablePreStep = false;
      physicsBody.setLinearVelocity(Vector3.Zero());
      physicsBody.setAngularVelocity(Vector3.Zero());
    }
  }

  /**
   * Restore every placement body to DYNAMIC from rest. disablePreStep is
   * re-enabled first so a prior teleport cannot inject a derived velocity.
   */
  private EnablePlacementBodies(): void
  {
    for (const entity of this.placementBodies)
    {
      const physicsBody = entity.body;
      if (physicsBody === undefined)
      {
        continue;
      }

      physicsBody.disablePreStep = true;
      physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
      physicsBody.setLinearVelocity(Vector3.Zero());
      physicsBody.setAngularVelocity(Vector3.Zero());
    }
  }

  /**
   * Right each car onto its ground hit (absolute height above the hit) or, when
   * the probe misses, upright in place on world +Y. Satellites keep their
   * chassis-relative pose across the teleport.
   */
  private AlignAndLiftCarsAlongGroundNormals(): void
  {
    const carEntities = this.CollectCarEntities();

    for (let carIndex = 0; carIndex < carEntities.length; carIndex++)
    {
      const carEntity = carEntities[carIndex];
      const groundHit = this.carGroundHits[carIndex];
      const oldCarWorld = carEntity.node.computeWorldMatrix(true).clone();
      const oldCarInverse = Matrix.Identity();
      oldCarWorld.invertToRef(oldCarInverse);

      const carRootIds = new Set(carEntities.map((entity) => entity.id));
      let satellites = this.satellitesByCarId.get(carEntity.id) ?? [];
      if (satellites.length === 0)
      {
        satellites = this.placementBodies.filter(
          (entity) => !carRootIds.has(entity.id)
        );
      }

      const relativePoseById = new Map<string, Matrix>();
      for (const satellite of satellites)
      {
        const satelliteWorld = satellite.node.computeWorldMatrix(true).clone();
        relativePoseById.set(
          satellite.id,
          satelliteWorld.multiply(oldCarInverse)
        );
      }

      const worldScale = new Vector3();
      const worldRotation = new Quaternion();
      const worldPosition = new Vector3();
      oldCarWorld.decompose(worldScale, worldRotation, worldPosition);

      const uprightNormal = this.ResolveUprightNormal(groundHit);
      const alignedRotation = this.ComputeSurfaceAlignedRotation(
        oldCarWorld,
        uprightNormal,
        worldRotation
      );

      // Absolute place above the hit so spam cannot stack altitude. Probe miss
      // keeps XZ/Y and only rights the chassis.
      if (groundHit !== undefined)
      {
        worldPosition.copyFrom(groundHit.point);
        worldPosition.addInPlace(uprightNormal.scale(this.resetLiftMeters));
      }

      this.SetEntityWorldPose(carEntity, worldScale, alignedRotation, worldPosition);

      const newCarWorld = carEntity.node.computeWorldMatrix(true).clone();
      for (const satellite of satellites)
      {
        const relativePose = relativePoseById.get(satellite.id);
        if (relativePose === undefined)
        {
          continue;
        }

        this.SetEntityWorldMatrix(
          satellite,
          relativePose.multiply(newCarWorld)
        );
      }
    }
  }

  /**
   * Prefer a mostly-upward ground normal; fall back to world +Y so a missed or
   * wall-like probe still rights the car.
   */
  private ResolveUprightNormal(groundHit: CarGroundHit | undefined): Vector3
  {
    if (groundHit === undefined)
    {
      return Vector3.Up();
    }

    const surfaceNormal = groundHit.normal.normalizeToNew();
    if (surfaceNormal.y < 0.2)
    {
      return Vector3.Up();
    }

    return surfaceNormal;
  }

  /**
   * Teleport one entity to an absolute world matrix and zero velocity so the
   * joint stack does not inherit a snap impulse.
   */
  private SetEntityWorldMatrix(entity: Entity, worldMatrix: Matrix): void
  {
    const worldScale = new Vector3();
    const worldRotation = new Quaternion();
    const worldPosition = new Vector3();
    worldMatrix.decompose(worldScale, worldRotation, worldPosition);
    this.SetEntityWorldPose(entity, worldScale, worldRotation, worldPosition);

    const physicsBody = entity.body;
    if (physicsBody === undefined)
    {
      return;
    }

    physicsBody.setLinearVelocity(Vector3.Zero());
    physicsBody.setAngularVelocity(Vector3.Zero());
  }

  /**
   * Rotation whose up axis matches the upright normal while heading is kept.
   * Falls back when heading is parallel to the normal.
   */
  private ComputeSurfaceAlignedRotation(
    carWorld: Matrix,
    uprightNormal: Vector3,
    fallbackRotation: Quaternion
  ): Quaternion
  {
    if (uprightNormal.lengthSquared() < 1e-6)
    {
      return fallbackRotation;
    }

    const upAxis = uprightNormal.normalizeToNew();

    // This car model uses +Z as forward (see ApplyVelocityAssist).
    const forwardHeading = Vector3.TransformNormal(new Vector3(0, 0, 1), carWorld);
    const projectedForward = forwardHeading.subtract(
      upAxis.scale(Vector3.Dot(forwardHeading, upAxis))
    );
    if (projectedForward.lengthSquared() < 1e-6)
    {
      return fallbackRotation;
    }
    projectedForward.normalize();

    const rightAxis = Vector3.Cross(upAxis, projectedForward);
    rightAxis.normalize();

    return Quaternion.RotationQuaternionFromAxis(rightAxis, upAxis, projectedForward);
  }

  /**
   * Write a world pose as a local transform, accounting for a parent so nested
   * nodes are not double-transformed.
   */
  private SetEntityWorldPose(
    entity: Entity,
    worldScale: Vector3,
    worldRotation: Quaternion,
    worldPosition: Vector3
  ): void
  {
    const sceneNode = entity.node;
    let localMatrix = Matrix.Compose(worldScale, worldRotation, worldPosition);

    const parentNode = sceneNode.parent;
    if (parentNode !== null)
    {
      const parentInverse = new Matrix();
      parentNode.computeWorldMatrix(true).invertToRef(parentInverse);
      localMatrix = localMatrix.multiply(parentInverse);
    }

    const localScale = new Vector3();
    const localRotation = new Quaternion();
    const localPosition = new Vector3();
    localMatrix.decompose(localScale, localRotation, localPosition);

    sceneNode.position.copyFrom(localPosition);
    // rotationQuaternion overrides Euler rotation for both the renderer and physics.
    sceneNode.rotationQuaternion = localRotation;
  }

  /**
   * In wide left/right stick wedges, bleed throttle and ramp steer toward ±1 so
   * input favors turning over forward/back.
   */
  private ApplySteerZone(throttle: number, steer: number): { throttle: number; steer: number }
  {
    const steerAbs = Math.abs(steer);
    const axisSum = steerAbs + Math.abs(throttle);
    if (axisSum <= CarController.steerEpsilon)
    {
      return { throttle: 0, steer: 0 };
    }

    const lateralRatio = steerAbs / axisSum;
    const zoneStart = 1 - this.steerZoneWidth;
    if (lateralRatio <= zoneStart)
    {
      return { throttle, steer };
    }

    const zoneBlend = Math.min(1, (lateralRatio - zoneStart) / (1 - zoneStart));
    const priority = zoneBlend * this.steerZonePriority;
    const steerSign = Math.sign(steer);

    return {
      throttle: throttle * (1 - priority),
      steer: steerSign * Math.min(1, steerAbs + priority * (1 - steerAbs)),
    };
  }

  /**
   * Per-wheel motor speeds [FL, FR, RL, RR, FLi, FRi, RLi, RRi]. Inner/outer
   * pairs on a corner share the same corner speed.
   */
  private ComputeWheelSpeeds(throttle: number, steer: number): number[]
  {
    const cornerSpeeds = this.ComputeCornerSpeeds(throttle, steer);
    return [
      cornerSpeeds[0],
      cornerSpeeds[1],
      cornerSpeeds[2],
      cornerSpeeds[3],
      cornerSpeeds[0],
      cornerSpeeds[1],
      cornerSpeeds[2],
      cornerSpeeds[3],
    ];
  }

  /**
   * Differential speeds for the four corners [FL, FR, RL, RR]. Outside track at
   * full speed; inside at turnRatio × speed. Steer alone is tank controls.
   */
  private ComputeCornerSpeeds(throttle: number, steer: number): number[]
  {
    const direction = this.ResolveThrottleDirection(throttle);
    const steerMagnitude = Math.abs(steer);
    const steerSign = steerMagnitude > CarController.steerEpsilon ? Math.sign(steer) : 0;
    const turning = steerSign !== 0;
    const turnStrength = Math.min(1, steerMagnitude);
    const throttleMagnitude = direction !== 0 ? Math.min(1, Math.abs(throttle)) : 0;

    // Outside track at full speed; direction defaults to +1 for tank-turning.
    const outsideSpeed = (direction !== 0 ? direction : 1)
      * this.speed
      * (direction !== 0 ? throttleMagnitude : 1);

    if (!turning)
    {
      if (direction === 0)
      {
        return [0, 0, 0, 0];
      }

      return [outsideSpeed, outsideSpeed, outsideSpeed, outsideSpeed];
    }

    // Forward/back + turn → inside same direction, slower. Turn alone → tank (inside opposite).
    const innerScale = direction !== 0
      ? 1 - turnStrength * (1 - this.turnRatio)
      : this.turnRatio * turnStrength;

    const insideSpeed = direction !== 0
      ? outsideSpeed * innerScale
      : -outsideSpeed * innerScale;

    if (steerSign < 0)
    {
      return [insideSpeed, outsideSpeed, insideSpeed, outsideSpeed];
    }
    return [outsideSpeed, insideSpeed, outsideSpeed, insideSpeed];
  }

  /**
   * Resolve the wheel joint: HINGE or CUSTOM 6DoF. CUSTOM wheels must leave one
   * angular axis free (typically ANGULAR_X) for the drive motor.
   */
  private ResolveWheelDrive(wheelEntity: Entity | null): WheelDriveBinding | undefined
  {
    if (wheelEntity === null)
    {
      return undefined;
    }

    const constraintRows = wheelEntity.GetAttachmentsOfType("CONSTRAINT");
    let hasNonDrivableConstraint = false;

    for (const row of constraintRows)
    {
      if (!(row.constraint instanceof Physics6DoFConstraint))
      {
        continue;
      }

      const motorAxis = this.ResolveMotorAxis(row.data);
      if (motorAxis === undefined)
      {
        hasNonDrivableConstraint = true;
        continue;
      }

      return { constraint: row.constraint, motorAxis };
    }

    if (hasNonDrivableConstraint)
    {
      console.warn(
        `[${this.entity.name}] "${wheelEntity.name}" has a constraint but no free ` +
        `angular axis for driving (HINGE, or CUSTOM with an unlocked ANGULAR_* axis)`
      );
    }
    else
    {
      console.warn(
        `[${this.entity.name}] "${wheelEntity.name}" has no drivable HINGE/CUSTOM constraint`
      );
    }
    return undefined;
  }

  /** Map authored constraint data to the Physics6DoF motor axis. */
  private ResolveMotorAxis(component: ConstraintComponent): PhysicsConstraintAxis | undefined
  {
    if (component.constraintType === "HINGE")
    {
      return PhysicsConstraintAxis.ANGULAR_X;
    }

    if (component.constraintType !== "CUSTOM")
    {
      return undefined;
    }

    const drivableAngularAxes = (component.axes ?? []).filter(
      (axisConfig) =>
        axisConfig.axis.startsWith("ANGULAR_")
        && axisConfig.mode !== "locked"
    );

    if (drivableAngularAxes.length === 0)
    {
      return undefined;
    }

    const preferred = drivableAngularAxes.find(
      (axisConfig) => axisConfig.axis === "ANGULAR_X"
    );
    const chosen = preferred ?? drivableAngularAxes[0];
    return CONSTRAINT_AXIS_MAP[chosen.axis];
  }

  /** Drive a 6DoF joint motor at the given speed (degrees per second). */
  private SetWheelMotor(
    drive: WheelDriveBinding,
    speedDegreesPerSecond: number
  ): void
  {
    const { constraint, motorAxis } = drive;

    if (speedDegreesPerSecond === 0)
    {
      constraint.setAxisMotorTarget(motorAxis, 0);
      return;
    }

    constraint.setAxisMotorType(motorAxis, PhysicsConstraintMotorType.VELOCITY);
    constraint.setAxisMotorTarget(motorAxis, speedDegreesPerSecond * (Math.PI / 180));
    constraint.setAxisMotorMaxForce(motorAxis, this.force);
  }

  /**
   * Override forward linear velocity and yaw so the car responds instantly;
   * sideways drift and pitch/roll are left to physics.
   */
  private ApplyVelocityAssist(throttle: number, steer: number, deltaSeconds: number): void
  {
    if (this.body === null || (this.velocityAssist === 0 && this.angularAssist === 0))
    {
      return;
    }

    const physicsBody = this.body.body;
    if (physicsBody === undefined)
    {
      return;
    }

    const currentLinear = physicsBody.getLinearVelocity();
    const currentAngular = physicsBody.getAngularVelocity();
    const direction = this.ResolveThrottleDirection(throttle);

    // This car model uses +Z as forward.
    const forward = new Vector3(0, 0, 1);
    Vector3.TransformNormalToRef(forward, this.body.node.getWorldMatrix(), forward);

    if (this.velocityAssist > 0)
    {
      const magnitude = direction !== 0 ? Math.min(1, Math.abs(throttle)) : 0;
      const targetSpeed = direction * this.velocityAssist * magnitude;

      if (this.velocityRampSeconds > 0)
      {
        const blendFactor = 1 - Math.exp(-deltaSeconds / this.velocityRampSeconds);
        this.rampedSpeed += (targetSpeed - this.rampedSpeed) * blendFactor;
      }
      else
      {
        this.rampedSpeed = targetSpeed;
      }

      const currentForward = Vector3.Dot(currentLinear, forward);
      const assistDelta = this.rampedSpeed - currentForward;
      currentLinear.x += assistDelta * forward.x;
      currentLinear.y += assistDelta * forward.y;
      currentLinear.z += assistDelta * forward.z;

      physicsBody.setLinearVelocity(currentLinear);
    }

    if (this.angularAssist > 0 && Math.abs(steer) > CarController.steerEpsilon)
    {
      currentAngular.y = steer * this.angularAssist * (Math.PI / 180);
      physicsBody.setAngularVelocity(currentAngular);
    }
  }

  /**
   * Refresh wheelGrounded[] from each wheel ray. Returns true when at least
   * one wheel hits ground.
   */
  private UpdateWheelGroundStates(): boolean
  {
    const wheelEntities = this.CollectWheelEntities();
    let anyWheelGrounded = false;

    for (let slotIndex = 0; slotIndex < wheelEntities.length; slotIndex++)
    {
      const wheelEntity = wheelEntities[slotIndex];
      if (wheelEntity === null)
      {
        this.wheelGrounded[slotIndex] = false;
        continue;
      }

      const grounded = this.RaycastWheelGround(wheelEntity);
      this.wheelGrounded[slotIndex] = grounded;
      if (grounded)
      {
        anyWheelGrounded = true;
      }

      if (this.debugGroundRay)
      {
        this.UpdateDebugLine(slotIndex, grounded);
      }
    }

    return anyWheelGrounded;
  }

  /**
   * Cast from the wheel along the body mesh's local down so spinning wheels
   * do not skew the direction.
   */
  private RaycastWheelGround(wheelEntity: Entity): boolean
  {
    const wheelMatrix = wheelEntity.node.getWorldMatrix();
    this.rayStart.set(
      wheelMatrix.m[12],
      wheelMatrix.m[13],
      wheelMatrix.m[14]
    );

    const orientationNode = this.body !== null ? this.body.node : this.node;
    this.rayWorldMatrix.copyFrom(orientationNode.getWorldMatrix());
    this.rayDirection.set(0, -1, 0);
    Vector3.TransformNormalToRef(this.rayDirection, this.rayWorldMatrix, this.rayDirection);
    this.rayEnd.copyFrom(this.rayStart);
    this.rayEnd.addInPlace(this.rayDirection.scale(this.groundRaycastDistance));

    const physicsEngine = this.GetRaycastPhysicsEngine();
    if (physicsEngine === undefined)
    {
      return false;
    }

    physicsEngine.raycastToRef(
      this.rayStart,
      this.rayEnd,
      this.raycastResult
    );

    if (!this.raycastResult.hasHit)
    {
      return false;
    }

    // Post-hit rejection only: raycastToRef filters by collision bitmask, not body list.
    return !this.IsIgnorableGroundHit(this.raycastResult.body);
  }

  /**
   * One updatable line per wheel. alwaysSelectAsActiveMesh skips frustum culling
   * because CreateLines never refreshes bounds after vertex updates.
   */
  private CreateDebugLines(): void
  {
    const wheelEntities = this.CollectWheelEntities();

    for (let slotIndex = 0; slotIndex < wheelEntities.length; slotIndex++)
    {
      if (wheelEntities[slotIndex] === null || this.debugLines[slotIndex] !== null)
      {
        continue;
      }

      const debugLine = MeshBuilder.CreateLines(
        `groundRaycastDebug_${slotIndex}`,
        {
          points: [Vector3.Zero(), Vector3.Zero()],
          updatable: true,
        },
        this.scene
      );

      debugLine.alwaysSelectAsActiveMesh = true;
      debugLine.isPickable = false;
      // isEnabled is a method — assigning `mesh.isEnabled = true` shadows it and Babylon throws.
      debugLine.setEnabled(true);
      this.debugLines[slotIndex] = debugLine;
    }
  }

  /** Move a debug line onto the current ray via MeshBuilder.CreateLines. */
  private UpdateDebugLine(slotIndex: number, grounded: boolean): void
  {
    if (this.debugLines[slotIndex] === null)
    {
      this.CreateDebugLines();
    }

    let debugLine = this.debugLines[slotIndex];
    if (debugLine === null)
    {
      return;
    }

    const endPoint = grounded ? this.raycastResult.hitPointWorld : this.rayEnd;
    this.debugPoints[0].copyFrom(this.rayStart);
    this.debugPoints[1].copyFrom(endPoint);

    debugLine = MeshBuilder.CreateLines(
      `groundRaycastDebug_${slotIndex}`,
      {
        points: this.debugPoints,
        instance: debugLine,
      },
      this.scene
    );

    debugLine.color = grounded ? Color3.Green() : Color3.Red();
    this.debugLines[slotIndex] = debugLine;
  }

  /**
   * Havok raycast engine. IPhysicsEngine omits raycastToRef even though the
   * Havok-backed engine implements it at runtime.
   */
  private GetRaycastPhysicsEngine(): RaycastPhysicsEngine | undefined
  {
    const physicsEngine = this.scene.getPhysicsEngine() as
      | RaycastPhysicsEngine
      | null
      | undefined;
    // Babylon Nullable: can be undefined at runtime, so test truthiness.
    if (!physicsEngine)
    {
      return undefined;
    }

    return physicsEngine;
  }

  /** Player collider and level-boundary walls must not count as ground. */
  private IsIgnorableGroundHit(hitBody: PhysicsBody | null | undefined): boolean
  {
    if (hitBody === null || hitBody === undefined)
    {
      return false;
    }

    if (
      this.playerEntity !== null
      && this.playerEntity.body !== undefined
      && hitBody === this.playerEntity.body
    )
    {
      return true;
    }

    const hitMetadata = hitBody.transformNode?.metadata as { bjsEntity?: Entity } | undefined;
    return hitMetadata?.bjsEntity?.tag === "levelboundary";
  }

  /** Throttle stick deadzone to -1 / 0 / +1. */
  private ResolveThrottleDirection(throttle: number): number
  {
    if (throttle > CarController.throttleDeadzone)
    {
      return 1;
    }

    if (throttle < -CarController.throttleDeadzone)
    {
      return -1;
    }

    return 0;
  }
}
