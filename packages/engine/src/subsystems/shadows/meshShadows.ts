import type { AbstractMesh, ShadowGenerator } from "@babylonjs/core";
import type { Entity } from "../../core/Entity";
import type { Level } from "../../core/Level";
import { CollectOwnedMeshes } from "../../core/meshOwnership";
import type { EntityData, MeshShadowMode, MeshShadowsComponent } from "../../core/types";
import type { LevelManifestSlice } from "../renderLayers";

/** Fields shared with render-layer components for propagation rules. */
interface MeshShadowPropagationFields
{
  applyOwnedMeshes?: boolean;
  applyChildEntities?: boolean;
}

/** Resolved cast/receive flags for one mesh-shadow mode. */
export interface MeshShadowFlags
{
  cast: boolean;
  receive: boolean;
}

/** Map a manifest mesh-shadow mode to Babylon cast/receive flags. */
export function MeshShadowModeToFlags(mode: MeshShadowMode): MeshShadowFlags
{
  switch (mode)
  {
    case "CAST_AND_RECEIVE":
      return { cast: true, receive: true };

    case "RECEIVE_ONLY":
      return { cast: false, receive: true };

    case "CAST_ONLY":
      return { cast: true, receive: false };

    case "NONE":
      return { cast: false, receive: false };
  }
}

function ShouldApplyOwned(component: MeshShadowPropagationFields): boolean
{
  return component.applyOwnedMeshes !== false;
}

function ShouldApplyChildren(component: MeshShadowPropagationFields): boolean
{
  return component.applyChildEntities === true;
}

function BuildChildrenByParent(entities: EntityData[]): Map<string, string[]>
{
  const childrenByParent = new Map<string, string[]>();

  for (const entityData of entities)
  {
    if (entityData.parent === null || entityData.id.length === 0)
    {
      continue;
    }

    const siblings = childrenByParent.get(entityData.parent);
    if (siblings === undefined)
    {
      childrenByParent.set(entityData.parent, [entityData.id]);
    }
    else
    {
      siblings.push(entityData.id);
    }
  }

  return childrenByParent;
}

function BuildMeshShadowsMap(entities: EntityData[]): Map<string, MeshShadowsComponent>
{
  const ownById = new Map<string, MeshShadowsComponent>();

  for (const entityData of entities)
  {
    if (entityData.id.length === 0)
    {
      continue;
    }

    const component = entityData.components.find(
      (entry) => entry.type === "MESH_SHADOWS"
    ) as MeshShadowsComponent | undefined;

    if (component !== undefined)
    {
      ownById.set(entityData.id, component);
    }
  }

  return ownById;
}

/** Set receiveShadows and register or drop casters on every shadow generator. */
export function ApplyMeshShadowFlagsToMeshes(
  meshes: AbstractMesh[],
  flags: MeshShadowFlags,
  shadowGenerators: ShadowGenerator[]
): void
{
  for (const mesh of meshes)
  {
    if (mesh.getTotalVertices() === 0)
    {
      continue;
    }

    mesh.receiveShadows = flags.receive;

    for (const generator of shadowGenerators)
    {
      if (flags.cast)
      {
        generator.addShadowCaster(mesh, false);
      }
      else
      {
        generator.removeShadowCaster(mesh);
      }
    }
  }
}

function ApplyMeshShadowsToEntity(
  entity: Entity,
  component: MeshShadowsComponent,
  shadowGenerators: ShadowGenerator[]
): void
{
  const flags = MeshShadowModeToFlags(component.mode);
  ApplyMeshShadowFlagsToMeshes(CollectOwnedMeshes(entity.node), flags, shadowGenerators);
}

function WalkMeshShadows(
  entityId: string,
  inherited: MeshShadowsComponent | null,
  ownById: Map<string, MeshShadowsComponent>,
  childrenByParent: Map<string, string[]>,
  level: Level,
  shadowGenerators: ShadowGenerator[],
  visited: Set<string>
): void
{
  if (visited.has(entityId))
  {
    return;
  }
  visited.add(entityId);

  const entity = level.ById(entityId);
  if (entity === undefined)
  {
    return;
  }

  const own = ownById.get(entityId);
  const childIds = childrenByParent.get(entityId) ?? [];

  if (own !== undefined)
  {
    if (ShouldApplyOwned(own))
    {
      ApplyMeshShadowsToEntity(entity, own, shadowGenerators);
    }

    const propagate = ShouldApplyChildren(own) ? own : null;
    for (const childId of childIds)
    {
      WalkMeshShadows(
        childId,
        propagate,
        ownById,
        childrenByParent,
        level,
        shadowGenerators,
        visited
      );
    }
    return;
  }

  if (inherited !== null)
  {
    ApplyMeshShadowsToEntity(entity, inherited, shadowGenerators);

    const propagate = ShouldApplyChildren(inherited) ? inherited : null;
    for (const childId of childIds)
    {
      WalkMeshShadows(
        childId,
        propagate,
        ownById,
        childrenByParent,
        level,
        shadowGenerators,
        visited
      );
    }
    return;
  }

  for (const childId of childIds)
  {
    WalkMeshShadows(
      childId,
      null,
      ownById,
      childrenByParent,
      level,
      shadowGenerators,
      visited
    );
  }
}

/**
 * Apply MESH_SHADOWS components after SetupShadows. Overrides glTF ray-visibility
 * Shadow and receiveShadows defaults on owned meshes (optional child propagation).
 */
export function ApplyMeshShadows(
  manifest: LevelManifestSlice,
  level: Level,
  shadowGenerators: ShadowGenerator[]
): void
{
  if (shadowGenerators.length === 0)
  {
    return;
  }

  const childrenByParent = BuildChildrenByParent(manifest.entities);
  const ownById = BuildMeshShadowsMap(manifest.entities);
  const visited = new Set<string>();

  for (const entityData of manifest.entities)
  {
    if (entityData.parent === null && entityData.id.length > 0)
    {
      WalkMeshShadows(
        entityData.id,
        null,
        ownById,
        childrenByParent,
        level,
        shadowGenerators,
        visited
      );
    }
  }

  for (const entityData of manifest.entities)
  {
    if (entityData.id.length > 0 && !visited.has(entityData.id))
    {
      WalkMeshShadows(
        entityData.id,
        null,
        ownById,
        childrenByParent,
        level,
        shadowGenerators,
        visited
      );
    }
  }
}
