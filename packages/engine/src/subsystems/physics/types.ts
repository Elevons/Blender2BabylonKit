import {
  PhysicsMotionType,
  PhysicsShapeType,
  TransformNode,
  type PhysicsShape,
  type Scene,
} from "@babylonjs/core";
import type { Vector3 } from "@babylonjs/core";
import type { ColliderComponent, RigidBodyComponent } from "../../core/types";

/** Local-frame bounding box of a node's whole hierarchy. */
export interface LocalBounds
{
  center: Vector3;
  size: Vector3;
}
export interface BodyBuildInput
{
  node: TransformNode;
  colliders: ColliderComponent[];
  scene: Scene;
  motion: PhysicsMotionType;
  mass: number;
  friction: number;
  restitution: number;
  isMesh: boolean;
  hasGeometry: boolean;
  startAsleep: boolean;
  entityId?: string;
  shapesRegistry?: Map<string, PhysicsShape[]>;
}

/** Map our collider shape enum to Havok's primitive shape-type enum. */
export function MapShapeType(shape: ColliderComponent["shape"]): PhysicsShapeType
{
  switch (shape)
  {
    case "SPHERE": return PhysicsShapeType.SPHERE;
    case "CAPSULE": return PhysicsShapeType.CAPSULE;
    case "CYLINDER": return PhysicsShapeType.CYLINDER;
    case "CONVEX": return PhysicsShapeType.CONVEX_HULL;
    case "MESH": return PhysicsShapeType.MESH;
    default: return PhysicsShapeType.BOX;
  }
}

/** Map a RIGIDBODY's body type to Havok's motion type (no body = static). */
export function MotionTypeFor(body?: RigidBodyComponent): PhysicsMotionType
{
  if (body === undefined)
  {
    return PhysicsMotionType.STATIC;
  }

  switch (body.bodyType)
  {
    case "DYNAMIC": return PhysicsMotionType.DYNAMIC;
    case "ANIMATED": return PhysicsMotionType.ANIMATED;
    default: return PhysicsMotionType.STATIC;
  }
}
