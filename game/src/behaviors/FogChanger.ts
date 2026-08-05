import { ApplyColorGradingLut, Behavior, exposed, IsEntityInsideColliderVolume } from "@bjs/engine";
import type { AttachmentOfType, Entity, Level } from "@bjs/engine";
import {
  Color3,
  ImageProcessingConfiguration,
  Scene,
} from "@babylonjs/core";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { InputBlock } from "@babylonjs/core/Materials/Node/Blocks/Input/inputBlock";
import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";

/** Manifest-aligned tone mapper ids (matches `postProcessing.toneMappingType`). */
type ToneMappingPreset = "STANDARD" | "ACES" | "KHR_PBR_NEUTRAL";

const TONE_MAPPING_TYPES = {
  STANDARD: ImageProcessingConfiguration.TONEMAPPING_STANDARD,
  ACES: ImageProcessingConfiguration.TONEMAPPING_ACES,
  KHR_PBR_NEUTRAL: ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL,
} as const;

/**
 * Lives on a trigger volume. Outside the collider: linear fog A + ACES tone mapping.
 * Inside: fog B + a manifest-relative color-grading LUT (tone mapping off).
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

  @exposed({
    type: "enum",
    options: ["STANDARD", "ACES", "KHR_PBR_NEUTRAL"],
    label: "Tone map (outside)",
  })
  outsideToneMap: ToneMappingPreset = "ACES";

  @exposed({
    type: "file",
    label: "LUT (inside)",
  })
  zoneLut = "";

  private colliderAttachment: AttachmentOfType<"COLLIDER"> | undefined;

  /** Whether the assigned moving object is currently inside this trigger volume. */
  private movingObjectInside = false;

  /** Runtime LUT loaded for the inside zone (disposed when leaving). */
  private activeGradingTexture: BaseTexture | null = null;

  /** Cache this zone's collider, validate the probe, and seed inside state. */
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
        `[FogChanger:${this.entity.name}] Collider is not a trigger — IsEntityInsideColliderVolume requires a trigger volume`
      );
    }

    if (this.movingObject === null)
    {
      console.warn(`[FogChanger:${this.entity.name}] No moving object assigned`);
    }

    this.movingObjectInside = this.IsProbeInsideVolume();
  }

  /** Apply the initial fog/LUT preset once post-processing is attached. */
  OnPostReady(): void
  {
    this.ApplyActiveFog();
  }

  /** Keep fog in sync with the probe position each frame. */
  OnUpdate(_deltaSeconds: number): void
  {
    const inside = this.IsProbeInsideVolume();
    if (inside === this.movingObjectInside)
    {
      return;
    }

    this.movingObjectInside = inside;
    this.ApplyActiveFog();
  }

  /** Apply fog A/B and outside tone map or inside LUT from probe position. */
  private ApplyActiveFog(): void
  {
    if (this.movingObjectInside)
    {
      this.ApplyLinearFog(this.fogBColor, this.fogBRange);
      this.ApplyZoneLut();
    }
    else
    {
      this.ApplyLinearFog(this.fogAColor, this.fogARange);
      this.ApplyOutsideToneMap();
    }
  }

  /** ACES (or another preset) with color grading off. */
  private ApplyOutsideToneMap(): void
  {
    const imageProcessing = this.TryGetImageProcessing();
    if (imageProcessing === undefined)
    {
      return;
    }

    this.ClearZoneLut(imageProcessing);
    imageProcessing.toneMappingEnabled = true;
    imageProcessing.toneMappingType = TONE_MAPPING_TYPES[this.outsideToneMap];
    imageProcessing._updateParameters();
  }

  /** LUT-only look for the inside zone (tone mapping off). */
  private ApplyZoneLut(): void
  {
    const imageProcessing = this.TryGetImageProcessing();
    if (imageProcessing === undefined)
    {
      return;
    }

    const trimmedPath = this.zoneLut.trim();
    if (trimmedPath.length === 0)
    {
      console.warn(`[FogChanger:${this.entity.name}] Zone LUT path is empty — keeping outside tone map`);
      this.ApplyOutsideToneMap();
      return;
    }

    imageProcessing.toneMappingEnabled = false;
    ApplyColorGradingLut(
      this.scene,
      this.level.componentHost.baseUrl,
      imageProcessing,
      { file: trimmedPath }
    );

    this.ReplaceActiveGradingTexture(imageProcessing.colorGradingTexture ?? null);
  }

  /** Turn off grading and dispose any LUT loaded for the inside zone. */
  private ClearZoneLut(
    imageProcessing: NonNullable<DefaultRenderingPipeline["imageProcessing"]>
  ): void
  {
    this.ReplaceActiveGradingTexture(null);
    imageProcessing.colorGradingEnabled = false;
    imageProcessing.colorGradingTexture = null;
    imageProcessing._updateParameters();
  }

  /** Dispose a previously swapped LUT and track the new runtime instance. */
  private ReplaceActiveGradingTexture(nextTexture: BaseTexture | null): void
  {
    if (this.activeGradingTexture !== null)
    {
      this.activeGradingTexture.dispose();
    }

    this.activeGradingTexture = nextTexture;
  }

  /** Default rendering pipeline image processing, when post was authored on the scene. */
  private TryGetImageProcessing(): DefaultRenderingPipeline["imageProcessing"] | undefined
  {
    return this.level.post?.pipeline?.imageProcessing;
  }

  /** Level container injected as `spawner` on every behavior instance. */
  private get level(): Level
  {
    return this.spawner as Level;
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
  private IsProbeInsideVolume(): boolean
  {
    if (this.movingObject === null)
    {
      return false;
    }

    return IsEntityInsideColliderVolume(
      this.movingObject,
      this.entity,
      this.colliderAttachment
    );
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
