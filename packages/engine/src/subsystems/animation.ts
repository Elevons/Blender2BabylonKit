import { AbstractMesh, Scene } from "@babylonjs/core";
import type { Node, AnimationGroup, Skeleton, TransformNode } from "@babylonjs/core";
import type { Entity } from "../core/Entity";
import type { AnimationInfo, EntityData } from "../core/types";

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
 * Start the manifest-selected clip on an entity that already has
 * `entity.animations` populated.
 */
export function StartEntityAnimation(entity: Entity, animationInfo: AnimationInfo): void
{
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
  StartEntityAnimation(entity, animationInfo);
}

/**
 * glTF skinned meshes often share one Skeleton across copies. `node.clone()`
 * keeps that reference, so template animation drives every instance in sync.
 * Clone the skeleton once per shared rig and rebind bones through `nodePairs`.
 */
export function IsolateSharedSpawnSkeletons(
  nodePairs: ReadonlyMap<Node, Node>,
  spawnIndex: number
): void
{
  const clonedSkeletons = new Map<Skeleton, Skeleton>();

  for (const [templateNode, cloneNode] of nodePairs)
  {
    if (!(templateNode instanceof AbstractMesh) || !(cloneNode instanceof AbstractMesh))
    {
      continue;
    }

    const sharedSkeleton = cloneNode.skeleton;
    if (sharedSkeleton === null || templateNode.skeleton !== sharedSkeleton)
    {
      continue;
    }

    let isolatedSkeleton = clonedSkeletons.get(sharedSkeleton);
    if (isolatedSkeleton === undefined)
    {
      isolatedSkeleton = sharedSkeleton.clone(
        `${sharedSkeleton.name}_spawn${spawnIndex}`,
        `${sharedSkeleton.id}_spawn${spawnIndex}`
      );
      RebindSpawnSkeletonBones(isolatedSkeleton, nodePairs);
      clonedSkeletons.set(sharedSkeleton, isolatedSkeleton);
    }

    cloneNode.skeleton = isolatedSkeleton;
  }
}

/** Point cloned skeleton bones at the matching nodes in the spawned hierarchy. */
function RebindSpawnSkeletonBones(
  skeleton: Skeleton,
  nodePairs: ReadonlyMap<Node, Node>
): void
{
  for (const bone of skeleton.bones)
  {
    const linkedNode = bone.getTransformNode();
    if (linkedNode === null)
    {
      continue;
    }

    const clonedNode = nodePairs.get(linkedNode);
    if (clonedNode !== undefined)
    {
      bone.linkTransformNode(clonedNode as TransformNode);
    }
  }
}

/**
 * Reset every skeleton driving the spawned clone subtree to bind pose so
 * instances do not inherit the template's mid-clip bone state at spawn time.
 */
export function ResetCloneSkeletonsToRest(nodePairs: ReadonlyMap<Node, Node>): void
{
  const resetSkeletons = new Set<Skeleton>();

  for (const cloneNode of nodePairs.values())
  {
    if (!(cloneNode instanceof AbstractMesh))
    {
      continue;
    }

    const skeleton = cloneNode.skeleton;
    if (skeleton === null || resetSkeletons.has(skeleton))
    {
      continue;
    }

    skeleton.returnToRest();
    resetSkeletons.add(skeleton);
  }
}

/**
 * Duplicate every AnimationGroup targeting the template subtree, retargeting
 * through `nodePairs`. Spawned entities then receive independent timelines.
 */
export function CloneAnimationGroupsForSpawn(
  scene: Scene,
  templateRoot: Node,
  nodePairs: ReadonlyMap<Node, Node>,
  spawnIndex: number
): void
{
  const templateGroups = FindAnimationGroups(scene, templateRoot);
  if (templateGroups.length === 0)
  {
    return;
  }

  const clonedGroups = new Set<AnimationGroup>();

  for (const group of templateGroups)
  {
    if (clonedGroups.has(group))
    {
      continue;
    }
    clonedGroups.add(group);

    group.clone(
      `${group.name}_spawn${spawnIndex}`,
      (target) => RemapSpawnAnimationTarget(nodePairs, target),
      true,
      false
    );
  }
}

/** Map one animation target node to its clone; warn when the subtree has no pair. */
function RemapSpawnAnimationTarget(
  nodePairs: ReadonlyMap<Node, Node>,
  target: unknown
): unknown
{
  const clonedTarget = nodePairs.get(target as Node);
  if (clonedTarget !== undefined)
  {
    return clonedTarget;
  }

  console.warn(
    "[bjs] Spawn animation: target node was not cloned — clip may still drive the template"
  );
  return target;
}

/**
 * Wire autoplay clips for spawned entities from their manifest rows. Unlike
 * load-time autoplay, this does not stop clips already playing on the template.
 */
export function ApplySpawnAnimations(
  scene: Scene,
  spawnedEntities: readonly Entity[],
  spawnedRows: readonly EntityData[]
): void
{
  for (let index = 0; index < spawnedEntities.length; index++)
  {
    const animationInfo = spawnedRows[index].animation;
    if (animationInfo === undefined)
    {
      continue;
    }

    const entity = spawnedEntities[index];
    entity.animations = FindAnimationGroups(scene, entity.node);
    StartEntityAnimation(entity, animationInfo);
  }
}
