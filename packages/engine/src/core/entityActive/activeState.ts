import type {
  Scene,
  TransformNode,
  Node,
  PhysicsShape,
} from "@babylonjs/core";
import type { Level } from "../Level";
import { Entity } from "../Entity";
import { RefreshCollisionCallbacks } from "../../subsystems/collisions";
import { ResumeEntityRuntime, SuspendEntityRuntime } from "./suspend";
import { ApplyNodeSubtreeVisibility } from "./subtreeVisibility";
import { AssignSceneLevel, ReadNodeEntity, ReadSceneLevel } from "../bjsMetadata";

/** Level registered on the scene during load, when available. */
function ResolveLevelFromScene(scene: Scene): Level | undefined
{
  return ReadSceneLevel(scene);
}

/** Resolve the Entity registered on a scene node, if any. */
export function EntityFromNode(node: TransformNode): Entity | undefined
{
  return ReadNodeEntity(node);
}

/**
 * Unity `activeInHierarchy`: local {@link Entity.active} plus every ancestor
 * entity on the node parent chain must also be locally active.
 */
export function IsEntityActive(entity: Entity): boolean
{
  if (!entity.active)
  {
    return false;
  }

  let parentNode: Node | null = entity.node.parent;
  while (parentNode !== null)
  {
    const parentEntity = EntityFromNode(parentNode as TransformNode);
    if (parentEntity !== undefined && !parentEntity.active)
    {
      return false;
    }

    parentNode = parentNode.parent;
  }

  return true;
}

/** Every entity on `root` and its descendant nodes (including `root`). */
function CollectEntitiesOnNodeSubtree(root: Entity): Entity[]
{
  const entities: Entity[] = [root];

  for (const descendant of root.node.getDescendants(false))
  {
    const entity = EntityFromNode(descendant as TransformNode);
    if (entity !== undefined && entity !== root)
    {
      entities.push(entity);
    }
  }

  return entities;
}

/** Fire {@link Behavior.OnEnable} on every behavior when hierarchy becomes active. */
function DispatchOnEnable(entity: Entity): void
{
  for (const behavior of entity.behaviors)
  {
    try
    {
      behavior.OnEnable();
    }
    catch (error)
    {
      console.error(`[bjs] OnEnable "${entity.name}"`, error);
    }
  }
}

/** Fire {@link Behavior.OnDisable} before systems pause when hierarchy becomes inactive. */
function DispatchOnDisable(entity: Entity): void
{
  for (const behavior of entity.behaviors)
  {
    try
    {
      behavior.OnDisable();
    }
    catch (error)
    {
      console.error(`[bjs] OnDisable "${entity.name}"`, error);
    }
  }
}

/** Apply effective-active transitions for one entity. */
function ReconcileEntityEffectiveActive(
  entity: Entity,
  scene: Scene,
  level: Level | undefined,
  shapesRegistry: Map<string, PhysicsShape[]> | undefined
): boolean
{
  const nowActive = IsEntityActive(entity);
  if (nowActive === entity.effectiveActive)
  {
    return false;
  }

  let resumedPhysics = false;

  if (nowActive)
  {
    if (ResumeEntityRuntime(entity, scene, shapesRegistry))
    {
      resumedPhysics = true;
    }

    entity.effectiveActive = true;
    DispatchOnEnable(entity);
  }
  else
  {
    DispatchOnDisable(entity);
    SuspendEntityRuntime(entity, scene);
    entity.effectiveActive = false;
  }

  if (resumedPhysics && level !== undefined)
  {
    RefreshCollisionCallbacks(level, level.componentHost.eventMessageRegistrations);
  }

  return true;
}

/** Reconcile every entity whose effective-active state may have changed. */
function ReconcileEffectiveActiveSubtree(
  root: Entity,
  scene: Scene,
  level: Level | undefined
): void
{
  const shapesRegistry = level?.componentHost.physicsShapesByEntity;
  const entities = CollectEntitiesOnNodeSubtree(root);

  for (const entity of entities)
  {
    ReconcileEntityEffectiveActive(entity, scene, level, shapesRegistry);
  }

  // A resumed ancestor re-shows its whole node subtree, which wrongly reveals
  // descendants whose local `active` is still false — re-hide those subtrees.
  if (root.effectiveActive)
  {
    for (const entity of entities)
    {
      if (!entity.effectiveActive)
      {
        ApplyNodeSubtreeVisibility(scene, entity.node, false);
      }
    }
  }
}

/**
 * Set local active state (`activeSelf`) on one entity, then reconcile effective
 * active for it and every descendant entity on its node subtree.
 */
export function SetEntityActive(entity: Entity, active: boolean): void
{
  const scene = entity.node.getScene();
  if (scene === null)
  {
    return;
  }

  if (entity.active === active)
  {
    return;
  }

  entity.active = active;

  const level = ResolveLevelFromScene(scene);
  ReconcileEffectiveActiveSubtree(entity, scene, level);
}

/** Bind the loaded level on the scene so runtime helpers can reach physics state. */
export function BindLevelToScene(scene: Scene, level: Level): void
{
  AssignSceneLevel(scene, level);
}
