import {
  Scene,
  Camera,
  DefaultRenderingPipeline,
  SSAO2RenderingPipeline,
} from "@babylonjs/core";
import type { PostProcessingInfo } from "./types";

export interface PostProcessingHandles {
  pipeline?: DefaultRenderingPipeline;
  ssao?: SSAO2RenderingPipeline;
}

/**
 * Wire up post-processing. FXAA, bloom, and image processing (tone mapping /
 * exposure / contrast) live on Babylon's DefaultRenderingPipeline. SSAO is a
 * SEPARATE pipeline (SSAO2RenderingPipeline) — it is not part of the default
 * one — so it's attached independently when requested.
 *
 * Post-processing attaches to a camera, so the scene must have one. We use the
 * active camera, falling back to all scene cameras.
 */
export function applyPostProcessing(
  scene: Scene,
  camera: Camera | null,
  info: PostProcessingInfo
): PostProcessingHandles {
  const cameras = camera ? [camera] : scene.cameras;
  const handles: PostProcessingHandles = {};
  if (cameras.length === 0) {
    console.warn("[bjs] post-processing skipped: the scene has no camera");
    return handles;
  }

  if (info.defaultPipeline) {
    const p = new DefaultRenderingPipeline("bjsDefault", true, scene, cameras);
    p.fxaaEnabled = info.fxaa;
    p.bloomEnabled = info.bloom.enabled;
    if (info.bloom.enabled) {
      p.bloomThreshold = info.bloom.threshold;
      p.bloomWeight = info.bloom.intensity;
    }
    p.imageProcessingEnabled =
      info.toneMapping || info.exposure !== 1 || info.contrast !== 1;
    if (p.imageProcessing) {
      p.imageProcessing.toneMappingEnabled = info.toneMapping;
      p.imageProcessing.exposure = info.exposure;
      p.imageProcessing.contrast = info.contrast;
    }
    handles.pipeline = p;
  }

  if (info.ssao) {
    handles.ssao = new SSAO2RenderingPipeline("bjsSSAO", scene, 0.75, cameras);
  }
  return handles;
}
