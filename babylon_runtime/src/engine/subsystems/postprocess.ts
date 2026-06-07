import {
  Scene,
  Camera,
  DefaultRenderingPipeline,
  SSAO2RenderingPipeline,
} from "@babylonjs/core";
import type { PostProcessingInfo } from "../core/types";

export interface PostProcessingHandles {
  pipeline?: DefaultRenderingPipeline;
  ssao?: SSAO2RenderingPipeline;
}

/**
 * Wire up post-processing. FXAA, bloom, and image processing (tone mapping /
 * exposure / contrast) live on Babylon's DefaultRenderingPipeline. SSAO is a
 * SEPARATE pipeline (SSAO2RenderingPipeline), so it is attached independently
 * when requested. Post-processing attaches to a camera, so the scene must have
 * one — we use the active camera, falling back to all scene cameras.
 */
export function ApplyPostProcessing(
  scene: Scene,
  activeCamera: Camera | null,
  postProcessingInfo: PostProcessingInfo
): PostProcessingHandles
{
  // activeCamera originates from scene.activeCamera (a Babylon Nullable that can
  // be undefined at runtime), so test truthiness rather than `=== null`.
  const targetCameras = activeCamera ? [activeCamera] : scene.cameras;
  const handles: PostProcessingHandles = {};

  if (targetCameras.length === 0)
  {
    console.warn("[bjs] post-processing skipped: the scene has no camera");
    return handles;
  }

  if (postProcessingInfo.defaultPipeline)
  {
    const pipeline = new DefaultRenderingPipeline("bjsDefault", true, scene, targetCameras);
    pipeline.fxaaEnabled = postProcessingInfo.fxaa;
    pipeline.bloomEnabled = postProcessingInfo.bloom.enabled;

    if (postProcessingInfo.bloom.enabled)
    {
      pipeline.bloomThreshold = postProcessingInfo.bloom.threshold;
      pipeline.bloomWeight = postProcessingInfo.bloom.intensity;
    }

    pipeline.imageProcessingEnabled =
      postProcessingInfo.toneMapping ||
      postProcessingInfo.exposure !== 1 ||
      postProcessingInfo.contrast !== 1;

    if (pipeline.imageProcessing)
    {
      pipeline.imageProcessing.toneMappingEnabled = postProcessingInfo.toneMapping;
      pipeline.imageProcessing.exposure = postProcessingInfo.exposure;
      pipeline.imageProcessing.contrast = postProcessingInfo.contrast;
    }

    handles.pipeline = pipeline;
  }

  if (postProcessingInfo.ssao)
  {
    handles.ssao = new SSAO2RenderingPipeline("bjsSSAO", scene, 0.75, targetCameras);
  }

  return handles;
}
