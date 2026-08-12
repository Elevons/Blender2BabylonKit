import { Behavior, exposed } from "b2bkit";
import type { Entity } from "b2bkit";

/**
 * Continuously orients this object to face the target object.
 * `target` is an object reference — pick it in Blender with the object picker.
 */
export default class LookAt extends Behavior
{
  @exposed({ type: "entity", label: "Target" })
  target: Entity | null = null;

  /** Face the target each frame (no-op until a target is assigned). */
  OnUpdate(): void
  {
    if (this.target === null)
    {
      return;
    }

    this.node.lookAt(this.target.node.getAbsolutePosition());
  }
}
