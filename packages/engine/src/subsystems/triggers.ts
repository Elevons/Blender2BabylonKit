import { Scene, HavokPlugin } from "@babylonjs/core";
import type { IBasePhysicsCollisionEvent, Observer } from "@babylonjs/core";
import type { Entity } from "../core/Entity";
import type { TriggerEventData } from "../core/types";
import type { Level } from "../core/Level";

/**
 * Trigger messaging: "when something enters this trigger collider, send a
 * message to that entity's behaviors" — authored per-collider in Blender,
 * delivered through Behavior.OnMessage(message, source).
 *
 * Havok raises trigger events on the plugin-level onTriggerCollisionObservable
 * (NOT on the body's collision observable), with `collider` = the trigger body
 * and `collidedAgainst` = the body that entered it. Note a Havok limitation:
 * MESH-shaped triggers never fire (the Blender validator warns about this).
 */

/** One trigger collider's authored reactions, registered during the load pass. */
export interface TriggerRegistration {
  sourceEntity: Entity;
  events: TriggerEventData[];
}

/** Resolve a physics body back to its Entity via the node's metadata back-reference. */
function EntityFromBody(body: IBasePhysicsCollisionEvent["collidedAgainst"]): Entity | null
{
  const metadata = body.transformNode?.metadata as { bjsEntity?: Entity } | undefined;
  return metadata?.bjsEntity ?? null;
}

/**
 * Subscribe one plugin-level observer that dispatches TRIGGER_ENTERED events to
 * the authored reactions. Returns the observer so the level can detach it on
 * dispose (or null when physics isn't enabled / nothing was registered).
 */
export function WireTriggerEvents(
  scene: Scene,
  level: Level,
  registrations: TriggerRegistration[]
): Observer<IBasePhysicsCollisionEvent> | null
{
  if (registrations.length === 0)
  {
    return null;
  }

  const physicsEngine = scene.getPhysicsEngine();
  const plugin = physicsEngine?.getPhysicsPlugin();
  if (!plugin || !(plugin instanceof HavokPlugin))
  {
    console.warn("[bjs] trigger events authored but Havok physics isn't enabled");
    return null;
  }

  // Index registrations by their trigger body for O(1) dispatch per event.
  const registrationByBody = new Map<unknown, TriggerRegistration>();
  for (const registration of registrations)
  {
    if (registration.sourceEntity.body !== undefined)
    {
      registrationByBody.set(registration.sourceEntity.body, registration);
    }
  }

  return plugin.onTriggerCollisionObservable.add((collisionEvent) =>
  {
    if (collisionEvent.type !== "TRIGGER_ENTERED")
    {
      return;
    }

    const registration = registrationByBody.get(collisionEvent.collider);
    if (registration === undefined)
    {
      return;
    }

    const enteringEntity = EntityFromBody(collisionEvent.collidedAgainst);
    if (enteringEntity === null)
    {
      return; // a non-entity body (no manifest record) entered; nothing to deliver
    }

    DeliverTriggerEvents(level, registration, enteringEntity);
  });
}

/** Run one registration's authored reactions against the entity that entered. */
function DeliverTriggerEvents(
  level: Level,
  registration: TriggerRegistration,
  enteringEntity: Entity
): void
{
  for (const triggerEvent of registration.events)
  {
    // Optional tag gate: only matching entities set the event off.
    if (triggerEvent.filterTag.length > 0 && enteringEntity.tag !== triggerEvent.filterTag)
    {
      continue;
    }

    if (triggerEvent.target === null)
    {
      continue;
    }

    const targetEntity = level.ById(triggerEvent.target);
    if (targetEntity === undefined)
    {
      console.warn(`[bjs] trigger event target ${triggerEvent.target} not found`);
      continue;
    }

    targetEntity.SendMessage(triggerEvent.message, enteringEntity);
  }
}
