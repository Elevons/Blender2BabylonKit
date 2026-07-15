import type { Scene } from "@babylonjs/core";
import type { Entity } from "../Entity";
import { RegisterAttachment } from "../attachments";
import type { ScriptComponent } from "../types";
import type { BehaviorRegistry } from "../../scripting/BehaviorRegistry";
import { ApplyExposedVars, type PendingRef } from "../../scripting/exposed";
import { InputManager, GetInputMapFields } from "../../input";
import type { InputActionMap } from "../../input/InputActionMap";
import type { Behavior } from "../../scripting/Behavior";

/**
 * SCRIPT component instantiation: create the behavior, inject entity/scene,
 * apply @exposed values (deferring entity references), and wire @inputMap
 * fields to Action Maps.
 */

/** Resolve a map name; blank uses the scene default, then the asset's first map. */
function ResolveInputMap(mapName: string, sceneDefaultMap: string): InputActionMap | undefined
{
  const resolvedName = mapName.length > 0 ? mapName : sceneDefaultMap;
  return InputManager.GetMap(resolvedName) ?? InputManager.GetDefaultMap();
}

/**
 * Fill @inputMap fields with Action Map handles. Scripts with no @inputMap
 * fields receive the scene default map on `behavior.input`.
 */
function InjectInputMaps(behavior: object, scriptName: string, sceneDefaultMap: string): void
{
  const fields = GetInputMapFields(behavior);

  if (fields.length === 0)
  {
    const map = ResolveInputMap("", sceneDefaultMap);
    if (map === undefined)
    {
      console.warn(
        `[bjs] script "${scriptName}": no @inputMap and scene default map ` +
        `"${sceneDefaultMap}" not found — define it in Blender's Input Actions panel`
      );
      return;
    }
    (behavior as Behavior).input = map;
    return;
  }

  for (const entry of fields)
  {
    const map = ResolveInputMap(entry.map, sceneDefaultMap);
    if (map === undefined)
    {
      const label = entry.map.length > 0 ? entry.map : sceneDefaultMap;
      console.warn(
        `[bjs] script "${scriptName}": @inputMap("${entry.map}") has no matching ` +
        `action map "${label}" — create it in Blender's Input Actions panel`
      );
      continue;
    }
    (behavior as Record<string, unknown>)[entry.field] = map;
  }
}

/** Instantiate SCRIPT behaviors, inject entity/scene, apply @exposed values. */
export function InstantiateScripts(
  entity: Entity,
  scripts: ScriptComponent[],
  scene: Scene,
  registry: BehaviorRegistry,
  sceneDefaultMap: string
): PendingRef[]
{
  const pendingReferences: PendingRef[] = [];

  for (const scriptComponent of scripts)
  {
    const behavior = registry.Create(scriptComponent.script);
    if (behavior === undefined)
    {
      continue;
    }

    behavior.entity = entity;
    behavior.scene = scene;
    pendingReferences.push(...ApplyExposedVars(behavior, scriptComponent.vars));
    InjectInputMaps(behavior, scriptComponent.script, sceneDefaultMap);
    RegisterAttachment(entity, { type: "SCRIPT", data: scriptComponent, behavior });
  }

  return pendingReferences;
}

/** Tear down one behavior instance before its SCRIPT attachment row is removed. */
export function TeardownScript(behavior: Behavior): void
{
  try
  {
    behavior.OnDestroy();
  }
  catch
  {
    // Ignore errors thrown during teardown.
  }
}

/** Resolve deferred entity references on a behavior after every entity exists. */
export function ResolveScriptReferences(
  behavior: Behavior,
  pendingReferences: PendingRef[],
  resolveEntity: (guid: string) => Entity | null
): void
{
  const instance = behavior as unknown as Record<string, unknown>;

  for (const reference of pendingReferences)
  {
    if (reference.instance !== behavior)
    {
      continue;
    }

    const target = resolveEntity(reference.guid);
    if (reference.index === undefined)
    {
      instance[reference.field] = target;
    }
    else
    {
      const slot = instance[reference.field];
      if (Array.isArray(slot))
      {
        slot[reference.index] = target;
      }
    }
  }
}
