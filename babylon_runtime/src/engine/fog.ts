import { Scene, Color3 } from "@babylonjs/core";
import type { FogInfo } from "./types";

const FOG_MODES: Record<FogInfo["mode"], number> = {
  LINEAR: Scene.FOGMODE_LINEAR,
  EXP: Scene.FOGMODE_EXP,
  EXP2: Scene.FOGMODE_EXP2,
};

export function applyFog(scene: Scene, info: FogInfo): void {
  scene.fogMode = FOG_MODES[info.mode] ?? Scene.FOGMODE_LINEAR;
  scene.fogColor = Color3.FromArray(info.color);
  scene.fogDensity = info.density; // used by EXP / EXP2
  scene.fogStart = info.start;     // used by LINEAR
  scene.fogEnd = info.end;         // used by LINEAR
}
