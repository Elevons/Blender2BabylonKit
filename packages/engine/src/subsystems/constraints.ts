import {
  Scene,
  Vector3,
  Quaternion,
  Matrix,
  LockConstraint,
  BallAndSocketConstraint,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  type PhysicsConstraint,
  type Physics6DoFLimit,
  type TransformNode,
} from "@babylonjs/core";
import type { Entity } from "../core/Entity";
import type { ConstraintAxisName, ConstraintComponent } from "../core/types";
import type { Level } from "../core/Level";
import { RegisterAttachment } from "../core/attachments";
import {
  LocalScaleAxes,
  ApplyObjectScaleEnabled,
  DistanceScaleAlongLocalAxis,
  WorldMatrixForScaledPhysics,
} from "../core/nodeScale";

/**
 * Constraints subsystem: turns CONSTRAINT components into Havok V2 joints in a
 * post-pass (both bodies must already exist). The authored pivot/axis live in
 * the OWNER's local space; the matching target-side pivot/axes are derived from
 * the two bodies' live world transforms, so the joint pins the CURRENT relative
 * pose and nothing snaps on load — the same approach as a hand-written
 * suspension (see PlayerVehicleController).
 *
 * Type mapping:
 *   FIXED  -> LockConstraint (welded)
 *   BALL   -> BallAndSocketConstraint (free rotation around the pivot)
 *   HINGE  -> 6DoF, only ANGULAR_X free/limited; constraint-frame X = authored axis
 *   SLIDER -> 6DoF, only LINEAR_X free/limited
 *   SPRING -> 6DoF, LINEAR_X sprung (stiffness/damping) within limits
 *   CUSTOM -> 6DoF, per-axis free/locked/limited/spring from manifest `axes`
 */

/** One authored joint, registered while the entity loop runs. */
export interface ConstraintRegistration {
  ownerEntity: Entity;
  component: ConstraintComponent;
}

/** The constraint frame: pivots and (axis, perpendicular) pairs for both bodies. */
interface ConstraintFrame {
  pivotA: Vector3;
  pivotB: Vector3;
  axisA: Vector3;
  axisB: Vector3;
  perpAxisA: Vector3;
  perpAxisB: Vector3;
}

/** Any unit vector perpendicular to the given one (for the constraint frame). */
function PerpendicularOf(axis: Vector3): Vector3
{
  // Cross with whichever world basis vector is least aligned, to avoid a
  // degenerate (near-zero) result when the axis is parallel to the candidate.
  const candidate = Math.abs(axis.y) < 0.9 ? Vector3.Up() : Vector3.Right();
  return Vector3.Cross(axis, candidate).normalize();
}

function ConstraintFrameAxisVector(
  component: ConstraintComponent,
  frameAxis: ConstraintAxisName
): Vector3
{
  const axisA = Vector3.FromArray(component.axis).normalize();
  if (frameAxis === "LINEAR_X" || frameAxis === "ANGULAR_X")
  {
    return axisA;
  }

  const perpA = PerpendicularOf(axisA);
  if (frameAxis === "LINEAR_Y" || frameAxis === "ANGULAR_Y")
  {
    return perpA;
  }

  return Vector3.Cross(axisA, perpA).normalize();
}

function LinearLimitScale(
  ownerNode: TransformNode,
  component: ConstraintComponent,
  frameAxis: ConstraintAxisName
): number
{
  if (!ApplyObjectScaleEnabled(component.applyObjectScale))
  {
    return 1;
  }

  return DistanceScaleAlongLocalAxis(ownerNode, ConstraintFrameAxisVector(component, frameAxis));
}

/**
 * Derive the shared constraint frame from the owner's authored pivot/axis and
 * the two bodies' live world transforms. Everything is computed via the world
 * frame so the target-side values match the as-placed relative pose.
 */
function ComputeConstraintFrame(
  ownerNode: TransformNode,
  targetNode: TransformNode,
  component: ConstraintComponent
): ConstraintFrame
{
  ownerNode.computeWorldMatrix(true);
  targetNode.computeWorldMatrix(true);

  const applyScale = ApplyObjectScaleEnabled(component.applyObjectScale);
  let pivotA = Vector3.FromArray(component.pivot);
  if (applyScale)
  {
    const { sx, sy, sz } = LocalScaleAxes(ownerNode);
    pivotA = new Vector3(pivotA.x * sx, pivotA.y * sy, pivotA.z * sz);
  }

  const ownerWorld = WorldMatrixForScaledPhysics(ownerNode, applyScale);
  const worldPivot = Vector3.TransformCoordinates(
    applyScale ? pivotA : Vector3.FromArray(component.pivot),
    ownerWorld
  );

  const targetWorldInv = Matrix.Invert(
    WorldMatrixForScaledPhysics(targetNode, applyScale)
  );
  const pivotB = Vector3.TransformCoordinates(worldPivot, targetWorldInv);

  const ownerRotation = ownerNode.absoluteRotationQuaternion;
  const inverseTargetRotation = Quaternion.Inverse(targetNode.absoluteRotationQuaternion);

  // Axis + a perpendicular: owner-local -> world -> each body's local frame.
  const axisA = Vector3.FromArray(component.axis).normalize();
  const worldAxis = axisA.applyRotationQuaternion(ownerRotation);
  const worldPerpendicular = PerpendicularOf(worldAxis);

  const inverseOwnerRotation = Quaternion.Inverse(ownerRotation);

  return {
    pivotA,
    pivotB,
    axisA: worldAxis.applyRotationQuaternion(inverseOwnerRotation),
    axisB: worldAxis.applyRotationQuaternion(inverseTargetRotation),
    perpAxisA: worldPerpendicular.applyRotationQuaternion(inverseOwnerRotation),
    perpAxisB: worldPerpendicular.applyRotationQuaternion(inverseTargetRotation),
  };
}

/** A fully locked axis (zero allowed motion). */
function LockedAxis(axis: PhysicsConstraintAxis): Physics6DoFLimit
{
  return { axis, minLimit: 0, maxLimit: 0 };
}

const CONSTRAINT_AXIS_MAP: Record<ConstraintAxisName, PhysicsConstraintAxis> = {
  LINEAR_X: PhysicsConstraintAxis.LINEAR_X,
  LINEAR_Y: PhysicsConstraintAxis.LINEAR_Y,
  LINEAR_Z: PhysicsConstraintAxis.LINEAR_Z,
  ANGULAR_X: PhysicsConstraintAxis.ANGULAR_X,
  ANGULAR_Y: PhysicsConstraintAxis.ANGULAR_Y,
  ANGULAR_Z: PhysicsConstraintAxis.ANGULAR_Z,
};

function IsAngularAxis(name: ConstraintAxisName): boolean
{
  return name.startsWith("ANGULAR_");
}

/** CUSTOM: map authored per-axis rows to Havok 6DoF limits (FREE = omitted). */
function BuildCustomAxisLimits(
  component: ConstraintComponent,
  ownerNode: TransformNode
): Physics6DoFLimit[]
{
  const limits: Physics6DoFLimit[] = [];
  const degreesToRadians = Math.PI / 180;

  if (component.axes === undefined || component.axes.length === 0)
  {
    console.warn("[bjs] CUSTOM constraint has no axes configured — all DOF will be free");
    return limits;
  }

  for (const axisConfig of component.axes)
  {
    const physicsAxis = CONSTRAINT_AXIS_MAP[axisConfig.axis];
    if (physicsAxis === undefined)
    {
      console.warn(`[bjs] CUSTOM constraint: unknown axis "${axisConfig.axis}"`);
      continue;
    }

    if (axisConfig.mode === "free")
    {
      continue;
    }

    if (axisConfig.mode === "locked")
    {
      limits.push(LockedAxis(physicsAxis));
      continue;
    }

    const isAngular = IsAngularAxis(axisConfig.axis);
    const unitScale = isAngular ? 1 : LinearLimitScale(ownerNode, component, axisConfig.axis);
    const linearLimit: Physics6DoFLimit = {
      axis: physicsAxis,
      minLimit: (axisConfig.min ?? 0) * (isAngular ? degreesToRadians : unitScale),
      maxLimit: (axisConfig.max ?? 0) * (isAngular ? degreesToRadians : unitScale),
    };

    if (axisConfig.mode === "spring")
    {
      linearLimit.stiffness = axisConfig.stiffness;
      linearLimit.damping = axisConfig.damping;
    }

    limits.push(linearLimit);
  }

  return limits;
}

/**
 * The per-type 6DoF limit set. The constraint frame's X is the authored axis,
 * so HINGE frees/limits ANGULAR_X and SLIDER/SPRING free/limit LINEAR_X.
 */
function BuildAxisLimits(
  component: ConstraintComponent,
  ownerNode: TransformNode
): Physics6DoFLimit[]
{
  if (component.constraintType === "CUSTOM")
  {
    return BuildCustomAxisLimits(component, ownerNode);
  }

  const limits: Physics6DoFLimit[] = [];
  const degreesToRadians = Math.PI / 180;
  const linearScale = LinearLimitScale(ownerNode, component, "LINEAR_X");

  if (component.constraintType === "HINGE")
  {
    limits.push(LockedAxis(PhysicsConstraintAxis.LINEAR_X));
    limits.push(LockedAxis(PhysicsConstraintAxis.LINEAR_Y));
    limits.push(LockedAxis(PhysicsConstraintAxis.LINEAR_Z));
    limits.push(LockedAxis(PhysicsConstraintAxis.ANGULAR_Y));
    limits.push(LockedAxis(PhysicsConstraintAxis.ANGULAR_Z));

    if (component.useLimits)
    {
      limits.push({
        axis: PhysicsConstraintAxis.ANGULAR_X,
        minLimit: component.min * degreesToRadians,
        maxLimit: component.max * degreesToRadians,
      });
    }
  }
  else // SLIDER and SPRING share the linear-X layout; SPRING adds the spring terms.
  {
    limits.push(LockedAxis(PhysicsConstraintAxis.LINEAR_Y));
    limits.push(LockedAxis(PhysicsConstraintAxis.LINEAR_Z));
    limits.push(LockedAxis(PhysicsConstraintAxis.ANGULAR_X));
    limits.push(LockedAxis(PhysicsConstraintAxis.ANGULAR_Y));
    limits.push(LockedAxis(PhysicsConstraintAxis.ANGULAR_Z));

    const wantsLinearLimit = component.constraintType === "SPRING" || component.useLimits;
    if (wantsLinearLimit)
    {
      const linearLimit: Physics6DoFLimit = {
        axis: PhysicsConstraintAxis.LINEAR_X,
        minLimit: component.min * linearScale,
        maxLimit: component.max * linearScale,
      };

      if (component.constraintType === "SPRING")
      {
        linearLimit.stiffness = component.stiffness;
        linearLimit.damping = component.damping;
      }

      limits.push(linearLimit);
    }
  }

  return limits;
}

/** Map manifest "Bodies Collide" to Havok's constraint collision flag. */
function AllowConstraintCollisions(component: ConstraintComponent): boolean
{
  return component.collision === true;
}

/** Build the Babylon constraint object for one registration. */
function CreateConstraint(
  frame: ConstraintFrame,
  component: ConstraintComponent,
  ownerNode: TransformNode,
  scene: Scene
): PhysicsConstraint
{
  const allowCollision = AllowConstraintCollisions(component);

  if (component.constraintType === "FIXED")
  {
    const constraint = new LockConstraint(
      frame.pivotA, frame.pivotB, frame.axisA, frame.axisB, scene
    );
    constraint.options.collision = allowCollision;
    return constraint;
  }

  if (component.constraintType === "BALL")
  {
    const constraint = new BallAndSocketConstraint(
      frame.pivotA, frame.pivotB, frame.axisA, frame.axisB, scene
    );
    constraint.options.collision = allowCollision;
    return constraint;
  }

  if (component.constraintType === "CUSTOM" || component.constraintType === "HINGE"
    || component.constraintType === "SLIDER" || component.constraintType === "SPRING")
  {
    return new Physics6DoFConstraint(
      {
        pivotA: frame.pivotA,
        pivotB: frame.pivotB,
        axisA: frame.axisA,
        axisB: frame.axisB,
        perpAxisA: frame.perpAxisA,
        perpAxisB: frame.perpAxisB,
        collision: allowCollision,
      },
      BuildAxisLimits(component, ownerNode),
      scene
    );
  }

  console.warn(`[bjs] unknown constraint type "${component.constraintType}"`);
  return new Physics6DoFConstraint(
    {
      pivotA: frame.pivotA,
      pivotB: frame.pivotB,
      axisA: frame.axisA,
      axisB: frame.axisB,
      perpAxisA: frame.perpAxisA,
      perpAxisB: frame.perpAxisB,
      collision: allowCollision,
    },
    BuildAxisLimits(component, ownerNode),
    scene
  );
}

/** Drive a hinge/slider joint at the authored target speed. */
function ApplyMotor(
  constraint: Physics6DoFConstraint,
  component: ConstraintComponent,
  ownerNode: TransformNode
): void
{
  const isHinge = component.constraintType === "HINGE";
  const motorAxis = isHinge ? PhysicsConstraintAxis.ANGULAR_X : PhysicsConstraintAxis.LINEAR_X;
  const linearScale = LinearLimitScale(ownerNode, component, "LINEAR_X");
  const targetSpeed = isHinge
    ? component.motorSpeed * (Math.PI / 180) // deg/s -> rad/s
    : component.motorSpeed * linearScale;

  constraint.setAxisMotorType(motorAxis, PhysicsConstraintMotorType.VELOCITY);
  constraint.setAxisMotorTarget(motorAxis, targetSpeed);
  constraint.setAxisMotorMaxForce(motorAxis, component.motorMaxForce);
}

/**
 * Build one authored joint at runtime or during the load finalize pass.
 * Returns the Havok constraint when both bodies exist; otherwise undefined.
 */
export function BuildSingleConstraint(
  scene: Scene,
  level: Level,
  ownerEntity: Entity,
  component: ConstraintComponent
): PhysicsConstraint | undefined
{
  if (component.target === null)
  {
    console.warn(`[bjs] "${ownerEntity.name}": constraint has no target`);
    return undefined;
  }

  const targetEntity = level.ById(component.target);
  if (targetEntity === undefined)
  {
    console.warn(`[bjs] "${ownerEntity.name}": constraint target ${component.target} not found`);
    return undefined;
  }

  if (ownerEntity.body === undefined || targetEntity.body === undefined)
  {
    console.warn(
      `[bjs] constraint "${ownerEntity.name}" -> "${targetEntity.name}" skipped: ` +
      `both objects need a Collider/Rigid Body`
    );
    return undefined;
  }

  const frame = ComputeConstraintFrame(ownerEntity.node, targetEntity.node, component);
  const constraint = CreateConstraint(frame, component, ownerEntity.node, scene);
  ownerEntity.body.addConstraint(targetEntity.body, constraint);
  constraint.isCollisionsEnabled = AllowConstraintCollisions(component);

  if (component.motor && constraint instanceof Physics6DoFConstraint)
  {
    ApplyMotor(constraint, component, ownerEntity.node);
  }

  RegisterAttachment(ownerEntity, { type: "CONSTRAINT", data: component, constraint });
  return constraint;
}

/**
 * Build every registered joint, now that all entities (and their bodies) exist.
 * Returns the created constraints so the level can dispose them.
 */
export function BuildConstraints(
  scene: Scene,
  level: Level,
  registrations: ConstraintRegistration[]
): PhysicsConstraint[]
{
  const constraints: PhysicsConstraint[] = [];

  for (const registration of registrations)
  {
    const constraint = BuildSingleConstraint(
      scene,
      level,
      registration.ownerEntity,
      registration.component
    );
    if (constraint !== undefined)
    {
      constraints.push(constraint);
    }
  }

  return constraints;
}
