import type { Scene, TransformNode, Node } from "@babylonjs/core";

/** Whether `node` is nested under `ancestor` in the scene graph. */
function IsDescendantOf(node: Node, ancestor: Node): boolean
{
  let parent: Node | null = node.parent;
  while (parent !== null)
  {
    if (parent === ancestor)
    {
      return true;
    }

    parent = parent.parent;
  }

  return false;
}

/**
 * Loader/spawn visibility only — hides a node subtree without changing
 * `entity.active` or suspending physics/behaviors.
 */
export function ApplyNodeSubtreeVisibility(scene: Scene, root: TransformNode, visible: boolean): void
{
  root.setEnabled(visible);
  root.isVisible = visible;

  for (const descendant of root.getDescendants(false))
  {
    descendant.setEnabled(visible);
    descendant.isVisible = visible;
  }

  for (const light of scene.lights)
  {
    if (IsDescendantOf(light, root))
    {
      light.setEnabled(visible);
    }
  }

  for (const camera of scene.cameras)
  {
    if (IsDescendantOf(camera, root))
    {
      camera.isVisible = visible;
    }
  }
}
