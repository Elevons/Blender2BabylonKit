import type { Scene, TransformNode, Node } from "@babylonjs/core";
import { ID_KEY, VISIBLE_KEY } from "../types";

/**
 * Node resolution: match manifest entities back to the glTF nodes Babylon
 * created. GUID lookup (node extras -> metadata) is primary; name lookup is
 * the fallback for nodes that never got a GUID.
 */

/** Map every loaded node's GUID (node.metadata.gltf.extras.bjs_id) to the node. */
export function BuildIdIndex(scene: Scene): Map<string, TransformNode>
{
  const idIndex = new Map<string, TransformNode>();

  const consider = (candidateNode: TransformNode): void =>
  {
    const guid = candidateNode.metadata?.gltf?.extras?.[ID_KEY];
    if (typeof guid === "string" && guid.length > 0 && !idIndex.has(guid))
    {
      idIndex.set(guid, candidateNode);
    }
  };

  for (const transformNode of scene.transformNodes)
  {
    consider(transformNode);
  }
  for (const mesh of scene.meshes)
  {
    consider(mesh as unknown as TransformNode);
  }

  return idIndex;
}

/** Find a node by name, trying meshes, transform nodes, then any node. */
export function FindNodeByName(scene: Scene, name: string): TransformNode | null
{
  return (
    scene.getMeshByName(name) ??
    scene.getTransformNodeByName(name) ??
    (scene.getNodeByName(name) as TransformNode | null) ??
    null
  );
}

/**
 * With right-handed import the glTF "__root__" is identity (no handedness
 * mirror), so Havok can decompose node world matrices cleanly. This stays as a
 * guard: if a mirrored root ever reappears (negative determinant), physics
 * orientation is broken again and we want a loud, specific warning.
 */
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

function IsMarkedHiddenInExtras(extras: Record<string, unknown> | undefined): boolean
{
  const marked = extras?.[VISIBLE_KEY];
  return marked === false || marked === 0;
}

/** Hide a loaded node and its descendants; disable child lights/cameras. */
export function HideEntityNode(scene: Scene, root: TransformNode): void
{
  root.isVisible = false;

  for (const descendant of root.getDescendants(false))
  {
    descendant.isVisible = false;
  }

  for (const light of scene.lights)
  {
    if (IsDescendantOf(light, root))
    {
      light.setEnabled(false);
    }
  }
  for (const camera of scene.cameras)
  {
    if (IsDescendantOf(camera, root))
    {
      camera.isVisible = false;
    }
  }
}

/** Hide glTF nodes whose extras carry `bjs_visible` (Blender viewport-hidden). */
export function ApplyNodeVisibility(scene: Scene): void
{
  const consider = (candidateNode: TransformNode): void =>
  {
    if (IsMarkedHiddenInExtras(candidateNode.metadata?.gltf?.extras))
    {
      HideEntityNode(scene, candidateNode);
    }
  };

  for (const transformNode of scene.transformNodes)
  {
    consider(transformNode);
  }
  for (const mesh of scene.meshes)
  {
    consider(mesh as unknown as TransformNode);
  }
}

export function NeutralizeGltfRoot(scene: Scene): void
{
  const rootNode = scene.getNodeByName("__root__") as TransformNode | null;
  if (rootNode === null)
  {
    return;
  }

  rootNode.computeWorldMatrix(true);
  if (rootNode.getWorldMatrix().determinant() < 0)
  {
    console.warn(
      '[bjs] "__root__" has a negative-determinant (mirrored) transform; ' +
      "collider/body orientation will be wrong. Ensure scene.useRightHandedSystem " +
      "is set to true BEFORE the glb is appended."
    );
  }
}
