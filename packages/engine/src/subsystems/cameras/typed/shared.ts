import { Camera, FreeCamera } from "@babylonjs/core";
import type { Vector3 } from "@babylonjs/core";
import type { CameraComponent } from "../../../core/types";
import { ApplyCameraKeys } from "../keys";

/** A camera-to-target binding deferred until every entity exists. */
export interface CameraTargetBinding
{
  guid: string;
  eye: Vector3;
}

/** What BuildTypedCamera (and its per-type helpers) hand back to the loader. */
export interface TypedCameraResult
{
  camera: Camera;
  followTarget?: CameraTargetBinding;
  offsetFollow?: CameraTargetBinding;
  arcTarget?: CameraTargetBinding;
}

/** Copy lens settings (clip planes, projection mode, FOV) between cameras. */
export function CopyLens(source: Camera, destination: Camera): void
{
  destination.minZ = source.minZ;
  destination.maxZ = source.maxZ;
  destination.mode = source.mode;

  if (source.mode === Camera.PERSPECTIVE_CAMERA)
  {
    destination.fov = source.fov;
    destination.fovMode = source.fovMode;
  }
}

/**
 * Keep a free-look camera level with the horizon. A free camera only stays
 * upright when it rotates in WORLD space: Babylon builds an upright local view
 * but then re-multiplies it by the parent's world matrix, so the glb camera's
 * orientation-correction parent tilts every yaw/pitch. We bake the current
 * world pose, detach from that parent, and pin look-at to world up; a per-frame
 * guard drops any residual roll (e.g. from gamepad/touch input).
 */
export function LockCameraRoll(camera: FreeCamera): void
{
  if (camera.parent !== null)
  {
    const worldPosition = camera.getWorldMatrix().getTranslation();
    const worldForward = camera.getForwardRay().direction.normalize();
    camera.parent = null;
    camera.position.copyFrom(worldPosition);
    camera.rotationQuaternion = null;
    camera.setTarget(worldPosition.add(worldForward));
  }
  else if (camera.rotationQuaternion !== null && camera.rotationQuaternion !== undefined)
  {
    camera.rotationQuaternion.toEulerAnglesToRef(camera.rotation);
    camera.rotationQuaternion = null;
  }

  camera.upVector.set(0, 1, 0);
  camera.onAfterCheckInputsObservable.add(() =>
  {
    camera.rotation.z = 0;
  });
}

/** Apply speed/inertia/keys/attach to a free-fly camera from the component. */
export function ConfigureFreeCamera(camera: FreeCamera, cameraComponent: CameraComponent): void
{
  if (typeof cameraComponent.speed === "number")
  {
    camera.speed = cameraComponent.speed;
  }
  if (typeof cameraComponent.inertia === "number")
  {
    camera.inertia = cameraComponent.inertia;
  }

  ApplyCameraKeys(camera, cameraComponent.keys);

  if (cameraComponent.lockRoll)
  {
    LockCameraRoll(camera);
  }

  if (cameraComponent.attachControl)
  {
    camera.attachControl(true);
  }
}
