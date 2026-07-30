import {
  DirectionalLight,
  Matrix,
  Scene,
  Vector3,
  VertexBuffer,
} from "@babylonjs/core";
import type { AbstractMesh } from "@babylonjs/core";

/** Scene metadata key for directional shadow maintenance teardown callbacks. */
export const DIRECTIONAL_SHADOW_MAINTENANCE_KEY = "bjsDirectionalShadowMaintenance";

/** Cap the per-mesh vertex scan; a large heightmap terrain needs only a sample. */
const MAX_RECEIVER_DEPTH_SAMPLES = 40000;

/** Light-space axis-aligned bounds of a mesh set, or null when the set is empty. */
interface LightSpaceBounds
{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Merged world-space AABB center of every shadow caster mesh. */
function ShadowCasterBoundsCenter(casters: AbstractMesh[]): Vector3 | null
{
  if (casters.length === 0)
  {
    return null;
  }

  const boundsMin = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
  const boundsMax = new Vector3(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);

  for (const mesh of casters)
  {
    mesh.computeWorldMatrix(true);
    const worldMin = mesh.getBoundingInfo().boundingBox.minimumWorld;
    const worldMax = mesh.getBoundingInfo().boundingBox.maximumWorld;
    boundsMin.x = Math.min(boundsMin.x, worldMin.x);
    boundsMin.y = Math.min(boundsMin.y, worldMin.y);
    boundsMin.z = Math.min(boundsMin.z, worldMin.z);
    boundsMax.x = Math.max(boundsMax.x, worldMax.x);
    boundsMax.y = Math.max(boundsMax.y, worldMax.y);
    boundsMax.z = Math.max(boundsMax.z, worldMax.z);
  }

  return boundsMin.add(boundsMax).scaleInPlace(0.5);
}

/**
 * Directional shadows use an orthographic frustum anchored at light.position.
 * Re-center on caster geometry so a Blender sun empty placed far from the level
 * does not stretch depth precision or push content to the frustum edge.
 */
function AnchorDirectionalShadowOrigin(light: DirectionalLight, casters: AbstractMesh[]): void
{
  const center = ShadowCasterBoundsCenter(casters);
  if (center === null)
  {
    light.position.copyFrom(light.direction).scaleInPlace(-1);
    return;
  }

  light.position.copyFrom(center.subtract(light.direction));
  light.forceProjectionMatrixCompute();
}

/** Project every caster corner into the light view and return its light-space AABB. */
function CasterLightSpaceBounds(viewMatrix: Matrix, casters: AbstractMesh[]): LightSpaceBounds | null
{
  if (casters.length === 0)
  {
    return null;
  }

  const bounds: LightSpaceBounds = {
    minX: Number.MAX_VALUE,
    maxX: -Number.MAX_VALUE,
    minY: Number.MAX_VALUE,
    maxY: -Number.MAX_VALUE,
    minZ: Number.MAX_VALUE,
    maxZ: -Number.MAX_VALUE,
  };
  const projected = Vector3.Zero();

  for (const mesh of casters)
  {
    for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld)
    {
      Vector3.TransformCoordinatesToRef(corner, viewMatrix, projected);
      bounds.minX = Math.min(bounds.minX, projected.x);
      bounds.maxX = Math.max(bounds.maxX, projected.x);
      bounds.minY = Math.min(bounds.minY, projected.y);
      bounds.maxY = Math.max(bounds.maxY, projected.y);
      bounds.minZ = Math.min(bounds.minZ, projected.z);
      bounds.maxZ = Math.max(bounds.maxZ, projected.z);
    }
  }

  return bounds;
}

/** Broad phase: does the mesh's light-space AABB overlap the caster X/Y rect? */
function ReceiverOverlapsRect(
  mesh: AbstractMesh,
  viewMatrix: Matrix,
  rectMinX: number,
  rectMaxX: number,
  rectMinY: number,
  rectMaxY: number
): boolean
{
  let minX = Number.MAX_VALUE;
  let maxX = -Number.MAX_VALUE;
  let minY = Number.MAX_VALUE;
  let maxY = -Number.MAX_VALUE;
  const projected = Vector3.Zero();

  for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld)
  {
    Vector3.TransformCoordinatesToRef(corner, viewMatrix, projected);
    minX = Math.min(minX, projected.x);
    maxX = Math.max(maxX, projected.x);
    minY = Math.min(minY, projected.y);
    maxY = Math.max(maxY, projected.y);
  }

  return maxX >= rectMinX && minX <= rectMaxX && maxY >= rectMinY && minY <= rectMaxY;
}

/** Broad-phase overlap already passed — widen depth using the receiver AABB corners. */
function ExtendDepthFromReceiverBBoxCorners(
  mesh: AbstractMesh,
  viewMatrix: Matrix,
  rectMinX: number,
  rectMaxX: number,
  rectMinY: number,
  rectMaxY: number,
  depthRange: { min: number; max: number }
): void
{
  const projected = Vector3.Zero();

  for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld)
  {
    Vector3.TransformCoordinatesToRef(corner, viewMatrix, projected);
    if (
      projected.x >= rectMinX && projected.x <= rectMaxX &&
      projected.y >= rectMinY && projected.y <= rectMaxY
    )
    {
      depthRange.min = Math.min(depthRange.min, projected.z);
      depthRange.max = Math.max(depthRange.max, projected.z);
    }
  }
}

/**
 * Narrow phase: walk a receiver's actual vertices and widen the depth range for
 * any vertex inside the caster X/Y rect. Strided so a dense mesh stays cheap.
 */
function ExtendDepthFromReceiverVertices(
  mesh: AbstractMesh,
  viewMatrix: Matrix,
  rectMinX: number,
  rectMaxX: number,
  rectMinY: number,
  rectMaxY: number,
  depthRange: { min: number; max: number }
): void
{
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (positions === null)
  {
    return;
  }

  const worldMatrix = mesh.computeWorldMatrix(true);
  const vertexCount = positions.length / 3;
  const stride = Math.max(1, Math.ceil(vertexCount / MAX_RECEIVER_DEPTH_SAMPLES));
  const local = Vector3.Zero();
  const projected = Vector3.Zero();

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += stride)
  {
    const offset = vertexIndex * 3;
    local.copyFromFloats(positions[offset], positions[offset + 1], positions[offset + 2]);
    Vector3.TransformCoordinatesToRef(local, worldMatrix, projected);
    Vector3.TransformCoordinatesToRef(projected, viewMatrix, projected);
    if (
      projected.x >= rectMinX && projected.x <= rectMaxX &&
      projected.y >= rectMinY && projected.y <= rectMaxY
    )
    {
      depthRange.min = Math.min(depthRange.min, projected.z);
      depthRange.max = Math.max(depthRange.max, projected.z);
    }
  }
}

/**
 * Fit the directional shadow depth range (shadowMinZ/shadowMaxZ) so it covers
 * the casters and the ground beneath them within the caster X/Y footprint.
 */
function FitDirectionalDepthToReceivers(
  light: DirectionalLight,
  casters: AbstractMesh[],
  receivers: AbstractMesh[]
): void
{
  const lightDirection = Vector3.Normalize(light.direction);
  const viewMatrix = Matrix.LookAtLH(
    light.position,
    light.position.add(lightDirection),
    Vector3.Up()
  );

  const casterBounds = CasterLightSpaceBounds(viewMatrix, casters);
  if (casterBounds === null)
  {
    return;
  }

  const padX = (casterBounds.maxX - casterBounds.minX) * light.shadowOrthoScale;
  const padY = (casterBounds.maxY - casterBounds.minY) * light.shadowOrthoScale;
  const rectMinX = casterBounds.minX - padX;
  const rectMaxX = casterBounds.maxX + padX;
  const rectMinY = casterBounds.minY - padY;
  const rectMaxY = casterBounds.maxY + padY;

  const depthRange = { min: casterBounds.minZ, max: casterBounds.maxZ };

  for (const mesh of receivers)
  {
    if (!ReceiverOverlapsRect(mesh, viewMatrix, rectMinX, rectMaxX, rectMinY, rectMaxY))
    {
      continue;
    }
    ExtendDepthFromReceiverBBoxCorners(
      mesh, viewMatrix, rectMinX, rectMaxX, rectMinY, rectMaxY, depthRange
    );
    ExtendDepthFromReceiverVertices(
      mesh, viewMatrix, rectMinX, rectMaxX, rectMinY, rectMaxY, depthRange
    );
  }

  const margin = (depthRange.max - depthRange.min) * 0.01 + 1;
  light.shadowMinZ = depthRange.min - margin;
  light.shadowMaxZ = depthRange.max + margin;
  light.forceProjectionMatrixCompute();
}

function RegisterDirectionalShadowMaintenance(scene: Scene, disposer: () => void): void
{
  const metadata = scene.metadata ?? {};
  const existing = metadata[DIRECTIONAL_SHADOW_MAINTENANCE_KEY];
  const disposers: (() => void)[] = Array.isArray(existing) ? existing : [];
  disposers.push(disposer);
  scene.metadata = { ...metadata, [DIRECTIONAL_SHADOW_MAINTENANCE_KEY]: disposers };
}

/**
 * Keep a directional sun behaving like an infinite light each frame: re-anchor
 * the shadow view origin on caster geometry and refit depth when aim or anchor moves.
 */
function InstallDirectionalShadowMaintenance(
  scene: Scene,
  light: DirectionalLight,
  casters: AbstractMesh[],
  receivers: AbstractMesh[],
  autoDepth: boolean
): () => void
{
  const lastAnchor = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
  const lastDirection = light.direction.clone();

  const observer = scene.onBeforeRenderObservable.add(() =>
  {
    AnchorDirectionalShadowOrigin(light, casters);

    const anchorMoved = !light.position.equalsWithEpsilon(lastAnchor, 0.001);
    const directionMoved = !light.direction.equalsWithEpsilon(lastDirection, 1e-4);
    if (anchorMoved)
    {
      lastAnchor.copyFrom(light.position);
    }
    if (directionMoved)
    {
      lastDirection.copyFrom(light.direction);
    }

    if (autoDepth && (anchorMoved || directionMoved))
    {
      FitDirectionalDepthToReceivers(light, casters, receivers);
    }
  });

  return () =>
  {
    scene.onBeforeRenderObservable.remove(observer);
  };
}

/**
 * Anchor directional shadow origin, fit depth to receivers, and register per-frame
 * maintenance for one sun light.
 */
export function ConfigureDirectionalShadow(
  scene: Scene,
  light: DirectionalLight,
  shadowCasters: AbstractMesh[],
  renderableMeshes: AbstractMesh[],
  autoDepth: boolean
): void
{
  AnchorDirectionalShadowOrigin(light, shadowCasters);
  if (autoDepth)
  {
    FitDirectionalDepthToReceivers(light, shadowCasters, renderableMeshes);
  }
  RegisterDirectionalShadowMaintenance(
    scene,
    InstallDirectionalShadowMaintenance(
      scene,
      light,
      shadowCasters,
      renderableMeshes,
      autoDepth
    )
  );
}

/** Tear down per-frame directional shadow maintenance registered during setup. */
export function DisposeDirectionalShadowMaintenance(scene: Scene): void
{
  const disposers = scene.metadata?.[DIRECTIONAL_SHADOW_MAINTENANCE_KEY];
  if (!Array.isArray(disposers))
  {
    return;
  }

  for (const disposer of disposers)
  {
    disposer();
  }

  delete scene.metadata[DIRECTIONAL_SHADOW_MAINTENANCE_KEY];
}
