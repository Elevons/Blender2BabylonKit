import { UniversalCamera, Vector3, type Scene } from "@babylonjs/core";
import type { CameraComponent } from "../../../core/types";
import { ConfigureFreeCamera, type TypedCameraResult } from "./shared";

/** UNIVERSAL: a free-fly camera at the exported pose, with controls applied. */
export function BuildUniversalCamera(
  scene: Scene,
  cameraName: string,
  eyePosition: Vector3,
  forwardDirection: Vector3,
  cameraComponent: CameraComponent
): TypedCameraResult
{
  const universalCamera = new UniversalCamera(cameraName, eyePosition, scene);
  universalCamera.setTarget(eyePosition.add(forwardDirection.scale(10)));
  ConfigureFreeCamera(universalCamera, cameraComponent);
  return { camera: universalCamera };
}
