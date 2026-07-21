import { Behavior, exposed } from "@bjs/engine";
import type { AttachmentOfType, ColliderComponent, Entity } from "@bjs/engine";
import { Color3, Matrix, Quaternion, Scene, Vector3 } from "@babylonjs/core";
import { InputBlock } from "@babylonjs/core/Materials/Node/Blocks/Input/inputBlock";
import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";

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

  /** Whether the assigned moving object is currently inside this trigger volume. */
  private movingObjectInside = false;

  /** Cache this zone's collider, validate the probe, and apply the active fog preset. */
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

    this.movingObjectInside = this.IsMovingObjectInsideTrigger();
    this.ApplyActiveFog();
  }

  /**
   * Keep fog in sync with probe position. Trigger enter/exit can be missed when
   * the probe collider is also a trigger, or when the probe starts overlapped.
   */
  OnUpdate(_deltaSeconds: number): void
  {
    const inside = this.IsMovingObjectInsideTrigger();
    if (inside === this.movingObjectInside)
    {
      return;
    }

    this.movingObjectInside = inside;
    this.ApplyActiveFog();
  }

  /** Switch to fog B when the moving object enters this trigger volume. */
  OnTriggerEnter(other: Entity): void
  {
    if (!this.IsMovingObject(other))
    {
      return;
    }

    if (this.movingObjectInside)
    {
      return;
    }

    this.movingObjectInside = true;
    this.ApplyActiveFog();
  }

  /** Restore fog A when the moving object leaves this trigger volume. */
  OnTriggerExit(other: Entity): void
  {
    if (!this.IsMovingObject(other))
    {
      return;
    }

    if (!this.movingObjectInside)
    {
      return;
    }

    this.movingObjectInside = false;
    this.ApplyActiveFog();
  }

  /** Whether the overlapping entity is the assigned moving object. */
  private IsMovingObject(other: Entity): boolean
  {
    return this.movingObject !== null && other === this.movingObject;
  }

  /** Apply fog A or B based on whether the probe is inside this trigger volume. */
  private ApplyActiveFog(): void
  {
    if (this.movingObjectInside)
    {
      this.ApplyLinearFog(this.fogBColor, this.fogBRange);
    }
    else
    {
      this.ApplyLinearFog(this.fogAColor, this.fogARange);
    }
  }

  /** Write linear fog color and start/end onto the scene. */
  private ApplyLinearFog(
    color: Color3 | [number, number, number],
    range: [number, number]
  ): void
  {
    const sanitizedRange = this.SanitizeFogRange(range);

    this.scene.fogEnabled = true;
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogColor = this.ResolveColor(color);
    this.scene.fogStart = sanitizedRange[0];
    this.scene.fogEnd = sanitizedRange[1];
    this.SyncWaterFogOpacityRange(sanitizedRange);
  }

  /**
   * Linear fog and the water NME divide by (end - start). Equal or inverted
   * authored ranges are treated as "no visible fog" with a valid far span.
   */
  private SanitizeFogRange(range: [number, number]): [number, number]
  {
    const start = range[0];
    const end = range[1];
    if (end > start)
    {
      return [start, end];
    }

    return [0, 1_000_000_000];
  }

  /** Whether the assigned moving object is inside this entity's trigger collider. */
  private IsMovingObjectInsideTrigger(): boolean
  {
    if (this.movingObject === null || this.colliderAttachment === undefined)
    {
      return false;
    }

    const collider = this.colliderAttachment.data;
    if (collider.shape !== "BOX")
    {
      return false;
    }

    const scaledCollider = this.ScaleColliderForObjectScale(collider);
    const probeWorld = this.movingObject.node.getAbsolutePosition();
    const inverseWorldMatrix = Matrix.Invert(this.entity.node.getWorldMatrix());
    const localProbe = Vector3.TransformCoordinates(probeWorld, inverseWorldMatrix);
    const offset = localProbe.subtract(Vector3.FromArray(scaledCollider.center));

    if (collider.rotation !== undefined)
    {
      const inverseRotation = Quaternion.FromArray(collider.rotation).conjugate();
      offset.applyRotationQuaternionInPlace(inverseRotation);
    }

    const halfExtents = Vector3.FromArray(scaledCollider.size).scaleInPlace(0.5);

    return Math.abs(offset.x) <= halfExtents.x
      && Math.abs(offset.y) <= halfExtents.y
      && Math.abs(offset.z) <= halfExtents.z;
  }

  /** Match physics collider scaling when applyObjectScale is enabled on this volume. */
  private ScaleColliderForObjectScale(collider: ColliderComponent): ColliderComponent
  {
    if (collider.applyObjectScale === false)
    {
      return collider;
    }

    const scaling = this.entity.node.scaling;

    return {
      ...collider,
      size: [
        collider.size[0] * scaling.x,
        collider.size[1] * scaling.y,
        collider.size[2] * scaling.z,
      ],
      center: [
        collider.center[0] * scaling.x,
        collider.center[1] * scaling.y,
        collider.center[2] * scaling.z,
      ],
    };
  }

  /** Keep water NME fog-alpha inputs aligned with the active scene fog range. */
  private SyncWaterFogOpacityRange(range: [number, number]): void
  {
    for (const material of this.scene.materials)
    {
      if (!(material instanceof NodeMaterial))
      {
        continue;
      }

      const fogStartBlock = material.getBlockByName("Fog Start");
      const fogEndBlock = material.getBlockByName("Fog End");

      if (!(fogStartBlock instanceof InputBlock) || !(fogEndBlock instanceof InputBlock))
      {
        continue;
      }

      fogStartBlock.value = range[0];
      fogEndBlock.value = range[1];
    }
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
