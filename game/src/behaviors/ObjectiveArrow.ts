import { Behavior, exposed, type Entity } from "b2bkit";
import type { TransformNode } from "@babylonjs/core";
import { Space, Vector3 } from "@babylonjs/core";

/**
 * A 3D arrow pinned to the active camera, floating a fixed distance in front of
 * the view. The arrow mesh is authored in Blender and picked here, then reparented
 * to the camera so it inherits the camera's orientation every frame.
 *
 * Blender setup:
 * - Author an arrow mesh in Blender whose tip points along its local +Y axis
 *   (forward). `lookAt` aligns local +Y toward the target — see coordinate-axes
 *   in get_scripting_context.
 * - Pick it with the **Arrow Object** entity picker.
 * - **Distance** is how far in front of the camera the arrow sits (camera local
 *   -Z, i.e. the direction the camera looks).
 * - **Target** is the object the arrow should point toward. When set, the arrow
 *   rotates each frame so its tip faces the target.
 */
export default class ObjectiveArrow extends Behavior
{
  @exposed({ type: "entity", label: "Arrow Object" })
  arrowObject: Entity | null = null;

  @exposed({ min: 0.1, max: 100, label: "Distance" })
  distance = 2;

  @exposed({ label: "Offset" })
  offset: [number, number, number] = [0, 0, 0];

  @exposed({ type: "entity", label: "Target" })
  target: Entity | null = null;

  private arrow: TransformNode | null = null;

  /** Place the picked arrow ahead of the camera and parent it to the camera. */
  OnStart(): void
  {
    const camera = this.scene.activeCamera;
    if (!camera || this.arrowObject === null)
    {
      return;
    }

    const arrow = this.arrowObject.node;
    arrow.position = new Vector3(
      this.offset[0],
      this.offset[1],
      -this.distance + this.offset[2]
    );
    arrow.parent = camera;

    this.arrow = arrow;
  }

  /** Point the arrow's tip at the target each frame. */
  OnUpdate(): void
  {
    if (this.target === null || this.arrow === null)
    {
      return;
    }

    // Space.WORLD is required: the arrow is parented to the camera, and the
    // default LOCAL space would interpret the target in the camera's local frame,
    // so the arrow would not visibly turn. WORLD corrects for the parent rotation.
    this.arrow.lookAt(this.target.node.getAbsolutePosition(), 0, 0, 0, Space.WORLD);
  }
}
