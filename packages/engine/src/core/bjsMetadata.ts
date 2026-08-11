import type { Scene, TransformNode } from "@babylonjs/core";
import { Entity } from "./Entity";
import type { Level } from "./Level";

/**
 * Kit runtime hooks live on Babylon `metadata`. They must be non-enumerable:
 * the Inspector Properties pane walks `Object.values(metadata)` recursively
 * (`ObjectCanSafelyStringify`) and Entity↔node / Level↔scene cycles overflow
 * the stack ("too much recursion").
 */

/** Drop enumerable kit keys, then attach a non-enumerable `bjsEntity`. */
export function AssignNodeEntity(
  node: TransformNode,
  entity: Entity | undefined
): void
{
  const previous = (node.metadata ?? {}) as Record<string, unknown>;
  const { bjsEntity: _removed, ...rest } = previous;
  const metadata: Record<string, unknown> = { ...rest };
  node.metadata = metadata;

  if (entity === undefined)
  {
    return;
  }

  Object.defineProperty(metadata, "bjsEntity", {
    value: entity,
    enumerable: false,
    writable: true,
    configurable: true,
  });
}

/** Drop enumerable kit keys, then attach a non-enumerable `bjsLevel`. */
export function AssignSceneLevel(scene: Scene, level: Level): void
{
  const previous = (scene.metadata ?? {}) as Record<string, unknown>;
  const { bjsLevel: _removed, ...rest } = previous;
  const metadata: Record<string, unknown> = { ...rest };
  scene.metadata = metadata;

  Object.defineProperty(metadata, "bjsLevel", {
    value: level,
    enumerable: false,
    writable: true,
    configurable: true,
  });
}

/** Read `bjsEntity` whether it was stored enumerable (legacy) or not. */
export function ReadNodeEntity(node: TransformNode): Entity | undefined
{
  const entity = (node.metadata as { bjsEntity?: Entity } | undefined)?.bjsEntity;
  return entity instanceof Entity ? entity : undefined;
}

/** Read `bjsLevel` whether it was stored enumerable (legacy) or not. */
export function ReadSceneLevel(scene: Scene): Level | undefined
{
  return (scene.metadata as { bjsLevel?: Level } | undefined)?.bjsLevel;
}
