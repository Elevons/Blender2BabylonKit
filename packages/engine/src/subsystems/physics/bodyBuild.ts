import {
  PhysicsAggregate,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeContainer,
  AbstractMesh,
  TransformNode,
  Vector3,
  type PhysicsShape,
  type Scene,
} from "@babylonjs/core";
import type { ColliderComponent, RigidBodyComponent } from "../../core/types";
import { RegisterPhysicsShapeForEntity } from "../collisionLayers";
import { ApplyObjectScaleEnabled } from "../../core/nodeScale";
import { ComputeLocalBounds, OwnedColliderMeshes } from "./geometry";
import {
  ApplyObjectScaleToCollider,
  BuildColliderShape,
  BuildGeometryColliderShape,
  BuildManualShape,
  FitColliderShape,
} from "./shapes";
import { MapShapeType, MotionTypeFor, type BodyBuildInput } from "./types";

/** Gather the shared per-body inputs (dynamics, material, geometry facts) once. */
export function BuildBodyInput(
  node: TransformNode,
  colliders: ColliderComponent[],
  body: RigidBodyComponent | undefined,
  scene: Scene,
  entityId?: string,
  shapesRegistry?: Map<string, PhysicsShape[]>
): BodyBuildInput
{
  const isMesh = node instanceof AbstractMesh && (node as AbstractMesh).getTotalVertices() > 0;

  return {
    node,
    colliders,
    scene,
    motion: MotionTypeFor(body),
    mass: body !== undefined && body.bodyType === "DYNAMIC" ? body.mass : 0,
    friction: body?.friction ?? 0.5,
    restitution: body?.restitution ?? 0.2,
    isMesh,
    hasGeometry: isMesh || OwnedColliderMeshes(node).length > 0,
    startAsleep: body?.startAsleep === true,
    entityId,
    shapesRegistry,
  };
}

function TrackPhysicsShape(input: BodyBuildInput, shape: PhysicsShape): void
{
  if (input.entityId === undefined || input.shapesRegistry === undefined)
  {
    return;
  }

  RegisterPhysicsShapeForEntity(input.shapesRegistry, input.entityId, shape);
}

/** Apply material and trigger flag to one collider shape (required on container children). */
function ConfigureColliderShape(
  shape: PhysicsShape,
  collider: ColliderComponent,
  friction: number,
  restitution: number,
  input?: BodyBuildInput
): void
{
  shape.material = { friction, restitution };
  if (collider.isTrigger)
  {
    shape.isTrigger = true;
  }

  if (input !== undefined)
  {
    TrackPhysicsShape(input, shape);
  }
}

/** Apply shared material/trigger settings to a freshly built shape. */
function ConfigureShape(shape: PhysicsShape, input: BodyBuildInput): void
{
  const collider = input.colliders[0];
  if (collider !== undefined)
  {
    ConfigureColliderShape(shape, collider, input.friction, input.restitution, input);
  }
  else
  {
    shape.material = { friction: input.friction, restitution: input.restitution };
    TrackPhysicsShape(input, shape);
  }
}

/** Attach a configured shape to the node as a new PhysicsBody. */
function AttachShape(shape: PhysicsShape, input: BodyBuildInput): PhysicsBody
{
  ConfigureShape(shape, input);

  const physicsBody = new PhysicsBody(input.node, input.motion, input.startAsleep, input.scene);
  physicsBody.shape = shape;
  return physicsBody;
}

/** Resolve center of mass for a dynamic rigidbody, or undefined to let Havok derive it from the shape. */
function ResolveCenterOfMass(
  node: TransformNode,
  body: RigidBodyComponent | undefined
): Vector3 | undefined
{
  if (body === undefined || body.bodyType !== "DYNAMIC")
  {
    return undefined;
  }

  if (body.centerOfMassAutoFit === true)
  {
    return ComputeLocalBounds(node).center;
  }

  if (body.centerOfMassAutoFit === false && body.centerOfMass !== undefined)
  {
    return new Vector3(...body.centerOfMass);
  }

  return undefined;
}

/** Apply mass and optional center-of-mass override after the collision shape is attached. */
export function ApplyMassProperties(
  physicsBody: PhysicsBody,
  node: TransformNode,
  body: RigidBodyComponent | undefined
): void
{
  const mass = body !== undefined && body.bodyType === "DYNAMIC" ? body.mass : 0;
  const centerOfMass = ResolveCenterOfMass(node, body);

  if (centerOfMass !== undefined)
  {
    physicsBody.setMassProperties({ mass, centerOfMass });
  }
  else
  {
    physicsBody.setMassProperties({ mass });
  }
}

function BuildGeometryShapeBody(input: BodyBuildInput, kind: "CONVEX" | "MESH"): PhysicsBody | undefined
{
  const collider = input.colliders[0];
  if (collider === undefined)
  {
    return undefined;
  }

  const shape = BuildGeometryColliderShape(
    input.node, collider, input.isMesh, input.hasGeometry, input.scene
  );
  if (shape === undefined)
  {
    return undefined;
  }

  return AttachShape(shape, input);
}

/**
 * Auto-fit primitive case: a PhysicsAggregate sizes the shape for real meshes;
 * multi-material wrapper nodes get a hierarchy-fitted shape instead (an
 * aggregate would call getTotalVertices on the non-mesh node and crash).
 */
function BuildAutoFitBody(input: BodyBuildInput, shapeKind: ColliderComponent["shape"]): PhysicsBody | undefined
{
  if (!input.hasGeometry)
  {
    console.warn(`[bjs] "${input.node.name}" has no mesh geometry to fit a collider.`);
    return undefined;
  }

  const collider = input.colliders[0];

  if (input.isMesh && !ApplyObjectScaleEnabled(collider?.applyObjectScale))
  {
    const aggregate = new PhysicsAggregate(
      input.node,
      MapShapeType(shapeKind),
      {
        mass: input.mass,
        friction: input.friction,
        restitution: input.restitution,
        startAsleep: input.startAsleep,
      },
      input.scene
    );

    if (collider?.isTrigger === true && aggregate.shape)
    {
      aggregate.shape.isTrigger = true;
    }

    // aggregate.shape is a Babylon "Nullable" that can be undefined at runtime.
    if (aggregate.shape)
    {
      TrackPhysicsShape(input, aggregate.shape);
    }

    return aggregate.body;
  }

  return AttachShape(FitColliderShape(input.node, input.colliders[0], input.scene), input);
}

/** Combine multiple COLLIDER components into one body via PhysicsShapeContainer. */
export function BuildCompoundBody(input: BodyBuildInput): PhysicsBody | undefined
{
  const container = new PhysicsShapeContainer(input.scene);

  for (const collider of input.colliders)
  {
    const shape = BuildColliderShape(input.node, collider, input);
    if (shape === undefined)
    {
      continue;
    }

    ConfigureColliderShape(shape, collider, input.friction, input.restitution, input);
    container.addChild(shape);
  }

  if (container.getNumChildren() === 0)
  {
    console.warn(`[bjs] "${input.node.name}" has ${input.colliders.length} colliders but none could be built.`);
    return undefined;
  }

  const physicsBody = new PhysicsBody(input.node, input.motion, input.startAsleep, input.scene);
  physicsBody.shape = container;
  return physicsBody;
}

/** Build one physics body from a single collider (or rigidbody-only auto-fit). */
export function BuildSingleColliderBody(input: BodyBuildInput): PhysicsBody | undefined
{
  const collider = input.colliders[0];
  const shapeKind = collider?.shape ?? "BOX";

  if (shapeKind === "CONVEX" || shapeKind === "MESH")
  {
    return BuildGeometryShapeBody(input, shapeKind);
  }

  if (collider === undefined || collider.autoFit)
  {
    return BuildAutoFitBody(input, shapeKind);
  }

  return AttachShape(
    BuildManualShape(ApplyObjectScaleToCollider(collider, input.node), input.scene),
    input
  );
}

/** Apply motion type and damping (the RIGIDBODY's dynamics) to a built body. */
export function ApplyBodyDynamics(
  physicsBody: PhysicsBody,
  motion: PhysicsMotionType,
  body: RigidBodyComponent | undefined
): void
{
  physicsBody.setMotionType(motion);

  if (body !== undefined)
  {
    physicsBody.setLinearDamping(body.linearDamping);
    physicsBody.setAngularDamping(body.angularDamping);

    // ANIMATED bodies are driven by code/animation on transformNode — push that
    // pose into Havok each step (disablePreStep defaults to true for perf).
    if (body.bodyType === "ANIMATED")
    {
      physicsBody.disablePreStep = false;
    }
  }
}
