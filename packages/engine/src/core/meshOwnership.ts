import { AbstractMesh, Mesh } from "@babylonjs/core";
import type { TransformNode } from "@babylonjs/core";
import { ID_KEY } from "./types";

/**
 * Mesh ownership: which meshes under a node belong to *that* entity, and which
 * belong to a nested child entity. Multi-material primitive splits
 * (`<name>_primitive0`, ...) inherit no bjs_id and count as owned; anything at
 * or below a node carrying its own bjs_id belongs to that child entity instead.
 *
 * Physics (collider bounds/compound shapes) and reflection probes (capture and
 * exclusion lists) both depend on this exact rule — keep it here, in one place.
 */

/**
 * Whether a descendant mesh belongs to a nested child entity rather than to
 * `hostNode`: true when any node on its ancestor path up to (but excluding)
 * `hostNode` carries a bjs_id GUID in its glTF extras.
 */
export function MeshBelongsToChildEntity(mesh: AbstractMesh, hostNode: TransformNode): boolean
{
  let ancestor: TransformNode | null = mesh;
  while (ancestor !== null && ancestor !== hostNode)
  {
    if (ancestor.metadata?.gltf?.extras?.[ID_KEY] !== undefined)
    {
      return true;
    }
    ancestor = ancestor.parent as TransformNode | null;
  }

  return false;
}

/**
 * The node's descendant meshes with geometry that this entity owns — its own
 * submeshes and primitive splits, excluding child-entity geometry. Used by
 * physics for collider bounds and compound-shape children.
 */
export function CollectOwnedChildMeshes(node: TransformNode): Mesh[]
{
  const owned: Mesh[] = [];

  for (const descendant of node.getChildMeshes(false))
  {
    if (!(descendant instanceof Mesh) || descendant.getTotalVertices() === 0)
    {
      continue;
    }

    if (!MeshBelongsToChildEntity(descendant, node))
    {
      owned.push(descendant);
    }
  }

  return owned;
}

/**
 * Every mesh this entity owns, including the entity node itself when it
 * carries geometry. Used by reflection probes to build capture and host
 * exclusion lists.
 */
export function CollectOwnedMeshes(node: TransformNode): AbstractMesh[]
{
  const owned: AbstractMesh[] = [];

  if (node instanceof AbstractMesh && node.getTotalVertices() > 0)
  {
    owned.push(node);
  }

  owned.push(...CollectOwnedChildMeshes(node));
  return owned;
}
