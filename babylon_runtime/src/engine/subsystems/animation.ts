import { Scene } from "@babylonjs/core";
import type { Node, AnimationGroup } from "@babylonjs/core";
import type { Entity, AnimationInfo } from "../core/types";

/**
 * AnimationGroups created by the glb import are global and named after the
 * exported glTF animation (~ the Blender NLA strip / action). We scope them to
 * an entity by membership: a group "belongs" to a node if any of its targeted
 * animations targets that node or one of its descendants. This avoids relying on
 * names being globally unique.
 */
export function FindAnimationGroups(scene: Scene, entityNode: Node): AnimationGroup[]
{
  const nodeSet = new Set<unknown>([entityNode, ...entityNode.getDescendants(false)]);

  return scene.animationGroups.filter((group) =>
    group.targetedAnimations.some((targetedAnimation) => nodeSet.has(targetedAnimation.target))
  );
}

/**
 * Populate `entity.animations` with the clips targeting it, then auto-play one
 * if the manifest asked for it. Selection: the named clip (exact, then contains),
 * else the first clip found.
 */
export function ApplyAnimation(
  scene: Scene,
  entity: Entity,
  animationInfo: AnimationInfo
): void
{
  entity.animations = FindAnimationGroups(scene, entity.node);

  if (entity.animations.length === 0 || !animationInfo.autoPlay)
  {
    return;
  }

  const namedClip = animationInfo.clip.length > 0
    ? entity.GetAnimation(animationInfo.clip)
    : undefined;
  const chosenGroup = namedClip ?? entity.animations[0];

  chosenGroup.start(animationInfo.loop, animationInfo.speed);
}
