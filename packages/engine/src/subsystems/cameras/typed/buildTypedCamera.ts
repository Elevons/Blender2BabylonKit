import { Camera, FreeCamera, type Scene } from "@babylonjs/core";
import type { CameraComponent } from "../../../core/types";
import { BuildArcCamera } from "./arc";
import { BuildFollowCamera, BuildOffsetFollowCamera } from "./follow";
import { BuildGeospatialCamera } from "./geospatial";
import { ConfigureFreeCamera, CopyLens, type TypedCameraResult } from "./shared";
import { BuildUniversalCamera } from "./universal";

/**
 * Opt-in camera-type override (the CAMERA component). The faithful glb FreeCamera
 * is the default; this builds the requested type FROM that camera's world
 * transform, so it starts exactly where Blender framed it.
 *
 * - FREE: keep the (parented) glb FreeCamera, just configure it.
 * - UNIVERSAL / ARC / FOLLOW / GEOSPATIAL: build a fresh camera at the faithful
 *   camera's world position/forward, copy its lens, and dispose the original.
 *
 * FOLLOW/ARC need a target entity that may not exist yet, so the target GUID is
 * returned for the loader to resolve in the second pass.
 */
export function BuildTypedCamera(
  scene: Scene,
  sourceCamera: Camera,
  cameraComponent: CameraComponent
): TypedCameraResult
{
  if (cameraComponent.cameraType === "FREE")
  {
    ConfigureFreeCamera(sourceCamera as FreeCamera, cameraComponent);
    return { camera: sourceCamera };
  }

  // Derive world position + forward from the faithful camera, then replace it.
  // Blender parents the glb camera under an orientation-correction node, so its
  // transform lives on the parent chain and camera.position is the (≈origin)
  // LOCAL offset. getForwardRay's origin is that local position, so we take the
  // eye from the world matrix translation instead; only the ray's (world-space)
  // direction is reliable.
  const worldMatrix = sourceCamera.computeWorldMatrix();
  const eyePosition = worldMatrix.getTranslation();
  const forwardDirection = sourceCamera.getForwardRay().direction.normalize();
  const cameraName = sourceCamera.name + "_" + cameraComponent.cameraType.toLowerCase();

  let result: TypedCameraResult;
  if (cameraComponent.cameraType === "UNIVERSAL")
  {
    result = BuildUniversalCamera(scene, cameraName, eyePosition, forwardDirection, cameraComponent);
  }
  else if (cameraComponent.cameraType === "ARC")
  {
    result = BuildArcCamera(scene, cameraName, eyePosition, forwardDirection, cameraComponent);
  }
  else if (cameraComponent.cameraType === "GEOSPATIAL")
  {
    result = BuildGeospatialCamera(
      scene,
      cameraName,
      eyePosition,
      forwardDirection,
      cameraComponent
    );
  }
  else if (cameraComponent.followMode === "OFFSET")
  {
    result = BuildOffsetFollowCamera(scene, cameraName, eyePosition, cameraComponent);
  }
  else
  {
    result = BuildFollowCamera(scene, cameraName, eyePosition, cameraComponent);
  }

  CopyLens(sourceCamera, result.camera);
  sourceCamera.dispose(); // remove the now-unused faithful FreeCamera

  return result;
}
