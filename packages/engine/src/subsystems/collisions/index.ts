/**
 * Physics lifecycle hooks, authored Event Messages, and collision-layer masks
 * share the collisions subsystem. Behavior hooks fire on both bodies in a contact
 * (Unity semantics); Event Messages fire from the collider entity that owns the
 * authored rows.
 */
export * from "./layers";

export {
  BuildRegistrationIndex,
  COLLISION_PHASES,
  ContactFromEvent,
  DeliverEventMessages,
  DispatchCollisionHook,
  DispatchTriggerHook,
  EnableCollisionCallbacks,
  EntityFromBody,
  EntityOverridesCollisionHook,
  EntityOverridesTriggerHook,
  GroupEventMessagesByPhase,
  HandleCollisionPair,
  HandleTriggerPair,
  RefreshCollisionCallbacks,
  TRIGGER_PHASES,
  type EventMessageRegistration,
} from "./dispatch";

export {
  DisposeCollisionEvents,
  WireCollisionEvents,
  type CollisionEventHandles,
} from "./wiring";
