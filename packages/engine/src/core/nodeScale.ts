import { Matrix, Vector3, type TransformNode } from "@babylonjs/core";

/** True unless the manifest explicitly sets applyObjectScale to false (default: on). */
export function ApplyObjectScaleEnabled(flag: boolean | undefined): boolean
{
  return flag !== false;
}

const SCALE_EPSILON = 1e-6;

/**
 * This object's own scale only (not parents). Parent scale is already carried
 * by the node's world matrix on the physics body; baking absoluteScaling again
 * double-scales child colliders under a scaled parent.
 */
export function LocalScaleAxes(node: TransformNode): { sx: number; sy: number; sz: number }
{
  const localScaling = node.scaling;
  return { sx: Math.abs(localScaling.x), sy: Math.abs(localScaling.y), sz: Math.abs(localScaling.z) };
}

/** True when this node's own scale deviates from identity (parents excluded). */
export function HasLocalNodeScale(node: TransformNode): boolean
{
  const { sx, sy, sz } = LocalScaleAxes(node);
  return Math.abs(sx - 1) > SCALE_EPSILON
    || Math.abs(sy - 1) > SCALE_EPSILON
    || Math.abs(sz - 1) > SCALE_EPSILON;
}

/** World pose without scale — used when local scale is baked into authored dims. */
export function WorldMatrixWithoutScale(node: TransformNode): Matrix
{
  return Matrix.Compose(Vector3.One(), node.absoluteRotationQuaternion, node.absolutePosition);
}

/**
 * World matrix for pivot/shape placement. When local scale was baked into
 * authored dimensions, omit only this node's scale (parents still apply).
 */
export function WorldMatrixForScaledPhysics(
  node: TransformNode,
  applyObjectScale: boolean
): Matrix
{
  if (applyObjectScale && HasLocalNodeScale(node))
  {
    return WorldMatrixWithoutScale(node);
  }

  return node.getWorldMatrix();
}

/** Effective distance scale along a unit direction in the owner's local space. */
export function DistanceScaleAlongLocalAxis(
  node: TransformNode,
  axisUnit: Vector3
): number
{
  const { sx, sy, sz } = LocalScaleAxes(node);
  const ax = axisUnit.normalize();
  return new Vector3(ax.x * sx, ax.y * sy, ax.z * sz).length();
}
