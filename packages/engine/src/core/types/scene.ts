import type { CollisionLayersInfo } from "./components";
import type { InputActionAssetData } from "./input";

export interface EnvironmentInfo {
  /** Path relative to the manifest (e.g. "env/sky.env"). Omit when useDefault is true. */
  file?: string;
  /** Load Babylon's built-in studio environment from the CDN (no file copy at export). */
  useDefault?: boolean;
  intensity: number;
  rotationY: number;   // radians
  createSkybox: boolean;
  /** When true, the skybox mesh sets applyFog = false so scene fog does not wash out the background. */
  skyboxIgnoreFog?: boolean;
  /** sRGB tint for EnvironmentHelper skyboxes (default studio env and .env backgrounds). */
  skyboxColor?: [number, number, number];
}

export interface FogInfo {
  mode: "LINEAR" | "EXP" | "EXP2";
  color: [number, number, number];
  density: number;
  start: number;
  end: number;
}

export interface AtmospherePhysicalInfo {
  peakRayleighScattering?: [number, number, number];
  rayleighScatteringScale?: number;
  mieScatteringScale?: number;
  mieAbsorptionScale?: number;
  ozoneAbsorptionScale?: number;
  planetRadius?: number;
  atmosphereThickness?: number;
  originHeight?: number;
}

/** Physically based sky and aerial perspective (Babylon Atmosphere addon). */
export interface AtmosphereInfo {
  /** Entity GUID of the sun lamp. Omit to use the first exported SUN. */
  sunLightId?: string;
  /** Set sun intensity to π for PBRMaterials (default true). */
  pbrSunIntensity?: boolean;
  /** LUT-based sky/aerial perspective (default true). False = ray marching. */
  useLuts?: boolean;
  multiScatteringIntensity?: number;
  minimumMultiScatteringIntensity?: number;
  groundAlbedo?: [number, number, number];
  physical?: AtmospherePhysicalInfo;
  isLinearSpaceLight?: boolean;
  isLinearSpaceComposition?: boolean;
}

export interface BloomInfo {
  enabled: boolean;
  threshold: number;
  intensity: number;
  kernel?: number;
  scale?: number;
}

export interface SharpenInfo {
  enabled: boolean;
  edgeAmount?: number;
  colorAmount?: number;
}

export interface DepthOfFieldInfo {
  enabled: boolean;
  blurLevel?: "LOW" | "MEDIUM" | "HIGH";
  focusDistance?: number;
  focalLength?: number;
  fStop?: number;
}

export interface ChromaticAberrationInfo {
  enabled: boolean;
  aberrationAmount?: number;
  radialIntensity?: number;
  directionX?: number;
  directionY?: number;
}

export interface GrainInfo {
  enabled: boolean;
  intensity?: number;
  animated?: boolean;
}

export interface GlowInfo {
  enabled: boolean;
  blurKernelSize?: number;
  intensity?: number;
}

export interface VignetteInfo {
  enabled: boolean;
  weight?: number;
  stretch?: number;
  centerX?: number;
  centerY?: number;
}

export interface ColorGradingInfo {
  enabled: boolean;
  /** Manifest-relative LUT path (.3dl, .cube, or .png). */
  file?: string;
}

export interface ColorCurvesInfo {
  enabled: boolean;
  globalHue?: number;
  globalDensity?: number;
  globalSaturation?: number;
  globalExposure?: number;
  highlightsHue?: number;
  highlightsDensity?: number;
  highlightsSaturation?: number;
  highlightsExposure?: number;
  midtonesHue?: number;
  midtonesDensity?: number;
  midtonesSaturation?: number;
  midtonesExposure?: number;
  shadowsHue?: number;
  shadowsDensity?: number;
  shadowsSaturation?: number;
  shadowsExposure?: number;
}

export interface SsaoInfo {
  enabled: boolean;
  radius?: number;
  totalStrength?: number;
  samples?: number;
  maxZ?: number;
}

export interface PostProcessingInfo {
  defaultPipeline?: boolean;
  fxaa?: boolean;
  msaaSamples?: number;
  bloom?: BloomInfo;
  ssao?: boolean;
  ssaoSettings?: Omit<SsaoInfo, "enabled">;
  toneMapping?: boolean;
  toneMappingType?: "STANDARD" | "ACES" | "KHR_PBR_NEUTRAL";
  exposure?: number;
  contrast?: number;
  sharpen?: SharpenInfo;
  depthOfField?: DepthOfFieldInfo;
  chromaticAberration?: ChromaticAberrationInfo;
  grain?: GrainInfo;
  glow?: GlowInfo;
  vignette?: VignetteInfo;
  colorGrading?: ColorGradingInfo;
  colorCurves?: ColorCurvesInfo;
}

export interface SceneInfo {
  clearColor?: [number, number, number, number];
  ambientColor?: [number, number, number];
  environment?: EnvironmentInfo | null;
  fog?: FogInfo | null;
  atmosphere?: AtmosphereInfo | null;
  postProcessing?: PostProcessingInfo | null;
  /** Freeze shadow maps after the first render (static-world optimization). */
  freezeShadows?: boolean;
  /** The scene's Input Actions asset (Blender "Input Actions" panel). */
  inputActions?: InputActionAssetData | null;
  /** Map name injected when a script has no @inputMap (default "Player"). */
  defaultInputMap?: string;
  /** Named collision layers + matrix from Blender Collision Layers panel. */
  collisionLayers?: CollisionLayersInfo;
  /**
   * When false, never cluster punctual lights (UBO fallback if over budget).
   * Default: auto-cluster when the scene exceeds {@link lightBudget}.
   */
  clusterPunctualLights?: boolean;
  /** Max forward scene lights before clustering / UBO fallback. Default 8. */
  lightBudget?: number;
  /**
   * Babylon large-world / floating origin rendering (engine
   * `useLargeWorldRendering`). Authored in Blender Scene › Rendering.
   */
  largeWorldRendering?: boolean;
  /** Havok multi-region radius when {@link largeWorldRendering} is true. Default 100000. */
  floatingOriginWorldRadius?: number;
}
