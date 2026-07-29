import type {
  Component,
  EntityData,
  Gui3DControlComponent,
} from "./types";

/**
 * The GUID field registry: every manifest component field that stores an
 * entity GUID, mirrored from the Blender add-on's `iter_referenced_objects`
 * (export/components.py). Spawn uses it to retarget a duplicated subtree onto
 * fresh GUIDs; a future split-GLB prefab export reuses the same contract.
 *
 * Missing a field here means silently broken references on spawned instances,
 * so when the exporter gains a new GUID-bearing field it MUST be added here
 * (scripts/check-component-types.mjs keeps component *types* in sync; GUID
 * fields are this file's responsibility).
 *
 * Level-scoped GUIDs (e.g. `scene.atmosphere.sunLightId`) are deliberately
 * absent — they live on the scene block, not on entities, and are never
 * remapped by Spawn.
 */

/** Maps one GUID to its replacement; returns the input for external refs. */
export type GuidRemapper = (guid: string) => string;

const GUI3D_CONTROL_TYPES: ReadonlySet<Component["type"]> = new Set([
  "GUI3D_BUTTON",
  "GUI3D_HOLO",
  "GUI3D_TOUCH_HOLO",
  "GUI3D_MESH",
]);

/**
 * SCRIPT `vars` carry no type information in the manifest, so every string
 * value (and string list item) is checked against the remapper — entity refs
 * are GUID strings and only GUIDs inside the spawned subtree change. A plain
 * string colliding with a template GUID is practically impossible.
 */
function RewriteScriptVars(
  vars: Record<string, number | boolean | string | number[] | null> | undefined,
  remap: GuidRemapper
): void
{
  if (vars === undefined)
  {
    return;
  }

  for (const [name, value] of Object.entries(vars))
  {
    if (typeof value === "string")
    {
      vars[name] = remap(value);
    }
    else if (Array.isArray(value))
    {
      for (let index = 0; index < value.length; index++)
      {
        const item = value[index] as unknown;
        if (typeof item === "string")
        {
          (value as unknown[])[index] = remap(item);
        }
      }
    }
  }
}

/**
 * Rewrite every entity-GUID-bearing field on one component, in place. The
 * component must already be a private deep copy (see RemapEntityData).
 */
export function RewriteComponentGuids(component: Component, remap: GuidRemapper): void
{
  switch (component.type)
  {
    case "SCRIPT":
      RewriteScriptVars(component.vars, remap);
      break;

    case "CAMERA":
      if (component.target !== null)
      {
        component.target = remap(component.target);
      }
      break;

    case "COLLIDER":
      for (const eventMessage of component.eventMessages ?? [])
      {
        if (eventMessage.target !== null)
        {
          eventMessage.target = remap(eventMessage.target);
        }
      }
      break;

    case "CONSTRAINT":
      if (component.target !== null)
      {
        component.target = remap(component.target);
      }
      break;

    case "REFLECTION_PROBE":
      component.renderList = component.renderList.map(remap);
      component.renderExcludes = component.renderExcludes.map(remap);
      break;

    case "LOD":
      for (const level of component.levels)
      {
        if (level.target !== undefined && level.target !== null)
        {
          level.target = remap(level.target);
        }
      }
      break;

    default:
      if (GUI3D_CONTROL_TYPES.has(component.type))
      {
        for (const clickEvent of (component as Gui3DControlComponent).events)
        {
          if (clickEvent.target !== null)
          {
            clickEvent.target = remap(clickEvent.target);
          }
        }
      }
      break;
  }
}

/**
 * Deep-copy one manifest entity row and rewrite every GUID it carries — its
 * own id, its parent link, and all component reference fields. GUIDs the
 * remapper leaves unchanged (refs pointing outside a spawned subtree) still
 * resolve to the original shared level entities.
 */
export function RemapEntityData(entityData: EntityData, remap: GuidRemapper): EntityData
{
  const copy = structuredClone(entityData);

  copy.id = remap(copy.id);
  if (copy.parent !== null)
  {
    copy.parent = remap(copy.parent);
  }

  for (const component of copy.components)
  {
    RewriteComponentGuids(component, remap);
  }

  return copy;
}
