import { Behavior, exposed } from "b2bkit";
import type { Entity } from "b2bkit";

/**
 * TEST/demo for an entity LIST. Moves the node toward each target object in
 * turn, advancing when it arrives. In Blender: Script component -> Open Script
 * -> PatrolTargets.ts -> Sync. You get a "Targets" list where each row is an
 * object picker; add a few and point them at empties or meshes in your scene.
 */
export default class PatrolTargets extends Behavior
{
  @exposed({ type: "list", of: "entity", label: "Targets" })
  targets: (Entity | null)[] = [];

  @exposed({ min: 0.1, label: "Speed (u/s)" })
  speed = 3;

  private currentIndex = 0;

  /** Step toward the current target, advancing to the next on arrival. */
  OnUpdate(deltaSeconds: number): void
  {
    const liveTargets = this.targets.filter((target): target is Entity => target !== null);
    if (liveTargets.length === 0)
    {
      return;
    }

    const target = liveTargets[this.currentIndex % liveTargets.length];
    const currentPosition = this.node.position;
    const toTarget = target.node.position.subtract(currentPosition);
    const distance = toTarget.length();

    if (distance < 0.05)
    {
      this.currentIndex = (this.currentIndex + 1) % liveTargets.length; // arrived
      return;
    }

    const stepFraction = Math.min(1, (this.speed * deltaSeconds) / distance);
    this.node.position = currentPosition.add(toTarget.scale(stepFraction));
  }
}
