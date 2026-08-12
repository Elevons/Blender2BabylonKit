import { Behavior, exposed } from "b2bkit";
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
export default class ScaleSequencer extends Behavior
{
  @exposed({ type: "enum", options: ["loop", "pingPong", "hold"] })
  loopMode = "loop";

  @exposed({ type: "list", of: "float", label: "Scales" })
  scales: number[] = [1, 1.5, 0.5, 2];

  @exposed({ min: 0.05, label: "Seconds Per Step" })
  interval = 0.6;

  private elapsedSeconds = 0;

  /** Pick the active scale keyframe for this time and apply it uniformly. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.scales.length === 0)
    {
      return;
    }

    this.elapsedSeconds += deltaSeconds;
    const stepIndex = Math.floor(this.elapsedSeconds / this.interval);
    const count = this.scales.length;

    let scaleIndex: number;
    if (this.loopMode === "hold")
    {
      scaleIndex = Math.min(stepIndex, count - 1);
    }
    else if (this.loopMode === "pingPong")
    {
      const period = 2 * (count - 1) || 1;
      const phasePosition = stepIndex % period;
      scaleIndex = phasePosition < count ? phasePosition : period - phasePosition;
    }
    else
    {
      scaleIndex = stepIndex % count; // loop
    }

    const scaleValue = this.scales[scaleIndex];
    this.node.scaling = new Vector3(scaleValue, scaleValue, scaleValue);
  }
}
