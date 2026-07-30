import { AbstractMesh, FreeCamera, TransformNode, Vector3 } from "@babylonjs/core";
import type { Camera, Scene } from "@babylonjs/core";
import type { Entity } from "../../Entity";
import type { CameraComponent, EntityData } from "../../types";
import type { LoadContext } from "../context";
import {
  ApplyBlenderCamera,
  BuildTypedCamera,
  FindCameraForNode,
  QueueCameraTargets,
} from "../../../subsystems/cameras";

/**
 * Recreate the faithful glb FreeCamera on a cloned camera entity. Needed when
 * the template carried a typed CAMERA override: BuildTypedCamera disposed the
 * template's faithful camera at load, so the clone has no camera leaf. The
 * orientation-correction TransformNode chain the camera hung from DID clone,
 * so a fresh camera at the end of that chain reproduces the exact placement.
 */
function RebuildFaithfulCamera(scene: Scene, clonedNode: TransformNode): void
{
  // Walk down while there is exactly one non-entity, non-mesh transform child —
  // that is the glTF orientation-correction chain (pure rotation nodes).
  let chainEnd: TransformNode = clonedNode;
  for (;;)
  {
    const chainCandidates = chainEnd
      .getChildren(undefined, true)
      .filter((child) =>
        child instanceof TransformNode &&
        !(child instanceof AbstractMesh) &&
        (child.metadata as { bjsEntity?: Entity } | undefined)?.bjsEntity === undefined
      ) as TransformNode[];

    if (chainCandidates.length !== 1)
    {
      break;
    }
    chainEnd = chainCandidates[0];
  }

  const rebuiltCamera = new FreeCamera(`${clonedNode.name}_camera`, Vector3.Zero(), scene, false);
  rebuiltCamera.parent = chainEnd;
  // glTF cameras look towards local -Z — the same correction the glTF loader
  // applies to every imported camera.
  rebuiltCamera.setTarget(new Vector3(0, 0, -1));
}

/**
 * Apply camera data to spawned camera entities: configure the cloned faithful
 * FreeCamera (rebuilding it when the template's was consumed by a typed
 * override at load), then build the typed CAMERA override and queue its
 * target bindings (target GUIDs were already remapped onto this instance).
 * Spawned cameras are never made active — callers pick from SpawnHandle.cameras.
 */
export function ProcessSpawnedCameras(
  scene: Scene,
  spawnedEntities: Entity[],
  spawnedRows: EntityData[],
  spawnContext: LoadContext
): Camera[]
{
  const builtCameras: Camera[] = [];

  for (let index = 0; index < spawnedEntities.length; index++)
  {
    const spawnedRow = spawnedRows[index];
    if (spawnedRow.camera === undefined)
    {
      continue;
    }

    const spawnedEntity = spawnedEntities[index];
    const clonedNode = spawnedEntity.node;

    if (FindCameraForNode(scene, clonedNode) === null)
    {
      RebuildFaithfulCamera(scene, clonedNode);
    }

    let camera = ApplyBlenderCamera(scene, clonedNode, spawnedRow.camera);

    const cameraComponent = spawnedRow.components.find(
      (component) => component.type === "CAMERA"
    ) as CameraComponent | undefined;

    if (camera !== null && cameraComponent !== undefined)
    {
      const built = BuildTypedCamera(scene, camera, cameraComponent);
      camera = built.camera;
      QueueCameraTargets(built, cameraComponent, spawnContext.cameraTargets, spawnedEntity.id);
    }

    if (camera !== null)
    {
      builtCameras.push(camera);
    }
  }

  return builtCameras;
}
