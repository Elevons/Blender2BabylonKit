import type { Entity } from "../core/Entity";
import type { Level } from "../core/Level";
import { CollectOwnedMeshes } from "../core/meshOwnership";
import type {
  EntityData,
  LayerMaskComponent,
  RenderingGroupComponent,
} from "../core/types";

/** Fields shared by both layer component kinds for propagation rules. */
interface LayerPropagationFields
{
  applyOwnedMeshes?: boolean;
  applyChildEntities?: boolean;
}

/**
 * Apply RENDERING_GROUP and LAYER_MASK components after every entity exists.
 * Child propagation stops at the first descendant that defines its own component
 * of the same kind; that descendant's toggles then govern its subtree.
 */
export function ApplyRenderLayers(manifest: LevelManifestSlice, level: Level): void
{
  const childrenByParent = BuildChildrenByParent(manifest.entities);
  const visited = new Set<string>();

  const renderingGroupById = BuildRenderingGroupMap(manifest.entities);
  const layerMaskById = BuildLayerMaskMap(manifest.entities);

  for (const entityData of manifest.entities)
  {
    if (entityData.parent === null && entityData.id.length > 0)
    {
      WalkRenderingGroups(
        entityData.id,
        null,
        renderingGroupById,
        childrenByParent,
        level,
        visited
      );
    }
  }

  for (const entityData of manifest.entities)
  {
    if (entityData.id.length > 0 && !visited.has(entityData.id))
    {
      WalkRenderingGroups(
        entityData.id,
        null,
        renderingGroupById,
        childrenByParent,
        level,
        visited
      );
    }
  }

  visited.clear();

  for (const entityData of manifest.entities)
  {
    if (entityData.parent === null && entityData.id.length > 0)
    {
      WalkLayerMasks(
        entityData.id,
        null,
        layerMaskById,
        childrenByParent,
        level,
        visited
      );
    }
  }

  for (const entityData of manifest.entities)
  {
    if (entityData.id.length > 0 && !visited.has(entityData.id))
    {
      WalkLayerMasks(
        entityData.id,
        null,
        layerMaskById,
        childrenByParent,
        level,
        visited
      );
    }
  }
}

/** Minimal manifest slice needed for hierarchy walks. */
export interface LevelManifestSlice
{
  entities: EntityData[];
}

function BuildRenderingGroupMap(entities: EntityData[]): Map<string, RenderingGroupComponent>
{
  const ownById = new Map<string, RenderingGroupComponent>();

  for (const entityData of entities)
  {
    if (entityData.id.length === 0)
    {
      continue;
    }

    const component = entityData.components.find(
      (entry) => entry.type === "RENDERING_GROUP"
    ) as RenderingGroupComponent | undefined;

    if (component !== undefined)
    {
      ownById.set(entityData.id, component);
    }
  }

  return ownById;
}

function BuildLayerMaskMap(entities: EntityData[]): Map<string, LayerMaskComponent>
{
  const ownById = new Map<string, LayerMaskComponent>();

  for (const entityData of entities)
  {
    if (entityData.id.length === 0)
    {
      continue;
    }

    const component = entityData.components.find(
      (entry) => entry.type === "LAYER_MASK"
    ) as LayerMaskComponent | undefined;

    if (component !== undefined)
    {
      ownById.set(entityData.id, component);
    }
  }

  return ownById;
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

function ShouldApplyOwned(component: LayerPropagationFields): boolean
{
  return component.applyOwnedMeshes !== false;
}

function ShouldApplyChildren(component: LayerPropagationFields): boolean
{
  return component.applyChildEntities === true;
}

function WalkRenderingGroups(
  entityId: string,
  inherited: RenderingGroupComponent | null,
  ownById: Map<string, RenderingGroupComponent>,
  childrenByParent: Map<string, string[]>,
  level: Level,
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
      ApplyRenderingGroupToEntity(entity, own.renderingGroupId);
    }

    const propagate = ShouldApplyChildren(own) ? own : null;
    for (const childId of childIds)
    {
      WalkRenderingGroups(
        childId,
        propagate,
        ownById,
        childrenByParent,
        level,
        visited
      );
    }
    return;
  }

  if (inherited !== null)
  {
    ApplyRenderingGroupToEntity(entity, inherited.renderingGroupId);

    const propagate = ShouldApplyChildren(inherited) ? inherited : null;
    for (const childId of childIds)
    {
      WalkRenderingGroups(
        childId,
        propagate,
        ownById,
        childrenByParent,
        level,
        visited
      );
    }
    return;
  }

  for (const childId of childIds)
  {
    WalkRenderingGroups(childId, null, ownById, childrenByParent, level, visited);
  }
}

function WalkLayerMasks(
  entityId: string,
  inherited: LayerMaskComponent | null,
  ownById: Map<string, LayerMaskComponent>,
  childrenByParent: Map<string, string[]>,
  level: Level,
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
      ApplyLayerMaskToEntity(entity, own.layerMask);
    }

    const propagate = ShouldApplyChildren(own) ? own : null;
    for (const childId of childIds)
    {
      WalkLayerMasks(childId, propagate, ownById, childrenByParent, level, visited);
    }
    return;
  }

  if (inherited !== null)
  {
    ApplyLayerMaskToEntity(entity, inherited.layerMask);

    const propagate = ShouldApplyChildren(inherited) ? inherited : null;
    for (const childId of childIds)
    {
      WalkLayerMasks(childId, propagate, ownById, childrenByParent, level, visited);
    }
    return;
  }

  for (const childId of childIds)
  {
    WalkLayerMasks(childId, null, ownById, childrenByParent, level, visited);
  }
}

/** Set renderingGroupId on every mesh and particle system this entity owns. */
function ApplyRenderingGroupToEntity(entity: Entity, renderingGroupId: number): void
{
  for (const mesh of CollectOwnedMeshes(entity.node))
  {
    mesh.renderingGroupId = renderingGroupId;
  }

  for (const system of entity.particleSystems)
  {
    system.renderingGroupId = renderingGroupId;
  }
}

/** Set layerMask on every mesh this entity owns. */
function ApplyLayerMaskToEntity(entity: Entity, layerMask: number): void
{
  for (const mesh of CollectOwnedMeshes(entity.node))
  {
    mesh.layerMask = layerMask;
  }
}
