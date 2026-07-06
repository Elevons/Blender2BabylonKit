import { FollowCamera, UniversalCamera, Vector3, type Scene } from "@babylonjs/core";
import type { CameraComponent } from "../../../core/types";
import type { CameraTargetBinding, TypedCameraResult } from "./shared";

/** FOLLOW (OFFSET mode): a UniversalCamera the loader drives to keep a fixed world offset. */
export function BuildOffsetFollowCamera(
  scene: Scene,
  cameraName: string,
  eyePosition: Vector3,
  cameraComponent: CameraComponent
): TypedCameraResult
{
  const universalCamera = new UniversalCamera(cameraName, eyePosition, scene);

  const offsetFollow: CameraTargetBinding | undefined = cameraComponent.target !== null
    ? { guid: cameraComponent.target, eye: eyePosition }
    : undefined;

  return { camera: universalCamera, offsetFollow };
}

/** FOLLOW (ORBIT mode): Babylon FollowCamera (offset rotates with the target's yaw). */
export function BuildFollowCamera(
  scene: Scene,
  cameraName: string,
  eyePosition: Vector3,
  cameraComponent: CameraComponent
): TypedCameraResult
{
  const followCamera = new FollowCamera(cameraName, eyePosition, scene);
  followCamera.radius = cameraComponent.distance > 0 ? cameraComponent.distance : 10;
  followCamera.heightOffset = cameraComponent.height;
  followCamera.rotationOffset = cameraComponent.rotationOffset;

  // The pointer input logs a (harmless) multi-axis warning by default.
  const pointerInput = (followCamera.inputs.attached as Record<string, unknown>).pointers as
    | { warningEnable?: boolean }
    | undefined;
  if (pointerInput !== undefined)
  {
    pointerInput.warningEnable = false;
  }

  if (cameraComponent.attachControl)
  {
    followCamera.attachControl(true);
  }

  const followTarget: CameraTargetBinding | undefined = cameraComponent.target !== null
    ? { guid: cameraComponent.target, eye: eyePosition }
    : undefined;

  return { camera: followCamera, followTarget };
}
