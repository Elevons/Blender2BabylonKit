import { Scene, Camera } from "@babylonjs/core";
import type { Node } from "@babylonjs/core";
import type { CameraInfo } from "./types";

/**
 * The glb (exported with cameras on) already created a Babylon FreeCamera with
 * the correct, coordinate-converted transform. Its position/rotation live on
 * the parent node chain (Blender injects an orientation-correction node), so we
 * walk up from each camera to find the one under the GUID'd node.
 */
export function findCameraForNode(scene: Scene, node: Node): Camera | null {
  for (const cam of scene.cameras) {
    let p: Node | null = cam.parent;
    while (p) {
      if (p === node) return cam;
      p = p.parent;
    }
  }
  return scene.getCameraByName(node.name) ?? null;
}

/**
 * Copy the Blender camera's settings onto the existing Babylon camera. Transform
 * is left untouched (it comes from the glb node), so the Blender camera acts as a
 * faithful stand-in. Returns the camera so the loader can make it active.
 */
export function applyBlenderCamera(
  scene: Scene,
  node: Node,
  info: CameraInfo
): Camera | null {
  const cam = findCameraForNode(scene, node);
  if (!cam) {
    console.warn(`[bjs] no Babylon camera for "${node.name}" (${info.type})`);
    return null;
  }

  cam.minZ = info.clipStart;
  cam.maxZ = info.clipEnd;

  if (info.type === "ORTHO") {
    cam.mode = Camera.ORTHOGRAPHIC_CAMERA;
    // Ortho bounds (orthoLeft/Right/Top/Bottom) come through the glb's xmag/ymag.
  } else {
    cam.mode = Camera.PERSPECTIVE_CAMERA;
    if (typeof info.fov === "number") {
      cam.fov = info.fov; // vertical FOV, radians
      cam.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
    }
  }
  return cam;
}
