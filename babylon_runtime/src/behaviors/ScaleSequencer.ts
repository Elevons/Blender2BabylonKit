import { Behavior, exposed } from "../engine";
import { Vector3 } from "@babylonjs/core";

/**
 * TEST behavior for the enum + list<float> exposed types.
 * Steps the node's uniform scale through `scales`, one keyframe per `interval`
 * seconds. `loopMode` (an enum dropdown in Blender) controls what happens at the
 * end of the sequence.
 *
 * In Blender: add a Script component, Open Script -> ScaleSequencer.ts, Sync.
 * You should see a "Loop Mode" dropdown, a "Scales" add/remove list, and a
 * "Seconds Per Step" float.
 */
export default class ScaleSequencer extends Behavior {
  @exposed({ type: "enum", options: ["loop", "pingPong", "hold"] })
  loopMode = "loop";

  @exposed({ type: "list", of: "float", label: "Scales" })
  scales: number[] = [1, 1.5, 0.5, 2];

  @exposed({ min: 0.05, label: "Seconds Per Step" })
  interval = 0.6;

  private t = 0;

  onUpdate(dt: number) {
    if (this.scales.length === 0) return;
    this.t += dt;
    const step = Math.floor(this.t / this.interval);
    const n = this.scales.length;

    let idx: number;
    if (this.loopMode === "hold") {
      idx = Math.min(step, n - 1);
    } else if (this.loopMode === "pingPong") {
      const period = 2 * (n - 1) || 1;
      const p = step % period;
      idx = p < n ? p : period - p;
    } else {
      idx = step % n; // loop
    }

    const s = this.scales[idx];
    this.node.scaling = new Vector3(s, s, s);
  }
}
