import type {
  IPhysicsCollisionEvent,
  PhysicsBody,
} from "@babylonjs/core";
import type { Entity } from "../../core/Entity";
import { IsEntityActive } from "../../core/entityActive";
import type { Level } from "../../core/Level";
import type {
  CollisionContact,
  EventMessageData,
  EventMessagePhase,
} from "../../core/types";
import { Behavior } from "../../scripting/Behavior";

/** One collider entity's authored Event Messages, registered during the load pass. */
export interface EventMessageRegistration {
  sourceEntity: Entity;
  messagesByPhase: Map<EventMessagePhase, EventMessageData[]>;
}

export const TRIGGER_PHASES: ReadonlySet<EventMessagePhase> = new Set([
  "TRIGGER_ENTER",
  "TRIGGER_EXIT",
]);

export const COLLISION_PHASES: ReadonlySet<EventMessagePhase> = new Set([
  "COLLISION_ENTER",
  "COLLISION_EXIT",
]);

/** Resolve a physics body back to its Entity via the node's metadata back-reference. */
export function EntityFromBody(body: PhysicsBody): Entity | null
{
  const metadata = body.transformNode?.metadata as { bjsEntity?: Entity } | undefined;
  return metadata?.bjsEntity ?? null;
}

/** Map a Havok collision event into the engine's contact payload. */
export function ContactFromEvent(collisionEvent: IPhysicsCollisionEvent): CollisionContact
{
  const point = collisionEvent.point;
  const normal = collisionEvent.normal;

  return {
    point: point !== null
      ? { x: point.x, y: point.y, z: point.z }
      : null,
    normal: normal !== null
      ? { x: normal.x, y: normal.y, z: normal.z }
      : null,
    impulse: collisionEvent.impulse,
    distance: collisionEvent.distance,
  };
}

/** Whether any behavior on the entity overrides a collision lifecycle hook. */
export function EntityOverridesCollisionHook(
  entity: Entity,
  hook: "enter" | "stay" | "exit"
): boolean
{
  for (const behavior of entity.behaviors)
  {
    if (hook === "enter" && behavior.OnCollisionEnter !== Behavior.prototype.OnCollisionEnter)
    {
      return true;
    }
    if (hook === "stay" && behavior.OnCollisionStay !== Behavior.prototype.OnCollisionStay)
    {
      return true;
    }
    if (hook === "exit" && behavior.OnCollisionExit !== Behavior.prototype.OnCollisionExit)
    {
      return true;
    }
  }
  return false;
}

/** Whether any behavior on the entity overrides a trigger lifecycle hook. */
export function EntityOverridesTriggerHook(
  entity: Entity,
  hook: "enter" | "exit"
): boolean
{
  for (const behavior of entity.behaviors)
  {
    if (hook === "enter" && behavior.OnTriggerEnter !== Behavior.prototype.OnTriggerEnter)
    {
      return true;
    }
    if (hook === "exit" && behavior.OnTriggerExit !== Behavior.prototype.OnTriggerExit)
    {
      return true;
    }
  }
  return false;
}

/** Enable Havok collision callbacks on bodies that need collision hooks or messages. */
export function RefreshCollisionCallbacks(
  level: Level,
  registrations: EventMessageRegistration[]
): void
{
  EnableCollisionCallbacks(level, BuildRegistrationIndex(registrations));
}

/** Enable Havok collision callbacks on bodies that need collision hooks or messages. */
export function EnableCollisionCallbacks(
  level: Level,
  registrationsByBody: Map<unknown, EventMessageRegistration>
): void
{
  for (const entity of level.entities.values())
  {
    const body = entity.body;
    if (body === undefined)
    {
      continue;
    }

    const registration = registrationsByBody.get(body);
    const hasCollisionMessages = registration !== undefined
      && [...COLLISION_PHASES].some((phase) =>
        (registration.messagesByPhase.get(phase)?.length ?? 0) > 0
      );

    const needsCollisionCallbacks =
      EntityOverridesCollisionHook(entity, "enter")
      || EntityOverridesCollisionHook(entity, "stay")
      || hasCollisionMessages;

    const needsEndedCallbacks =
      EntityOverridesCollisionHook(entity, "exit")
      || (registration?.messagesByPhase.get("COLLISION_EXIT")?.length ?? 0) > 0;

    if (needsCollisionCallbacks)
    {
      body.setCollisionCallbackEnabled(true);
    }
    if (needsEndedCallbacks)
    {
      body.setCollisionEndedCallbackEnabled(true);
    }
  }
}

/** Fan a collision hook to every behavior on one entity, error-isolated. */
export function DispatchCollisionHook(
  entity: Entity,
  hook: "enter" | "stay" | "exit",
  other: Entity,
  contact?: CollisionContact
): void
{
  if (!IsEntityActive(entity))
  {
    return;
  }

  for (const behavior of entity.behaviors)
  {
    try
    {
      if (hook === "enter" && behavior.OnCollisionEnter !== Behavior.prototype.OnCollisionEnter)
      {
        behavior.OnCollisionEnter(other, contact!);
      }
      else if (hook === "stay" && behavior.OnCollisionStay !== Behavior.prototype.OnCollisionStay)
      {
        behavior.OnCollisionStay(other, contact!);
      }
      else if (hook === "exit" && behavior.OnCollisionExit !== Behavior.prototype.OnCollisionExit)
      {
        behavior.OnCollisionExit(other);
      }
    }
    catch (error)
    {
      console.error(`[bjs] OnCollision${hook} "${entity.name}"`, error);
    }
  }
}

/** Fan a trigger hook to every behavior on one entity, error-isolated. */
export function DispatchTriggerHook(
  entity: Entity,
  hook: "enter" | "exit",
  other: Entity
): void
{
  if (!IsEntityActive(entity))
  {
    return;
  }

  for (const behavior of entity.behaviors)
  {
    try
    {
      if (hook === "enter" && behavior.OnTriggerEnter !== Behavior.prototype.OnTriggerEnter)
      {
        behavior.OnTriggerEnter(other);
      }
      else if (hook === "exit" && behavior.OnTriggerExit !== Behavior.prototype.OnTriggerExit)
      {
        behavior.OnTriggerExit(other);
      }
    }
    catch (error)
    {
      console.error(`[bjs] OnTrigger${hook} "${entity.name}"`, error);
    }
  }
}

/** Deliver authored Event Messages for one phase from a source body. */
export function DeliverEventMessages(
  level: Level,
  registration: EventMessageRegistration,
  phase: EventMessagePhase,
  otherEntity: Entity
): void
{
  const messages = registration.messagesByPhase.get(phase);
  if (messages === undefined)
  {
    return;
  }

  for (const eventMessage of messages)
  {
    if (eventMessage.filterTag.length > 0 && otherEntity.tag !== eventMessage.filterTag)
    {
      continue;
    }

    if (eventMessage.target === null)
    {
      continue;
    }

    const targetEntity = level.ById(eventMessage.target);
    if (targetEntity === undefined)
    {
      console.warn(`[bjs] Event Message target ${eventMessage.target} not found`);
      continue;
    }

    targetEntity.SendMessage(eventMessage.message, otherEntity);
  }
}

/** Dispatch collision hooks and messages for both bodies in a contact pair. */
export function HandleCollisionPair(
  level: Level,
  registrationsByBody: Map<unknown, EventMessageRegistration>,
  bodyA: PhysicsBody,
  bodyB: PhysicsBody,
  hook: "enter" | "stay" | "exit",
  contact?: CollisionContact
): void
{
  const entityA = EntityFromBody(bodyA);
  const entityB = EntityFromBody(bodyB);
  if (entityA === null || entityB === null)
  {
    return;
  }

  if (hook === "enter")
  {
    DispatchCollisionHook(entityA, "enter", entityB, contact);
    DispatchCollisionHook(entityB, "enter", entityA, contact);
  }
  else if (hook === "stay")
  {
    DispatchCollisionHook(entityA, "stay", entityB, contact);
    DispatchCollisionHook(entityB, "stay", entityA, contact);
  }
  else
  {
    DispatchCollisionHook(entityA, "exit", entityB);
    DispatchCollisionHook(entityB, "exit", entityA);
  }

  const registrationA = registrationsByBody.get(bodyA);
  if (registrationA !== undefined)
  {
    const phase: EventMessagePhase = hook === "enter"
      ? "COLLISION_ENTER"
      : "COLLISION_EXIT";
    if (hook !== "stay")
    {
      DeliverEventMessages(level, registrationA, phase, entityB);
    }
  }

  const registrationB = registrationsByBody.get(bodyB);
  if (registrationB !== undefined && hook !== "stay")
  {
    const phase: EventMessagePhase = hook === "enter"
      ? "COLLISION_ENTER"
      : "COLLISION_EXIT";
    DeliverEventMessages(level, registrationB, phase, entityA);
  }
}

/** Dispatch trigger hooks and messages for a trigger contact (both bodies). */
export function HandleTriggerPair(
  level: Level,
  registrationsByBody: Map<unknown, EventMessageRegistration>,
  bodyA: PhysicsBody,
  bodyB: PhysicsBody,
  hook: "enter" | "exit"
): void
{
  const entityA = EntityFromBody(bodyA);
  const entityB = EntityFromBody(bodyB);
  if (entityA === null || entityB === null)
  {
    return;
  }

  DispatchTriggerHook(entityA, hook, entityB);
  DispatchTriggerHook(entityB, hook, entityA);

  const phase: EventMessagePhase = hook === "enter" ? "TRIGGER_ENTER" : "TRIGGER_EXIT";

  const registrationA = registrationsByBody.get(bodyA);
  if (registrationA !== undefined)
  {
    DeliverEventMessages(level, registrationA, phase, entityB);
  }

  const registrationB = registrationsByBody.get(bodyB);
  if (registrationB !== undefined)
  {
    DeliverEventMessages(level, registrationB, phase, entityA);
  }
}

/** Build the body → registration index used at dispatch time. */
export function BuildRegistrationIndex(
  registrations: EventMessageRegistration[]
): Map<unknown, EventMessageRegistration>
{
  const registrationsByBody = new Map<unknown, EventMessageRegistration>();
  for (const registration of registrations)
  {
    if (registration.sourceEntity.body !== undefined)
    {
      registrationsByBody.set(registration.sourceEntity.body, registration);
    }
  }
  return registrationsByBody;
}

/** Group flat message rows by phase for O(1) lookup per Havok event. */
export function GroupEventMessagesByPhase(
  messages: EventMessageData[]
): Map<EventMessagePhase, EventMessageData[]>
{
  const messagesByPhase = new Map<EventMessagePhase, EventMessageData[]>();
  for (const message of messages)
  {
    const phaseRows = messagesByPhase.get(message.when);
    if (phaseRows === undefined)
    {
      messagesByPhase.set(message.when, [message]);
    }
    else
    {
      phaseRows.push(message);
    }
  }
  return messagesByPhase;
}
