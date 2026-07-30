import { Entity } from "../Entity";
import type { Level } from "../Level";
import { GetExposedFields, type ExposedField } from "../../scripting/exposed";

/**
 * Hide every in-level spawn template referenced by a behavior `@exposed` field
 * marked `spawnTemplate: true`. Runs after entity references resolve and before
 * `OnStart`, so deferred spawners do not flash or simulate live template copies.
 */
export async function HideMarkedSpawnTemplates(level: Level): Promise<void>
{
  const templatesToHide = new Set<Entity>();

  for (const entity of level.entities.values())
  {
    for (const behavior of entity.behaviors)
    {
      CollectMarkedSpawnTemplates(behavior, templatesToHide);
    }
  }

  for (const template of templatesToHide)
  {
    await level.HideTemplate(template);
  }
}

/** Gather template entities from one behavior's spawnTemplate exposed fields. */
function CollectMarkedSpawnTemplates(behavior: object, templatesToHide: Set<Entity>): void
{
  for (const field of GetExposedFields(behavior))
  {
    if (field.spawnTemplate !== true)
    {
      continue;
    }

    CollectFieldTemplates(behavior, field, templatesToHide);
  }
}

/** Add resolved entity references from one spawnTemplate field. */
function CollectFieldTemplates(
  behavior: object,
  field: ExposedField,
  templatesToHide: Set<Entity>
): void
{
  const instance = behavior as Record<string, unknown>;
  const value = instance[field.name];

  if (field.type === "entity")
  {
    ConsiderTemplate(value, templatesToHide);
    return;
  }

  if (field.type === "list" && field.of === "entity" && Array.isArray(value))
  {
    for (const element of value)
    {
      ConsiderTemplate(element, templatesToHide);
    }
  }
}

function ConsiderTemplate(value: unknown, templatesToHide: Set<Entity>): void
{
  if (value instanceof Entity)
  {
    templatesToHide.add(value);
  }
}
