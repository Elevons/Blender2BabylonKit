import { Color3, Color4 } from "@babylonjs/core";
import type { Scene } from "@babylonjs/core";
import type { SceneInfo, AnimationInfo } from "../types";
import type { Level } from "../Level";
import type { Entity } from "../Entity";
import { ApplyEnvironment } from "../../subsystems/environment";
import { ApplyFog } from "../../subsystems/fog";
import { ApplyPostProcessing } from "../../subsystems/postprocess";
import { ApplyAnimation } from "../../subsystems/animation";

/**
 * Scene-wide settings from the manifest's optional `scene` block (clear /
 * ambient color, environment, fog, post-processing) plus the animation
 * autoplay pass — everything applied once, after the entity loop.
 */

/** Apply the optional scene-wide render block from the manifest. */
export function ApplySceneSettings(
  scene: Scene,
  sceneInfo: SceneInfo,
  baseUrl: string,
  level: Level
): void
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
    ApplyEnvironment(scene, sceneInfo.environment, baseUrl);
  }
  if (sceneInfo.fog !== undefined && sceneInfo.fog !== null)
  {
    ApplyFog(scene, sceneInfo.fog);
  }
  if (sceneInfo.postProcessing !== undefined && sceneInfo.postProcessing !== null)
  {
    level.post = ApplyPostProcessing(scene, scene.activeCamera, sceneInfo.postProcessing);
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
