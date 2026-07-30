import type { Component } from "./components";

export interface ShadowSettings {
  mapSize?: number;    // per-light resolution override; 0/undefined = loader default
  bias?: number;
  normalBias?: number;
  darkness?: number;   // 0 = black shadow, 1 = invisible
  minZ?: number;       // light.shadowMinZ; 0 = auto
  maxZ?: number;       // light.shadowMaxZ; 0 = auto
  filter?: "PCF" | "PCSS" | "POISSON" | "BLUR_ESM" | "NONE";
  forceBackFaces?: boolean;      // render only back faces into the shadow map (acne fix)
  frustumEdgeFalloff?: number;   // 0 = hard frustum edge, 1 = full fade (dir/spot only)
}

export interface LightInfo {
  type: "POINT" | "SUN" | "SPOT" | "AREA";
  color: [number, number, number];
  energy: number;
  range?: number;
  sunAngle?: number;   // angular diameter, radians (sun only)
  spotSize?: number;   // full cone angle, radians (spot only)
  spotBlend?: number;  // 0..1 edge softness (spot only)
  castShadows: boolean;
  shadow?: ShadowSettings; // present when castShadows; per-light Babylon controls
  /**
   * When false, keep this point/spot in the forward shader even when the scene
   * exceeds {@link SceneInfo.lightBudget}. Omitted or true = eligible for clustering.
   */
  cluster?: boolean;
}

export interface CameraInfo {
  type: "PERSP" | "ORTHO" | "PANO";
  clipStart: number;
  clipEnd: number;
  fov?: number;        // vertical FOV in radians (PERSP/PANO)
  orthoScale?: number; // ORTHO only (bounds otherwise come from the glb)
  active: boolean;     // is this the Blender scene's active camera?
}

export interface AnimationInfo {
  autoPlay: boolean;
  clip: string;        // clip to auto-play (blank = first found)
  loop: boolean;
  speed: number;
  clips: string[];     // NLA strip names present (informational)
}

export interface EntityData {
  id: string;
  name: string;
  parent: string | null;
  components: Component[];
  /** False when Blender viewport-hidden (eye icon). Omitted when visible. */
  visible?: boolean;
  light?: LightInfo;   // auto-derived from a Blender lamp; not a component
  camera?: CameraInfo; // auto-derived from a Blender camera; not a component
  animation?: AnimationInfo; // NLA clips + autoplay; not a component
}
