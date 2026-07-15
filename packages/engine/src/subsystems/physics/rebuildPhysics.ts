import type { PhysicsShape, Scene } from "@babylonjs/core";
import type { Entity } from "../../core/Entity";
import {
  RegisterAttachment,
  RemoveAttachmentsOfType,
  type EntityAttachment,
} from "../../core/attachments";
import type { ColliderComponent, RigidBodyComponent } from "../../core/types";
import { BuildPhysics } from "./buildPhysics";

/**
 * Collect authored collider and rigidbody data from attachment rows (or pending
 * components not yet registered).
 */
export function CollectPhysicsComponentData(
  entity: Entity,
  pendingColliders: ColliderComponent[] = [],
  pendingRigidBody?: RigidBodyComponent
): { colliders: ColliderComponent[]; rigidBody: RigidBodyComponent | undefined }
{
  const colliders = entity.attachments
    .filter((row): row is Extract<EntityAttachment, { type: "COLLIDER" }> => row.type === "COLLIDER")
    .map((row) => row.data);

  const existingRigidBody = entity.attachments.find(
    (row): row is Extract<EntityAttachment, { type: "RIGIDBODY" }> => row.type === "RIGIDBODY"
  );

  return {
    colliders: [...colliders, ...pendingColliders],
    rigidBody: pendingRigidBody ?? existingRigidBody?.data,
  };
}

/**
 * Tear down the entity's Havok body and rebuild it from all COLLIDER / RIGIDBODY
 * attachment data plus any pending components being added in this pass.
 */
export function RebuildEntityPhysics(
  entity: Entity,
  scene: Scene,
  shapesRegistry: Map<string, PhysicsShape[]>,
  pendingColliders: ColliderComponent[] = [],
  pendingRigidBody?: RigidBodyComponent
): void
{
  const { colliders, rigidBody } = CollectPhysicsComponentData(
    entity,
    pendingColliders,
    pendingRigidBody
  );

  if (entity.body !== undefined)
  {
    entity.body.dispose();
  }

  RemoveAttachmentsOfType(entity, "COLLIDER");
  RemoveAttachmentsOfType(entity, "RIGIDBODY");

  if (colliders.length === 0 && rigidBody === undefined)
  {
    if (entity.id.length > 0)
    {
      shapesRegistry.delete(entity.id);
    }
    return;
  }

  const physicsBody = BuildPhysics(
    entity.node,
    colliders,
    rigidBody,
    scene,
    entity.id.length > 0 ? entity.id : undefined,
    shapesRegistry
  );

  if (physicsBody === undefined)
  {
    return;
  }

  for (const collider of colliders)
  {
    RegisterAttachment(entity, { type: "COLLIDER", data: collider, body: physicsBody });
  }

  if (rigidBody !== undefined)
  {
    RegisterAttachment(entity, { type: "RIGIDBODY", data: rigidBody, body: physicsBody });
  }
}
