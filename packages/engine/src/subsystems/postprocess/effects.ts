import {
  Scene,
  ColorCurves,
  ColorGradingTexture,
  DefaultRenderingPipeline,
  DepthOfFieldEffectBlurLevel,
  ImageProcessingConfiguration,
  Texture,
} from "@babylonjs/core";
import { CubeColorGradingTexture } from "./cubeLutTexture";
import type {
  ChromaticAberrationInfo,
  ColorCurvesInfo,
  ColorGradingInfo,
  DepthOfFieldInfo,
  GlowInfo,
  GrainInfo,
  PostProcessingInfo,
  SharpenInfo,
  VignetteInfo,
} from "../../core/types";
import { ResolveManifestAssetUrl } from "../../core/loader/manifest";

export const TONE_MAPPING_TYPES = {
  STANDARD: ImageProcessingConfiguration.TONEMAPPING_STANDARD,
  ACES: ImageProcessingConfiguration.TONEMAPPING_ACES,
  KHR_PBR_NEUTRAL: ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL,
} as const;

const DOF_BLUR_LEVELS = {
  LOW: DepthOfFieldEffectBlurLevel.Low,
  MEDIUM: DepthOfFieldEffectBlurLevel.Medium,
  HIGH: DepthOfFieldEffectBlurLevel.High,
} as const;

/** True when image processing must run for tone mapping, exposure, or color effects. */
export function NeedsImageProcessing(info: PostProcessingInfo): boolean
{
  return info.toneMapping === true ||
    (info.exposure !== undefined && info.exposure !== 1) ||
    (info.contrast !== undefined && info.contrast !== 1) ||
    info.vignette?.enabled === true ||
    info.colorGrading?.enabled === true ||
    info.colorCurves?.enabled === true;
}

/** Copy manifest color-curve settings onto a Babylon ColorCurves instance. */
export function ApplyColorCurves(curves: ColorCurves, settings: ColorCurvesInfo): void
{
  if (settings.globalHue !== undefined)
  {
    curves.globalHue = settings.globalHue;
  }
  if (settings.globalDensity !== undefined)
  {
    curves.globalDensity = settings.globalDensity;
  }
  if (settings.globalSaturation !== undefined)
  {
    curves.globalSaturation = settings.globalSaturation;
  }
  if (settings.globalExposure !== undefined)
  {
    curves.globalExposure = settings.globalExposure;
  }
  if (settings.highlightsHue !== undefined)
  {
    curves.highlightsHue = settings.highlightsHue;
  }
  if (settings.highlightsDensity !== undefined)
  {
    curves.highlightsDensity = settings.highlightsDensity;
  }
  if (settings.highlightsSaturation !== undefined)
  {
    curves.highlightsSaturation = settings.highlightsSaturation;
  }
  if (settings.highlightsExposure !== undefined)
  {
    curves.highlightsExposure = settings.highlightsExposure;
  }
  if (settings.midtonesHue !== undefined)
  {
    curves.midtonesHue = settings.midtonesHue;
  }
  if (settings.midtonesDensity !== undefined)
  {
    curves.midtonesDensity = settings.midtonesDensity;
  }
  if (settings.midtonesSaturation !== undefined)
  {
    curves.midtonesSaturation = settings.midtonesSaturation;
  }
  if (settings.midtonesExposure !== undefined)
  {
    curves.midtonesExposure = settings.midtonesExposure;
  }
  if (settings.shadowsHue !== undefined)
  {
    curves.shadowsHue = settings.shadowsHue;
  }
  if (settings.shadowsDensity !== undefined)
  {
    curves.shadowsDensity = settings.shadowsDensity;
  }
  if (settings.shadowsSaturation !== undefined)
  {
    curves.shadowsSaturation = settings.shadowsSaturation;
  }
  if (settings.shadowsExposure !== undefined)
  {
    curves.shadowsExposure = settings.shadowsExposure;
  }
}

/**
 * Load a LUT or color-grading texture from the manifest and enable grading.
 * Babylon's ColorGradingTexture only parses .3dl; .png strip LUTs load as 2D textures.
 * Adobe .cube LUTs use CubeColorGradingTexture (see postprocess/cubeLutTexture.ts).
 */
export function ApplyColorGradingLut(
  scene: Scene,
  baseUrl: string,
  imageProcessing: NonNullable<DefaultRenderingPipeline["imageProcessing"]>,
  settings: Pick<ColorGradingInfo, "file">
): void
{
  if (!settings.file)
  {
    console.warn("[bjs] post-processing: color grading enabled but no LUT file");
    return;
  }

  const textureUrl = ResolveManifestAssetUrl(baseUrl, settings.file);
  const lowerCaseFile = settings.file.toLowerCase();

  if (lowerCaseFile.endsWith(".3dl"))
  {
    imageProcessing.colorGradingTexture = new ColorGradingTexture(textureUrl, scene);
  }
  else if (lowerCaseFile.endsWith(".cube"))
  {
    // .cube is standard RGB — .3dl LUTs expect colorGradingBGR on the shared configuration.
    imageProcessing.imageProcessingConfiguration.colorGradingBGR = false;
    imageProcessing.colorGradingEnabled = false;
    imageProcessing.colorGradingTexture = new CubeColorGradingTexture(
      textureUrl,
      scene,
      () =>
      {
        imageProcessing.colorGradingEnabled = true;
        imageProcessing._updateParameters();
      }
    );
    return;
  }
  else
  {
    const texture = new Texture(textureUrl, scene, true, false);
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    imageProcessing.colorGradingTexture = texture;
  }
  imageProcessing.colorGradingEnabled = true;
}

/** Enable sharpen and copy edge/color amounts from the manifest. */
export function ApplySharpen(pipeline: DefaultRenderingPipeline, settings: SharpenInfo): void
{
  pipeline.sharpenEnabled = true;
  if (settings.edgeAmount !== undefined)
  {
    pipeline.sharpen.edgeAmount = settings.edgeAmount;
  }
  if (settings.colorAmount !== undefined)
  {
    pipeline.sharpen.colorAmount = settings.colorAmount;
  }
}

/** Enable depth of field when supported and apply focus/blur settings. */
export function ApplyDepthOfField(pipeline: DefaultRenderingPipeline, settings: DepthOfFieldInfo): void
{
  if (!pipeline.depthOfField.isSupported)
  {
    console.warn("[bjs] post-processing: depth of field is not supported on this device");
    return;
  }

  pipeline.depthOfFieldEnabled = true;
  pipeline.depthOfFieldBlurLevel = DOF_BLUR_LEVELS[settings.blurLevel ?? "LOW"];
  if (settings.focusDistance !== undefined)
  {
    pipeline.depthOfField.focusDistance = settings.focusDistance;
  }
  if (settings.focalLength !== undefined)
  {
    pipeline.depthOfField.focalLength = settings.focalLength;
  }
  if (settings.fStop !== undefined)
  {
    pipeline.depthOfField.fStop = settings.fStop;
  }
}

/** Enable chromatic aberration and copy lens-distortion parameters. */
export function ApplyChromaticAberration(
  pipeline: DefaultRenderingPipeline,
  settings: ChromaticAberrationInfo
): void
{
  pipeline.chromaticAberrationEnabled = true;
  if (settings.aberrationAmount !== undefined)
  {
    pipeline.chromaticAberration.aberrationAmount = settings.aberrationAmount;
  }
  if (settings.radialIntensity !== undefined)
  {
    pipeline.chromaticAberration.radialIntensity = settings.radialIntensity;
  }
  if (settings.directionX !== undefined || settings.directionY !== undefined)
  {
    pipeline.chromaticAberration.direction.x = settings.directionX ?? 0;
    pipeline.chromaticAberration.direction.y = settings.directionY ?? 0;
  }
}

/** Enable film grain and copy intensity/animation from the manifest. */
export function ApplyGrain(pipeline: DefaultRenderingPipeline, settings: GrainInfo): void
{
  pipeline.grainEnabled = true;
  if (settings.intensity !== undefined)
  {
    pipeline.grain.intensity = settings.intensity;
  }
  if (settings.animated !== undefined)
  {
    pipeline.grain.animated = settings.animated;
  }
}

/** Enable the glow layer and copy blur/intensity from the manifest. */
export function ApplyGlow(pipeline: DefaultRenderingPipeline, settings: GlowInfo): void
{
  pipeline.glowLayerEnabled = true;
  const glowLayer = pipeline.glowLayer;
  if (glowLayer === null)
  {
    return;
  }
  if (settings.blurKernelSize !== undefined)
  {
    glowLayer.blurKernelSize = settings.blurKernelSize;
  }
  if (settings.intensity !== undefined)
  {
    glowLayer.intensity = settings.intensity;
  }
}

/** Enable vignette and copy weight, stretch, and center from the manifest. */
export function ApplyVignette(
  imageProcessing: DefaultRenderingPipeline["imageProcessing"],
  settings: VignetteInfo
): void
{
  imageProcessing.vignetteEnabled = true;
  if (settings.weight !== undefined)
  {
    imageProcessing.vignetteWeight = settings.weight;
  }
  if (settings.stretch !== undefined)
  {
    imageProcessing.vignetteStretch = settings.stretch;
  }
  if (settings.centerX !== undefined)
  {
    imageProcessing.vignetteCenterX = settings.centerX;
  }
  if (settings.centerY !== undefined)
  {
    imageProcessing.vignetteCenterY = settings.centerY;
  }
}
