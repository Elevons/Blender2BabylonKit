import { Scene, Color3 } from "@babylonjs/core";
import type { FogInfo } from "../core/types";

const FOG_MODES: Record<FogInfo["mode"], number> =
{
  LINEAR: Scene.FOGMODE_LINEAR,
  EXP: Scene.FOGMODE_EXP,
  EXP2: Scene.FOGMODE_EXP2,
};

/** Apply the manifest's fog block to the scene. */
export function ApplyFog(scene: Scene, fogInfo: FogInfo): void
{
  scene.fogMode = FOG_MODES[fogInfo.mode] ?? Scene.FOGMODE_LINEAR;
  scene.fogColor = Color3.FromArray(fogInfo.color);
  scene.fogDensity = fogInfo.density; // used by EXP / EXP2
  scene.fogStart = fogInfo.start;     // used by LINEAR
  scene.fogEnd = fogInfo.end;         // used by LINEAR
}
