import {
  AbstractMesh,
  InstancedMesh,
  Mesh,
  Matrix,
  Quaternion,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { ColliderComponent } from "../../core/types";
import { CollectOwnedChildMeshes } from "../../core/meshOwnership";
import { ApplyObjectScaleEnabled, LocalScaleAxes } from "../../core/nodeScale";
import type { LocalBounds } from "./types";

/**
 * The meshes whose geometry this node's collider should use: the node's own
 * multi-material submeshes, but NOT meshes belonging to child *entities*
 * parented under it in Blender. The GUID-based rule lives in
 * core/meshOwnership.ts, shared with reflection probes.
 */
export function OwnedColliderMeshes(node: TransformNode): AbstractMesh[]
{
  return CollectOwnedChildMeshes(node);
}

/**
 * Compute a node's bounding box in its own local frame, over only the meshes
 * this collider owns (its own + multi-material submeshes, excluding child
 * entities). Corner-by-corner so the AABB transforms correctly into local space.
 */
export function ComputeLocalBounds(node: TransformNode): LocalBounds
{
  node.computeWorldMatrix(true);

  const ownedMeshes = OwnedColliderMeshes(node);
  const inverseWorld = Matrix.Invert(node.getWorldMatrix());
  let localMin = new Vector3(Infinity, Infinity, Infinity);
  let localMax = new Vector3(-Infinity, -Infinity, -Infinity);

  // If the node itself is a mesh with geometry, include it alongside any owned
  // submeshes (a single-material mesh has no submesh children).
  const sources: AbstractMesh[] = ownedMeshes.slice();
  if (node instanceof AbstractMesh && node.getTotalVertices() > 0 && !sources.includes(node))
  {
    sources.push(node);
  }

  for (const mesh of sources)
  {
    mesh.computeWorldMatrix(true);
    const meshBounds = mesh.getBoundingInfo().boundingBox;

    // The 8 world-space corners of this mesh, pulled into the node's local frame.
    for (const worldCorner of meshBounds.vectorsWorld)
    {
      const localCorner = Vector3.TransformCoordinates(worldCorner, inverseWorld);
      localMin = Vector3.Minimize(localMin, localCorner);
      localMax = Vector3.Maximize(localMax, localCorner);
    }
  }

  return {
    center: localMin.add(localMax).scale(0.5),
    size: localMax.subtract(localMin),
  };
}

/** Scale a local AABB by the node's local scale (for applyObjectScale auto-fit). */
export function ScaleLocalBounds(bounds: LocalBounds, node: TransformNode): LocalBounds
{
  const { sx, sy, sz } = LocalScaleAxes(node);

  return {
    center: new Vector3(bounds.center.x * sx, bounds.center.y * sy, bounds.center.z * sz),
    size: new Vector3(bounds.size.x * sx, bounds.size.y * sy, bounds.size.z * sz),
  };
}

/** Clone renderable geometry (Mesh or glTF-instanced reuse) for physics baking. */
function CloneMeshGeometry(source: AbstractMesh, cloneName: string): Mesh | null
{
  if (source instanceof InstancedMesh)
  {
    return source.sourceMesh.clone(cloneName, null);
  }

  if (source instanceof Mesh)
  {
    return source.clone(cloneName, null);
  }

  return null;
}

/** Clone one child mesh and bake its geometry into the wrapper's local frame. */
function CloneChildIntoLocalFrame(childMesh: AbstractMesh, inverseWorld: Matrix): Mesh | null
{
  const clone = CloneMeshGeometry(childMesh, `${childMesh.name}__cphys`);
  if (clone === null)
  {
    return null;
  }

  clone.parent = null;
  clone.position = Vector3.Zero();
  clone.rotationQuaternion = Quaternion.Identity();
  clone.scaling = Vector3.One();
  clone.bakeTransformIntoVertices(childMesh.computeWorldMatrix(true).multiply(inverseWorld));
  return clone;
}

/**
 * Clone a wrapper node's per-material child meshes, bake each into the wrapper's
 * local frame, and merge them into one disposable mesh — geometry input for a
 * hull/mesh shape that must span the whole multi-material object. Returns
 * undefined when there is no usable geometry.
 */
export function MergeChildrenIntoLocalMesh(node: TransformNode): Mesh | undefined
{
  const inverseWorld = Matrix.Invert(node.computeWorldMatrix(true));
  const clones: Mesh[] = [];

  // Only this node's own submeshes — not meshes belonging to child entities.
  for (const childMesh of OwnedColliderMeshes(node))
  {
    const clone = CloneChildIntoLocalFrame(childMesh, inverseWorld);
    if (clone !== null)
    {
      clones.push(clone);
    }
  }

  if (clones.length === 0)
  {
    return undefined;
  }

  const mergedMesh = clones.length === 1
    ? clones[0]
    : Mesh.MergeMeshes(clones, true, true, undefined, false, false);

  if (mergedMesh === null)
  {
    for (const clone of clones)
    {
      clone.dispose();
    }
    return undefined;
  }

  return mergedMesh;
}

/**
 * Build a real CONVEX_HULL or MESH shape from a node's geometry. A single mesh
 * feeds its own geometry directly; a multi-material wrapper is merged first.
 * When applyObjectScale is on, local scale is baked into vertices (same rule as
 * manual primitives). Returns undefined if there is no usable geometry.
 */
/** Resolve Mesh or InstancedMesh into a standalone Mesh for Havok shape builders. */
function ResolvePhysicsMesh(source: AbstractMesh): { mesh: Mesh; disposeSource: boolean }
{
  if (source instanceof Mesh)
  {
    return { mesh: source, disposeSource: false };
  }

  if (source instanceof InstancedMesh)
  {
    const clone = source.sourceMesh.clone(`${source.name}__colliderSource`, null);
    if (clone === null)
    {
      throw new Error(`[bjs] "${source.name}" has no cloneable mesh geometry for a collider.`);
    }

    clone.parent = null;
    clone.position = Vector3.Zero();
    clone.rotationQuaternion = Quaternion.Identity();
    clone.scaling = Vector3.One();
    clone.bakeTransformIntoVertices(source.computeWorldMatrix(true));
    return { mesh: clone, disposeSource: true };
  }

  throw new Error(`[bjs] "${source.name}" has no cloneable mesh geometry for a collider.`);
}

export function BakeColliderScaleIntoMesh(
  mesh: AbstractMesh,
  node: TransformNode,
  collider: ColliderComponent | undefined
): { mesh: Mesh; disposeSource: boolean }
{
  const { mesh: resolvedMesh, disposeSource: disposeResolved } = ResolvePhysicsMesh(mesh);

  if (!ApplyObjectScaleEnabled(collider?.applyObjectScale))
  {
    return { mesh: resolvedMesh, disposeSource: disposeResolved };
  }

  const { sx, sy, sz } = LocalScaleAxes(node);
  const scaled = resolvedMesh.clone(`${resolvedMesh.name}__colliderScale`, null);
  if (scaled === null)
  {
    return { mesh: resolvedMesh, disposeSource: disposeResolved };
  }

  if (disposeResolved)
  {
    resolvedMesh.dispose();
  }

  scaled.bakeTransformIntoVertices(Matrix.Scaling(sx, sy, sz));
  return { mesh: scaled, disposeSource: true };
}
