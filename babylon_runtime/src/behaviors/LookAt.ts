import { Behavior, exposed } from "../engine";
import type { Entity } from "../engine";

/**
 * Continuously orients this object to face the target object.
 * `target` is an object reference — pick it in Blender with the object picker.
 */
export default class LookAt extends Behavior {
  @exposed({ type: "entity", label: "Target" })
  target: Entity | null = null;

  onUpdate() {
    if (!this.target) return;
    this.node.lookAt(this.target.node.getAbsolutePosition());
  }
}
