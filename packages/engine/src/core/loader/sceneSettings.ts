import { Color3, Color4 } from "@babylonjs/core";
import type { Scene } from "@babylonjs/core";
import type { SceneInfo, AnimationInfo } from "../types";
import type { Level } from "../Level";
import type { Entity } from "../Entity";
import { ApplyEnvironment } from "../../subsystems/environment";
import { ApplyFog } from "../../subsystems/fog";
import { ApplyAnimation } from "../../subsystems/animation";

/**
 * Scene-wide settings from the manifest's optional `scene` block (clear /
 * ambient color, environment, fog) plus the animation autoplay pass — everything
 * applied once, after the entity loop. Post-processing is applied later in
 * LevelLoader, after Begin(), so runtime cameras exist first.
 */

/** Apply the optional scene-wide render block from the manifest. */
export async function ApplySceneSettings(
  scene: Scene,
  sceneInfo: SceneInfo,
  baseUrl: string,
  level: Level
): Promise<void>
{
  if (sceneInfo.clearColor !== undefined)
  {
    scene.clearColor = Color4.FromArray(sceneInfo.clearColor);
  }
  if (sceneInfo.ambientColor !== undefined)
  {
    scene.ambientColor = Color3.FromArray(sceneInfo.ambientColor);
  }
  if (sceneInfo.environment !== undefined && sceneInfo.environment !== null)
  {
    await ApplyEnvironment(scene, sceneInfo.environment, baseUrl);
  }
  if (sceneInfo.fog !== undefined && sceneInfo.fog !== null)
  {
    ApplyFog(scene, sceneInfo.fog);
  }
}

/**
 * Neutralize auto-started AnimationGroups (the glTF loader plays the first one
 * by default), then auto-play each entity's chosen clip if requested.
 */
export function ApplyAutoPlayAnimations(
  scene: Scene,
  animatedEntities: { entity: Entity; info: AnimationInfo }[]
): void
{
  if (scene.animationGroups.length === 0)
  {
    return;
  }

  for (const group of scene.animationGroups)
  {
    group.stop();
  }

  for (const animated of animatedEntities)
  {
    ApplyAnimation(scene, animated.entity, animated.info);
  }
}
