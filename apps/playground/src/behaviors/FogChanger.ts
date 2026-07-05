import { Behavior, exposed } from "@bjs/engine";
import type { AttachmentOfType, Entity } from "@bjs/engine";
import { Color3, Scene } from "@babylonjs/core";

/**
 * Lives on a trigger volume. Swaps scene fog between two authored presets when a
 * referenced moving object enters or leaves this entity's collider.
 */
export default class FogChanger extends Behavior
{
  @exposed({ type: "entity", label: "Moving object" })
  movingObject: Entity | null = null;

  @exposed({ type: "color", label: "Fog A color" })
  fogAColor: [number, number, number] = [0.75, 0.8, 0.85];

  @exposed({ min: 0, label: "Fog A density" })
  fogADensity = 0.01;

  @exposed({ type: "color", label: "Fog B color" })
  fogBColor: [number, number, number] = [0.4, 0.45, 0.5];

  @exposed({ min: 0, label: "Fog B density" })
  fogBDensity = 0.025;

  private colliderAttachment: AttachmentOfType<"COLLIDER"> | undefined;

  /** Cache this zone's collider, validate the probe, and apply fog A. */
  OnStart(): void
  {
    this.colliderAttachment = this.entity.GetAttachment("COLLIDER");

    if (this.colliderAttachment === undefined)
    {
      console.warn(`[FogChanger:${this.entity.name}] No COLLIDER attachment on this entity`);
    }
    else if (!this.colliderAttachment.data.isTrigger)
    {
      console.warn(
        `[FogChanger:${this.entity.name}] Collider is not a trigger — OnTriggerEnter/Exit will not fire`
      );
    }

    if (this.movingObject === null)
    {
      console.warn(`[FogChanger:${this.entity.name}] No moving object assigned`);
    }
    else
    {
      const probeCollider = this.movingObject.GetAttachment("COLLIDER");
      if (probeCollider === undefined)
      {
        console.warn(
          `[FogChanger:${this.entity.name}] Moving object "${this.movingObject.name}" has no COLLIDER`
        );
      }
      else if (probeCollider.data.isTrigger)
      {
        console.warn(
          `[FogChanger:${this.entity.name}] Moving object "${this.movingObject.name}" collider is a trigger — use a solid collider on the probe so it can enter this volume`
        );
      }

      if (this.movingObject.body === undefined)
      {
        console.warn(
          `[FogChanger:${this.entity.name}] Moving object "${this.movingObject.name}" has no physics body — add RIGIDBODY (DYNAMIC or ANIMATED)`
        );
      }
    }

    this.ApplyFogSettings(this.fogAColor, this.fogADensity);
  }

  /** Switch to fog B when the moving object enters this trigger volume. */
  OnTriggerEnter(other: Entity): void
  {
    if (!this.IsMovingObject(other))
    {
      return;
    }

    this.ApplyFogSettings(this.fogBColor, this.fogBDensity);
  }

  /** Restore fog A when the moving object leaves this trigger volume. */
  OnTriggerExit(other: Entity): void
  {
    if (!this.IsMovingObject(other))
    {
      return;
    }

    this.ApplyFogSettings(this.fogAColor, this.fogADensity);
  }

  /** Whether the overlapping entity is the assigned moving object. */
  private IsMovingObject(other: Entity): boolean
  {
    return this.movingObject !== null && other === this.movingObject;
  }

  /** Write fog color and density onto the scene (enables EXP2 fog if needed). */
  private ApplyFogSettings(color: Color3 | [number, number, number], density: number): void
  {
    if (this.scene.fogMode === Scene.FOGMODE_NONE)
    {
      this.scene.fogMode = Scene.FOGMODE_EXP2;
    }

    this.scene.fogColor = this.ResolveColor(color);
    this.scene.fogDensity = density;
  }

  /** Coerce an @exposed color (RGB tuple) or Color3 into a Babylon Color3. */
  private ResolveColor(color: Color3 | [number, number, number]): Color3
  {
    if (color instanceof Color3)
    {
      return color.clone();
    }

    return Color3.FromArray(color);
  }
}
