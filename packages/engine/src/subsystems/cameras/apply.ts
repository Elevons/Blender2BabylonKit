import { Camera } from "@babylonjs/core";
import type { Scene, Node } from "@babylonjs/core";
import type { CameraInfo } from "../../core/types";

/**
 * Applying Blender camera data: find the glb's faithful FreeCamera for an
 * entity node and copy the exporter's lens settings onto it. Building typed
 * camera overrides (ARC / FOLLOW / ...) lives in typed.ts.
 */

/**
 * The glb already created a Babylon FreeCamera with the correct, coordinate-
 * converted transform. Its position/rotation live on the parent node chain
 * (Blender injects an orientation-correction node), so we walk up from each
 * camera to find the one under the GUID'd node.
 */
export function FindCameraForNode(scene: Scene, entityNode: Node): Camera | null
{
  for (const camera of scene.cameras)
  {
    let parent: Node | null = camera.parent;
    while (parent !== null)
    {
      if (parent === entityNode)
      {
        return camera;
      }
      parent = parent.parent;
    }
  }

  return scene.getCameraByName(entityNode.name) ?? null;
}

/**
 * Copy the Blender camera's settings onto the existing Babylon camera. Transform
 * is left untouched (it comes from the glb node), so the Blender camera acts as a
 * faithful stand-in. Returns the camera so the loader can make it active.
 */
export function ApplyBlenderCamera(
  scene: Scene,
  entityNode: Node,
  cameraInfo: CameraInfo
): Camera | null
{
  const camera = FindCameraForNode(scene, entityNode);
  if (camera === null)
  {
    console.warn(`[bjs] no Babylon camera for "${entityNode.name}" (${cameraInfo.type})`);
    return null;
  }

  camera.minZ = cameraInfo.clipStart;
  camera.maxZ = cameraInfo.clipEnd;

  if (cameraInfo.type === "ORTHO")
  {
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    // Ortho bounds (orthoLeft/Right/Top/Bottom) come through the glb's xmag/ymag.
  }
  else
  {
    camera.mode = Camera.PERSPECTIVE_CAMERA;
    if (typeof cameraInfo.fov === "number")
    {
      camera.fov = cameraInfo.fov; // vertical FOV, radians
      camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
    }
  }

  return camera;
}
