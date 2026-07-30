import {
  HavokPlugin,
  type IBasePhysicsCollisionEvent,
  type IPhysicsCollisionEvent,
  type Observer,
  type Scene,
} from "@babylonjs/core";
import type { Level } from "../../core/Level";
import type { EventMessagePhase } from "../../core/types";
import {
  BuildRegistrationIndex,
  COLLISION_PHASES,
  ContactFromEvent,
  EnableCollisionCallbacks,
  EntityOverridesCollisionHook,
  EntityOverridesTriggerHook,
  HandleCollisionPair,
  HandleTriggerPair,
  TRIGGER_PHASES,
  type EventMessageRegistration,
} from "./dispatch";

/** Plugin observers wired during FinalizeLevel; removed on level dispose. */
export interface CollisionEventHandles {
  collisionObserver: Observer<IPhysicsCollisionEvent> | null;
  collisionEndedObserver: Observer<IBasePhysicsCollisionEvent> | null;
  triggerObserver: Observer<IBasePhysicsCollisionEvent> | null;
}

/**
 * Subscribe plugin-level observers that relay Havok collision/trigger events to
 * behavior hooks and authored Event Messages. Returns handles for dispose, or
 * null when physics isn't enabled and nothing needs wiring.
 */
export function WireCollisionEvents(
  scene: Scene,
  level: Level,
  registrations: EventMessageRegistration[]
): CollisionEventHandles | null
{
  const physicsEngine = scene.getPhysicsEngine();
  const plugin = physicsEngine?.getPhysicsPlugin();
  if (!plugin || !(plugin instanceof HavokPlugin))
  {
    const needsHooks = [...level.entities.values()].some((entity) =>
      EntityOverridesCollisionHook(entity, "enter")
      || EntityOverridesCollisionHook(entity, "stay")
      || EntityOverridesCollisionHook(entity, "exit")
      || EntityOverridesTriggerHook(entity, "enter")
      || EntityOverridesTriggerHook(entity, "exit")
    );

    if (needsHooks || registrations.length > 0)
    {
      console.warn("[bjs] collision/trigger events need Havok physics enabled");
    }
    return null;
  }

  const registrationsByBody = BuildRegistrationIndex(registrations);
  EnableCollisionCallbacks(level, registrationsByBody);

  const entities = [...level.entities.values()];
  const RegistrationsHavePhase = (phases: ReadonlySet<EventMessagePhase>): boolean =>
    registrations.some((registration) =>
      [...phases].some((phase) => (registration.messagesByPhase.get(phase)?.length ?? 0) > 0)
    );

  const hasCollisionInterest = entities.some((entity) =>
    EntityOverridesCollisionHook(entity, "enter")
    || EntityOverridesCollisionHook(entity, "stay")
    || EntityOverridesCollisionHook(entity, "exit")
  ) || RegistrationsHavePhase(COLLISION_PHASES);

  const hasTriggerInterest = entities.some((entity) =>
    EntityOverridesTriggerHook(entity, "enter")
    || EntityOverridesTriggerHook(entity, "exit")
  ) || RegistrationsHavePhase(TRIGGER_PHASES);

  // Note: the Havok plugin routes COLLISION_FINISHED exclusively to
  // onCollisionEndedObservable — the main observable only carries STARTED and
  // CONTINUED, so exit dispatch lives solely on the ended observer below.
  const collisionObserver = hasCollisionInterest
    ? plugin.onCollisionObservable.add((collisionEvent) =>
    {
      const bodyA = collisionEvent.collider;
      const bodyB = collisionEvent.collidedAgainst;

      if (collisionEvent.type === "COLLISION_STARTED")
      {
        HandleCollisionPair(
          level,
          registrationsByBody,
          bodyA,
          bodyB,
          "enter",
          ContactFromEvent(collisionEvent)
        );
      }
      else if (collisionEvent.type === "COLLISION_CONTINUED")
      {
        HandleCollisionPair(
          level,
          registrationsByBody,
          bodyA,
          bodyB,
          "stay",
          ContactFromEvent(collisionEvent)
        );
      }
    })
    : null;

  const collisionEndedObserver = hasCollisionInterest
    ? plugin.onCollisionEndedObservable.add((collisionEvent) =>
    {
      HandleCollisionPair(
        level,
        registrationsByBody,
        collisionEvent.collider,
        collisionEvent.collidedAgainst,
        "exit"
      );
    })
    : null;

  const triggerObserver = hasTriggerInterest
    ? plugin.onTriggerCollisionObservable.add((collisionEvent) =>
    {
      if (collisionEvent.type === "TRIGGER_ENTERED")
      {
        HandleTriggerPair(
          level,
          registrationsByBody,
          collisionEvent.collider,
          collisionEvent.collidedAgainst,
          "enter"
        );
      }
      else if (collisionEvent.type === "TRIGGER_EXITED")
      {
        HandleTriggerPair(
          level,
          registrationsByBody,
          collisionEvent.collider,
          collisionEvent.collidedAgainst,
          "exit"
        );
      }
    })
    : null;

  if (collisionObserver === null && collisionEndedObserver === null && triggerObserver === null)
  {
    return null;
  }

  return { collisionObserver, collisionEndedObserver, triggerObserver };
}

/** Remove all collision/trigger observers wired by WireCollisionEvents. */
export function DisposeCollisionEvents(handles: CollisionEventHandles | null): void
{
  if (handles === null)
  {
    return;
  }

  handles.collisionObserver?.remove();
  handles.collisionEndedObserver?.remove();
  handles.triggerObserver?.remove();
}
