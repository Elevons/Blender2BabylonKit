import { Behavior, exposed } from "@bjs/engine";
import type { AttachmentOfType, Entity } from "@bjs/engine";
import { Color3, Scene } from "@babylonjs/core";

/**
 * Lives on a trigger volume. Swaps scene linear fog between two authored presets
 * when a referenced moving object enters or leaves this entity's collider.
 */
export default class FogChanger extends Behavior
{
  @exposed({ type: "entity", label: "Moving object" })
  movingObject: Entity | null = null;

  @exposed({ type: "color", label: "Fog A color" })
  fogAColor: [number, number, number] = [0.75, 0.8, 0.85];

  @exposed({ type: "vector2", label: "Fog A start / end" })
  fogARange: [number, number] = [10, 100];

  @exposed({ type: "color", label: "Fog B color" })
  fogBColor: [number, number, number] = [0.4, 0.45, 0.5];

  @exposed({ type: "vector2", label: "Fog B start / end" })
  fogBRange: [number, number] = [5, 50];

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

    this.ApplyFogA();
  }

  /** Switch to fog B when the moving object enters this trigger volume. */
  OnTriggerEnter(other: Entity): void
  {
    if (!this.IsMovingObject(other))
    {
      return;
    }

    this.ApplyFogB();
  }

  /** Restore fog A when the moving object leaves this trigger volume. */
  OnTriggerExit(other: Entity): void
  {
    if (!this.IsMovingObject(other))
    {
      return;
    }

    this.ApplyFogA();
  }

  /** Whether the overlapping entity is the assigned moving object. */
  private IsMovingObject(other: Entity): boolean
  {
    return this.movingObject !== null && other === this.movingObject;
  }

  /** Apply the authored fog A preset. */
  private ApplyFogA(): void
  {
    this.ApplyLinearFog(this.fogAColor, this.fogARange);
  }

  /** Apply the authored fog B preset. */
  private ApplyFogB(): void
  {
    this.ApplyLinearFog(this.fogBColor, this.fogBRange);
  }

  /** Write linear fog color and start/end onto the scene. */
  private ApplyLinearFog(
    color: Color3 | [number, number, number],
    range: [number, number]
  ): void
  {
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogColor = this.ResolveColor(color);
    this.scene.fogStart = range[0];
    this.scene.fogEnd = range[1];
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
