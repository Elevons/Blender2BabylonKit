import { Mesh } from "@babylonjs/core";
import type { Entity } from "../core/Entity";
import type { LodComponent, LodLevel } from "../core/types";
import { RegisterAttachment } from "../core/attachments";
import { CollectOwnedMeshes } from "../core/meshOwnership";

/**
 * A deferred LOD registration queued during the per-entity load pass and
 * processed in FinalizeLevel once every entity exists (target GUIDs resolve).
 */
export interface LodRegistration
{
  entity: Entity;
  component: LodComponent;
}

/**
 * Apply distance-based mesh LOD swapping for every entity that has a LOD
 * component. Target GUIDs are resolved via level.ById(), then each owned
 * mesh on the source entity receives MeshLODLevel entries.
 */
export function BuildLodLevels(
  registrations: LodRegistration[],
  resolveEntity: (guid: string) => Entity | undefined
): void
{
  for (const registration of registrations)
  {
    ApplyLodRegistration(registration, resolveEntity);
  }
}

/**
 * Apply one LOD registration: resolve target GUIDs, collect owned meshes on
 * both sides, and wire Babylon MeshLODLevel entries.
 */
function ApplyLodRegistration(
  registration: LodRegistration,
  resolveEntity: (guid: string) => Entity | undefined
): void
{
  const { entity, component } = registration;
  const ownedMeshes = CollectOwnedMeshes(entity.node);

  if (ownedMeshes.length === 0)
  {
    console.warn(
      `[bjs] LOD on "${entity.name}": entity owns no meshes — skipping`
    );
    return;
  }

  if (component.levels.length === 0)
  {
    console.warn(
      `[bjs] LOD on "${entity.name}": no LOD levels authored — skipping`
    );
    return;
  }

  // Sort levels by distance ascending so Babylon resolves them in order.
  const sortedLevels = [...component.levels].sort(
    (left, right) => left.distance - right.distance
  );

  for (const ownedMesh of ownedMeshes)
  {
    if (!(ownedMesh instanceof Mesh))
    {
      continue;
    }

    for (const level of sortedLevels)
    {
      ApplyLodLevelToMesh(entity.name, ownedMesh, level, resolveEntity);
    }
  }

  RegisterAttachment(entity, { type: "LOD", data: component });
}

/**
 * Resolve one LOD level's target entity and wire its meshes as LOD levels
 * on the source mesh.
 */
function ApplyLodLevelToMesh(
  sourceName: string,
  ownedMesh: Mesh,
  level: LodLevel,
  resolveEntity: (guid: string) => Entity | undefined
): void
{
  if (level.autoLod)
  {
    ApplyAutoLodLevel(sourceName, ownedMesh, level);
    return;
  }

  if (level.target === null || level.target === undefined)
  {
    return;
  }

  const targetEntity = resolveEntity(level.target);
  if (targetEntity === undefined)
  {
    console.warn(
      `[bjs] LOD on "${sourceName}": target "${level.target}" not found — skipping level`
    );
    return;
  }

  // LOD targets must be mesh-only — components on the target would keep
  // running independently even when its mesh is used as a LOD stand-in.
  if (targetEntity.attachments.length > 0)
  {
    console.warn(
      `[bjs] LOD on "${sourceName}": target "${targetEntity.name}" has components — ` +
        `LOD targets must be mesh-only; skipping level`
    );
    return;
  }

  const targetMeshes = CollectOwnedMeshes(targetEntity.node);
  if (targetMeshes.length === 0)
  {
    console.warn(
      `[bjs] LOD on "${sourceName}": target entity "${targetEntity.name}" owns no meshes — skipping`
    );
    return;
  }

  for (const targetMesh of targetMeshes)
  {
    if (targetMesh instanceof Mesh)
    {
      ownedMesh.addLODLevel(level.distance, targetMesh);
    }
  }
}

/**
 * Apply Babylon's built-in mesh simplification to auto-generate a lower-detail
 * LOD mesh at runtime.
 */
function ApplyAutoLodLevel(
  sourceName: string,
  ownedMesh: Mesh,
  level: LodLevel
): void
{
  const quality = level.quality ?? 0.5;
  const optimizeMesh = level.optimizeMesh ?? false;

  ownedMesh.simplify(
    [
      {
        quality,
        distance: level.distance,
        optimizeMesh,
      },
    ],
    true,
    0, // SimplificationType.QUADRATIC
    () =>
    {
      // Simplification complete — Babylon automatically adds the LOD level.
    }
  );
}
