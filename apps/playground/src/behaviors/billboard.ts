import { Behavior, exposed } from "@bjs/engine";
import type { Entity } from "@bjs/engine";

/**
 * This mesh always faces the specified camera (like a label or UI sprite).
 * `camera` is an entity reference — pick it in Blender with the entity picker.
 *
 * Unlike `Mesh.billboardMode` (which faces the active camera), this script
 * targets a specific camera you assign.
 */
export default class Billboard extends Behavior
{
  @exposed({ type: "entity", label: "Camera" })
  camera: Entity | null = null;

  /** Re-orient every frame so this node looks at the camera. */
  OnUpdate(): void
  {
    if (this.camera === null)
    {
      return;
    }

    this.node.lookAt(this.camera.node.getAbsolutePosition());
  }
}
