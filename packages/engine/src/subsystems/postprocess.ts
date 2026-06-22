import {
  Scene,
  Camera,
  ColorCurves,
  ColorGradingTexture,
  DefaultRenderingPipeline,
  DepthOfFieldEffectBlurLevel,
  ImageProcessingConfiguration,
  Mesh,
  SSAO2RenderingPipeline,
  Texture,
  Vector3,
  VolumetricLightScatteringPostProcess,
} from "@babylonjs/core";
import type {
  ChromaticAberrationInfo,
  ColorCurvesInfo,
  ColorGradingInfo,
  DepthOfFieldInfo,
  GlowInfo,
  GrainInfo,
  PostProcessingInfo,
  SharpenInfo,
  SsaoInfo,
  VignetteInfo,
  VolumetricLightScatteringInfo,
} from "../core/types";
import { ResolveManifestAssetUrl } from "../core/loader/manifest";
import type { Level } from "../core/Level";

const TONE_MAPPING_TYPES = {
  STANDARD: ImageProcessingConfiguration.TONEMAPPING_STANDARD,
  ACES: ImageProcessingConfiguration.TONEMAPPING_ACES,
  KHR_PBR_NEUTRAL: ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL,
} as const;

const DOF_BLUR_LEVELS = {
  LOW: DepthOfFieldEffectBlurLevel.Low,
  MEDIUM: DepthOfFieldEffectBlurLevel.Medium,
  HIGH: DepthOfFieldEffectBlurLevel.High,
} as const;

function NeedsImageProcessing(info: PostProcessingInfo): boolean
{
  return info.toneMapping === true ||
    (info.exposure !== undefined && info.exposure !== 1) ||
    (info.contrast !== undefined && info.contrast !== 1) ||
    info.vignette?.enabled === true ||
    info.colorGrading?.enabled === true ||
    info.colorCurves?.enabled === true;
}

function ApplyColorCurves(curves: ColorCurves, settings: ColorCurvesInfo): void
{
  if (settings.globalHue !== undefined) curves.globalHue = settings.globalHue;
  if (settings.globalDensity !== undefined) curves.globalDensity = settings.globalDensity;
  if (settings.globalSaturation !== undefined) curves.globalSaturation = settings.globalSaturation;
  if (settings.globalExposure !== undefined) curves.globalExposure = settings.globalExposure;
  if (settings.highlightsHue !== undefined) curves.highlightsHue = settings.highlightsHue;
  if (settings.highlightsDensity !== undefined) curves.highlightsDensity = settings.highlightsDensity;
  if (settings.highlightsSaturation !== undefined)
  {
    curves.highlightsSaturation = settings.highlightsSaturation;
  }
  if (settings.highlightsExposure !== undefined) curves.highlightsExposure = settings.highlightsExposure;
  if (settings.midtonesHue !== undefined) curves.midtonesHue = settings.midtonesHue;
  if (settings.midtonesDensity !== undefined) curves.midtonesDensity = settings.midtonesDensity;
  if (settings.midtonesSaturation !== undefined) curves.midtonesSaturation = settings.midtonesSaturation;
  if (settings.midtonesExposure !== undefined) curves.midtonesExposure = settings.midtonesExposure;
  if (settings.shadowsHue !== undefined) curves.shadowsHue = settings.shadowsHue;
  if (settings.shadowsDensity !== undefined) curves.shadowsDensity = settings.shadowsDensity;
  if (settings.shadowsSaturation !== undefined) curves.shadowsSaturation = settings.shadowsSaturation;
  if (settings.shadowsExposure !== undefined) curves.shadowsExposure = settings.shadowsExposure;
}

function ApplyColorGrading(
  scene: Scene,
  baseUrl: string,
  imageProcessing: DefaultRenderingPipeline["imageProcessing"],
  settings: ColorGradingInfo
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
  else
  {
    const texture = new Texture(textureUrl, scene, true, false);
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    imageProcessing.colorGradingTexture = texture;
  }
  imageProcessing.colorGradingEnabled = true;
}

function ApplySharpen(pipeline: DefaultRenderingPipeline, settings: SharpenInfo): void
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

function ApplyDepthOfField(pipeline: DefaultRenderingPipeline, settings: DepthOfFieldInfo): void
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

function ApplyChromaticAberration(
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

function ApplyGrain(pipeline: DefaultRenderingPipeline, settings: GrainInfo): void
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

function ApplyGlow(pipeline: DefaultRenderingPipeline, settings: GlowInfo): void
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

function ApplyVignette(
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
      ApplyColorGrading(scene, baseUrl, pipeline.imageProcessing, postProcessingInfo.colorGrading);
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

/** Resolve an entity's export mesh for use as a VLS light-source billboard. */
function ResolveEntityMesh(level: Level, guid: string): Mesh | null
{
  const entity = level.ById(guid);
  if (entity === undefined)
  {
    console.warn(`[bjs] volumetric light scattering: light source entity not found (${guid})`);
    return null;
  }

  const node = entity.node;
  if (node instanceof Mesh)
  {
    return node;
  }

  for (const child of node.getChildMeshes(false))
  {
    if (child instanceof Mesh)
    {
      return child;
    }
  }

  console.warn(
    `[bjs] volumetric light scattering: entity "${entity.name}" has no mesh for the light source`
  );
  return null;
}

/** Apply manifest tuning fields onto a VolumetricLightScatteringPostProcess. */
function ApplyVolumetricLightScatteringSettings(
  volumetricLightScattering: VolumetricLightScatteringPostProcess,
  settings: VolumetricLightScatteringInfo
): void
{
  if (settings.invert !== undefined)
  {
    volumetricLightScattering.invert = settings.invert;
  }
  if (settings.exposure !== undefined)
  {
    volumetricLightScattering.exposure = settings.exposure;
  }
  if (settings.decay !== undefined)
  {
    volumetricLightScattering.decay = settings.decay;
  }
  if (settings.weight !== undefined)
  {
    volumetricLightScattering.weight = settings.weight;
  }
  if (settings.density !== undefined)
  {
    volumetricLightScattering.density = settings.density;
  }
  if (settings.useCustomMeshPosition === true && settings.customMeshPosition !== undefined)
  {
    const [positionX, positionY, positionZ] = settings.customMeshPosition;
    volumetricLightScattering.useCustomMeshPosition = true;
    volumetricLightScattering.setCustomMeshPosition(new Vector3(positionX, positionY, positionZ));
  }
}

/** Create VolumetricLightScatteringPostProcess on the active camera. */
function BuildVolumetricLightScattering(
  scene: Scene,
  camera: Camera,
  level: Level | undefined,
  settings: VolumetricLightScatteringInfo
): VolumetricLightScatteringPostProcess
{
  const engine = scene.getEngine();
  const ratio = settings.ratio ?? 1.0;
  const samples = settings.samples ?? 100;

  let lightMesh: Mesh | undefined;
  if (settings.lightSource !== undefined && settings.lightSource !== null && level !== undefined)
  {
    lightMesh = ResolveEntityMesh(level, settings.lightSource) ?? undefined;
  }

  const volumetricLightScattering = new VolumetricLightScatteringPostProcess(
    "bjsVLS",
    ratio,
    camera,
    lightMesh,
    samples,
    Texture.BILINEAR_SAMPLINGMODE,
    engine,
    false,
    scene
  );

  ApplyVolumetricLightScatteringSettings(volumetricLightScattering, settings);
  return volumetricLightScattering;
}

export interface PostProcessingHandles {
  pipeline?: DefaultRenderingPipeline;
  ssao?: SSAO2RenderingPipeline;
  volumetricLightScattering?: VolumetricLightScatteringPostProcess;
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
  baseUrl = "",
  level?: Level
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

  const volumetricLightScatteringSettings = postProcessingInfo.volumetricLightScattering;
  if (
    volumetricLightScatteringSettings !== undefined &&
    volumetricLightScatteringSettings.enabled === true &&
    activeCamera !== null
  )
  {
    handles.volumetricLightScattering = BuildVolumetricLightScattering(
      scene, activeCamera, level, volumetricLightScatteringSettings
    );
  }

  return handles;
}
