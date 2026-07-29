import type { PhysicsShape } from "@babylonjs/core";
import type { Level } from "../core/Level";
import type {
  CollisionLayerComponent,
  CollisionLayersInfo,
  EntityData,
} from "../core/types";

/** The manifest slice collision-layer application needs (LevelManifest fits). */
export interface CollisionLayerManifestSlice
{
  scene?: { collisionLayers?: CollisionLayersInfo };
  entities: EntityData[];
}

/** Resolved Havok filter masks for one named layer. */
export interface CollisionLayerMasks
{
  membership: number;
  collide: number;
}

/** Fields shared by collision layer components for propagation rules. */
interface CollisionPropagationFields
{
  applyOwnedColliders?: boolean;
  applyChildEntities?: boolean;
}

/**
 * Apply COLLISION_LAYER components after every physics body exists. Uses the
 * scene collision matrix to resolve Havok filterMembershipMask /
 * filterCollideMask on each registered physics shape.
 */
export function ApplyCollisionLayers(
  manifest: CollisionLayerManifestSlice,
  level: Level,
  physicsShapesByEntity: ReadonlyMap<string, readonly PhysicsShape[]>
): void
{
  const collisionLayers = manifest.scene?.collisionLayers;
  if (collisionLayers === undefined)
  {
    return;
  }

  const resolver = BuildCollisionLayerResolver(collisionLayers);
  if (resolver === undefined)
  {
    return;
  }

  const childrenByParent = BuildChildrenByParent(manifest.entities);
  const ownById = BuildCollisionLayerMap(manifest.entities);
  const visited = new Set<string>();

  for (const entityData of manifest.entities)
  {
    if (entityData.parent === null && entityData.id.length > 0)
    {
      WalkCollisionLayers(
        entityData.id,
        null,
        ownById,
        childrenByParent,
        level,
        resolver,
        physicsShapesByEntity,
        visited
      );
    }
  }

  for (const entityData of manifest.entities)
  {
    if (entityData.id.length > 0 && !visited.has(entityData.id))
    {
      WalkCollisionLayers(
        entityData.id,
        null,
        ownById,
        childrenByParent,
        level,
        resolver,
        physicsShapesByEntity,
        visited
      );
    }
  }
}

/** Build name → Havok masks from the scene collision layer table. */
export function BuildCollisionLayerResolver(
  collisionLayers: CollisionLayersInfo
): Map<string, CollisionLayerMasks> | undefined
{
  const layerCount = collisionLayers.layers.length;
  if (layerCount === 0 || layerCount > 32)
  {
    return undefined;
  }

  const resolver = new Map<string, CollisionLayerMasks>();

  for (let rowIndex = 0; rowIndex < layerCount; rowIndex++)
  {
    const layerName = collisionLayers.layers[rowIndex];
    if (layerName.length === 0)
    {
      continue;
    }

    const membership = 1 << rowIndex;
    let collide = 0;
    const matrixRow = collisionLayers.matrix[rowIndex];

    if (matrixRow !== undefined)
    {
      for (let colIndex = 0; colIndex < layerCount; colIndex++)
      {
        if (matrixRow[colIndex] === true)
        {
          collide |= 1 << colIndex;
        }
      }
    }

    resolver.set(layerName, { membership, collide });
  }

  return resolver;
}

function BuildCollisionLayerMap(entities: EntityData[]): Map<string, CollisionLayerComponent>
{
  const ownById = new Map<string, CollisionLayerComponent>();

  for (const entityData of entities)
  {
    if (entityData.id.length === 0)
    {
      continue;
    }

    const component = entityData.components.find(
      (entry) => entry.type === "COLLISION_LAYER"
    ) as CollisionLayerComponent | undefined;

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

function ShouldApplyOwnedColliders(component: CollisionPropagationFields): boolean
{
  return component.applyOwnedColliders !== false;
}

function ShouldApplyChildEntities(component: CollisionPropagationFields): boolean
{
  return component.applyChildEntities === true;
}

function WalkCollisionLayers(
  entityId: string,
  inherited: CollisionLayerComponent | null,
  ownById: Map<string, CollisionLayerComponent>,
  childrenByParent: Map<string, string[]>,
  level: Level,
  resolver: Map<string, CollisionLayerMasks>,
  physicsShapesByEntity: ReadonlyMap<string, readonly PhysicsShape[]>,
  visited: Set<string>
): void
{
  if (visited.has(entityId))
  {
    return;
  }
  visited.add(entityId);

  if (level.ById(entityId) === undefined)
  {
    return;
  }

  const own = ownById.get(entityId);
  const childIds = childrenByParent.get(entityId) ?? [];

  if (own !== undefined)
  {
    if (ShouldApplyOwnedColliders(own))
    {
      ApplyCollisionLayerToEntity(entityId, own.layer, resolver, physicsShapesByEntity);
    }

    const propagate = ShouldApplyChildEntities(own) ? own : null;
    for (const childId of childIds)
    {
      WalkCollisionLayers(
        childId,
        propagate,
        ownById,
        childrenByParent,
        level,
        resolver,
        physicsShapesByEntity,
        visited
      );
    }
    return;
  }

  if (inherited !== null)
  {
    ApplyCollisionLayerToEntity(
      entityId,
      inherited.layer,
      resolver,
      physicsShapesByEntity
    );

    const propagate = ShouldApplyChildEntities(inherited) ? inherited : null;
    for (const childId of childIds)
    {
      WalkCollisionLayers(
        childId,
        propagate,
        ownById,
        childrenByParent,
        level,
        resolver,
        physicsShapesByEntity,
        visited
      );
    }
    return;
  }

  for (const childId of childIds)
  {
    WalkCollisionLayers(
      childId,
      null,
      ownById,
      childrenByParent,
      level,
      resolver,
      physicsShapesByEntity,
      visited
    );
  }
}

function ApplyCollisionLayerToEntity(
  entityId: string,
  layerName: string,
  resolver: Map<string, CollisionLayerMasks>,
  physicsShapesByEntity: ReadonlyMap<string, readonly PhysicsShape[]>
): void
{
  const masks = resolver.get(layerName);
  if (masks === undefined)
  {
    console.warn(
      `[bjs] collision layer "${layerName}" not found in scene collisionLayers — skipping`
    );
    return;
  }

  const shapes = physicsShapesByEntity.get(entityId);
  if (shapes === undefined || shapes.length === 0)
  {
    return;
  }

  for (const shape of shapes)
  {
    shape.filterMembershipMask = masks.membership;
    shape.filterCollideMask = masks.collide;
  }
}

/** Record one physics shape built for an entity (compound bodies register each child). */
export function RegisterPhysicsShapeForEntity(
  registry: Map<string, PhysicsShape[]>,
  entityId: string,
  shape: PhysicsShape
): void
{
  const existing = registry.get(entityId);
  if (existing === undefined)
  {
    registry.set(entityId, [shape]);
    return;
  }

  existing.push(shape);
}
