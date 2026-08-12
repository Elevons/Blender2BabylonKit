import { Behavior, exposed, FindLightForNode } from "b2bkit";
import type { Entity } from "b2bkit";
import type { Light } from "@babylonjs/core";

/** A Babylon light resolved from an authored entity, with its load-time intensity. */
interface ResolvedLight
{
  light: Light;
  authoredIntensity: number;
}

/**
 * Compensates punctual lighting as scene IBL changes. Reads
 * scene.environmentTexture.level and maps it from A→B onto light brightness X→Y.
 */
export default class increaselights extends Behavior
{
  @exposed({ type: "list", of: "entity", label: "Lights" })
  lights: (Entity | null)[] = [];

  @exposed({ min: 0, max: 10, label: "Scene intensity A" })
  sceneIntensityA = 1;

  @exposed({ min: 0, max: 10, label: "Scene intensity B" })
  sceneIntensityB = 0.1;

  @exposed({ min: 0, max: 100, label: "Brightness X (at A)" })
  brightnessX = 0.5;

  @exposed({ min: 0, max: 100, label: "Brightness Y (at B)" })
  brightnessY = 3;

  private resolvedLights: ResolvedLight[] = [];

  /** Resolve light entities and cache their authored intensities. */
  OnStart(): void
  {
    this.ResolveLights();
  }

  /** Drive light brightness from the current scene environment intensity. */
  OnUpdate(): void
  {
    if (this.resolvedLights.length === 0 || this.scene.environmentTexture === null)
    {
      return;
    }

    const sceneIntensity = this.scene.environmentTexture.level;
    const blend = this.ComputeBlend(sceneIntensity);
    const brightness = this.Lerp(this.brightnessX, this.brightnessY, blend);

    for (const resolvedLight of this.resolvedLights)
    {
      resolvedLight.light.intensity = brightness;
    }
  }

  /** Restore each light's authored intensity when this behavior is removed. */
  OnDestroy(): void
  {
    for (const resolvedLight of this.resolvedLights)
    {
      resolvedLight.light.intensity = resolvedLight.authoredIntensity;
    }
  }

  /** Bind each listed entity to its Babylon light. */
  private ResolveLights(): void
  {
    this.resolvedLights.length = 0;

    for (const lightEntity of this.lights)
    {
      if (lightEntity === null)
      {
        continue;
      }

      const light = FindLightForNode(this.scene, lightEntity.node);
      if (light === null)
      {
        console.warn(
          `[increaselights:${this.entity.name}] No Babylon light for "${lightEntity.name}"`
        );
        continue;
      }

      this.resolvedLights.push({
        light,
        authoredIntensity: light.intensity,
      });
    }

    if (this.resolvedLights.length === 0)
    {
      console.warn(`[increaselights:${this.entity.name}] No lights resolved from the list`);
    }
  }

  /** Map scene intensity from the A→B range to a 0–1 blend. */
  private ComputeBlend(sceneIntensity: number): number
  {
    if (this.sceneIntensityB === this.sceneIntensityA)
    {
      return sceneIntensity <= this.sceneIntensityA ? 0 : 1;
    }

    const normalized =
      (sceneIntensity - this.sceneIntensityA) / (this.sceneIntensityB - this.sceneIntensityA);
    return Math.min(1, Math.max(0, normalized));
  }

  /** Linear interpolation between two scalar values. */
  private Lerp(startValue: number, endValue: number, blend: number): number
  {
    return startValue + (endValue - startValue) * blend;
  }
}
