import { Scene } from "@babylonjs/core";
import type { Node, AnimationGroup } from "@babylonjs/core";
import type { Entity, AnimationInfo } from "./types";

/**
 * AnimationGroups created by the glb import are global and named after the
 * exported glTF animation (≈ the Blender NLA strip / action). We scope them to
 * an entity by membership: a group "belongs" to a node if any of its targeted
 * animations targets that node or one of its descendants. This avoids relying on
 * names being globally unique.
 */
export function findAnimationGroups(scene: Scene, node: Node): AnimationGroup[] {
  const nodes = new Set<unknown>([node, ...node.getDescendants(false)]);
  return scene.animationGroups.filter((g) =>
    g.targetedAnimations.some((ta) => nodes.has(ta.target))
  );
}

/**
 * Populate `entity.animations` with the clips targeting it, then auto-play one
 * if the manifest asked for it. Selection: the named clip (exact, then
 * contains), else the first clip found.
 */
export function applyAnimation(
  scene: Scene,
  entity: Entity,
  info: AnimationInfo
): void {
  entity.animations = findAnimationGroups(scene, entity.node);
  if (entity.animations.length === 0 || !info.autoPlay) return;

  const chosen = (info.clip && entity.getAnimation(info.clip)) || entity.animations[0];
  chosen.start(info.loop, info.speed);
}
