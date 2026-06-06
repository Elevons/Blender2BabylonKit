import { Behavior, exposed } from "../engine";
import type { Entity } from "../engine";

/**
 * TEST/demo for an entity LIST. Moves the node toward each target object in
 * turn, advancing when it arrives. In Blender: Script component -> Open Script
 * -> PatrolTargets.ts -> Sync. You get a "Targets" list where each row is an
 * object picker; add a few and point them at empties or meshes in your scene.
 */
export default class PatrolTargets extends Behavior {
  @exposed({ type: "list", of: "entity", label: "Targets" })
  targets: (Entity | null)[] = [];

  @exposed({ min: 0.1, label: "Speed (u/s)" })
  speed = 3;

  private i = 0;

  onUpdate(dt: number) {
    const live = this.targets.filter((t): t is Entity => !!t);
    if (live.length === 0) return;

    const target = live[this.i % live.length];
    const here = this.node.position;
    const toTarget = target.node.position.subtract(here);
    const dist = toTarget.length();

    if (dist < 0.05) {
      this.i = (this.i + 1) % live.length; // arrived: head to the next one
      return;
    }
    const stepFrac = Math.min(1, (this.speed * dt) / dist);
    this.node.position = here.add(toTarget.scale(stepFrac));
  }
}
