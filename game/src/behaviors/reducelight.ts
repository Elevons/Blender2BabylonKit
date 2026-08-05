import { Behavior, exposed } from "@bjs/engine";
import type { Entity } from "@bjs/engine";

/**
 * Dims scene IBL as a source object moves farther above a target's transform.
 * Vertical world-space distance between the two entities drives intensity from X to Y.
 */
export default class reducelight extends Behavior
{
  @exposed({ type: "entity", label: "Source (camera)" })
  source: Entity | null = null;

  @exposed({ type: "entity", label: "Surface target" })
  surfaceTarget: Entity | null = null;

  @exposed({ min: 0, label: "Near distance (full intensity)" })
  nearDistance = 0;

  @exposed({ min: 0.1, label: "Far distance (min intensity)" })
  farDistance = 50;

  @exposed({ min: 0, max: 10, label: "Intensity near (X)" })
  intensityNear = 1;

  @exposed({ min: 0, max: 10, label: "Intensity far (Y)" })
  intensityFar = 0.1;

  private authoredEnvironmentLevel: number | null = null;

  /** Cache the authored environment level. */
  OnStart(): void
  {
    if (this.surfaceTarget === null)
    {
      console.warn(`[reducelight:${this.entity.name}] No surface target assigned`);
    }

    if (this.scene.environmentTexture !== null)
    {
      this.authoredEnvironmentLevel = this.scene.environmentTexture.level;
    }
  }

  /** Map vertical distance to environment intensity. */
  OnUpdate(): void
  {
    if (this.surfaceTarget === null || this.scene.environmentTexture === null)
    {
      return;
    }

    const sourceY = this.ResolveSourceY();
    if (sourceY === null)
    {
      return;
    }

    const targetY = this.surfaceTarget.node.getAbsolutePosition().y;
    const verticalDistance = Math.abs(sourceY - targetY);
    const blend = this.ComputeBlend(verticalDistance);
    const intensity = this.Lerp(this.intensityNear, this.intensityFar, blend);
    this.scene.environmentTexture.level = intensity;
  }

  /** Restore the authored environment level when this behavior is removed. */
  OnDestroy(): void
  {
    if (this.scene.environmentTexture !== null && this.authoredEnvironmentLevel !== null)
    {
      this.scene.environmentTexture.level = this.authoredEnvironmentLevel;
    }
  }

  /** Map vertical distance to a 0–1 blend between near and far intensity. */
  private ComputeBlend(verticalDistance: number): number
  {
    if (this.farDistance <= this.nearDistance)
    {
      return verticalDistance <= this.nearDistance ? 0 : 1;
    }

    const normalized = (verticalDistance - this.nearDistance) / (this.farDistance - this.nearDistance);
    return Math.min(1, Math.max(0, normalized));
  }

  /** Linear interpolation between two scalar values. */
  private Lerp(startValue: number, endValue: number, blend: number): number
  {
    return startValue + (endValue - startValue) * blend;
  }

  /** World Y of the configured source, or the active camera when unset. */
  private ResolveSourceY(): number | null
  {
    if (this.source !== null)
    {
      return this.source.node.getAbsolutePosition().y;
    }

    // activeCamera is Nullable but can be undefined at runtime.
    if (!this.scene.activeCamera)
    {
      return null;
    }

    return this.scene.activeCamera.globalPosition.y;
  }
}
