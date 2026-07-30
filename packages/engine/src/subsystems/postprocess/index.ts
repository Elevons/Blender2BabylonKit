import {
  Scene,
  Camera,
  ColorCurves,
  DefaultRenderingPipeline,
  SSAO2RenderingPipeline,
} from "@babylonjs/core";
import type { PostProcessingInfo, SsaoInfo } from "../../core/types";
import {
  ApplyChromaticAberration,
  ApplyColorCurves,
  ApplyColorGradingLut,
  ApplyDepthOfField,
  ApplyGlow,
  ApplyGrain,
  ApplySharpen,
  ApplyVignette,
  NeedsImageProcessing,
  TONE_MAPPING_TYPES,
} from "./effects";

/** Build and configure the DefaultRenderingPipeline. */
function BuildDefaultPipeline(
  scene: Scene,
  targetCameras: Camera[],
  postProcessingInfo: PostProcessingInfo,
  baseUrl: string
): DefaultRenderingPipeline
{
  const pipeline = new DefaultRenderingPipeline("bjsDefault", true, scene, targetCameras);

  pipeline.samples = postProcessingInfo.msaaSamples ?? 1;
  pipeline.fxaaEnabled = postProcessingInfo.fxaa ?? false;

  const bloom = postProcessingInfo.bloom;
  pipeline.bloomEnabled = bloom?.enabled === true;
  if (bloom?.enabled === true)
  {
    pipeline.bloomThreshold = bloom.threshold;
    pipeline.bloomWeight = bloom.intensity;
    if (bloom.kernel !== undefined)
    {
      pipeline.bloomKernel = bloom.kernel;
    }
    if (bloom.scale !== undefined)
    {
      pipeline.bloomScale = bloom.scale;
    }
  }

  let toneMappingEnabled = postProcessingInfo.toneMapping === true;
  if (bloom?.enabled === true && !toneMappingEnabled)
  {
    console.warn(
      "[bjs] post-processing: bloom requires tone mapping with HDR — enabling tone mapping"
    );
    toneMappingEnabled = true;
  }

  pipeline.imageProcessingEnabled = NeedsImageProcessing(postProcessingInfo) || toneMappingEnabled;

  if (pipeline.imageProcessing)
  {
    pipeline.imageProcessing.toneMappingEnabled = toneMappingEnabled;
    if (toneMappingEnabled)
    {
      const toneMappingType = postProcessingInfo.toneMappingType ?? "ACES";
      pipeline.imageProcessing.toneMappingType = TONE_MAPPING_TYPES[toneMappingType];
    }
    pipeline.imageProcessing.exposure = postProcessingInfo.exposure ?? 1;
    pipeline.imageProcessing.contrast = postProcessingInfo.contrast ?? 1;

    if (postProcessingInfo.vignette?.enabled)
    {
      ApplyVignette(pipeline.imageProcessing, postProcessingInfo.vignette);
    }
    if (postProcessingInfo.colorGrading?.enabled)
    {
      ApplyColorGradingLut(scene, baseUrl, pipeline.imageProcessing, postProcessingInfo.colorGrading);
    }
    if (postProcessingInfo.colorCurves?.enabled)
    {
      const curves = new ColorCurves();
      ApplyColorCurves(curves, postProcessingInfo.colorCurves);
      pipeline.imageProcessing.colorCurves = curves;
      pipeline.imageProcessing.colorCurvesEnabled = true;
    }
  }

  if (postProcessingInfo.sharpen?.enabled)
  {
    ApplySharpen(pipeline, postProcessingInfo.sharpen);
  }
  if (postProcessingInfo.depthOfField?.enabled)
  {
    ApplyDepthOfField(pipeline, postProcessingInfo.depthOfField);
  }
  if (postProcessingInfo.chromaticAberration?.enabled)
  {
    ApplyChromaticAberration(pipeline, postProcessingInfo.chromaticAberration);
  }
  if (postProcessingInfo.grain?.enabled)
  {
    ApplyGrain(pipeline, postProcessingInfo.grain);
  }
  if (postProcessingInfo.glow?.enabled)
  {
    ApplyGlow(pipeline, postProcessingInfo.glow);
  }

  return pipeline;
}

/** Copy SSAO radius, strength, sample count, and depth range from the manifest. */
function ApplySsaoSettings(ssao: SSAO2RenderingPipeline, settings: SsaoInfo): void
{
  if (settings.radius !== undefined)
  {
    ssao.radius = settings.radius;
  }
  if (settings.totalStrength !== undefined)
  {
    ssao.totalStrength = settings.totalStrength;
  }
  if (settings.samples !== undefined)
  {
    ssao.samples = settings.samples;
  }
  if (settings.maxZ !== undefined)
  {
    ssao.maxZ = settings.maxZ;
  }
}

export interface PostProcessingHandles {
  pipeline?: DefaultRenderingPipeline;
  ssao?: SSAO2RenderingPipeline;
}

/** Move the default rendering pipeline onto a different camera. */
export function RetargetPostProcessing(
  handles: PostProcessingHandles,
  camera: Camera
): void
{
  if (handles.pipeline === undefined)
  {
    return;
  }

  for (const attached of handles.pipeline.cameras)
  {
    if (attached !== camera)
    {
      handles.pipeline.removeCamera(attached);
    }
  }
  if (!handles.pipeline.cameras.includes(camera))
  {
    handles.pipeline.addCamera(camera);
  }
}

/**
 * Wire up post-processing from the manifest's scene block. The default pipeline
 * covers FXAA, MSAA, bloom, image processing, DOF, and related lens/film effects;
 * SSAO2 is attached separately when requested.
 */
export function ApplyPostProcessing(
  scene: Scene,
  activeCamera: Camera | null,
  postProcessingInfo: PostProcessingInfo,
  baseUrl = ""
): PostProcessingHandles
{
  const targetCameras = activeCamera ? [activeCamera] : scene.cameras;
  const handles: PostProcessingHandles = {};

  if (targetCameras.length === 0)
  {
    console.warn("[bjs] post-processing skipped: the scene has no camera");
    return handles;
  }

  if (postProcessingInfo.defaultPipeline === true)
  {
    handles.pipeline = BuildDefaultPipeline(
      scene, targetCameras, postProcessingInfo, baseUrl
    );
  }

  if (postProcessingInfo.ssao === true)
  {
    handles.ssao = new SSAO2RenderingPipeline("bjsSSAO", scene, 0.75, targetCameras);
    ApplySsaoSettings(handles.ssao, {
      enabled: true,
      ...postProcessingInfo.ssaoSettings,
    });
  }

  return handles;
}

export { ApplyColorGradingLut } from "./effects";
