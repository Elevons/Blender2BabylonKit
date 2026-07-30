import {
  Mesh,
  AbstractMesh,
  Matrix,
  Quaternion,
  TransformNode,
  Vector3,
  PhysicsShapeBox,
  PhysicsShapeSphere,
  PhysicsShapeCapsule,
  PhysicsShapeCylinder,
  PhysicsShapeConvexHull,
  PhysicsShapeMesh,
  type PhysicsShape,
  type Scene,
} from "@babylonjs/core";
import type { AttachmentOfType } from "../../core/attachments";
import type { Entity } from "../../core/Entity";
import type { ColliderComponent } from "../../core/types";
import { ApplyObjectScaleEnabled, LocalScaleAxes } from "../../core/nodeScale";
import {
  BakeColliderScaleIntoMesh,
  ComputeLocalBounds,
  MergeChildrenIntoLocalMesh,
  ScaleLocalBounds,
} from "./geometry";
import type { BodyBuildInput } from "./types";

/**
 * Auto-fit a primitive shape to a node's whole hierarchy, in the node's local
 * space. Used when the entity node is a TransformNode wrapping child meshes
 * (a multi-material Blender mesh, which imports as one child per material),
 * since PhysicsAggregate can't size a shape from a non-mesh node.
 */
export function FitColliderShape(
  node: TransformNode,
  collider: ColliderComponent | undefined,
  scene: Scene
): PhysicsShape
{
  let { center, size } = ComputeLocalBounds(node);
  if (ApplyObjectScaleEnabled(collider?.applyObjectScale))
  {
    ({ center, size } = ScaleLocalBounds({ center, size }, node));
  }

  switch (collider?.shape)
  {
    case "SPHERE":
      return new PhysicsShapeSphere(center, Math.max(size.x, size.y, size.z) / 2, scene);

    case "CAPSULE":
    {
      const radius = Math.max(size.x, size.z) / 2;
      const halfHeight = Math.max(size.y / 2 - radius, 0);
      return new PhysicsShapeCapsule(
        center.add(new Vector3(0, halfHeight, 0)),
        center.add(new Vector3(0, -halfHeight, 0)),
        radius, scene
      );
    }

    case "CYLINDER":
    {
      const radius = Math.max(size.x, size.z) / 2;
      const halfHeight = size.y / 2;
      return new PhysicsShapeCylinder(
        center.add(new Vector3(0, halfHeight, 0)),
        center.add(new Vector3(0, -halfHeight, 0)),
        radius, scene
      );
    }

    default: // BOX (also the fallback for a convex/mesh shape that fails to build)
      return new PhysicsShapeBox(center, Quaternion.Identity(), size, scene);
  }
}

export function BuildHullOrMeshShape(
  node: TransformNode,
  isMesh: boolean,
  kind: "CONVEX" | "MESH",
  scene: Scene,
  collider?: ColliderComponent
): PhysicsShape | undefined
{
  const makeShape = (sourceMesh: Mesh): PhysicsShape =>
    kind === "CONVEX"
      ? new PhysicsShapeConvexHull(sourceMesh, scene)
      : new PhysicsShapeMesh(sourceMesh, scene);

  if (isMesh)
  {
    const { mesh: sourceMesh, disposeSource } = BakeColliderScaleIntoMesh(
      node as AbstractMesh, node, collider
    );
    const shape = makeShape(sourceMesh);
    if (disposeSource)
    {
      sourceMesh.dispose();
    }
    return shape;
  }

  const mergedMesh = MergeChildrenIntoLocalMesh(node);
  if (mergedMesh === undefined)
  {
    return undefined;
  }

  mergedMesh.setEnabled(false);
  const { mesh: sourceMesh, disposeSource } = BakeColliderScaleIntoMesh(mergedMesh, node, collider);
  if (disposeSource)
  {
    mergedMesh.dispose();
  }

  const shape = makeShape(sourceMesh);
  sourceMesh.dispose();
  return shape;
}

/** Multiply manual collider dimensions by the entity node's scale when authored. */
export function ApplyObjectScaleToCollider(
  collider: ColliderComponent,
  node: TransformNode
): ColliderComponent
{
  if (!ApplyObjectScaleEnabled(collider.applyObjectScale))
  {
    return collider;
  }

  const { sx, sy, sz } = LocalScaleAxes(node);

  const scaled: ColliderComponent = {
    ...collider,
    size: [collider.size[0] * sx, collider.size[1] * sy, collider.size[2] * sz],
    center: [collider.center[0] * sx, collider.center[1] * sy, collider.center[2] * sz],
    radius: collider.radius,
    height: collider.height,
  };

  switch (collider.shape)
  {
    case "SPHERE":
      scaled.radius = collider.radius * Math.max(sx, sy, sz);
      break;
    case "CAPSULE":
    case "CYLINDER":
      scaled.radius = collider.radius * Math.max(sx, sz);
      scaled.height = collider.height * sy;
      break;
    default:
      break;
  }

  return scaled;
}

/** Build a hand-authored primitive shape from Babylon-space (Y-up) dimensions. */
export function BuildManualShape(collider: ColliderComponent, scene: Scene): PhysicsShape
{
  const center = new Vector3(...collider.center);
  const rotation = collider.rotation !== undefined
    ? Quaternion.FromArray(collider.rotation) // [x, y, z, w]
    : Quaternion.Identity();

  const rotationMatrix = new Matrix();
  Matrix.FromQuaternionToRef(rotation, rotationMatrix);
  const halfAxis = (length: number): Vector3 =>
    Vector3.TransformNormal(new Vector3(0, length, 0), rotationMatrix);

  switch (collider.shape)
  {
    case "SPHERE":
      return new PhysicsShapeSphere(center, collider.radius, scene); // rotation N/A

    case "CAPSULE":
    {
      const offset = halfAxis(Math.max(collider.height / 2 - collider.radius, 0));
      return new PhysicsShapeCapsule(center.add(offset), center.subtract(offset), collider.radius, scene);
    }

    case "CYLINDER":
    {
      const offset = halfAxis(collider.height / 2);
      return new PhysicsShapeCylinder(center.add(offset), center.subtract(offset), collider.radius, scene);
    }

    default: // BOX
      return new PhysicsShapeBox(center, rotation, new Vector3(...collider.size), scene);
  }
}

/**
 * CONVEX / MESH case: geometry-derived (manual size/center don't apply), with a
 * fitted-box fallback if the hull/mesh can't be built.
 */
export function BuildGeometryColliderShape(
  node: TransformNode,
  collider: ColliderComponent,
  isMesh: boolean,
  hasGeometry: boolean,
  scene: Scene
): PhysicsShape | undefined
{
  if (!hasGeometry)
  {
    console.warn(`[bjs] "${node.name}" has no mesh geometry for a ${collider.shape} collider.`);
    return undefined;
  }

  let shape: PhysicsShape | undefined;
  try
  {
    shape = BuildHullOrMeshShape(
      node, isMesh, collider.shape as "CONVEX" | "MESH", scene, collider
    );
  }
  catch (error)
  {
    console.warn(`[bjs] ${collider.shape} shape failed for "${node.name}"; using a box.`, error);
  }

  if (shape === undefined)
  {
    shape = FitColliderShape(node, { ...collider, shape: "BOX" }, scene);
  }

  return shape;
}

/** Build one authored collider as a standalone PhysicsShape (for compound bodies). */
export function BuildColliderShape(
  node: TransformNode,
  collider: ColliderComponent,
  input: BodyBuildInput
): PhysicsShape | undefined
{
  const { shape } = collider;
  if (shape === "CONVEX" || shape === "MESH")
  {
    return BuildGeometryColliderShape(node, collider, input.isMesh, input.hasGeometry, input.scene);
  }

  if (collider.autoFit)
  {
    if (!input.hasGeometry)
    {
      console.warn(`[bjs] "${node.name}" has no mesh geometry to fit a collider.`);
      return undefined;
    }

    return FitColliderShape(node, collider, input.scene);
  }

  return BuildManualShape(ApplyObjectScaleToCollider(collider, node), input.scene);
}

/**
 * Whether a world-space point lies inside an entity's authored trigger collider
 * (BOX or SPHERE). Uses manifest collider data — not Havok overlap events.
 */
export function IsPointInsideColliderVolume(
  worldPoint: Vector3,
  volumeEntity: Entity,
  colliderAttachment?: AttachmentOfType<"COLLIDER">
): boolean
{
  const attachment = colliderAttachment ?? volumeEntity.GetAttachment("COLLIDER");
  if (attachment === undefined)
  {
    return false;
  }

  const collider = attachment.data;
  if (!collider.isTrigger)
  {
    return false;
  }

  const scaledCollider = ApplyObjectScaleToCollider(collider, volumeEntity.node);
  volumeEntity.node.computeWorldMatrix(true);
  const inverseWorldMatrix = Matrix.Invert(volumeEntity.node.getWorldMatrix());
  const localPoint = Vector3.TransformCoordinates(worldPoint, inverseWorldMatrix);
  const offset = localPoint.subtract(Vector3.FromArray(scaledCollider.center));

  if (scaledCollider.rotation !== undefined)
  {
    const inverseRotation = Quaternion.FromArray(scaledCollider.rotation).conjugate();
    offset.applyRotationQuaternionInPlace(inverseRotation);
  }

  switch (scaledCollider.shape)
  {
    case "BOX":
    {
      const halfExtents = Vector3.FromArray(scaledCollider.size).scaleInPlace(0.5);
      return Math.abs(offset.x) <= halfExtents.x
        && Math.abs(offset.y) <= halfExtents.y
        && Math.abs(offset.z) <= halfExtents.z;
    }
    case "SPHERE":
      return offset.length() <= scaledCollider.radius;
    default:
      return false;
  }
}

/** Whether a probe entity's world position is inside a trigger volume entity. */
export function IsEntityInsideColliderVolume(
  probeEntity: Entity,
  volumeEntity: Entity,
  colliderAttachment?: AttachmentOfType<"COLLIDER">
): boolean
{
  probeEntity.node.computeWorldMatrix(true);
  return IsPointInsideColliderVolume(
    probeEntity.node.getAbsolutePosition(),
    volumeEntity,
    colliderAttachment
  );
}
