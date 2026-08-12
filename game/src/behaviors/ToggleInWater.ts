import { Behavior, exposed, IsEntityInsideColliderVolume, SetEntityActive } from "b2bkit";
import type { AttachmentOfType, Entity } from "b2bkit";

/**
 * Lives on the moving probe host. Each frame, tests whether the assigned probe
 * is inside the water trigger volume and enables or disables the target objects.
 */
export default class ToggleInWater extends Behavior
{
  @exposed({ type: "entity", label: "Water collider" })
  waterCollider: Entity | null = null;

  @exposed({ type: "list", of: "entity", label: "Target Objects" })
  targetObjects: (Entity | null)[] = [];

  /** World position sample for the water test (e.g. CameraBlock synced by TrainCamera). */
  @exposed({ type: "entity", label: "Probe" })
  probe: Entity | null = null;

  /** When true, targets are enabled inside water; when false, enabled outside water. */
  @exposed({ label: "Enable targets in water" })
  enableInWater = true;

  @exposed({ label: "Debug logs" })
  debugLogs = true;

  private waterColliderAttachment: AttachmentOfType<"COLLIDER"> | undefined;

  /** Whether the probe is currently inside the water trigger volume. */
  private insideWater = false;

  /** Cache the water volume, validate references, and apply the initial target state. */
  OnStart(): void
  {
    if (this.waterCollider === null)
    {
      console.warn(`[ToggleInWater:${this.entity.name}] No water collider assigned`);
    }
    else
    {
      this.waterColliderAttachment = this.waterCollider.GetAttachment("COLLIDER");

      if (this.waterColliderAttachment === undefined)
      {
        console.warn(
          `[ToggleInWater:${this.entity.name}] Water collider "${this.waterCollider.name}" has no COLLIDER`
        );
      }
      else if (!this.waterColliderAttachment.data.isTrigger)
      {
        console.warn(
          `[ToggleInWater:${this.entity.name}] Water collider "${this.waterCollider.name}" is not a trigger`
        );
      }
    }

    if (this.targetObjects.length === 0)
    {
      console.warn(`[ToggleInWater:${this.entity.name}] No target objects assigned`);
    }

    if (this.probe === null)
    {
      console.warn(
        `${this.LogPrefix()} No probe assigned — using this entity's node position `
        + "(camera orbit pivots stay near the target, not the lens; assign CameraBlock as Probe)"
      );
    }

    // Outside-water resting state first (overrides Blender viewport visibility).
    this.ApplyTargetEnabled(this.GetTargetEnabled(false), true);

    this.insideWater = this.IsProbeInsideWater();
    this.ApplyTargetState();

    if (this.debugLogs)
    {
      const waterName = this.waterCollider !== null ? this.waterCollider.name : "none";
      const probeEntity = this.GetProbeEntity();
      const probeWorld = probeEntity.node.getAbsolutePosition();
      const probeName = this.probe !== null ? this.probe.name : this.entity.name;
      console.log(
        `${this.LogPrefix()} started — probe="${probeName}", `
        + `water="${waterName}", targets=${this.ResolvedTargetCount()}, insideWater=${this.insideWater}, `
        + `enableInWater=${this.enableInWater}, `
        + `probeWorld=(${probeWorld.x.toFixed(1)}, ${probeWorld.y.toFixed(1)}, ${probeWorld.z.toFixed(1)})`
      );
    }
  }

  /** Keep target visibility in sync with probe position each frame. */
  OnUpdate(_deltaSeconds: number): void
  {
    const inside = this.IsProbeInsideWater();
    if (inside === this.insideWater)
    {
      return;
    }

    this.insideWater = inside;

    if (this.debugLogs)
    {
      const probeWorld = this.GetProbeEntity().node.getAbsolutePosition();
      const transition = inside ? "enter" : "exit";
      console.log(
        `${this.LogPrefix()} ${transition} water `
        + `(probe=(${probeWorld.x.toFixed(1)}, ${probeWorld.y.toFixed(1)}, ${probeWorld.z.toFixed(1)}))`
      );
    }

    this.ApplyTargetState();
  }

  /** Apply enable/disable to targets from the current insideWater flag. */
  private ApplyTargetState(): void
  {
    this.ApplyTargetEnabled(this.GetTargetEnabled(this.insideWater), false);
  }

  /** Whether targets should be enabled for a given inside/outside water state. */
  private GetTargetEnabled(inside: boolean): boolean
  {
    return this.enableInWater ? inside : !inside;
  }

  /** Enable or disable every target in the list. */
  private ApplyTargetEnabled(enabled: boolean, silent: boolean): void
  {
    for (const targetEntity of this.targetObjects)
    {
      if (targetEntity === null)
      {
        continue;
      }

      SetEntityActive(targetEntity, enabled);

      if (this.debugLogs && !silent)
      {
        console.log(
          `${this.LogPrefix()} ${enabled ? "enable" : "disable"} target "${targetEntity.name}"`
        );
      }
    }
  }

  /** Whether the probe is inside the assigned water trigger volume. */
  private IsProbeInsideWater(): boolean
  {
    if (this.waterCollider === null)
    {
      return false;
    }

    return IsEntityInsideColliderVolume(
      this.GetProbeEntity(),
      this.waterCollider,
      this.waterColliderAttachment
    );
  }

  /** Assigned probe, or this entity when none is wired. */
  private GetProbeEntity(): Entity
  {
    if (this.probe !== null)
    {
      return this.probe;
    }

    return this.entity;
  }

  /** Console prefix for debug output. */
  private LogPrefix(): string
  {
    return `[ToggleInWater:${this.entity.name}]`;
  }

  /** Count non-null entries in the target object list. */
  private ResolvedTargetCount(): number
  {
    let count = 0;

    for (const targetEntity of this.targetObjects)
    {
      if (targetEntity !== null)
      {
        count++;
      }
    }

    return count;
  }
}
