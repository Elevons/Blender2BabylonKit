import { Behavior, exposed } from "@bjs/engine";
import type { CollisionContact, Entity } from "@bjs/engine";

/**
 * Demo for Unity-style collision/trigger lifecycle hooks. Attach to any entity
 * with a physics body; logs Enter/Stay/Exit for solid and trigger contacts.
 */
export default class CollisionProbe extends Behavior
{
  @exposed({ label: "Only tag (empty = all)" })
  onlyTag = "";

  private ShouldLog(other: Entity): boolean
  {
    return this.onlyTag.length === 0 || other.tag === this.onlyTag;
  }

  /** Log the first solid contact with another entity. */
  OnCollisionEnter(other: Entity, contact: CollisionContact): void
  {
    if (!this.ShouldLog(other))
    {
      return;
    }

    console.log(
      `[CollisionProbe:${this.entity.name}] OnCollisionEnter "${other.name}"`,
      contact
    );
  }

  /** Log sustained solid contact (Havok COLLISION_CONTINUED; stops when bodies sleep). */
  OnCollisionStay(other: Entity, contact: CollisionContact): void
  {
    if (!this.ShouldLog(other))
    {
      return;
    }

    console.log(
      `[CollisionProbe:${this.entity.name}] OnCollisionStay "${other.name}"`,
      contact.distance
    );
  }

  /** Log when solid contact ends. */
  OnCollisionExit(other: Entity): void
  {
    if (!this.ShouldLog(other))
    {
      return;
    }

    console.log(`[CollisionProbe:${this.entity.name}] OnCollisionExit "${other.name}"`);
  }

  /** Log the first trigger overlap with another entity. */
  OnTriggerEnter(other: Entity): void
  {
    if (!this.ShouldLog(other))
    {
      return;
    }

    console.log(`[CollisionProbe:${this.entity.name}] OnTriggerEnter "${other.name}"`);
  }

  /** Log when a trigger overlap ends. */
  OnTriggerExit(other: Entity): void
  {
    if (!this.ShouldLog(other))
    {
      return;
    }

    console.log(`[CollisionProbe:${this.entity.name}] OnTriggerExit "${other.name}"`);
  }
}
